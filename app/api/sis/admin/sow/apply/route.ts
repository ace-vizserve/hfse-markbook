import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { SowApplySchema } from '@/lib/schemas/sow';
import { getPublishedVersionById, getMasterById, detectSowChangeImpact } from '@/lib/sis/sow/queries';
import { applyInstanceToSection, type ApplyMode } from '@/lib/sis/sow/mutations';
import { logAction } from '@/lib/audit/log-action';
import type { SowSlotDescriptor } from '@/lib/schemas/grading-sheet';
import type { SowTopic } from '@/lib/schemas/sow';

type SectionRow = {
  id: string;
  level_id: string;
  curriculum_track: string;
};

// POST /api/sis/admin/sow/apply
// Applies a published version to all sections that match its scope
// (term × subject × level × curriculum_track).
//
// 1. Auto-creates any missing grading sheets for the target scopes so the
//    section always has a sheet to receive SOW slot labels.
// 2. Runs impact detection per section: if a section already has grading
//    scores or evaluation ratings, the apply uses the 'partial-rebaseline'
//    merge path (preserves scored slots / rated topics); otherwise it uses
//    the 'clean' hard-reset path.
// 3. Only unlocked grading sheets are mutated (RPCs / merge handle locks).
export async function POST(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = SowApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { published_version_id } = parsed.data;

  const version = await getPublishedVersionById(published_version_id);
  if (!version) {
    return NextResponse.json({ error: 'published version not found' }, { status: 404 });
  }

  const master = await getMasterById(version.master_id);
  if (!master) {
    return NextResponse.json({ error: 'master template not found' }, { status: 500 });
  }

  const service = createServiceClient();

  // Find all sections matching this scope: level + curriculum_track
  const { data: sections } = await service
    .from('sections')
    .select('id, level_id, curriculum_track')
    .eq('level_id', master.level_id)
    .eq('curriculum_track', master.curriculum_track);

  if (!sections || sections.length === 0) {
    return NextResponse.json({
      ok: true,
      sections_targeted: 0,
      sheets_created: 0,
      total_sheets_synced: 0,
      total_checklist_items: 0,
      mode: 'clean' as ApplyMode,
      preserved_slots: 0,
      preserved_topics: 0,
    });
  }

  const sectionRows = sections as SectionRow[];

  // Step 1: Auto-create any missing grading sheets for the target scopes.
  // The RPC is idempotent — it only inserts sheets that don't yet exist.
  const sheetScopes = sectionRows.map((s) => ({
    section_id: s.id,
    subject_id: master.subject_id,
    term_id: master.term_id,
  }));
  const { data: sheetResult } = await service.rpc('create_grading_sheets_for_scopes', {
    p_scopes: sheetScopes,
  });
  const sheetsCreated = (sheetResult as { inserted?: number } | null)?.inserted ?? 0;

  const versionPayload = {
    ww: version.ww as (SowSlotDescriptor | null)[],
    pt: version.pt as (SowSlotDescriptor | null)[],
    topics: version.topics as SowTopic[],
  };

  let totalSheetsSynced = 0;
  let totalChecklistItems = 0;
  let totalPreservedSlots = 0;
  let totalPreservedTopics = 0;
  let anyPartialRebaseline = false;

  const results = await Promise.all(
    sectionRows.map(async (section) => {
      // Step 2: detect whether this section already holds work that must be preserved.
      const impact = await detectSowChangeImpact(
        service,
        section.id,
        master.subject_id,
        master.term_id,
        master.level_id,
        master.curriculum_track,
      );
      const impactMode: ApplyMode =
        impact.hasGradingScores || impact.hasEvaluationResponses ? 'partial-rebaseline' : 'clean';

      // Step 3: apply the published version with the chosen strategy.
      const { data, error } = await applyInstanceToSection(
        section.id,
        master.subject_id,
        master.term_id,
        master.level_id,
        master.curriculum_track,
        published_version_id,
        versionPayload,
        impactMode,
      );
      if (error || !data) return null;
      return data;
    }),
  );

  for (const r of results) {
    if (!r) continue;
    totalSheetsSynced += r.sheets_synced;
    totalChecklistItems += r.checklist_items_upserted;
    totalPreservedSlots += r.preserved_slots;
    totalPreservedTopics += r.preserved_topics;
    if (r.mode === 'partial-rebaseline') anyPartialRebaseline = true;
  }

  const mode: ApplyMode = anyPartialRebaseline ? 'partial-rebaseline' : 'clean';
  const rebaselineReason = anyPartialRebaseline
    ? `One or more sections already had grading scores or evaluation ratings; existing work was preserved (${totalPreservedSlots} slots, ${totalPreservedTopics} topics).`
    : 'No existing scores or ratings — applied as a fresh template.';

  await logAction({
    service,
    actor: auth.user,
    action: 'sow.instance.apply',
    entityType: 'sow_class_instance',
    entityId: published_version_id,
    context: {
      published_version_id,
      version_number: version.version_number,
      master_id: version.master_id,
      curriculum_track: master.curriculum_track,
      sections_targeted: sectionRows.length,
      sheets_created: sheetsCreated,
      total_sheets_synced: totalSheetsSynced,
      total_checklist_items: totalChecklistItems,
      mode,
      preserved_slots: totalPreservedSlots,
      preserved_topics: totalPreservedTopics,
      rebaseline_reason: rebaselineReason,
    },
  });

  // Invalidate readiness and SIS caches so the AY readiness pill reflects the
  // newly applied SOW immediately rather than waiting for the 60s cache TTL.
  const { data: ay } = await service
    .from('academic_years')
    .select('ay_code')
    .eq('id', master.ay_id)
    .single();
  if (ay?.ay_code) {
    revalidateTag(`sis:${ay.ay_code}`, 'max');
  }

  return NextResponse.json({
    ok: true,
    sections_targeted: sectionRows.length,
    sheets_created: sheetsCreated,
    total_sheets_synced: totalSheetsSynced,
    total_checklist_items: totalChecklistItems,
    mode,
    preserved_slots: totalPreservedSlots,
    preserved_topics: totalPreservedTopics,
  });
}

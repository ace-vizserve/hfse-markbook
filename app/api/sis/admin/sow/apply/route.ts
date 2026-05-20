import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { SowApplySchema } from '@/lib/schemas/sow';
import { getPublishedVersionById, getMasterById } from '@/lib/sis/sow/queries';
import { applyInstanceToSection } from '@/lib/sis/sow/mutations';
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
// (term × subject × level × curriculum_track). Only unlocked grading sheets
// are updated (RPC handles the lock check). Locked instances keep their version.
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
      total_sheets_synced: 0,
      total_checklist_items: 0,
    });
  }

  const versionPayload = {
    ww: version.ww as (SowSlotDescriptor | null)[],
    pt: version.pt as (SowSlotDescriptor | null)[],
    topics: version.topics as SowTopic[],
  };

  let totalSheetsSynced = 0;
  let totalChecklistItems = 0;

  const results = await Promise.all(
    (sections as SectionRow[]).map(async (section) => {
      const { data, error } = await applyInstanceToSection(
        section.id,
        master.subject_id,
        master.term_id,
        master.level_id,
        master.curriculum_track,
        published_version_id,
        versionPayload,
      );
      if (error || !data) return null;
      return data;
    }),
  );

  for (const r of results) {
    if (!r) continue;
    totalSheetsSynced += r.sheets_synced;
    totalChecklistItems += r.checklist_items_upserted;
  }

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
      sections_targeted: sections.length,
      total_sheets_synced: totalSheetsSynced,
      total_checklist_items: totalChecklistItems,
    },
  });

  return NextResponse.json({
    ok: true,
    sections_targeted: sections.length,
    total_sheets_synced: totalSheetsSynced,
    total_checklist_items: totalChecklistItems,
  });
}

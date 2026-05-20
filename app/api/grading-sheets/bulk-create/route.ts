import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { logAction } from '@/lib/audit/log-action';
import { invalidateDrillTags } from '@/lib/cache/invalidate-drill-tags';
import { createServiceClient } from '@/lib/supabase/service';
import { getLatestPublished } from '@/lib/sis/sow/queries';
import { createOrUpdateClassInstance } from '@/lib/sis/sow/mutations';
import type { CurriculumTrack } from '@/lib/schemas/sow';

type ServiceClient = ReturnType<typeof createServiceClient>;

type SectionRow = { id: string; level_id: string; curriculum_track: string };
type SheetRow = { section_id: string; subject_id: string; term_id: string };

type ScopeGroup = {
  term_id: string;
  subject_id: string;
  level_id: string;
  curriculum_track: string;
  sectionIds: Set<string>;
};

type SowResult = {
  sow_applied: boolean;
  sow_missing: boolean;
  sow_scopes_applied: number;
  sow_scopes_missing: number;
};

// After grading sheets are created, wire up any published SOW versions for the
// affected sections. Groups by scope (term × subject × level × track) to avoid
// running the sync RPC and checklist upsert more than once per scope when many
// sections share the same level + track.
async function applySowForSheets(
  service: ServiceClient,
  sectionIds: string[],
): Promise<SowResult> {
  const empty: SowResult = {
    sow_applied: false,
    sow_missing: false,
    sow_scopes_applied: 0,
    sow_scopes_missing: 0,
  };
  if (!sectionIds.length) return empty;

  const { data: sections } = await service
    .from('sections')
    .select('id, level_id, curriculum_track')
    .in('id', sectionIds);
  if (!sections?.length) return empty;

  const sectionMap = new Map<string, SectionRow>(
    (sections as SectionRow[]).map(s => [s.id, s]),
  );

  const { data: sheets } = await service
    .from('grading_sheets')
    .select('section_id, subject_id, term_id')
    .in('section_id', sectionIds);
  if (!sheets?.length) return empty;

  // Build scope groups: one entry per (term × subject × level × track).
  const scopeGroups = new Map<string, ScopeGroup>();
  for (const sheet of sheets as SheetRow[]) {
    const sec = sectionMap.get(sheet.section_id);
    if (!sec) continue;
    const key = `${sheet.term_id}:${sheet.subject_id}:${sec.level_id}:${sec.curriculum_track}`;
    if (!scopeGroups.has(key)) {
      scopeGroups.set(key, {
        term_id: sheet.term_id,
        subject_id: sheet.subject_id,
        level_id: sec.level_id,
        curriculum_track: sec.curriculum_track,
        sectionIds: new Set(),
      });
    }
    scopeGroups.get(key)!.sectionIds.add(sheet.section_id);
  }

  // Resolve the latest published SOW version for every unique scope in parallel.
  const scopeVersions = await Promise.all(
    [...scopeGroups.values()].map(async scope => {
      const version = await getLatestPublished(
        scope.term_id,
        scope.subject_id,
        scope.level_id,
        scope.curriculum_track as CurriculumTrack,
      );
      return { scope, version };
    }),
  );

  let scopesApplied = 0;
  let scopesMissing = 0;

  // Apply each scope independently — no shared state between scopes, safe to run in parallel.
  await Promise.all(
    scopeVersions.map(async ({ scope, version }) => {
      if (!version) {
        scopesMissing++;
        return;
      }

      // Bind each section to the published version (one class instance per section × subject × term).
      await Promise.all(
        [...scope.sectionIds].map(sid =>
          createOrUpdateClassInstance(sid, scope.subject_id, scope.term_id, version.id),
        ),
      );

      // Push SOW label+page into all unlocked sheets in this scope.
      // sow_class_instance_id is intentionally NULL here — checklist items are
      // scope-level (shared across sections), so they must not cascade-delete when
      // any individual section's class instance is deleted.
      await service.rpc('sync_grading_sheets_from_sow', {
        p_term_id: scope.term_id,
        p_subject_id: scope.subject_id,
        p_level_id: scope.level_id,
        p_curriculum_track: scope.curriculum_track,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_ww: version.ww as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_pt: version.pt as any,
      });

      // Replace evaluation topics for this scope.
      await service
        .from('evaluation_checklist_items')
        .delete()
        .eq('term_id', scope.term_id)
        .eq('subject_id', scope.subject_id)
        .eq('level_id', scope.level_id)
        .eq('curriculum_track', scope.curriculum_track);

      if (version.topics.length > 0) {
        await service.from('evaluation_checklist_items').insert(
          version.topics.map(t => ({
            term_id: scope.term_id,
            subject_id: scope.subject_id,
            level_id: scope.level_id,
            curriculum_track: scope.curriculum_track,
            item_text: t.text,
            sort_order: t.sort_order,
            // sow_class_instance_id intentionally omitted (NULL)
          })),
        );
      }

      scopesApplied++;
    }),
  );

  return {
    sow_applied: scopesApplied > 0,
    sow_missing: scopesMissing > 0,
    sow_scopes_applied: scopesApplied,
    sow_scopes_missing: scopesMissing,
  };
}

// POST /api/grading-sheets/bulk-create
// Body: either { ay_id: uuid } or { section_id: uuid } (exactly one).
//
// Delegates to the matching RPC from migration 016. Idempotent — safe to
// re-click after manual additions; existing sheets are untouched.
//
// After the RPC, applies any published SOW versions for the affected
// sections: creates class instances, syncs WW/PT slot labels, and generates
// evaluation_checklist_items. Soft gate (KD #28): if no SOW is published for
// a scope the sheet is still created with empty labels (sow_missing: true).
//
// Registrar+ only. No class_type gate / no subject allowlist — bulk create
// creates every sheet the `subject_configs` matrix says should exist.
export async function POST(request: NextRequest) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { ay_id?: string; section_id?: string }
    | null;

  const ayId = body?.ay_id ?? null;
  const sectionId = body?.section_id ?? null;

  const hasAy = typeof ayId === 'string' && ayId.length > 0;
  const hasSection = typeof sectionId === 'string' && sectionId.length > 0;

  if (hasAy === hasSection) {
    return NextResponse.json(
      { error: 'Provide exactly one of ay_id or section_id' },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  const rpcName = hasAy ? 'create_grading_sheets_for_ay' : 'create_grading_sheets_for_section';
  const rpcArgs = hasAy ? { p_ay_id: ayId } : { p_section_id: sectionId };

  const { data, error } = await service.rpc(rpcName, rpcArgs);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const r = (typeof data === 'object' && data ? data : {}) as Record<string, unknown>;
  const inserted = Number(r.inserted ?? 0);
  const repairedUnconfigured = Number(r.repaired_unconfigured_sheets ?? 0);
  const resizedEntries = Number(r.resized_entry_arrays ?? 0);
  const sheetsSeeded = Number(r.sheets_seeded ?? 0);

  // Collect target section IDs for SOW wiring.
  let targetSectionIds: string[] = [];
  if (hasSection) {
    targetSectionIds = [sectionId];
  } else {
    const { data: aySections } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', ayId);
    targetSectionIds = ((aySections ?? []) as { id: string }[]).map(s => s.id);
  }

  const sow = await applySowForSheets(service, targetSectionIds);

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sheet.bulk_create',
    entityType: 'grading_sheet',
    entityId: hasAy ? ayId : sectionId,
    context: {
      scope: hasAy ? 'ay' : 'section',
      ay_id: ayId,
      section_id: sectionId,
      inserted,
      repaired_unconfigured_sheets: repairedUnconfigured,
      resized_entry_arrays: resizedEntries,
      sheets_seeded: sheetsSeeded,
      sow_scopes_applied: sow.sow_scopes_applied,
      sow_scopes_missing: sow.sow_scopes_missing,
    },
  });

  invalidateDrillTags('markbook', await requireCurrentAyCode(service));

  return NextResponse.json({
    ok: true,
    inserted,
    repaired_unconfigured_sheets: repairedUnconfigured,
    resized_entry_arrays: resizedEntries,
    sheets_seeded: sheetsSeeded,
    sow_applied: sow.sow_applied,
    sow_missing: sow.sow_missing,
    sow_scopes_applied: sow.sow_scopes_applied,
    sow_scopes_missing: sow.sow_scopes_missing,
  });
}

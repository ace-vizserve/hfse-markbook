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

type ScopeGroup = {
  term_id: string;
  subject_id: string;
  level_id: string;
  curriculum_track: string;
  sectionIds: Set<string>;
};

type GateResult = {
  inserted: number;
  sow_scopes_applied: number;
  sow_scopes_blocked: number;
  blocked_subjects: string[];
};

// SOW Hard Gate: bulk-create only creates grading sheets for scopes that have
// an approved published SOW version. Scopes without a published SOW are
// blocked — no sheet is created — and surfaced to the registrar so they know
// which subjects still need a SOW published before grading can begin.
//
// Per scope (term × subject × level × curriculum_track):
//   - has a published SOW  → create sheets via the selective RPC, then apply
//     the SOW (class instances + slot labels + evaluation topics)
//   - no published SOW     → blocked; nothing created
async function gateAndActivateScopes(
  service: ServiceClient,
  sectionIds: string[],
  ayId: string,
): Promise<GateResult> {
  const empty: GateResult = {
    inserted: 0,
    sow_scopes_applied: 0,
    sow_scopes_blocked: 0,
    blocked_subjects: [],
  };
  if (!sectionIds.length) return empty;

  // 1. Load sections with level + curriculum_track
  const { data: sections } = await service
    .from('sections')
    .select('id, level_id, curriculum_track')
    .in('id', sectionIds);
  if (!sections?.length) return empty;

  const levelIds = [...new Set(sections.map((s) => (s as { level_id: string }).level_id))];

  // 2. Load subject configs and terms for this AY
  const [{ data: configs }, { data: terms }] = await Promise.all([
    service
      .from('subject_configs')
      .select('subject_id, level_id')
      .eq('academic_year_id', ayId)
      .in('level_id', levelIds),
    service.from('terms').select('id').eq('academic_year_id', ayId),
  ]);

  if (!configs?.length || !terms?.length) return empty;

  // 3. Build scope groups: (term × subject × level × curriculum_track) → Set<section_id>
  const scopeGroups = new Map<string, ScopeGroup>();
  for (const sec of sections as { id: string; level_id: string; curriculum_track: string }[]) {
    const secConfigs = (configs as { subject_id: string; level_id: string }[]).filter(
      (c) => c.level_id === sec.level_id,
    );
    for (const term of terms as { id: string }[]) {
      for (const cfg of secConfigs) {
        const key = `${term.id}:${cfg.subject_id}:${sec.level_id}:${sec.curriculum_track}`;
        if (!scopeGroups.has(key)) {
          scopeGroups.set(key, {
            term_id: term.id,
            subject_id: cfg.subject_id,
            level_id: sec.level_id,
            curriculum_track: sec.curriculum_track,
            sectionIds: new Set(),
          });
        }
        scopeGroups.get(key)!.sectionIds.add(sec.id);
      }
    }
  }

  // 4. Resolve latest published SOW for each unique scope in parallel
  const scopeVersions = await Promise.all(
    [...scopeGroups.values()].map(async (scope) => {
      const version = await getLatestPublished(
        scope.term_id,
        scope.subject_id,
        scope.level_id,
        scope.curriculum_track as CurriculumTrack,
      );
      return { scope, version };
    }),
  );

  // 5. Split allowed (has SOW) vs blocked (no SOW)
  const allowedScopes: { section_id: string; subject_id: string; term_id: string }[] = [];
  const blockedScopeGroups: ScopeGroup[] = [];

  for (const { scope, version } of scopeVersions) {
    if (version) {
      for (const sectionId of scope.sectionIds) {
        allowedScopes.push({
          section_id: sectionId,
          subject_id: scope.subject_id,
          term_id: scope.term_id,
        });
      }
    } else {
      blockedScopeGroups.push(scope);
    }
  }

  // 6. Create sheets for allowed scopes via selective RPC
  let inserted = 0;
  if (allowedScopes.length > 0) {
    const { data: rpcResult } = await service.rpc('create_grading_sheets_for_scopes', {
      p_scopes: allowedScopes,
    });
    inserted = (rpcResult as { inserted?: number } | null)?.inserted ?? 0;
  }

  // 7. Apply SOW (class instances + sync labels + upsert topics) for allowed scopes.
  //    Each scope is independent — no shared state — so it is safe to run in parallel.
  await Promise.all(
    scopeVersions
      .filter(({ version }) => version !== null)
      .map(async ({ scope, version }) => {
        // Bind each section to the published version.
        await Promise.all(
          [...scope.sectionIds].map(async (sid) => {
            const instanceResult = await createOrUpdateClassInstance(
              sid,
              scope.subject_id,
              scope.term_id,
              version!.id,
              false,
            );
            if (instanceResult.error) {
              throw new Error(`createOrUpdateClassInstance failed: ${instanceResult.error}`);
            }
          }),
        );

        // Push SOW label+page into all unlocked sheets in this scope.
        const { error: syncError } = await service.rpc('sync_grading_sheets_from_sow', {
          p_term_id: scope.term_id,
          p_subject_id: scope.subject_id,
          p_level_id: scope.level_id,
          p_curriculum_track: scope.curriculum_track,
          p_ww: version!.ww,
          p_pt: version!.pt,
        });
        if (syncError) throw new Error(`sync_grading_sheets_from_sow failed: ${syncError.message}`);

        // Replace evaluation topics for this scope (clean replace — no scores on
        // newly created sheets). sow_class_instance_id stays NULL because checklist
        // items are scope-level (shared across sections).
        const { error: deleteError } = await service
          .from('evaluation_checklist_items')
          .delete()
          .eq('term_id', scope.term_id)
          .eq('subject_id', scope.subject_id)
          .eq('level_id', scope.level_id)
          .eq('curriculum_track', scope.curriculum_track);
        if (deleteError) throw new Error(`evaluation topic delete failed: ${deleteError.message}`);

        if (version!.topics.length > 0) {
          const { error: insertError } = await service.from('evaluation_checklist_items').insert(
            version!.topics.map((t) => ({
              term_id: scope.term_id,
              subject_id: scope.subject_id,
              level_id: scope.level_id,
              curriculum_track: scope.curriculum_track,
              item_text: t.text,
              sort_order: t.sort_order,
              sow_class_instance_id: null,
            })),
          );
          if (insertError) throw new Error(`evaluation topic insert failed: ${insertError.message}`);
        }
      }),
  );

  // 8. Resolve human-readable labels for blocked scopes
  const blockedSubjectIds = [...new Set(blockedScopeGroups.map((s) => s.subject_id))];
  const blockedTermIds = [...new Set(blockedScopeGroups.map((s) => s.term_id))];

  const [{ data: subjectRows }, { data: termRows }] = await Promise.all([
    service.from('subjects').select('id, name').in('id', blockedSubjectIds),
    service.from('terms').select('id, label').in('id', blockedTermIds),
  ]);

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id, (s as { name: string }).name]));
  const termLabel = new Map((termRows ?? []).map((t) => [t.id, (t as { label: string }).label]));

  const uniqueBlockedLabels = [
    ...new Set(
      blockedScopeGroups.map(
        (s) =>
          `${subjectName.get(s.subject_id) ?? s.subject_id} · ${termLabel.get(s.term_id) ?? s.term_id}`,
      ),
    ),
  ];

  return {
    inserted,
    sow_scopes_applied: scopeVersions.filter(({ version }) => version !== null).length,
    sow_scopes_blocked: blockedScopeGroups.length,
    blocked_subjects: uniqueBlockedLabels,
  };
}

// POST /api/grading-sheets/bulk-create
// Body: either { ay_id: uuid } or { section_id: uuid } (exactly one).
//
// SOW Hard Gate: a grading sheet is only created for a (term × subject ×
// level × curriculum_track) scope that has an approved published SOW version.
// Scopes without a published SOW are blocked — nothing is created — and
// returned in `blocked_subjects` so the registrar can see what still needs a
// SOW published.
//
// For allowed scopes the SOW is applied immediately: class instances are
// created, WW/PT slot labels are synced, and evaluation topics are generated.
//
// Registrar+ only.
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

  // Resolve target sections + ayId
  let targetSectionIds: string[] = [];
  let resolvedAyId: string;

  if (hasAy) {
    resolvedAyId = ayId!;
    const { data: aySections } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', ayId);
    targetSectionIds = ((aySections ?? []) as { id: string }[]).map((s) => s.id);
  } else {
    const { data: sec } = await service
      .from('sections')
      .select('id, academic_year_id')
      .eq('id', sectionId)
      .single();
    if (!sec) return NextResponse.json({ error: 'section not found' }, { status: 404 });
    targetSectionIds = [sectionId!];
    resolvedAyId = (sec as { academic_year_id: string }).academic_year_id;
  }

  let result: GateResult;
  try {
    result = await gateAndActivateScopes(service, targetSectionIds, resolvedAyId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    );
  }

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
      inserted: result.inserted,
      sow_scopes_applied: result.sow_scopes_applied,
      sow_scopes_blocked: result.sow_scopes_blocked,
      blocked_subjects: result.blocked_subjects,
    },
  });

  invalidateDrillTags('markbook', await requireCurrentAyCode(service));

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    sow_scopes_applied: result.sow_scopes_applied,
    sow_scopes_blocked: result.sow_scopes_blocked,
    blocked_subjects: result.blocked_subjects,
  });
}

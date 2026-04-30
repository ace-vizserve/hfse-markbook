import { NextResponse, type NextRequest } from 'next/server';

import { logAction } from '@/lib/audit/log-action';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';

// DELETE /api/sis/admin/subjects/catalog/[id]/configs
//
// Bulk-removes every (subject × level) template config for the given
// subject. Used by the Subjects-tab "Drop from all levels" action when
// a school is fully retiring a subject. The subject row itself stays in
// the catalog (FK integrity to historical grade entries). Existing AYs
// are unaffected — only NEW AYs created after this point will skip the
// subject (template propagation is UPSERT-only per KD #66).
//
// Audit pre-image captures the full list of (level_code, weights) being
// dropped so the action is recoverable if needed.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['superadmin']);
  if ('error' in auth) return auth.error;

  const { id: subjectId } = await params;
  const service = createServiceClient();

  // Pre-fetch subject row + its template configs joined to levels, so the
  // audit captures the human-readable code list and the route can return
  // a useful "nothing to drop" message when the subject has no configs.
  const { data: subjectRow, error: subjErr } = await service
    .from('subjects')
    .select('id, code, name')
    .eq('id', subjectId)
    .maybeSingle();
  if (subjErr) return NextResponse.json({ error: subjErr.message }, { status: 500 });
  if (!subjectRow) return NextResponse.json({ error: 'subject not found' }, { status: 404 });
  const subject = subjectRow as { id: string; code: string; name: string };

  const { data: configs, error: cfgErr } = await service
    .from('template_subject_configs')
    .select(
      'id, level_id, ww_weight, pt_weight, qa_weight, ww_max_slots, pt_max_slots, qa_max, level:levels(code, label)',
    )
    .eq('subject_id', subjectId);
  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  const configList = (configs ?? []) as Array<{
    id: string;
    level_id: string;
    ww_weight: number;
    pt_weight: number;
    qa_weight: number;
    ww_max_slots: number;
    pt_max_slots: number;
    qa_max: number;
    level: { code: string; label: string } | { code: string; label: string }[] | null;
  }>;

  if (configList.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0 });
  }

  const { error: deleteErr } = await service
    .from('template_subject_configs')
    .delete()
    .eq('subject_id', subjectId);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  const droppedConfigs = configList.map((c) => {
    const lvl = Array.isArray(c.level) ? c.level[0] : c.level;
    return {
      level_id: c.level_id,
      level_code: lvl?.code ?? null,
      level_label: lvl?.label ?? null,
      ww_weight: Number(c.ww_weight),
      pt_weight: Number(c.pt_weight),
      qa_weight: Number(c.qa_weight),
      ww_max_slots: c.ww_max_slots,
      pt_max_slots: c.pt_max_slots,
      qa_max: c.qa_max,
    };
  });

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'template.subject_config.bulk_delete',
    entityType: 'subject',
    entityId: subjectId,
    context: {
      subject_id: subject.id,
      subject_code: subject.code,
      subject_name: subject.name,
      droppedConfigs,
      deletedCount: droppedConfigs.length,
    },
  });

  return NextResponse.json({ ok: true, deletedCount: droppedConfigs.length });
}

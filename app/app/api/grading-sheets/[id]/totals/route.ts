import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { computeQuarterly } from '@/lib/compute/quarterly';
import { buildTotalsAuditRows, writeAuditRows } from '@/lib/audit/log-grade-change';

// PATCH /api/grading-sheets/[id]/totals — registrar+ only.
// Updates WW/PT/QA max totals on a sheet. Post-lock requires approval_reference.
// After updating totals, we MUST recompute every entry's percentage scores
// (because the denominator changed) and write audit rows for the totals change.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sheetId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        ww_totals?: number[];
        pt_totals?: number[];
        qa_total?: number | null;
        approval_reference?: string;
      }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const service = createServiceClient();

  const { data: sheet, error: sheetErr } = await service
    .from('grading_sheets')
    .select(
      `id, ww_totals, pt_totals, qa_total, is_locked,
       subject_config:subject_configs(ww_weight, pt_weight, qa_weight, ww_max_slots, pt_max_slots)`,
    )
    .eq('id', sheetId)
    .single();
  if (sheetErr || !sheet) {
    return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
  }
  const config = Array.isArray(sheet.subject_config) ? sheet.subject_config[0] : sheet.subject_config;
  if (!config) {
    return NextResponse.json({ error: 'missing subject_config' }, { status: 500 });
  }

  if (sheet.is_locked) {
    const approval = body.approval_reference?.trim();
    if (!approval) {
      return NextResponse.json(
        { error: 'approval_reference is required for post-lock totals edits' },
        { status: 400 },
      );
    }
  }

  const before = {
    ww_totals: (sheet.ww_totals ?? []) as number[],
    pt_totals: (sheet.pt_totals ?? []) as number[],
    qa_total: (sheet.qa_total ?? null) as number | null,
  };
  const after = {
    ww_totals: body.ww_totals ?? before.ww_totals,
    pt_totals: body.pt_totals ?? before.pt_totals,
    qa_total: 'qa_total' in body ? (body.qa_total ?? null) : before.qa_total,
  };

  if (after.ww_totals.length > config.ww_max_slots) {
    return NextResponse.json(
      { error: `too many WW slots (max ${config.ww_max_slots})` },
      { status: 400 },
    );
  }
  if (after.pt_totals.length > config.pt_max_slots) {
    return NextResponse.json(
      { error: `too many PT slots (max ${config.pt_max_slots})` },
      { status: 400 },
    );
  }
  if (after.ww_totals.some(v => typeof v !== 'number' || v <= 0)) {
    return NextResponse.json({ error: 'ww_totals must be positive numbers' }, { status: 400 });
  }
  if (after.pt_totals.some(v => typeof v !== 'number' || v <= 0)) {
    return NextResponse.json({ error: 'pt_totals must be positive numbers' }, { status: 400 });
  }

  // Apply totals update.
  const { error: upErr } = await service
    .from('grading_sheets')
    .update({
      ww_totals: after.ww_totals,
      pt_totals: after.pt_totals,
      qa_total: after.qa_total,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sheetId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Recompute every entry's PS / initial / quarterly against the new totals.
  const { data: entries, error: entErr } = await service
    .from('grade_entries')
    .select('id, ww_scores, pt_scores, qa_score')
    .eq('grading_sheet_id', sheetId);
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 });

  const pad = (arr: (number | null)[] | null, length: number) => {
    const out: (number | null)[] = new Array(length).fill(null);
    for (let i = 0; i < Math.min((arr ?? []).length, length); i++) out[i] = (arr ?? [])[i] ?? null;
    return out;
  };
  for (const e of entries ?? []) {
    const ww = pad(e.ww_scores as (number | null)[] | null, after.ww_totals.length);
    const pt = pad(e.pt_scores as (number | null)[] | null, after.pt_totals.length);
    const computed = computeQuarterly({
      ww_scores: ww,
      ww_totals: after.ww_totals,
      pt_scores: pt,
      pt_totals: after.pt_totals,
      qa_score: e.qa_score as number | null,
      qa_total: after.qa_total,
      ww_weight: Number(config.ww_weight),
      pt_weight: Number(config.pt_weight),
      qa_weight: Number(config.qa_weight),
    });
    const { error } = await service
      .from('grade_entries')
      .update({
        ww_scores: ww,
        pt_scores: pt,
        ww_ps: computed.ww_ps,
        pt_ps: computed.pt_ps,
        qa_ps: computed.qa_ps,
        initial_grade: computed.initial_grade,
        quarterly_grade: computed.quarterly_grade,
        updated_at: new Date().toISOString(),
      })
      .eq('id', e.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit-log the totals change (post-lock only).
  if (sheet.is_locked) {
    const approval_reference = body.approval_reference!.trim();
    const changed_by = auth.user.email ?? auth.user.id;
    // Totals aren't scoped to a single grade_entry — reuse the first entry's id
    // as the FK (required NOT NULL) and scope via field_changed string.
    const anchor = (entries ?? [])[0]?.id;
    if (anchor) {
      await writeAuditRows(
        service,
        buildTotalsAuditRows(before, after, {
          grading_sheet_id: sheetId,
          grade_entry_id: anchor,
          changed_by,
          approval_reference,
        }),
      );
    }
  }

  return NextResponse.json({ ok: true, totals: after });
}

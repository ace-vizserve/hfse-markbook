import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { getUserRole } from '@/lib/auth/roles';
import { createServiceClient } from '@/lib/supabase/service';
import { computeQuarterly } from '@/lib/compute/quarterly';
import { buildAuditRows, writeAuditRows } from '@/lib/audit/log-grade-change';

// PATCH /api/grading-sheets/[id]/entries/[entryId]
// Rules (Sprint 4):
//   * Teachers: allowed only while the sheet is UNLOCKED. Post-lock → 403.
//   * Registrar/admin/superadmin: allowed always, but post-lock edits must
//     include a non-empty `approval_reference` in the body, and every changed
//     field is written to grade_audit_log (append-only).
//   * Score validation vs max and server-side compute are unchanged from S3.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;
  const role = getUserRole(auth.user);

  const { id: sheetId, entryId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        ww_scores?: (number | null)[];
        pt_scores?: (number | null)[];
        qa_score?: number | null;
        letter_grade?: string | null;
        is_na?: boolean;
        approval_reference?: string;
      }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const service = createServiceClient();

  const [sheetRes, entryRes] = await Promise.all([
    service
      .from('grading_sheets')
      .select(
        `id, ww_totals, pt_totals, qa_total, is_locked,
         subject:subjects(is_examinable),
         subject_config:subject_configs(ww_weight, pt_weight, qa_weight)`,
      )
      .eq('id', sheetId)
      .single(),
    service
      .from('grade_entries')
      .select('id, grading_sheet_id, ww_scores, pt_scores, qa_score, letter_grade, is_na')
      .eq('id', entryId)
      .single(),
  ]);

  if (sheetRes.error || !sheetRes.data) {
    return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
  }
  if (entryRes.error || !entryRes.data) {
    return NextResponse.json({ error: 'entry not found' }, { status: 404 });
  }
  const sheet = sheetRes.data as unknown as {
    id: string;
    ww_totals: number[];
    pt_totals: number[];
    qa_total: number | null;
    is_locked: boolean;
    subject: { is_examinable: boolean } | { is_examinable: boolean }[] | null;
    subject_config:
      | { ww_weight: number; pt_weight: number; qa_weight: number }
      | { ww_weight: number; pt_weight: number; qa_weight: number }[]
      | null;
  };
  const entry = entryRes.data;
  if (entry.grading_sheet_id !== sheetId) {
    return NextResponse.json({ error: 'entry does not belong to sheet' }, { status: 400 });
  }

  // ----- Lock-gate -----
  if (sheet.is_locked) {
    if (role === 'teacher') {
      return NextResponse.json({ error: 'sheet is locked' }, { status: 403 });
    }
    const approval = body.approval_reference?.trim();
    if (!approval) {
      return NextResponse.json(
        { error: 'approval_reference is required for post-lock edits' },
        { status: 400 },
      );
    }
  }
  const approval_reference = body.approval_reference?.trim() ?? '';
  const changed_by = auth.user.email ?? auth.user.id;

  const subject = Array.isArray(sheet.subject) ? sheet.subject[0] : sheet.subject;
  const config = Array.isArray(sheet.subject_config) ? sheet.subject_config[0] : sheet.subject_config;

  // ----- Non-examinable: letter grade only -----
  if (subject && !subject.is_examinable) {
    const letter = body.letter_grade ?? null;
    if (letter != null && !['A', 'B', 'C', 'IP', 'UG', 'NA', 'INC', 'CO', 'E'].includes(letter)) {
      return NextResponse.json({ error: `invalid letter_grade "${letter}"` }, { status: 400 });
    }
    const { data: updated, error } = await service
      .from('grade_entries')
      .update({ letter_grade: letter, updated_at: new Date().toISOString() })
      .eq('id', entryId)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (sheet.is_locked) {
      await writeAuditRows(
        service,
        buildAuditRows(
          { letter_grade: entry.letter_grade as string | null },
          { letter_grade: letter },
          { grading_sheet_id: sheetId, grade_entry_id: entryId, changed_by, approval_reference },
        ),
      );
    }
    return NextResponse.json({ entry: updated });
  }

  if (!config) {
    return NextResponse.json({ error: 'missing subject_config on sheet' }, { status: 500 });
  }

  // ----- Examinable: merge + validate vs max -----
  const merged = {
    ww_scores: body.ww_scores ?? (entry.ww_scores as (number | null)[]) ?? [],
    pt_scores: body.pt_scores ?? (entry.pt_scores as (number | null)[]) ?? [],
    qa_score:
      'qa_score' in body
        ? (body.qa_score ?? null)
        : (entry.qa_score as number | null | undefined) ?? null,
  };

  const normalizeArr = (arr: (number | null)[], length: number) => {
    const out: (number | null)[] = new Array(length).fill(null);
    for (let i = 0; i < Math.min(arr.length, length); i++) out[i] = arr[i] ?? null;
    return out;
  };
  const ww_scores = normalizeArr(merged.ww_scores, sheet.ww_totals.length);
  const pt_scores = normalizeArr(merged.pt_scores, sheet.pt_totals.length);
  const qa_score = merged.qa_score;

  for (let i = 0; i < ww_scores.length; i++) {
    const v = ww_scores[i];
    if (v != null && (v < 0 || v > sheet.ww_totals[i])) {
      return NextResponse.json(
        { error: `W${i + 1} score ${v} out of range [0, ${sheet.ww_totals[i]}]` },
        { status: 400 },
      );
    }
  }
  for (let i = 0; i < pt_scores.length; i++) {
    const v = pt_scores[i];
    if (v != null && (v < 0 || v > sheet.pt_totals[i])) {
      return NextResponse.json(
        { error: `PT${i + 1} score ${v} out of range [0, ${sheet.pt_totals[i]}]` },
        { status: 400 },
      );
    }
  }
  if (qa_score != null && sheet.qa_total != null) {
    if (qa_score < 0 || qa_score > sheet.qa_total) {
      return NextResponse.json(
        { error: `QA score ${qa_score} out of range [0, ${sheet.qa_total}]` },
        { status: 400 },
      );
    }
  }

  const is_na = 'is_na' in body ? Boolean(body.is_na) : Boolean(entry.is_na);

  const computed = computeQuarterly({
    ww_scores,
    ww_totals: sheet.ww_totals,
    pt_scores,
    pt_totals: sheet.pt_totals,
    qa_score,
    qa_total: sheet.qa_total,
    ww_weight: Number(config.ww_weight),
    pt_weight: Number(config.pt_weight),
    qa_weight: Number(config.qa_weight),
  });

  const { data: updated, error } = await service
    .from('grade_entries')
    .update({
      ww_scores,
      pt_scores,
      qa_score,
      is_na,
      ww_ps: computed.ww_ps,
      pt_ps: computed.pt_ps,
      qa_ps: computed.qa_ps,
      initial_grade: computed.initial_grade,
      quarterly_grade: computed.quarterly_grade,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit-log every changed field (post-lock only).
  if (sheet.is_locked) {
    await writeAuditRows(
      service,
      buildAuditRows(
        {
          ww_scores: entry.ww_scores as (number | null)[] | null,
          pt_scores: entry.pt_scores as (number | null)[] | null,
          qa_score: entry.qa_score as number | null,
          is_na: entry.is_na as boolean,
        },
        { ww_scores, pt_scores, qa_score, is_na },
        { grading_sheet_id: sheetId, grade_entry_id: entryId, changed_by, approval_reference },
      ),
    );
  }

  return NextResponse.json({ entry: updated, computed });
}

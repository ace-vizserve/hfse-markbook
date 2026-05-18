import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction } from '@/lib/audit/log-action';
import { invalidateDrillTags } from '@/lib/cache/invalidate-drill-tags';
import { requireCurrentAyCode } from '@/lib/academic-year';

// PATCH /api/grading-sheets/[id]/entries/[entryId]/annual-letter
// Registrar-only: sets the freeform annual_letter_grade on a non-examinable
// subject's T4 grade_entry row. Hard Rule #5 does not apply — this is
// registrar metadata, not a per-term grade; no approval_reference required.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sheetId, entryId } = await params;

  const body = (await request.json().catch(() => null)) as {
    annual_letter_grade: string | null;
  } | null;
  if (!body || !('annual_letter_grade' in body)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const newValue =
    typeof body.annual_letter_grade === 'string' && body.annual_letter_grade.trim() !== ''
      ? body.annual_letter_grade.trim()
      : null;

  const service = createServiceClient();

  const [sheetRes, entryRes] = await Promise.all([
    service
      .from('grading_sheets')
      .select('id, subject:subjects(is_examinable), section:sections(academic_year_id)')
      .eq('id', sheetId)
      .single(),
    service
      .from('grade_entries')
      .select('id, grading_sheet_id, annual_letter_grade')
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
    subject: { is_examinable: boolean } | { is_examinable: boolean }[] | null;
    section: { academic_year_id: string } | { academic_year_id: string }[] | null;
  };
  const entry = entryRes.data;

  if (entry.grading_sheet_id !== sheetId) {
    return NextResponse.json({ error: 'entry does not belong to sheet' }, { status: 400 });
  }

  const subjectData = Array.isArray(sheet.subject) ? sheet.subject[0] : sheet.subject;
  if (!subjectData) {
    return NextResponse.json({ error: 'subject not found on sheet' }, { status: 404 });
  }
  if (subjectData.is_examinable) {
    return NextResponse.json(
      { error: 'annual_letter_grade is only applicable to non-examinable subjects' },
      { status: 422 },
    );
  }

  const { error: updateError } = await service
    .from('grade_entries')
    .update({ annual_letter_grade: newValue })
    .eq('id', entryId);

  if (updateError) {
    return NextResponse.json({ error: 'update failed', detail: updateError.message }, { status: 500 });
  }

  // Resolve AY code for cache invalidation.
  const sectionData = Array.isArray(sheet.section) ? sheet.section[0] : sheet.section;
  let ayCode: string | null = null;
  if (sectionData?.academic_year_id) {
    const { data: ayRow } = await service
      .from('academic_years')
      .select('ay_code')
      .eq('id', sectionData.academic_year_id)
      .single();
    ayCode = ayRow?.ay_code ?? null;
  }
  if (!ayCode) {
    ayCode = await requireCurrentAyCode();
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'grade_entry.annual_letter.update',
    entityType: 'grade_entry',
    entityId: entryId,
    context: {
      grading_sheet_id: sheetId,
      grade_entry_id: entryId,
      before: entry.annual_letter_grade,
      after: newValue,
    },
  });

  invalidateDrillTags('markbook', ayCode);

  return NextResponse.json({ ok: true });
}

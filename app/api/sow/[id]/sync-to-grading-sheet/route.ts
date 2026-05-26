import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { syncSowLabelsToSheet } from '@/lib/markbook/sow';

// POST /api/sow/[id]/sync-to-grading-sheet
// Pushes this SOW's WW/PT labels into the matching grading sheet for the
// section. Uses mergeGradingSheetSlots (preserves scored cells). Returns 423
// if the sheet is locked. Auth: teacher assigned to section, or registrar+.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sowId } = await params;
  const service = createServiceClient();

  // Fetch the SOW instance to resolve section + subject + term.
  const { data: sow } = await service
    .from('sow_class_instances')
    .select('id, section_id, subject_id, term_id, ww_labels, pt_labels')
    .eq('id', sowId)
    .maybeSingle();

  if (!sow) return NextResponse.json({ error: 'SOW not found' }, { status: 404 });

  const { section_id, subject_id, term_id } = sow as {
    section_id: string;
    subject_id: string;
    term_id: string;
  };

  // Auth gate: teacher must be the subject_teacher for this section × subject.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', section_id)
      .eq('subject_id', subject_id)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Find the matching grading sheet.
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('id, is_locked')
    .eq('section_id', section_id)
    .eq('subject_id', subject_id)
    .eq('term_id', term_id)
    .maybeSingle();

  if (!sheet) {
    return NextResponse.json({ error: 'No grading sheet found for this section × subject × term.' }, { status: 404 });
  }
  if ((sheet as { is_locked: boolean }).is_locked) {
    return NextResponse.json({ error: 'sheet_locked' }, { status: 423 });
  }

  const result = await syncSowLabelsToSheet(sowId, (sheet as { id: string }).id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Resolve metadata for audit log.
  const [{ data: sec }, { data: subj }, { data: term }] = await Promise.all([
    service.from('sections').select('name').eq('id', section_id).maybeSingle(),
    service.from('subjects').select('name').eq('id', subject_id).maybeSingle(),
    service.from('terms').select('label').eq('id', term_id).maybeSingle(),
  ]);

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sow.labels.synced',
    entityType: 'sow_class_instance',
    entityId: sowId,
    context: {
      sowInstanceId: sowId,
      sheetId: (sheet as { id: string }).id,
      sectionName: (sec as { name: string } | null)?.name ?? section_id,
      subjectName: (subj as { name: string } | null)?.name ?? subject_id,
      termLabel: (term as { label: string } | null)?.label ?? term_id,
      wwLabelsWritten: result.wwWritten,
      ptLabelsWritten: result.ptWritten,
    },
  });

  return NextResponse.json({ ok: true, preserved: result.preserved, ww_written: result.wwWritten, pt_written: result.ptWritten });
}

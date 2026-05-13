import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { ChecklistItemCopySchema } from '@/lib/schemas/evaluation-checklist';

// POST /api/evaluation/checklist-items/copy-from — clone every topic from
// a source section into the target section (same subject + term). The
// teacher gate verifies the caller is the subject_teacher of the target
// (source is read-only — we trust their pick from getSectionsTeacherCanCopyFrom).
//
// Idempotent: the unique constraint on (term × subject × section × item_text)
// (migration 047) lets us `onConflict … ignoreDuplicates`, so re-running
// the copy after the teacher has already added a few topics manually is
// safe — duplicates are silently skipped.
export async function POST(request: NextRequest) {
  const auth = await requireRole([
    'teacher',
    'registrar',
    'school_admin',
    'superadmin',
  ]);
  if ('error' in auth) return auth.error;

  const raw = await request.json().catch(() => null);
  const parsed = ChecklistItemCopySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { sourceSection, targetSection, termId, subjectId } = parsed.data;

  if (sourceSection === targetSection) {
    return NextResponse.json(
      { error: 'Source and target sections must differ.' },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Teacher gate: must be the subject_teacher for the TARGET section. The
  // source's protection is its uniqueness in the picker (the loader only
  // surfaces sections the teacher already teaches).
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', targetSection)
      .eq('subject_id', subjectId)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json(
        { error: 'You are not the subject teacher for the target section.' },
        { status: 403 },
      );
    }
  }

  const { data: sourceItems, error: sourceErr } = await service
    .from('evaluation_checklist_items')
    .select('item_text, sort_order')
    .eq('term_id', termId)
    .eq('subject_id', subjectId)
    .eq('section_id', sourceSection)
    .order('sort_order', { ascending: true });

  if (sourceErr) {
    return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  }
  if (!sourceItems || sourceItems.length === 0) {
    return NextResponse.json({ ok: true, copied: 0 });
  }

  const rowsToInsert = sourceItems.map((r) => ({
    term_id: termId,
    subject_id: subjectId,
    section_id: targetSection,
    item_text: r.item_text,
    sort_order: r.sort_order,
    created_by: auth.user.id,
  }));

  const { data: inserted, error: insertErr } = await service
    .from('evaluation_checklist_items')
    .upsert(rowsToInsert, {
      onConflict: 'term_id,subject_id,section_id,item_text',
      ignoreDuplicates: true,
    })
    .select('id');

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const copied = inserted?.length ?? 0;

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'evaluation.checklist_item.copy_from',
    entityType: 'evaluation_checklist_item',
    entityId: targetSection,
    context: {
      source_section_id: sourceSection,
      target_section_id: targetSection,
      term_id: termId,
      subject_id: subjectId,
      count: copied,
    },
  });

  return NextResponse.json({ ok: true, copied });
}

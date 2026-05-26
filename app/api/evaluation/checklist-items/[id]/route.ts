import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';

const PatchSchema = z.object({
  item_text: z.string().min(1).max(500).optional(),
  sort_order: z.number().int().min(0).optional(),
});

// PATCH /api/evaluation/checklist-items/[id]
// Updates an item's text or sort order.
// Auth: subject teacher assigned to item's section+subject, or registrar+.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  if (!parsed.data.item_text && parsed.data.sort_order === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch the item first to check ownership + get before-state.
  const { data: existing } = await service
    .from('evaluation_checklist_items')
    .select('id, item_text, sort_order, section_id, subject_id, term_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Auth gate: teacher must be a subject_teacher for this section+subject.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', (existing as { section_id: string }).section_id)
      .eq('subject_id', (existing as { subject_id: string }).subject_id)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const patch = parsed.data;
  const { error } = await service
    .from('evaluation_checklist_items')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const textChanged = patch.item_text !== undefined;
  const orderChanged = patch.sort_order !== undefined;
  const action = orderChanged && !textChanged ? 'evaluation.checklist_item.reorder' : 'evaluation.checklist_item.update';

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action,
    entityType: 'evaluation_checklist_item',
    entityId: id,
    context: {
      itemId: id,
      before: {
        ...(textChanged && { itemText: (existing as { item_text: string }).item_text }),
        ...(orderChanged && { sort_order: (existing as { sort_order: number }).sort_order }),
      },
      after: {
        ...(textChanged && { itemText: patch.item_text }),
        ...(orderChanged && { sort_order: patch.sort_order }),
      },
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/evaluation/checklist-items/[id]
// Auth: subject teacher assigned to item's section+subject, or registrar+.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const service = createServiceClient();

  const { data: existing } = await service
    .from('evaluation_checklist_items')
    .select('id, item_text, section_id, subject_id, term_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', (existing as { section_id: string }).section_id)
      .eq('subject_id', (existing as { subject_id: string }).subject_id)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await service.from('evaluation_checklist_items').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'evaluation.checklist_item.delete',
    entityType: 'evaluation_checklist_item',
    entityId: id,
    context: {
      itemId: id,
      itemText: (existing as { item_text: string }).item_text,
      sectionId: (existing as { section_id: string }).section_id,
      subjectId: (existing as { subject_id: string }).subject_id,
      termId: (existing as { term_id: string }).term_id,
    },
  });

  return NextResponse.json({ ok: true });
}

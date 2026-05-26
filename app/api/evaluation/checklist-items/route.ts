import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';

const CreateSchema = z.object({
  term_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  section_id: z.string().uuid(),
  item_text: z.string().min(1).max(500),
  sort_order: z.number().int().min(0),
});

// POST /api/evaluation/checklist-items
// Creates a checklist item for a (term × subject × section).
// Auth: subject teacher assigned to section+subject, or registrar+.
export async function POST(request: NextRequest) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { term_id, subject_id, section_id, item_text, sort_order } = parsed.data;
  const service = createServiceClient();

  // Auth gate: teacher must be a subject_teacher for this section+subject.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', section_id)
      .eq('subject_id', subject_id)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: item, error } = await service
    .from('evaluation_checklist_items')
    .insert({
      term_id,
      subject_id,
      section_id,
      item_text,
      sort_order,
      created_by: auth.user.id,
    })
    .select('id, term_id, subject_id, section_id, item_text, sort_order')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A topic with this text already exists for this subject.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'evaluation.checklist_item.create',
    entityType: 'evaluation_checklist_item',
    entityId: item.id,
    context: {
      itemId: item.id,
      itemText: item.item_text,
      sectionId: section_id,
      subjectId: subject_id,
      termId: term_id,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

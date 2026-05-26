import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import type { SowLabel, SowTopic } from '@/lib/sis/sow/queries';

const MAX_SLOTS = 5;
const MAX_TOPICS = 50;

const SowLabelSchema = z.object({
  label: z.string().max(200),
  page: z.string().max(20).nullable(),
});

const SowTopicSchema = z.object({
  text: z.string().min(1).max(500),
  sort_order: z.number().int().min(0),
});

const UpsertSchema = z.object({
  section_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  term_id: z.string().uuid(),
  ww_labels: z.array(SowLabelSchema).max(MAX_SLOTS),
  pt_labels: z.array(SowLabelSchema).max(MAX_SLOTS),
  topics: z.array(SowTopicSchema).max(MAX_TOPICS),
});

// GET /api/sow?sectionId=&subjectId=&termId=
// Returns the teacher's SOW instance for a (section × subject × term), or null.
export async function GET(request: NextRequest) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sectionId = searchParams.get('sectionId');
  const subjectId = searchParams.get('subjectId');
  const termId = searchParams.get('termId');

  if (!sectionId || !subjectId || !termId) {
    return NextResponse.json({ error: 'sectionId, subjectId, and termId are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data } = await service
    .from('sow_class_instances')
    .select('id, section_id, subject_id, term_id, ww_labels, pt_labels, topics, copied_from_section_id, copied_at, created_by, updated_by, created_at, updated_at')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

// PUT /api/sow
// Upserts a SOW instance for a (section × subject × term).
// Auth: teacher assigned to section+subject, or registrar+.
export async function PUT(request: NextRequest) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { section_id, subject_id, term_id, ww_labels, pt_labels, topics } = parsed.data;
  const service = createServiceClient();

  // Auth gate: teacher must be assigned to this section+subject.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', section_id)
      .eq('subject_id', subject_id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve human-readable context for the audit log.
  const [{ data: sec }, { data: subj }, { data: term }] = await Promise.all([
    service.from('sections').select('name').eq('id', section_id).maybeSingle(),
    service.from('subjects').select('name').eq('id', subject_id).maybeSingle(),
    service.from('terms').select('label').eq('id', term_id).maybeSingle(),
  ]);

  const { data: instance, error } = await service
    .from('sow_class_instances')
    .upsert(
      {
        section_id,
        subject_id,
        term_id,
        ww_labels: ww_labels as SowLabel[],
        pt_labels: pt_labels as SowLabel[],
        topics: topics as SowTopic[],
        updated_by: auth.user.id,
      },
      { onConflict: 'section_id,subject_id,term_id' },
    )
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Stamp created_by on insert (upsert doesn't overwrite it if already set).
  await service
    .from('sow_class_instances')
    .update({ created_by: auth.user.id })
    .eq('id', instance.id)
    .is('created_by', null);

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sow.instance.save',
    entityType: 'sow_class_instance',
    entityId: instance.id,
    context: {
      sowInstanceId: instance.id,
      sectionId: section_id,
      sectionName: (sec as { name: string } | null)?.name ?? section_id,
      subjectId: subject_id,
      subjectName: (subj as { name: string } | null)?.name ?? subject_id,
      termId: term_id,
      termLabel: (term as { label: string } | null)?.label ?? term_id,
      wwLabelCount: ww_labels.length,
      ptLabelCount: pt_labels.length,
      topicCount: topics.length,
    },
  });

  return NextResponse.json({ id: instance.id });
}

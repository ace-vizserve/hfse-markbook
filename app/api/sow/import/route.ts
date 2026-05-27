import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import type { SowLabel, SowTopic } from '@/lib/sis/sow/queries';

const ImportSchema = z.object({
  target_section_id: z.string().uuid(),
  source_section_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  term_id: z.string().uuid(),
});

// POST /api/sow/import
// Copies ww_labels + pt_labels + topics from a peer section's SOW into the
// target section's SOW, stamping provenance (copied_from_section_id + copied_at).
// Both sections must share the same (level_id × subject). Teacher must be
// assigned to the target section. Registrar+ may import unconditionally.
export async function POST(request: NextRequest) {
  const auth = await requireRole([
    'teacher',
    'registrar',
    'school_admin',
    'superadmin',
  ]);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { target_section_id, source_section_id, subject_id, term_id } =
    parsed.data;
  const service = createServiceClient();

  // Auth gate: teacher must be the subject_teacher for the target section × subject.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', target_section_id)
      .eq('subject_id', subject_id)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate: target and source must share the same level.
  const [{ data: targetSec }, { data: sourceSec }] = await Promise.all([
    service
      .from('sections')
      .select('level_id, name')
      .eq('id', target_section_id)
      .maybeSingle(),
    service
      .from('sections')
      .select('level_id, name')
      .eq('id', source_section_id)
      .maybeSingle(),
  ]);
  if (!targetSec || !sourceSec) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }
  if (
    (targetSec as { level_id: string }).level_id !==
    (sourceSec as { level_id: string }).level_id
  ) {
    return NextResponse.json(
      { error: 'Can only import from sections at the same level.' },
      { status: 422 }
    );
  }

  // Fetch the source SOW.
  const { data: sourceSow } = await service
    .from('sow_class_instances')
    .select('id, ww_labels, pt_labels, topics')
    .eq('section_id', source_section_id)
    .eq('subject_id', subject_id)
    .eq('term_id', term_id)
    .maybeSingle();

  if (!sourceSow) {
    return NextResponse.json(
      { error: 'No SOW found for the source section × subject × term.' },
      { status: 404 }
    );
  }

  const sow = sourceSow as {
    id: string;
    ww_labels: SowLabel[];
    pt_labels: SowLabel[];
    topics: SowTopic[];
  };

  const now = new Date().toISOString();

  const { data: instance, error } = await service
    .from('sow_class_instances')
    .upsert(
      {
        section_id: target_section_id,
        subject_id,
        term_id,
        ww_labels: sow.ww_labels,
        pt_labels: sow.pt_labels,
        topics: sow.topics,
        copied_from_section_id: source_section_id,
        copied_at: now,
        updated_by: auth.user.id,
      },
      { onConflict: 'section_id,subject_id,term_id' }
    )
    .select('id')
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Stamp created_by on insert (upsert doesn't overwrite if already set).
  await service
    .from('sow_class_instances')
    .update({ created_by: auth.user.id })
    .eq('id', instance.id)
    .is('created_by', null);

  // Resolve metadata for audit log.
  const [{ data: subj }, { data: term }] = await Promise.all([
    service.from('subjects').select('name').eq('id', subject_id).maybeSingle(),
    service.from('terms').select('label').eq('id', term_id).maybeSingle(),
  ]);

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sow.instance.import_from',
    entityType: 'sow_class_instance',
    entityId: instance.id,
    context: {
      sowInstanceId: instance.id,
      sectionId: target_section_id,
      sectionName: (targetSec as { name: string }).name,
      subjectId: subject_id,
      subjectName: (subj as { name: string } | null)?.name ?? subject_id,
      termId: term_id,
      termLabel: (term as { label: string } | null)?.label ?? term_id,
      copiedFromSectionId: source_section_id,
      copiedFromSectionName: (sourceSec as { name: string }).name,
      wwLabelsCopied: sow.ww_labels.length,
      ptLabelsCopied: sow.pt_labels.length,
      topicsCopied: sow.topics.length,
    },
  });

  return NextResponse.json({
    id: instance.id,
    ww_labels: sow.ww_labels,
    pt_labels: sow.pt_labels,
    topics: sow.topics,
  });
}

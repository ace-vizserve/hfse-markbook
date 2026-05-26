import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { syncSowTopicsToChecklist } from '@/lib/markbook/sow';

// POST /api/sow/[id]/sync-to-eval
// Seeds evaluation_checklist_items from this SOW's topics for the section.
// Uses mergeEvaluationTopics (preserves items that already have ratings).
// Auth: teacher assigned to section, or registrar+.
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
    .select('id, section_id, subject_id, term_id, topics')
    .eq('id', sowId)
    .maybeSingle();

  if (!sow) return NextResponse.json({ error: 'SOW not found' }, { status: 404 });

  const { section_id, subject_id, term_id } = sow as {
    section_id: string;
    subject_id: string;
    term_id: string;
  };

  // Auth gate: teacher must be assigned to this section.
  if (auth.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', section_id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await syncSowTopicsToChecklist(sowId, term_id, subject_id, section_id);
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
    action: 'sow.topics.synced',
    entityType: 'sow_class_instance',
    entityId: sowId,
    context: {
      sowInstanceId: sowId,
      sectionId: section_id,
      sectionName: (sec as { name: string } | null)?.name ?? section_id,
      subjectName: (subj as { name: string } | null)?.name ?? subject_id,
      termLabel: (term as { label: string } | null)?.label ?? term_id,
      topicsWritten: result.inserted,
    },
  });

  return NextResponse.json({ ok: true, preserved: result.preserved, inserted: result.inserted });
}

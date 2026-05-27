import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

// Server-only reads for Evaluation Phase 2 (checklists, subject comments,
// PTC feedback). Writes go through the API routes under /api/evaluation/*.

export type ChecklistItemRow = {
  id: string;
  term_id: string;
  subject_id: string;
  // Scope is per-section (teacher-owned, KD #110). section_id added in migration 061.
  section_id: string;
  sow_instance_id: string | null;
  item_text: string;
  sort_order: number;
};

export type ChecklistResponseRow = {
  id: string;
  term_id: string;
  student_id: string;
  section_id: string;
  checklist_item_id: string;
  rating: number | null;
};

export type SubjectCommentRow = {
  id: string;
  term_id: string;
  student_id: string;
  section_id: string;
  subject_id: string;
  comment: string | null;
};

export type PtcFeedbackRow = {
  id: string;
  term_id: string;
  student_id: string;
  section_id: string;
  feedback: string | null;
};

// List checklist items for one (term × subject × section).
// Scope is teacher-owned per-section (KD #110, migration 061).
export async function listChecklistItems(
  termId: string,
  subjectId: string,
  sectionId: string
): Promise<ChecklistItemRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_checklist_items')
    .select(
      'id, term_id, subject_id, section_id, sow_instance_id, item_text, sort_order'
    )
    .eq('term_id', termId)
    .eq('subject_id', subjectId)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[evaluation] listChecklistItems failed:', error.message);
    return [];
  }
  return (data ?? []) as ChecklistItemRow[];
}

// Returns peer sections the teacher could import SOW topics from (same level × subject × term).
// Implemented via the lib/sis/sow/queries helper; this re-export keeps the call site stable.
export async function getSectionsTeacherCanCopyFrom(
  _userId: string,
  termId: string,
  subjectId: string,
  currentSectionId: string
): Promise<
  Array<{ section_id: string; section_name: string; item_count: number }>
> {
  const { listImportableSowSources } = await import('@/lib/sis/sow/queries');
  const sources = await listImportableSowSources(
    currentSectionId,
    subjectId,
    termId
  );
  return sources.map((s) => ({
    section_id: s.section_id,
    section_name: s.section_name,
    item_count: s.topic_count,
  }));
}

// Decorates each checklist item with the creator's display name (or
// email fallback). Used by admin audit surfaces.
export async function listChecklistItemsWithCreator(
  termId: string,
  subjectId: string,
  sectionId: string
): Promise<
  Array<
    ChecklistItemRow & {
      creator_name: string | null;
      created_at: string | null;
    }
  >
> {
  const service = createServiceClient();
  const { data } = await service
    .from('evaluation_checklist_items')
    .select(
      'id, term_id, subject_id, section_id, sow_instance_id, item_text, sort_order, created_by, created_at'
    )
    .eq('term_id', termId)
    .eq('subject_id', subjectId)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });

  const rows = (data ?? []) as Array<
    ChecklistItemRow & { created_by: string | null; created_at: string | null }
  >;
  if (rows.length === 0) return [];

  // Resolve creator display names. ≤50 items per query → at most a
  // handful of unique creators. Cheap loop is fine.
  const userIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id))
  );
  const nameByUserId = new Map<string, string>();
  for (const userId of userIds) {
    try {
      const { data: u } = await service.auth.admin.getUserById(userId);
      const meta = u?.user?.user_metadata as
        | { display_name?: string }
        | undefined;
      const name = meta?.display_name ?? u?.user?.email ?? null;
      if (name) nameByUserId.set(userId, name);
    } catch {
      // Best-effort lookup — leave name unresolved on failure.
    }
  }

  return rows.map((r) => ({
    ...r,
    creator_name: r.created_by
      ? (nameByUserId.get(r.created_by) ?? null)
      : null,
  }));
}

// Load all responses for a section × term. Keyed by (student, item) for
// fast grid lookup.
export async function getResponsesBySectionTerm(
  sectionId: string,
  termId: string
): Promise<Map<string, ChecklistResponseRow>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_checklist_responses')
    .select('id, term_id, student_id, section_id, checklist_item_id, rating')
    .eq('section_id', sectionId)
    .eq('term_id', termId);
  const map = new Map<string, ChecklistResponseRow>();
  if (error) {
    console.error(
      '[evaluation] getResponsesBySectionTerm failed:',
      error.message
    );
    return map;
  }
  for (const r of (data ?? []) as ChecklistResponseRow[]) {
    map.set(`${r.student_id}|${r.checklist_item_id}`, r);
  }
  return map;
}

export async function getSubjectCommentsBySectionTerm(
  sectionId: string,
  termId: string,
  subjectId: string
): Promise<Map<string, SubjectCommentRow>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_subject_comments')
    .select('id, term_id, student_id, section_id, subject_id, comment')
    .eq('section_id', sectionId)
    .eq('term_id', termId)
    .eq('subject_id', subjectId);
  const map = new Map<string, SubjectCommentRow>();
  if (error) {
    console.error(
      '[evaluation] getSubjectCommentsBySectionTerm failed:',
      error.message
    );
    return map;
  }
  for (const r of (data ?? []) as SubjectCommentRow[]) {
    map.set(r.student_id, r);
  }
  return map;
}

export async function getPtcFeedbackBySectionTerm(
  sectionId: string,
  termId: string
): Promise<Map<string, PtcFeedbackRow>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_ptc_feedback')
    .select('id, term_id, student_id, section_id, feedback')
    .eq('section_id', sectionId)
    .eq('term_id', termId);
  const map = new Map<string, PtcFeedbackRow>();
  if (error) {
    console.error(
      '[evaluation] getPtcFeedbackBySectionTerm failed:',
      error.message
    );
    return map;
  }
  for (const r of (data ?? []) as PtcFeedbackRow[]) {
    map.set(r.student_id, r);
  }
  return map;
}

// For the subject-teacher gate: which (section × subject) pairs does this
// teacher teach? Used to scope what the Checklists tab shows on
// /evaluation/sections/[sectionId] — a teacher only sees the subject(s)
// they're assigned to for that section.
export async function listTeacherSubjectsForSection(
  userId: string,
  sectionId: string
): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('teacher_assignments')
    .select('subject_id')
    .eq('teacher_user_id', userId)
    .eq('section_id', sectionId)
    .eq('role', 'subject_teacher');
  if (error) return [];
  return ((data ?? []) as Array<{ subject_id: string | null }>)
    .map((r) => r.subject_id)
    .filter((s): s is string => !!s);
}

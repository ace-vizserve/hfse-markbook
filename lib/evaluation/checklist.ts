import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

// Server-only reads for Evaluation Phase 2 (checklists, subject comments,
// PTC feedback). Writes go through the API routes under /api/evaluation/*.

export type ChecklistItemRow = {
  id: string;
  term_id: string;
  subject_id: string;
  // Scope shifted to per-section in migration 047 — teachers own the
  // topic list per section they teach, not admin per level.
  section_id: string;
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

// List checklist items for one (term × subject × section). Used by the
// subject-teacher Checklists tab + the admin read-only audit view.
export async function listChecklistItems(
  termId: string,
  subjectId: string,
  sectionId: string,
): Promise<ChecklistItemRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_checklist_items')
    .select('id, term_id, subject_id, section_id, item_text, sort_order')
    .eq('term_id', termId)
    .eq('subject_id', subjectId)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[evaluation] listChecklistItems failed:', error.message);
    return [];
  }
  return (data ?? []) as ChecklistItemRow[];
}

// Sections (other than currentSectionId) where this teacher has a
// subject_teacher assignment AND topics already exist for the given
// (term, subject). Drives the "Copy topics from another section"
// button on the Checklists tab.
export async function getSectionsTeacherCanCopyFrom(
  userId: string,
  termId: string,
  subjectId: string,
  currentSectionId: string,
): Promise<Array<{ section_id: string; section_name: string; item_count: number }>> {
  const service = createServiceClient();

  // Step 1: all sections this teacher teaches for this subject (minus current).
  const { data: assignments } = await service
    .from('teacher_assignments')
    .select('section_id, section:sections(id, name)')
    .eq('teacher_user_id', userId)
    .eq('subject_id', subjectId)
    .eq('role', 'subject_teacher')
    .neq('section_id', currentSectionId);

  const candidates = ((assignments ?? []) as Array<{
    section_id: string;
    section: { id: string; name: string } | { id: string; name: string }[] | null;
  }>).map((a) => ({
    section_id: a.section_id,
    name: (Array.isArray(a.section) ? a.section[0] : a.section)?.name ?? a.section_id,
  }));

  if (candidates.length === 0) return [];

  // Step 2: count items per candidate for this (term, subject).
  // N+1 by design — bounded by sections-per-teacher-per-subject (≤5 in
  // practice). Worth a single round-trip optimization only if scale shifts.
  const results: Array<{ section_id: string; section_name: string; item_count: number }> = [];
  for (const c of candidates) {
    const { count } = await service
      .from('evaluation_checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('term_id', termId)
      .eq('subject_id', subjectId)
      .eq('section_id', c.section_id);
    if ((count ?? 0) > 0) {
      results.push({
        section_id: c.section_id,
        section_name: c.name,
        item_count: count ?? 0,
      });
    }
  }
  return results;
}

// Decorates each checklist item with the creator's display name (or
// email fallback). Used by /sis/admin/evaluation-checklists' read-only
// audit view to show "Created by Mr. James · 13 May 2026".
export async function listChecklistItemsWithCreator(
  termId: string,
  subjectId: string,
  sectionId: string,
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
      'id, term_id, subject_id, section_id, item_text, sort_order, created_by, created_at',
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
    new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)),
  );
  const nameByUserId = new Map<string, string>();
  for (const userId of userIds) {
    try {
      const { data: u } = await service.auth.admin.getUserById(userId);
      const meta = u?.user?.user_metadata as { display_name?: string } | undefined;
      const name = meta?.display_name ?? u?.user?.email ?? null;
      if (name) nameByUserId.set(userId, name);
    } catch {
      // Best-effort lookup — leave name unresolved on failure.
    }
  }

  return rows.map((r) => ({
    ...r,
    creator_name: r.created_by ? nameByUserId.get(r.created_by) ?? null : null,
  }));
}

// Load all responses for a section × term. Keyed by (student, item) for
// fast grid lookup.
export async function getResponsesBySectionTerm(
  sectionId: string,
  termId: string,
): Promise<Map<string, ChecklistResponseRow>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_checklist_responses')
    .select('id, term_id, student_id, section_id, checklist_item_id, rating')
    .eq('section_id', sectionId)
    .eq('term_id', termId);
  const map = new Map<string, ChecklistResponseRow>();
  if (error) {
    console.error('[evaluation] getResponsesBySectionTerm failed:', error.message);
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
  subjectId: string,
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
    console.error('[evaluation] getSubjectCommentsBySectionTerm failed:', error.message);
    return map;
  }
  for (const r of (data ?? []) as SubjectCommentRow[]) {
    map.set(r.student_id, r);
  }
  return map;
}

export async function getPtcFeedbackBySectionTerm(
  sectionId: string,
  termId: string,
): Promise<Map<string, PtcFeedbackRow>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('evaluation_ptc_feedback')
    .select('id, term_id, student_id, section_id, feedback')
    .eq('section_id', sectionId)
    .eq('term_id', termId);
  const map = new Map<string, PtcFeedbackRow>();
  if (error) {
    console.error('[evaluation] getPtcFeedbackBySectionTerm failed:', error.message);
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
  sectionId: string,
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

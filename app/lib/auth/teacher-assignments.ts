// Helpers for checking teacher assignments.
// Assignments are the app-level answer to "who is this teacher responsible
// for?" — separate from the Supabase auth role (which only says "teacher").

import type { SupabaseClient } from '@supabase/supabase-js';

export type AssignmentRow = {
  id: string;
  teacher_user_id: string;
  section_id: string;
  subject_id: string | null;
  role: 'form_adviser' | 'subject_teacher';
};

export async function loadAssignmentsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<AssignmentRow[]> {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('id, teacher_user_id, section_id, subject_id, role')
    .eq('teacher_user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentRow[];
}

// True if the user is the form adviser of the given section.
export function isFormAdviser(assignments: AssignmentRow[], sectionId: string): boolean {
  return assignments.some(a => a.role === 'form_adviser' && a.section_id === sectionId);
}

// True if the user is the subject teacher for (section, subject).
export function isSubjectTeacher(
  assignments: AssignmentRow[],
  sectionId: string,
  subjectId: string,
): boolean {
  return assignments.some(
    a => a.role === 'subject_teacher' && a.section_id === sectionId && a.subject_id === subjectId,
  );
}

// Pairs of (section_id, subject_id) the user is allowed to see as a subject
// teacher. Used to filter the grading sheet list for non-manager roles.
export function subjectTeacherPairs(
  assignments: AssignmentRow[],
): Array<{ section_id: string; subject_id: string }> {
  return assignments
    .filter(a => a.role === 'subject_teacher' && a.subject_id != null)
    .map(a => ({ section_id: a.section_id, subject_id: a.subject_id as string }));
}

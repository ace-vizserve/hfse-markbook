import { createServiceClient } from '@/lib/supabase/service';

export type PriorTermGrade = {
  term_number: number;
  term_label: string;
  quarterly_grade: number | null;
};

const firstOf = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Returns prior-term quarterly grades for all students in the given
 * (section, subject), keyed by section_student_id, sorted by term_number asc.
 * "Prior" means term_number < currentTermNumber.
 */
export async function loadPriorTermGrades(
  sectionId: string,
  subjectId: string,
  currentTermNumber: number,
): Promise<Record<string, PriorTermGrade[]>> {
  const service = createServiceClient();

  const { data: sheets } = await service
    .from('grading_sheets')
    .select('id, term:terms(term_number, label)')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId);

  type SheetRow = {
    id: string;
    term:
      | { term_number: number; label: string }
      | { term_number: number; label: string }[]
      | null;
  };

  const priorSheets = ((sheets ?? []) as unknown as SheetRow[])
    .map((s) => ({ id: s.id, term: firstOf(s.term) }))
    .filter(
      (s): s is { id: string; term: { term_number: number; label: string } } =>
        !!s.term && s.term.term_number < currentTermNumber,
    );

  if (priorSheets.length === 0) return {};

  const sheetIds = priorSheets.map((s) => s.id);
  const termBySheetId = new Map(priorSheets.map((s) => [s.id, s.term]));

  const { data: entries } = await service
    .from('grade_entries')
    .select('section_student_id, quarterly_grade, grading_sheet_id')
    .in('grading_sheet_id', sheetIds);

  type EntryRow = {
    section_student_id: string;
    quarterly_grade: number | null;
    grading_sheet_id: string;
  };

  const result: Record<string, PriorTermGrade[]> = {};
  for (const e of (entries ?? []) as unknown as EntryRow[]) {
    const term = termBySheetId.get(e.grading_sheet_id);
    if (!term) continue;
    const key = e.section_student_id;
    if (!result[key]) result[key] = [];
    result[key].push({
      term_number: term.term_number,
      term_label: term.label,
      quarterly_grade: e.quarterly_grade,
    });
  }

  for (const grades of Object.values(result)) {
    grades.sort((a, b) => a.term_number - b.term_number);
  }

  return result;
}

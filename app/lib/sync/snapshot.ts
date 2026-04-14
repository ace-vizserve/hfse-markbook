// Loads the current grading-DB state needed to plan a sync against admissions.
// Scoped to a single academic year (only sections/enrollments for that year).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GradingSnapshot } from '@/lib/sync/students';

export async function loadGradingSnapshot(
  supabase: SupabaseClient,
  ayCode: string,
): Promise<GradingSnapshot> {
  const { data: ay, error: ayErr } = await supabase
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .single();
  if (ayErr || !ay) throw new Error(`Academic year ${ayCode} not found`);

  const [levelsRes, sectionsRes, studentsRes] = await Promise.all([
    supabase.from('levels').select('id, label'),
    supabase
      .from('sections')
      .select('id, level_id, name')
      .eq('academic_year_id', ay.id),
    supabase.from('students').select('id, student_number, last_name, first_name, middle_name'),
  ]);

  if (levelsRes.error) throw new Error(levelsRes.error.message);
  if (sectionsRes.error) throw new Error(sectionsRes.error.message);
  if (studentsRes.error) throw new Error(studentsRes.error.message);

  const sectionIds = (sectionsRes.data ?? []).map(s => s.id);
  let enrollments: GradingSnapshot['enrollments'] = [];
  if (sectionIds.length > 0) {
    const { data, error } = await supabase
      .from('section_students')
      .select('id, section_id, student_id, index_number, enrollment_status')
      .in('section_id', sectionIds);
    if (error) throw new Error(error.message);
    enrollments = (data ?? []) as GradingSnapshot['enrollments'];
  }

  return {
    levels: levelsRes.data ?? [],
    sections: (sectionsRes.data ?? []) as GradingSnapshot['sections'],
    students: (studentsRes.data ?? []) as GradingSnapshot['students'],
    enrollments,
  };
}

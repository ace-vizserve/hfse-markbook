import { unstable_cache } from 'next/cache';

import { getTeacherList } from '@/lib/auth/staff-list';
import { createServiceClient } from '@/lib/supabase/service';

export type StaffSubjectAssignment = {
  assignmentId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  levelCode: string;
};

export type StaffRow = {
  userId: string;
  email: string;
  name: string;
  disabled: boolean;
  fcaSection: { id: string; name: string; levelCode: string } | null;
  subjectAssignments: StaffSubjectAssignment[];
};

type RawSection = {
  id: string;
  name: string;
  levels: { code: string } | { code: string }[] | null;
};

type RawAssignment = {
  id: string;
  teacher_user_id: string;
  section_id: string;
  subject_id: string | null;
  role: string;
  subjects: { code: string; name: string } | null;
};

async function loadStaffAssignmentsUncached(
  ayCode: string
): Promise<StaffRow[]> {
  const service = createServiceClient();

  const { data: ayRow } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (!ayRow) return [];

  const { data: sectionRows } = await service
    .from('sections')
    .select('id, name, levels(code)')
    .eq('academic_year_id', (ayRow as { id: string }).id);

  const sections = (sectionRows ?? []) as RawSection[];
  const sectionMeta = new Map(
    sections.map((s) => {
      const levelCode = Array.isArray(s.levels)
        ? (s.levels[0]?.code ?? '')
        : (s.levels?.code ?? '');
      return [s.id, { id: s.id, name: s.name, levelCode }];
    })
  );

  if (sectionMeta.size === 0) {
    const teachers = await getTeacherList({ excludeDisabled: false });
    return teachers.map((t) => ({
      userId: t.id,
      email: t.email,
      name: t.name,
      disabled: t.disabled,
      fcaSection: null,
      subjectAssignments: [],
    }));
  }

  const sectionIds = [...sectionMeta.keys()];

  const { data: assignmentRows } = await service
    .from('teacher_assignments')
    .select(
      'id, teacher_user_id, section_id, subject_id, role, subjects(code, name)'
    )
    .in('section_id', sectionIds);

  const assignments = (assignmentRows ?? []) as unknown as RawAssignment[];

  const teachers = await getTeacherList({ excludeDisabled: false });

  return teachers.map((teacher) => {
    const mine = assignments.filter((a) => a.teacher_user_id === teacher.id);

    const fcaRow = mine.find((a) => a.role === 'form_adviser');
    const fcaSec = fcaRow ? sectionMeta.get(fcaRow.section_id) : undefined;

    const subjectAssignments: StaffSubjectAssignment[] = mine
      .filter((a) => a.role === 'subject_teacher')
      .map((a) => {
        const sec = sectionMeta.get(a.section_id);
        return {
          assignmentId: a.id,
          subjectId: a.subject_id ?? '',
          subjectCode: a.subjects?.code ?? '',
          subjectName: a.subjects?.name ?? '',
          sectionId: a.section_id,
          sectionName: sec?.name ?? '',
          levelCode: sec?.levelCode ?? '',
        };
      });

    return {
      userId: teacher.id,
      email: teacher.email,
      name: teacher.name,
      disabled: teacher.disabled,
      fcaSection: fcaSec
        ? { id: fcaSec.id, name: fcaSec.name, levelCode: fcaSec.levelCode }
        : null,
      subjectAssignments,
    };
  });
}

export function loadStaffAssignments(ayCode: string): Promise<StaffRow[]> {
  return unstable_cache(
    loadStaffAssignmentsUncached,
    ['sis', 'staff-assignments', ayCode],
    { tags: [`sis:${ayCode}`], revalidate: 60 }
  )(ayCode);
}

import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { computeAnnualGrade } from '@/lib/compute/annual';

// GET /api/report-card/[studentId]
// Returns everything the report card template needs for a student in the
// current academic year: student info, per-subject T1-T4 quarterly grades,
// overall annual grade, attendance per term, adviser comments per term.
//
// Role: registrar / admin / superadmin. Teachers can see grades through the
// grading sheet UI; the aggregated report card is a registrar-level surface.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireRole(['registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { studentId } = await params;
  const supabase = await createClient();

  // ---- 1. Student ----
  const { data: student, error: stuErr } = await supabase
    .from('students')
    .select('id, student_number, last_name, first_name, middle_name')
    .eq('id', studentId)
    .single();
  if (stuErr || !student) return NextResponse.json({ error: 'student not found' }, { status: 404 });

  // ---- 2. Current AY + terms ----
  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('is_current', true)
    .single();
  if (!ay) return NextResponse.json({ error: 'no current academic year' }, { status: 500 });

  const { data: terms } = await supabase
    .from('terms')
    .select('id, term_number, label')
    .eq('academic_year_id', ay.id)
    .order('term_number');
  const termList = terms ?? [];

  // ---- 3. Enrolment (which section is this student in for the current AY) ----
  // Pick the most recent active/late_enrollee enrolment if multiple exist.
  const { data: enrolments } = await supabase
    .from('section_students')
    .select(
      `id, enrollment_status,
       section:sections!inner(id, name, form_class_adviser, academic_year_id,
         level:levels(id, code, label, level_type))`,
    )
    .eq('student_id', studentId);
  type Enrolment = {
    id: string;
    enrollment_status: string;
    section: {
      id: string;
      name: string;
      form_class_adviser: string | null;
      academic_year_id: string;
      level: { id: string; code: string; label: string; level_type: 'primary' | 'secondary' }
        | { id: string; code: string; label: string; level_type: 'primary' | 'secondary' }[]
        | null;
    } | {
      id: string;
      name: string;
      form_class_adviser: string | null;
      academic_year_id: string;
      level: { id: string; code: string; label: string; level_type: 'primary' | 'secondary' }
        | { id: string; code: string; label: string; level_type: 'primary' | 'secondary' }[]
        | null;
    }[] | null;
  };
  const first = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? v[0] ?? null : v ?? null;

  const enrolment = ((enrolments ?? []) as unknown as Enrolment[])
    .map(e => ({ ...e, section: first(e.section) }))
    .find(e => e.section?.academic_year_id === ay.id);
  if (!enrolment || !enrolment.section) {
    return NextResponse.json(
      { error: 'student has no enrolment in the current academic year' },
      { status: 404 },
    );
  }
  const section = enrolment.section;
  const level = first(section.level);
  if (!level) {
    return NextResponse.json({ error: 'section has no level' }, { status: 500 });
  }

  // ---- 4. Subjects applicable to this level (via subject_configs) ----
  const { data: configs } = await supabase
    .from('subject_configs')
    .select(
      `id, subject:subjects(id, code, name, is_examinable)`,
    )
    .eq('academic_year_id', ay.id)
    .eq('level_id', level.id);
  type ConfigRow = {
    id: string;
    subject: { id: string; code: string; name: string; is_examinable: boolean }
      | { id: string; code: string; name: string; is_examinable: boolean }[]
      | null;
  };
  const subjects = ((configs ?? []) as ConfigRow[])
    .map(c => first(c.subject))
    .filter((s): s is { id: string; code: string; name: string; is_examinable: boolean } => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));

  // ---- 5. Grading sheets for (term, section, subject) and the entry for this enrolment ----
  const { data: sheets } = await supabase
    .from('grading_sheets')
    .select('id, term_id, subject_id')
    .eq('section_id', section.id)
    .in('term_id', termList.map(t => t.id));
  const sheetsList = sheets ?? [];

  const { data: entries } = sheetsList.length > 0
    ? await supabase
        .from('grade_entries')
        .select('grading_sheet_id, quarterly_grade, letter_grade, is_na')
        .in('grading_sheet_id', sheetsList.map(s => s.id))
        .eq('section_student_id', enrolment.id)
    : { data: [] };
  const entriesBySheet = new Map(
    (entries ?? []).map(e => [e.grading_sheet_id, e]),
  );

  // Build a subjects × terms matrix.
  type Cell = { quarterly: number | null; letter: string | null; is_na: boolean };
  const empty: Cell = { quarterly: null, letter: null, is_na: false };
  const subjectRows = subjects.map(sub => {
    const byTerm: Record<number, Cell> = {};
    for (const t of termList) {
      const sheet = sheetsList.find(s => s.term_id === t.id && s.subject_id === sub.id);
      const entry = sheet ? entriesBySheet.get(sheet.id) : null;
      byTerm[t.term_number] = entry
        ? {
            quarterly: (entry.quarterly_grade as number | null) ?? null,
            letter: (entry.letter_grade as string | null) ?? null,
            is_na: Boolean(entry.is_na),
          }
        : empty;
    }
    const annual = sub.is_examinable
      ? computeAnnualGrade(
          byTerm[1]?.quarterly ?? null,
          byTerm[2]?.quarterly ?? null,
          byTerm[3]?.quarterly ?? null,
          byTerm[4]?.quarterly ?? null,
        )
      : null;
    return {
      subject: sub,
      t1: byTerm[1] ?? empty,
      t2: byTerm[2] ?? empty,
      t3: byTerm[3] ?? empty,
      t4: byTerm[4] ?? empty,
      annual,
    };
  });

  // ---- 6. Attendance per term (keyed by term_number) ----
  const { data: attendance } = await supabase
    .from('attendance_records')
    .select('term_id, school_days, days_present, days_late')
    .eq('section_student_id', enrolment.id)
    .in('term_id', termList.map(t => t.id));
  const attendanceByTerm: Record<number, {
    school_days: number | null;
    days_present: number | null;
    days_late: number | null;
  }> = {};
  for (const t of termList) {
    const rec = (attendance ?? []).find(a => a.term_id === t.id);
    attendanceByTerm[t.term_number] = {
      school_days: (rec?.school_days as number | null) ?? null,
      days_present: (rec?.days_present as number | null) ?? null,
      days_late: (rec?.days_late as number | null) ?? null,
    };
  }

  // ---- 7. Comments per term (keyed by term_number) ----
  const { data: comments } = await supabase
    .from('report_card_comments')
    .select('term_id, comment')
    .eq('section_id', section.id)
    .eq('student_id', student.id)
    .in('term_id', termList.map(t => t.id));
  const commentsByTerm: Record<number, string | null> = {};
  for (const t of termList) {
    commentsByTerm[t.term_number] =
      (comments ?? []).find(c => c.term_id === t.id)?.comment ?? null;
  }

  return NextResponse.json({
    academic_year: { code: ay.ay_code, label: ay.label },
    student: {
      id: student.id,
      student_number: student.student_number,
      last_name: student.last_name,
      first_name: student.first_name,
      middle_name: student.middle_name,
    },
    section: {
      id: section.id,
      name: section.name,
      form_class_adviser: section.form_class_adviser,
    },
    level: { code: level.code, label: level.label, type: level.level_type },
    enrollment_status: enrolment.enrollment_status,
    terms: termList.map(t => ({ term_number: t.term_number, label: t.label })),
    subject_rows: subjectRows,
    attendance: attendanceByTerm,
    comments: commentsByTerm,
  });
}

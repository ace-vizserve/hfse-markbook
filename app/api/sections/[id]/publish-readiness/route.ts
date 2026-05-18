import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';

// GET /api/sections/[id]/publish-readiness?term_id=...
// Returns checklist data for the pre-publish completeness check.
// Registrar+ only.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sectionId } = await params;
  const termId = request.nextUrl.searchParams.get('term_id');
  if (!termId) {
    return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
  }

  const service = createServiceClient();

  // 1) Resolve term_number for T4 detection
  const { data: term } = await service
    .from('terms')
    .select('id, term_number, academic_year_id')
    .eq('id', termId)
    .single();
  if (!term) {
    return NextResponse.json({ error: 'term not found' }, { status: 404 });
  }
  const isT4 = term.term_number === 4;

  // 2+3) Active students and grading sheets are independent — fetch in parallel.
  const [{ data: enrolments }, { data: sheets }] = await Promise.all([
    service
      .from('section_students')
      .select('id, index_number, enrollment_status, student:students(id, student_number, last_name, first_name)')
      .eq('section_id', sectionId)
      .in('enrollment_status', ['active', 'late_enrollee'])
      .order('index_number'),
    service
      .from('grading_sheets')
      .select('id, is_locked, subject:subjects(id, name)')
      .eq('section_id', sectionId)
      .eq('term_id', termId),
  ]);

  const activeStudents = (enrolments ?? []).map((e) => {
    const s = Array.isArray(e.student) ? e.student[0] : e.student;
    return {
      sectionStudentId: e.id,
      indexNumber: e.index_number,
      studentId: s?.id ?? null,
      name: s ? `${s.last_name}, ${s.first_name}` : '(unknown)',
    };
  });
  const sheetList = (sheets ?? []).map((sh) => {
    const subj = Array.isArray(sh.subject) ? sh.subject[0] : sh.subject;
    return { id: sh.id, is_locked: sh.is_locked, subject_name: subj?.name ?? '(unknown)' };
  });
  const unlockedSheets = sheetList.filter((s) => !s.is_locked);

  // 4+5) Write-ups and attendance both depend on activeStudents — fetch in parallel.
  const studentIds = activeStudents.map((s) => s.studentId).filter((id): id is string => !!id);
  const sectionStudentIds = activeStudents.map((s) => s.sectionStudentId);

  const [{ data: writeupRows }, { data: attendanceRows }] = await Promise.all([
    studentIds.length > 0
      ? service
          .from('evaluation_writeups')
          .select('student_id, writeup, submitted')
          .eq('term_id', termId)
          .eq('section_id', sectionId)
          .in('student_id', studentIds)
      : Promise.resolve({ data: [] as unknown[] }),
    sectionStudentIds.length > 0
      ? service
          .from('attendance_records')
          .select('section_student_id, school_days, days_present, days_late')
          .eq('term_id', termId)
          .in('section_student_id', sectionStudentIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  type WriteupLite = { student_id: string; writeup: string | null; submitted: boolean };
  const writeupsByStudent = new Map<string, WriteupLite>(
    (writeupRows ?? []).map((w) => [(w as WriteupLite).student_id, w as WriteupLite]),
  );
  const missingEvaluations = activeStudents.filter((s) => {
    if (!s.studentId) return true;
    const w = writeupsByStudent.get(s.studentId);
    return !w || !w.writeup || w.writeup.trim().length === 0;
  });
  const submittedCount = activeStudents.filter((s) => {
    if (!s.studentId) return false;
    return writeupsByStudent.get(s.studentId)?.submitted === true;
  }).length;
  const draftedCount = activeStudents.length - missingEvaluations.length - submittedCount;

  const attendanceBySSId = new Map(
    (attendanceRows ?? []).map((a) => {
      const row = a as { section_student_id: string; school_days: number | null; days_present: number | null; days_late: number | null };
      return [row.section_student_id, row];
    }),
  );
  const missingAttendance = activeStudents.filter((s) => {
    const rec = attendanceBySSId.get(s.sectionStudentId);
    return !rec || rec.school_days == null || rec.days_present == null || rec.days_late == null;
  });

  // 6) T4-specific: all four terms locked + annual grades present
  let t4Readiness = null;
  if (isT4) {
    const { data: allTerms } = await service
      .from('terms')
      .select('id, term_number')
      .eq('academic_year_id', term.academic_year_id)
      .order('term_number');
    const termIds = (allTerms ?? []).map((t) => t.id);

    // allSheets and grade entries are both independent after termIds resolves.
    const [{ data: allSheets }, { data: entries }] = await Promise.all([
      service
        .from('grading_sheets')
        .select('id, term_id, is_locked, subject:subjects(id, name)')
        .eq('section_id', sectionId)
        .in('term_id', termIds),
      service
        .from('grade_entries')
        .select('student_id, quarterly_grade, grading_sheet:grading_sheets!inner(id, term_id, subject:subjects!inner(id, name, is_examinable))')
        .eq('grading_sheet.section_id', sectionId)
        .in('grading_sheet.term_id', termIds),
    ]);

    const unlockedByTerm: { term_number: number; subjects: string[] }[] = [];
    for (const t of allTerms ?? []) {
      const termSheets = (allSheets ?? []).filter((s) => s.term_id === t.id);
      const unlocked = termSheets
        .filter((s) => !s.is_locked)
        .map((s) => {
          const subj = Array.isArray(s.subject) ? s.subject[0] : s.subject;
          return subj?.name ?? '(unknown)';
        });
      if (unlocked.length > 0) {
        unlockedByTerm.push({ term_number: t.term_number, subjects: unlocked });
      }
    }

    // Check for missing quarterly grades across all 4 terms (examinable only)

    // Build a map: student × subject → [t1_grade, t2_grade, t3_grade, t4_grade]
    const gradeMap = new Map<string, Map<string, (number | null)[]>>();
    for (const e of entries ?? []) {
      const gs = Array.isArray(e.grading_sheet) ? e.grading_sheet[0] : e.grading_sheet;
      if (!gs) continue;
      const subj = Array.isArray(gs.subject) ? gs.subject[0] : gs.subject;
      if (!subj?.is_examinable) continue;
      const termObj = (allTerms ?? []).find((t) => t.id === gs.term_id);
      if (!termObj) continue;

      const studentKey = e.student_id;
      const subjKey = subj.name;
      if (!gradeMap.has(studentKey)) gradeMap.set(studentKey, new Map());
      const subjMap = gradeMap.get(studentKey)!;
      if (!subjMap.has(subjKey)) subjMap.set(subjKey, [null, null, null, null]);
      subjMap.get(subjKey)![termObj.term_number - 1] = e.quarterly_grade;
    }

    const missingAnnual: { student_name: string; subject_name: string; missing_terms: number[] }[] = [];
    for (const s of activeStudents) {
      if (!s.studentId) continue;
      const subjMap = gradeMap.get(s.studentId);
      if (!subjMap) continue;
      for (const [subjName, grades] of subjMap) {
        const missing = grades
          .map((g, i) => (g == null ? i + 1 : null))
          .filter((t): t is number => t !== null);
        if (missing.length > 0) {
          missingAnnual.push({
            student_name: s.name,
            subject_name: subjName,
            missing_terms: missing,
          });
        }
      }
    }

    t4Readiness = {
      all_terms_locked: unlockedByTerm.length === 0,
      unlocked_terms: unlockedByTerm,
      missing_annual_grades: missingAnnual.slice(0, 20),
      missing_annual_count: missingAnnual.length,
    };
  }

  return NextResponse.json({
    grading_sheets: {
      total: sheetList.length,
      locked: sheetList.length - unlockedSheets.length,
      unlocked: unlockedSheets.map((s) => ({ subject_name: s.subject_name })),
    },
    // Adviser-comment readiness (KD #49). Sourced from `evaluation_writeups`
    // since migration 024 retired `report_card_comments`.
    evaluations: {
      total_active: activeStudents.length,
      submitted: submittedCount,
      drafted: draftedCount,
      missing: missingEvaluations.map((s) => ({ name: s.name, index: s.indexNumber })),
    },
    attendance: {
      total_active: activeStudents.length,
      complete: activeStudents.length - missingAttendance.length,
      missing: missingAttendance.map((s) => ({ name: s.name, index: s.indexNumber })),
    },
    t4_readiness: t4Readiness,
  });
}

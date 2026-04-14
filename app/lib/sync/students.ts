// Pure planner for the admissions → grading-DB sync.
// Takes a snapshot of current grading-DB state and the admissions roster,
// returns a plan of inserts/updates/withdrawals and errors.
// Kept pure so it's testable without hitting either database.

import type { AdmissionsRow } from '@/lib/supabase/admissions';
import { normalizeSectionName } from '@/lib/sync/section-normalizer';
import { normalizeLevelLabel } from '@/lib/sync/level-normalizer';

export type LevelRow = { id: string; label: string };
export type SectionRow = { id: string; level_id: string; name: string };
export type StudentRow = {
  id: string;
  student_number: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
};
export type EnrollmentRow = {
  id: string;
  section_id: string;
  student_id: string;
  index_number: number;
  enrollment_status: 'active' | 'late_enrollee' | 'withdrawn';
};

export type GradingSnapshot = {
  levels: LevelRow[];
  sections: SectionRow[];   // only sections for the target academic year
  students: StudentRow[];
  enrollments: EnrollmentRow[]; // only for sections in the target academic year
};

export type StudentUpsert = {
  student_number: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  kind: 'insert' | 'update';
  existing_id?: string;
};

export type EnrollmentInsert = {
  section_id: string;
  student_number: string; // resolved to student_id at commit time
  index_number: number;
};

export type EnrollmentStatusChange = {
  enrollment_id: string;
  student_number: string;
  section_id: string;
  from: EnrollmentRow['enrollment_status'];
  to: EnrollmentRow['enrollment_status'];
};

export type SyncError = {
  row_index: number;
  student_number: string | null;
  reason: string;
};

export type SyncPlan = {
  student_upserts: StudentUpsert[];
  enrollment_inserts: EnrollmentInsert[];
  enrollment_status_changes: EnrollmentStatusChange[];
  errors: SyncError[];
  stats: {
    total_source_rows: number;
    students_to_add: number;
    students_to_update: number;
    enrollments_to_add: number;
    enrollments_to_withdraw: number;
    enrollments_to_reactivate: number;
    errors: number;
    by_level: Record<string, { add: number; update: number; withdraw: number }>;
  };
};

export function buildSyncPlan(
  rows: AdmissionsRow[],
  snapshot: GradingSnapshot,
): SyncPlan {
  const levelByLabel = new Map(snapshot.levels.map(l => [l.label, l]));
  const sectionByLevelAndName = new Map<string, SectionRow>();
  for (const s of snapshot.sections) {
    sectionByLevelAndName.set(`${s.level_id}::${s.name}`, s);
  }
  const studentByNumber = new Map(
    snapshot.students.map(s => [s.student_number, s]),
  );
  const enrollmentBySectionAndStudent = new Map<string, EnrollmentRow>();
  for (const e of snapshot.enrollments) {
    enrollmentBySectionAndStudent.set(`${e.section_id}::${e.student_id}`, e);
  }

  // Current max index per section (for appending new enrollees).
  const maxIndexBySection = new Map<string, number>();
  for (const e of snapshot.enrollments) {
    const prev = maxIndexBySection.get(e.section_id) ?? 0;
    if (e.index_number > prev) maxIndexBySection.set(e.section_id, e.index_number);
  }

  const plan: SyncPlan = {
    student_upserts: [],
    enrollment_inserts: [],
    enrollment_status_changes: [],
    errors: [],
    stats: {
      total_source_rows: rows.length,
      students_to_add: 0,
      students_to_update: 0,
      enrollments_to_add: 0,
      enrollments_to_withdraw: 0,
      enrollments_to_reactivate: 0,
      errors: 0,
      by_level: {},
    },
  };

  const bumpLevel = (label: string, key: 'add' | 'update' | 'withdraw') => {
    const b = (plan.stats.by_level[label] ??= { add: 0, update: 0, withdraw: 0 });
    b[key]++;
  };

  // Track the set of (section_id, student_number) seen in this sync to detect
  // students no longer in admissions (candidates for withdrawal).
  const seen = new Set<string>();
  // Track planned student_number → student row shape so duplicate rows from the
  // source don't create duplicate insert plans.
  const plannedStudents = new Map<string, StudentUpsert>();
  // Track planned enrollments (section_id + student_number) so duplicates in
  // the source roster don't claim two index numbers.
  const plannedEnrollments = new Set<string>();

  rows.forEach((row, i) => {
    const number = row.student_number?.trim() || null;
    if (!number) {
      plan.errors.push({
        row_index: i,
        student_number: null,
        reason: 'null or empty studentNumber',
      });
      return;
    }
    const levelLabel = normalizeLevelLabel(row.class_level);
    if (!levelLabel) {
      plan.errors.push({
        row_index: i,
        student_number: number,
        reason: 'missing classLevel',
      });
      return;
    }
    const level = levelByLabel.get(levelLabel);
    if (!level) {
      plan.errors.push({
        row_index: i,
        student_number: number,
        reason: `unknown classLevel "${row.class_level}"`,
      });
      return;
    }
    const sectionName = normalizeSectionName(row.class_section);
    if (!sectionName) {
      plan.errors.push({
        row_index: i,
        student_number: number,
        reason: 'missing classSection',
      });
      return;
    }
    const section = sectionByLevelAndName.get(`${level.id}::${sectionName}`);
    if (!section) {
      plan.errors.push({
        row_index: i,
        student_number: number,
        reason: `section "${sectionName}" not found under ${level.label}`,
      });
      return;
    }

    // ----- Student upsert -----
    const existing = studentByNumber.get(number);
    const last_name = (row.last_name ?? '').trim();
    const first_name = (row.first_name ?? '').trim();
    const middle_name = row.middle_name?.trim() || null;

    if (!existing) {
      if (!plannedStudents.has(number)) {
        const upsert: StudentUpsert = {
          student_number: number,
          last_name,
          first_name,
          middle_name,
          kind: 'insert',
        };
        plannedStudents.set(number, upsert);
        plan.student_upserts.push(upsert);
        plan.stats.students_to_add++;
      }
    } else {
      const changed =
        existing.last_name !== last_name ||
        existing.first_name !== first_name ||
        (existing.middle_name ?? null) !== middle_name;
      if (changed && !plannedStudents.has(number)) {
        const upsert: StudentUpsert = {
          student_number: number,
          last_name,
          first_name,
          middle_name,
          kind: 'update',
          existing_id: existing.id,
        };
        plannedStudents.set(number, upsert);
        plan.student_upserts.push(upsert);
        plan.stats.students_to_update++;
      }
    }

    // ----- Enrollment -----
    const seenKey = `${section.id}::${number}`;
    seen.add(seenKey);

    // Reactivate if previously withdrawn and back in admissions.
    if (existing) {
      const prevEnrollment = enrollmentBySectionAndStudent.get(
        `${section.id}::${existing.id}`,
      );
      if (prevEnrollment) {
        if (prevEnrollment.enrollment_status === 'withdrawn') {
          plan.enrollment_status_changes.push({
            enrollment_id: prevEnrollment.id,
            student_number: number,
            section_id: section.id,
            from: 'withdrawn',
            to: 'active',
          });
          plan.stats.enrollments_to_reactivate++;
        }
        return; // already enrolled in this section, nothing else to do
      }
    }

    if (plannedEnrollments.has(seenKey)) return;
    plannedEnrollments.add(seenKey);

    const nextIndex = (maxIndexBySection.get(section.id) ?? 0) + 1;
    maxIndexBySection.set(section.id, nextIndex);
    plan.enrollment_inserts.push({
      section_id: section.id,
      student_number: number,
      index_number: nextIndex,
    });
    plan.stats.enrollments_to_add++;
    bumpLevel(level.label, 'add');
  });

  // ----- Detect withdrawals: active enrollments not seen in this sync -----
  const studentById = new Map(snapshot.students.map(s => [s.id, s]));
  const sectionById = new Map(snapshot.sections.map(s => [s.id, s]));
  const levelById = new Map(snapshot.levels.map(l => [l.id, l]));

  for (const e of snapshot.enrollments) {
    if (e.enrollment_status !== 'active' && e.enrollment_status !== 'late_enrollee') continue;
    const student = studentById.get(e.student_id);
    if (!student) continue;
    const key = `${e.section_id}::${student.student_number}`;
    if (seen.has(key)) continue;
    plan.enrollment_status_changes.push({
      enrollment_id: e.id,
      student_number: student.student_number,
      section_id: e.section_id,
      from: e.enrollment_status,
      to: 'withdrawn',
    });
    plan.stats.enrollments_to_withdraw++;
    const section = sectionById.get(e.section_id);
    const level = section ? levelById.get(section.level_id) : undefined;
    if (level) bumpLevel(level.label, 'withdraw');
  }

  plan.stats.errors = plan.errors.length;
  return plan;
}

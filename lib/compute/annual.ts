// Overall annual grade (full year) formula — docs/context/02-grading-system.md.
//   Overall = ROUND((T1 × 0.20) + (T2 × 0.20) + (T3 × 0.20) + (T4 × 0.40), 2)
// Term 4 carries double weight (40%) vs T1-T3 (20% each). Total is 100%.
//
// Late-enrollee proration: pass naFlags=[t1Na, t2Na, t3Na, t4Na]. A term that is
// null AND flagged N/A is excluded and the remaining weights are renormalized to
// 100% so the grade is still meaningful. A null term with no flag → incomplete → null.
// Omitting naFlags preserves the original behaviour (any null → null).

const TERM_WEIGHTS: [number, number, number, number] = [0.2, 0.2, 0.2, 0.4];

export function computeAnnualGrade(
  t1: number | null,
  t2: number | null,
  t3: number | null,
  t4: number | null,
  naFlags?: [boolean, boolean, boolean, boolean]
): number | null {
  const grades = [t1, t2, t3, t4] as const;
  const na = naFlags ?? [false, false, false, false];

  let weightSum = 0;
  let weightedSum = 0;
  for (let i = 0; i < 4; i++) {
    if (grades[i] == null) {
      if (!na[i]) return null; // genuinely missing — incomplete grade
    } else {
      weightSum += TERM_WEIGHTS[i];
      weightedSum += grades[i]! * TERM_WEIGHTS[i];
    }
  }

  if (weightSum === 0) return null; // all terms were N/A

  return Math.round((weightedSum / weightSum) * 100) / 100;
}

// Descriptor for a numeric quarterly or annual grade per DepEd scale.
// Used by the report card legend column.
// fallow-ignore-next-line unused-export
export function gradeDescriptor(grade: number | null): string {
  if (grade == null) return '—';
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Very Satisfactory';
  if (grade >= 80) return 'Satisfactory';
  if (grade >= 75) return 'Fairly Satisfactory';
  return 'Below Minimum Expectations';
}

// General average across all examinable subjects' final grades.
// ROUND to 1 decimal per HFSE's canonical spec — verified against the
// =ROUND(AVERAGE(K8,Q8,W8,AC8,AI8),1) formula on the registrar's
// Masterfile. Drives the General Average row on the T4 report card and
// the Overall Academic Award badge thresholds.
// Returns null if the list is empty or any grade is null (incomplete year).
export function computeGeneralAverage(
  finalGrades: (number | null)[]
): number | null {
  if (finalGrades.length === 0) return null;
  if (finalGrades.some((g) => g == null)) return null;
  const sum = finalGrades.reduce<number>((acc, g) => acc + g!, 0);
  return Math.round((sum / finalGrades.length) * 10) / 10;
}

// Cumulative attendance percentage across all terms.
// Returns null if any field is null or total school days is zero.
export function computeAttendancePercentage(
  records: { school_days: number | null; days_present: number | null }[]
): number | null {
  if (records.length === 0) return null;
  let totalSchool = 0;
  let totalPresent = 0;
  for (const r of records) {
    if (r.school_days == null || r.days_present == null) return null;
    totalSchool += r.school_days;
    totalPresent += r.days_present;
  }
  if (totalSchool === 0) return null;
  return Math.round((totalPresent / totalSchool) * 10000) / 100;
}

// Self-test: canonical cases + proration.
(function verifyAnnual() {
  const a = computeAnnualGrade(85, 85, 85, 85);
  if (a !== 85)
    throw new Error(
      `annual self-test failed: 85/85/85/85 → ${a} (expected 85)`
    );
  // 70*.2 + 80*.2 + 90*.2 + 95*.4 = 14 + 16 + 18 + 38 = 86
  const b = computeAnnualGrade(70, 80, 90, 95);
  if (b !== 86)
    throw new Error(
      `annual self-test failed: 70/80/90/95 → ${b} (expected 86)`
    );
  const partial = computeAnnualGrade(85, 85, null, 90);
  if (partial !== null)
    throw new Error(
      `annual self-test: partial year should be null, got ${partial}`
    );
  // Proration — T1 N/A (late enrollee joined T2):
  // weightedSum = 80*.2 + 85*.2 + 90*.4 = 16+17+36 = 69; weightSum = 0.8; 69/0.8 = 86.25
  const p1 = computeAnnualGrade(null, 80, 85, 90, [true, false, false, false]);
  if (p1 !== 86.25)
    throw new Error(`proration self-test (T1 N/A) → ${p1} (expected 86.25)`);
  // Proration — T1+T2 N/A: weightedSum = 80*.2 + 90*.4 = 16+36=52; weightSum=0.6; 52/0.6=86.67
  const p2 = computeAnnualGrade(null, null, 80, 90, [true, true, false, false]);
  if (p2 !== 86.67)
    throw new Error(`proration self-test (T1+T2 N/A) → ${p2} (expected 86.67)`);
  // All N/A → null
  const p3 = computeAnnualGrade(null, null, null, null, [
    true,
    true,
    true,
    true,
  ]);
  if (p3 !== null)
    throw new Error(`proration self-test: all N/A should be null, got ${p3}`);

  // General average — 1dp per canonical spec.
  const ga1 = computeGeneralAverage([90, 85, 80]);
  if (ga1 !== 85)
    throw new Error(
      `general-avg self-test failed: [90,85,80] → ${ga1} (expected 85)`
    );
  // 92.6 + 91.4 + 95.5 + 88.5 + 99.4 = 467.4 / 5 = 93.48 → 93.5 (1dp)
  const ga4 = computeGeneralAverage([92.6, 91.4, 95.5, 88.5, 99.4]);
  if (ga4 !== 93.5)
    throw new Error(
      `general-avg 1dp self-test failed: → ${ga4} (expected 93.5)`
    );
  const ga2 = computeGeneralAverage([90, null, 80]);
  if (ga2 !== null)
    throw new Error(
      `general-avg self-test: partial should be null, got ${ga2}`
    );
  const ga3 = computeGeneralAverage([]);
  if (ga3 !== null)
    throw new Error(`general-avg self-test: empty should be null, got ${ga3}`);

  // Attendance percentage
  const att1 = computeAttendancePercentage([
    { school_days: 50, days_present: 45 },
    { school_days: 50, days_present: 48 },
    { school_days: 50, days_present: 50 },
    { school_days: 50, days_present: 47 },
  ]);
  // (45+48+50+47)/(50+50+50+50) = 190/200 = 95
  if (att1 !== 95)
    throw new Error(`attendance self-test failed: expected 95, got ${att1}`);
  const att2 = computeAttendancePercentage([
    { school_days: 50, days_present: null },
  ]);
  if (att2 !== null)
    throw new Error(
      `attendance self-test: null present should be null, got ${att2}`
    );
})();

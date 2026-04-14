// Overall annual grade (full year) formula — docs/context/02-grading-system.md.
//   Overall = ROUND((T1 × 0.20) + (T2 × 0.20) + (T3 × 0.20) + (T4 × 0.40), 2)
// Term 4 carries double weight (40%) vs T1-T3 (20% each). Total is 100%.
//
// Returns null if ANY term is missing — the spec treats a partial year as
// incomplete and suppresses the overall column on the report card.

export function computeAnnualGrade(
  t1: number | null,
  t2: number | null,
  t3: number | null,
  t4: number | null,
): number | null {
  if (t1 == null || t2 == null || t3 == null || t4 == null) return null;
  const raw = t1 * 0.2 + t2 * 0.2 + t3 * 0.2 + t4 * 0.4;
  return Math.round(raw * 100) / 100;
}

// Descriptor for a numeric quarterly or annual grade per DepEd scale.
// Used by the report card legend column.
export function gradeDescriptor(grade: number | null): string {
  if (grade == null) return '—';
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Very Satisfactory';
  if (grade >= 80) return 'Satisfactory';
  if (grade >= 75) return 'Fairly Satisfactory';
  return 'Below Minimum Expectations';
}

// Self-test: 85/85/85/85 should floor-average to 85.00, and a 70/80/90/95
// sample exercises the weighted double-term.
(function verifyAnnual() {
  const a = computeAnnualGrade(85, 85, 85, 85);
  if (a !== 85) throw new Error(`annual self-test failed: 85/85/85/85 → ${a} (expected 85)`);
  // 70*.2 + 80*.2 + 90*.2 + 95*.4 = 14 + 16 + 18 + 38 = 86
  const b = computeAnnualGrade(70, 80, 90, 95);
  if (b !== 86) throw new Error(`annual self-test failed: 70/80/90/95 → ${b} (expected 86)`);
  const partial = computeAnnualGrade(85, 85, null, 90);
  if (partial !== null) throw new Error(`annual self-test: partial year should be null, got ${partial}`);
})();

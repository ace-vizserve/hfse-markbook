// HFSE Subject + Overall Academic Awards (KD #95).
//
// Both ladders share the same numeric thresholds — only the label and the
// input differ. Source spec: HFSE's literal IFS formulas on the AY2025
// masterfile workbook.
//
//   Subject Award (per examinable subject, from Subject Overall):
//     =IFS(K8<88.5,"Not eligible for Subject Award",
//          K8<=91.4,"Bronze",
//          K8<=95.4,"Silver",
//          K8<=99.4,"Gold")
//
//   Overall Academic Award (per student, from General Average):
//     =ROUND(AVERAGE(K8,Q8,W8,AC8,AI8),1)              ← 1dp mean of the 5
//                                                         examinable Subject
//                                                         Overall columns
//     =IFS(BA8<88.5,"Not eligible for Overall Award",
//          BA8<=91.4,"Bronze",
//          BA8<=95.4,"Silver",
//          BA8<=99.4,"Gold")
//
// Thresholds are stored on `school_config` so HFSE can tune without a
// deploy. This module takes them as a parameter — pure functions, no DB.
//
// Disqualifiers (override the numeric result):
//   * Withdrawn students → no badge (caller passes `withdrawn: true`)
//   * Late enrollee with incomplete examinable data → "Not eligible"
//   * Any input null → "Not eligible" (the ladder requires a numeric input)

export type AwardThresholds = {
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  max: number;
};

export const DEFAULT_AWARD_THRESHOLDS: AwardThresholds = {
  bronzeMin: 88.5,
  silverMin: 91.5,
  goldMin: 95.5,
  max: 100.0,
};

export type AwardEligibility = {
  // Whether the student is currently enrolled (active or late_enrollee).
  // Withdrawn → no badge regardless of numeric result.
  enrolled: boolean;
  // Whether the student has the data needed to compute the underlying
  // average (all examinable terms with grade_entries that aren't null).
  hasCompleteData: boolean;
};

export type SubjectAwardLabel =
  | 'Gold'
  | 'Silver'
  | 'Bronze'
  | 'Not eligible for Subject Award'
  | null; // null = blank cell (withdrawn before any data, etc.)

export type OverallAwardLabel =
  | 'Gold'
  | 'Silver'
  | 'Bronze'
  | 'Not eligible for Overall Award'
  | null;

function tierFor(
  score: number,
  thresholds: AwardThresholds,
): 'Gold' | 'Silver' | 'Bronze' | 'NE' {
  if (score < thresholds.bronzeMin) return 'NE';
  if (score < thresholds.silverMin) return 'Bronze';
  if (score < thresholds.goldMin) return 'Silver';
  // Gold covers [goldMin .. max] inclusive. Anything above max would have
  // been an invalid input — let it fall into Gold rather than #N/A so a
  // perfect 100 isn't treated as out of range (HFSE's IFS bugs out at >99.4).
  return 'Gold';
}

/**
 * Subject Award for one examinable subject.
 *
 * @param subjectOverall — the 4-term Subject Overall, ROUND to 2dp per
 *                          `lib/compute/annual.ts::computeAnnualGrade`.
 *                          Pass null when any term is missing or the row
 *                          doesn't yet exist; result is "Not eligible".
 */
export function subjectAward(
  subjectOverall: number | null,
  thresholds: AwardThresholds,
  eligibility: AwardEligibility,
): SubjectAwardLabel {
  if (!eligibility.enrolled) return null;
  if (!eligibility.hasCompleteData) return 'Not eligible for Subject Award';
  if (subjectOverall == null) return 'Not eligible for Subject Award';
  const tier = tierFor(subjectOverall, thresholds);
  if (tier === 'NE') return 'Not eligible for Subject Award';
  return tier;
}

/**
 * Overall Academic Award (cross-subject ladder for one student).
 *
 * Input is the General Average — the 1dp mean of all examinable Subject
 * Overalls. Use `lib/compute/annual.ts::computeGeneralAverage` to compute
 * the input value.
 */
export function overallAcademicAward(
  generalAverage: number | null,
  thresholds: AwardThresholds,
  eligibility: AwardEligibility,
): OverallAwardLabel {
  if (!eligibility.enrolled) return null;
  if (!eligibility.hasCompleteData) return 'Not eligible for Overall Award';
  if (generalAverage == null) return 'Not eligible for Overall Award';
  const tier = tierFor(generalAverage, thresholds);
  if (tier === 'NE') return 'Not eligible for Overall Award';
  return tier;
}

// ---------- Self-test (runs once on module load) ----------
// Hard rule: this module's ladder must match HFSE's IFS thresholds exactly.
// If self-test throws, do not ship.
(function verifyAwards() {
  const t = DEFAULT_AWARD_THRESHOLDS;
  const elig: AwardEligibility = { enrolled: true, hasCompleteData: true };

  // Subject Award ladder boundary cases.
  const cases: Array<[number, SubjectAwardLabel]> = [
    [88.4, 'Not eligible for Subject Award'],
    [88.5, 'Bronze'],
    [91.4, 'Bronze'],
    [91.5, 'Silver'],
    [95.4, 'Silver'],
    [95.5, 'Gold'],
    [99.4, 'Gold'],
    [99.5, 'Gold'],
    [100.0, 'Gold'],
  ];
  for (const [score, expected] of cases) {
    const got = subjectAward(score, t, elig);
    if (got !== expected) {
      throw new Error(
        `awards self-test failed: score=${score} expected=${expected} got=${got}`,
      );
    }
  }

  // Withdrawn → null, regardless of score.
  const withdrawn = subjectAward(95.0, t, { enrolled: false, hasCompleteData: true });
  if (withdrawn !== null) {
    throw new Error(`awards self-test: withdrawn should be null, got ${withdrawn}`);
  }

  // Incomplete data → "Not eligible".
  const incomplete = subjectAward(95.0, t, { enrolled: true, hasCompleteData: false });
  if (incomplete !== 'Not eligible for Subject Award') {
    throw new Error(
      `awards self-test: incomplete should be NE, got ${incomplete}`,
    );
  }

  // Null score → "Not eligible".
  const nullInput = subjectAward(null, t, elig);
  if (nullInput !== 'Not eligible for Subject Award') {
    throw new Error(`awards self-test: null score should be NE, got ${nullInput}`);
  }

  // Overall Award uses the same ladder, different label.
  const overall = overallAcademicAward(93.5, t, elig);
  if (overall !== 'Silver') {
    throw new Error(`awards self-test: overall 93.5 should be Silver, got ${overall}`);
  }
  const overallNE = overallAcademicAward(80.0, t, elig);
  if (overallNE !== 'Not eligible for Overall Award') {
    throw new Error(
      `awards self-test: overall 80 should be NE Overall, got ${overallNE}`,
    );
  }
})();

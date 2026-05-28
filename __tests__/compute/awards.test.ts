import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AWARD_THRESHOLDS,
  type AwardEligibility,
  overallAcademicAward,
  subjectAward,
} from '@/lib/compute/awards';

const T = DEFAULT_AWARD_THRESHOLDS;
const ELIGIBLE: AwardEligibility = { enrolled: true, hasCompleteData: true };
const WITHDRAWN: AwardEligibility = { enrolled: false, hasCompleteData: true };
const INCOMPLETE: AwardEligibility = { enrolled: true, hasCompleteData: false };

describe('subjectAward', () => {
  // ── All 9 IFS boundary values ────────────────────────────────────────────
  it.each([
    [88.4, 'Not eligible for Subject Award'],
    [88.5, 'Bronze'],
    [91.4, 'Bronze'],
    [91.5, 'Silver'],
    [95.4, 'Silver'],
    [95.5, 'Gold'],
    [99.4, 'Gold'],
    [99.5, 'Gold'],
    [100.0, 'Gold'],
  ] as const)('score %s → %s', (score, expected) => {
    expect(subjectAward(score, T, ELIGIBLE)).toBe(expected);
  });

  // ── Disqualifiers override the numeric result ────────────────────────────
  it('returns null for a withdrawn student regardless of score', () => {
    expect(subjectAward(99.5, T, WITHDRAWN)).toBeNull();
  });

  it('returns Not eligible when data is incomplete', () => {
    expect(subjectAward(99.5, T, INCOMPLETE)).toBe(
      'Not eligible for Subject Award'
    );
  });

  it('returns Not eligible when score is null', () => {
    expect(subjectAward(null, T, ELIGIBLE)).toBe(
      'Not eligible for Subject Award'
    );
  });
});

describe('overallAcademicAward', () => {
  it('returns Gold for 99.5 (Overall label variant)', () => {
    expect(overallAcademicAward(99.5, T, ELIGIBLE)).toBe('Gold');
  });

  it('returns Silver for 93.5', () => {
    expect(overallAcademicAward(93.5, T, ELIGIBLE)).toBe('Silver');
  });

  it('returns Bronze for 90.0', () => {
    expect(overallAcademicAward(90.0, T, ELIGIBLE)).toBe('Bronze');
  });

  it('returns Not eligible for Overall Award for 80.0', () => {
    expect(overallAcademicAward(80.0, T, ELIGIBLE)).toBe(
      'Not eligible for Overall Award'
    );
  });

  it('returns null for a withdrawn student', () => {
    expect(overallAcademicAward(99.5, T, WITHDRAWN)).toBeNull();
  });

  it('returns Not eligible for Overall Award when data is incomplete', () => {
    expect(overallAcademicAward(99.5, T, INCOMPLETE)).toBe(
      'Not eligible for Overall Award'
    );
  });
});

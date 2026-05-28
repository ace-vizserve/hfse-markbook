import { describe, expect, it } from 'vitest';
import {
  computeAnnualGrade,
  computeGeneralAverage,
} from '@/lib/compute/annual';

describe('computeAnnualGrade', () => {
  // ── Standard formula ─────────────────────────────────────────────────────
  it('applies T1×0.20 + T2×0.20 + T3×0.20 + T4×0.40 with 2dp precision', () => {
    // 70×0.2 + 80×0.2 + 90×0.2 + 95×0.4 = 14+16+18+38 = 86.00
    expect(computeAnnualGrade(70, 80, 90, 95)).toBe(86);
  });

  it('returns the same value when all four terms are identical', () => {
    expect(computeAnnualGrade(85, 85, 85, 85)).toBe(85);
  });

  it('returns null when any term is missing and no naFlag is set', () => {
    expect(computeAnnualGrade(85, 85, null, 90)).toBeNull();
    expect(computeAnnualGrade(null, 85, 85, 90)).toBeNull();
    expect(computeAnnualGrade(85, 85, 85, null)).toBeNull();
  });

  // ── Late-enrollee proration (confirmed 2026-05-27) ───────────────────────
  // Null term with naFlag=true is excluded; remaining weights renormalize to 1.0.
  it('prorates when T1 is N/A (T2 late-enrollee)', () => {
    // weightedSum = 80×0.2 + 85×0.2 + 90×0.4 = 16+17+36 = 69
    // weightSum = 0.8
    // result = 69/0.8 = 86.25
    const result = computeAnnualGrade(null, 80, 85, 90, [
      true,
      false,
      false,
      false,
    ]);
    expect(result).toBe(86.25);
  });

  it('prorates when T1 and T2 are N/A (T3 late-enrollee)', () => {
    // weightedSum = 80×0.2 + 90×0.4 = 16+36 = 52
    // weightSum = 0.6
    // result = 52/0.6 = 86.6666... → Math.round × 100 / 100 = 86.67
    const result = computeAnnualGrade(null, null, 80, 90, [
      true,
      true,
      false,
      false,
    ]);
    expect(result).toBe(86.67);
  });

  it('returns null when all four terms are N/A', () => {
    const result = computeAnnualGrade(null, null, null, null, [
      true,
      true,
      true,
      true,
    ]);
    expect(result).toBeNull();
  });

  it('still returns null when a non-N/A term is missing even with some naFlags', () => {
    // T3 is null with no naFlag — that is genuinely incomplete.
    const result = computeAnnualGrade(null, 80, null, 90, [
      true,
      false,
      false, // T3 not flagged N/A — so null T3 = incomplete
      false,
    ]);
    expect(result).toBeNull();
  });
});

describe('computeGeneralAverage', () => {
  // ── 1dp rounding (KD #95 — regression guard for 2dp drift) ──────────────
  it('rounds to 1 decimal place', () => {
    // 92.6+91.4+95.5+88.5+99.4 = 467.4 / 5 = 93.48 → 93.5 (1dp)
    expect(computeGeneralAverage([92.6, 91.4, 95.5, 88.5, 99.4])).toBe(93.5);
  });

  it('returns an integer result when the average is a whole number', () => {
    expect(computeGeneralAverage([90, 85, 80])).toBe(85);
  });

  it('returns null when any subject grade is null (incomplete year)', () => {
    expect(computeGeneralAverage([90, null, 80])).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(computeGeneralAverage([])).toBeNull();
  });

  it('does not produce 2dp output (regression guard for KD #95 fix)', () => {
    const result = computeGeneralAverage([91.1, 92.2, 93.3]);
    // 91.1+92.2+93.3 = 276.6 / 3 = 92.2
    expect(result).toBe(92.2);
    // Verify it's 1dp — no trailing digits
    if (result !== null) {
      expect(result.toString()).toMatch(/^\d+(\.\d)?$/);
    }
  });
});

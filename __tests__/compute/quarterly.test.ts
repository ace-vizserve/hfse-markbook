import { describe, expect, it } from 'vitest';
import { type ComputeInput, computeQuarterly } from '@/lib/compute/quarterly';

// Shared weights matching HFSE's two profiles (KD #4).
const PRIMARY: Pick<ComputeInput, 'ww_weight' | 'pt_weight' | 'qa_weight'> = {
  ww_weight: 0.4,
  pt_weight: 0.4,
  qa_weight: 0.2,
};
const SECONDARY: Pick<ComputeInput, 'ww_weight' | 'pt_weight' | 'qa_weight'> = {
  ww_weight: 0.3,
  pt_weight: 0.5,
  qa_weight: 0.2,
};

describe('computeQuarterly', () => {
  // ── Hard Rule #1 canonical case ─────────────────────────────────────────
  it('returns 93 for the canonical HFSE test case (Hard Rule #1)', () => {
    const result = computeQuarterly({
      ww_scores: [10, 10],
      ww_totals: [10, 10],
      pt_scores: [6, 10, 10],
      pt_totals: [10, 10, 10],
      qa_score: 22,
      qa_total: 30,
      ...PRIMARY,
    });
    expect(result.quarterly_grade).toBe(93);
  });

  // ── Hard Rule #3: Blank ≠ Zero ───────────────────────────────────────────
  it('excludes null score slots from WW numerator and denominator', () => {
    // Slot 1: null (excluded). Slot 2: 10/10 (included).
    // WW_PS = 10/10 * 100 = 100, not 10/20 * 100 = 50.
    const withNull = computeQuarterly({
      ww_scores: [null, 10],
      ww_totals: [10, 10],
      pt_scores: [10, 10],
      pt_totals: [10, 10],
      qa_score: 30,
      qa_total: 30,
      ...PRIMARY,
    });
    const withoutSlot = computeQuarterly({
      ww_scores: [10],
      ww_totals: [10],
      pt_scores: [10, 10],
      pt_totals: [10, 10],
      qa_score: 30,
      qa_total: 30,
      ...PRIMARY,
    });
    expect(withNull.ww_ps).toBe(withoutSlot.ww_ps);
    expect(withNull.quarterly_grade).toBe(withoutSlot.quarterly_grade);
  });

  it('includes zero score in WW numerator and denominator (zero ≠ blank)', () => {
    // Slot 1: 0/10. ww_ps = 0/10 * 100 = 0, not excluded.
    const result = computeQuarterly({
      ww_scores: [0],
      ww_totals: [10],
      pt_scores: [10],
      pt_totals: [10],
      qa_score: 30,
      qa_total: 30,
      ...PRIMARY,
    });
    expect(result.ww_ps).toBe(0);
    expect(result.quarterly_grade).not.toBeNull();
  });

  // ── All null → null grade ────────────────────────────────────────────────
  it('returns null quarterly_grade when all scores are null', () => {
    const result = computeQuarterly({
      ww_scores: [null, null],
      ww_totals: [10, 10],
      pt_scores: [null, null, null],
      pt_totals: [10, 10, 10],
      qa_score: null,
      qa_total: 30,
      ...PRIMARY,
    });
    expect(result.quarterly_grade).toBeNull();
    expect(result.initial_grade).toBeNull();
  });

  // ── All zero scores → computed grade ────────────────────────────────────
  it('returns a computed (non-null) grade when all scores are zero', () => {
    const result = computeQuarterly({
      ww_scores: [0, 0],
      ww_totals: [10, 10],
      pt_scores: [0, 0, 0],
      pt_totals: [10, 10, 10],
      qa_score: 0,
      qa_total: 30,
      ...PRIMARY,
    });
    // initial = 0; transmute(0) = floor(60 + 0) = 60
    expect(result.quarterly_grade).toBe(60);
  });

  // ── Weight profiles produce different results for identical raw scores ───
  it('primary and secondary weights produce different grades for the same raw scores', () => {
    const base = {
      ww_scores: [7, 8],
      ww_totals: [10, 10],
      pt_scores: [6, 7, 8],
      pt_totals: [10, 10, 10],
      qa_score: 20,
      qa_total: 30,
    };
    const primary = computeQuarterly({ ...base, ...PRIMARY });
    const secondary = computeQuarterly({ ...base, ...SECONDARY });
    expect(primary.quarterly_grade).not.toBe(secondary.quarterly_grade);
  });

  // ── QA max variation (KD #99) ────────────────────────────────────────────
  it('produces a different quarterly grade when qa_total changes from 30 to 50', () => {
    const base = {
      ww_scores: [10],
      ww_totals: [10],
      pt_scores: [10],
      pt_totals: [10],
      ...PRIMARY,
    };
    // Same raw score of 22, different denominators.
    const qa30 = computeQuarterly({ ...base, qa_score: 22, qa_total: 30 });
    const qa50 = computeQuarterly({ ...base, qa_score: 22, qa_total: 50 });
    expect(qa30.qa_ps).not.toBe(qa50.qa_ps);
    expect(qa30.quarterly_grade).not.toBe(qa50.quarterly_grade);
  });

  // ── Full 5-slot arrays (KD #5 max) ──────────────────────────────────────
  it('handles the maximum 5 WW and 5 PT slots', () => {
    const result = computeQuarterly({
      ww_scores: [10, 10, 10, 10, 10],
      ww_totals: [10, 10, 10, 10, 10],
      pt_scores: [10, 10, 10, 10, 10],
      pt_totals: [10, 10, 10, 10, 10],
      qa_score: 30,
      qa_total: 30,
      ...PRIMARY,
    });
    expect(result.quarterly_grade).toBe(100);
  });
});

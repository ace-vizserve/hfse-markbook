import { describe, expect, it } from 'vitest';
import {
  numericToLetter,
  resolveNonExaminableLetter,
} from '@/lib/compute/letter-grade';

describe('numericToLetter', () => {
  // ── Grade band boundaries ────────────────────────────────────────────────
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89, 'B'],
    [85, 'B'],
    [84, 'C'],
    [80, 'C'],
    [79, 'IP'],
    [0, 'IP'],
  ] as const)('quarterly %s → %s', (quarterly, expected) => {
    expect(numericToLetter(quarterly)).toBe(expected);
  });

  it('89.9 maps to B (not A)', () => {
    expect(numericToLetter(89.9)).toBe('B');
  });

  it('90.0 maps to A', () => {
    expect(numericToLetter(90.0)).toBe('A');
  });

  it('84.9 maps to C (not B)', () => {
    expect(numericToLetter(84.9)).toBe('C');
  });

  it('85.0 maps to B', () => {
    expect(numericToLetter(85.0)).toBe('B');
  });
});

describe('resolveNonExaminableLetter', () => {
  // ── Precedence: is_na → letterOverride → derived → null ─────────────────
  it('returns NA when isNa is true regardless of other fields', () => {
    expect(
      resolveNonExaminableLetter({
        isNa: true,
        letterOverride: 'UG',
        quarterly: 95,
      })
    ).toBe('NA');
  });

  it('returns the override code when letterOverride is set and isNa is false', () => {
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: 'UG',
        quarterly: 95,
      })
    ).toBe('UG');
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: 'INC',
        quarterly: 95,
      })
    ).toBe('INC');
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: 'CO',
        quarterly: 95,
      })
    ).toBe('CO');
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: 'E',
        quarterly: 95,
      })
    ).toBe('E');
  });

  it('derives the letter from quarterly when no override and isNa is false', () => {
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: null,
        quarterly: 92,
      })
    ).toBe('A');
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: null,
        quarterly: 87,
      })
    ).toBe('B');
  });

  it('returns null when isNa is false, no override, and quarterly is null', () => {
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: null,
        quarterly: null,
      })
    ).toBeNull();
  });

  it('override takes precedence over derived letter (override beats quarterly)', () => {
    // quarterly would derive 'A' but the override is 'INC'
    expect(
      resolveNonExaminableLetter({
        isNa: false,
        letterOverride: 'INC',
        quarterly: 95,
      })
    ).toBe('INC');
  });
});

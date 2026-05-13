// Per-topic 1–5 proficiency rating registry for Evaluation Checklists.
//
// Replaces the binary is_checked UX (migration 046). The Excel form
// teachers use today already grades each topic on this 5-point scale —
// the SIS just digitises it.
//
// Token classes are written as exact literal strings so Tailwind's
// static analyzer keeps them in the build. Don't compose dynamically.

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export type RatingMeta = {
  /** 1–5 numeric value stored in the DB. */
  value: RatingValue;
  /** Short one-word label (e.g. "Excellent"). */
  label: string;
  /** Plain-English description of the proficiency level. */
  description: string;
  /** Exact Tailwind class string for the selected/active pill fill. */
  swatchClassName: string;
  /** Exact Tailwind class string for the unselected pill ring. */
  ringClassName: string;
  /** Exact Tailwind class string for the active pill's text. */
  textClassName: string;
};

// Order: 1 (weakest) → 5 (strongest). Visual gradient walks from the
// destructive red through amber → sky → mint, matching the §9.3 status
// palette philosophy (destructive = needs work, mint = healthy).
export const RATINGS: readonly RatingMeta[] = [
  {
    value: 1,
    label: 'Needs Improvement',
    description: 'Rarely demonstrates proficiency',
    swatchClassName:
      'bg-gradient-to-b from-destructive to-destructive/40 text-destructive-foreground shadow-button',
    ringClassName: 'ring-1 ring-inset ring-destructive/40 text-destructive',
    textClassName: 'text-destructive-foreground',
  },
  {
    value: 2,
    label: 'Developing',
    description: 'Occasionally demonstrates proficiency',
    swatchClassName:
      'bg-gradient-to-b from-brand-amber to-brand-amber/40 text-brand-navy shadow-button',
    ringClassName: 'ring-1 ring-inset ring-brand-amber/50 text-brand-amber',
    textClassName: 'text-brand-navy',
  },
  {
    value: 3,
    label: 'Satisfactory',
    description: 'Sometimes demonstrates proficiency',
    swatchClassName:
      'bg-gradient-to-b from-brand-sky to-brand-sky/40 text-brand-navy shadow-button',
    ringClassName: 'ring-1 ring-inset ring-brand-sky/50 text-brand-sky',
    textClassName: 'text-brand-navy',
  },
  {
    value: 4,
    label: 'Good',
    description: 'Frequently demonstrates proficiency',
    swatchClassName:
      'bg-gradient-to-b from-brand-indigo to-brand-indigo/40 text-primary-foreground shadow-button',
    ringClassName: 'ring-1 ring-inset ring-brand-indigo/50 text-brand-indigo',
    textClassName: 'text-primary-foreground',
  },
  {
    value: 5,
    label: 'Excellent',
    description: 'Consistently demonstrates strong proficiency',
    swatchClassName:
      'bg-gradient-to-b from-brand-mint to-brand-mint/40 text-brand-navy shadow-button',
    ringClassName: 'ring-1 ring-inset ring-brand-mint/50 text-brand-mint',
    textClassName: 'text-brand-navy',
  },
] as const;

export const RATING_BY_VALUE: ReadonlyMap<RatingValue, RatingMeta> = new Map(
  RATINGS.map((r) => [r.value, r]),
);

// Narrow type-guard for raw values arriving from the wire.
export function isRatingValue(n: unknown): n is RatingValue {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 5
  );
}

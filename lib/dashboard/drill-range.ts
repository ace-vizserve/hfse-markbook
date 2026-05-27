// Shared drill-range filter — single source of truth across modules.
//
// Each module's drill loader (lib/<module>/drill.ts) used to carry its own
// `applyScopeFilter` with the same boilerplate guard. Since the in-drill
// scope toggle was removed (page-level date picker is the single source of
// truth), this helper just clamps to [from, to] when both are provided and
// falls back to AY-wide otherwise.
//
// `includeMissingDate` controls per-module preference for rows whose
// date column is null:
//   true  (default) — include them (drafts, in-progress, never-submitted)
//   false           — exclude them (admissions: an application without an
//                                   applicationDate is malformed)

export type DrillRangeFilter = {
  from?: string | null;
  to?: string | null;
};

type Options = {
  /** Include rows whose `dateAccessor` returns null/empty. Default: true. */
  includeMissingDate?: boolean;
  /**
   * Optional label (currently unused; kept for call-site readability and
   * future trace logging).
   */
  caller?: string;
};

export function applyDateRangeFilter<T>(
  rows: T[],
  input: DrillRangeFilter,
  dateAccessor: (row: T) => string | null | undefined,
  options: Options = {}
): T[] {
  const { includeMissingDate = true } = options;

  const from = input.from;
  const to = input.to;
  if (!from || !to) {
    // Without an explicit range, return rows unfiltered. They're already
    // AY-scoped at load time, so this matches "Current AY" semantics.
    return rows;
  }

  return rows.filter((row) => {
    const raw = dateAccessor(row);
    if (!raw) return includeMissingDate;
    const d = raw.slice(0, 10);
    return d >= from && d <= to;
  });
}

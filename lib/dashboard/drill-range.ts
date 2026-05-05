// Shared drill-range filter — single source of truth across modules.
//
// Each module's drill loader (lib/<module>/drill.ts) used to carry its own
// `applyScopeFilter` with the same boilerplate guard:
//
//   if (input.scope !== 'range' || !input.from || !input.to) return rows;
//   return rows.filter(/* per-module date check */);
//
// The four copies drifted in subtle ways (some included rows missing a
// date, some excluded; some looked at attendanceDate vs date vs
// submittedAt). This helper consolidates the guard and the filter while
// keeping the per-module date accessor + per-module include/exclude
// semantics under explicit control.
//
// Behaviour contract:
//
//   scope='range' + valid from/to    → filter rows where dateAccessor(row) ∈ [from, to]
//   scope='range' + missing from/to  → warn + return rows unfiltered (rows are
//                                       already AY-scoped at load time, so this
//                                       matches "Current AY" semantics)
//   scope='ay'  / 'all'              → return rows unfiltered (rows are AY-scoped)
//
// `includeMissingDate` controls per-module preference for rows whose
// date column is null:
//   true  (default) — include them (drafts, in-progress, never-submitted)
//   false           — exclude them (admissions: an application without an
//                                   applicationDate is malformed)

export type DrillScope = 'range' | 'ay' | 'all';

export type DrillRangeFilter = {
  scope: DrillScope;
  from?: string | null;
  to?: string | null;
};

type Options = {
  /** Include rows whose `dateAccessor` returns null/empty. Default: true. */
  includeMissingDate?: boolean;
  /**
   * Optional label for the warn-log when scope='range' but range params
   * are missing — helps trace which module triggered the fallback.
   */
  caller?: string;
};

export function applyDateRangeFilter<T>(
  rows: T[],
  input: DrillRangeFilter,
  dateAccessor: (row: T) => string | null | undefined,
  options: Options = {},
): T[] {
  const { includeMissingDate = true, caller = 'drill' } = options;

  if (input.scope !== 'range') return rows;

  const from = input.from;
  const to = input.to;
  if (!from || !to) {
    // Mismatch surface: the caller asked for a date-range filter but the
    // range itself was not supplied. Falling back to AY-wide is the
    // historical behaviour; the warning surfaces the mismatch so the
    // calling page/component can be fixed if it's accidentally dropping
    // params.
    console.warn(
      `[${caller}] applyDateRangeFilter received scope='range' without from/to — falling back to AY-wide. ` +
        `Pass scope='ay' explicitly when no range is intended.`,
    );
    return rows;
  }

  return rows.filter((row) => {
    const raw = dateAccessor(row);
    if (!raw) return includeMissingDate;
    const d = raw.slice(0, 10);
    return d >= from && d <= to;
  });
}

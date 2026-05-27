import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@/lib/supabase/service';
import type { DateRange } from './range';

/**
 * Compare-mode primitives — types, URL parser, cell builder.
 *
 * Pure (no Supabase) URL parsing; database access only inside
 * `buildCompareCells` for term-window resolution. Consumed by per-module
 * compare RSCs (`/markbook/compare`, `/admissions/compare`, etc.).
 */

/**
 * Compare-mode input. `kind` decides whether cells are term-numbered
 * (academic modules) or month-string (flexible modules). The picker UI
 * enforces the correct kind per route.
 */
export type CompareInput =
  | { kind: 'term'; ays: string[]; terms: number[] }
  | { kind: 'month'; ays: string[]; months: string[] };

/** A single (AY × term-or-month) intersection — what gets rendered in one cell. */
export type CompareCell = {
  ayCode: string;
  /** Display label e.g. "AY9999 · T1" or "AY9999 · Apr 2026". */
  label: string;
  range: DateRange;
  kind: 'term' | 'month';
  termNumber?: number;
  month?: string;
};

export type CompareCellResult<T> = {
  cell: CompareCell;
  data: T;
};

export type CompareResult<T> = {
  cells: CompareCellResult<T>[];
};

/**
 * URL → CompareInput. Returns null on malformed input so the page can
 * render an empty-state prompt.
 */
export function parseCompareParams(params: {
  ays?: string | string[];
  terms?: string | string[];
  months?: string | string[];
}): CompareInput | null {
  const pickStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const aysRaw = pickStr(params.ays);
  if (!aysRaw) return null;
  const ays = aysRaw.split(',').filter((c) => /^AY\d{4}$/.test(c));
  if (ays.length === 0) return null;

  const termsRaw = pickStr(params.terms);
  const monthsRaw = pickStr(params.months);

  if (termsRaw) {
    const terms = termsRaw
      .split(',')
      .map((t) => Number(t.replace(/^T/i, '')))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
    if (terms.length === 0) return null;
    return { kind: 'term', ays, terms };
  }

  if (monthsRaw) {
    const months = monthsRaw.split(',').filter((m) => /^\d{4}-\d{2}$/.test(m));
    if (months.length === 0) return null;
    return { kind: 'month', ays, months };
  }

  return null;
}

/**
 * CompareInput → CompareCell[]. Resolves each (ayCode × term-or-month) to
 * an actual DateRange. Term ranges come from a single cross-AY terms query;
 * month ranges are first-of-month to last-of-month arithmetic (no DB call
 * needed).
 */
export async function buildCompareCells(
  input: CompareInput,
  service?: SupabaseClient
): Promise<CompareCell[]> {
  if (input.kind === 'month') {
    const cells: CompareCell[] = [];
    for (const ay of input.ays) {
      for (const m of input.months) {
        cells.push({
          ayCode: ay,
          label: `${ay} · ${formatMonthLabel(m)}`,
          range: monthToRange(m),
          kind: 'month',
          month: m,
        });
      }
    }
    return cells;
  }

  // Term-kind: pull all relevant terms in one cross-AY query.
  const supabase = service ?? createServiceClient();
  const { data: termsData } = await supabase
    .from('terms')
    .select('term_number, start_date, end_date, academic_years!inner(ay_code)')
    .in('academic_years.ay_code', input.ays);
  type Row = {
    term_number: number;
    start_date: string | null;
    end_date: string | null;
    academic_years: { ay_code: string } | { ay_code: string }[];
  };
  const termsByAy = new Map<string, Map<number, DateRange>>();
  for (const row of (termsData ?? []) as Row[]) {
    if (!row.start_date || !row.end_date) continue;
    const ay = Array.isArray(row.academic_years)
      ? row.academic_years[0]
      : row.academic_years;
    if (!ay?.ay_code) continue;
    if (!termsByAy.has(ay.ay_code)) termsByAy.set(ay.ay_code, new Map());
    termsByAy.get(ay.ay_code)!.set(row.term_number, {
      from: row.start_date,
      to: row.end_date,
    });
  }

  const cells: CompareCell[] = [];
  for (const ay of input.ays) {
    const ayTerms = termsByAy.get(ay);
    for (const t of input.terms) {
      const range = ayTerms?.get(t);
      if (!range) continue;
      cells.push({
        ayCode: ay,
        label: `${ay} · T${t}`,
        range,
        kind: 'term',
        termNumber: t,
      });
    }
  }
  return cells;
}

function monthToRange(month: string): DateRange {
  // 'YYYY-MM' → first to last day of that month
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
  };
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
}

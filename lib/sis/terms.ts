import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@/lib/supabase/service';

// Resolved term info for a given date in an AY.
export type TermInfo = { termNumber: number; termLabel: string };

// Single-date term lookup. Returns the term whose [start_date, end_date]
// window contains the given date, or null when the date falls outside any
// defined term window (e.g. between T2 and T3 break, or before T1 starts).
//
// Pass a service-role supabase client when caching with `unstable_cache`
// (cookie-scoped clients can't run inside cache wrappers per Next 16 — see
// `lib/dashboard/windows.ts` for prior art). When called outside a cache
// wrapper, the helper creates its own service client.
export async function getTermForDate(
  date: string,
  ayCode: string,
  service?: SupabaseClient,
): Promise<TermInfo | null> {
  const supabase = service ?? createServiceClient();
  const { data: ayRow, error: ayErr } = await supabase
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (ayErr || !ayRow) return null;
  const ayId = (ayRow as { id: string }).id;

  const { data: termRows, error: termErr } = await supabase
    .from('terms')
    .select('term_number, start_date, end_date')
    .eq('academic_year_id', ayId);
  if (termErr || !termRows) return null;

  const match = (termRows as Array<{
    term_number: number;
    start_date: string | null;
    end_date: string | null;
  }>).find((t) => t.start_date && t.end_date && t.start_date <= date && t.end_date >= date);
  if (!match) return null;
  return { termNumber: match.term_number, termLabel: `T${match.term_number}` };
}

// Bulk variant — preloads every term in every named AY so callers can do
// many date lookups in memory. Useful for the cross-AY records placement
// table where each placement is a different AY.
export async function preloadTermsForAYs(
  ayCodes: string[],
  service?: SupabaseClient,
): Promise<Map<string, Array<{ termNumber: number; startDate: string; endDate: string }>>> {
  const out = new Map<string, Array<{ termNumber: number; startDate: string; endDate: string }>>();
  if (ayCodes.length === 0) return out;

  const supabase = service ?? createServiceClient();
  const { data, error } = await supabase
    .from('terms')
    .select('term_number, start_date, end_date, academic_years!inner(ay_code)')
    .in('academic_years.ay_code', ayCodes);
  if (error || !data) return out;

  type Row = {
    term_number: number;
    start_date: string | null;
    end_date: string | null;
    academic_years: { ay_code: string } | { ay_code: string }[];
  };
  for (const row of data as Row[]) {
    if (!row.start_date || !row.end_date) continue;
    const ay = Array.isArray(row.academic_years) ? row.academic_years[0] : row.academic_years;
    if (!ay?.ay_code) continue;
    const arr = out.get(ay.ay_code) ?? [];
    arr.push({
      termNumber: row.term_number,
      startDate: row.start_date,
      endDate: row.end_date,
    });
    out.set(ay.ay_code, arr);
  }
  return out;
}

// Synchronous lookup against a preloaded map.
export function termForDateInPreloaded(
  date: string,
  ayCode: string,
  preloaded: Map<string, Array<{ termNumber: number; startDate: string; endDate: string }>>,
): TermInfo | null {
  const terms = preloaded.get(ayCode);
  if (!terms) return null;
  const match = terms.find((t) => t.startDate <= date && t.endDate >= date);
  if (!match) return null;
  return { termNumber: match.termNumber, termLabel: `T${match.termNumber}` };
}

import type { SupabaseClient } from '@supabase/supabase-js';

// Single source of truth for "which academic year are we currently in?"
// Reads from `public.academic_years` where `is_current = true`.
//
// Why this exists: multiple call sites (parent lookup, student sync,
// admissions queries) used to hardcode `'AY2026'`. That breaks the moment
// Joann flips the `is_current` flag to AY2027. Everything that needs to
// know the current year reads it through this helper instead.
//
// All admissions tables (`ay{YY}_enrolment_applications`, `_status`,
// `_documents`) share the same column definitions from AY2026 onward
// (see `docs/context/10-parent-portal.md`), so the only thing that changes
// year-to-year is the table name prefix, derived from `ay_code`.

export type CurrentAcademicYear = {
  id: string;
  ay_code: string;    // e.g. "AY2026"
  label: string;      // e.g. "Academic Year 2025-2026"
};

export async function getCurrentAcademicYear(
  client: SupabaseClient,
): Promise<CurrentAcademicYear | null> {
  const { data, error } = await client
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('is_current', true)
    .maybeSingle();
  if (error) {
    console.error('[academic-year] current lookup failed:', error.message);
    return null;
  }
  return (data as CurrentAcademicYear | null) ?? null;
}

// Convenience wrapper when the caller only needs the code and wants to
// fail loudly if there is no current year. Throws with a descriptive
// message suitable for a 500 response body.
export async function requireCurrentAyCode(client: SupabaseClient): Promise<string> {
  const ay = await getCurrentAcademicYear(client);
  if (!ay) {
    throw new Error(
      'No current academic year set. Ask the registrar to set is_current=true on one academic_years row.',
    );
  }
  return ay.ay_code;
}

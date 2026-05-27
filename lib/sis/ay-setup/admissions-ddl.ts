// TypeScript-side mirror of the AY-prefixed admissions DDL templates.
//
// **This file is documentation, not runtime code.** The actual DDL runs
// from the Postgres functions in `supabase/migrations/012_ay_setup_helpers.sql`
// via `rpc('create_ay_admissions_tables', ...)` / `rpc('drop_ay_admissions_tables', ...)`.
// We keep this TS mirror so that:
//
//   1. Developers can read the schema without opening the .sql file.
//   2. When the parent portal bumps the admissions schema (per the
//      coordination rule in `docs/context/18-ay-setup.md`), you update
//      both the TS template here AND the function body in the migration
//      in a single PR. The canonical source of truth remains
//      `docs/context/10-parent-portal.md` §"Reference DDL".
//
// Schema changes are not auto-detected. If drift happens between this
// file and the DB function body, existing AYs are unaffected (the function
// runs against the function body, not this file), but new-AY tables will
// silently use whichever version the DB function has. Audit them if in doubt.

/**
 * Given an AY code like "AY2027", returns the slug prefix used in the
 * admissions table names (e.g. "ay2027"). Matches the Postgres-function
 * slug derivation in `create_academic_year` / `delete_academic_year`.
 */
export function ayCodeToSlug(ayCode: string): string {
  const m = ayCode
    .trim()
    .toUpperCase()
    .match(/^AY(\d{4})$/);
  if (!m) throw new Error(`Invalid AY code: ${ayCode}`);
  return `ay${m[1]}`;
}

// NOTE: The authoritative DDL definitions live in:
//   - `supabase/migrations/012_ay_setup_helpers.sql` — runnable source
//   - `docs/context/10-parent-portal.md` §"Reference DDL" — canonical spec
// This module exports only the slug helper; callers that need the full DDL
// should read one of the two sources above.

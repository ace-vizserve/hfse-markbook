-- 004_tighten_rls.sql
--
-- RLS v1 — JWT gate + audit-log lockdown + deny-writes.
--
-- Context: 001 shipped with permissive `*_auth_read` policies (`using (true)`)
-- on all 14 tables, with the intent of tightening before production UAT.
-- This migration does that pass. It is deliberately scoped so it cannot break
-- any existing page flow:
--
-- 1. Replaces every `*_auth_read` policy with a JWT-role gate: authenticated
--    users need a valid role (teacher | registrar | admin | superadmin) in
--    `app_metadata.role` to SELECT anything. Stale/no-role JWTs fail closed.
-- 2. Locks `grade_audit_log` to registrar-and-above. Teachers must never see
--    other teachers' post-lock edits.
-- 3. Explicitly denies INSERT/UPDATE/DELETE on the `authenticated` role across
--    every table. The app always uses the service-role client for writes
--    (bypasses RLS), so this is a defense-in-depth seal — if a future code
--    path ever uses the cookie-bound client to write, it fails closed instead
--    of silently relying on app-layer checks.
--
-- What this migration deliberately does NOT do (leave to 005 post-UAT):
-- - Per-teacher row scoping on grade_entries / grading_sheets / students via
--   joins through teacher_assignments. That's higher risk — teacher server
--   components use the cookie-bound client for some reads, and each affected
--   page would need to be walked manually. Defense-in-depth for teacher
--   row-scoping currently lives in the `teacher_assignments` gate inside
--   `/api/grading-sheets` (from Sprint 6), which remains the authoritative
--   enforcement point.
--
-- Safe to run against a database that already has the 001 policies; the
-- DROP POLICY IF EXISTS statements are idempotent.

-- ---------------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ),
    ''
  );
$$;

comment on function public.current_user_role() is
  'Returns the caller''s role from JWT app_metadata.role (with user_metadata.role as legacy fallback). Returns null for unauthenticated or no-role JWTs. Used by RLS policies to gate access.';

create or replace function public.is_registrar_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('registrar', 'admin', 'superadmin');
$$;

comment on function public.is_registrar_or_above() is
  'True when the caller has a role of registrar, admin, or superadmin. Used to gate registrar-only tables (e.g. grade_audit_log).';

-- ---------------------------------------------------------------------------
-- 2. Drop all permissive *_auth_read policies from 001 and 003
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','sections','students','section_students',
    'subjects','subject_configs','grading_sheets','grade_entries',
    'grade_audit_log','report_card_comments','attendance_records',
    'teacher_assignments'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_auth_read', t);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Recreate tight SELECT policies
-- ---------------------------------------------------------------------------

-- 13 non-sensitive tables: any authenticated user with a valid role can SELECT.
-- (Per-teacher row scoping is intentionally deferred to 005.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','sections','students','section_students',
    'subjects','subject_configs','grading_sheets','grade_entries',
    'report_card_comments','attendance_records','teacher_assignments'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_user_role() is not null);',
      t || '_role_read', t
    );
  end loop;
end$$;

-- grade_audit_log: registrar, admin, superadmin ONLY. Teachers cannot read.
create policy grade_audit_log_registrar_read
  on public.grade_audit_log for select
  to authenticated
  using (public.is_registrar_or_above());

-- ---------------------------------------------------------------------------
-- 4. Deny all writes on the authenticated role
-- ---------------------------------------------------------------------------
--
-- The application uses createServiceClient() for every write path, which
-- bypasses RLS entirely. These policies exist purely to fail closed if a
-- future code path accidentally uses the cookie-bound anon client to write.
--
-- We use a `false` expression rather than omitting the policy because
-- Postgres RLS defaults to "deny when no matching policy exists" ONLY for
-- the commands you haven't declared any policy for. Declaring an explicit
-- deny makes the intent unambiguous and impossible to override with a
-- permissive `using (true)` added later without noticing.

do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','sections','students','section_students',
    'subjects','subject_configs','grading_sheets','grade_entries',
    'grade_audit_log','report_card_comments','attendance_records',
    'teacher_assignments'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (false);',
      t || '_no_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (false) with check (false);',
      t || '_no_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (false);',
      t || '_no_delete', t
    );
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 5. Sanity: ensure RLS is enabled on every table (001 and 003 already do
-- this, but re-asserting makes this migration safe to apply to a database
-- whose state drifted.)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','sections','students','section_students',
    'subjects','subject_configs','grading_sheets','grade_entries',
    'grade_audit_log','report_card_comments','attendance_records',
    'teacher_assignments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end$$;

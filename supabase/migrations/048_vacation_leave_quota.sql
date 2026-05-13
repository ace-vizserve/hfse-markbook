-- 048_vacation_leave_quota.sql
--
-- KD #94 — Vacation leave subtype + per-term quotas + configurable defaults.
--
-- HFSE policy (verified from the registrar's T1 attendance workbook): every
-- student gets 1 vacation leave per term (4 per year) on top of the existing
-- 5-day urgent/compassionate leave per year. The workbook records subtype as
-- a free-text Excel cell comment ("1 VL approved", "MC submitted", etc.);
-- this migration moves the distinction into a structured field.
--
-- Changes:
--
-- 1. `attendance_daily.ex_reason` check constraint widened to include
--    `'vacation'`. Subtype semantics stay the same — only the enum grows.
--
-- 2. `students.vacation_leave_allowance_per_term` (nullable smallint) added
--    as the per-student override. NULL = use school default (the cleaner
--    model we're moving toward; `urgent_compassionate_allowance` stays as
--    `NOT NULL DEFAULT 5` to avoid a breaking change in this pass).
--
-- 3. `school_config` gains two typed columns: `default_vl_allowance_per_term`
--    (default 1) and `default_compassionate_allowance_per_year` (default 5).
--    These are the new source of truth for school-wide defaults; the student
--    columns are overrides on top.
--
-- 4. Partial index on `attendance_daily (section_student_id, term_id)` where
--    `ex_reason='vacation'` for fast per-term quota queries.
--
-- Apply after 047. Safe to re-run.

-- =====================================================================
-- 1. attendance_daily.ex_reason: widen check constraint
-- =====================================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'attendance_daily_ex_reason_chk'
      and conrelid = 'public.attendance_daily'::regclass
  ) then
    alter table public.attendance_daily drop constraint attendance_daily_ex_reason_chk;
  end if;
end $$;

alter table public.attendance_daily
  add constraint attendance_daily_ex_reason_chk
  check (
    ex_reason is null
    or ex_reason in ('mc', 'compassionate', 'school_activity', 'vacation')
  );

comment on column public.attendance_daily.ex_reason is
  'Optional EX subtype: mc | compassionate | school_activity | vacation. ''compassionate'' consumes the student''s urgent_compassionate_allowance (per AY); ''vacation'' consumes vacation_leave_allowance_per_term (per term).';

-- =====================================================================
-- 2. students.vacation_leave_allowance_per_term — nullable override
-- =====================================================================
--
-- NULL = use school_config.default_vl_allowance_per_term. The app layer
-- (lib/attendance/queries.ts::getVacationLeaveUsage) does the fallback.

alter table public.students
  add column if not exists vacation_leave_allowance_per_term smallint
  check (
    vacation_leave_allowance_per_term is null
    or (vacation_leave_allowance_per_term >= 0
        and vacation_leave_allowance_per_term <= 10)
  );

comment on column public.students.vacation_leave_allowance_per_term is
  'Per-term vacation-leave quota override. NULL = use school_config.default_vl_allowance_per_term (HFSE default: 1).';

-- =====================================================================
-- 3. school_config: per-school quota defaults
-- =====================================================================

alter table public.school_config
  add column if not exists default_compassionate_allowance_per_year smallint
    not null default 5
    check (default_compassionate_allowance_per_year between 0 and 30);

alter table public.school_config
  add column if not exists default_vl_allowance_per_term smallint
    not null default 1
    check (default_vl_allowance_per_term between 0 and 10);

comment on column public.school_config.default_compassionate_allowance_per_year is
  'School-wide default for urgent/compassionate leave days per academic year. Students can be overridden via students.urgent_compassionate_allowance. HFSE policy: 5.';

comment on column public.school_config.default_vl_allowance_per_term is
  'School-wide default for vacation leave days per term. Students can be overridden via students.vacation_leave_allowance_per_term. HFSE policy: 1 per term (4 per year).';

-- =====================================================================
-- 4. Partial index for vacation-leave per-term quota counter
-- =====================================================================
--
-- VL quota is per-term (not per-AY like compassionate), so this index keys
-- on (section_student_id, term_id) — the two columns every quota lookup
-- filters on.

create index if not exists attendance_daily_vacation_idx
  on public.attendance_daily (section_student_id, term_id)
  where ex_reason = 'vacation';

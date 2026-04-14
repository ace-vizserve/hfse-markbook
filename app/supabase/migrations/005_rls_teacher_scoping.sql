-- 005_rls_teacher_scoping.sql
--
-- RLS v2 — per-teacher row scoping on grade/student tables.
--
-- Builds on 004. Replaces the broad `*_role_read` policies (any-role-can-read)
-- with policies that restrict teachers to the sections they're assigned to:
--
-- - `subject_teacher` on (section × subject) → reads that sheet + its entries
-- - `form_adviser` on (section)              → reads every sheet in that section
--                                               + advisory comments + attendance
--
-- Registrar, admin, superadmin continue to read everything (single bypass
-- clause at the top of each policy via `public.is_registrar_or_above()`).
--
-- Tables left permissive-by-role (reference data, no PII):
--   academic_years, terms, levels, subjects, subject_configs, sections
-- Teachers legitimately need these for UI dropdowns and navigation chrome.
--
-- Writes remain blocked on the `authenticated` role (004 denies them all
-- with `with check (false)`); the app uses the service-role client for
-- every write path. Nothing in this migration changes that.
--
-- APPLY AFTER 004. Safe to re-run — all DROP POLICY statements are idempotent
-- and all helpers use CREATE OR REPLACE.
--
-- Risk note: these policies add subquery joins to every teacher-side read.
-- At current volume (~90 students × 4 terms × ~12 subjects) the planner picks
-- index scans on `teacher_assignments_by_user` and the cost is negligible.
-- If query plans regress at higher volume, add a partial index on
-- `teacher_assignments (teacher_user_id, section_id)` — but don't add it
-- pre-emptively.

-- ---------------------------------------------------------------------------
-- 1. Teacher-scoping helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher_for_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_assignments
    where section_id = p_section_id
      and teacher_user_id = auth.uid()
  );
$$;

comment on function public.is_teacher_for_section(uuid) is
  'True when the caller has ANY teacher_assignments row for the given section (subject teacher or form adviser). Used to gate reads of section-level data.';

create or replace function public.is_adviser_for_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_assignments
    where section_id = p_section_id
      and teacher_user_id = auth.uid()
      and role = 'form_adviser'
  );
$$;

comment on function public.is_adviser_for_section(uuid) is
  'True when the caller is the form class adviser for the given section. Used to gate reads of advisory-only data (comments, attendance).';

create or replace function public.is_teacher_for_sheet(p_sheet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.grading_sheets gs
    join public.teacher_assignments ta
      on ta.section_id = gs.section_id
     and ta.teacher_user_id = auth.uid()
     and (
       ta.role = 'form_adviser'
       or (ta.role = 'subject_teacher' and ta.subject_id = gs.subject_id)
     )
    where gs.id = p_sheet_id
  );
$$;

comment on function public.is_teacher_for_sheet(uuid) is
  'True when the caller is either (a) the assigned subject teacher for the sheet''s (section × subject), or (b) the form adviser for the sheet''s section (advisers see every subject in their section). Used to gate reads of grading_sheets and grade_entries.';

-- ---------------------------------------------------------------------------
-- 2. Replace broad `_role_read` policies with scoped policies
-- ---------------------------------------------------------------------------
--
-- Reference tables (academic_years, terms, levels, subjects, subject_configs,
-- sections) keep their 004 `_role_read` policies. They're read-only UI
-- scaffolding with no PII and every role needs them.

-- ---- students ------------------------------------------------------------
drop policy if exists students_role_read on public.students;
create policy students_scoped_read
  on public.students for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or exists (
      select 1
      from public.section_students ss
      where ss.student_id = students.id
        and public.is_teacher_for_section(ss.section_id)
    )
  );

-- ---- section_students ----------------------------------------------------
drop policy if exists section_students_role_read on public.section_students;
create policy section_students_scoped_read
  on public.section_students for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or public.is_teacher_for_section(section_id)
  );

-- ---- grading_sheets ------------------------------------------------------
drop policy if exists grading_sheets_role_read on public.grading_sheets;
create policy grading_sheets_scoped_read
  on public.grading_sheets for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or public.is_teacher_for_sheet(id)
  );

-- ---- grade_entries -------------------------------------------------------
drop policy if exists grade_entries_role_read on public.grade_entries;
create policy grade_entries_scoped_read
  on public.grade_entries for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or public.is_teacher_for_sheet(grading_sheet_id)
  );

-- ---- report_card_comments ------------------------------------------------
-- Advisers only. Subject teachers do NOT see comments — those are written
-- by the form class adviser and intended for the report card.
drop policy if exists report_card_comments_role_read on public.report_card_comments;
create policy report_card_comments_scoped_read
  on public.report_card_comments for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or public.is_adviser_for_section(section_id)
  );

-- ---- attendance_records --------------------------------------------------
-- Attendance lives per (term × section_student). Only the form adviser for
-- the section the enrolment belongs to can read it; subject teachers cannot.
drop policy if exists attendance_records_role_read on public.attendance_records;
create policy attendance_records_scoped_read
  on public.attendance_records for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or exists (
      select 1
      from public.section_students ss
      where ss.id = attendance_records.section_student_id
        and public.is_adviser_for_section(ss.section_id)
    )
  );

-- ---- teacher_assignments -------------------------------------------------
-- Teachers can see their own assignment rows (so the sidebar / advisory list
-- on the grading page can render). They cannot see other teachers'.
drop policy if exists teacher_assignments_role_read on public.teacher_assignments;
create policy teacher_assignments_scoped_read
  on public.teacher_assignments for select
  to authenticated
  using (
    public.is_registrar_or_above()
    or teacher_user_id = auth.uid()
  );

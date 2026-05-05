-- 041_section_students_enrolee_number.sql
--
-- Add `enrolee_number` column to `section_students`. The column is queried
-- by the Records drill loader (`lib/sis/drill.ts::loadRecordsRowsUncached`)
-- and the SIS lifecycle helpers (`lib/sis/dashboard.ts::getLifecycleAggregate`)
-- to join back to the AY-prefixed admissions tables, but the column was
-- never added to the schema. Result: every Records drill query returned a
-- 400 from PostgREST ("column section_students.enrolee_number does not
-- exist"), the loader silently returned an empty array, and **all** drill
-- sheets that used these helpers rendered zero rows across every AY.
--
-- The column is nullable because:
--   - Test/seeded section_students rows (e.g. AY9999) don't have a matching
--     admissions enrolee, so the value would be NULL anyway.
--   - Real production rows get populated by the admissions→SIS sync flow
--     (`lib/sis/students.ts::insertSectionStudentForEnrolee`, when a status
--     flips to 'Enrolled') — backfill of existing rows is handled below.
--
-- Backfill strategy: each `section_students` row holds a `student_id`. The
-- corresponding `students.student_number` matches the
-- `ay{YY}_enrolment_applications.studentNumber` column for the AY of that
-- section. Rather than do a per-AY UPDATE here (which would require
-- iterating every AY-prefixed admissions table), we leave the column NULL
-- on existing rows. Drill loaders fall back to `students.student_number`
-- as the join key per Hard Rule #4. New writes (admissions sync + tests)
-- will populate the column going forward.
--
-- Idempotent — `ADD COLUMN IF NOT EXISTS` guards re-runs.

alter table public.section_students
  add column if not exists enrolee_number text;

create index if not exists section_students_enrolee_number_idx
  on public.section_students (enrolee_number)
  where enrolee_number is not null;

comment on column public.section_students.enrolee_number is
  'AY-scoped admissions identifier — copied from ay{YY}_enrolment_applications.enroleeNumber when a student is synced from admissions. NULL for test fixtures and pre-sync rows; loaders fall back to students.student_number (Hard Rule #4) as the cross-table join key.';

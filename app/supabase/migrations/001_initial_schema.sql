-- HFSE Markbook — initial schema (Sprint 1)
-- Source of truth: docs/context/04-database-schema.md
-- Hard rules (CLAUDE.md):
--   * studentNumber is the stable cross-year ID (never enroleeNumber)
--   * Blank (null) scores are NOT zero — nullable by design
--   * Grade entries are never deleted; audit log is append-only
--   * Post-lock edits require approval_reference
--   * ww_weight + pt_weight + qa_weight MUST equal 1.00

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. academic_years
-- =====================================================================
create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  ay_code     text not null unique,
  label       text not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 2. terms
-- =====================================================================
create table if not exists public.terms (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years(id) on delete restrict,
  term_number       smallint not null check (term_number between 1 and 4),
  label             text not null,
  start_date        date,
  end_date          date,
  is_current        boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (academic_year_id, term_number)
);

-- =====================================================================
-- 3. levels
-- =====================================================================
create table if not exists public.levels (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  level_type  text not null check (level_type in ('primary', 'secondary'))
);

-- =====================================================================
-- 4. sections
-- =====================================================================
create table if not exists public.sections (
  id                  uuid primary key default gen_random_uuid(),
  academic_year_id    uuid not null references public.academic_years(id) on delete restrict,
  level_id            uuid not null references public.levels(id) on delete restrict,
  name                text not null,
  class_type          text,
  form_class_adviser  text,
  created_at          timestamptz not null default now(),
  unique (academic_year_id, level_id, name)
);

-- =====================================================================
-- 5. students  (synced from admissions DB; student_number is the stable key)
-- =====================================================================
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  student_number  text not null unique,
  last_name       text not null,
  first_name      text not null,
  middle_name     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- 6. section_students  (enrollment per AY; index_number is immutable)
-- =====================================================================
create table if not exists public.section_students (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references public.sections(id) on delete restrict,
  student_id          uuid not null references public.students(id) on delete restrict,
  index_number        smallint not null,
  enrollment_status   text not null check (enrollment_status in ('active', 'late_enrollee', 'withdrawn')),
  enrollment_date     date,
  withdrawal_date     date,
  created_at          timestamptz not null default now(),
  unique (section_id, index_number),
  unique (section_id, student_id)
);

-- =====================================================================
-- 7. subjects
-- =====================================================================
create table if not exists public.subjects (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  name           text not null,
  is_examinable  boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (code)
);

-- =====================================================================
-- 8. subject_configs  (weights per AY/subject/level; must sum to 1.00)
-- =====================================================================
create table if not exists public.subject_configs (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years(id) on delete restrict,
  subject_id        uuid not null references public.subjects(id) on delete restrict,
  level_id          uuid not null references public.levels(id) on delete restrict,
  ww_weight         numeric(4,2) not null,
  pt_weight         numeric(4,2) not null,
  qa_weight         numeric(4,2) not null,
  ww_max_slots      smallint not null default 5,
  pt_max_slots      smallint not null default 5,
  created_at        timestamptz not null default now(),
  unique (academic_year_id, subject_id, level_id),
  constraint subject_configs_weights_sum_check
    check (ww_weight + pt_weight + qa_weight = 1.00)
);

-- =====================================================================
-- 9. grading_sheets  (one per term/section/subject; unit of locking)
-- =====================================================================
create table if not exists public.grading_sheets (
  id                 uuid primary key default gen_random_uuid(),
  term_id            uuid not null references public.terms(id) on delete restrict,
  section_id         uuid not null references public.sections(id) on delete restrict,
  subject_id         uuid not null references public.subjects(id) on delete restrict,
  subject_config_id  uuid not null references public.subject_configs(id) on delete restrict,
  teacher_name       text,
  ww_totals          numeric[] not null default '{}',
  pt_totals          numeric[] not null default '{}',
  qa_total           numeric,
  is_locked          boolean not null default false,
  locked_at          timestamptz,
  locked_by          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (term_id, section_id, subject_id)
);

-- =====================================================================
-- 10. grade_entries  (raw scores per student; null != 0)
-- =====================================================================
create table if not exists public.grade_entries (
  id                  uuid primary key default gen_random_uuid(),
  grading_sheet_id    uuid not null references public.grading_sheets(id) on delete restrict,
  section_student_id  uuid not null references public.section_students(id) on delete restrict,
  ww_scores           numeric[] not null default '{}',
  pt_scores           numeric[] not null default '{}',
  qa_score            numeric,
  ww_ps               numeric(7,4),
  pt_ps               numeric(7,4),
  qa_ps               numeric(7,4),
  initial_grade       numeric(7,4),
  quarterly_grade     smallint,
  letter_grade        text,
  is_na               boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (grading_sheet_id, section_student_id)
);

-- =====================================================================
-- 11. grade_audit_log  (append-only; post-lock edits require approval_reference)
-- =====================================================================
create table if not exists public.grade_audit_log (
  id                   uuid primary key default gen_random_uuid(),
  grade_entry_id       uuid not null references public.grade_entries(id) on delete restrict,
  grading_sheet_id     uuid not null references public.grading_sheets(id) on delete restrict,
  changed_by           text not null,
  field_changed        text not null,
  old_value            text,
  new_value            text,
  approval_reference   text,
  changed_at           timestamptz not null default now()
);

-- =====================================================================
-- 12. report_card_comments
-- =====================================================================
create table if not exists public.report_card_comments (
  id          uuid primary key default gen_random_uuid(),
  term_id     uuid not null references public.terms(id) on delete restrict,
  section_id  uuid not null references public.sections(id) on delete restrict,
  student_id  uuid not null references public.students(id) on delete restrict,
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (term_id, section_id, student_id)
);

-- =====================================================================
-- 13. attendance_records
-- =====================================================================
create table if not exists public.attendance_records (
  id                  uuid primary key default gen_random_uuid(),
  term_id             uuid not null references public.terms(id) on delete restrict,
  section_student_id  uuid not null references public.section_students(id) on delete restrict,
  school_days         smallint,
  days_present        smallint,
  days_late           smallint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (term_id, section_student_id)
);

-- =====================================================================
-- Row-Level Security
-- Sprint 1: enable RLS on all tables with permissive authenticated-read
-- policies. Tight per-role/row policies are a later sprint — do NOT ship
-- to production without revisiting.
-- =====================================================================
alter table public.academic_years      enable row level security;
alter table public.terms               enable row level security;
alter table public.levels              enable row level security;
alter table public.sections            enable row level security;
alter table public.students            enable row level security;
alter table public.section_students    enable row level security;
alter table public.subjects            enable row level security;
alter table public.subject_configs     enable row level security;
alter table public.grading_sheets      enable row level security;
alter table public.grade_entries       enable row level security;
alter table public.grade_audit_log     enable row level security;
alter table public.report_card_comments enable row level security;
alter table public.attendance_records  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','sections','students','section_students',
    'subjects','subject_configs','grading_sheets','grade_entries','grade_audit_log',
    'report_card_comments','attendance_records'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_auth_read', t
    );
  end loop;
end$$;

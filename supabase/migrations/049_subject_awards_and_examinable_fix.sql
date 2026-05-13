-- 049_subject_awards_and_examinable_fix.sql
--
-- KD #95 — Subject Award + Overall Academic Award + configurable thresholds.
--
-- Changes:
--
-- 1. Flips `subjects.is_examinable` to FALSE for the 8 non-examinable
--    subjects HFSE actually treats as letter-graded per the canonical
--    grading spec (verified against AY2025 Final Report Book workbooks).
--    The original seed (seed.sql line 31-53) marked everything except CCA
--    as examinable, which doesn't match HFSE's practice — Music / Arts /
--    PE / Health / Christian Living (Primary) and Contemporary Art / PE+H /
--    Pastoral Ministry (Secondary) are letter-graded, never numeric.
--
-- 2. Adds 4 typed columns to `school_config` for Subject Award + Overall
--    Academic Award threshold customisation. Defaults match HFSE's literal
--    IFS formula on the masterfile:
--      =IFS(K8<88.5,"NE",K8<=91.4,"Bronze",K8<=95.4,"Silver",K8<=99.4,"Gold")
--    Translated to "min for tier" semantics:
--      bronze_min = 88.5
--      silver_min = 91.5  (anything > 91.4 → Silver)
--      gold_min   = 95.5  (anything > 95.4 → Gold)
--      max        = 100.0 (extends HFSE's IFS upper bound from 99.4; a
--                          perfect 100 would otherwise return #N/A)
--
-- Apply after 048. Safe to re-run.

-- =====================================================================
-- 1. subjects: flip is_examinable for letter-graded subjects
-- =====================================================================
--
-- Match by subject `code` (stable across AYs) — not by name (which can
-- vary slightly across data sources). The 8 codes below are HFSE's
-- canonical non-examinable subjects per the spec the user provided
-- this session:
--   Primary:    MUSIC, ARTS, PE, HE, CL
--   Secondary:  CA, PEH, PMPD
-- (CCA was already correctly seeded as false.)

update public.subjects
  set is_examinable = false
  where code in ('MUSIC', 'ARTS', 'PE', 'HE', 'CL', 'CA', 'PEH', 'PMPD')
    and is_examinable = true;

comment on column public.subjects.is_examinable is
  'TRUE = numeric WW/PT/QA grading (Track 1, examinable). FALSE = letter grade only (Track 2, non-examinable: Music, Arts, PE, Health, Christian Living, Contemporary Art, PE+Health, Pastoral, CCA). Drives Subject Award eligibility and Overall Academic Award filter (KD #95).';

-- =====================================================================
-- 2. school_config: Subject + Overall Academic Award thresholds
-- =====================================================================
--
-- Editable from /sis/admin/school-config (school_admin+ per migration 048).
-- The same threshold ladder applies to both per-subject Subject Award and
-- per-student Overall Academic Award — only the label text differs.

alter table public.school_config
  add column if not exists subject_award_bronze_min numeric(4,1)
    not null default 88.5
    check (subject_award_bronze_min >= 0 and subject_award_bronze_min <= 100);

alter table public.school_config
  add column if not exists subject_award_silver_min numeric(4,1)
    not null default 91.5
    check (subject_award_silver_min >= 0 and subject_award_silver_min <= 100);

alter table public.school_config
  add column if not exists subject_award_gold_min numeric(4,1)
    not null default 95.5
    check (subject_award_gold_min >= 0 and subject_award_gold_min <= 100);

alter table public.school_config
  add column if not exists subject_award_max numeric(4,1)
    not null default 100.0
    check (subject_award_max >= 0 and subject_award_max <= 100);

-- Cross-column ordering constraint: thresholds must be strictly increasing
-- so the bucket logic is unambiguous (no overlapping ranges).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'school_config_award_thresholds_order_chk'
      and conrelid = 'public.school_config'::regclass
  ) then
    alter table public.school_config drop constraint school_config_award_thresholds_order_chk;
  end if;
end $$;

alter table public.school_config
  add constraint school_config_award_thresholds_order_chk
  check (
    subject_award_bronze_min < subject_award_silver_min
    and subject_award_silver_min < subject_award_gold_min
    and subject_award_gold_min <= subject_award_max
  );

comment on column public.school_config.subject_award_bronze_min is
  'Minimum Subject Overall (or General Average) for Bronze tier. Below this → "Not eligible". HFSE default 88.5.';

comment on column public.school_config.subject_award_silver_min is
  'Minimum Subject Overall (or General Average) for Silver tier. HFSE default 91.5 (covers HFSE''s IFS >91.4).';

comment on column public.school_config.subject_award_gold_min is
  'Minimum Subject Overall (or General Average) for Gold tier. HFSE default 95.5 (covers HFSE''s IFS >95.4).';

comment on column public.school_config.subject_award_max is
  'Upper bound for Gold tier. HFSE default 100.0 (extends HFSE''s IFS upper bound of 99.4 so a perfect 100 doesn''t fall through).';

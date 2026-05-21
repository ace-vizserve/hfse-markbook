-- Migration 059: add curriculum_track to template_sections + fix apply_template_to_ay
--
-- Migration 058 added sections.curriculum_track and replaced the sections unique
-- constraint from (academic_year_id, level_id, name) to
-- (academic_year_id, level_id, curriculum_track, name).  The apply_template_to_ay
-- RPC was not updated at the same time, leaving its ON CONFLICT clause referencing
-- a dropped constraint.  This migration:
--   1. Adds curriculum_track to template_sections (NOT NULL, default singapore_inspired).
--   2. Widens the template_sections unique constraint to (level_id, curriculum_track, name).
--   3. Replaces apply_template_to_ay to copy curriculum_track and use the correct
--      conflict key on sections.

-- ─── 1. template_sections.curriculum_track ───────────────────────────────────

alter table public.template_sections
  add column if not exists curriculum_track text
    not null
    default 'singapore_inspired'
    check (curriculum_track in ('cambridge', 'o_level', 'singapore_inspired'));

comment on column public.template_sections.curriculum_track is
  'Curriculum track for this template section. Propagated to sections.curriculum_track '
  'when apply_template_to_ay is called.';

-- ─── 2. Widen unique constraint ──────────────────────────────────────────────

alter table public.template_sections
  drop constraint if exists template_sections_level_id_name_key;

alter table public.template_sections
  add constraint template_sections_level_track_name_key
    unique (level_id, curriculum_track, name);

-- ─── 3. Fix apply_template_to_ay ─────────────────────────────────────────────
-- Replaces the version from migration 031.  Key changes:
--   • Selects ts.curriculum_track from template_sections.
--   • Inserts curriculum_track into sections.
--   • ON CONFLICT now targets the correct 4-column key introduced by migration 058.
--   • DO UPDATE sets class_type only (curriculum_track is part of the conflict key
--     so it never needs updating in-place).

create or replace function public.apply_template_to_ay(p_ay_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code               text := upper(trim(p_ay_code));
  v_ay_id              uuid;
  v_sections_inserted  int := 0;
  v_sections_updated   int := 0;
  v_configs_inserted   int := 0;
  v_configs_updated    int := 0;
begin
  if v_code !~ '^AY[0-9]{4}$' then
    raise exception 'Invalid AY code: %. Expected format AY2027.', p_ay_code;
  end if;

  select id into v_ay_id
  from public.academic_years
  where ay_code = v_code;

  if v_ay_id is null then
    raise exception 'AY % not found.', v_code;
  end if;

  -- Sections — INSERT new, UPDATE existing class_type.
  -- Conflict key is (academic_year_id, level_id, curriculum_track, name) matching
  -- the constraint added by migration 058.  form_class_adviser is per-AY — never
  -- overwritten.
  with upsert as (
    insert into public.sections
      (academic_year_id, level_id, name, class_type, curriculum_track, form_class_adviser)
    select v_ay_id, ts.level_id, ts.name, ts.class_type, ts.curriculum_track, null
    from public.template_sections ts
    on conflict (academic_year_id, level_id, curriculum_track, name) do update
      set class_type = excluded.class_type
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert)         as inserted,
    count(*) filter (where not is_insert)     as updated
    into v_sections_inserted, v_sections_updated
  from upsert;

  -- Subject configs — UPSERT on (ay, subject, level). All template fields pushed.
  with upsert as (
    insert into public.subject_configs (
      academic_year_id, subject_id, level_id,
      ww_weight, pt_weight, qa_weight,
      ww_max_slots, pt_max_slots, qa_max
    )
    select v_ay_id, t.subject_id, t.level_id,
           t.ww_weight, t.pt_weight, t.qa_weight,
           t.ww_max_slots, t.pt_max_slots, t.qa_max
    from public.template_subject_configs t
    on conflict (academic_year_id, subject_id, level_id) do update
      set ww_weight    = excluded.ww_weight,
          pt_weight    = excluded.pt_weight,
          qa_weight    = excluded.qa_weight,
          ww_max_slots = excluded.ww_max_slots,
          pt_max_slots = excluded.pt_max_slots,
          qa_max       = excluded.qa_max
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert)         as inserted,
    count(*) filter (where not is_insert)     as updated
    into v_configs_inserted, v_configs_updated
  from upsert;

  return jsonb_build_object(
    'ay_code',            v_code,
    'sections_inserted',  v_sections_inserted,
    'sections_updated',   v_sections_updated,
    'configs_inserted',   v_configs_inserted,
    'configs_updated',    v_configs_updated
  );
end;
$$;

-- 032_seed_template_from_ay9999.sql
--
-- Populate the master template (migration 031) from AY9999's seeded test
-- structure. AY9999's sections + subject_configs are written by the test-
-- environment seeder (`lib/sis/seeder/structural.ts` + companions) and
-- represent the canonical HFSE class layout: Primary 1–6 + Secondary 1–4
-- across the configured subjects with the standard weight profiles
-- (Primary 40·40·20, Secondary 30·50·20, etc).
--
-- Migration 031's inline seed sourced from the most-recent non-test AY,
-- which on this DB happened to be a partially-set-up year (AY2025 /
-- AY2027) with no sections or subject_configs to copy. The template was
-- left empty as a result. This one-shot seed fixes that.
--
-- Safe to re-run: ON CONFLICT DO NOTHING preserves any template edits the
-- admin has already made via /sis/admin/template — only missing rows get
-- inserted. If the user wants to reset the template entirely, they can
-- DELETE FROM template_* before applying.
--
-- If AY9999 doesn't exist (test environment never enabled), this is a
-- no-op with a notice; admin will need to seed via the UI.

do $$
declare
  v_source_id      uuid;
  v_sections_seed  int;
  v_configs_seed   int;
begin
  select id into v_source_id
  from public.academic_years
  where ay_code = 'AY9999';

  if v_source_id is null then
    raise notice '[032] AY9999 not found — template not seeded. Enable the test environment via /sis/admin/settings or seed the template manually via /sis/admin/template.';
    return;
  end if;

  with ins as (
    insert into public.template_sections (level_id, name, class_type)
    select level_id, name, class_type
    from public.sections
    where academic_year_id = v_source_id
    on conflict (level_id, name) do nothing
    returning 1
  )
  select count(*) into v_sections_seed from ins;

  with ins as (
    insert into public.template_subject_configs (
      subject_id, level_id,
      ww_weight, pt_weight, qa_weight,
      ww_max_slots, pt_max_slots, qa_max
    )
    select subject_id, level_id,
           ww_weight, pt_weight, qa_weight,
           ww_max_slots, pt_max_slots, qa_max
    from public.subject_configs
    where academic_year_id = v_source_id
    on conflict (subject_id, level_id) do nothing
    returning 1
  )
  select count(*) into v_configs_seed from ins;

  raise notice '[032] seeded template from AY9999 — % sections, % subject_configs (existing rows preserved)',
    v_sections_seed, v_configs_seed;
end$$;

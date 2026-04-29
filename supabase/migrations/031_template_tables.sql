-- 031_template_tables.sql
--
-- Master template tables that every new AY copies sections + subject_configs
-- from. Replaces the implicit "most recent non-test AY" copy-forward source
-- (migration 030) with an explicit, admin-edited template living in two
-- dedicated tables.
--
-- Why: previously every AY's structure was tied to whatever happened to be
-- the latest one. Drift accumulated year-over-year, there was no single
-- source of truth, and rolling out a school-wide change (e.g. "Math weight
-- 30/50/20 across the school") meant editing every AY one at a time. The
-- template fixes both.
--
-- This migration:
--   1. Creates `template_sections` + `template_subject_configs` (mirror the
--      per-AY tables, drop `academic_year_id`, add `updated_at`).
--   2. Enables RLS with the same pattern as 004 — read by any authenticated
--      role with non-null role; deny all writes from `authenticated`.
--   3. Seeds both tables ON CONFLICT DO NOTHING from the most-recent NON-
--      TEST AY (matching migration 030's `^AY9` filter). Empty if no AYs
--      exist yet.
--   4. Updates `create_academic_year` to source from template tables first,
--      falling back to the prior-AY copy-forward path if templates are
--      empty (preserves backward compat for empty-template installs).
--   5. Adds `apply_template_to_ay(p_ay_code text)` — UPSERT every template
--      row into the target AY's sections/subject_configs by natural key.
--      INSERT-on-miss, UPDATE-on-match, NEVER DELETE. Per-AY data like
--      `form_class_adviser` is preserved by the UPDATE leaving non-template
--      columns alone.
--
-- Apply after 030. Safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE on functions, idempotent seed).

-- =====================================================================
-- 1. Template tables
-- =====================================================================

create table if not exists public.template_sections (
  id          uuid primary key default gen_random_uuid(),
  level_id    uuid not null references public.levels(id) on delete restrict,
  name        text not null,
  class_type  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (level_id, name)
);

create table if not exists public.template_subject_configs (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects(id) on delete restrict,
  level_id      uuid not null references public.levels(id) on delete restrict,
  ww_weight     numeric(4,2) not null,
  pt_weight     numeric(4,2) not null,
  qa_weight     numeric(4,2) not null,
  ww_max_slots  smallint not null default 5,
  pt_max_slots  smallint not null default 5,
  qa_max        smallint not null default 30,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (subject_id, level_id),
  constraint template_subject_configs_weights_sum_check
    check (ww_weight + pt_weight + qa_weight = 1.00)
);

-- =====================================================================
-- 2. RLS — same pattern as 004 for the per-AY tables
-- =====================================================================

alter table public.template_sections enable row level security;
alter table public.template_subject_configs enable row level security;

drop policy if exists template_sections_role_read on public.template_sections;
create policy template_sections_role_read
  on public.template_sections for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists template_sections_no_insert on public.template_sections;
create policy template_sections_no_insert
  on public.template_sections for insert to authenticated with check (false);

drop policy if exists template_sections_no_update on public.template_sections;
create policy template_sections_no_update
  on public.template_sections for update to authenticated
  using (false) with check (false);

drop policy if exists template_sections_no_delete on public.template_sections;
create policy template_sections_no_delete
  on public.template_sections for delete to authenticated using (false);

drop policy if exists template_subject_configs_role_read on public.template_subject_configs;
create policy template_subject_configs_role_read
  on public.template_subject_configs for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists template_subject_configs_no_insert on public.template_subject_configs;
create policy template_subject_configs_no_insert
  on public.template_subject_configs for insert to authenticated with check (false);

drop policy if exists template_subject_configs_no_update on public.template_subject_configs;
create policy template_subject_configs_no_update
  on public.template_subject_configs for update to authenticated
  using (false) with check (false);

drop policy if exists template_subject_configs_no_delete on public.template_subject_configs;
create policy template_subject_configs_no_delete
  on public.template_subject_configs for delete to authenticated using (false);

-- =====================================================================
-- 3. One-time seed from latest non-test AY (idempotent)
-- =====================================================================

do $$
declare
  v_source_id uuid;
begin
  select id into v_source_id
  from public.academic_years
  where ay_code !~ '^AY9'
  order by ay_code desc
  limit 1;

  if v_source_id is null then
    raise notice '[031] no non-test AY found — leaving template tables empty';
    return;
  end if;

  insert into public.template_sections (level_id, name, class_type)
  select level_id, name, class_type
  from public.sections
  where academic_year_id = v_source_id
  on conflict (level_id, name) do nothing;

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
  on conflict (subject_id, level_id) do nothing;
end$$;

-- =====================================================================
-- 4. apply_template_to_ay(p_ay_code text)
-- =====================================================================
-- Pushes every row from the template tables into a target AY's per-AY
-- tables via UPSERT on the natural key. Never deletes — if the template
-- removed a section, the target AY keeps its row.

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

  -- Sections — INSERT new, UPDATE existing class_type, NEVER touch
  -- form_class_adviser (per-AY data, not in template).
  with upsert as (
    insert into public.sections (academic_year_id, level_id, name, class_type, form_class_adviser)
    select v_ay_id, ts.level_id, ts.name, ts.class_type, null
    from public.template_sections ts
    on conflict (academic_year_id, level_id, name) do update
      set class_type = excluded.class_type
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert)         as inserted,
    count(*) filter (where not is_insert)     as updated
    into v_sections_inserted, v_sections_updated
  from upsert;

  -- Subject configs — UPSERT on (ay, subject, level). All template fields
  -- get pushed; per-AY data isn't relevant here (subject_configs has no
  -- per-AY-only columns analogous to form_class_adviser).
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

revoke all on function public.apply_template_to_ay(text) from public;
grant execute on function public.apply_template_to_ay(text) to service_role;

-- =====================================================================
-- 5. Updated create_academic_year — source from template if populated
-- =====================================================================
--
-- Step ordering identical to migration 030. Only the section + subject_config
-- copy logic changes:
--   - If templates are populated → copy from template (always).
--   - Else if a non-test prior AY exists → copy from it (legacy behaviour).
--   - Else → no copy.
--
-- The `summary.source` field is added so the UI can label the wizard's
-- review-row as "from template" vs "from AY2026" vs neither.

create or replace function public.create_academic_year(
  p_ay_code text,
  p_label   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code             text := upper(trim(p_ay_code));
  v_label            text := trim(p_label);
  v_slug             text;
  v_ay_id            uuid;
  v_existing_ay_id   uuid;
  v_existed          boolean;
  v_source_ay_id     uuid;
  v_template_sections_count int;
  v_template_configs_count  int;
  v_use_template     boolean := false;
  v_terms_inserted   int := 0;
  v_sections_copied  int := 0;
  v_configs_copied   int := 0;
  v_source           text := null;
begin
  if v_code !~ '^AY[0-9]{4}$' then
    raise exception 'Invalid AY code: %. Expected format AY2027.', p_ay_code;
  end if;
  if v_label is null or v_label = '' then
    raise exception 'AY label is required.';
  end if;

  v_slug := 'ay' || substring(v_code from 3);

  -- 1. academic_years — reuse if present, otherwise insert.
  select id into v_existing_ay_id
  from public.academic_years
  where ay_code = v_code;

  if v_existing_ay_id is not null then
    v_ay_id   := v_existing_ay_id;
    v_existed := true;
  else
    insert into public.academic_years (ay_code, label, is_current)
    values (v_code, v_label, false)
    returning id into v_ay_id;
    v_existed := false;
  end if;

  -- 2. terms (T1–T4) — insert only the missing term_numbers.
  insert into public.terms (academic_year_id, term_number, label, is_current)
  select v_ay_id, n, 'Term ' || n || ' — ' || v_code, false
  from generate_series(1, 4) as g(n)
  where not exists (
    select 1 from public.terms
    where academic_year_id = v_ay_id and term_number = n
  );
  get diagnostics v_terms_inserted = row_count;

  -- 3. Decide source. Templates win when populated.
  select count(*) into v_template_sections_count from public.template_sections;
  select count(*) into v_template_configs_count  from public.template_subject_configs;
  v_use_template := (v_template_sections_count > 0 or v_template_configs_count > 0);

  if not v_use_template then
    -- Legacy fallback: most recent non-test AY (preserves migration 030's
    -- behaviour for empty-template installs).
    select id into v_source_ay_id
    from public.academic_years
    where id <> v_ay_id
      and ay_code !~ '^AY9'
    order by ay_code desc
    limit 1;
  end if;

  -- 4. sections
  if not exists (select 1 from public.sections where academic_year_id = v_ay_id) then
    if v_use_template and v_template_sections_count > 0 then
      insert into public.sections (academic_year_id, level_id, name, class_type, form_class_adviser)
      select v_ay_id, level_id, name, class_type, null
      from public.template_sections;
      get diagnostics v_sections_copied = row_count;
      v_source := 'template';
    elsif v_source_ay_id is not null then
      insert into public.sections (academic_year_id, level_id, name, class_type, form_class_adviser)
      select v_ay_id, level_id, name, class_type, null
      from public.sections
      where academic_year_id = v_source_ay_id;
      get diagnostics v_sections_copied = row_count;
      select ay_code into v_source
      from public.academic_years
      where id = v_source_ay_id;
    end if;
  end if;

  -- 5. subject_configs
  if not exists (select 1 from public.subject_configs where academic_year_id = v_ay_id) then
    if v_use_template and v_template_configs_count > 0 then
      insert into public.subject_configs (
        academic_year_id, subject_id, level_id,
        ww_weight, pt_weight, qa_weight,
        ww_max_slots, pt_max_slots, qa_max
      )
      select v_ay_id, subject_id, level_id,
             ww_weight, pt_weight, qa_weight,
             ww_max_slots, pt_max_slots, qa_max
      from public.template_subject_configs;
      get diagnostics v_configs_copied = row_count;
      if v_source is null then v_source := 'template'; end if;
    elsif v_source_ay_id is not null then
      insert into public.subject_configs (
        academic_year_id, subject_id, level_id,
        ww_weight, pt_weight, qa_weight,
        ww_max_slots, pt_max_slots, qa_max
      )
      select v_ay_id, subject_id, level_id,
             ww_weight, pt_weight, qa_weight,
             ww_max_slots, pt_max_slots, qa_max
      from public.subject_configs
      where academic_year_id = v_source_ay_id;
      get diagnostics v_configs_copied = row_count;
      if v_source is null then
        select ay_code into v_source
        from public.academic_years
        where id = v_source_ay_id;
      end if;
    end if;
  end if;

  -- 6. Admissions DDL — already idempotent.
  perform public.create_ay_admissions_tables(v_slug);

  return jsonb_build_object(
    'ay_id',                  v_ay_id,
    'ay_code',                v_code,
    'ay_slug',                v_slug,
    'ay_existed',             v_existed,
    'terms_inserted',         v_terms_inserted,
    'sections_copied',        v_sections_copied,
    'subject_configs_copied', v_configs_copied,
    'source',                 v_source,
    'tables_created', jsonb_build_array(
      v_slug || '_enrolment_applications',
      v_slug || '_enrolment_status',
      v_slug || '_enrolment_documents',
      v_slug || '_discount_codes'
    )
  );
end;
$$;

revoke all on function public.create_academic_year(text, text) from public;
grant execute on function public.create_academic_year(text, text) to service_role;

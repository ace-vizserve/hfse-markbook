-- 030_idempotent_ay_setup.sql
--
-- Two fixes to `create_academic_year`:
--
-- (1) Make every step idempotent so the AY Setup wizard can be re-run
--     against partial-setup states without raising. This unblocks AYs
--     that have an `academic_years` row + parent-portal-written
--     `ay{YYYY}_*` admissions tables but are missing terms / sections /
--     subject_configs (e.g. AY2025, AY2027 in the production DB) —
--     typically the result of the admissions tables having been hand-
--     created (Supabase Studio, one-off DDL) before the SIS-side wizard
--     was run for that year.
--
-- (2) Exclude test AYs from the copy-forward source pick. The previous
--     `ORDER BY ay_code DESC LIMIT 1` would pick AY9999 (the test AY
--     per KD #52, lexically the highest) whenever the wizard ran inside
--     the test environment, copying seeded test sections + subject
--     configs into the new real AY. The `ay_code !~ '^AY9'` filter
--     keeps the source pool to real AYs only, while still allowing the
--     test environment seeder to source AY9999 from a real AY (the
--     filter applies to the source — AY9999 itself is allowed as a
--     target, it just can't be a source).
--
-- Idempotence rules per step:
--   1. academic_years        — reuse the existing row if present (match on
--                              ay_code). The label argument is ignored when
--                              the row already exists.
--   2. terms                  — insert only the term_numbers (1..4) that
--                              don't already exist for this AY.
--   3. sections               — copy from the most-recent prior NON-TEST
--                              AY only if this AY currently has zero
--                              sections.
--   4. subject_configs        — same rule as sections.
--   5. admissions DDL         — already idempotent via CREATE TABLE IF NOT
--                              EXISTS in `create_ay_admissions_tables`.
--
-- Critically: this function NEVER deletes / drops / truncates anything.
-- Every step is additive. A re-run on a fully-set-up AY is a no-op (returns
-- ay_existed=true with all *_inserted/*_copied counters at 0).
--
-- Return shape changes:
--   - Adds `ay_existed` (boolean) so callers can detect re-runs.
--   - `terms_created` → `terms_inserted` (semantic — count is the number
--     of new term rows actually inserted, may be 0 on a re-run).
--   - `sections_copied`, `subject_configs_copied` semantics unchanged.
--   - `tables_created` retained for parity (the helper still creates iff
--     missing — name preserved for compatibility with audit-log consumers).
--
-- Apply after 029. Safe to re-run.

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
  v_terms_inserted   int := 0;
  v_sections_copied  int := 0;
  v_configs_copied   int := 0;
begin
  if v_code !~ '^AY[0-9]{4}$' then
    raise exception 'Invalid AY code: %. Expected format AY2027.', p_ay_code;
  end if;
  if v_label is null or v_label = '' then
    raise exception 'AY label is required.';
  end if;

  -- 4-digit slug: 'AY2027' → 'ay2027'.
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

  -- 2. terms (T1–T4) — insert only the missing term_numbers for this AY.
  insert into public.terms (academic_year_id, term_number, label, is_current)
  select v_ay_id, n, 'Term ' || n || ' — ' || v_code, false
  from generate_series(1, 4) as g(n)
  where not exists (
    select 1 from public.terms
    where academic_year_id = v_ay_id and term_number = n
  );
  get diagnostics v_terms_inserted = row_count;

  -- 3. Pick source AY for copy-forward: most recent NON-TEST AY by
  --    ay_code desc, excluding the AY we just resolved/created. The
  --    `^AY9` filter excludes test AYs (KD #52) — without it, running
  --    the wizard inside the test environment would pick AY9999
  --    (lexically the highest) and seed the new AY with test data.
  --    The filter applies to the SOURCE only — AY9999 itself is still
  --    a valid target (the test seeder calls this same RPC).
  select id into v_source_ay_id
  from public.academic_years
  where id <> v_ay_id
    and ay_code !~ '^AY9'
  order by ay_code desc
  limit 1;

  -- 4. sections — copy from source AY only if this AY currently has none.
  if v_source_ay_id is not null
     and not exists (
       select 1 from public.sections where academic_year_id = v_ay_id
     ) then
    insert into public.sections (academic_year_id, level_id, name, class_type, form_class_adviser)
    select v_ay_id, level_id, name, class_type, null
    from public.sections
    where academic_year_id = v_source_ay_id;
    get diagnostics v_sections_copied = row_count;
  end if;

  -- 5. subject_configs — copy from source AY only if this AY currently has none.
  if v_source_ay_id is not null
     and not exists (
       select 1 from public.subject_configs where academic_year_id = v_ay_id
     ) then
    insert into public.subject_configs (
      academic_year_id, subject_id, level_id,
      ww_weight, pt_weight, qa_weight, ww_max_slots, pt_max_slots
    )
    select v_ay_id, subject_id, level_id,
           ww_weight, pt_weight, qa_weight, ww_max_slots, pt_max_slots
    from public.subject_configs
    where academic_year_id = v_source_ay_id;
    get diagnostics v_configs_copied = row_count;
  end if;

  -- 6. Admissions DDL — idempotent via CREATE TABLE IF NOT EXISTS.
  perform public.create_ay_admissions_tables(v_slug);

  return jsonb_build_object(
    'ay_id',                  v_ay_id,
    'ay_code',                v_code,
    'ay_slug',                v_slug,
    'ay_existed',             v_existed,
    'terms_inserted',         v_terms_inserted,
    'sections_copied',        v_sections_copied,
    'subject_configs_copied', v_configs_copied,
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

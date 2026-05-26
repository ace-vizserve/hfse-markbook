-- Migration 063: Drop curriculum_track
--
-- curriculum_track was added alongside sow_subject_scopes (migration 058/059)
-- to scope the SOW builder's subject list per (level × track). Now that
-- sow_subject_scopes is gone (migration 062) and the SOW builder is scoped by
-- teacher_assignments instead, curriculum_track serves no purpose.
--
-- Changes:
--   1. Drop curriculum_track from sections + rebuild unique constraint as
--      (academic_year_id, level_id, name).
--   2. Drop curriculum_track from template_sections + rebuild unique constraint
--      as (level_id, name).
--   3. Rewrite apply_template_to_ay without curriculum_track.

BEGIN;

-- ─── 1. sections ────────────────────────────────────────────────────────────

ALTER TABLE public.sections
  DROP CONSTRAINT IF EXISTS sections_academic_year_id_level_id_curriculum_track_name_key;

ALTER TABLE public.sections
  DROP COLUMN IF EXISTS curriculum_track;

ALTER TABLE public.sections
  ADD CONSTRAINT sections_academic_year_id_level_id_name_key
    UNIQUE (academic_year_id, level_id, name);

-- ─── 2. template_sections ───────────────────────────────────────────────────

ALTER TABLE public.template_sections
  DROP CONSTRAINT IF EXISTS template_sections_level_track_name_key;

ALTER TABLE public.template_sections
  DROP CONSTRAINT IF EXISTS template_sections_level_id_name_key;

ALTER TABLE public.template_sections
  DROP COLUMN IF EXISTS curriculum_track;

ALTER TABLE public.template_sections
  ADD CONSTRAINT template_sections_level_id_name_key
    UNIQUE (level_id, name);

-- ─── 3. apply_template_to_ay (drop curriculum_track from INSERT + conflict) ─

CREATE OR REPLACE FUNCTION public.apply_template_to_ay(p_ay_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code               text := upper(trim(p_ay_code));
  v_ay_id              uuid;
  v_sections_inserted  int := 0;
  v_sections_updated   int := 0;
  v_configs_inserted   int := 0;
  v_configs_updated    int := 0;
BEGIN
  IF v_code !~ '^AY[0-9]{4}$' THEN
    RAISE EXCEPTION 'Invalid AY code: %. Expected format AY2027.', p_ay_code;
  END IF;

  SELECT id INTO v_ay_id
  FROM public.academic_years
  WHERE ay_code = v_code;

  IF v_ay_id IS NULL THEN
    RAISE EXCEPTION 'AY % not found.', v_code;
  END IF;

  -- Sections — INSERT new, UPDATE existing class_type.
  -- form_class_adviser is per-AY — never overwritten.
  WITH upsert AS (
    INSERT INTO public.sections
      (academic_year_id, level_id, name, class_type, form_class_adviser)
    SELECT v_ay_id, ts.level_id, ts.name, ts.class_type, null
    FROM public.template_sections ts
    ON CONFLICT (academic_year_id, level_id, name) DO UPDATE
      SET class_type = EXCLUDED.class_type
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT
    COUNT(*) FILTER (WHERE is_insert)     AS inserted,
    COUNT(*) FILTER (WHERE NOT is_insert) AS updated
    INTO v_sections_inserted, v_sections_updated
  FROM upsert;

  -- Subject configs — UPSERT on (ay, subject, level). All template fields pushed.
  WITH upsert AS (
    INSERT INTO public.subject_configs (
      academic_year_id, subject_id, level_id,
      ww_weight, pt_weight, qa_weight,
      ww_max_slots, pt_max_slots, qa_max
    )
    SELECT v_ay_id, t.subject_id, t.level_id,
           t.ww_weight, t.pt_weight, t.qa_weight,
           t.ww_max_slots, t.pt_max_slots, t.qa_max
    FROM public.template_subject_configs t
    ON CONFLICT (academic_year_id, subject_id, level_id) DO UPDATE
      SET ww_weight    = EXCLUDED.ww_weight,
          pt_weight    = EXCLUDED.pt_weight,
          qa_weight    = EXCLUDED.qa_weight,
          ww_max_slots = EXCLUDED.ww_max_slots,
          pt_max_slots = EXCLUDED.pt_max_slots,
          qa_max       = EXCLUDED.qa_max
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT
    COUNT(*) FILTER (WHERE is_insert)     AS inserted,
    COUNT(*) FILTER (WHERE NOT is_insert) AS updated
    INTO v_configs_inserted, v_configs_updated
  FROM upsert;

  RETURN jsonb_build_object(
    'ay_code',            v_code,
    'sections_inserted',  v_sections_inserted,
    'sections_updated',   v_sections_updated,
    'configs_inserted',   v_configs_inserted,
    'configs_updated',    v_configs_updated
  );
END;
$$;

COMMIT;

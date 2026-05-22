-- supabase/migrations/060_sow_hard_gate.sql

-- 1. Track whether a class instance was updated mid-year after scores existed
ALTER TABLE sow_class_instances
  ADD COLUMN IF NOT EXISTS has_partial_rebaseline boolean NOT NULL DEFAULT false;

-- 2. Selective sheet + entry creator — takes a JSON array of
--    {section_id, subject_id, term_id} objects and creates grading sheets
--    (with seeded grade_entries) only for those specific scopes.
--    Idempotent: ON CONFLICT DO NOTHING on both sheets and entries.
CREATE OR REPLACE FUNCTION create_grading_sheets_for_scopes(p_scopes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope        jsonb;
  v_section_id   uuid;
  v_subject_id   uuid;
  v_term_id      uuid;
  v_config_id    uuid;
  v_ww_slots     int;
  v_pt_slots     int;
  v_qa_max       int;
  v_new_sheet_id uuid;
  v_inserted     int := 0;
BEGIN
  FOR v_scope IN SELECT value FROM jsonb_array_elements(p_scopes)
  LOOP
    v_section_id := (v_scope->>'section_id')::uuid;
    v_subject_id := (v_scope->>'subject_id')::uuid;
    v_term_id    := (v_scope->>'term_id')::uuid;

    -- Derive subject config from the section's level × AY
    SELECT sc.id, sc.ww_max_slots, sc.pt_max_slots, sc.qa_max
      INTO v_config_id, v_ww_slots, v_pt_slots, v_qa_max
      FROM subject_configs sc
      JOIN sections s ON s.academic_year_id = sc.academic_year_id
                     AND s.level_id = sc.level_id
     WHERE s.id = v_section_id
       AND sc.subject_id = v_subject_id
     LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE; -- no config for this scope, skip silently
    END IF;

    -- Insert sheet (ON CONFLICT DO NOTHING — idempotent)
    INSERT INTO grading_sheets (
      section_id, subject_id, term_id, subject_config_id,
      ww_totals, pt_totals, qa_total
    )
    VALUES (
      v_section_id, v_subject_id, v_term_id, v_config_id,
      ARRAY(SELECT 10::numeric FROM generate_series(1, v_ww_slots)),
      ARRAY(SELECT 10::numeric FROM generate_series(1, v_pt_slots)),
      v_qa_max
    )
    ON CONFLICT (section_id, subject_id, term_id) DO NOTHING
    RETURNING id INTO v_new_sheet_id;

    IF v_new_sheet_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- Seed null-filled grade_entries for active + late-enrolled students
      INSERT INTO grade_entries (
        grading_sheet_id, section_student_id, ww_scores, pt_scores
      )
      SELECT
        v_new_sheet_id,
        ss.id,
        ARRAY(SELECT NULL::numeric FROM generate_series(1, v_ww_slots)),
        ARRAY(SELECT NULL::numeric FROM generate_series(1, v_pt_slots))
      FROM section_students ss
      WHERE ss.section_id = v_section_id
        AND ss.enrollment_status IN ('active', 'late_enrollee')
      ON CONFLICT (grading_sheet_id, section_student_id) DO NOTHING;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$$;

-- Restrict to service_role only — called exclusively from API routes via createServiceClient()
REVOKE EXECUTE ON FUNCTION create_grading_sheets_for_scopes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_grading_sheets_for_scopes(jsonb) TO service_role;

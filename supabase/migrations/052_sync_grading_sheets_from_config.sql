-- 052_sync_grading_sheets_from_config.sql
--
-- Adds sync_grading_sheets_from_config(p_config_id uuid) RPC.
--
-- Grading sheet max-score columns (ww_totals, pt_totals, qa_total) are
-- denormalized copies of subject_configs at sheet-creation time. When SIS
-- Admin updates ww_max_slots / pt_max_slots / qa_max on a subject_config,
-- existing unlocked sheets linked to that config must be brought into sync.
-- Locked sheets are never touched (Hard Rule #5).
--
-- Resize behaviour:
--   - ww_totals / pt_totals extended: new slots default to max score 10.
--   - ww_totals / pt_totals truncated: trailing slots removed.
--   - grade_entries.ww_scores / pt_scores extended: new slots → NULL (not yet taken).
--   - grade_entries.ww_scores / pt_scores truncated: trailing scores dropped.
--   - qa_total: replaced with the new qa_max unconditionally.
--
-- Called by PATCH /api/sis/admin/subjects/[configId] immediately after the
-- subject_configs UPDATE, before the audit log is written.

CREATE OR REPLACE FUNCTION sync_grading_sheets_from_config(p_config_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ww_max_slots  smallint;
  v_pt_max_slots  smallint;
  v_qa_max        smallint;
  v_sheet         record;
  v_old_ww_len    int;
  v_old_pt_len    int;
  v_new_ww_totals numeric[];
  v_new_pt_totals numeric[];
  v_updated_sheets  int := 0;
  v_updated_entries int := 0;
BEGIN
  -- Load config values.
  SELECT ww_max_slots, pt_max_slots, qa_max
  INTO v_ww_max_slots, v_pt_max_slots, v_qa_max
  FROM subject_configs
  WHERE id = p_config_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subject_config % not found', p_config_id;
  END IF;

  -- Iterate over every unlocked grading sheet that uses this config.
  FOR v_sheet IN
    SELECT id, ww_totals, pt_totals
    FROM grading_sheets
    WHERE subject_config_id = p_config_id
      AND is_locked = false
  LOOP
    -- ── WW totals ──────────────────────────────────────────────────────────
    v_old_ww_len := COALESCE(array_length(v_sheet.ww_totals, 1), 0);
    v_new_ww_totals := v_sheet.ww_totals;

    IF v_old_ww_len < v_ww_max_slots THEN
      -- Extend: pad with default max score of 10.
      v_new_ww_totals := v_sheet.ww_totals
        || array_fill(10::numeric, ARRAY[v_ww_max_slots - v_old_ww_len]);
    ELSIF v_old_ww_len > v_ww_max_slots THEN
      -- Truncate.
      v_new_ww_totals := v_sheet.ww_totals[1:v_ww_max_slots];
    END IF;

    -- ── PT totals ──────────────────────────────────────────────────────────
    v_old_pt_len := COALESCE(array_length(v_sheet.pt_totals, 1), 0);
    v_new_pt_totals := v_sheet.pt_totals;

    IF v_old_pt_len < v_pt_max_slots THEN
      v_new_pt_totals := v_sheet.pt_totals
        || array_fill(10::numeric, ARRAY[v_pt_max_slots - v_old_pt_len]);
    ELSIF v_old_pt_len > v_pt_max_slots THEN
      v_new_pt_totals := v_sheet.pt_totals[1:v_pt_max_slots];
    END IF;

    -- ── Write grading_sheets ───────────────────────────────────────────────
    UPDATE grading_sheets
    SET
      ww_totals  = v_new_ww_totals,
      pt_totals  = v_new_pt_totals,
      qa_total   = v_qa_max,
      updated_at = now()
    WHERE id = v_sheet.id;

    v_updated_sheets := v_updated_sheets + 1;

    -- ── Resize grade_entries arrays ────────────────────────────────────────
    -- WW scores: extend with NULL for new slots; truncate if shrinking.
    IF v_old_ww_len != v_ww_max_slots THEN
      UPDATE grade_entries
      SET ww_scores = CASE
        WHEN COALESCE(array_length(ww_scores, 1), 0) < v_ww_max_slots
          THEN ww_scores
            || array_fill(NULL::numeric,
                          ARRAY[v_ww_max_slots
                                - COALESCE(array_length(ww_scores, 1), 0)])
        WHEN array_length(ww_scores, 1) > v_ww_max_slots
          THEN ww_scores[1:v_ww_max_slots]
        ELSE ww_scores
      END
      WHERE grading_sheet_id = v_sheet.id;
      v_updated_entries := v_updated_entries + 1;
    END IF;

    -- PT scores.
    IF v_old_pt_len != v_pt_max_slots THEN
      UPDATE grade_entries
      SET pt_scores = CASE
        WHEN COALESCE(array_length(pt_scores, 1), 0) < v_pt_max_slots
          THEN pt_scores
            || array_fill(NULL::numeric,
                          ARRAY[v_pt_max_slots
                                - COALESCE(array_length(pt_scores, 1), 0)])
        WHEN array_length(pt_scores, 1) > v_pt_max_slots
          THEN pt_scores[1:v_pt_max_slots]
        ELSE pt_scores
      END
      WHERE grading_sheet_id = v_sheet.id;
      v_updated_entries := v_updated_entries + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_sheets',  v_updated_sheets,
    'updated_entries', v_updated_entries
  );
END;
$$;

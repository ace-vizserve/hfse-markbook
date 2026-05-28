-- Migration 066: drop vestigial SOW schema
--
-- Migration 065 dropped sow_master_templates + sow_published_versions +
-- get_latest_sow_published_version. This migration completes the removal:
-- drops sow_class_instances, sow_subject_scopes, curriculum_track columns
-- on sections + template_sections, SOW provenance columns on grading_sheets
-- and evaluation_checklist_items, and any leftover RPCs.
--
-- System is not yet in production use; no data preservation needed.

-- 1. Drop SOW provenance column on evaluation_checklist_items.
--    Retains section_id ownership per KD #93.
ALTER TABLE public.evaluation_checklist_items
  DROP COLUMN IF EXISTS sow_instance_id;

-- 2. Drop SOW provenance columns on grading_sheets (added in migration 061).
ALTER TABLE public.grading_sheets
  DROP COLUMN IF EXISTS slot_labels_copied_from_sheet_id,
  DROP COLUMN IF EXISTS slot_labels_copied_at;

-- 3. Drop the SOW class-instance table (teacher-owned SOW model, migration 061).
DROP TABLE IF EXISTS public.sow_class_instances;

-- 4. Drop the subject-scopes table (migration 060b, KD #108).
DROP TABLE IF EXISTS public.sow_subject_scopes;

-- 5. Drop curriculum_track columns (migration 058) — no non-SOW consumer.
ALTER TABLE public.sections DROP COLUMN IF EXISTS curriculum_track;
ALTER TABLE public.template_sections DROP COLUMN IF EXISTS curriculum_track;

-- 6. Drop leftover RPCs from the 058–061 chain.
--    create_grading_sheets_for_scopes(jsonb) is NOT dropped here — it is still
--    called by app/api/grading-sheets/bulk-create/route.ts and is a general
--    sheet-creation helper with no SOW-specific logic.
DROP FUNCTION IF EXISTS public.gate_and_activate_scopes(uuid);

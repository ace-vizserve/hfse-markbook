-- Migration 061: SOW — teacher-owned capture + coordinator review
--
-- Collapses the Definition/Version/Instance SOW model (KD #108) into a
-- teacher-owned entity per (section × subject × term). Grading sheets and
-- evaluation checklists are consumers of the SOW, not replacements for it.
--
-- evaluation_checklist_items is re-scoped to per-section (third reshape:
-- per-section in KD #93 → per-(level × track) in KD #107/108 → per-section here).
-- TRUNCATE is safe: all writes have been 410'd since migration 058.
--
-- sow_master_templates + sow_published_versions are left in place (vestigial).
-- A follow-up cleanup migration will drop them once production is verified.

BEGIN;

-- ── 1. Reshape sow_class_instances → teacher-owned SOW entity ────────────────

ALTER TABLE sow_class_instances
  -- Drop the master/version FK columns from the old model
  DROP COLUMN IF EXISTS published_version_id,
  DROP COLUMN IF EXISTS master_template_id,
  DROP COLUMN IF EXISTS version_id,
  DROP COLUMN IF EXISTS has_partial_rebaseline,
  -- Add teacher-authored content
  ADD COLUMN IF NOT EXISTS ww_labels   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pt_labels   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS topics      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- Provenance for the Import flow
  ADD COLUMN IF NOT EXISTS copied_from_section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copied_at   timestamptz,
  -- Attribution
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure the natural key exists (section × subject × term is unique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sow_class_instances_section_subject_term_key'
  ) THEN
    ALTER TABLE sow_class_instances
      ADD CONSTRAINT sow_class_instances_section_subject_term_key
        UNIQUE (section_id, subject_id, term_id);
  END IF;
END $$;

-- ── 2. Re-scope evaluation_checklist_items → per-section ─────────────────────

TRUNCATE TABLE evaluation_checklist_items CASCADE;

ALTER TABLE evaluation_checklist_items
  -- Drop scope columns from the per-(level × track) model (migration 058)
  DROP CONSTRAINT IF EXISTS evaluation_checklist_items_unique_topic,
  DROP COLUMN IF EXISTS sow_class_instance_id,
  DROP COLUMN IF EXISTS curriculum_track,
  DROP COLUMN IF EXISTS level_id,
  -- Re-add section ownership
  ADD COLUMN section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  -- Which SOW instance seeded this item (NULL if teacher created manually)
  ADD COLUMN sow_instance_id uuid REFERENCES sow_class_instances(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX evaluation_checklist_items_unique_topic
  ON evaluation_checklist_items (term_id, subject_id, section_id, item_text);

CREATE INDEX evaluation_checklist_items_scope_idx
  ON evaluation_checklist_items (term_id, subject_id, section_id, sort_order);

-- ── 3. Add provenance columns to grading_sheets ───────────────────────────────

ALTER TABLE grading_sheets
  ADD COLUMN IF NOT EXISTS slot_labels_copied_from_sheet_id uuid
    REFERENCES grading_sheets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slot_labels_copied_at timestamptz;

-- ── 4. Drop the no-longer-needed SOW push RPC ────────────────────────────────

DROP FUNCTION IF EXISTS sync_grading_sheets_from_sow(uuid, uuid, uuid, text, jsonb, jsonb);

COMMIT;

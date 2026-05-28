-- Migration 065: drop vestigial SOW admin-authoring tables
--
-- Migration 058 created sow_master_templates + sow_published_versions for the
-- admin-authoring model (Chandana edits → publishes → class instances bind).
-- Migration 061 (KD #110) superseded that model with teacher-owned SOW and
-- noted these tables as vestigial pending production verification.
-- Migration 064 dropped sow_class_instances.published_version_id, removing
-- the last FK pointing into this chain.
--
-- Drop order: function → sow_published_versions → sow_master_templates.
-- sync_grading_sheets_from_sow was already dropped in migration 061.

DROP FUNCTION IF EXISTS get_latest_sow_published_version(uuid, uuid, uuid, text);

DROP TABLE IF EXISTS public.sow_published_versions;

DROP TABLE IF EXISTS public.sow_master_templates;

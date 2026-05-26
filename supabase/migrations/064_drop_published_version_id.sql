-- Migration 064: drop published_version_id from sow_class_instances
--
-- Migration 061 forgot to drop the NOT NULL published_version_id column that
-- migration 058 created. The upsert in PUT /api/sow omits this column, causing
-- a NOT NULL violation (500). Safe to run even if already applied (IF EXISTS).

ALTER TABLE sow_class_instances
  DROP COLUMN IF EXISTS published_version_id;

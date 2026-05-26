-- Migration 062: Drop sow_subject_scopes
--
-- The subject-scope catalogue (which subjects each level × curriculum_track
-- combination teaches) is removed. The SOW builder is scoped by
-- teacher_assignments, which already provides the correct per-teacher
-- subject filter. The scope manager was redundant overhead.

BEGIN;

DROP TABLE IF EXISTS sow_subject_scopes;

COMMIT;

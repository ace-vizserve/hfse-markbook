-- 040_index_sections_academic_year.sql
--
-- Index on sections(academic_year_id) for the AY-scoping joins added in
-- migration 4688e6f. Without this index, queries like:
--
--   from('section_students')
--     .select('id, sections!inner(academic_year_id)', { count: 'exact', head: true })
--     .eq('sections.academic_year_id', $ayId)
--
-- were doing full-table scans on `sections` on every dashboard load. The
-- pattern is now used by 6 dashboard helpers across Records + Markbook
-- (loadRecordsKpisForRange, loadEnrollmentVelocityRangeUncached,
-- loadWithdrawalVelocityRangeUncached, loadChangeRequestSummaryUncached,
-- the Markbook KPI range helpers).
--
-- Idempotent — IF NOT EXISTS guards re-runs.

create index if not exists sections_academic_year_id_idx
  on public.sections (academic_year_id);

comment on index public.sections_academic_year_id_idx is
  'B-tree index for AY-scoped joins via section_students -> sections -> academic_year_id. Used by Records + Markbook dashboard helpers.';

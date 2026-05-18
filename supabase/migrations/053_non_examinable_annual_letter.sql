-- Annual freeform letter / text grade for non-examinable subjects, filled
-- manually by the registrar via the masterfile. Stored on the T4
-- grade_entries row (one row per student × non-examinable subject × AY,
-- since grading_sheet_id encodes section × subject × term). Examinable
-- subjects derive their annual from quarterlies (KD #6) and never read
-- this column. Freeform text per registrar workflow — HFSE's excel has
-- non-legend values like "Passed" alongside legend values like A / B / C.

ALTER TABLE grade_entries
  ADD COLUMN annual_letter_grade text NULL;

COMMENT ON COLUMN grade_entries.annual_letter_grade IS
  'Freeform year-end letter/text for non-examinable subjects, registrar-entered via the masterfile. Only populated and read on the T4 row. Examinable subjects ignore this column.';

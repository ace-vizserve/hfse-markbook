-- 055_non_examinable_score_entry.sql
--
-- KD #104: Non-examinable subjects (MUSIC, ARTS, PE, HE, CL, CA, PEH, PMPD)
-- now use the same WW/PT/QA score-entry flow as examinable subjects. The letter
-- displayed in the Quarterly cell is derived at render time:
--   A (90-100), B (85-89), C (80-84), IP (<=79)
-- grade_entries.letter_grade is retained as a manual override slot for
-- UG/INC/CO/E codes that don't map to a numeric range. A/B/C/IP/NA are never
-- written by the new flow (they are derived from quarterly_grade and is_na).
--
-- This migration clears legacy letter_grade values on non-examinable entries so
-- teachers must re-enter via the score grid. annual_letter_grade (KD #100) is
-- untouched — that is the registrar-entered year-end value on the T4 row.

update public.grade_entries ge
set    letter_grade = null,
       updated_at   = now()
from   public.grading_sheets  gs,
       public.subject_configs sc,
       public.subjects         s
where  ge.grading_sheet_id  = gs.id
  and  gs.subject_config_id = sc.id
  and  sc.subject_id        = s.id
  and  s.is_examinable      = false
  and  ge.letter_grade      is not null;

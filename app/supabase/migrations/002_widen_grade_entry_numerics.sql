-- HFSE Markbook — fix grade_entries numeric precision.
-- The original migration declared ww_ps / pt_ps / qa_ps / initial_grade as
-- numeric(6,4), which allows only 2 digits before the decimal — max 99.9999.
-- A perfect score (e.g. WW_PS = 100.0000) overflows that type, so every
-- PATCH that produced a perfect component score failed with "numeric field
-- overflow" and the raw scores never persisted.
-- Widen to numeric(7,4) → max 999.9999, which comfortably stores 0–100.

alter table public.grade_entries
  alter column ww_ps         type numeric(7,4),
  alter column pt_ps         type numeric(7,4),
  alter column qa_ps         type numeric(7,4),
  alter column initial_grade type numeric(7,4);

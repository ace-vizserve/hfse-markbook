-- HFSE Markbook — seed data
-- Contents: AY2026, 10 levels, 18 subjects, AY2026 sections,
-- AY2026 terms (T1–T4), and subject_configs (weights per subject × level).
-- Idempotent: safe to re-run.

-- ---------- Academic year ----------
insert into public.academic_years (ay_code, label, is_current) values
  ('AY2026', 'Academic Year 2026', true)
on conflict (ay_code) do nothing;

-- ---------- Levels ----------
insert into public.levels (code, label, level_type) values
  ('YS-L', 'Youngstarters | Little Stars',     'preschool'),
  ('YS-J', 'Youngstarters | Junior Stars',     'preschool'),
  ('YS-S', 'Youngstarters | Senior Stars',     'preschool'),
  ('P1',   'Primary One',                       'primary'),
  ('P2',   'Primary Two',                       'primary'),
  ('P3',   'Primary Three',                     'primary'),
  ('P4',   'Primary Four',                      'primary'),
  ('P5',   'Primary Five',                      'primary'),
  ('P6',   'Primary Six',                       'primary'),
  ('S1',   'Secondary One',                     'secondary'),
  ('S2',   'Secondary Two',                     'secondary'),
  ('S3',   'Secondary Three',                   'secondary'),
  ('S4',   'Secondary Four',                    'secondary'),
  ('CS1',  'Cambridge Secondary One (Year 8)',  'secondary'),
  ('CS2',  'Cambridge Secondary Two (Year 9)',  'secondary')
on conflict (code) do nothing;

-- ---------- Subjects — Primary ----------
-- Music / Arts / PE / Health / Christian Living are non-examinable per
-- HFSE's canonical grading spec — letter graded only, never numeric.
-- See KD #95 + migration 049.
insert into public.subjects (code, name, is_examinable) values
  ('ENG',   'English',                true),
  ('MATH',  'Mathematics',            true),
  ('MT',    'Mother Tongue',          true),
  ('SCI',   'Science',                true),
  ('SS',    'Social Studies',         true),
  ('MUSIC', 'Music Education',        false),
  ('ARTS',  'Arts Education',         false),
  ('PE',    'Physical Education',     false),
  ('HE',    'Health Education',       false),
  ('CL',    'Christian Living',       false)
on conflict (code) do nothing;

-- ---------- Subjects — Secondary ----------
-- Contemporary Art / PE+Health / Pastoral / CCA are non-examinable.
insert into public.subjects (code, name, is_examinable) values
  ('HIST', 'History',                                  true),
  ('LIT',  'Literature',                               true),
  ('HUM',  'Humanities',                               true),
  ('ECON', 'Economics',                                true),
  ('CA',   'Contemporary Art',                         false),
  ('PEH',  'Physical Education and Health',            false),
  ('PMPD', 'Pastoral Ministry and Personal Development', false),
  ('CCA',  'Co-curricular Activities',                 false)
on conflict (code) do nothing;

-- ---------- Sections (AY2026) ----------
-- Source: docs/context/03-workflow-and-roles.md
-- Canonical spellings (sync normalizes admissions typos like "Courageos" → "Courageous").
-- curriculum_track: Primary + S3/S4 = 'singapore_inspired'.
--   S1/S2 Global sections (Discipline 1, Integrity 1) = 'cambridge'.
--   S1/S2 Standard sections (Discipline 2, Integrity 2) = 'singapore_inspired'.
-- ON CONFLICT uses the 4-column key added by migration 058.
insert into public.sections (academic_year_id, level_id, name, curriculum_track)
select ay.id, lv.id, sec.name, sec.track::text
from (values
  ('P1', 'Patience',       'singapore_inspired'),
  ('P1', 'Obedience',      'singapore_inspired'),
  ('P2', 'Honesty',        'singapore_inspired'),
  ('P2', 'Humility',       'singapore_inspired'),
  ('P3', 'Courtesy',       'singapore_inspired'),
  ('P3', 'Courageous',     'singapore_inspired'),
  ('P3', 'Responsibility', 'singapore_inspired'),
  ('P4', 'Diligence',      'singapore_inspired'),
  ('P4', 'Trust',          'singapore_inspired'),
  ('P5', 'Commitment',     'singapore_inspired'),
  ('P5', 'Perseverance',   'singapore_inspired'),
  ('P5', 'Tenacity',       'singapore_inspired'),
  ('P6', 'Grit',           'singapore_inspired'),
  ('P6', 'Loyalty',        'singapore_inspired'),
  ('S1', 'Discipline 1',   'cambridge'),
  ('S1', 'Discipline 2',   'singapore_inspired'),
  ('S2', 'Integrity 1',    'cambridge'),
  ('S2', 'Integrity 2',    'singapore_inspired'),
  ('S3', 'Consistency',    'singapore_inspired'),
  ('S4', 'Excellence',     'singapore_inspired')
) as sec(level_code, name, track)
join public.levels lv on lv.code = sec.level_code
cross join public.academic_years ay
where ay.ay_code = 'AY2026'
on conflict (academic_year_id, level_id, curriculum_track, name) do nothing;

-- ---------- Terms (AY2026) ----------
-- Dates intentionally left null for now — registrar can backfill.
-- Term 1 marked is_current so the grading UI has a default selection.
insert into public.terms (academic_year_id, term_number, label, is_current)
select ay.id, t.n, 'Term ' || t.n || ' — AY2026', (t.n = 1)
from public.academic_years ay
cross join (values (1), (2), (3), (4)) as t(n)
where ay.ay_code = 'AY2026'
on conflict (academic_year_id, term_number) do nothing;

-- ---------- Subject configs (AY2026) ----------
-- Primary (all 10 subjects) × P1–P6: 40 / 40 / 20
-- Secondary (all 8 subjects) × S1–S4: 30 / 50 / 20
-- These weights are constant for the whole AY per the grading spec.
-- Non-examinable subjects (CL, PMPD, CCA) still get a row for schema completeness,
-- but the grade entry UI uses the letter-grade path and skips the weights.
insert into public.subject_configs (
  academic_year_id, subject_id, level_id, ww_weight, pt_weight, qa_weight
)
select ay.id, sub.id, lv.id,
       case when lv.level_type = 'primary' then 0.40 else 0.30 end,
       case when lv.level_type = 'primary' then 0.40 else 0.50 end,
       0.20
from public.academic_years ay
cross join public.subjects sub
cross join public.levels lv
where ay.ay_code = 'AY2026'
  and (
    (lv.level_type = 'primary'
      and sub.code in ('ENG','MATH','MT','SCI','SS','MUSIC','ARTS','PE','HE','CL'))
    or
    (lv.level_type = 'secondary'
      and sub.code in ('HIST','LIT','HUM','ECON','CA','PEH','PMPD','CCA'))
  )
on conflict (academic_year_id, subject_id, level_id) do nothing;

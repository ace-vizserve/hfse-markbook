// Canonical fixture data for the Test environment seeder. Mirrors the
// shape of `supabase/seed.sql` (levels, subjects, sections, subject_configs)
// and extends with term dates + virtue themes + grading-lock dates +
// synthetic school-calendar holidays so switch-to-Test yields a fully
// usable school without depending on anything in production.
//
// All constants are TS-only; nothing here references the DB. The structural
// seeder reads these and upserts against Supabase.

import type { DayType } from '@/lib/schemas/attendance';

export type LevelSeed = {
  code: string;
  label: string;
  level_type: 'primary' | 'secondary' | 'preschool';
};

export const LEVELS: LevelSeed[] = [
  { code: 'YS-L', label: 'Youngstarters | Little Stars',     level_type: 'preschool' },
  { code: 'YS-J', label: 'Youngstarters | Junior Stars',     level_type: 'preschool' },
  { code: 'YS-S', label: 'Youngstarters | Senior Stars',     level_type: 'preschool' },
  { code: 'P1',   label: 'Primary One',                       level_type: 'primary'   },
  { code: 'P2',   label: 'Primary Two',                       level_type: 'primary'   },
  { code: 'P3',   label: 'Primary Three',                     level_type: 'primary'   },
  { code: 'P4',   label: 'Primary Four',                      level_type: 'primary'   },
  { code: 'P5',   label: 'Primary Five',                      level_type: 'primary'   },
  { code: 'P6',   label: 'Primary Six',                       level_type: 'primary'   },
  { code: 'S1',   label: 'Secondary One',                     level_type: 'secondary' },
  { code: 'S2',   label: 'Secondary Two',                     level_type: 'secondary' },
  { code: 'S3',   label: 'Secondary Three',                   level_type: 'secondary' },
  { code: 'S4',   label: 'Secondary Four',                    level_type: 'secondary' },
  { code: 'CS1',  label: 'Cambridge Secondary One (Year 8)',  level_type: 'secondary' },
  { code: 'CS2',  label: 'Cambridge Secondary Two (Year 9)',  level_type: 'secondary' },
];

export type SubjectSeed = {
  code: string;
  name: string;
  is_examinable: boolean;
  level_type: 'primary' | 'secondary';
};

export const SUBJECTS: SubjectSeed[] = [
  // Primary
  { code: 'ENG', name: 'English', is_examinable: true, level_type: 'primary' },
  { code: 'MATH', name: 'Mathematics', is_examinable: true, level_type: 'primary' },
  { code: 'MT', name: 'Mother Tongue', is_examinable: true, level_type: 'primary' },
  { code: 'SCI', name: 'Science', is_examinable: true, level_type: 'primary' },
  { code: 'SS', name: 'Social Studies', is_examinable: true, level_type: 'primary' },
  { code: 'MUSIC', name: 'Music Education', is_examinable: true, level_type: 'primary' },
  { code: 'ARTS', name: 'Arts Education', is_examinable: true, level_type: 'primary' },
  { code: 'PE', name: 'Physical Education', is_examinable: true, level_type: 'primary' },
  { code: 'HE', name: 'Health Education', is_examinable: true, level_type: 'primary' },
  { code: 'CL', name: 'Christian Living', is_examinable: true, level_type: 'primary' },
  // Secondary
  { code: 'HIST', name: 'History', is_examinable: true, level_type: 'secondary' },
  { code: 'LIT', name: 'Literature', is_examinable: true, level_type: 'secondary' },
  { code: 'HUM', name: 'Humanities', is_examinable: true, level_type: 'secondary' },
  { code: 'ECON', name: 'Economics', is_examinable: true, level_type: 'secondary' },
  { code: 'CA', name: 'Contemporary Art', is_examinable: true, level_type: 'secondary' },
  { code: 'PEH', name: 'Physical Education and Health', is_examinable: true, level_type: 'secondary' },
  { code: 'PMPD', name: 'Pastoral Ministry and Personal Development', is_examinable: true, level_type: 'secondary' },
  { code: 'CCA', name: 'Co-curricular Activities', is_examinable: false, level_type: 'secondary' },
];

export type SectionSeed = { level_code: string; name: string };

export const SECTIONS: SectionSeed[] = [
  { level_code: 'P1', name: 'Patience' },
  { level_code: 'P1', name: 'Obedience' },
  { level_code: 'P2', name: 'Honesty' },
  { level_code: 'P2', name: 'Humility' },
  { level_code: 'P3', name: 'Courtesy' },
  { level_code: 'P3', name: 'Courageous' },
  { level_code: 'P3', name: 'Responsibility' },
  { level_code: 'P4', name: 'Diligence' },
  { level_code: 'P4', name: 'Trust' },
  { level_code: 'P5', name: 'Commitment' },
  { level_code: 'P5', name: 'Perseverance' },
  { level_code: 'P5', name: 'Tenacity' },
  { level_code: 'P6', name: 'Grit' },
  { level_code: 'P6', name: 'Loyalty' },
  { level_code: 'S1', name: 'Discipline 1' },
  { level_code: 'S1', name: 'Discipline 2' },
  { level_code: 'S2', name: 'Integrity 1' },
  { level_code: 'S2', name: 'Integrity 2' },
  { level_code: 'S3', name: 'Consistency' },
  { level_code: 'S4', name: 'Excellence' },
];

// Term templates pinned to a single academic calendar year (KD #13: HFSE
// AY runs January through November). Registrar can re-edit via
// /sis/ay-setup → Dates.
export type TermTemplate = {
  term_number: 1 | 2 | 3 | 4;
  start_date: string;  // ISO
  end_date: string;
  virtue_theme: string | null;
  grading_lock_date: string;
};

/**
 * Builds the four-term calendar for `targetYear`. HFSE AY runs January
 * through November of a single calendar year per KD #13. Layout is
 * today-anchored when `targetYear` is the current year — T1 closed by Apr 3,
 * T2 active (Apr 13–Jul 3), T3+T4 future. For prior years (AY9998), all
 * four terms fall in the past so they all have full data.
 */
export function buildTermTemplates(targetYear: number): TermTemplate[] {
  const y = String(targetYear);
  return [
    {
      term_number: 1,
      start_date: `${y}-01-13`,
      end_date: `${y}-04-03`,
      virtue_theme: 'Faith',
      grading_lock_date: `${y}-03-30`,
    },
    {
      term_number: 2,
      start_date: `${y}-04-13`,
      end_date: `${y}-07-03`,
      virtue_theme: 'Hope',
      grading_lock_date: `${y}-06-29`,
    },
    {
      term_number: 3,
      start_date: `${y}-07-13`,
      end_date: `${y}-10-02`,
      virtue_theme: 'Love',
      grading_lock_date: `${y}-09-28`,
    },
    // T4 has no FCA comment section per KD #49 — virtue_theme left null.
    {
      term_number: 4,
      start_date: `${y}-10-13`,
      end_date: `${y}-11-27`,
      virtue_theme: null,
      grading_lock_date: `${y}-11-23`,
    },
  ];
}

/** Backwards-compat alias — points at current calendar year. Existing callers keep working. */
export const TERM_TEMPLATES: TermTemplate[] = buildTermTemplates(new Date().getFullYear());

// Synthetic holidays & special days pinned to AY term windows.
// Not an attempt at the real SG calendar — defensible stand-ins so the grid
// has a mix of day-types to demo. Registrar can re-classify via the UI.
export type CannedCalendarEntry = {
  date: string;  // ISO yyyy-MM-dd
  day_type: DayType;
  label: string;
};

/**
 * Synthetic holidays + special days, year-parametric. Substitutes
 * `targetYear` for the literal year in each ISO date. Dates fall within
 * the Jan–Nov term windows defined by `buildTermTemplates(targetYear)`.
 */
export function buildCannedCalendar(targetYear: number): CannedCalendarEntry[] {
  const y = String(targetYear);
  return [
    { date: `${y}-02-13`, day_type: 'public_holiday', label: 'Chinese New Year (Day 1)' },
    { date: `${y}-02-14`, day_type: 'public_holiday', label: 'Chinese New Year (Day 2)' },
    { date: `${y}-03-31`, day_type: 'public_holiday', label: 'Hari Raya Puasa' },
    { date: `${y}-05-01`, day_type: 'public_holiday', label: 'Labour Day' },
    { date: `${y}-06-08`, day_type: 'public_holiday', label: 'Hari Raya Haji' },
    { date: `${y}-08-09`, day_type: 'public_holiday', label: 'National Day' },
    { date: `${y}-10-26`, day_type: 'public_holiday', label: 'Deepavali' },
    { date: `${y}-11-12`, day_type: 'no_class',       label: 'Teacher Planning Day' },
  ];
}

/** Backwards-compat alias. */
export const CANNED_CALENDAR: CannedCalendarEntry[] = buildCannedCalendar(new Date().getFullYear());

export type CannedEvent = { start_date: string; end_date: string; label: string };

export function buildCannedEvents(targetYear: number): CannedEvent[] {
  const y = String(targetYear);
  return [
    { start_date: `${y}-03-23`, end_date: `${y}-03-27`, label: 'Assessment Week' },
    { start_date: `${y}-09-21`, end_date: `${y}-09-25`, label: 'Mathematics Week' },
  ];
}

export const CANNED_EVENTS: CannedEvent[] = buildCannedEvents(new Date().getFullYear());

// School config defaults. Only applied if the singleton row has empty
// strings — never overwrites registrar-edited values.
export const SCHOOL_CONFIG_DEFAULTS = {
  principal_name: 'Test Principal',
  ceo_name: 'Test CEO',
  pei_registration_number: 'AY9999-TEST',
  default_publish_window_days: 30,
} as const;

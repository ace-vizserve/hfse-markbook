-- 051_school_calendar_hbl_overlay.sql
--
-- Path B: adds `hbl_overlay boolean` to school_calendar so a single day
-- can simultaneously be day_type='school_holiday' AND an HBL day. This
-- matches HFSE's published AY 2026 calendar, where marking days and the
-- awards deliberation day carry both labels ("School Holiday" in the
-- calendar header + an HBL stripe on the same cell).
--
-- Attendance encodability gate (lib/schemas/attendance.ts::isEncodableDayType
-- + app/api/attendance/daily/route.ts::isNonSchoolDay) is updated in
-- application code to treat school_holiday+hbl_overlay=true rows as
-- encodable — teachers submit attendance as they would on a regular HBL day.
--
-- The is_holiday trigger is NOT changed: a school_holiday row (with or
-- without hbl_overlay) is still is_holiday=true. hbl_overlay only affects
-- whether the attendance grid accepts writes for that date.
--
-- Apply after 050. Safe to re-run (ADD COLUMN IF NOT EXISTS + idempotent
-- comment).

alter table public.school_calendar
  add column if not exists hbl_overlay boolean not null default false;

comment on column public.school_calendar.hbl_overlay is
  'When true, a school_holiday day is also treated as an HBL day — '
  'teachers deliver home-based learning while students have no class. '
  'Only meaningful when day_type = school_holiday; ignored otherwise. '
  'Drives the attendance write-gate: school_holiday+hbl_overlay=true is '
  'encodable, exactly like a standalone hbl row.';

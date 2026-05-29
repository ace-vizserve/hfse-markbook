-- supabase/migrations/068_attendance_late_enrollee_proration.sql
--
-- Updates recompute_attendance_rollup() to skip attendance_daily rows
-- whose date is before the student's enrollment_date.
--
-- For normal active students (enrollment_date IS NULL) behaviour is
-- unchanged. For late_enrollee students, any entries written before
-- their actual enrolment date are excluded from school_days / present /
-- absent counts, keeping the denominator accurate.

create or replace function public.recompute_attendance_rollup(
  p_term_id            uuid,
  p_section_student_id uuid
) returns table (
  school_days    int,
  days_present   int,
  days_late      int,
  days_excused   int,
  days_absent    int,
  attendance_pct numeric
) language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_enrollment_date date;
  v_school_days     int;
  v_present         int;
  v_late            int;
  v_excused         int;
  v_absent          int;
  v_pct             numeric(5,2);
begin
  -- Fetch the student's enrollment_date. NULL for active students;
  -- set on the active→late_enrollee transition (KD #68 / migration 067).
  select enrollment_date
  into   v_enrollment_date
  from   public.section_students
  where  id = p_section_student_id;

  -- Aggregate latest-per-day rows in this term for this student,
  -- skipping any dates before v_enrollment_date (when non-null).
  with latest as (
    select distinct on (section_student_id, date, period_id)
      status
    from   public.attendance_daily
    where  term_id              = p_term_id
      and  section_student_id  = p_section_student_id
      and  (v_enrollment_date is null or date >= v_enrollment_date)
    order by section_student_id, date, period_id, recorded_at desc
  )
  select
    count(*) filter (where status <> 'NC'),
    count(*) filter (where status in ('P','L','EX')),
    count(*) filter (where status = 'L'),
    count(*) filter (where status = 'EX'),
    count(*) filter (where status = 'A')
  into v_school_days, v_present, v_late, v_excused, v_absent
  from latest;

  v_pct := case
    when v_school_days > 0 then round((v_present::numeric / v_school_days) * 100, 2)
    else null
  end;

  insert into public.attendance_records (
    term_id, section_student_id,
    school_days, days_present, days_late, days_excused, days_absent,
    attendance_pct, updated_at
  ) values (
    p_term_id, p_section_student_id,
    v_school_days, v_present, v_late, v_excused, v_absent,
    v_pct, now()
  )
  on conflict (term_id, section_student_id) do update set
    school_days    = excluded.school_days,
    days_present   = excluded.days_present,
    days_late      = excluded.days_late,
    days_excused   = excluded.days_excused,
    days_absent    = excluded.days_absent,
    attendance_pct = excluded.attendance_pct,
    updated_at     = now();

  return query select v_school_days, v_present, v_late, v_excused, v_absent, v_pct;
end;
$$;

comment on function public.recompute_attendance_rollup(uuid, uuid) is
  'Recomputes attendance_records for one (term_id, section_student_id) from the latest daily-ledger rows. Skips dates before enrollment_date for late enrollees. Idempotent.';

grant execute on function public.recompute_attendance_rollup(uuid, uuid) to authenticated;

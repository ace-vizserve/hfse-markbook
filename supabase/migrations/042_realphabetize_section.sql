-- Migration 042 — re-number a section's roster alphabetically
--
-- Pain point #9: late enrollees got appended at the bottom of the roster
-- (next available index_number), breaking the alphabetical sort the
-- registrar maintains by hand. The plan-of-record is "stable index numbers"
-- (which we already have via Hard Rule #6 immutability), but Joann also
-- wants a one-click way to re-alphabetize a section after a batch of late
-- enrolments.
--
-- This RPC re-assigns index_number 1..N alphabetically by
-- (last_name, first_name, middle_name) for ALL non-withdrawn rows in the
-- section, then appends withdrawn rows at the bottom in the same order.
-- Withdrawn rows keep their relative position so they don't disrupt the
-- active roster's alphabetical order.
--
-- Two-phase update (since the unique (section_id, index_number) constraint
-- is non-deferrable): shift all rows to NEGATIVE index_number first
-- (still unique, just negative — no conflicts), then assign positive
-- 1..N in alphabetical order.
--
-- Returns: { rows_renumbered int, before jsonb, after jsonb }
-- where before/after are arrays of { id, student_number, name, old_index, new_index }
-- so the caller can show a diff in the audit log.

create or replace function public.realphabetize_section_index_numbers(
  p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_count int := 0;
begin
  -- Capture before-state for audit
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ss.id,
        'student_number', s.student_number,
        'name', concat_ws(', ', s.last_name, s.first_name, s.middle_name),
        'old_index', ss.index_number,
        'enrollment_status', ss.enrollment_status
      )
      order by ss.index_number
    ),
    '[]'::jsonb
  )
  into v_before
  from section_students ss
  join students s on s.id = ss.student_id
  where ss.section_id = p_section_id;

  -- Phase 1: shift everyone in the section to negative indexes (still
  -- unique because flipping signs preserves uniqueness; no conflicts).
  update section_students
  set index_number = -index_number
  where section_id = p_section_id;

  -- Phase 2: assign positive 1..N in alphabetical order.
  -- Active + late_enrollee rows come first, then withdrawn rows at the
  -- bottom. Within each bucket, sort by (last_name, first_name, middle_name).
  with ordered as (
    select
      ss.id,
      row_number() over (
        order by
          case ss.enrollment_status when 'withdrawn' then 1 else 0 end,
          s.last_name,
          s.first_name,
          coalesce(s.middle_name, '')
      )::smallint as new_index
    from section_students ss
    join students s on s.id = ss.student_id
    where ss.section_id = p_section_id
  )
  update section_students ss
  set index_number = ordered.new_index
  from ordered
  where ss.id = ordered.id;

  get diagnostics v_count = row_count;

  -- Capture after-state for audit
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ss.id,
        'student_number', s.student_number,
        'name', concat_ws(', ', s.last_name, s.first_name, s.middle_name),
        'new_index', ss.index_number,
        'enrollment_status', ss.enrollment_status
      )
      order by ss.index_number
    ),
    '[]'::jsonb
  )
  into v_after
  from section_students ss
  join students s on s.id = ss.student_id
  where ss.section_id = p_section_id;

  return jsonb_build_object(
    'rows_renumbered', v_count,
    'before', v_before,
    'after', v_after
  );
end;
$$;

comment on function public.realphabetize_section_index_numbers(uuid) is
  'Pain point #9: re-assigns section_students.index_number 1..N alphabetically by (last_name, first_name, middle_name). Active + late_enrollee rows first, withdrawn rows last. Two-phase update via negative-index staging since the unique (section_id, index_number) constraint is non-deferrable. Returns { rows_renumbered, before, after } for audit.';

grant execute on function public.realphabetize_section_index_numbers(uuid) to authenticated;

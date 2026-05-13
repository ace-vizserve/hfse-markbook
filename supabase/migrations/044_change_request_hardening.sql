-- 044_change_request_hardening.sql
--
-- Hardens the grade change-request flow shipped in migrations 009 + 013. Three
-- moving parts. (1) Promote the single-reviewer columns (`reviewed_by` etc.)
-- into a paired primary/secondary review trail so both designated approvers
-- (KD #41) leave their own decision footprint, and add a JSONB snapshot of
-- the eligible-approver pool at request-creation plus a notification-status
-- field for the email fan-out (KD #16). (2) Backfill the new
-- `primary_*` columns from the legacy `reviewed_*` columns so historical
-- requests render correctly in the new admin inbox. (3) Add a SECURITY
-- DEFINER RPC `apply_change_request_atomic` that re-checks the sheet's lock
-- under a row-level lock and applies the entry patch + flips the request to
-- `applied` in one transaction — closes the silent race where a concurrent
-- unlock between the API's lock check and its UPDATE could let a stale
-- approval-reference write land on a now-unlocked sheet.
--
-- All columns are nullable, the backfill is guarded by `where
-- primary_reviewed_by is null`, every column add uses IF NOT EXISTS, indexes
-- use IF NOT EXISTS, and the RPC uses CREATE OR REPLACE — the migration is
-- safe to re-run on prod without side effects.

-- =====================================================================
-- Section 1 — Paired-reviewer + notification + snapshot columns
-- =====================================================================
--
-- The original schema (009) modelled review as a single event:
-- `reviewed_by` / `reviewed_by_email` / `reviewed_at`. KD #41 introduced
-- per-flow designated approvers (primary + secondary), so a single review
-- column can no longer represent a request that needs both approvers'
-- sign-off. The split below preserves the original column for backfill
-- purposes (Section 2) but moves all new writes onto the paired columns.
--
-- `*_decision` is a free `text` rather than a CHECK-constrained enum: the
-- API enforces the `'approved' | 'rejected'` vocabulary (same posture
-- as `notification_status` below) so we can extend the value space later
-- without a migration. `eligible_approver_snapshot` captures the assigned-
-- approver list at request-time so an admin who is removed from the flow
-- after the request was filed still resolves correctly in the inbox.
-- `notification_status` lets the email fan-out (Resend, KD #16, best-
-- effort) record outcomes without polluting the request's main `status`
-- state machine.

alter table public.grade_change_requests
  add column if not exists primary_reviewed_by         uuid references auth.users(id) on delete set null,
  add column if not exists primary_reviewed_by_email   text,
  add column if not exists primary_reviewed_at         timestamptz,
  add column if not exists primary_decision            text,
  add column if not exists secondary_reviewed_by       uuid references auth.users(id) on delete set null,
  add column if not exists secondary_reviewed_by_email text,
  add column if not exists secondary_reviewed_at       timestamptz,
  add column if not exists secondary_decision          text,
  add column if not exists eligible_approver_snapshot  jsonb,
  add column if not exists notification_status         text default 'pending';

-- =====================================================================
-- Section 2 — Backfill primary_* from legacy reviewed_*
-- =====================================================================
--
-- Existing rows had a single review event recorded on `reviewed_*`; copy
-- those into the new `primary_*` columns so the new admin inbox renders
-- legacy decisions consistently with new ones. `applied` rows must have
-- transitioned through `approved` per the 009 state machine, so we map
-- `applied → primary_decision='approved'` rather than dropping the trail.
-- The `where primary_reviewed_by is null` guard makes this idempotent —
-- re-running the migration after a fresh review writes new primary_* data
-- will not clobber it.

update public.grade_change_requests
set
  primary_reviewed_by       = reviewed_by,
  primary_reviewed_by_email = reviewed_by_email,
  primary_reviewed_at       = reviewed_at,
  primary_decision          = case
    when status = 'approved' then 'approved'
    when status = 'rejected' then 'rejected'
    when status = 'applied'  then 'approved'  -- applied implies it was approved first
    else null
  end
where reviewed_by is not null
  and primary_reviewed_by is null;

-- =====================================================================
-- Section 3 — Designee + status composite indexes
-- =====================================================================
--
-- The admin inbox query `where (primary_approver_id = me or
-- secondary_approver_id = me) and status = 'pending'` runs on every page
-- load for an approver. 013 added single-column partial indexes on
-- primary_approver_id + secondary_approver_id, but those don't cover the
-- status filter — every match still needs a heap probe to filter by
-- status. Composite (approver, status) lets the query plan stay
-- index-only for the common pending-inbox case.

create index if not exists grade_change_requests_designees_idx
  on public.grade_change_requests (primary_approver_id, status);

create index if not exists grade_change_requests_secondary_designee_idx
  on public.grade_change_requests (secondary_approver_id, status);

-- =====================================================================
-- Section 4 — apply_change_request_atomic RPC
-- =====================================================================
--
-- The pre-RPC apply path was: (a) API reads `is_locked`, (b) API writes
-- the patch to `grade_entries`, (c) API flips the request to `applied`.
-- Between (a) and (b) a registrar could unlock the sheet — the patch
-- still lands but the audit row's `approval_reference` references an
-- approval that's no longer required. Wrapping (a)+(b)+(c) in a single
-- function with `for update` on the sheet row forces concurrent unlocks
-- to wait, then either (i) the unlock wins and our re-check raises
-- `lock_state_changed` so the API can fall back to the unlocked-edit
-- path, or (ii) we win and the unlock waits until our transaction ends.
-- We deliberately do NOT use `skip locked`: skipping would race past a
-- concurrent unlock, which is exactly what we want to prevent.
--
-- Audit_log + grade_audit_log writes stay API-side after this RPC
-- returns: those tables read author identity from the cookie session and
-- belong outside SECURITY DEFINER. The RPC owns only the two mutations
-- (entry patch + request flip) that must be atomic with the lock check.

create or replace function public.apply_change_request_atomic(
  p_grading_sheet_id uuid,
  p_grade_entry_id   uuid,
  p_change_request_id uuid,
  p_entry_patch      jsonb,
  p_applied_by       uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
begin
  -- Re-read the sheet's lock state under a row-level lock so a concurrent
  -- unlock cannot slip through between this check and the entry update.
  select is_locked into v_locked
  from public.grading_sheets
  where id = p_grading_sheet_id
  for update;

  if v_locked is null then
    raise exception 'grading_sheet_not_found' using errcode = 'P0002';
  end if;

  if v_locked = false then
    raise exception 'lock_state_changed' using errcode = 'P0001';
  end if;

  -- Apply the entry patch column-by-column. ww_scores + pt_scores are
  -- numeric[] in the table (see migration 001) but arrive as JSONB arrays
  -- in the patch payload — convert via jsonb_array_elements_text so a
  -- missing key leaves the existing array untouched. coalesce on the
  -- scalar columns gives the same key-absent-means-no-change semantics.
  update public.grade_entries
  set
    ww_scores = coalesce(
      case
        when p_entry_patch ? 'ww_scores'
          then (
            select array_agg(value::numeric)
            from jsonb_array_elements_text(p_entry_patch->'ww_scores')
          )
        else null
      end,
      ww_scores
    ),
    pt_scores = coalesce(
      case
        when p_entry_patch ? 'pt_scores'
          then (
            select array_agg(value::numeric)
            from jsonb_array_elements_text(p_entry_patch->'pt_scores')
          )
        else null
      end,
      pt_scores
    ),
    qa_score     = coalesce((p_entry_patch->>'qa_score')::numeric, qa_score),
    letter_grade = coalesce(p_entry_patch->>'letter_grade', letter_grade),
    is_na        = coalesce((p_entry_patch->>'is_na')::boolean, is_na),
    updated_at   = now()
  where id = p_grade_entry_id;

  if not found then
    raise exception 'grade_entry_not_found' using errcode = 'P0002';
  end if;

  -- Mark the change request as applied. The status='approved' guard makes
  -- this idempotent against double-apply attempts (a retry on an already-
  -- applied request raises and the caller can interpret it as a no-op).
  update public.grade_change_requests
  set
    status     = 'applied',
    applied_by = p_applied_by,
    applied_at = now()
  where id = p_change_request_id
    and status = 'approved';

  if not found then
    raise exception 'change_request_not_approved' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.apply_change_request_atomic(uuid, uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

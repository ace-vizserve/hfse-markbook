-- 045_change_request_workflow.sql
--
-- PR 2 of the change-request workflow follow-up. The audit findings on
-- migration 044 surfaced three workflow gaps: there's no way to record
-- that an approver used the 2-hour rejection-undo affordance (so the UI
-- can't distinguish a re-pending row from a never-rejected one), the
-- aging signal for approved-but-not-applied requests has no canonical
-- timestamp (primary_reviewed_at would be overwritten by a future
-- secondary co-sign), and the lazy reminder path needs an idempotency
-- guard so concurrent admin-inbox loads don't double-fire emails. This
-- migration adds three nullable timestamp columns + a backfill of
-- approved_at from primary_reviewed_at + a partial index that supports
-- the lazy-reminder candidate scan. All adds are IF NOT EXISTS, the
-- backfill is guarded by `where approved_at is null`, and the index
-- uses IF NOT EXISTS — safe to re-run on prod without side effects.

-- =====================================================================
-- Section 1 — Three nullable workflow timestamp columns
-- =====================================================================
--
-- All three are nullable with no default: each one is set by a specific
-- transition path, and a NULL value is the meaningful "this hasn't
-- happened yet" signal.
--
-- rejection_undone_at — set when an approver successfully reverses
-- their own rejection within the 2-hour grace window. Storing this on
-- the row rather than relying on audit_log scans lets the UI cheaply
-- render an "Undo used" affordance on a re-pending request and lets us
-- query "has this ever been undone?" without joining out to audit.
--
-- approved_at — canonical timestamp for the approved transition.
-- Deliberately separate from primary_reviewed_at: a future secondary
-- co-sign (KD #41) could overwrite the primary timestamps as the
-- workflow evolves, but approved_at is the immutable "the request
-- entered the approved state at this moment" signal that drives the
-- aging chip ("approved 5 days ago") and the 3-day reminder threshold.
--
-- reminder_sent_at — idempotency lock for the lazy reminder path. The
-- admin-inbox GET route scans for candidates and fires a reminder
-- email; setting this column before the send prevents two concurrent
-- page loads from both passing the candidate filter and double-sending.

alter table public.grade_change_requests
  add column if not exists rejection_undone_at timestamptz,
  add column if not exists approved_at         timestamptz,
  add column if not exists reminder_sent_at    timestamptz;

-- =====================================================================
-- Section 2 — Backfill approved_at from primary_reviewed_at
-- =====================================================================
--
-- Rows that already passed through the approved state under migration
-- 044 carry the approval moment on primary_reviewed_at. Copy that into
-- the new canonical column so the aging signal works for historical
-- rows on day one — without this, every pre-existing approved request
-- would silently fall outside the 3-day reminder window forever
-- (approved_at IS NOT NULL is part of the candidate filter).
--
-- The `where approved_at is null` guard makes this idempotent: a
-- re-run after fresh approvals have written approved_at directly will
-- not clobber that data. Rows from before migration 044 (where
-- primary_reviewed_at is also null) stay null here too — those rows
-- pre-date the modern workflow and the reminder query's IS NOT NULL
-- guard correctly skips them rather than reminding on years-old data.

update public.grade_change_requests
set approved_at = primary_reviewed_at
where status in ('approved', 'applied')
  and primary_reviewed_at is not null
  and approved_at is null;

-- =====================================================================
-- Section 3 — Partial index for lazy-reminder candidate scan
-- =====================================================================
--
-- The admin-inbox GET route runs the candidate query on every load:
--   where status = 'approved'
--     and approved_at is not null
--     and approved_at < now() - interval '3 days'
--     and reminder_sent_at is null
-- Without an index this is a full-table scan for a query that runs
-- many times per minute on an inbox shared by multiple approvers.
--
-- A partial index keyed on approved_at and predicated on
-- (status='approved' AND reminder_sent_at IS NULL) keeps the index
-- physically tight — once a request transitions out of approved or
-- gets its reminder sent, it leaves the index entirely. The btree on
-- approved_at supports the range scan for `< now() - interval '3
-- days'` directly. We do not include approved_at IS NOT NULL in the
-- predicate because the range comparison itself excludes nulls, and a
-- looser predicate keeps the index covering future query variants.

create index if not exists grade_change_requests_reminder_candidates_idx
  on public.grade_change_requests (approved_at)
  where status = 'approved' and reminder_sent_at is null;

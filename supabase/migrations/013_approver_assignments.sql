-- 013_approver_assignments.sql
--
-- Per-flow approver assignments. Replaces the "broadcast to all admins"
-- design of the Markbook change-request workflow (Sprint 9) with a
-- designated-approver model:
--
--   1. A superadmin assigns specific admin+ users to specific approval
--      flows via `/sis/admin/approvers` (e.g. make Chandana + Tin approvers
--      for `markbook.change_request`).
--   2. When a teacher files a change request, they pick a primary and
--      secondary approver from the assigned list.
--   3. Only the primary and secondary get notified and see the request in
--      their admin inbox — no broadcast.
--
-- The `flow` column is a namespaced string so this table generalises as
-- more modules grow approval flows (e.g. `sis.stage_escalation`,
-- `attendance.correction`). Today only `markbook.change_request` is in
-- use; the admin page is set up to add new flows without a migration.
--
-- Design notes in docs/context/18-ay-setup.md pattern — this follows the
-- same service-role-only + audit-logged approach.

-- =====================================================================
-- approver_assignments
-- =====================================================================

create table if not exists public.approver_assignments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  flow          text not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  unique (user_id, flow)
);

create index if not exists approver_assignments_flow_idx
  on public.approver_assignments (flow);

alter table public.approver_assignments enable row level security;

drop policy if exists approver_assignments_no_select on public.approver_assignments;
drop policy if exists approver_assignments_no_insert on public.approver_assignments;
drop policy if exists approver_assignments_no_update on public.approver_assignments;
drop policy if exists approver_assignments_no_delete on public.approver_assignments;

-- All CRUD goes through service-role API routes. Deny-all to the cookie
-- client defense-in-depth, matching the Sprint 9 grade_change_requests
-- pattern.
create policy approver_assignments_no_select
  on public.approver_assignments for select
  to authenticated
  using (false);

create policy approver_assignments_no_insert
  on public.approver_assignments for insert
  to authenticated
  with check (false);

create policy approver_assignments_no_update
  on public.approver_assignments for update
  to authenticated
  using (false) with check (false);

create policy approver_assignments_no_delete
  on public.approver_assignments for delete
  to authenticated
  using (false);

-- =====================================================================
-- grade_change_requests — primary + secondary approver columns
-- =====================================================================
--
-- NULLable for legacy-row compatibility: change-requests created before
-- this migration have no designated approvers, so the admin inbox's
-- "assigned to me" filter will exclude them. The API-route POST path
-- now requires both fields; only rows from before the feature shipped
-- can have NULL.

alter table public.grade_change_requests
  add column if not exists primary_approver_id   uuid references auth.users(id),
  add column if not exists secondary_approver_id uuid references auth.users(id);

create index if not exists grade_change_requests_primary_approver_idx
  on public.grade_change_requests (primary_approver_id)
  where primary_approver_id is not null;

create index if not exists grade_change_requests_secondary_approver_idx
  on public.grade_change_requests (secondary_approver_id)
  where secondary_approver_id is not null;

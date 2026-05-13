-- 046_evaluation_checklist_rating.sql
--
-- Adds per-topic 1–5 proficiency rating to evaluation_checklist_responses.
-- Replaces the binary is_checked UX with the rating scale teachers actually
-- use on the existing Excel form (1=Needs Improvement … 5=Excellent).
--
-- `is_checked` is retained for back-compat — no downstream consumers
-- outside the evaluation module's own checklist surface reference it
-- (confirmed by code-architect audit). Can be dropped in a future
-- migration once all in-flight rows are migrated to the new rating column.
--
-- All adds use IF NOT EXISTS; CHECK constraint added without IF NOT
-- EXISTS (Postgres doesn't support that variant) so the migration is
-- safe to re-run only on a clean state — guard the re-run by checking
-- `information_schema.columns` first if you need bulletproof idempotency.

alter table public.evaluation_checklist_responses
  add column if not exists rating smallint;

-- Add the CHECK constraint defensively: drop it first (no-op when absent)
-- then re-add. Lets the migration be re-run on prod without erroring on
-- "constraint already exists".
alter table public.evaluation_checklist_responses
  drop constraint if exists evaluation_checklist_responses_rating_check;

alter table public.evaluation_checklist_responses
  add constraint evaluation_checklist_responses_rating_check
  check (rating is null or (rating between 1 and 5));

comment on column public.evaluation_checklist_responses.rating is
  'Subject-teacher 1-5 proficiency rating (1=Needs Improvement, 2=Developing, 3=Satisfactory, 4=Good, 5=Excellent). Nullable — null = not yet rated. Replaces the binary is_checked UX; is_checked column retained for back-compat with historical rows.';

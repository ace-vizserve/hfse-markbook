-- 047_evaluation_checklist_section_scope.sql
--
-- Shifts evaluation_checklist_items scope from (term × subject × level)
-- to (term × subject × section). Topics are now created by subject
-- teachers per section they teach, not seeded by admin per level —
-- because only the teacher knows what they actually covered in their
-- class (curriculum-plan-as-written vs ground-truth-as-taught).
--
-- HARD RESET: existing items deleted (cascades to responses via the
-- FK in migration 023). No data migration — level-scoped items are
-- admin placeholders; no real teacher ratings exist yet in production.
--
-- The /sis/admin/evaluation-checklists page becomes a read-only audit
-- surface after this migration ships (separate code change). New
-- writes flow through teacher-scoped routes; admin can see but not
-- edit.

-- 1. Wipe existing items (cascades to evaluation_checklist_responses
--    via the on-delete-cascade FK on checklist_item_id in mig 023).
delete from public.evaluation_checklist_items;

-- 2. Drop the old level_id FK + column. Both guarded for re-runnability.
alter table public.evaluation_checklist_items
  drop constraint if exists evaluation_checklist_items_level_id_fkey;
alter table public.evaluation_checklist_items
  drop column if exists level_id;

-- 3. Add section_id (NOT NULL — every new topic belongs to a concrete
--    section). CASCADE so a deleted section drops its topics.
alter table public.evaluation_checklist_items
  add column if not exists section_id uuid not null
    references public.sections(id) on delete cascade;

-- 4. Drop the old (term, subject, level) index; replace with the
--    new scope key.
drop index if exists public.evaluation_checklist_items_term_subject_level_idx;

create index if not exists evaluation_checklist_items_term_subject_section_idx
  on public.evaluation_checklist_items (term_id, subject_id, section_id, sort_order);

-- 5. Unique constraint on (term, subject, section, item_text) — prevents
--    duplicate topic rows and makes the copy-from action idempotent via
--    onConflict ignoreDuplicates.
alter table public.evaluation_checklist_items
  drop constraint if exists evaluation_checklist_items_unique_topic;
alter table public.evaluation_checklist_items
  add constraint evaluation_checklist_items_unique_topic
    unique (term_id, subject_id, section_id, item_text);

-- 6. Update table + column comments.
comment on table public.evaluation_checklist_items is
  'Per-term topic list per (subject × section). Subject teachers add the topics they actually covered; ratings entered via evaluation_checklist_responses. PTC use only — does not flow to the report card (KD #49). Scope changed from (subject × level) to (subject × section) in migration 047.';

comment on column public.evaluation_checklist_items.section_id is
  'Section the topic belongs to. NOT NULL. Teachers managing multiple sections of the same subject keep independent lists (with a copy-from-another-section convenience in the UI).';

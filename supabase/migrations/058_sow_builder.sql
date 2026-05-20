-- 058_sow_builder.sql
--
-- Scheme of Work (SOW) — Definition / Version / Instance model.
--
-- Confirmed by Ms. Chandana (curriculum coordinator): all grading-sheet
-- activity names (WW/PT labels) and evaluation topics are SOW-defined per
-- (subject × level × curriculum track × term). Teachers only encode
-- execution: scores, dates administered, 1–5 ratings, FCA write-ups.
--
-- Three tables:
--   sow_master_templates   — Chandana's editable draft (one per scope)
--   sow_published_versions — immutable snapshots, version-numbered
--   sow_class_instances    — per-section binding to a published version
--
-- Also:
--   1. sections.curriculum_track  — three-way track discriminator
--   2. evaluation_checklist_items — reverts migration 047's wrong
--      section-scope; re-scopes to (subject × level × track × term)
--      and links to sow_class_instances for teacher read-only display.
--
-- System is not in production; hard resets on checklist data are safe.

-- ─── 1. sections.curriculum_track ────────────────────────────────────────────

alter table public.sections
  add column if not exists curriculum_track text
    not null
    default 'singapore_inspired'
    check (curriculum_track in ('cambridge', 'o_level', 'singapore_inspired'));

-- Cambridge sections are identifiable by level code prefix 'CS'.
update public.sections s
  set curriculum_track = 'cambridge'
  from public.levels l
  where s.level_id = l.id
    and l.code ilike 'CS%'
    and s.curriculum_track <> 'cambridge';

-- Widen unique constraint to prevent name collisions across tracks at the
-- same level (e.g. two "Sec 1-A" sections — one Cambridge, one Standard).
alter table public.sections
  drop constraint if exists sections_academic_year_id_level_id_name_key;
alter table public.sections
  add constraint sections_ay_level_track_name_key
    unique (academic_year_id, level_id, curriculum_track, name);

comment on column public.sections.curriculum_track is
  'Curriculum track for this section: cambridge | o_level | singapore_inspired. '
  'Used to look up the matching SOW template. Cambridge sections are identifiable '
  'by level code prefix CS; all others default to singapore_inspired (editable in SIS Admin).';

-- ─── 2. sow_master_templates ─────────────────────────────────────────────────

create table if not exists public.sow_master_templates (
  id               uuid primary key default gen_random_uuid(),
  ay_id            uuid not null references public.academic_years(id) on delete cascade,
  term_id          uuid not null references public.terms(id) on delete cascade,
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  level_id         uuid not null references public.levels(id) on delete cascade,
  curriculum_track text not null
    check (curriculum_track in ('cambridge', 'o_level', 'singapore_inspired')),
  -- topics: [{text: string, sort_order: number}]
  topics           jsonb not null default '[]'::jsonb,
  -- ww / pt: [{label: string|null, page: string|null} | null], up to 5 entries
  ww               jsonb not null default '[]'::jsonb,
  pt               jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  unique (ay_id, term_id, subject_id, level_id, curriculum_track)
);

comment on table public.sow_master_templates is
  'Editable Scheme of Work draft per (AY × term × subject × level × track). '
  'Managed by school_admin (Chandana). Publish to freeze a snapshot.';

-- ─── 3. sow_published_versions ───────────────────────────────────────────────

create table if not exists public.sow_published_versions (
  id              uuid primary key default gen_random_uuid(),
  master_id       uuid not null references public.sow_master_templates(id) on delete restrict,
  version_number  integer not null,
  topics          jsonb not null,
  ww              jsonb not null,
  pt              jsonb not null,
  notes           text,
  published_at    timestamptz not null default now(),
  published_by    uuid references auth.users(id),
  unique (master_id, version_number)
);

comment on table public.sow_published_versions is
  'Immutable SOW snapshots. Each publish action from the master template creates '
  'a new version row. Class instances bind to a specific version; once bound they '
  'are not affected by subsequent publishes unless explicitly re-applied.';

-- ─── 4. sow_class_instances ──────────────────────────────────────────────────

create table if not exists public.sow_class_instances (
  id                    uuid primary key default gen_random_uuid(),
  section_id            uuid not null references public.sections(id) on delete cascade,
  subject_id            uuid not null references public.subjects(id) on delete cascade,
  term_id               uuid not null references public.terms(id) on delete cascade,
  published_version_id  uuid not null references public.sow_published_versions(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (section_id, subject_id, term_id)
);

comment on table public.sow_class_instances is
  'Per-section runtime binding to a published SOW version for a given subject × term. '
  'Created (or updated) when the registrar runs bulk-create or when school_admin '
  'applies a new published version. Teachers see labels from this version read-only.';

-- ─── 5. evaluation_checklist_items — revert migration 047 ────────────────────

-- Hard reset: system not in production; cascades to evaluation_checklist_responses.
delete from public.evaluation_checklist_items;

-- Drop section_id (migration 047 added it with wrong scope assumption).
alter table public.evaluation_checklist_items
  drop constraint if exists evaluation_checklist_items_level_id_fkey;
alter table public.evaluation_checklist_items
  drop constraint if exists evaluation_checklist_items_unique_topic;
alter table public.evaluation_checklist_items
  drop column if exists section_id;

-- Re-add level_id (original scope per KD #107).
alter table public.evaluation_checklist_items
  add column if not exists level_id uuid not null
    references public.levels(id) on delete cascade;

-- Curriculum track (same three-way discriminator as sections).
alter table public.evaluation_checklist_items
  add column if not exists curriculum_track text not null default 'singapore_inspired'
    check (curriculum_track in ('cambridge', 'o_level', 'singapore_inspired'));

-- SOW class instance link — nullable because items can be seeded before
-- the instance is created (rare) or viewed in audit without an instance.
alter table public.evaluation_checklist_items
  add column if not exists sow_class_instance_id uuid
    references public.sow_class_instances(id) on delete cascade;

-- Drop old migration 047 index.
drop index if exists public.evaluation_checklist_items_term_subject_section_idx;

-- New index on the correct scope.
create index if not exists evaluation_checklist_items_scope_idx
  on public.evaluation_checklist_items (term_id, subject_id, level_id, curriculum_track, sort_order);

create index if not exists evaluation_checklist_items_instance_idx
  on public.evaluation_checklist_items (sow_class_instance_id, sort_order);

-- Unique constraint: one entry per text within (term × subject × level × track).
alter table public.evaluation_checklist_items
  add constraint evaluation_checklist_items_unique_topic
    unique (term_id, subject_id, level_id, curriculum_track, item_text);

comment on table public.evaluation_checklist_items is
  'SOW-derived evaluation topic list per (subject × level × curriculum_track × term). '
  'Generated from sow_class_instances on bulk-create. Read-only for teachers. '
  'Managed by school_admin via the SOW builder at /sis/admin/sow. '
  'Scope reverted from (subject × section) — migration 047 was based on a wrong assumption (KD #107).';

-- ─── 6. sync_grading_sheets_from_sow RPC ─────────────────────────────────────
--
-- Pushes SOW ww/pt labels into all UNLOCKED grading sheets whose section
-- matches the given (term, subject, level, curriculum_track). Preserves
-- teacher-entered dates and scores. Called when a published version is
-- applied to class instances.

create or replace function sync_grading_sheets_from_sow(
  p_term_id          uuid,
  p_subject_id       uuid,
  p_level_id         uuid,
  p_curriculum_track text,
  p_ww               jsonb,   -- [{label,page}|null] array from published version
  p_pt               jsonb    -- [{label,page}|null] array from published version
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sheet       record;
  v_ww_len      int;
  v_pt_len      int;
  v_sow_ww_len  int;
  v_sow_pt_len  int;
  v_new_labels  jsonb;
  v_cur_labels  jsonb;
  v_cur_ww      jsonb;
  v_cur_pt      jsonb;
  v_cur_qa      text;
  v_new_ww      jsonb;
  v_new_pt      jsonb;
  v_slot        jsonb;
  v_sow_slot    jsonb;
  i             int;
  v_rows_synced int := 0;
begin
  v_sow_ww_len := coalesce(jsonb_array_length(p_ww), 0);
  v_sow_pt_len := coalesce(jsonb_array_length(p_pt), 0);

  for v_sheet in
    select gs.id, gs.ww_totals, gs.pt_totals, gs.slot_labels
    from grading_sheets gs
    join sections s on s.id = gs.section_id
    where gs.term_id = p_term_id
      and gs.subject_id = p_subject_id
      and s.level_id = p_level_id
      and s.curriculum_track = p_curriculum_track
      and gs.is_locked = false
  loop
    v_ww_len := coalesce(array_length(v_sheet.ww_totals, 1), 0);
    v_pt_len := coalesce(array_length(v_sheet.pt_totals, 1), 0);
    v_cur_labels := coalesce(v_sheet.slot_labels, '{}'::jsonb);
    v_cur_ww := coalesce(v_cur_labels->'ww', '[]'::jsonb);
    v_cur_pt := coalesce(v_cur_labels->'pt', '[]'::jsonb);
    v_cur_qa := v_cur_labels->>'qa';

    -- Build new ww array: for each slot, take SOW label/page + preserve existing date.
    v_new_ww := '[]'::jsonb;
    for i in 0..(v_ww_len - 1) loop
      if i < v_sow_ww_len then
        v_sow_slot := p_ww->i;
        if v_sow_slot is null then
          v_new_ww := v_new_ww || 'null'::jsonb;
        else
          -- Merge: SOW label+page, preserve existing date if set
          v_slot := jsonb_build_object(
            'label', v_sow_slot->>'label',
            'page',  v_sow_slot->>'page',
            'date',  coalesce(
              case when jsonb_array_length(v_cur_ww) > i then (v_cur_ww->i)->>'date' else null end,
              null
            )
          );
          v_new_ww := v_new_ww || jsonb_build_array(v_slot);
        end if;
      else
        -- Slot beyond SOW length: preserve existing
        if jsonb_array_length(v_cur_ww) > i then
          v_new_ww := v_new_ww || jsonb_build_array(v_cur_ww->i);
        else
          v_new_ww := v_new_ww || 'null'::jsonb;
        end if;
      end if;
    end loop;

    -- Build new pt array similarly.
    v_new_pt := '[]'::jsonb;
    for i in 0..(v_pt_len - 1) loop
      if i < v_sow_pt_len then
        v_sow_slot := p_pt->i;
        if v_sow_slot is null then
          v_new_pt := v_new_pt || 'null'::jsonb;
        else
          v_slot := jsonb_build_object(
            'label', v_sow_slot->>'label',
            'page',  v_sow_slot->>'page',
            'date',  coalesce(
              case when jsonb_array_length(v_cur_pt) > i then (v_cur_pt->i)->>'date' else null end,
              null
            )
          );
          v_new_pt := v_new_pt || jsonb_build_array(v_slot);
        end if;
      else
        if jsonb_array_length(v_cur_pt) > i then
          v_new_pt := v_new_pt || jsonb_build_array(v_cur_pt->i);
        else
          v_new_pt := v_new_pt || 'null'::jsonb;
        end if;
      end if;
    end loop;

    v_new_labels := jsonb_build_object(
      'ww', v_new_ww,
      'pt', v_new_pt,
      'qa', v_cur_qa
    );

    update grading_sheets
    set slot_labels = v_new_labels,
        updated_at  = now()
    where id = v_sheet.id;

    v_rows_synced := v_rows_synced + 1;
  end loop;

  return jsonb_build_object('rows_synced', v_rows_synced);
end;
$$;

-- ─── 7. Helper: get latest published version for a scope ────────────────────

create or replace function get_latest_sow_published_version(
  p_term_id          uuid,
  p_subject_id       uuid,
  p_level_id         uuid,
  p_curriculum_track text
)
returns table (
  version_id     uuid,
  version_number integer,
  ww             jsonb,
  pt             jsonb,
  topics         jsonb
)
language sql
security definer
stable
as $$
  select pv.id, pv.version_number, pv.ww, pv.pt, pv.topics
  from sow_published_versions pv
  join sow_master_templates mt on mt.id = pv.master_id
  where mt.term_id          = p_term_id
    and mt.subject_id       = p_subject_id
    and mt.level_id         = p_level_id
    and mt.curriculum_track = p_curriculum_track
  order by pv.version_number desc
  limit 1;
$$;

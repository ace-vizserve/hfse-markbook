-- Migration 060: sow_subject_scopes — declarative subject catalogue per (level × curriculum_track)
--
-- The SOW builder authors templates per (level × curriculum_track). To show
-- only the subjects a section-type actually teaches, we need a configurable
-- scope table separate from subject_configs (which is for grading weights and
-- does not differentiate by curriculum_track).
--
-- Populated by school_admin via /sis/admin/sow.  The SOW builder filters its
-- subject picker using this table when a section is selected.

-- ─── 1. sow_subject_scopes ───────────────────────────────────────────────────

create table if not exists public.sow_subject_scopes (
  id               uuid primary key default gen_random_uuid(),
  level_id         uuid not null references public.levels(id) on delete cascade,
  curriculum_track text not null
    check (curriculum_track in ('cambridge', 'o_level', 'singapore_inspired')),
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now(),
  unique (level_id, curriculum_track, subject_id)
);

comment on table public.sow_subject_scopes is
  'Declares which subjects are taught at each (level × curriculum_track) combination. '
  'Used by the SOW builder to filter the subject picker when a section is selected. '
  'Managed by school_admin at /sis/admin/sow.';

-- ─── 2. Seed — Primary levels (all singapore_inspired) ───────────────────────
-- Primary P1–P6: ENG MATH MT SCI SS MUSIC ARTS PE HE CL

insert into public.sow_subject_scopes (level_id, curriculum_track, subject_id, sort_order)
select l.id, 'singapore_inspired', s.id,
       row_number() over (partition by l.id order by s.name) - 1
from public.levels l
cross join public.subjects s
where l.level_type = 'primary'
  and s.code in ('ENG','MATH','MT','SCI','SS','MUSIC','ARTS','PE','HE','CL')
on conflict (level_id, curriculum_track, subject_id) do nothing;

-- ─── 3. Seed — Secondary Standard (S1–S4, singapore_inspired) ────────────────
-- All secondary subjects except LIT (Cambridge-track only)

insert into public.sow_subject_scopes (level_id, curriculum_track, subject_id, sort_order)
select l.id, 'singapore_inspired', s.id,
       row_number() over (partition by l.id order by s.name) - 1
from public.levels l
cross join public.subjects s
where l.level_type = 'secondary'
  and l.code in ('S1','S2','S3','S4')
  and s.code in ('ENG','MATH','SCI','HIST','HUM','ECON','CA','PEH','PMPD','CCA')
on conflict (level_id, curriculum_track, subject_id) do nothing;

-- ─── 4. Seed — Secondary Cambridge (S1–S2, cambridge) ────────────────────────
-- Global/Cambridge sections teach LIT in addition to core subjects.
-- S3–S4 are single-track (all sections singapore_inspired).

insert into public.sow_subject_scopes (level_id, curriculum_track, subject_id, sort_order)
select l.id, 'cambridge', s.id,
       row_number() over (partition by l.id order by s.name) - 1
from public.levels l
cross join public.subjects s
where l.level_type = 'secondary'
  and l.code in ('S1','S2')
  and s.code in ('ENG','MATH','SCI','HIST','LIT','HUM','ECON','CA','PEH','PMPD','CCA')
on conflict (level_id, curriculum_track, subject_id) do nothing;

-- HFSE Markbook — teacher assignments
-- Maps Supabase auth users (teachers) to the sections and subjects they're
-- responsible for. Two roles:
--   * form_adviser     — one per section, no subject_id (owns adviser comments
--                        + appears as the section's adviser on the report card)
--   * subject_teacher  — one per (section, subject) pair, enters grades for
--                        that grading sheet
--
-- teacher_user_id references auth.users(id). We don't declare an FK across
-- schemas (Supabase convention) because managed auth columns are not meant
-- to be FK-pinned from app tables; the service role enforces validity when
-- writing assignments and the UI only surfaces existing users.

create table if not exists public.teacher_assignments (
  id                uuid primary key default gen_random_uuid(),
  teacher_user_id   uuid not null,
  section_id        uuid not null references public.sections(id) on delete cascade,
  subject_id        uuid references public.subjects(id) on delete cascade,
  role              text not null check (role in ('form_adviser', 'subject_teacher')),
  created_at        timestamptz not null default now()
);

-- A subject_teacher can only be assigned once per (section, subject).
create unique index if not exists teacher_assignments_subject_teacher_unique
  on public.teacher_assignments (teacher_user_id, section_id, subject_id)
  where role = 'subject_teacher';

-- Only one form_adviser per section, period — regardless of which user.
create unique index if not exists teacher_assignments_form_adviser_unique
  on public.teacher_assignments (section_id)
  where role = 'form_adviser';

-- form_adviser rows must NOT carry a subject_id; subject_teacher rows MUST.
alter table public.teacher_assignments
  add constraint teacher_assignments_role_subject_shape check (
    (role = 'form_adviser'    and subject_id is null) or
    (role = 'subject_teacher' and subject_id is not null)
  );

-- Lookup index for "what does this teacher have?"
create index if not exists teacher_assignments_by_user
  on public.teacher_assignments (teacher_user_id);

-- RLS — permissive authenticated read for now, consistent with the rest of
-- the schema. Writes go through the service role in API routes.
alter table public.teacher_assignments enable row level security;
create policy teacher_assignments_auth_read
  on public.teacher_assignments for select
  to authenticated using (true);

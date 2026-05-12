-- Migration 043 — widen audit_log.entity_id from uuid to text
--
-- The column was declared `uuid` in migration 006, but the codebase has
-- always treated it as free-form text. Real consumers write strings:
--
--   - app/api/sis/students/[enroleeNumber]/transfer-section/route.ts
--     writes `entityId: enroleeNumber` ('AY9999-ENR-0042' style).
--   - app/api/sis/students/[enroleeNumber]/document/[slotKey]/route.ts
--     writes `entityId: \`${enroleeNumber}:${slotKey}\``.
--   - Various other routes use enroleeNumber, studentNumber, or compound
--     keys — all non-UUID strings.
--
-- PostgreSQL rejected those inserts. `lib/audit/log-action.ts` catches
-- the error + logs to console, so the route call still succeeded but
-- the audit row silently never landed. The /records/movements page
-- depends on `audit_log.action='student.section.transfer'` rows for
-- the Transfers tab; bug surfaced when the test-AY seeder hit the
-- same constraint inserting synthetic transfer rows.
--
-- Widen to text. Existing UUID-shaped values stay valid (they're just
-- represented as text now). The btree index on (entity_type, entity_id)
-- works fine on text. Existing reads via `.eq('entity_id', uuid)` /
-- `.in('id', metaIds)` joins from `lib/sis/movements.ts` continue to
-- work because PostgreSQL can compare a uuid-shaped text string to a
-- uuid column with an explicit cast at the JS-client → SQL boundary
-- (Supabase's client serialises text values; PG handles the uuid side).

alter table public.audit_log
  alter column entity_id type text using entity_id::text;

comment on column public.audit_log.entity_id is
  'Free-form identifier for the entity the action mutated. Usually a UUID '
  'string (section_students.id, grading_sheet.id, etc.) but also accepts '
  'AY-prefixed enroleeNumber strings, compound keys (enroleeNumber:slotKey), '
  'and other domain identifiers. NULL for batch actions (e.g. student.sync). '
  'Lookups join back to the right table via entity_type discrimination.';

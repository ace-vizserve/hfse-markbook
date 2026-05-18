-- 052_audit_log_query_indexes.sql
-- Append-only audit log: read-side performance for per-module audit-log
-- pages. Every page uses .in('action', ALLOWLIST).order('created_at', desc).
-- The first index covers that shape; the others cover client-side filter
-- pivots exposed by <AuditLogDataTable> (actor, entity, entity_type).
-- No insert-cost concern — audit_log is append-only (Hard Rule #6).

create index if not exists audit_log_action_created_at_idx
  on audit_log (action, created_at desc);

create index if not exists audit_log_actor_email_created_at_idx
  on audit_log (actor_email, created_at desc);

-- Partial: entity_id is nullable; rows without one don't benefit from this index.
create index if not exists audit_log_entity_id_created_at_idx
  on audit_log (entity_id, created_at desc)
  where entity_id is not null;

create index if not exists audit_log_entity_type_created_at_idx
  on audit_log (entity_type, created_at desc);

-- Platform tables. Owned by the paved road, not by any tool.

create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_sub text not null,
  actor_email text not null,
  actor_roles text[] not null default '{}',
  tool text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  subject_id text,
  outcome text not null default 'allowed',
  request_id text,
  ip text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_subject_idx on audit_log (subject_id, occurred_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_sub, occurred_at desc);
create index if not exists audit_log_tool_idx on audit_log (tool, occurred_at desc);

-- Append-only: the audit trail is evidence, so tools must not be able to rewrite it.
create or replace function audit_log_is_append_only() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log
  for each statement execute function audit_log_is_append_only();

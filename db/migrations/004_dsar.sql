-- Data subject requests, added by tool #3 without changing the platform.

create table if not exists dsar_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references customers (id) on delete cascade,
  request_type text not null check (request_type in ('access', 'erasure', 'correction', 'portability')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'fulfilled', 'refused')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null,
  closed_at timestamptz,
  closed_by text,
  resolution_note text
);

create index if not exists dsar_requests_status_idx on dsar_requests (status, due_at);
create index if not exists dsar_requests_customer_idx on dsar_requests (customer_id);

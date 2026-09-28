-- Customer complaints, added by tool #4 without changing the platform.

create sequence if not exists complaints_reference_seq start with 80000;

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references customers (id) on delete cascade,
  category text not null check (category in ('billing', 'service', 'access', 'fees', 'other')),
  channel text not null check (channel in ('phone', 'email', 'branch', 'web')),
  summary text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'upheld', 'rejected', 'withdrawn')),
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  closed_at timestamptz,
  closed_by text,
  logged_by text not null,
  outcome_note text
);

create index if not exists complaints_status_idx on complaints (status, due_at);
create index if not exists complaints_customer_idx on complaints (customer_id);

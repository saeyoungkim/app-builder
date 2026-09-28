-- Customer accounts locked after failed authentication attempts, added by tool #5.

create table if not exists account_locks (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references customers (id) on delete cascade,
  lock_reason text not null check (lock_reason in ('password', 'one_time_code', 'security_question')),
  channel text not null check (channel in ('web', 'mobile', 'phone')),
  failed_attempts integer not null check (failed_attempts > 0),
  last_failed_at timestamptz not null,
  locked_at timestamptz not null default now(),
  status text not null default 'locked' check (status in ('locked', 'unlocked')),
  unlocked_at timestamptz,
  unlocked_by text,
  unlock_note text
);

create unique index if not exists account_locks_one_active_idx on account_locks (customer_id) where status = 'locked';
create index if not exists account_locks_status_idx on account_locks (status, locked_at);

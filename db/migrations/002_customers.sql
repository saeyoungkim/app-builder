-- Customer domain. Shared by both tools; neither owns it.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  full_name text not null,
  email text not null,
  phone text not null,
  date_of_birth date not null,
  national_id text not null,
  address_line text not null,
  city text not null,
  country_code text not null,
  region text not null check (region in ('EMEA', 'AMER', 'APAC')),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  risk_tier text not null default 'standard' check (risk_tier in ('standard', 'enhanced', 'prohibited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_region_idx on customers (region);
create index if not exists customers_status_idx on customers (status);

create table if not exists customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_notes_customer_idx on customer_notes (customer_id, created_at desc);

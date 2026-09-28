-- KYC review domain, added by tool #2 without changing the platform.

create table if not exists kyc_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references customers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'approved', 'rejected', 'escalated')),
  risk_score integer not null check (risk_score between 0 and 100),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  decision_reason text
);

create index if not exists kyc_cases_status_idx on kyc_cases (status, submitted_at);
create index if not exists kyc_cases_customer_idx on kyc_cases (customer_id);

create table if not exists kyc_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references kyc_cases (id) on delete cascade,
  doc_type text not null check (doc_type in ('passport', 'national_id', 'proof_of_address', 'selfie')),
  verification_state text not null default 'pending' check (verification_state in ('pending', 'verified', 'failed')),
  uploaded_at timestamptz not null default now()
);

create index if not exists kyc_documents_case_idx on kyc_documents (case_id);

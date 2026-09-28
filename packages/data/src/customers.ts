import {
  applyFieldPolicy,
  regionScope,
  type FieldPolicy,
  type Principal,
  type Queryable,
} from "@paved/platform";

/**
 * The customer record is defined once, with its field classifications, and
 * every tool reads it through here. Row-level region scoping and PII masking
 * are therefore impossible to forget.
 */
export const CUSTOMER_FIELD_POLICY: FieldPolicy = {
  full_name: "pii",
  email: "pii",
  phone: "pii",
  date_of_birth: "pii",
  national_id: "sensitive-pii",
  address_line: "pii",
  city: "internal",
  country_code: "internal",
  region: "internal",
  status: "internal",
  risk_tier: "internal",
};

export interface CustomerRow {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  national_id: string;
  address_line: string;
  city: string;
  country_code: string;
  region: string;
  status: string;
  risk_tier: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export interface ListCustomersQuery {
  search?: string;
  status?: string;
  riskTier?: string;
  limit?: number;
  offset?: number;
}

function scopeClause(principal: Principal, params: unknown[]): string {
  const scope = regionScope(principal);
  if (scope.all) return "true";
  if (scope.regions.length === 0) return "false";
  params.push(scope.regions);
  return `region = any($${params.length}::text[])`;
}

export async function listCustomers(
  db: Queryable,
  principal: Principal,
  query: ListCustomersQuery,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [scopeClause(principal, params)];

  if (query.search) {
    params.push(`%${query.search.toLowerCase()}%`);
    where.push(`(lower(full_name) like $${params.length} or lower(email) like $${params.length} or lower(reference) like $${params.length})`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.riskTier) {
    params.push(query.riskTier);
    where.push(`risk_tier = $${params.length}`);
  }

  const limit = Math.min(query.limit ?? 25, 100);
  const offset = query.offset ?? 0;
  params.push(limit, offset);

  const sql = `select *, count(*) over () as total_count
               from customers
               where ${where.join(" and ")}
               order by created_at desc
               limit $${params.length - 1} offset $${params.length}`;

  const result = await db.query<CustomerRow & { total_count: string }>(sql, params);
  const total = Number(result.rows[0]?.total_count ?? 0);
  const rows = result.rows.map(({ total_count: _ignored, ...row }) =>
    applyFieldPolicy(row as CustomerRow, CUSTOMER_FIELD_POLICY, principal),
  );
  return { rows, total };
}

export async function getCustomer(
  db: Queryable,
  principal: Principal,
  id: string,
): Promise<CustomerRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const result = await db.query<CustomerRow>(`select * from customers where id = $1 and ${scope}`, params);
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, CUSTOMER_FIELD_POLICY, principal);
}

export async function updateCustomer(
  db: Queryable,
  principal: Principal,
  id: string,
  patch: { status?: string; risk_tier?: string; address_line?: string; city?: string; phone?: string },
): Promise<CustomerRow | undefined> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getCustomer(db, principal, id);

  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const sets = entries.map(([field, value]) => {
    params.push(value);
    return `${field} = $${params.length}`;
  });

  const result = await db.query<CustomerRow>(
    `update customers set ${sets.join(", ")}, updated_at = now() where id = $1 and ${scope} returning *`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, CUSTOMER_FIELD_POLICY, principal);
}

export async function listNotes(db: Queryable, customerId: string): Promise<CustomerNote[]> {
  const result = await db.query<CustomerNote>(
    `select * from customer_notes where customer_id = $1 order by created_at desc`,
    [customerId],
  );
  return result.rows;
}

export async function addNote(
  db: Queryable,
  customerId: string,
  authorEmail: string,
  body: string,
): Promise<CustomerNote> {
  const result = await db.query<CustomerNote>(
    `insert into customer_notes (customer_id, author_email, body) values ($1,$2,$3) returning *`,
    [customerId, authorEmail, body],
  );
  return result.rows[0]!;
}

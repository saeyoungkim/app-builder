import { applyFieldPolicy, regionScope, type Principal, type Queryable } from "@paved/platform";
import { CUSTOMER_FIELD_POLICY } from "./customers.js";

export interface AccountLockRow {
  id: string;
  reference: string;
  customer_id: string;
  lock_reason: string;
  channel: string;
  failed_attempts: number;
  last_failed_at: string;
  locked_at: string;
  status: string;
  unlocked_at: string | null;
  unlocked_by: string | null;
  unlock_note: string | null;
  customer_reference: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  country_code: string;
  region: string;
  customer_status: string;
  customer_since: string;
  [key: string]: unknown;
}

const ACCOUNT_LOCK_FIELD_POLICY = {
  full_name: CUSTOMER_FIELD_POLICY.full_name ?? "pii",
  email: CUSTOMER_FIELD_POLICY.email ?? "pii",
  phone: CUSTOMER_FIELD_POLICY.phone ?? "pii",
} as const;

function scopeClause(principal: Principal, params: unknown[]): string {
  const scope = regionScope(principal);
  if (scope.all) return "true";
  if (scope.regions.length === 0) return "false";
  params.push(scope.regions);
  return `c.region = any($${params.length}::text[])`;
}

/** Basic profile only: identity and contact for verification, never DOB, national ID or address. */
const PROFILE_COLUMNS = `c.reference as customer_reference, c.full_name, c.email, c.phone, c.city,
  c.country_code, c.region, c.status as customer_status, c.created_at as customer_since`;

export async function listAccountLocks(
  db: Queryable,
  principal: Principal,
  query: { status?: string; reason?: string; limit?: number; offset?: number },
): Promise<{ rows: AccountLockRow[]; total: number }> {
  const params: unknown[] = [];
  const where = [scopeClause(principal, params)];
  if (query.status) {
    params.push(query.status);
    where.push(`l.status = $${params.length}`);
  }
  if (query.reason) {
    params.push(query.reason);
    where.push(`l.lock_reason = $${params.length}`);
  }
  const limit = Math.min(query.limit ?? 25, 100);
  const offset = query.offset ?? 0;
  params.push(limit, offset);

  const result = await db.query<AccountLockRow & { total_count: string }>(
    `select l.*, ${PROFILE_COLUMNS}, count(*) over () as total_count
     from account_locks l
     join customers c on c.id = l.customer_id
     where ${where.join(" and ")}
     order by l.locked_at asc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);
  const rows = result.rows.map(({ total_count: _ignored, ...row }) =>
    applyFieldPolicy(row as AccountLockRow, ACCOUNT_LOCK_FIELD_POLICY, principal),
  );
  return { rows, total };
}

export async function getAccountLock(
  db: Queryable,
  principal: Principal,
  id: string,
): Promise<AccountLockRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const result = await db.query<AccountLockRow>(
    `select l.*, ${PROFILE_COLUMNS}
     from account_locks l join customers c on c.id = l.customer_id
     where l.id = $1 and ${scope}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, ACCOUNT_LOCK_FIELD_POLICY, principal);
}

/** Only a lock that is still in place can be lifted; a miss means it is gone, out of scope or already unlocked. */
export async function unlockAccount(
  db: Queryable,
  principal: Principal,
  id: string,
  note: string,
): Promise<AccountLockRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  params.push(note, principal.email);
  const result = await db.query<AccountLockRow>(
    `update account_locks l
     set status = 'unlocked',
         unlock_note = $${params.length - 1},
         unlocked_by = $${params.length},
         unlocked_at = now()
     from customers c
     where l.id = $1 and c.id = l.customer_id and ${scope}
       and l.status = 'locked'
     returning l.*, ${PROFILE_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, ACCOUNT_LOCK_FIELD_POLICY, principal);
}

import { applyFieldPolicy, regionScope, type Principal, type Queryable } from "@paved/platform";
import { CUSTOMER_FIELD_POLICY } from "./customers.js";

export interface ComplaintRow {
  id: string;
  reference: string;
  customer_id: string;
  category: string;
  channel: string;
  summary: string;
  status: string;
  opened_at: string;
  due_at: string;
  closed_at: string | null;
  closed_by: string | null;
  logged_by: string;
  outcome_note: string | null;
  customer_reference: string;
  full_name: string;
  email: string;
  region: string;
  [key: string]: unknown;
}

const COMPLAINT_FIELD_POLICY = {
  full_name: CUSTOMER_FIELD_POLICY.full_name ?? "pii",
  email: CUSTOMER_FIELD_POLICY.email ?? "pii",
} as const;

/** The statutory clock: a final response is owed eight weeks after the complaint is logged. */
export const FINAL_RESPONSE_DAYS = 56;

function scopeClause(principal: Principal, params: unknown[]): string {
  const scope = regionScope(principal);
  if (scope.all) return "true";
  if (scope.regions.length === 0) return "false";
  params.push(scope.regions);
  return `c.region = any($${params.length}::text[])`;
}

const SELECT = `select k.*, c.reference as customer_reference, c.full_name, c.email, c.region`;

export async function listComplaints(
  db: Queryable,
  principal: Principal,
  query: { status?: string; category?: string; breachedOnly?: boolean; limit?: number; offset?: number },
): Promise<{ rows: ComplaintRow[]; total: number }> {
  const params: unknown[] = [];
  const where = [scopeClause(principal, params)];
  if (query.status) {
    params.push(query.status);
    where.push(`k.status = $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    where.push(`k.category = $${params.length}`);
  }
  if (query.breachedOnly) {
    where.push(`k.due_at < now() and k.status in ('open', 'investigating')`);
  }
  const limit = Math.min(query.limit ?? 25, 100);
  const offset = query.offset ?? 0;
  params.push(limit, offset);

  const result = await db.query<ComplaintRow & { total_count: string }>(
    `${SELECT}, count(*) over () as total_count
     from complaints k
     join customers c on c.id = k.customer_id
     where ${where.join(" and ")}
     order by k.due_at asc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);
  const rows = result.rows.map(({ total_count: _ignored, ...row }) =>
    applyFieldPolicy(row as ComplaintRow, COMPLAINT_FIELD_POLICY, principal),
  );
  return { rows, total };
}

export async function getComplaint(
  db: Queryable,
  principal: Principal,
  id: string,
): Promise<ComplaintRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const result = await db.query<ComplaintRow>(
    `${SELECT} from complaints k join customers c on c.id = k.customer_id
     where k.id = $1 and ${scope}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, COMPLAINT_FIELD_POLICY, principal);
}

/**
 * Logging a complaint is scoped like every other write: the customer must be inside the
 * principal's regions, so an out-of-region reference cannot be created blind.
 */
export async function logComplaint(
  db: Queryable,
  principal: Principal,
  input: { customerReference: string; category: string; channel: string; summary: string },
): Promise<ComplaintRow | undefined> {
  const params: unknown[] = [input.customerReference];
  const scope = scopeClause(principal, params);
  params.push(input.category, input.channel, input.summary, principal.email, FINAL_RESPONSE_DAYS);
  const result = await db.query<ComplaintRow>(
    `with target as (select id from customers c where c.reference = $1 and ${scope})
     insert into complaints (reference, customer_id, category, channel, summary, logged_by, due_at)
     select 'CMP-' || lpad((nextval('complaints_reference_seq'))::text, 5, '0'),
            target.id, $${params.length - 4}, $${params.length - 3}, $${params.length - 2}, $${params.length - 1},
            now() + ($${params.length} || ' days')::interval
     from target
     returning *`,
    params,
  );
  const created = result.rows[0];
  if (!created) return undefined;
  return getComplaint(db, principal, created.id);
}

export type ComplaintOutcome = "investigating" | "upheld" | "rejected" | "withdrawn";

export async function closeComplaint(
  db: Queryable,
  principal: Principal,
  id: string,
  outcome: ComplaintOutcome,
  note: string,
): Promise<ComplaintRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const terminal = outcome !== "investigating";
  params.push(outcome, note, principal.email);
  const result = await db.query<ComplaintRow>(
    `update complaints k
     set status = $${params.length - 2},
         outcome_note = $${params.length - 1},
         closed_by = case when ${terminal} then $${params.length} else k.closed_by end,
         closed_at = case when ${terminal} then now() else k.closed_at end
     from customers c
     where k.id = $1 and c.id = k.customer_id and ${scope}
       and k.status in ('open', 'investigating')
     returning k.*, c.reference as customer_reference, c.full_name, c.email, c.region`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, COMPLAINT_FIELD_POLICY, principal);
}

export async function complaintStats(
  db: Queryable,
  principal: Principal,
): Promise<{ status: string; count: number; breached: number }[]> {
  const params: unknown[] = [];
  const scope = scopeClause(principal, params);
  const result = await db.query<{ status: string; count: string; breached: string }>(
    `select k.status, count(*) as count,
            count(*) filter (where k.due_at < now() and k.status in ('open','investigating')) as breached
     from complaints k join customers c on c.id = k.customer_id
     where ${scope}
     group by k.status order by k.status`,
    params,
  );
  return result.rows.map((r) => ({ status: r.status, count: Number(r.count), breached: Number(r.breached) }));
}

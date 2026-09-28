import { applyFieldPolicy, regionScope, type Principal, type Queryable } from "@paved/platform";
import { CUSTOMER_FIELD_POLICY } from "./customers.js";

export interface DsarRequestRow {
  id: string;
  reference: string;
  customer_id: string;
  request_type: string;
  status: string;
  received_at: string;
  due_at: string;
  closed_at: string | null;
  closed_by: string | null;
  resolution_note: string | null;
  customer_reference: string;
  full_name: string;
  email: string;
  region: string;
  [key: string]: unknown;
}

const DSAR_FIELD_POLICY = {
  full_name: CUSTOMER_FIELD_POLICY.full_name ?? "pii",
  email: CUSTOMER_FIELD_POLICY.email ?? "pii",
} as const;

function scopeClause(principal: Principal, params: unknown[]): string {
  const scope = regionScope(principal);
  if (scope.all) return "true";
  if (scope.regions.length === 0) return "false";
  params.push(scope.regions);
  return `c.region = any($${params.length}::text[])`;
}

const SELECT = `select d.*, c.reference as customer_reference, c.full_name, c.email, c.region`;

export async function listRequests(
  db: Queryable,
  principal: Principal,
  query: { status?: string; requestType?: string; overdueOnly?: boolean; limit?: number; offset?: number },
): Promise<{ rows: DsarRequestRow[]; total: number }> {
  const params: unknown[] = [];
  const where = [scopeClause(principal, params)];
  if (query.status) {
    params.push(query.status);
    where.push(`d.status = $${params.length}`);
  }
  if (query.requestType) {
    params.push(query.requestType);
    where.push(`d.request_type = $${params.length}`);
  }
  if (query.overdueOnly) {
    where.push(`d.due_at < now() and d.status in ('open', 'in_progress')`);
  }
  const limit = Math.min(query.limit ?? 25, 100);
  const offset = query.offset ?? 0;
  params.push(limit, offset);

  const result = await db.query<DsarRequestRow & { total_count: string }>(
    `${SELECT}, count(*) over () as total_count
     from dsar_requests d
     join customers c on c.id = d.customer_id
     where ${where.join(" and ")}
     order by d.due_at asc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);
  const rows = result.rows.map(({ total_count: _ignored, ...row }) =>
    applyFieldPolicy(row as DsarRequestRow, DSAR_FIELD_POLICY, principal),
  );
  return { rows, total };
}

export async function getRequest(
  db: Queryable,
  principal: Principal,
  id: string,
): Promise<DsarRequestRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const result = await db.query<DsarRequestRow>(
    `${SELECT} from dsar_requests d join customers c on c.id = d.customer_id
     where d.id = $1 and ${scope}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, DSAR_FIELD_POLICY, principal);
}

export type DsarResolution = "in_progress" | "fulfilled" | "refused";

export async function resolveRequest(
  db: Queryable,
  principal: Principal,
  id: string,
  resolution: DsarResolution,
  note: string,
): Promise<DsarRequestRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const terminal = resolution === "fulfilled" || resolution === "refused";
  params.push(resolution, note, principal.email);
  const result = await db.query<DsarRequestRow>(
    `update dsar_requests d
     set status = $${params.length - 2},
         resolution_note = $${params.length - 1},
         closed_by = case when ${terminal} then $${params.length} else d.closed_by end,
         closed_at = case when ${terminal} then now() else d.closed_at end
     from customers c
     where d.id = $1 and c.id = d.customer_id and ${scope}
       and d.status not in ('fulfilled', 'refused')
     returning d.*, c.reference as customer_reference, c.full_name, c.email, c.region`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, DSAR_FIELD_POLICY, principal);
}

export async function slaStats(
  db: Queryable,
  principal: Principal,
): Promise<{ status: string; count: number; overdue: number }[]> {
  const params: unknown[] = [];
  const scope = scopeClause(principal, params);
  const result = await db.query<{ status: string; count: string; overdue: string }>(
    `select d.status, count(*) as count,
            count(*) filter (where d.due_at < now() and d.status in ('open','in_progress')) as overdue
     from dsar_requests d join customers c on c.id = d.customer_id
     where ${scope}
     group by d.status order by d.status`,
    params,
  );
  return result.rows.map((r) => ({ status: r.status, count: Number(r.count), overdue: Number(r.overdue) }));
}

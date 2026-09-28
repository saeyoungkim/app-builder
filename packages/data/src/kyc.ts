import { applyFieldPolicy, regionScope, type Principal, type Queryable } from "@paved/platform";
import { CUSTOMER_FIELD_POLICY } from "./customers.js";

export interface KycCaseRow {
  id: string;
  reference: string;
  customer_id: string;
  status: string;
  risk_score: number;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  customer_reference: string;
  full_name: string;
  region: string;
  [key: string]: unknown;
}

export interface KycDocument {
  id: string;
  case_id: string;
  doc_type: string;
  verification_state: string;
  uploaded_at: string;
}

const CASE_FIELD_POLICY = { full_name: CUSTOMER_FIELD_POLICY.full_name ?? "pii" } as const;

function scopeClause(principal: Principal, params: unknown[]): string {
  const scope = regionScope(principal);
  if (scope.all) return "true";
  if (scope.regions.length === 0) return "false";
  params.push(scope.regions);
  return `c.region = any($${params.length}::text[])`;
}

export async function listCases(
  db: Queryable,
  principal: Principal,
  query: { status?: string; minRisk?: number; limit?: number; offset?: number },
): Promise<{ rows: KycCaseRow[]; total: number }> {
  const params: unknown[] = [];
  const where = [scopeClause(principal, params)];
  if (query.status) {
    params.push(query.status);
    where.push(`k.status = $${params.length}`);
  }
  if (typeof query.minRisk === "number") {
    params.push(query.minRisk);
    where.push(`k.risk_score >= $${params.length}`);
  }
  const limit = Math.min(query.limit ?? 25, 100);
  const offset = query.offset ?? 0;
  params.push(limit, offset);

  const result = await db.query<KycCaseRow & { total_count: string }>(
    `select k.*, c.reference as customer_reference, c.full_name, c.region, count(*) over () as total_count
     from kyc_cases k
     join customers c on c.id = k.customer_id
     where ${where.join(" and ")}
     order by k.risk_score desc, k.submitted_at asc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);
  const rows = result.rows.map(({ total_count: _ignored, ...row }) =>
    applyFieldPolicy(row as KycCaseRow, CASE_FIELD_POLICY, principal),
  );
  return { rows, total };
}

export async function getCase(
  db: Queryable,
  principal: Principal,
  id: string,
): Promise<(KycCaseRow & { documents: KycDocument[] }) | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const result = await db.query<KycCaseRow>(
    `select k.*, c.reference as customer_reference, c.full_name, c.region
     from kyc_cases k join customers c on c.id = k.customer_id
     where k.id = $1 and ${scope}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const docs = await db.query<KycDocument>(
    `select * from kyc_documents where case_id = $1 order by uploaded_at`,
    [id],
  );
  return { ...applyFieldPolicy(row, CASE_FIELD_POLICY, principal), documents: docs.rows };
}

export type Decision = "approved" | "rejected" | "escalated" | "in_review";

export async function decideCase(
  db: Queryable,
  principal: Principal,
  id: string,
  decision: Decision,
  reason: string,
): Promise<KycCaseRow | undefined> {
  const params: unknown[] = [id];
  const scope = scopeClause(principal, params);
  const terminal = decision === "approved" || decision === "rejected";
  params.push(decision, reason, principal.email);
  const result = await db.query<KycCaseRow>(
    `update kyc_cases k
     set status = $${params.length - 2},
         decision_reason = $${params.length - 1},
         decided_by = case when ${terminal} then $${params.length} else k.decided_by end,
         decided_at = case when ${terminal} then now() else k.decided_at end
     from customers c
     where k.id = $1 and c.id = k.customer_id and ${scope}
     returning k.*, c.reference as customer_reference, c.full_name, c.region`,
    params,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return applyFieldPolicy(row, CASE_FIELD_POLICY, principal);
}

export async function queueStats(
  db: Queryable,
  principal: Principal,
): Promise<{ status: string; count: number }[]> {
  const params: unknown[] = [];
  const scope = scopeClause(principal, params);
  const result = await db.query<{ status: string; count: string }>(
    `select k.status, count(*) as count
     from kyc_cases k join customers c on c.id = k.customer_id
     where ${scope}
     group by k.status order by k.status`,
    params,
  );
  return result.rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

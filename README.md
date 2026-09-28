# Paved road — internal tools prototype

A prototype that answers one question: **what does the *next* internal tool cost?**

Power Apps makes tool #1 cheap. The argument for owning the stack only works if tool #11
is cheaper still, and that depends entirely on what a new tool inherits rather than
rebuilds. So this repository is a shared platform plus three tools built on it, and the
interesting number is not the first one.

Everything here is synthetic. No production data, no real customers, no money movement.

## What is shared vs. what a tool writes

| Capability | Lives in | A tool writes |
|---|---|---|
| OIDC login, PKCE, session cookie | `packages/platform` | nothing |
| Groups → roles → permissions | `packages/platform/src/rbac.ts` | a permission name per route |
| Row-level region scope | `packages/platform` + `packages/data` | nothing |
| Field-level PII masking | `packages/platform/src/field-policy.ts` | a field classification, once per entity |
| Audit log (append-only) | `packages/platform/src/audit.ts` | one `req.audit({...})` per meaningful action |
| Customer / KYC / DSAR data access | `packages/data` | a query call |
| Grids, filters, forms, detail panes, app shell | `packages/ui` | composition |
| Container topology, environments | `infra/` | a map entry in `infra/variables.tf` |
| Authorization + policy gate | `.github/workflows/ci.yml` | nothing |

The three tools:

- **`apps/customer-console`** — tool #1. Search, list, detail, edit and note customer
  records, with PII masking and region scoping.
- **`apps/kyc-queue`** — tool #2. A review queue over the same customers: filter by risk
  and status, open a case with its documents, record a decision with a reason.
- **`apps/dsar-console`** — tool #3. A data-subject-request queue: filter by status, type
  and SLA breach, open a request, resolve it with a note. Built after the fact to show
  what a new tool costs; `docs/ADDING-A-TOOL.md` is the procedure it followed.

Tools #2 and #3 are ~80 and ~90 lines of routes and contain no authentication, no role
logic, no masking, no audit plumbing and no infrastructure. See `docs/RESULTS.md`.

## Run it locally

Requires Node 22 and Docker.

```bash
docker run -d --name paved-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=devuser \
  -e POSTGRES_DB=paved -p 5432:5432 postgres:16

cp .env.example .env
npm install
npm run build:packages
npm run db:reset     # migrate + seed 120 synthetic customers, KYC cases and DSARs
npm run dev          # local IdP + every API + every front end
```

| Service | URL |
|---|---|
| Customer console | http://localhost:3001 |
| KYC review queue | http://localhost:3002 |
| Data subject requests | http://localhost:3003 |
| Local OIDC provider | http://localhost:9000 |

### Test users

The local provider accepts **any password**. It exists to prove the OIDC wiring and the
group→role mapping; it is not an identity service and must never run outside dev/CI.

| Sign in as | Groups | Sees |
|---|---|---|
| `sam.support@example-synthetic.test` | `internal-support`, `region-EMEA` | EMEA customers and DSARs, all PII masked, no edit, no KYC, cannot resolve a DSAR |
| `dana.steward@example-synthetic.test` | `data-stewards`, `region-global` | every region, PII in the clear, can edit and resolve DSARs — but no KYC decisions |
| `ken.reviewer@example-synthetic.test` | `kyc-reviewers`, `region-APAC` | APAC KYC cases only, can decide; no DSAR access |
| `avery.admin@example-synthetic.test` | `compliance-admins`, `region-global` | everything, including the audit log |

Roles come from directory groups only. There is no user-role table to drift, and no
in-app admin screen that can grant someone a permission the directory did not.

## Verify it

```bash
npm run lint
npm run typecheck
npm test          # 40 tests: authorization, region scope, PII masking, audit
```

The tests are the point of the CI gate: they assert that a support user cannot write, that
a regional user gets a 404 rather than a redaction for out-of-region rows, that the audit
log rejects `UPDATE` and `DELETE` at the database level, and that every denial is recorded.
A second CI job fails the build if a tool imports `pg` or touches a session cookie directly.

## Infrastructure

`infra/` is Terraform, Docker-backed so it runs anywhere. A tool is a map entry:

```hcl
tools = {
  customer-console = { api_port = 4001, web_port = 3001 }
  kyc-queue        = { api_port = 4002, web_port = 3002 }
  dsar-console     = { api_port = 4003, web_port = 3003 }
}
```

The provider blocks are the only thing that changes when this targets a real cloud; the
module interface (API container, web container, shared database, shared IdP) does not.

## Deliberately not here

No production data or PII, no money movement, no refunds tool, no Power Apps cutover, no
production hardening, no DR drill, no on-call. The local IdP proves the wiring, not an
integration with a corporate directory. See `docs/RESULTS.md` for what this does and does
not prove.

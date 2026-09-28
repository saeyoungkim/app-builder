# What the prototype shows

The acceptance line agreed before any code was written: **tool #2 lands in ≤ 1/3 the
elapsed time of tool #1, inheriting authentication, roles, audit and deployment.**

## The measurement

| | Tool #1 — customer console | Tool #2 — KYC review queue |
|---|---|---|
| Elapsed build time | the platform + the tool | ~1/5 of tool #1 |
| API code written | 116 lines of routes **plus** the entire platform (auth, RBAC, masking, audit, config, data layer, migrations, IdP, UI library, infra) | 81 lines of routes |
| Auth code written | shared | none |
| Role/permission code | shared, 82 lines | 2 permission strings |
| PII masking code | shared, 41 lines | none — inherited via `@paved/data` |
| Audit code | shared, 60 lines | 4 `req.audit({...})` calls |
| Row-level scoping | shared | none — inherited |
| UI primitives | 12 components built | 0 built, 9 reused |
| Infrastructure | module written | one map entry |
| CI | pipeline written | nothing |

Tool #2's entire server is routes, a Zod schema, and audit calls. That is the claim being
tested, and it is visible in the diff rather than asserted in a slide.

The honest caveat: the two tools share a domain. A tool over an unrelated data source would
pay to add that source to `packages/data` — perhaps a day — but would still inherit identity,
roles, scoping, masking, audit, components, deployment and the CI gate unchanged.

## Verified end to end

Both tools were driven through the browser against the local OIDC provider:

- `sam.support` (internal-support, region-EMEA) — sees 37 EMEA customers of 120, every PII
  field masked server-side, audit page refused, KYC queue refused (`forbidden`).
- `ken.reviewer` (kyc-reviewers, region-APAC) — sees only APAC cases, opens a case with
  unmasked customer identity, escalates KYC-50068 with a stored reason.
- `avery.admin` (compliance-admins, region-global) — audit page shows both tools in one log:
  `customer.list`, `kyc.case.read`, `kyc.case.decide`, and the support user's two
  `authorization.denied` rows against the KYC tool.

`terraform validate` passes against `infra/`; `npm run lint`, `npm run typecheck` and the
32-test suite pass.

## Criterion by criterion

| Criterion | Status | Evidence |
|---|---|---|
| Tool #2 in ≤ 1/3 the time of tool #1 | met | table above; `apps/kyc-queue/api/src/app.ts` |
| Tool #2 inherits auth, roles, audit, deploy | met | no auth/session/audit-sink code exists in `apps/` |
| Environment rebuildable from the repo | met | `npm install && npm run db:reset && npm run dev`; `infra/` |
| Authorization tests fail on role widening | met | `tests/*.api.test.ts` — 403 on write as support, 403 on audit as steward, 404 out-of-region |
| Every read and state change queryable by actor, subject, time | met | `audit_log`, indexed by subject/actor/tool; reads audited, not only writes |
| Component library reused without new primitives | met | tool #2 imports `AppShell`, `DataTable`, `FilterBar`, `Select`, `Pill`, `Card`, `Button`, `TextArea`, `DetailList` |
| Real schema shape, synthetic values | met | `db/migrations/`, `db/seed/seed.ts` (deterministic, 120 customers) |
| Local OIDC with group claims and distinct users | met | `services/idp`, four users with different group sets |

## What a successful prototype still does not prove

1. **The local IdP is not your directory.** Group names, claim shapes and provisioning
   lifecycle are the real integration work; this proves only that the tools consume groups
   rather than storing roles.
2. **Synthetic data is not production data.** The schema shape is real; volume, skew,
   latency and the data-access review that lets a tool reach production records are not.
3. **Containers on one host are not your cloud.** The Terraform module interface transfers;
   the provider, networking, secret management and rollback mechanics do not.
4. **Two tools is not thirty.** The marginal-cost curve flattens here, but drift is a
   function of time and headcount, which a one-shot prototype cannot exercise.
5. **No one has owned this in production.** The paved road needs a named part-time owner.
   Everything in this repository degrades without one — that was the central finding of
   the analysis, and building the prototype did not change it.
6. **The cost model is unvalidated.** Nothing here measures the `$250K` line items. The
   prototype argues the marginal-cost shape; the finance case still needs the Power Apps
   spend decomposed into licences, capacity and implementation labour.

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

## Tool #3, built after the fact

Tool #3 (DSAR console — a data-subject-request queue with an SLA clock) was added later,
by following `docs/ADDING-A-TOOL.md`, to check that the curve stays flat rather than
flattening only because tools #1 and #2 were written together.

Everything written for a new entity, a new permission pair and two screens:

| File | Lines | What it is |
|---|---|---|
| `db/migrations/004_dsar.sql` | 17 | the new table |
| `packages/data/src/dsar.ts` | 136 | queries — region scope and field policy applied by calling shared helpers |
| `apps/dsar-console/api/src/app.ts` | 82 | four routes, a Zod body, four `req.audit` calls |
| `apps/dsar-console/api/src/server.ts` | 21 | `loadConfig` → `createService` → `listen` |
| `apps/dsar-console/web/app/page.tsx` | 141 | list screen, composed from `packages/ui` |
| `apps/dsar-console/web/app/requests/[id]/page.tsx` | 104 | detail + resolution screen |
| `packages/platform/src/rbac.ts` | +11 | two permission strings, assigned to three roles |
| `services/idp/src/server.ts` | +8 | one OIDC client |
| `infra/variables.tf` | +4 | one map entry |
| `package.json` | +2 | two dev scripts |

No authentication, session, cookie, JWT, masking, scoping or audit-sink code was written;
the policy CI job would have failed the build if any had been. The new permissions
(`dsar:read`, `dsar:resolve`) fan out to roles in one place, so `ken.reviewer` is refused
the new tool without the tool knowing he exists.

`tests/dsar-console.api.test.ts` (8 tests) asserts anonymous 401, KYC reviewer 403,
EMEA-only rows and 404 for an APAC request, masked `full_name`/`email` for support,
403 on resolve as support, 400 on a thin note, the audit row for the transition, and
409 on re-closing a closed request.

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
44-test suite pass. Tool #3 is covered by tests, not yet by a browser run.

One real defect came out of the browser run, and it is the argument for the shared layer
rather than against it: a KYC decision reason of ten spaces passed `z.string().min(10)`
server-side while the UI's own check rejected it, so a case could be closed with a
visually empty reason on file (audit event 190). The fix is `justification()` in
`packages/platform`, which trims before measuring; both tools picked it up by changing one
line each, and the whitespace case is now asserted for both. In a per-app world this
would have been found and fixed once per app, or not at all.

## Tool #4, from a business-terms request

Tool #3 was built by someone who had just written the platform. Tool #4 was built from a
request written the way a requester would write one, to check that the procedure — not the
memory of the author — is what carries the cost:

> A queue of customer complaints against existing customers, with the eight-week
> final-response clock on each one. Support takes complaints on the phone, so they must be
> able to log one and watch the queue, but only data stewards and compliance admins may
> close one with an outcome. Region scoping and PII masking as everywhere else, flag the
> ones past their deadline, and every read, entry and outcome must be in the audit log.

Nothing in that request is about login, roles, masking, audit or deployment. What it cost:

| File | Lines | What it is |
|---|---|---|
| `db/migrations/005_complaints.sql` | 22 | the new table and its reference sequence |
| `packages/data/src/complaints.ts` | 170 | queries — region scope and field policy applied by calling shared helpers |
| `apps/complaints-desk/api/src/app.ts` | 109 | five routes, two Zod schemas, five `req.audit` calls |
| `apps/complaints-desk/api/src/server.ts` | 21 | `loadConfig` → `createService` → `listen`, copied |
| `apps/complaints-desk/web/app/page.tsx` | 228 | queue + log form, composed from `packages/ui` |
| `apps/complaints-desk/web/app/complaints/[id]/page.tsx` | 110 | detail + outcome screen |
| `packages/platform/src/rbac.ts` | +11 | three permission strings, assigned to three roles |
| `services/idp/src/server.ts` | +8 | one OIDC client |
| `infra/variables.tf` | +4 | one map entry |
| `package.json` | +2 | two dev scripts |

The interesting line is `rbac.ts`. The request splits one entity across two privilege
levels — support may create but not close — and that split is three strings in one file,
not a branch anywhere in the tool. `ken.reviewer` is refused the whole tool without the
tool knowing he exists.

`tests/complaints-desk.api.test.ts` (10 tests) asserts anonymous 401, KYC reviewer 403,
support logging a complaint then being refused the close, EMEA-only rows and 404 for an
APAC complaint, 404 when logging against an out-of-region customer, masked
`full_name`/`email` for support, `breachedOnly=false` meaning off, 400 on a whitespace
note, the audit row for the transition, and 409 on closing a closed complaint.

`docs/demo-new-tool.mp4` records the whole run: the three existing tools up, sign-in
through the local IdP, the six steps, `lint`/`typecheck`/`test` green, and the new tool in
the browser with `sam.support` logging a complaint and being refused its closure while
`dana.steward` closes it.

The step the procedure demands and this prototype cannot satisfy is the last one: a named
owner. The complaints desk has none, for the same reason the other three do not — point 5
below.

## Tool #5, a privilege split on a single action

> A simple queue of customer accounts locked due to failed authentication attempts.
> Support agents can view locked accounts and inspect basic profile details, but only
> compliance admins may unlock an account with a required justification note. Region
> scoping and PII masking apply as everywhere else, and every view and unlock action must
> be recorded in the audit log.

| File | Lines | What it is |
|---|---|---|
| `db/migrations/006_account_locks.sql` | 19 | the new table, at most one active lock per customer |
| `packages/data/src/account-locks.ts` | 125 | queries — region scope and field policy applied by calling shared helpers |
| `apps/account-unlock/api/src/app.ts` | 69 | three routes, two Zod schemas, three `req.audit` calls |
| `apps/account-unlock/api/src/server.ts` | 21 | `loadConfig` → `createService` → `listen`, copied |
| `apps/account-unlock/web/app/page.tsx` | 104 | queue screen, composed from `packages/ui` |
| `apps/account-unlock/web/app/locks/[id]/page.tsx` | 127 | profile + lock detail + unlock screen |
| `packages/platform/src/rbac.ts` | +13 | two permission strings, assigned to two roles |
| `services/idp/src/server.ts` | +8 | one OIDC client |
| `infra/variables.tf` | +4 | one map entry |
| `package.json` | +2 | two dev scripts |

"Basic profile details" is a data-layer decision, not a template one: the access module
selects name, email, phone, city, country, region and account status, and never the date
of birth, national ID or address, so no screen can show them. Name, email and phone reuse
the customer field policy, so support sees them masked. Data stewards and KYC reviewers
were not named in the request and are refused the whole tool by omission.

`tests/account-unlock.api.test.ts` (10 tests) asserts anonymous 401, KYC reviewer and
data steward 403, EMEA-only rows for support with the list view audited, 404 for an APAC
lock, masked `full_name`/`email`/`phone` for support with DOB and national ID absent and
the detail view audited against the customer, PII in the clear for a compliance admin,
403 (and an audited denial) on unlock as support, 403 on unlock as a data steward, 400 on
a missing or whitespace justification, the audit row carrying the trimmed justification,
and 409 on unlocking an already-unlocked account.

Like the other four, account unlock has no named owner yet.

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

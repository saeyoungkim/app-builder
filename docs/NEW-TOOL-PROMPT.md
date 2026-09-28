# Prompt boilerplate: "build me a new tool"

Hand this to an agent (or a new engineer) with the blanks filled in. It encodes
`docs/ADDING-A-TOOL.md` as an instruction rather than a description, so the output lands on
the paved road instead of beside it. `apps/complaints-desk` (tool #4) is the worked example:
109 lines of routes, 21 lines of `server.ts`, no auth, masking, audit or infra code of its own.

---

## The prompt

> **Repository:** `saeyoungkim/app-builder` (branch `main`). Read `README.md` and
> `docs/ADDING-A-TOOL.md` before writing anything.
>
> **Set up first:** Node 22, `postgres:16` in Docker, `cp .env.example .env`, `npm install`,
> `npm run build:packages`, `npm run db:reset`, `npm run dev`.
>
> **The request, in business terms:**
>
> > _\<two to five sentences from the requesting team. Say what the queue or record is, who
> > works it, which action is privileged and who may take it, what the clock or deadline is,
> > and what must be visible in the audit log. Do not name tables, routes or components —
> > that is the implementer's job.\>_
>
> **Build it as tool #\<N\>, named `<tool>`, on ports `api 400N` / `web 300N`,** following the
> six steps:
>
> 1. **Data** — `db/migrations/00N_<entity>.sql` plus deterministic rows in `db/seed/seed.ts`,
>    then `packages/data/src/<entity>.ts` declaring a `FieldPolicy` for every PII column and
>    applying the shared region scope. Export it from `packages/data/src/index.ts`. Reads *and*
>    writes are region-scoped in SQL.
> 2. **Permissions** — add `<entity>:read` / `<entity>:<action>` to `Permission` in
>    `packages/platform/src/rbac.ts` and grant them to the roles named in the request.
>    Every role you do not name stays refused; that is the point, so do not add a catch-all.
> 3. **API** — `apps/<tool>/api/src/app.ts` contains routes and nothing else; each is
>    `requirePermission(...)`, validates input with Zod, and calls `req.audit({...})` on
>    meaningful reads and on every state change. `src/server.ts` is
>    `loadConfig → createService → buildApp → listen`, copied and retitled.
> 4. **Web** — `apps/<tool>/web/app/` composed only from `@paved/ui` primitives
>    (`AppShell`, `DataTable`, `FilterBar`, `Card`, `Pill`, inputs). `IfPermitted` hides
>    privileged actions; the API is what refuses them. A primitive you are missing goes into
>    `packages/ui`, not into the tool.
> 5. **Register** — one entry in `infra/variables.tf`, one OIDC client in `services/idp`,
>    two `dev:` scripts in the root `package.json` wired into `npm run dev`.
> 6. **Own it** — add the tool to the catalogue with a named owner, or say explicitly that you
>    could not and why.
>
> **Hard constraints.** No `jwtVerify`, no `pg` import, no cookie or session reading, no SQL
> in the tool — CI's `policy` job fails the build, and anything you need there belongs in
> `packages/platform` or `packages/data` so tool #12 inherits it too. Do not re-implement
> masking, pagination, error shapes or justification handling.
>
> **Tests.** `tests/<tool>.api.test.ts` must assert the refusals, not just the happy path:
> anonymous → 401, a role without the permission → 403, an allowed role attempting the
> privileged action it lacks → 403, an out-of-region record → 404 on read *and* on write,
> masked fields for a masked principal, invalid input → 400, and an `audit_log` row for the
> state change. Extend the role matrix in `tests/rbac.test.ts`.
>
> **Finish with** `npm run lint && npm run typecheck && npm test` green, and check it in the
> browser as an allowed user and as a refused one
> (`sam.support@ / dana.steward@ / ken.reviewer@ / avery.admin@example-synthetic.test`, any
> password). Record the line count of `app.ts` + `server.ts` in the PR: that number is the
> claim this platform is making.

---

## Filling in the blanks

| Blank | Where to look |
| --- | --- |
| `<N>`, ports | highest existing entry in `infra/variables.tf` |
| business request | the requesting team, verbatim; the tool #4 example is in `docs/RESULTS.md` |
| PII columns | the customer columns already policed in `packages/data/src/customers.ts` |
| roles | `packages/platform/src/rbac.ts` — use the existing four unless the request needs a new one |

## What a good answer looks like

The diff should be almost entirely new files, with edits to exactly five shared ones:
`packages/platform/src/rbac.ts`, `packages/data/src/index.ts`, `infra/variables.tf`,
`services/idp/src/server.ts`, `package.json`. If the diff touches `packages/platform`'s
middleware or `packages/ui`'s primitives, the tool is asking for something the platform
should have offered — that is a finding worth reporting, not a workaround to hide in a PR.

# Rule: New Internal Tool Creation Pipeline

This rule governs how new internal tools are created in this repository (`saeyoungkim/app-builder`).

Whenever the user asks to build or create a new internal tool (providing business requirements or operational intents):

## 1. Automatic Resolution of Blanks
Do NOT ask the user to specify port numbers, tool IDs, or boilerplate configuration. Resolve them automatically:
1. **Tool Number and Ports**:
   - Inspect [infra/variables.tf](file:///Users/saeyoung/my_work/app-builder/infra/variables.tf) to find the highest existing tool number and ports.
   - Assign the next sequential tool number `<N>` and assign ports: `api 400N` / `web 300N`.
2. **Tool Name**:
   - Derive a concise, kebab-case tool name `<tool>` from the business domain (e.g., `hold-review`, `dispute-desk`, `refund-ops`).
3. **Roles & Permissions**:
   - Check [packages/platform/src/rbac.ts](file:///Users/saeyoung/my_work/app-builder/packages/platform/src/rbac.ts). Map the user's operational roles to existing roles (`support`, `data-steward`, `kyc-reviewer`, `compliance-admin`) and declare fine-grained permissions.

## 2. Follow the 6-step implementation process:
1. **Data Layer**:
   - Migration in `db/migrations/00N_<entity>.sql` and deterministic seed rows in `db/seed/seed.ts`.
   - Create `packages/data/src/<entity>.ts` with explicit `FieldPolicy` for PII masking and SQL region scoping (`regionScope(principal)`).
   - Export from `packages/data/src/index.ts`.
2. **Permissions (RBAC)**:
   - Add new `<entity>:<action>` permissions to `Permission` in `packages/platform/src/rbac.ts`.
   - Assign them strictly to allowed roles; unlisted roles remain denied.
3. **API Service**:
   - `apps/<tool>/api/src/app.ts` contains only route handlers, input validation via Zod, `requirePermission(...)`, and `req.audit({...})` calls.
   - `apps/<tool>/api/src/server.ts` is standard boilerplate (`loadConfig` → `createService` → `buildApp` → `listen`).
4. **Web Frontend**:
   - `apps/<tool>/web/app/` composed strictly of `@paved/ui` primitives (`AppShell`, `DataTable`, `FilterBar`, `Card`, `Pill`, `Button`, inputs, etc.).
   - Use `IfPermitted` to visually hide privileged actions (the API handles real enforcement).
5. **Registration & Infra**:
   - Add entry to `infra/variables.tf`.
   - Add OIDC client to `services/idp/src/server.ts`.
   - Add `dev:<tool>:api` and `dev:<tool>:web` to root `package.json`.
6. **Catalogue & Verification**:
   - Add unit/integration tests in `tests/<tool>.api.test.ts` verifying 401 (anonymous), 403 (unprivileged roles), 404 (out-of-region), PII masking, and audit log persistence.
   - Verify `npm run lint && npm run typecheck && npm test`.

## 3. Strict Prohibitions
- NEVER import `pg` or write raw SQL directly inside `apps/<tool>/`. All data access must pass through `@paved/data`.
- NEVER write custom JWT/session verification or cookie parsing inside the tool. Use `@paved/platform`.
- NEVER introduce custom ad-hoc UI primitives if they can be unified in `packages/ui`.

# Adding a tool

The measure of the paved road is that this page is short.

## 1. API

```
apps/<tool>/api/
  package.json          # depends on @paved/platform and @paved/data
  src/app.ts            # routes only
  src/server.ts         # loadConfig + createService + buildApp + listen
```

`src/server.ts` is boilerplate — copy `apps/kyc-queue/api/src/server.ts` and change the
tool id, port and client id. `src/app.ts` may only contain routes. If you find yourself
writing `jwtVerify`, importing `pg`, or reading a cookie, stop: CI fails the build, and the
thing you need belongs in `packages/platform` or `packages/data` so every tool gets it.

Each route declares the permission it needs:

```ts
app.get("/api/cases", requirePermission("kyc:case:read"), async (req, res, next) => { ... });
```

and audits what it did:

```ts
await req.audit({ action: "kyc.case.decide", resourceType: "kyc_case", resourceId: id, subjectId: ref });
```

New permission? Add it to `Permission` and to the roles that should hold it in
`packages/platform/src/rbac.ts`, and add a test asserting who is refused.

## 2. Web

```
apps/<tool>/web/app/
  layout.tsx            # imports @paved/ui/styles.css
  providers.tsx         # SessionProvider + createApiClient
  page.tsx              # composition of @paved/ui components
```

Build screens out of `AppShell`, `DataTable`, `FilterBar`, `Card`, `DetailList`, `Pill`,
`Button` and the inputs. Use `IfPermitted` to hide actions — remembering that hiding is
cosmetic and the API is what actually refuses.

Needing a new primitive is fine; adding it to `packages/ui` rather than to your tool is
what keeps tool #12 cheap.

## 3. Data

New entity? Add a migration in `db/migrations/`, then an access module in `packages/data`
that declares its `FieldPolicy` and applies the region scope. Tools call that module and
never write SQL, so masking and row-level scope cannot be forgotten in a template.

## 4. Infrastructure

```hcl
# infra/variables.tf
tools = {
  <tool> = { api_port = 400X, web_port = 300X }
}
```

## 5. Register it

Add the tool to the catalogue with an owner. A tool without a named owner is the failure
mode this platform exists to prevent.

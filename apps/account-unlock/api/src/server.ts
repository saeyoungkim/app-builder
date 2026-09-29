/**
 * Tool #5 — locked-account unlock queue (API).
 *
 * The same wiring as tools #1–#4: identity, sessions, RBAC, region scope,
 * PII masking, audit and error handling all arrive with the platform.
 */
import { createService, loadConfig } from "@paved/platform";
import { buildApp } from "./app.ts";

const config = loadConfig({
  toolId: "account-unlock",
  port: Number(process.env.PORT ?? 4005),
  clientId: "account-unlock",
  clientSecret: process.env.ACCOUNT_UNLOCK_CLIENT_SECRET ?? "dev-account-unlock-secret",
  baseUrl: process.env.ACCOUNT_UNLOCK_API_URL ?? "http://localhost:4005",
  webOrigin: process.env.ACCOUNT_UNLOCK_WEB_URL ?? "http://localhost:3005",
});

const service = createService(config);
buildApp(service);
service.listen();

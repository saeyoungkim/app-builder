/**
 * Tool #3 — data subject request console (API).
 *
 * Same eleven lines of wiring as tools #1 and #2: identity, sessions, RBAC,
 * region scope, PII masking, audit and error handling all arrive with the platform.
 */
import { createService, loadConfig } from "@paved/platform";
import { buildApp } from "./app.ts";

const config = loadConfig({
  toolId: "dsar-console",
  port: Number(process.env.PORT ?? 4003),
  clientId: "dsar-console",
  clientSecret: process.env.DSAR_CONSOLE_CLIENT_SECRET ?? "dev-dsar-console-secret",
  baseUrl: process.env.DSAR_CONSOLE_API_URL ?? "http://localhost:4003",
  webOrigin: process.env.DSAR_CONSOLE_WEB_URL ?? "http://localhost:3003",
});

const service = createService(config);
buildApp(service);
service.listen();

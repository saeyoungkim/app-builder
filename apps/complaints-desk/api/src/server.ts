/**
 * Tool #4 — customer complaints desk (API).
 *
 * The same wiring as tools #1, #2 and #3: identity, sessions, RBAC, region scope,
 * PII masking, audit and error handling all arrive with the platform.
 */
import { createService, loadConfig } from "@paved/platform";
import { buildApp } from "./app.ts";

const config = loadConfig({
  toolId: "complaints-desk",
  port: Number(process.env.PORT ?? 4004),
  clientId: "complaints-desk",
  clientSecret: process.env.COMPLAINTS_DESK_CLIENT_SECRET ?? "dev-complaints-desk-secret",
  baseUrl: process.env.COMPLAINTS_DESK_API_URL ?? "http://localhost:4004",
  webOrigin: process.env.COMPLAINTS_DESK_WEB_URL ?? "http://localhost:3004",
});

const service = createService(config);
buildApp(service);
service.listen();

/**
 * Tool #1 — customer data management console (API).
 *
 * Everything security-relevant comes from @paved/platform and @paved/data:
 * this file is only configuration and start-up.
 */
import { createService, loadConfig } from "@paved/platform";
import { buildApp } from "./app.ts";

const config = loadConfig({
  toolId: "customer-console",
  port: Number(process.env.PORT ?? 4001),
  clientId: "customer-console",
  clientSecret: process.env.CUSTOMER_CONSOLE_CLIENT_SECRET ?? "dev-customer-console-secret",
  baseUrl: process.env.CUSTOMER_CONSOLE_API_URL ?? "http://localhost:4001",
  webOrigin: process.env.CUSTOMER_CONSOLE_WEB_URL ?? "http://localhost:3001",
});

const service = createService(config);
buildApp(service);
service.listen();

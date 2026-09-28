/**
 * Tool #2 — KYC review queue (API).
 *
 * Built on the same paved road as tool #1: no auth code, no session code,
 * no audit plumbing, no CORS or error handling written here.
 */
import { createService, loadConfig } from "@paved/platform";
import { buildApp } from "./app.ts";

const config = loadConfig({
  toolId: "kyc-queue",
  port: Number(process.env.PORT ?? 4002),
  clientId: "kyc-queue",
  clientSecret: process.env.KYC_QUEUE_CLIENT_SECRET ?? "dev-kyc-queue-secret",
  baseUrl: process.env.KYC_QUEUE_API_URL ?? "http://localhost:4002",
  webOrigin: process.env.KYC_QUEUE_WEB_URL ?? "http://localhost:3002",
});

const service = createService(config);
buildApp(service);
service.listen();

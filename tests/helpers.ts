import { createService, issueSession, principalFromClaims, sessionCookieName, type Principal, type Service } from "@paved/platform";
import type { Express } from "express";

export const TEST_SECRET = "test-session-secret-value";

export const PRINCIPALS = {
  supportEmea: principalFromClaims({
    sub: "u-support-emea",
    email: "sam.support@example-synthetic.test",
    name: "Sam Support",
    groups: ["internal-support", "region-EMEA"],
  }),
  stewardGlobal: principalFromClaims({
    sub: "u-steward-global",
    email: "dana.steward@example-synthetic.test",
    name: "Dana Steward",
    groups: ["data-stewards", "region-global"],
  }),
  reviewerApac: principalFromClaims({
    sub: "u-reviewer-apac",
    email: "ken.reviewer@example-synthetic.test",
    name: "Ken Reviewer",
    groups: ["kyc-reviewers", "region-APAC"],
  }),
  admin: principalFromClaims({
    sub: "u-admin",
    email: "avery.admin@example-synthetic.test",
    name: "Avery Admin",
    groups: ["compliance-admins", "region-global"],
  }),
  secops: principalFromClaims({
    sub: "u-secops",
    email: "sasha.secops@example-synthetic.test",
    name: "Sasha SecOps",
    groups: ["security-ops", "region-global"],
  }),
  nobody: principalFromClaims({ sub: "u-nobody", email: "no.one@example-synthetic.test", groups: [] }),
} satisfies Record<string, Principal>;

export function testService(toolId: string, port: number, clientId: string): Service {
  return createService({
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://devuser:devpass@localhost:5432/paved",
    SESSION_SECRET: TEST_SECRET,
    IDP_ISSUER: process.env.IDP_ISSUER ?? "http://localhost:9000",
    AUDIT_SINK: "postgres",
    NODE_ENV: "test",
    toolId,
    port,
    clientId,
    clientSecret: "test-secret",
    baseUrl: `http://localhost:${port}`,
    webOrigin: "http://localhost:3000",
  });
}

/** Mints the same signed session cookie the OIDC callback would set. */
export async function cookieFor(principal: Principal): Promise<string> {
  return `${sessionCookieName}=${await issueSession(principal, TEST_SECRET)}`;
}

export type TestApp = Express;

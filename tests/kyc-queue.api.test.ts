import { buildApp } from "@paved/kyc-queue-api/app";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINCIPALS, cookieFor, testService } from "./helpers.ts";

const service = testService("kyc-queue-test", 4102, "kyc-queue");
buildApp(service);
const app = service.finalize();

let apacPendingCaseId = "";
let emeaCaseId = "";

beforeAll(async () => {
  let apac = await service.db.query<{ id: string }>(
    `select k.id from kyc_cases k join customers c on c.id = k.customer_id
     where c.region = 'APAC' and k.status in ('pending','in_review','escalated') limit 1`,
  );
  if (apac.rows.length === 0) {
    const existing = await service.db.query<{ id: string }>(
      `select k.id from kyc_cases k join customers c on c.id = k.customer_id where c.region = 'APAC' limit 1`,
    );
    if (existing.rows.length > 0) {
      apac = await service.db.query<{ id: string }>(
        `update kyc_cases set status = 'pending', decided_at = null, decided_by = null, decision_reason = null
         where id = $1 returning id`,
        [existing.rows[0]!.id],
      );
    }
  }
  const emea = await service.db.query<{ id: string }>(
    `select k.id from kyc_cases k join customers c on c.id = k.customer_id where c.region = 'EMEA' limit 1`,
  );
  apacPendingCaseId = apac.rows[0]!.id;
  emeaCaseId = emea.rows[0]!.id;
});

afterAll(async () => {
  await service.db.end();
});

describe("tool #2 inherits the platform's authorization", () => {
  it("denies the queue to a support principal without writing any KYC-specific check", async () => {
    const res = await request(app).get("/api/cases").set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("kyc:case:read");
  });

  it("rejects anonymous access", async () => {
    expect((await request(app).get("/api/cases")).status).toBe(401);
  });

  it("applies the same region scope to a different domain object", async () => {
    const res = await request(app).get(`/api/cases/${emeaCaseId}`).set("Cookie", await cookieFor(PRINCIPALS.reviewerApac));
    expect(res.status).toBe(404);
  });

  it("lists only in-region cases for a regional reviewer", async () => {
    const res = await request(app).get("/api/cases?limit=100").set("Cookie", await cookieFor(PRINCIPALS.reviewerApac));
    expect(res.status).toBe(200);
    expect([...new Set(res.body.rows.map((r: { region: string }) => r.region))]).toEqual(["APAC"]);
  });
});

describe("decisions", () => {
  it("requires a reason of substance", async () => {
    const res = await request(app)
      .post(`/api/cases/${apacPendingCaseId}/decision`)
      .set("Cookie", await cookieFor(PRINCIPALS.reviewerApac))
      .send({ decision: "approved", reason: "ok" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("does not accept whitespace as a reason", async () => {
    const res = await request(app)
      .post(`/api/cases/${apacPendingCaseId}/decision`)
      .set("Cookie", await cookieFor(PRINCIPALS.reviewerApac))
      .send({ decision: "approved", reason: "          " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("records the decision with its reviewer and reason in the shared audit log", async () => {
    const res = await request(app)
      .post(`/api/cases/${apacPendingCaseId}/decision`)
      .set("Cookie", await cookieFor(PRINCIPALS.reviewerApac))
      .send({ decision: "approved", reason: "Documents verified against the synthetic register." });
    expect(res.status).toBe(200);
    expect(res.body.case.status).toBe("approved");

    const events = await service.db.query<{ actor_sub: string; metadata: Record<string, unknown> }>(
      `select * from audit_log where action = 'kyc.case.decide' and resource_id = $1 order by occurred_at desc limit 1`,
      [apacPendingCaseId],
    );
    expect(events.rows[0]?.actor_sub).toBe(PRINCIPALS.reviewerApac.sub);
    expect(events.rows[0]?.metadata.to).toBe("approved");
  });

  it("refuses to re-decide a closed case", async () => {
    const res = await request(app)
      .post(`/api/cases/${apacPendingCaseId}/decision`)
      .set("Cookie", await cookieFor(PRINCIPALS.reviewerApac))
      .send({ decision: "rejected", reason: "Trying to overturn a closed decision." });
    expect(res.status).toBe(409);
  });

  it("denies deciding to a principal that can only read customers", async () => {
    const res = await request(app)
      .post(`/api/cases/${emeaCaseId}/decision`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ decision: "approved", reason: "A data steward should not be able to do this." });
    expect(res.status).toBe(403);
  });
});

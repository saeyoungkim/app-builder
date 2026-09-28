import { buildApp } from "@paved/dsar-console-api/app";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINCIPALS, cookieFor, testService } from "./helpers.ts";

const service = testService("dsar-console-test", 4103, "dsar-console");
buildApp(service);
const app = service.finalize();

let emeaOpenId = "";
let apacRequestId = "";

beforeAll(async () => {
  const emea = await service.db.query<{ id: string }>(
    `select d.id from dsar_requests d join customers c on c.id = d.customer_id
     where c.region = 'EMEA' and d.status in ('open','in_progress') limit 1`,
  );
  const apac = await service.db.query<{ id: string }>(
    `select d.id from dsar_requests d join customers c on c.id = d.customer_id
     where c.region = 'APAC' limit 1`,
  );
  emeaOpenId = emea.rows[0]!.id;
  apacRequestId = apac.rows[0]!.id;
});

afterAll(async () => {
  await service.db.end();
});

describe("tool #3 inherits the platform's authorization", () => {
  it("rejects anonymous access", async () => {
    expect((await request(app).get("/api/requests")).status).toBe(401);
  });

  it("refuses a role that was never granted the new permission", async () => {
    const res = await request(app).get("/api/requests").set("Cookie", await cookieFor(PRINCIPALS.reviewerApac));
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("dsar:read");
  });

  it("applies the existing region scope to a brand new entity", async () => {
    const res = await request(app).get(`/api/requests/${apacRequestId}`).set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(404);

    const list = await request(app).get("/api/requests?limit=100").set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect([...new Set(list.body.rows.map((r: { region: string }) => r.region))]).toEqual(["EMEA"]);
  });

  it("masks customer PII on the wire for a role without customer:read_pii", async () => {
    const res = await request(app).get(`/api/requests/${emeaOpenId}`).set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.request._masked).toEqual(expect.arrayContaining(["full_name", "email"]));
    expect(res.body.request.full_name).toMatch(/•/);
  });
});

describe("resolutions", () => {
  it("lets support read the queue but not close a request", async () => {
    const res = await request(app)
      .post(`/api/requests/${emeaOpenId}/resolution`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ resolution: "fulfilled", note: "Export delivered to the data subject." });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("dsar:resolve");
  });

  it("requires a note of substance", async () => {
    const res = await request(app)
      .post(`/api/requests/${emeaOpenId}/resolution`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ resolution: "fulfilled", note: "done" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("does not accept whitespace as a note", async () => {
    const res = await request(app)
      .post(`/api/requests/${emeaOpenId}/resolution`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ resolution: "fulfilled", note: "          " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("records the actor, note and transition in the shared audit log", async () => {
    const res = await request(app)
      .post(`/api/requests/${emeaOpenId}/resolution`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ resolution: "fulfilled", note: "Export delivered after identity verification." });
    expect(res.status).toBe(200);

    const audit = await service.db.query<{ actor_email: string; action: string; metadata: { to: string } }>(
      `select actor_email, action, metadata from audit_log
       where tool = 'dsar-console-test' and action = 'dsar.request.resolve'
       order by occurred_at desc limit 1`,
    );
    expect(audit.rows[0]?.actor_email).toBe(PRINCIPALS.stewardGlobal.email);
    expect(audit.rows[0]?.metadata.to).toBe("fulfilled");
  });

  it("refuses to close an already closed request", async () => {
    const res = await request(app)
      .post(`/api/requests/${emeaOpenId}/resolution`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ resolution: "refused", note: "Attempting to close it a second time." });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("request_already_closed");
  });
});

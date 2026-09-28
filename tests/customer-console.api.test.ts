import { buildApp } from "@paved/customer-console-api/app";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINCIPALS, cookieFor, testService } from "./helpers.ts";

const service = testService("customer-console-test", 4101, "customer-console");
buildApp(service);
const app = service.finalize();

let emeaCustomerId = "";
let apacCustomerId = "";

beforeAll(async () => {
  const emea = await service.db.query<{ id: string }>("select id from customers where region = 'EMEA' limit 1");
  const apac = await service.db.query<{ id: string }>("select id from customers where region = 'APAC' limit 1");
  emeaCustomerId = emea.rows[0]!.id;
  apacCustomerId = apac.rows[0]!.id;
});

afterAll(async () => {
  await service.db.end();
});

describe("authentication", () => {
  it("rejects an anonymous request with a login URL rather than data", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.status).toBe(401);
    expect(res.body.loginUrl).toContain("/auth/login");
  });

  it("rejects a forged session cookie", async () => {
    const res = await request(app).get("/api/customers").set("Cookie", "paved_session=not-a-real-jwt");
    expect(res.status).toBe(401);
  });
});

describe("permission enforcement", () => {
  it("denies write to a support principal even though the UI hides the button", async () => {
    const res = await request(app)
      .patch(`/api/customers/${emeaCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ status: "suspended" });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("customer:write");
  });

  it("denies the audit log to everyone but compliance-admin", async () => {
    const steward = await request(app).get("/api/audit").set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal));
    const admin = await request(app).get("/api/audit").set("Cookie", await cookieFor(PRINCIPALS.admin));
    expect(steward.status).toBe(403);
    expect(admin.status).toBe(200);
  });

  it("gives a principal with no mapped groups nothing at all", async () => {
    const res = await request(app).get("/api/customers").set("Cookie", await cookieFor(PRINCIPALS.nobody));
    expect(res.status).toBe(403);
  });

  it("records every denial in the audit log", async () => {
    await request(app)
      .patch(`/api/customers/${emeaCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ status: "closed" });
    const denials = await service.db.query(
      `select * from audit_log where actor_sub = $1 and outcome = 'denied' order by occurred_at desc limit 1`,
      [PRINCIPALS.supportEmea.sub],
    );
    expect(denials.rows.length).toBe(1);
  });
});

describe("row-level region scope", () => {
  it("hides out-of-region customers from a regional principal", async () => {
    const res = await request(app)
      .get(`/api/customers/${apacCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(404);
  });

  it("returns only in-region rows in the list", async () => {
    const res = await request(app).get("/api/customers?limit=100").set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect([...new Set(res.body.rows.map((r: { region: string }) => r.region))]).toEqual(["EMEA"]);
  });

  it("lets a region-global principal see every region", async () => {
    const res = await request(app).get("/api/customers?limit=100").set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal));
    const regions = new Set(res.body.rows.map((r: { region: string }) => r.region));
    expect(regions.size).toBeGreaterThan(1);
  });

  it("refuses a write to an out-of-region customer", async () => {
    const res = await request(app)
      .patch(`/api/customers/${apacCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ city: "Nowhere" });
    expect(res.status).toBe(403);
  });
});

describe("PII masking over the wire", () => {
  it("never sends unmasked PII to a principal without the permission", async () => {
    const res = await request(app)
      .get(`/api/customers/${emeaCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.customer.national_id).toBe("••••••••");
    expect(res.body.customer._masked).toContain("email");
  });

  it("sends PII in the clear to a data steward", async () => {
    const res = await request(app)
      .get(`/api/customers/${emeaCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal));
    expect(res.body.customer._masked).toEqual([]);
    expect(res.body.customer.email).toContain("@");
  });
});

describe("audit as a service", () => {
  it("audits reads, not only writes, and makes them queryable by subject", async () => {
    const read = await request(app)
      .get(`/api/customers/${emeaCustomerId}`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal));
    const reference = read.body.customer.reference as string;
    const events = await service.db.query<{ action: string; actor_sub: string }>(
      `select * from audit_log where subject_id = $1 and action = 'customer.read' order by occurred_at desc limit 1`,
      [reference],
    );
    expect(events.rows[0]?.actor_sub).toBe(PRINCIPALS.stewardGlobal.sub);
  });

  it("keeps the audit log append-only at the database level", async () => {
    await expect(service.db.query(`update audit_log set action = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(service.db.query(`delete from audit_log`)).rejects.toThrow(/append-only/);
  });
});

import { buildApp } from "@paved/complaints-desk-api/app";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINCIPALS, cookieFor, testService } from "./helpers.ts";

const service = testService("complaints-desk-test", 4104, "complaints-desk");
buildApp(service);
const app = service.finalize();

let emeaOpenId = "";
let apacComplaintId = "";
let emeaCustomerRef = "";
let apacCustomerRef = "";

beforeAll(async () => {
  let emea = await service.db.query<{ id: string }>(
    `select k.id from complaints k join customers c on c.id = k.customer_id
     where c.region = 'EMEA' and k.status in ('open','investigating') limit 1`,
  );
  if (emea.rows.length === 0) {
    const existing = await service.db.query<{ id: string }>(
      `select k.id from complaints k join customers c on c.id = k.customer_id where c.region = 'EMEA' limit 1`,
    );
    if (existing.rows.length > 0) {
      emea = await service.db.query<{ id: string }>(
        `update complaints set status = 'open', closed_at = null, closed_by = null, outcome_note = null
         where id = $1 returning id`,
        [existing.rows[0]!.id],
      );
    }
  }
  const apac = await service.db.query<{ id: string }>(
    `select k.id from complaints k join customers c on c.id = k.customer_id
     where c.region = 'APAC' limit 1`,
  );
  const refs = await service.db.query<{ emea: string; apac: string }>(
    `select (select reference from customers where region = 'EMEA' limit 1) as emea,
            (select reference from customers where region = 'APAC' limit 1) as apac`,
  );
  emeaOpenId = emea.rows[0]!.id;
  apacComplaintId = apac.rows[0]!.id;
  emeaCustomerRef = refs.rows[0]!.emea;
  apacCustomerRef = refs.rows[0]!.apac;
});

afterAll(async () => {
  await service.db.end();
});

describe("tool #4 inherits the platform's authorization", () => {
  it("rejects anonymous access", async () => {
    expect((await request(app).get("/api/complaints")).status).toBe(401);
  });

  it("refuses a role that was never granted the new permission", async () => {
    const res = await request(app).get("/api/complaints").set("Cookie", await cookieFor(PRINCIPALS.reviewerApac));
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("complaint:read");
  });

  it("lets support log a complaint but not close one", async () => {
    const cookie = await cookieFor(PRINCIPALS.supportEmea);
    const logged = await request(app)
      .post("/api/complaints")
      .set("Cookie", cookie)
      .send({ customerReference: emeaCustomerRef, category: "fees", channel: "phone", summary: "Charged twice for the same transfer." });
    expect(logged.status).toBe(201);
    expect(logged.body.complaint.status).toBe("open");

    const closed = await request(app)
      .post(`/api/complaints/${logged.body.complaint.id}/outcome`)
      .set("Cookie", cookie)
      .send({ outcome: "upheld", note: "Refunded the duplicate charge." });
    expect(closed.status).toBe(403);
    expect(closed.body.required).toBe("complaint:close");
  });

  it("applies the existing region scope to a brand new entity", async () => {
    const cookie = await cookieFor(PRINCIPALS.supportEmea);
    expect((await request(app).get(`/api/complaints/${apacComplaintId}`).set("Cookie", cookie)).status).toBe(404);

    const list = await request(app).get("/api/complaints?limit=100").set("Cookie", cookie);
    expect([...new Set(list.body.rows.map((r: { region: string }) => r.region))]).toEqual(["EMEA"]);
  });

  it("refuses to log a complaint against an out-of-region customer", async () => {
    const res = await request(app)
      .post("/api/complaints")
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ customerReference: apacCustomerRef, category: "service", channel: "email", summary: "Out of region attempt." });
    expect(res.status).toBe(404);
  });

  it("masks PII for a role without customer:read_pii", async () => {
    const res = await request(app).get(`/api/complaints/${emeaOpenId}`).set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.complaint._masked).toEqual(expect.arrayContaining(["full_name", "email"]));
    expect(res.body.complaint.full_name).toMatch(/•/);
  });

  it("treats breachedOnly=false as off rather than on", async () => {
    const cookie = await cookieFor(PRINCIPALS.stewardGlobal);
    const off = await request(app).get("/api/complaints?breachedOnly=false&limit=100").set("Cookie", cookie);
    const on = await request(app).get("/api/complaints?breachedOnly=true&limit=100").set("Cookie", cookie);
    expect(off.status).toBe(200);
    expect(off.body.rows.length).toBeGreaterThan(on.body.rows.length);
  });

  it("rejects a whitespace-only outcome note", async () => {
    const res = await request(app)
      .post(`/api/complaints/${emeaOpenId}/outcome`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ outcome: "upheld", note: "          " });
    expect(res.status).toBe(400);
  });

  it("audits the close and refuses to close it twice", async () => {
    const cookie = await cookieFor(PRINCIPALS.stewardGlobal);
    const first = await request(app)
      .post(`/api/complaints/${emeaOpenId}/outcome`)
      .set("Cookie", cookie)
      .send({ outcome: "upheld", note: "Fee refunded and the tariff page corrected." });
    expect(first.status).toBe(200);
    expect(first.body.complaint.closed_by).toBe(PRINCIPALS.stewardGlobal.email);

    const audit = await service.db.query<{ actor_email: string; metadata: { to: string } }>(
      `select actor_email, metadata from audit_log
       where tool = 'complaints-desk-test' and action = 'complaint.close' and resource_id = $1
       order by occurred_at desc limit 1`,
      [emeaOpenId],
    );
    expect(audit.rows[0]?.actor_email).toBe(PRINCIPALS.stewardGlobal.email);
    expect(audit.rows[0]?.metadata.to).toBe("upheld");

    const again = await request(app)
      .post(`/api/complaints/${emeaOpenId}/outcome`)
      .set("Cookie", cookie)
      .send({ outcome: "rejected", note: "Trying to close it a second time." });
    expect(again.status).toBe(409);
  });

  it("audits a denial rather than dropping it", async () => {
    await request(app).get("/api/stats").set("Cookie", await cookieFor(PRINCIPALS.reviewerApac));
    const audit = await service.db.query(
      `select 1 from audit_log
       where tool = 'complaints-desk-test' and action = 'authorization.denied' and outcome = 'denied'
       limit 1`,
    );
    expect(audit.rowCount).toBe(1);
  });
});

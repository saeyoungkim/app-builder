import { buildApp } from "@paved/account-unlock-api/app";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINCIPALS, cookieFor, testService } from "./helpers.ts";

const service = testService("account-unlock-test", 4105, "account-unlock");
buildApp(service);
const app = service.finalize();

let emeaLockedId = "";
let apacLockId = "";

beforeAll(async () => {
  const emea = await service.db.query<{ id: string }>(
    `select l.id from account_locks l join customers c on c.id = l.customer_id
     where c.region = 'EMEA' and l.status = 'locked' limit 1`,
  );
  const apac = await service.db.query<{ id: string }>(
    `select l.id from account_locks l join customers c on c.id = l.customer_id
     where c.region = 'APAC' limit 1`,
  );
  emeaLockedId = emea.rows[0]!.id;
  apacLockId = apac.rows[0]!.id;
});

afterAll(async () => {
  await service.db.end();
});

async function latestAudit(action: string, actor: string, resourceId?: string) {
  const result = await service.db.query<{ subject_id: string | null; metadata: Record<string, unknown> }>(
    `select subject_id, metadata from audit_log
     where tool = 'account-unlock-test' and action = $1 and actor_email = $2
       and ($3::text is null or resource_id = $3)
     order by occurred_at desc limit 1`,
    [action, actor, resourceId ?? null],
  );
  return result.rows[0];
}

describe("tool #5 inherits the platform's authorization", () => {
  it("rejects anonymous access", async () => {
    expect((await request(app).get("/api/locks")).status).toBe(401);
  });

  it("refuses roles that were never granted the new permission", async () => {
    for (const principal of [PRINCIPALS.reviewerApac, PRINCIPALS.stewardGlobal]) {
      const res = await request(app).get("/api/locks").set("Cookie", await cookieFor(principal));
      expect(res.status).toBe(403);
      expect(res.body.required).toBe("account_lock:read");
    }
  });

  it("lets support view the queue, scoped to their regions, and audits the view", async () => {
    const res = await request(app).get("/api/locks?limit=100").set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect([...new Set(res.body.rows.map((r: { region: string }) => r.region))]).toEqual(["EMEA"]);
    expect(await latestAudit("account_lock.list", PRINCIPALS.supportEmea.email)).toBeDefined();
  });

  it("returns 404, not a redaction, for an out-of-region lock", async () => {
    const res = await request(app).get(`/api/locks/${apacLockId}`).set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(404);
  });

  it("masks profile PII for support and audits the detail view against the customer", async () => {
    const res = await request(app).get(`/api/locks/${emeaLockedId}`).set("Cookie", await cookieFor(PRINCIPALS.supportEmea));
    expect(res.status).toBe(200);
    expect(res.body.lock._masked).toEqual(expect.arrayContaining(["full_name", "email", "phone"]));
    expect(res.body.lock.full_name).toMatch(/•/);
    expect(res.body.lock).not.toHaveProperty("national_id");
    expect(res.body.lock).not.toHaveProperty("date_of_birth");

    const audit = await latestAudit("account_lock.read", PRINCIPALS.supportEmea.email, emeaLockedId);
    expect(audit?.subject_id).toBe(res.body.lock.customer_reference);
  });

  it("shows PII in the clear to a compliance admin", async () => {
    const res = await request(app).get(`/api/locks/${emeaLockedId}`).set("Cookie", await cookieFor(PRINCIPALS.admin));
    expect(res.status).toBe(200);
    expect(res.body.lock._masked).toEqual([]);
    expect(res.body.lock.email).toMatch(/@example-synthetic\.test$/);
  });

  it("refuses to let support unlock an account, and audits the denial", async () => {
    const res = await request(app)
      .post(`/api/locks/${emeaLockedId}/unlock`)
      .set("Cookie", await cookieFor(PRINCIPALS.supportEmea))
      .send({ note: "Customer asked nicely on the phone." });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe("account_lock:unlock");

    const denied = await service.db.query(
      `select 1 from audit_log
       where tool = 'account-unlock-test' and action = 'authorization.denied' and outcome = 'denied'
         and actor_email = $1 limit 1`,
      [PRINCIPALS.supportEmea.email],
    );
    expect(denied.rowCount).toBe(1);
  });

  it("refuses unlock to a data steward even with global scope and PII access", async () => {
    const res = await request(app)
      .post(`/api/locks/${emeaLockedId}/unlock`)
      .set("Cookie", await cookieFor(PRINCIPALS.stewardGlobal))
      .send({ note: "Verified the customer by email." });
    expect(res.status).toBe(403);
  });

  it("requires a justification that is not whitespace", async () => {
    const cookie = await cookieFor(PRINCIPALS.admin);
    const missing = await request(app).post(`/api/locks/${emeaLockedId}/unlock`).set("Cookie", cookie).send({});
    expect(missing.status).toBe(400);
    const blank = await request(app)
      .post(`/api/locks/${emeaLockedId}/unlock`)
      .set("Cookie", cookie)
      .send({ note: "            " });
    expect(blank.status).toBe(400);
  });

  it("lets a compliance admin unlock with a justification, audits it, and refuses a second unlock", async () => {
    const cookie = await cookieFor(PRINCIPALS.admin);
    const note = "Identity verified via callback to the number on file.";
    const first = await request(app).post(`/api/locks/${emeaLockedId}/unlock`).set("Cookie", cookie).send({ note: `  ${note}  ` });
    expect(first.status).toBe(200);
    expect(first.body.lock.status).toBe("unlocked");
    expect(first.body.lock.unlocked_by).toBe(PRINCIPALS.admin.email);
    expect(first.body.lock.unlock_note).toBe(note);

    const audit = await latestAudit("account_lock.unlock", PRINCIPALS.admin.email, emeaLockedId);
    expect(audit?.subject_id).toBe(first.body.lock.customer_reference);
    expect(audit?.metadata.note).toBe(note);

    const again = await request(app)
      .post(`/api/locks/${emeaLockedId}/unlock`)
      .set("Cookie", cookie)
      .send({ note: "Trying to unlock it a second time." });
    expect(again.status).toBe(409);
  });
});

import { addNote, getCustomer, listCustomers, listNotes, updateCustomer } from "@paved/data";
import { HttpError, routeParam, type Service } from "@paved/platform";
import { z } from "zod";

/** Routes are registered separately from start-up so tests mount the same app. */
export function buildApp(service: Service): void {
  const { app, db, requirePermission } = service;

  const listQuery = z.object({
    search: z.string().max(120).optional(),
    status: z.enum(["active", "suspended", "closed"]).optional(),
    riskTier: z.enum(["standard", "enhanced", "prohibited"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  app.get("/api/customers", requirePermission("customer:read"), async (req, res, next) => {
    try {
      const query = listQuery.parse(req.query);
      const result = await listCustomers(db, req.principal!, query);
      await req.audit({
        action: "customer.list",
        resourceType: "customer",
        metadata: { filters: query, returned: result.rows.length },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/customers/:id", requirePermission("customer:read"), async (req, res, next) => {
    try {
      const customer = await getCustomer(db, req.principal!, routeParam(req, "id"));
      if (!customer) throw new HttpError(404, "customer_not_found");
      // Reads of a customer record are auditable events, not only writes.
      await req.audit({
        action: "customer.read",
        resourceType: "customer",
        resourceId: customer.id,
        subjectId: customer.reference,
        metadata: { masked: customer._masked ?? [] },
      });
      res.json({ customer, notes: await listNotes(db, customer.id) });
    } catch (err) {
      next(err);
    }
  });

  const patchBody = z.object({
    status: z.enum(["active", "suspended", "closed"]).optional(),
    risk_tier: z.enum(["standard", "enhanced", "prohibited"]).optional(),
    address_line: z.string().min(1).max(200).optional(),
    city: z.string().min(1).max(120).optional(),
    phone: z.string().min(3).max(40).optional(),
  });

  app.patch("/api/customers/:id", requirePermission("customer:write"), async (req, res, next) => {
    try {
      const patch = patchBody.parse(req.body);
      const before = await getCustomer(db, req.principal!, routeParam(req, "id"));
      if (!before) throw new HttpError(404, "customer_not_found");
      const after = await updateCustomer(db, req.principal!, routeParam(req, "id"), patch);
      if (!after) throw new HttpError(404, "customer_not_found");
      await req.audit({
        action: "customer.update",
        resourceType: "customer",
        resourceId: after.id,
        subjectId: after.reference,
        metadata: { changed: Object.keys(patch), from: pickFields(before, patch), to: patch },
      });
      res.json({ customer: after });
    } catch (err) {
      next(err);
    }
  });

  const noteBody = z.object({ body: z.string().min(1).max(2000) });

  app.post("/api/customers/:id/notes", requirePermission("customer:note:write"), async (req, res, next) => {
    try {
      const { body } = noteBody.parse(req.body);
      const customer = await getCustomer(db, req.principal!, routeParam(req, "id"));
      if (!customer) throw new HttpError(404, "customer_not_found");
      const note = await addNote(db, customer.id, req.principal!.email, body);
      await req.audit({
        action: "customer.note.create",
        resourceType: "customer_note",
        resourceId: note.id,
        subjectId: customer.reference,
      });
      res.status(201).json({ note });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/audit", requirePermission("audit:read"), async (req, res, next) => {
    try {
      const subject = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
      const result = await db.query(
        subject
          ? `select * from audit_log where subject_id = $1 order by occurred_at desc limit 100`
          : `select * from audit_log order by occurred_at desc limit 100`,
        subject ? [subject] : [],
      );
      res.json({ events: result.rows });
    } catch (err) {
      next(err);
    }
  });
}

function pickFields(row: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, row[key]]));
}

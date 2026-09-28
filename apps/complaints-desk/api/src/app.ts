import { closeComplaint, complaintStats, getComplaint, listComplaints, logComplaint } from "@paved/data";
import { HttpError, booleanFlag, justification, routeParam, type Service } from "@paved/platform";
import { z } from "zod";

export function buildApp(service: Service): void {
  const { app, db, requirePermission } = service;

  const listQuery = z.object({
    status: z.enum(["open", "investigating", "upheld", "rejected", "withdrawn"]).optional(),
    category: z.enum(["billing", "service", "access", "fees", "other"]).optional(),
    breachedOnly: booleanFlag().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  app.get("/api/complaints", requirePermission("complaint:read"), async (req, res, next) => {
    try {
      const query = listQuery.parse(req.query);
      const result = await listComplaints(db, req.principal!, query);
      await req.audit({
        action: "complaint.list",
        resourceType: "complaint",
        metadata: { filters: query, returned: result.rows.length },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats", requirePermission("complaint:read"), async (req, res, next) => {
    try {
      const stats = await complaintStats(db, req.principal!);
      await req.audit({ action: "complaint.stats.read", resourceType: "complaint" });
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/complaints/:id", requirePermission("complaint:read"), async (req, res, next) => {
    try {
      const complaint = await getComplaint(db, req.principal!, routeParam(req, "id"));
      if (!complaint) throw new HttpError(404, "complaint_not_found");
      await req.audit({
        action: "complaint.read",
        resourceType: "complaint",
        resourceId: complaint.id,
        subjectId: complaint.customer_reference,
      });
      res.json({ complaint });
    } catch (err) {
      next(err);
    }
  });

  const logBody = z.object({
    customerReference: z.string().trim().min(3).max(40),
    category: z.enum(["billing", "service", "access", "fees", "other"]),
    channel: z.enum(["phone", "email", "branch", "web"]),
    summary: justification(),
  });

  app.post("/api/complaints", requirePermission("complaint:log"), async (req, res, next) => {
    try {
      const input = logBody.parse(req.body);
      // A miss means the customer does not exist or is outside the principal's regions;
      // both are a 404 so the queue cannot be used to probe for out-of-region customers.
      const complaint = await logComplaint(db, req.principal!, input);
      if (!complaint) throw new HttpError(404, "customer_not_found");
      await req.audit({
        action: "complaint.log",
        resourceType: "complaint",
        resourceId: complaint.id,
        subjectId: complaint.customer_reference,
        metadata: { category: input.category, channel: input.channel },
      });
      res.status(201).json({ complaint });
    } catch (err) {
      next(err);
    }
  });

  const outcomeBody = z.object({
    outcome: z.enum(["investigating", "upheld", "rejected", "withdrawn"]),
    note: justification(),
  });

  app.post("/api/complaints/:id/outcome", requirePermission("complaint:close"), async (req, res, next) => {
    try {
      const { outcome, note } = outcomeBody.parse(req.body);
      const before = await getComplaint(db, req.principal!, routeParam(req, "id"));
      if (!before) throw new HttpError(404, "complaint_not_found");
      // The update refuses closed rows too, so a miss here means someone else closed it first.
      const after = await closeComplaint(db, req.principal!, routeParam(req, "id"), outcome, note);
      if (!after) throw new HttpError(409, "complaint_already_closed");
      await req.audit({
        action: "complaint.close",
        resourceType: "complaint",
        resourceId: after.id,
        subjectId: after.customer_reference,
        metadata: { from: before.status, to: after.status, note },
      });
      res.json({ complaint: after });
    } catch (err) {
      next(err);
    }
  });
}

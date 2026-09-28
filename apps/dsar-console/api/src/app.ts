import { getRequest, listRequests, resolveRequest, slaStats } from "@paved/data";
import { HttpError, routeParam, type Service } from "@paved/platform";
import { z } from "zod";

export function buildApp(service: Service): void {
  const { app, db, requirePermission } = service;

  const listQuery = z.object({
    status: z.enum(["open", "in_progress", "fulfilled", "refused"]).optional(),
    requestType: z.enum(["access", "erasure", "correction", "portability"]).optional(),
    overdueOnly: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  app.get("/api/requests", requirePermission("dsar:read"), async (req, res, next) => {
    try {
      const query = listQuery.parse(req.query);
      const result = await listRequests(db, req.principal!, query);
      await req.audit({
        action: "dsar.request.list",
        resourceType: "dsar_request",
        metadata: { filters: query, returned: result.rows.length },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats", requirePermission("dsar:read"), async (req, res, next) => {
    try {
      res.json({ stats: await slaStats(db, req.principal!) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/requests/:id", requirePermission("dsar:read"), async (req, res, next) => {
    try {
      const dsar = await getRequest(db, req.principal!, routeParam(req, "id"));
      if (!dsar) throw new HttpError(404, "request_not_found");
      await req.audit({
        action: "dsar.request.read",
        resourceType: "dsar_request",
        resourceId: dsar.id,
        subjectId: dsar.customer_reference,
      });
      res.json({ request: dsar });
    } catch (err) {
      next(err);
    }
  });

  const resolutionBody = z.object({
    resolution: z.enum(["in_progress", "fulfilled", "refused"]),
    note: z.string().min(10).max(1000),
  });

  app.post("/api/requests/:id/resolution", requirePermission("dsar:resolve"), async (req, res, next) => {
    try {
      const { resolution, note } = resolutionBody.parse(req.body);
      const before = await getRequest(db, req.principal!, routeParam(req, "id"));
      if (!before) throw new HttpError(404, "request_not_found");
      if (before.status === "fulfilled" || before.status === "refused") {
        throw new HttpError(409, "request_already_closed");
      }
      const after = await resolveRequest(db, req.principal!, routeParam(req, "id"), resolution, note);
      if (!after) throw new HttpError(404, "request_not_found");
      await req.audit({
        action: "dsar.request.resolve",
        resourceType: "dsar_request",
        resourceId: after.id,
        subjectId: after.customer_reference,
        metadata: { from: before.status, to: after.status, note },
      });
      res.json({ request: after });
    } catch (err) {
      next(err);
    }
  });
}

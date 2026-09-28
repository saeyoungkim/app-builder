import { decideCase, getCase, listCases, queueStats } from "@paved/data";
import { HttpError, routeParam, type Service } from "@paved/platform";
import { z } from "zod";

export function buildApp(service: Service): void {
  const { app, db, requirePermission } = service;

  const listQuery = z.object({
    status: z.enum(["pending", "in_review", "approved", "rejected", "escalated"]).optional(),
    minRisk: z.coerce.number().int().min(0).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  app.get("/api/cases", requirePermission("kyc:case:read"), async (req, res, next) => {
    try {
      const query = listQuery.parse(req.query);
      const result = await listCases(db, req.principal!, query);
      await req.audit({
        action: "kyc.case.list",
        resourceType: "kyc_case",
        metadata: { filters: query, returned: result.rows.length },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats", requirePermission("kyc:case:read"), async (req, res, next) => {
    try {
      res.json({ stats: await queueStats(db, req.principal!) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/cases/:id", requirePermission("kyc:case:read"), async (req, res, next) => {
    try {
      const kycCase = await getCase(db, req.principal!, routeParam(req, "id"));
      if (!kycCase) throw new HttpError(404, "case_not_found");
      await req.audit({
        action: "kyc.case.read",
        resourceType: "kyc_case",
        resourceId: kycCase.id,
        subjectId: kycCase.customer_reference,
      });
      res.json({ case: kycCase });
    } catch (err) {
      next(err);
    }
  });

  const decisionBody = z.object({
    decision: z.enum(["approved", "rejected", "escalated", "in_review"]),
    reason: z.string().min(10).max(1000),
  });

  app.post("/api/cases/:id/decision", requirePermission("kyc:case:decide"), async (req, res, next) => {
    try {
      const { decision, reason } = decisionBody.parse(req.body);
      const before = await getCase(db, req.principal!, routeParam(req, "id"));
      if (!before) throw new HttpError(404, "case_not_found");
      if (before.status === "approved" || before.status === "rejected") {
        throw new HttpError(409, "case_already_decided");
      }
      const after = await decideCase(db, req.principal!, routeParam(req, "id"), decision, reason);
      if (!after) throw new HttpError(404, "case_not_found");
      await req.audit({
        action: "kyc.case.decide",
        resourceType: "kyc_case",
        resourceId: after.id,
        subjectId: after.customer_reference,
        metadata: { from: before.status, to: after.status, reason },
      });
      res.json({ case: after });
    } catch (err) {
      next(err);
    }
  });
}

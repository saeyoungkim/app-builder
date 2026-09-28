import { getAccountLock, listAccountLocks, unlockAccount } from "@paved/data";
import { HttpError, justification, routeParam, type Service } from "@paved/platform";
import { z } from "zod";

export function buildApp(service: Service): void {
  const { app, db, requirePermission } = service;

  const listQuery = z.object({
    status: z.enum(["locked", "unlocked"]).optional(),
    reason: z.enum(["password", "one_time_code", "security_question"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  app.get("/api/locks", requirePermission("account_lock:read"), async (req, res, next) => {
    try {
      const query = listQuery.parse(req.query);
      const result = await listAccountLocks(db, req.principal!, query);
      await req.audit({
        action: "account_lock.list",
        resourceType: "account_lock",
        metadata: { filters: query, returned: result.rows.length },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/locks/:id", requirePermission("account_lock:read"), async (req, res, next) => {
    try {
      const lock = await getAccountLock(db, req.principal!, routeParam(req, "id"));
      if (!lock) throw new HttpError(404, "lock_not_found");
      await req.audit({
        action: "account_lock.read",
        resourceType: "account_lock",
        resourceId: lock.id,
        subjectId: lock.customer_reference,
        metadata: { masked: lock._masked },
      });
      res.json({ lock });
    } catch (err) {
      next(err);
    }
  });

  const unlockBody = z.object({ note: justification() });

  app.post("/api/locks/:id/unlock", requirePermission("account_lock:unlock"), async (req, res, next) => {
    try {
      const { note } = unlockBody.parse(req.body);
      const before = await getAccountLock(db, req.principal!, routeParam(req, "id"));
      if (!before) throw new HttpError(404, "lock_not_found");
      // The update only matches rows still locked, so a miss here means it was already lifted.
      const after = await unlockAccount(db, req.principal!, before.id, note);
      if (!after) throw new HttpError(409, "already_unlocked");
      await req.audit({
        action: "account_lock.unlock",
        resourceType: "account_lock",
        resourceId: after.id,
        subjectId: after.customer_reference,
        metadata: { lockReason: after.lock_reason, failedAttempts: after.failed_attempts, note },
      });
      res.json({ lock: after });
    } catch (err) {
      next(err);
    }
  });
}

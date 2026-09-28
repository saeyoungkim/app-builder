import type { Queryable } from "./db.js";
import type { Principal } from "./rbac.js";

/**
 * Audit logging as a service. Tools call record(); they never own the table,
 * the schema, or the retention rules. The sink is pluggable so the same call
 * sites can write to an external append-only store later.
 */
export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  /** The data subject the event concerns, for subject-access and erasure requests. */
  subjectId?: string;
  outcome?: "allowed" | "denied";
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  principal: Pick<Principal, "sub" | "email" | "roles">;
  tool: string;
  ip?: string;
  requestId?: string;
}

export interface AuditSink {
  write(event: AuditEvent, ctx: AuditContext): Promise<void>;
}

export class PostgresAuditSink implements AuditSink {
  constructor(private readonly db: Queryable) {}

  async write(event: AuditEvent, ctx: AuditContext): Promise<void> {
    await this.db.query(
      `insert into audit_log
         (actor_sub, actor_email, actor_roles, tool, action, resource_type, resource_id,
          subject_id, outcome, request_id, ip, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        ctx.principal.sub,
        ctx.principal.email,
        ctx.principal.roles,
        ctx.tool,
        event.action,
        event.resourceType,
        event.resourceId ?? null,
        event.subjectId ?? null,
        event.outcome ?? "allowed",
        ctx.requestId ?? null,
        ctx.ip ?? null,
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  }
}

export class StdoutAuditSink implements AuditSink {
  async write(event: AuditEvent, ctx: AuditContext): Promise<void> {
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...ctx, ...event })}\n`);
  }
}

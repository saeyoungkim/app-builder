import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import { ZodError } from "zod";
import { PostgresAuditSink, StdoutAuditSink, type AuditEvent, type AuditSink } from "./audit.js";
import type { PlatformConfig } from "./config.js";
import { getPool } from "./db.js";
import { buildAuthorizationRequest, exchangeCode } from "./oidc.js";
import { can, principalFromClaims, type Permission, type Principal } from "./rbac.js";
import { issueSession, readSession, sessionCookieName, sessionCookieOptions } from "./session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
      requestId: string;
      audit: (event: AuditEvent) => Promise<void>;
    }
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const LOGIN_STATE_COOKIE = "paved_login";

export interface Service {
  app: Express;
  config: PlatformConfig;
  db: ReturnType<typeof getPool>;
  audit: AuditSink;
  /** Guard a route on a permission. Denials are audited, not silently dropped. */
  requirePermission: (permission: Permission) => express.RequestHandler;
  requireSession: express.RequestHandler;
  /** Registers the error handler. Called by listen(); tests call it directly. */
  finalize: () => Express;
  listen: () => void;
}

/**
 * Every tool gets the same service: security headers, CORS, sessions, SSO,
 * RBAC, audit and error handling. A tool adds routes and nothing else.
 */
export function createService(config: PlatformConfig): Service {
  const app = express();
  const db = getPool(config.DATABASE_URL);
  const audit: AuditSink = config.AUDIT_SINK === "stdout" ? new StdoutAuditSink() : new PostgresAuditSink(db);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(config.SESSION_SECRET));

  app.use((req, _res, next) => {
    req.requestId = crypto.randomUUID();
    req.audit = (event: AuditEvent) =>
      audit.write(event, {
        principal: req.principal ?? { sub: "anonymous", email: "", roles: [] },
        tool: config.toolId,
        ip: req.ip,
        requestId: req.requestId,
      });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, tool: config.toolId });
  });

  const redirectUri = `${config.baseUrl}/auth/callback`;

  app.get("/auth/login", async (req, res, next) => {
    try {
      const request = await buildAuthorizationRequest({
        issuer: config.IDP_ISSUER,
        clientId: config.clientId,
        redirectUri,
      });
      const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : config.webOrigin;
      res.cookie(
        LOGIN_STATE_COOKIE,
        JSON.stringify({
          state: request.state,
          nonce: request.nonce,
          codeVerifier: request.codeVerifier,
          returnTo,
        }),
        { ...sessionCookieOptions, maxAge: 10 * 60 * 1000, signed: true },
      );
      res.redirect(request.url);
    } catch (err) {
      next(err);
    }
  });

  app.get("/auth/callback", async (req, res, next) => {
    try {
      const raw = req.signedCookies[LOGIN_STATE_COOKIE];
      if (typeof raw !== "string") throw new HttpError(400, "Missing or invalid login state");
      const saved = JSON.parse(raw) as { state: string; nonce: string; codeVerifier: string; returnTo: string };
      if (req.query.state !== saved.state) throw new HttpError(400, "OIDC state mismatch");
      const code = req.query.code;
      if (typeof code !== "string") throw new HttpError(400, "Missing authorization code");

      const claims = await exchangeCode({
        issuer: config.IDP_ISSUER,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri,
        code,
        codeVerifier: saved.codeVerifier,
        nonce: saved.nonce,
      });
      const principal = principalFromClaims(claims);
      res.clearCookie(LOGIN_STATE_COOKIE, { path: "/" });
      res.cookie(sessionCookieName, await issueSession(principal, config.SESSION_SECRET), sessionCookieOptions);
      req.principal = principal;
      await req.audit({
        action: "session.login",
        resourceType: "session",
        resourceId: principal.sub,
        metadata: { roles: principal.roles, groups: principal.groups },
      });
      res.redirect(saved.returnTo);
    } catch (err) {
      next(err);
    }
  });

  app.post("/auth/logout", async (req, res) => {
    if (req.principal) {
      await req.audit({ action: "session.logout", resourceType: "session", resourceId: req.principal.sub });
    }
    res.clearCookie(sessionCookieName, { path: "/" });
    res.json({ ok: true });
  });

  app.use(async (req, _res, next) => {
    const token = req.cookies?.[sessionCookieName];
    if (typeof token === "string") {
      req.principal = await readSession(token, config.SESSION_SECRET);
    }
    next();
  });

  app.get("/api/me", (req, res) => {
    if (!req.principal) {
      res.status(401).json({ error: "not_authenticated", loginUrl: `${config.baseUrl}/auth/login` });
      return;
    }
    res.json({ principal: req.principal });
  });

  const requireSession: express.RequestHandler = (req, res, next) => {
    if (!req.principal) {
      res.status(401).json({ error: "not_authenticated", loginUrl: `${config.baseUrl}/auth/login` });
      return;
    }
    next();
  };

  const requirePermission = (permission: Permission): express.RequestHandler => {
    return (req, res, next) => {
      if (!req.principal) {
        res.status(401).json({ error: "not_authenticated", loginUrl: `${config.baseUrl}/auth/login` });
        return;
      }
      if (!can(req.principal, permission)) {
        void req.audit({
          action: "authorization.denied",
          resourceType: "route",
          resourceId: `${req.method} ${req.path}`,
          outcome: "denied",
          metadata: { required: permission, roles: req.principal.roles },
        });
        res.status(403).json({ error: "forbidden", required: permission });
        return;
      }
      next();
    };
  };

  // The error handler must be registered after the tool's routes.
  const finalize = (): Express => {
    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "invalid_request",
          issues: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
        return;
      }
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) {
        process.stderr.write(`[${config.toolId}] ${req.requestId} ${String(err)}\n`);
      }
      res.status(status).json({ error: err instanceof HttpError ? err.message : "internal_error" });
    });
    return app;
  };

  const service: Service = {
    app,
    config,
    db,
    audit,
    requirePermission,
    requireSession,
    finalize,
    listen: () => {
      finalize();
      app.listen(config.port, () => {
        process.stdout.write(`[${config.toolId}] listening on ${config.baseUrl}\n`);
      });
    },
  };
  return service;
}

import { SignJWT, jwtVerify } from "jose";
import type { Principal } from "./rbac.js";

const COOKIE_NAME = "paved_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export const sessionCookieName = COOKIE_NAME;

export async function issueSession(principal: Principal, secret: string): Promise<string> {
  return new SignJWT({ principal: principal as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(principal.sub)
    .sign(new TextEncoder().encode(secret));
}

export async function readSession(token: string, secret: string): Promise<Principal | undefined> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.principal as unknown as Principal;
  } catch {
    return undefined;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS * 1000,
};

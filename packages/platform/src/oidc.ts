import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Minimal OIDC authorization-code + PKCE client. The issuer is configuration,
 * so the local development provider can be swapped for a corporate IdP
 * without touching any tool.
 */
export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface IdTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  groups?: string[];
  nonce?: string;
}

let cached: { issuer: string; doc: DiscoveryDocument } | undefined;

export async function discover(issuer: string): Promise<DiscoveryDocument> {
  if (cached?.issuer === issuer) return cached.doc;
  const res = await fetch(new URL("/.well-known/openid-configuration", issuer));
  if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer}: ${res.status}`);
  const doc = (await res.json()) as DiscoveryDocument;
  cached = { issuer, doc };
  return doc;
}

export interface AuthRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function buildAuthorizationRequest(opts: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}): Promise<AuthRequest> {
  const doc = await discover(opts.issuer);
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", opts.scope ?? "openid profile email groups");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, nonce, codeVerifier };
}

export async function exchangeCode(opts: {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  nonce: string;
}): Promise<IdTokenClaims> {
  const doc = await discover(opts.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
  });
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Token response contained no id_token");
  const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: doc.issuer,
    audience: opts.clientId,
  });
  const claims = payload as unknown as IdTokenClaims;
  if (claims.nonce !== opts.nonce) throw new Error("OIDC nonce mismatch");
  return claims;
}

/**
 * Local OIDC provider for development and CI.
 *
 * This exists because there is no corporate IdP available for the prototype.
 * It speaks standard OIDC discovery + authorization code + PKCE, so pointing
 * the tools at Okta/Entra later is a configuration change (IDP_ISSUER,
 * client id/secret) and no code change. It is NOT a production component:
 * it accepts any password and holds its users in a file.
 */
import { generateKeyPair, exportJWK } from "jose";
import Provider, { type Configuration } from "oidc-provider";
import { findUser, USERS } from "./users.ts";

const port = Number(process.env.IDP_PORT ?? 9000);
const issuer = process.env.IDP_ISSUER ?? `http://localhost:${port}`;

const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = await exportJWK(privateKey);

const configuration: Configuration = {
  jwks: { keys: [{ ...jwk, alg: "RS256", use: "sig" }] },
  clients: [
    {
      client_id: "customer-console",
      client_secret: process.env.CUSTOMER_CONSOLE_CLIENT_SECRET ?? "dev-customer-console-secret",
      redirect_uris: [`${process.env.CUSTOMER_CONSOLE_API_URL ?? "http://localhost:4001"}/auth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
    {
      client_id: "kyc-queue",
      client_secret: process.env.KYC_QUEUE_CLIENT_SECRET ?? "dev-kyc-queue-secret",
      redirect_uris: [`${process.env.KYC_QUEUE_API_URL ?? "http://localhost:4002"}/auth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
    {
      client_id: "dsar-console",
      client_secret: process.env.DSAR_CONSOLE_CLIENT_SECRET ?? "dev-dsar-console-secret",
      redirect_uris: [`${process.env.DSAR_CONSOLE_API_URL ?? "http://localhost:4003"}/auth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
    {
      client_id: "complaints-desk",
      client_secret: process.env.COMPLAINTS_DESK_CLIENT_SECRET ?? "dev-complaints-desk-secret",
      redirect_uris: [`${process.env.COMPLAINTS_DESK_API_URL ?? "http://localhost:4004"}/auth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
    {
      client_id: "account-unlock",
      client_secret: process.env.ACCOUNT_UNLOCK_CLIENT_SECRET ?? "dev-account-unlock-secret",
      redirect_uris: [`${process.env.ACCOUNT_UNLOCK_API_URL ?? "http://localhost:4005"}/auth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
  ],
  scopes: ["openid", "profile", "email", "groups"],
  claims: {
    openid: ["sub"],
    profile: ["name"],
    email: ["email"],
    groups: ["groups"],
  },
  conformIdTokenClaims: false,
  pkce: { required: () => true },
  features: {
    devInteractions: { enabled: true },
    revocation: { enabled: true },
  },
  ttl: { Session: 8 * 60 * 60, IdToken: 60 * 60 },
  cookies: {
    keys: [process.env.IDP_COOKIE_SECRET ?? "dev-idp-cookie-secret"],
  },
  findAccount: async (_ctx, id) => {
    const user = findUser(id);
    if (!user) return undefined;
    // accountId must echo the id the session was established with, otherwise the
    // grant and the session disagree. The stable directory id is the `sub` claim.
    return {
      accountId: id,
      claims: async () => ({
        sub: user.sub,
        email: user.email,
        name: user.name,
        groups: user.groups,
      }),
    };
  },
};

const provider = new Provider(issuer, configuration);
provider.proxy = true;

provider.on("server_error", (_ctx, err) => {
  process.stderr.write(`[idp] server_error: ${err.stack ?? String(err)}\n`);
});

provider.listen(port, () => {
  process.stdout.write(`[idp] local OIDC provider on ${issuer}\n`);
  process.stdout.write(`[idp] sign in with any password as one of:\n`);
  for (const user of USERS) {
    process.stdout.write(`[idp]   ${user.email.padEnd(45)} groups: ${user.groups.join(", ")}\n`);
  }
});

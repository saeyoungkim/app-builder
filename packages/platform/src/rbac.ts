/**
 * Roles are derived from directory groups, never stored per-user in the tool.
 * Permissions are checked server-side; the UI only decides what to render.
 */
export type Permission =
  | "customer:read"
  | "customer:read_pii"
  | "customer:write"
  | "customer:note:write"
  | "kyc:case:read"
  | "kyc:case:decide"
  | "dsar:read"
  | "dsar:resolve"
  | "complaint:read"
  | "complaint:log"
  | "complaint:close"
  | "audit:read";

export type Role = "support" | "data-steward" | "kyc-reviewer" | "compliance-admin";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  support: ["customer:read", "customer:note:write", "dsar:read", "complaint:read", "complaint:log"],
  "data-steward": [
    "customer:read",
    "customer:read_pii",
    "customer:write",
    "customer:note:write",
    "dsar:read",
    "dsar:resolve",
    "complaint:read",
    "complaint:log",
    "complaint:close",
  ],
  "kyc-reviewer": ["customer:read", "customer:read_pii", "kyc:case:read", "kyc:case:decide"],
  "compliance-admin": [
    "customer:read",
    "customer:read_pii",
    "customer:write",
    "customer:note:write",
    "kyc:case:read",
    "kyc:case:decide",
    "dsar:read",
    "dsar:resolve",
    "complaint:read",
    "complaint:log",
    "complaint:close",
    "audit:read",
  ],
};

const GROUP_TO_ROLE: Record<string, Role> = {
  "internal-support": "support",
  "data-stewards": "data-steward",
  "kyc-reviewers": "kyc-reviewer",
  "compliance-admins": "compliance-admin",
};

const REGION_GROUP_PREFIX = "region-";

export interface Principal {
  sub: string;
  email: string;
  name: string;
  groups: readonly string[];
  roles: readonly Role[];
  permissions: readonly Permission[];
  /** Row-level scope: which customer regions this principal may see. */
  regions: readonly string[];
}

export function principalFromClaims(claims: {
  sub: string;
  email?: string;
  name?: string;
  groups?: readonly string[];
}): Principal {
  const groups = claims.groups ?? [];
  const roles = [...new Set(groups.map((g) => GROUP_TO_ROLE[g]).filter((r): r is Role => Boolean(r)))];
  const permissions = [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]))];
  const regions = groups
    .filter((g) => g.startsWith(REGION_GROUP_PREFIX))
    .map((g) => g.slice(REGION_GROUP_PREFIX.length).toUpperCase());
  return {
    sub: claims.sub,
    email: claims.email ?? "",
    name: claims.name ?? claims.email ?? claims.sub,
    groups,
    roles,
    permissions,
    regions,
  };
}

export function can(principal: Principal, permission: Permission): boolean {
  return principal.permissions.includes(permission);
}

/** Global scope means every region; an empty region list means no rows at all. */
export function regionScope(principal: Principal): { all: boolean; regions: readonly string[] } {
  if (principal.groups.includes("region-global")) return { all: true, regions: [] };
  return { all: false, regions: principal.regions };
}

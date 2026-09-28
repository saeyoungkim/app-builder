import { can, principalFromClaims, regionScope } from "@paved/platform";
import { describe, expect, it } from "vitest";

describe("group-to-role mapping", () => {
  it("derives roles and permissions from directory groups only", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["internal-support", "region-EMEA"] });
    expect(p.roles).toEqual(["support"]);
    expect(can(p, "customer:read")).toBe(true);
    expect(can(p, "customer:read_pii")).toBe(false);
    expect(can(p, "customer:write")).toBe(false);
    expect(can(p, "kyc:case:decide")).toBe(false);
  });

  it("ignores unknown groups instead of granting anything", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["admins", "superuser", "wheel"] });
    expect(p.roles).toEqual([]);
    expect(p.permissions).toEqual([]);
  });

  it("unions permissions across multiple roles without duplicates", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["internal-support", "kyc-reviewers"] });
    expect(new Set(p.roles)).toEqual(new Set(["support", "kyc-reviewer"]));
    expect(new Set(p.permissions).size).toBe(p.permissions.length);
    expect(can(p, "audit:read")).toBe(false);
  });

  it("only compliance-admin can read the audit log", () => {
    const admin = principalFromClaims({ sub: "u1", groups: ["compliance-admins"] });
    const steward = principalFromClaims({ sub: "u2", groups: ["data-stewards"] });
    expect(can(admin, "audit:read")).toBe(true);
    expect(can(steward, "audit:read")).toBe(false);
  });
});

describe("row-level region scope", () => {
  it("scopes to the principal's regions", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["kyc-reviewers", "region-APAC", "region-EMEA"] });
    expect(regionScope(p)).toEqual({ all: false, regions: ["APAC", "EMEA"] });
  });

  it("treats region-global as every region", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["data-stewards", "region-global"] });
    expect(regionScope(p).all).toBe(true);
  });

  it("defaults to no rows when no region group is present", () => {
    const p = principalFromClaims({ sub: "u1", groups: ["data-stewards"] });
    expect(regionScope(p)).toEqual({ all: false, regions: [] });
  });
});

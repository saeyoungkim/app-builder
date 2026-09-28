import { applyFieldPolicy, principalFromClaims } from "@paved/platform";
import { CUSTOMER_FIELD_POLICY } from "@paved/data";
import { describe, expect, it } from "vitest";

const row = {
  id: "c1",
  reference: "CUS-0001",
  full_name: "Ada Synthetic",
  email: "ada@example-synthetic.test",
  phone: "+44 7700 900123",
  national_id: "SY-99-1234",
  address_line: "1 Test Street",
  city: "London",
  region: "EMEA",
  status: "active",
  risk_tier: "standard",
};

const support = principalFromClaims({ sub: "u1", groups: ["internal-support", "region-EMEA"] });
const steward = principalFromClaims({ sub: "u2", groups: ["data-stewards", "region-global"] });

describe("field-level PII policy", () => {
  it("masks PII for a principal without customer:read_pii", () => {
    const out = applyFieldPolicy(row, CUSTOMER_FIELD_POLICY, support);
    expect(out.national_id).toBe("••••••••");
    expect(out.email).not.toContain("ada@");
    expect(out.full_name).not.toBe("Ada Synthetic");
    expect(out._masked).toContain("national_id");
  });

  it("leaves non-PII fields readable so the tool still works", () => {
    const out = applyFieldPolicy(row, CUSTOMER_FIELD_POLICY, support);
    expect(out.region).toBe("EMEA");
    expect(out.status).toBe("active");
    expect(out.reference).toBe("CUS-0001");
  });

  it("returns values in the clear for a principal with customer:read_pii", () => {
    const out = applyFieldPolicy(row, CUSTOMER_FIELD_POLICY, steward);
    expect(out.national_id).toBe("SY-99-1234");
    expect(out._masked).toEqual([]);
  });
});

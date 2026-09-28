/**
 * Local development directory. Stands in for the corporate IdP: same OIDC
 * contract, same group claim, so tools are unchanged when it is swapped out.
 * Group membership is the only place roles are granted.
 */
export interface DirectoryUser {
  sub: string;
  email: string;
  name: string;
  groups: string[];
}

export const USERS: DirectoryUser[] = [
  {
    sub: "u-support-emea",
    email: "sam.support@example-synthetic.test",
    name: "Sam Support",
    groups: ["internal-support", "region-EMEA"],
  },
  {
    sub: "u-steward-global",
    email: "dana.steward@example-synthetic.test",
    name: "Dana Steward",
    groups: ["data-stewards", "region-global"],
  },
  {
    sub: "u-reviewer-apac",
    email: "ken.reviewer@example-synthetic.test",
    name: "Ken Reviewer",
    groups: ["kyc-reviewers", "region-APAC"],
  },
  {
    sub: "u-admin",
    email: "avery.admin@example-synthetic.test",
    name: "Avery Admin",
    groups: ["compliance-admins", "region-global"],
  },
];

export function findUser(login: string): DirectoryUser | undefined {
  const needle = login.trim().toLowerCase();
  return USERS.find((u) => u.sub === needle || u.email.toLowerCase() === needle);
}

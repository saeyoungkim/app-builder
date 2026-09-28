import { can, type Principal } from "./rbac.js";

/**
 * Field-level PII policy. Applied on the server on the way out, so a tool
 * cannot leak a field by forgetting to omit it from a template.
 */
export type FieldClassification = "public" | "internal" | "pii" | "sensitive-pii";

export interface FieldPolicy {
  [field: string]: FieldClassification;
}

function mask(value: unknown, classification: FieldClassification): unknown {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (classification === "sensitive-pii") return "••••••••";
  if (text.includes("@")) {
    const [local = "", domain = ""] = text.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  if (text.length <= 4) return "••••";
  return `${text.slice(0, 2)}${"•".repeat(Math.max(3, text.length - 4))}${text.slice(-2)}`;
}

export function applyFieldPolicy<T extends Record<string, unknown>>(
  row: T,
  policy: FieldPolicy,
  principal: Principal,
): T & { _masked: string[] } {
  const unmasked = can(principal, "customer:read_pii");
  const masked: string[] = [];
  const out: Record<string, unknown> = { ...row };
  for (const [field, classification] of Object.entries(policy)) {
    if (!(field in out)) continue;
    if (classification === "public" || classification === "internal") continue;
    if (unmasked) continue;
    out[field] = mask(out[field], classification);
    masked.push(field);
  }
  return { ...(out as T), _masked: masked };
}

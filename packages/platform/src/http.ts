import type { Request } from "express";
import { HttpError } from "./service.js";

/** Express 5 types a route param as string | string[]; tools must not guess. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "invalid_request");
  }
  return value;
}

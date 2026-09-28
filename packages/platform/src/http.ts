import type { Request } from "express";
import { z } from "zod";
import { HttpError } from "./service.js";

/**
 * Text a human must actually write: justifications, reasons, resolution notes.
 * Trimmed before measuring, so whitespace cannot satisfy a minimum length, and the
 * stored value is the trimmed one.
 */
export function justification(min = 10, max = 1000): z.ZodType<string, z.ZodTypeDef, string> {
  return z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .pipe(z.string().min(min));
}

/** Express 5 types a route param as string | string[]; tools must not guess. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "invalid_request");
  }
  return value;
}

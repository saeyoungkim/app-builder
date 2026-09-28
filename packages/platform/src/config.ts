/** Configuration is read once, validated, and never read from process.env elsewhere. */
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  IDP_ISSUER: z.string().url(),
  AUDIT_SINK: z.enum(["postgres", "stdout"]).default("postgres"),
  NODE_ENV: z.string().default("development"),
});

export type PlatformConfig = z.infer<typeof schema> & {
  toolId: string;
  port: number;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webOrigin: string;
};

/** Tools run from their own workspace directory, so the repo-root .env is found by walking up. */
function loadRootEnvFile(from: string = process.cwd()): void {
  const root = parse(from).root;
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    if (dir === root) return;
  }
}

export function loadConfig(tool: {
  toolId: string;
  port: number;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webOrigin: string;
}): PlatformConfig {
  loadRootEnvFile();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment configuration: ${missing}`);
  }
  return { ...parsed.data, ...tool };
}

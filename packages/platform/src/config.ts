/** Configuration is read once, validated, and never read from process.env elsewhere. */
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

export function loadConfig(tool: {
  toolId: string;
  port: number;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webOrigin: string;
}): PlatformConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment configuration: ${missing}`);
  }
  return { ...parsed.data, ...tool };
}

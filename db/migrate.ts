/** Migrations run in CI, in preview environments and in production, from the same files. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString });

await pool.query(`create extension if not exists pgcrypto`);
await pool.query(
  `create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())`,
);

const applied = new Set(
  (await pool.query<{ filename: string }>(`select filename from schema_migrations`)).rows.map((r) => r.filename),
);

for (const filename of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(filename)) continue;
  const sql = readFileSync(join(dir, filename), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into schema_migrations (filename) values ($1)`, [filename]);
    await client.query("commit");
    console.log(`applied ${filename}`);
  } catch (err) {
    await client.query("rollback");
    throw new Error(`migration ${filename} failed: ${String(err)}`);
  } finally {
    client.release();
  }
}

await pool.end();
console.log("migrations up to date");

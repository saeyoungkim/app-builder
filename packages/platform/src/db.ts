import pg from "pg";

let pool: pg.Pool | undefined;

export function getPool(connectionString: string): pg.Pool {
  if (!pool || (pool as unknown as { ending?: boolean; ended?: boolean }).ending || (pool as unknown as { ending?: boolean; ended?: boolean }).ended) {
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}

export type Queryable = Pick<pg.Pool, "query">;

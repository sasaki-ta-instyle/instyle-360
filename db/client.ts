import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DbClient = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __pgPool?: Pool;
  __db?: DbClient;
};

function buildPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });
}

export const pool: Pool = globalForDb.__pgPool ?? buildPool();
if (!globalForDb.__pgPool) globalForDb.__pgPool = pool;

export const db: DbClient =
  globalForDb.__db ?? drizzle(pool, { schema });
if (!globalForDb.__db) globalForDb.__db = db;

export { schema };

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
  // 既定は厳格モード（rejectUnauthorized: true）。
  // Neon の pooler は valid CA のため OK だが、自己署名証明書を使う環境では
  // DATABASE_REJECT_UNAUTHORIZED="false" で緩める。
  const reject = process.env.DATABASE_REJECT_UNAUTHORIZED !== "false";
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? undefined
      : { rejectUnauthorized: reject },
  });
}

export const pool: Pool = globalForDb.__pgPool ?? buildPool();
if (!globalForDb.__pgPool) globalForDb.__pgPool = pool;

export const db: DbClient =
  globalForDb.__db ?? drizzle(pool, { schema });
if (!globalForDb.__db) globalForDb.__db = db;

export { schema };

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const timezone = (process.env.DB_TIMEZONE || process.env.TZ || "UTC").replace(/'/g, "''");

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("connect", (client) => {
  client
    .query(`SET TIME ZONE '${timezone}'`)
    .catch((err) => console.error("Failed to set PostgreSQL timezone:", err));
});
export const db = drizzle(pool, { schema });

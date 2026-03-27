import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// ── Lazy / non-crashing DB initialisation ─────────────────────────────────────
// We deliberately do NOT throw here so the server can still open its port and
// answer Railway's health probe even if the DATABASE_URL is temporarily missing
// or the DB is slow to accept connections.
if (!process.env.DATABASE_URL) {
  console.error(
    "[DB] ⚠️  DATABASE_URL is not set — all database queries will fail. " +
    "Add the variable in Railway → Variables and redeploy."
  );
}

const isProduction = process.env.NODE_ENV === "production";

// Ensure Railway's Postgres URL includes SSL in production.
function buildConnectionString(): string {
  const raw = process.env.DATABASE_URL ?? "";
  if (!isProduction || !raw) return raw;
  // Append sslmode=require only if no ssl param is already present.
  const sep = raw.includes("?") ? "&" : "?";
  return raw.includes("sslmode") ? raw : `${raw}${sep}sslmode=require`;
}

export const pool = new Pool({
  connectionString: buildConnectionString(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(isProduction && { ssl: { rejectUnauthorized: false } }),
});

// Surface DB connection errors as warnings — never crash the process.
pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

export const db = drizzle(pool, { schema });

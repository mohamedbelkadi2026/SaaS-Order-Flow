import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "[DB] ⚠️  DATABASE_URL is not set — all database queries will fail. " +
    "Add the variable in Railway → Variables and redeploy."
  );
}

// Detect if this is a remote connection (has a real external hostname with a dot)
// Internal hosts like "helium", "localhost", "127.0.0.1" won't have dots in hostname
function isRemoteConnection(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    // Real external hosts contain a dot (e.g. xxx.railway.app, xxx.neon.tech)
    // Internal hosts like "helium", "localhost" do not
    return host.includes(".") && host !== "127.0.0.1";
  } catch {
    return false;
  }
}

// Ensure the connection string does not force sslmode=disable for remote DBs
function buildConnectionString(): string {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw || !isRemoteConnection(raw)) return raw;

  // Replace sslmode=disable with sslmode=require, or append sslmode=require
  if (raw.includes("sslmode=disable")) {
    return raw.replace("sslmode=disable", "sslmode=require");
  }
  if (!raw.includes("sslmode")) {
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}sslmode=require`;
  }
  return raw;
}

const connectionString = buildConnectionString();
const useSSL = isRemoteConnection(process.env.DATABASE_URL ?? "");

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(useSSL && { ssl: { rejectUnauthorized: false } }),
});

// Surface DB connection errors as warnings — never crash the process.
pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

// Log full connection target (no password) so Railway logs confirm the right DB
try {
  const parsed = new URL(process.env.DATABASE_URL ?? "");
  const safeUrl = `${parsed.protocol}//${parsed.username}:***@${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  console.log(`[DB] Target: ${safeUrl}`);
  console.log(`[DB] SSL: ${useSSL} | rejectUnauthorized: false | pool max: 20`);
} catch {
  console.log("[DB] DATABASE_URL could not be parsed — check Railway Variables");
}

export const db = drizzle(pool, { schema });

/**
 * Startup migration: ensures all critical tables exist on the production DB
 * (Railway) so a fresh deploy never hits a 500 from a missing table.
 *
 * NOTE: columns match the Drizzle schema exactly (serial integer PK, integer
 * store_id) — NOT the UUID-based schema in raw CREATE TABLE snippets floating
 * around, which would be incompatible with all ORM queries.
 */
export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── 0. Verify live connection and confirm which DB we're actually on ──
    const connCheck = await client.query("SELECT current_database(), current_user, version()");
    const { current_database, current_user } = connCheck.rows[0];
    console.log(`[DB] Connected ✅ — database: "${current_database}", user: "${current_user}"`);

    // ── 1. Verify carrier_accounts is visible via to_regclass (schema check) ──
    const regCheck = await client.query(`SELECT to_regclass('public.carrier_accounts') AS tbl`);
    const tableExists = regCheck.rows[0]?.tbl !== null;
    console.log(`[DB] to_regclass('public.carrier_accounts'): ${tableExists ? "EXISTS ✅" : "NOT FOUND — will create now"}`);

    // ── 2. CREATE TABLE using explicit public. prefix ─────────────────────────
    // NOTE: keeping SERIAL integer IDs — do NOT change to UUID, that breaks the ORM.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.carrier_accounts (
        id               SERIAL PRIMARY KEY,
        store_id         INTEGER NOT NULL,
        carrier_name     TEXT NOT NULL DEFAULT '',
        connection_name  TEXT NOT NULL DEFAULT 'Connection 1',
        api_key          TEXT NOT NULL DEFAULT '',
        api_secret       TEXT,
        api_url          TEXT,
        webhook_token    TEXT NOT NULL DEFAULT '',
        store_name       TEXT,
        is_default       INTEGER DEFAULT 0,
        is_active        INTEGER DEFAULT 1,
        assignment_rule  TEXT DEFAULT 'default',
        assignment_data  TEXT,
        settings         JSONB DEFAULT '{}',
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── 3. Ensure EVERY column exists (handles tables created manually/partially) ──
    await client.query(`
      ALTER TABLE public.carrier_accounts
        ADD COLUMN IF NOT EXISTS carrier_name     TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS api_key          TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS connection_name  TEXT NOT NULL DEFAULT 'Connection 1',
        ADD COLUMN IF NOT EXISTS api_secret       TEXT,
        ADD COLUMN IF NOT EXISTS api_url          TEXT,
        ADD COLUMN IF NOT EXISTS webhook_token    TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS store_name       TEXT,
        ADD COLUMN IF NOT EXISTS is_default       INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_active        INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS assignment_rule  TEXT DEFAULT 'default',
        ADD COLUMN IF NOT EXISTS assignment_data  TEXT,
        ADD COLUMN IF NOT EXISTS settings         JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP DEFAULT NOW();
    `);

    // ── 4. Confirm table is now accessible ────────────────────────────────────
    const finalCheck = await client.query(`SELECT to_regclass('public.carrier_accounts') AS tbl`);
    console.log(`[DB] carrier_accounts final check: ${finalCheck.rows[0]?.tbl ? "READY ✅" : "STILL MISSING ⚠️"}`);

    // ── 5. orders: add carrier tracking columns ───────────────────────────────
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS carrier_name TEXT,
        ADD COLUMN IF NOT EXISTS carrier_id   INTEGER;
    `);
    console.log("[DATABASE]: orders.carrier_name + carrier_id columns ensured.");

    // ── 6. email_verification_codes ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.email_verification_codes (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        code       TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[DATABASE]: email_verification_codes table verified/created.");

    // ── 7. users.preferred_language ───────────────────────────────────────────
    await client.query(`
      ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr';
    `);
    console.log("[DATABASE]: users.preferred_language column verified/created.");

  } catch (err: any) {
    console.error("[DATABASE] initializeDatabase error:", err.message);
    console.error("[DATABASE] Full error:", err);
  } finally {
    client.release();
  }
}

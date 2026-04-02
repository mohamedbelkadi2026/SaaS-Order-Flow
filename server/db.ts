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

// Log which DB we're connecting to (host only, no credentials)
try {
  const parsed = new URL(process.env.DATABASE_URL ?? "");
  console.log(`[DB] Connecting to ${parsed.hostname} (SSL: ${useSSL})`);
} catch {
  console.log("[DB] DATABASE_URL could not be parsed");
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS carrier_accounts (
        id               SERIAL PRIMARY KEY,
        store_id         INTEGER NOT NULL,
        carrier_name     TEXT NOT NULL,
        connection_name  TEXT NOT NULL DEFAULT 'Connection 1',
        api_key          TEXT NOT NULL,
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

    // Ensure EVERY column exists even if the table was created manually / partially
    // carrier_name and api_key are NOT NULL in the Drizzle schema but must use a default
    // here so that ADD COLUMN works when the table already has rows.
    await client.query(`
      ALTER TABLE carrier_accounts
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

    console.log("[DATABASE]: carrier_accounts table verified/created — all columns ensured.");

    // Ensure orders table has carrier tracking columns
    await client.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS carrier_name TEXT,
        ADD COLUMN IF NOT EXISTS carrier_id   INTEGER;
    `);
    console.log("[DATABASE]: orders.carrier_name + carrier_id columns ensured.");

    // email_verification_codes — required for the signup OTP flow
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        code       TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[DATABASE]: email_verification_codes table verified/created.");

    // preferred_language — added for multi-language onboarding support
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr';
    `);
    console.log("[DATABASE]: users.preferred_language column verified/created.");
  } catch (err: any) {
    console.error("[DATABASE] initializeDatabase error:", err.message);
  } finally {
    client.release();
  }
}

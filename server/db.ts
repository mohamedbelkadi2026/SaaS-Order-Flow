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
  max: 5,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 8_000,
  statement_timeout: 20_000,
  query_timeout: 20_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
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
  console.log(`[DB] SSL: ${useSSL} | rejectUnauthorized: false | pool max: 5`);
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
    console.log(`[DB] to_regclass('public.carrier_accounts'): ${tableExists ? "EXISTS" : "NOT FOUND — will create now"}`);

    // ── 2. UUID mismatch detector ─────────────────────────────────────────────
    // If the table was manually created with UUID columns it is incompatible with
    // the Drizzle ORM (which uses serial integer IDs). No real data can have been
    // saved while this mismatch existed, so it is safe to drop and recreate.
    if (tableExists) {
      const colTypes = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'carrier_accounts'
        ORDER BY ordinal_position
      `);
      const cols = colTypes.rows;
      const idCol   = cols.find((c: any) => c.column_name === 'id');
      const storeCol = cols.find((c: any) => c.column_name === 'store_id');
      const hasUUID = idCol?.data_type === 'uuid' || storeCol?.data_type === 'uuid';

      console.log(`[DB] carrier_accounts column types — id: ${idCol?.data_type ?? 'missing'}, store_id: ${storeCol?.data_type ?? 'missing'}`);

      if (hasUUID) {
        console.log(`[DB] ⚠️  UUID-based carrier_accounts detected — incompatible with ORM integer IDs.`);
        console.log(`[DB] Dropping and recreating carrier_accounts with correct integer schema...`);
        // CASCADE also removes any dependent FK constraints or views
        await client.query(`DROP TABLE public.carrier_accounts CASCADE`);
        console.log(`[DB] carrier_accounts dropped — will recreate below.`);
      } else {
        console.log(`[DB] carrier_accounts schema OK (integer IDs) ✅`);
      }
    }

    // ── 3. CREATE TABLE using explicit public. prefix ─────────────────────────
    // Columns intentionally use NOT NULL DEFAULT '' for text fields so that
    // ADD COLUMN IF NOT EXISTS also works on partially-created tables.
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
        store_name           TEXT,
        carrier_store_name   TEXT,
        is_default           INTEGER DEFAULT 0,
        is_active        INTEGER DEFAULT 1,
        assignment_rule  TEXT DEFAULT 'default',
        assignment_data  TEXT,
        settings         JSONB DEFAULT '{}',
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── 4. Ensure EVERY column exists (handles tables created manually/partially) ──
    await client.query(`
      ALTER TABLE public.carrier_accounts
        ADD COLUMN IF NOT EXISTS carrier_name     TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS api_key          TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS connection_name  TEXT NOT NULL DEFAULT 'Connection 1',
        ADD COLUMN IF NOT EXISTS api_secret       TEXT,
        ADD COLUMN IF NOT EXISTS api_url          TEXT,
        ADD COLUMN IF NOT EXISTS webhook_token    TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS store_name         TEXT,
        ADD COLUMN IF NOT EXISTS carrier_store_name TEXT,
        ADD COLUMN IF NOT EXISTS is_default         INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_active        INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS assignment_rule  TEXT DEFAULT 'default',
        ADD COLUMN IF NOT EXISTS assignment_data  TEXT,
        ADD COLUMN IF NOT EXISTS settings         JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP DEFAULT NOW();
    `);

    // ── 5. Confirm table is now accessible with correct schema ────────────────
    const finalColCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'carrier_accounts'
      ORDER BY ordinal_position
    `);
    const finalIdType = finalColCheck.rows.find((c: any) => c.column_name === 'id')?.data_type;
    console.log(`[DB] carrier_accounts READY ✅ — id type: ${finalIdType ?? 'unknown'} (expected: integer)`);

    // ── 5. carrier_cities — live city cache synced from carrier API ───────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.carrier_cities (
        id           SERIAL PRIMARY KEY,
        store_id     INTEGER NOT NULL,
        carrier_name TEXT NOT NULL,
        account_id   INTEGER,
        cities       JSONB NOT NULL DEFAULT '[]',
        city_count   INTEGER DEFAULT 0,
        synced_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, carrier_name)
      );
    `);
    console.log("[DATABASE]: carrier_cities table verified/created.");

    // ── 5b. ameex_cities — Ameex city name → numeric ID mapping ─────────────
    // Ameex's shipment API requires city as a numeric ID, not a name string.
    // Populated by "Synchroniser les villes" on the Ameex carrier account.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ameex_cities (
        id          SERIAL PRIMARY KEY,
        store_id    INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        name_norm   TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, external_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ameex_cities_store_norm
        ON public.ameex_cities (store_id, name_norm);
    `);
    console.log("[DATABASE]: ameex_cities table verified/created.");

    // ── 5c. orders: offer_name + ameex_product_id enrichment columns ─────────
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS offer_name        TEXT,
        ADD COLUMN IF NOT EXISTS ameex_product_id  TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_offer_name
        ON public.orders (offer_name) WHERE offer_name IS NOT NULL;
    `);
    console.log("[DATABASE]: orders.offer_name + ameex_product_id columns ensured.");

    // ── 6. orders: add carrier tracking columns ───────────────────────────────
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS carrier_name TEXT,
        ADD COLUMN IF NOT EXISTS carrier_id   INTEGER;
    `);
    console.log("[DATABASE]: orders.carrier_name + carrier_id columns ensured.");

    // ── 6b. orders: livreur (driver) info from carrier webhook/sync ───────────
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS driver_name  TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS driver_phone TEXT DEFAULT '';
    `);
    console.log('[Migration] driver_name + driver_phone columns ensured ✅');

    // ── 6c. orders.magasin_id — per-magasin scoping for multi-boutique accounts ─
    // Nullable (legacy rows have no magasin). FK to stores(id) for referential integrity.
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER REFERENCES public.stores(id);
    `);
    console.log('[Migration] orders.magasin_id column ensured ✅');

    // ── 6c-bis. ad_spend(_tracking).magasin_id — per-magasin ad spend scoping ──
    // Same pattern as orders.magasin_id: nullable FK to stores(id). Existing
    // rows are NULL until either (a) the single-magasin backfill below tags
    // them, or (b) the admin re-files them via the Publicités UI. The profit
    // engine respects this column so each magasin gets an honest ROI.
    await client.query(`
      ALTER TABLE public.ad_spend
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER REFERENCES public.stores(id);
    `);
    await client.query(`
      ALTER TABLE public.ad_spend_tracking
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER REFERENCES public.stores(id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_spend_magasin
        ON public.ad_spend (magasin_id, date);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_spend_tracking_magasin
        ON public.ad_spend_tracking (magasin_id, date);
    `);
    // Single-magasin backfill: if the account that owns this ad_spend row's
    // store_id has exactly ONE magasin, attribute the row to that magasin.
    // Multi-magasin accounts are left NULL — the admin will reassign in UI.
    // Idempotent: only updates rows where magasin_id IS NULL.
    await client.query(`
      UPDATE public.ad_spend a
      SET magasin_id = (
        SELECT id FROM public.stores s
        WHERE s.owner_id = (SELECT owner_id FROM public.stores WHERE id = a.store_id LIMIT 1)
        LIMIT 1
      )
      WHERE a.magasin_id IS NULL
        AND (SELECT count(*) FROM public.stores
             WHERE owner_id = (SELECT owner_id FROM public.stores WHERE id = a.store_id LIMIT 1)) = 1;
    `);
    await client.query(`
      UPDATE public.ad_spend_tracking a
      SET magasin_id = (
        SELECT id FROM public.stores s
        WHERE s.owner_id = (SELECT owner_id FROM public.stores WHERE id = a.store_id LIMIT 1)
        LIMIT 1
      )
      WHERE a.magasin_id IS NULL
        AND (SELECT count(*) FROM public.stores
             WHERE owner_id = (SELECT owner_id FROM public.stores WHERE id = a.store_id LIMIT 1)) = 1;
    `);
    console.log('[Migration] ad_spend(_tracking).magasin_id ensured ✅ (single-magasin backfill applied)');

    // ── 6d. stores.distribution_epoch — reference window for percentage engine ─
    await pool.query(`
      ALTER TABLE public.stores
        ADD COLUMN IF NOT EXISTS distribution_epoch TIMESTAMP DEFAULT NOW();
    `);
    // Backfill any existing NULL epochs so the very first percentage call
    // doesn't degrade to "today 00:00" fallback.
    await pool.query(`
      UPDATE public.stores SET distribution_epoch = NOW() WHERE distribution_epoch IS NULL;
    `);
    console.log('[Migration] stores.distribution_epoch ensured ✅');

    // ── 6e. stores.distribution_method — per-magasin distribution rule ──────
    // Previously this lived on users.distribution_method (account-wide). We
    // move it to the magasin level so a single account can run different
    // strategies per magasin.
    //
    // CRITICAL: column is added WITHOUT a default first. If we added it with
    // DEFAULT 'auto', existing rows would be back-filled to 'auto' immediately
    // and the subsequent IS NULL backfill from owner would never fire — so
    // legacy users with owner.distribution_method='pourcentage' would silently
    // lose their config. The correct sequence is:
    //   1. ADD COLUMN (no default) → existing rows get NULL
    //   2. UPDATE FROM owner where NULL → legacy values copied
    //   3. UPDATE remaining NULLs to 'auto' → orphans handled
    //   4. ALTER … SET DEFAULT 'auto' → future inserts get 'auto'
    // Step 2/3 are idempotent on re-runs because no rows are NULL anymore.
    await pool.query(`
      ALTER TABLE public.stores
        ADD COLUMN IF NOT EXISTS distribution_method TEXT;
    `);
    await pool.query(`
      UPDATE public.stores s
      SET distribution_method = COALESCE(u.distribution_method, 'auto')
      FROM public.users u
      WHERE s.owner_id = u.id
        AND s.distribution_method IS NULL;
    `);
    await pool.query(`
      UPDATE public.stores SET distribution_method = 'auto' WHERE distribution_method IS NULL;
    `);
    await pool.query(`
      ALTER TABLE public.stores ALTER COLUMN distribution_method SET DEFAULT 'auto';
    `);
    console.log('[Migration] stores.distribution_method ensured ✅ (back-filled from owner)');

    // ── 6e-bis. one-shot corrective backfill ────────────────────────────────
    // An earlier version of the migration above used `DEFAULT 'auto'` on the
    // ADD COLUMN, which made existing rows non-NULL immediately and caused the
    // "IS NULL" backfill to silently no-op. Any DB that already ran that
    // broken version has stores.distribution_method='auto' even when the
    // owner had set 'pourcentage' / 'produit' / 'region'. This block repairs
    // those stores exactly once, guarded by a tiny migration-state table so
    // it never runs twice (which would clobber a user's deliberate later
    // choice of 'auto' on a magasin).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._migration_state (
        key         TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const repairKey = 'stores_distmethod_repair_v1';
    const { rows: alreadyRun } = await pool.query(
      `SELECT 1 FROM public._migration_state WHERE key = $1 LIMIT 1`,
      [repairKey],
    );
    if (alreadyRun.length === 0) {
      const repaired = await pool.query(`
        UPDATE public.stores s
        SET distribution_method = u.distribution_method
        FROM public.users u
        WHERE s.owner_id = u.id
          AND s.distribution_method = 'auto'
          AND u.distribution_method IS NOT NULL
          AND u.distribution_method <> 'auto';
      `);
      await pool.query(
        `INSERT INTO public._migration_state (key) VALUES ($1) ON CONFLICT DO NOTHING`,
        [repairKey],
      );
      console.log(`[Migration] stores.distribution_method one-shot repair ✅ (${repaired.rowCount ?? 0} stores reconciled from owner)`);
    } else {
      console.log('[Migration] stores.distribution_method one-shot repair already applied (skipped)');
    }

    // ── 6e-ter. perf index for the percentage engine's count query ──────────
    // The "% method" engine runs SELECT count(*) FROM orders WHERE assigned_to_id=?
    // AND magasin_id=? AND created_at >= distribution_epoch on every webhook
    // order. This composite index makes that lookup O(log n) instead of a scan.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin_created
        ON public.orders (assigned_to_id, magasin_id, created_at);
    `);
    console.log('[Migration] idx_orders_assigned_magasin_created ensured ✅');

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

    // ── 8. carrier_accounts.carrier_store_name ────────────────────────────────
    await client.query(`
      ALTER TABLE public.carrier_accounts
        ADD COLUMN IF NOT EXISTS carrier_store_name TEXT;
    `);
    console.log("[Migration] carrier_store_name column ensured ✅");

    // ── 9. stores: magasin multi-select metadata columns ─────────────────────
    await client.query(`
      ALTER TABLE public.stores
        ADD COLUMN IF NOT EXISTS agent_ids       JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS services        JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS linked_carriers JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS linked_platforms JSONB DEFAULT '[]';
    `);
    console.log("[Migration] stores multi-select columns ensured ✅");

    // ── 10. store_integrations: new multi-key columns ────────────────────────
    await client.query(`
      ALTER TABLE public.store_integrations
        ADD COLUMN IF NOT EXISTS webhook_key     TEXT,
        ADD COLUMN IF NOT EXISTS connection_name TEXT,
        ADD COLUMN IF NOT EXISTS orders_count    INTEGER DEFAULT 0;
    `);
    console.log("[Migration] store_integrations new columns ensured ✅");

    // ── 12. store_integrations: magasin_id for per-magasin scoping ───────────
    await client.query(`
      ALTER TABLE public.store_integrations
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER REFERENCES stores(id);
    `);
    console.log("[Migration] store_integrations.magasin_id ensured ✅");

    // ── 12b. store_integrations: Google OAuth + polling columns ──────────────
    await client.query(`
      ALTER TABLE public.store_integrations
        ADD COLUMN IF NOT EXISTS oauth_access_token  TEXT,
        ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
        ADD COLUMN IF NOT EXISTS oauth_expires_at    TIMESTAMP,
        ADD COLUMN IF NOT EXISTS spreadsheet_id      TEXT,
        ADD COLUMN IF NOT EXISTS spreadsheet_name    TEXT,
        ADD COLUMN IF NOT EXISTS sync_tabs           TEXT,
        ADD COLUMN IF NOT EXISTS last_sync_state     JSONB,
        ADD COLUMN IF NOT EXISTS last_sync_at        TIMESTAMP;
    `);
    console.log("[Migration] store_integrations Google OAuth columns ensured ✅");

    // ── 12c. store_integrations: public URL + status columns ─────────────────
    await client.query(`
      ALTER TABLE public.store_integrations
        ADD COLUMN IF NOT EXISTS gsheet_url        TEXT,
        ADD COLUMN IF NOT EXISTS gsheet_id         TEXT,
        ADD COLUMN IF NOT EXISTS gsheet_tabs       JSONB,
        ADD COLUMN IF NOT EXISTS gsheet_sync_state JSONB DEFAULT '{}'::JSONB,
        ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'active';
    `);
    console.log("[Migration] store_integrations public URL columns ensured ✅");

    // ── 13. carrier_accounts: magasin_id for per-magasin carrier scoping ─────
    await client.query(`
      ALTER TABLE public.carrier_accounts
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER;
    `);
    console.log("[Migration] carrier_accounts.magasin_id ensured ✅");

    // ── 14. carrier_accounts: delivery_fee per carrier account ───────────────
    await client.query(`
      ALTER TABLE public.carrier_accounts
        ADD COLUMN IF NOT EXISTS delivery_fee INTEGER DEFAULT 0;
    `);
    console.log("[Migration] carrier_accounts.delivery_fee ensured ✅");

    // ── 11. backfill stores.owner_id for signup-created stores ───────────────
    // Stores created during signup had owner_id = NULL because the user record
    // didn't exist yet at insert time. Fix this by joining to the users table.
    const ownerFix = await client.query(`
      UPDATE public.stores s
        SET owner_id = u.id
      FROM public.users u
      WHERE s.owner_id IS NULL
        AND u.store_id = s.id
        AND u.role = 'owner'
    `);
    if (ownerFix.rowCount && ownerFix.rowCount > 0) {
      console.log(`[Migration] stores.owner_id backfilled for ${ownerFix.rowCount} existing store(s) ✅`);
    } else {
      console.log("[Migration] stores.owner_id — no NULL owner_ids found, nothing to fix ✅");
    }

    // ── retargeting_leads table ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.retargeting_leads (
        id           SERIAL PRIMARY KEY,
        store_id     INTEGER NOT NULL REFERENCES stores(id),
        name         TEXT NOT NULL DEFAULT '',
        phone        TEXT NOT NULL DEFAULT '',
        last_product TEXT DEFAULT '',
        source       TEXT DEFAULT 'import',
        campaign     TEXT DEFAULT '',
        status       TEXT DEFAULT 'pending',
        sent_at      TIMESTAMP,
        created_at   TIMESTAMP DEFAULT NOW(),
        imported_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_retargeting_leads_store 
      ON public.retargeting_leads(store_id);
    `);
    // Ensure imported_at exists on tables created before this column was added
    await client.query(`
      ALTER TABLE public.retargeting_leads
        ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP DEFAULT NOW();
    `);
    console.log('[Migration] retargeting_leads table verified/created ✅');

    // ── store_agent_settings.magasin_id — per-magasin lead percentage ─────────
    // Existing rows (magasin_id = NULL) act as the "account-wide default" row
    // (role, allowed products/regions, commission, fallback %). New per-magasin
    // rows hold a magasinId and override only the leadPercentage at the
    // magasin level. Composite uniqueness: (agentId, storeId, magasinId).
    await client.query(`
      ALTER TABLE public.store_agent_settings
        ADD COLUMN IF NOT EXISTS magasin_id INTEGER REFERENCES public.stores(id);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_store_agent_settings_agent_store_magasin
        ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_store_agent_settings_magasin
        ON public.store_agent_settings (magasin_id);
    `);
    console.log('[Migration] store_agent_settings.magasin_id ensured ✅');

    // ── marketing_campaigns — missing columns ─────────────────────────────────
    await client.query(`
      ALTER TABLE public.marketing_campaigns
        ADD COLUMN IF NOT EXISTS sender_device_id INTEGER;
    `);
    await client.query(`
      ALTER TABLE public.marketing_campaigns
        ADD COLUMN IF NOT EXISTS rotation_enabled INTEGER DEFAULT 0;
    `);
    console.log('[Migration] marketing_campaigns columns ensured ✅');

    // ── orders.last_action_at / last_action_by — agent action tracking ────────
    // Stamped on every human status/comment mutation (NOT on creation or
    // auto-assign). Powers the Team page "Actions du jour" column so we count
    // agent ACTIONS taken today (per-magasin filterable) instead of all-time
    // assignments. Distribution math is untouched.
    await client.query(`
      ALTER TABLE public.orders
        ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_action_by INTEGER REFERENCES public.users(id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_last_action_by_at
        ON public.orders (last_action_by, last_action_at);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_magasin_last_action_at
        ON public.orders (magasin_id, last_action_at);
    `);
    console.log('[Migration] orders.last_action_at / last_action_by ensured ✅');

    // One-shot backfill so historical orders that were already actioned (i.e.
    // status moved past 'nouveau') show up in the new "Actions du jour" view
    // for the day they were last touched. Guarded so it never runs twice.
    const backfillKey = 'orders_last_action_backfill_v1';
    const { rows: backfillDone } = await pool.query(
      `SELECT 1 FROM public._migration_state WHERE key = $1 LIMIT 1`,
      [backfillKey],
    );
    if (backfillDone.length === 0) {
      const backfilled = await pool.query(`
        UPDATE public.orders
        SET last_action_at = updated_at,
            last_action_by = assigned_to_id
        WHERE status <> 'nouveau'
          AND last_action_at IS NULL
          AND assigned_to_id IS NOT NULL;
      `);
      await pool.query(
        `INSERT INTO public._migration_state (key) VALUES ($1) ON CONFLICT DO NOTHING`,
        [backfillKey],
      );
      console.log(`[Migration] orders.last_action_at one-shot backfill ✅ (${backfilled.rowCount ?? 0} orders stamped from updated_at)`);
    } else {
      console.log('[Migration] orders.last_action_at one-shot backfill already applied (skipped)');
    }

  } catch (err: any) {
    console.error("[DATABASE] initializeDatabase error:", err.message);
    console.error("[DATABASE] Full error:", err);
  } finally {
    client.release();
  }
}

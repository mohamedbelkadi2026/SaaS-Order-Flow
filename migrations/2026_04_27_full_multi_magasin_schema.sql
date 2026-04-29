-- ──────────────────────────────────────────────────────────────────────────
-- Full multi-magasin schema migration (2026-04-27)
-- ──────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
--   The runtime ALTER TABLE block in server/db.ts initializeDatabase() runs
--   on every dev-environment boot, so the dev DB has all of these columns.
--   Production, however, was provisioned from an older snapshot and never
--   ran those ALTERs — meaning every fix that referenced magasin_id,
--   distribution_method, distribution_epoch, last_action_at, etc. was
--   silently rejected at the DB layer (try/catch swallowed the errors and
--   the UI showed success while nothing was written).
--
--   Symptom in production: agent percentages save in the UI but never
--   actually persist, so getNextAgent falls back to the default and a
--   single agent ends up receiving every order.
--
-- HOW TO RUN
--   Open Replit → Database → SQL runner → paste this entire file → Run.
--   Every statement uses IF NOT EXISTS, so it's safe to re-run.
--
-- AFTER RUNNING
--   1. Restart the deployed server (Stop → Run) so it picks up the new
--      schema metadata.
--   2. Re-save your per-magasin agent percentages on the Team page.
--   3. Verify with the read-only SELECTs at the bottom of this file.
-- ──────────────────────────────────────────────────────────────────────────

-- (transaction now managed by server/migrate.ts)

-- ============================================================
-- 1. stores: per-magasin configuration columns
-- ============================================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_method text DEFAULT 'auto';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_epoch  timestamp DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS agent_ids           jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS services            jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_carriers     jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_platforms    jsonb DEFAULT '[]'::jsonb;

-- ============================================================
-- 2. orders: magasin scope + action tracking
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS magasin_id     integer REFERENCES public.stores(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_at timestamp;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_by integer REFERENCES public.users(id);

-- ============================================================
-- 3. store_agent_settings: per-magasin override
-- ============================================================
ALTER TABLE public.store_agent_settings ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- Drop any conflicting old uniqueness constraint, then recreate it on
-- (agent_id, store_id, magasin_id). NULL magasin_id = account-wide default.
ALTER TABLE public.store_agent_settings
  DROP CONSTRAINT IF EXISTS store_agent_settings_agent_id_store_id_key;

DROP INDEX IF EXISTS store_agent_settings_agent_store_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS store_agent_settings_agent_store_magasin_uniq
  ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));

-- ============================================================
-- 4. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id        ON public.orders (magasin_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin  ON public.orders (assigned_to_id, magasin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_action       ON public.orders (last_action_by, last_action_at);
CREATE INDEX IF NOT EXISTS idx_store_agent_magasin      ON public.store_agent_settings (magasin_id);

-- ============================================================
-- 5. Backfill: existing orders get magasin_id from their integration source
-- ============================================================
UPDATE public.orders o
SET magasin_id = si.magasin_id
FROM public.store_integrations si
WHERE o.store_id = si.store_id
  AND si.magasin_id IS NOT NULL
  AND o.magasin_id IS NULL
  AND o.source = si.provider;

-- ============================================================
-- 6. Backfill: every magasin gets a fresh epoch right now
-- ============================================================
UPDATE public.stores SET distribution_epoch = now() WHERE distribution_epoch IS NULL;

-- (transaction now managed by server/migrate.ts)

-- ============================================================
-- 7. Verify everything landed (run AFTER commit)
-- ============================================================
-- Each query below MUST return the expected count. If any returns a smaller
-- number, the migration didn't apply cleanly — stop and inspect the error.

-- Should return 6:
SELECT count(*) AS stores_new_cols FROM information_schema.columns
WHERE table_schema='public' AND table_name='stores'
  AND column_name IN ('distribution_method','distribution_epoch','agent_ids','services','linked_carriers','linked_platforms');

-- Should return 3:
SELECT count(*) AS orders_new_cols FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('magasin_id','last_action_at','last_action_by');

-- Should return 1:
SELECT count(*) AS sas_new_col FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_agent_settings'
  AND column_name='magasin_id';

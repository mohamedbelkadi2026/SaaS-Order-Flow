-- ============================================================================
-- 2026-04-28 — Full multi-magasin schema (idempotent safety net)
-- ============================================================================
-- Purpose
--   Guarantees every column, constraint, index, and back-fill needed by the
--   per-magasin distribution / per-magasin percentages / Boutique-column /
--   action-tracking features exists, regardless of whether the server's
--   startup migrations have run yet.
--
-- When to run
--   • Automatically: not needed — the development & freshly-deployed
--     production servers already run idempotent migrations at startup.
--   • Manually: run this file via the Database tab's SQL runner against any
--     external / self-hosted Postgres that pre-dates the startup migration
--     hooks (e.g. a backup restored onto a fresh host, or a long-lived
--     production DB that has not been redeployed in a while).
--
-- Safety
--   100% idempotent. Every ALTER uses `IF NOT EXISTS`; every index uses
--   `IF NOT EXISTS`; every constraint drop uses `IF EXISTS`. Running it twice
--   is a no-op. It contains zero `DROP COLUMN` / `DROP TABLE` statements and
--   never touches primary-key column types.
--
-- Do NOT run `npm run db:push` against this database — it bypasses the
-- _migration_state guard table that the startup hooks rely on.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. stores: per-magasin configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_method     text DEFAULT 'auto';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_epoch      timestamp DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS agent_ids               jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS services                jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_carriers         jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_platforms        jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS last_assigned_agent_id  integer;

-- ----------------------------------------------------------------------------
-- 2. orders: magasin scope + action tracking
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS magasin_id      integer REFERENCES public.stores(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_at  timestamp;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_by  integer REFERENCES public.users(id);

-- ----------------------------------------------------------------------------
-- 3. store_agent_settings: per-magasin override (the critical missing piece)
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_agent_settings ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- Replace the legacy (agent_id, store_id) uniqueness with one keyed on
-- (agent, store, magasin). COALESCE(magasin_id, 0) keeps a NULL-magasin row
-- as the legacy default while still allowing one row per real magasin.
ALTER TABLE public.store_agent_settings
  DROP CONSTRAINT IF EXISTS store_agent_settings_agent_id_store_id_key;
ALTER TABLE public.store_agent_settings
  DROP CONSTRAINT IF EXISTS store_agent_settings_agent_store_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_store_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_magasin_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_store_magasin_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_agent_settings_agent_store_magasin
  ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));

-- ----------------------------------------------------------------------------
-- 4. Performance indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id              ON public.orders (magasin_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin_created ON public.orders (assigned_to_id, magasin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_action_by_at       ON public.orders (last_action_by, last_action_at);
CREATE INDEX IF NOT EXISTS idx_orders_magasin_last_action_at  ON public.orders (magasin_id, last_action_at);
CREATE INDEX IF NOT EXISTS idx_store_agent_settings_magasin   ON public.store_agent_settings (magasin_id);

-- ----------------------------------------------------------------------------
-- 5. Back-fill: stamp magasin_id on existing orders via integration source
-- ----------------------------------------------------------------------------
UPDATE public.orders o
SET magasin_id = si.magasin_id
FROM public.store_integrations si
WHERE o.store_id    = si.store_id
  AND si.magasin_id IS NOT NULL
  AND o.magasin_id  IS NULL
  AND o.source      = si.provider;

-- ----------------------------------------------------------------------------
-- 6. Back-fill: every magasin gets a fresh distribution epoch
-- ----------------------------------------------------------------------------
UPDATE public.stores
SET distribution_epoch = now()
WHERE distribution_epoch IS NULL;

-- ----------------------------------------------------------------------------
-- 7. Force every existing magasin into 'pourcentage' mode
--    (matches user intent: percentages have already been entered in the UI)
-- ----------------------------------------------------------------------------
UPDATE public.stores
SET distribution_method = 'pourcentage'
WHERE distribution_method = 'auto'
  AND id IN (SELECT DISTINCT magasin_id FROM public.store_integrations WHERE magasin_id IS NOT NULL);

COMMIT;

-- ============================================================================
-- 8. Verification — all four counts MUST hit the expected value
-- ============================================================================
SELECT 'stores cols' AS check, count(*) AS got, 7 AS expected FROM information_schema.columns
WHERE table_schema='public' AND table_name='stores'
  AND column_name IN ('distribution_method','distribution_epoch','agent_ids','services','linked_carriers','linked_platforms','last_assigned_agent_id');

SELECT 'orders cols' AS check, count(*) AS got, 3 AS expected FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('magasin_id','last_action_at','last_action_by');

SELECT 'sas col' AS check, count(*) AS got, 1 AS expected FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_agent_settings' AND column_name='magasin_id';

SELECT 'orders backfilled' AS check, count(magasin_id) AS got_with_magasin, count(*) AS got_total FROM public.orders;

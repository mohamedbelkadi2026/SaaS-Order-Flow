-- ============================================================================
-- Complete schema migration — superset of every column the codebase writes to.
-- Idempotent: every statement uses IF NOT EXISTS / DROP IF EXISTS, safe to
-- re-run on any database (dev OR production).
--
-- Why this exists:
--   The Digylog/Ameex sync code writes driver_phone, driver_name, carrier_id,
--   carrier_name, magasin_id, last_action_at, last_action_by. If any of those
--   columns are missing on the target DB, the UPDATE throws inside a try/catch
--   and the subsequent updateOrderStatus call never runs — sync silently
--   appears to "succeed" but no order moves.
--
--   This migration adds every column that has been introduced since the
--   original schema, so a fresh production DB catches up in a single pass.
-- ============================================================================
BEGIN;

-- ============================================================================
-- STORES — per-magasin config
-- ============================================================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_method     text      DEFAULT 'auto';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_epoch      timestamp DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS agent_ids               jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS services                jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_carriers         jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_platforms        jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS last_assigned_agent_id  integer;

-- ============================================================================
-- ORDERS — magasin scope, action tracking, carrier+driver fields
-- ============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS magasin_id     integer    REFERENCES public.stores(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_at timestamp;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_by integer    REFERENCES public.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_id     integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_name   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_name    text       DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_phone   text       DEFAULT '';

-- ============================================================================
-- STORE_AGENT_SETTINGS — per-magasin overrides
-- ============================================================================
ALTER TABLE public.store_agent_settings ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- Drop legacy unique constraints/indexes so we can install the (agent, store, magasin) one.
ALTER TABLE public.store_agent_settings DROP CONSTRAINT IF EXISTS store_agent_settings_agent_id_store_id_key;
ALTER TABLE public.store_agent_settings DROP CONSTRAINT IF EXISTS store_agent_settings_agent_store_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_store_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_magasin_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_store_magasin_uniq;
CREATE UNIQUE INDEX store_agent_settings_agent_store_magasin_uniq
  ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id        ON public.orders (magasin_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin  ON public.orders (assigned_to_id, magasin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_action       ON public.orders (last_action_by, last_action_at);
CREATE INDEX IF NOT EXISTS idx_orders_track_provider    ON public.orders (shipping_provider, track_number);
CREATE INDEX IF NOT EXISTS idx_store_agent_magasin      ON public.store_agent_settings (magasin_id);

-- ============================================================================
-- BACKFILL
-- ============================================================================
-- Stamp magasin_id on existing orders by joining through store_integrations on source.
UPDATE public.orders o
SET magasin_id = si.magasin_id
FROM public.store_integrations si
WHERE o.store_id    = si.store_id
  AND si.magasin_id IS NOT NULL
  AND o.magasin_id  IS NULL
  AND o.source      = si.provider;

-- Make sure every store has a distribution epoch so per-magasin percentages start counting.
UPDATE public.stores SET distribution_epoch = now() WHERE distribution_epoch IS NULL;

COMMIT;

-- ============================================================================
-- VERIFY — every row below MUST match its expected count.
-- If `got` is lower than `expected`, the migration didn't fully apply
-- (most likely a permission/rollback issue — paste the Postgres error).
-- ============================================================================
SELECT 'stores cols (expect 7)'   AS check, count(*) AS got FROM information_schema.columns
WHERE table_schema='public' AND table_name='stores'
  AND column_name IN ('distribution_method','distribution_epoch','agent_ids','services','linked_carriers','linked_platforms','last_assigned_agent_id');

SELECT 'orders cols (expect 7)'   AS check, count(*) AS got FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('magasin_id','last_action_at','last_action_by','carrier_id','carrier_name','driver_name','driver_phone');

SELECT 'sas col (expect 1)'       AS check, count(*) AS got FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_agent_settings' AND column_name='magasin_id';

SELECT 'orders backfilled' AS check, count(magasin_id) AS got_with_magasin, count(*) AS got_total FROM public.orders;

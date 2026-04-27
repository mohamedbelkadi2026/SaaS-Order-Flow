-- ──────────────────────────────────────────────────────────────────────────
-- Add orders.magasin_id (Boutique column) + action tracking columns
-- ──────────────────────────────────────────────────────────────────────────
-- Why this exists as a standalone file:
--   The runtime ALTER TABLE block in server/db.ts initializeDatabase() runs
--   on every dev boot, but the production database may have been provisioned
--   from an older snapshot where these columns are missing. Without them:
--     • Every order's `magasin` field hydrates to null → the "Boutique"
--       column in Mes Commandes shows "—" for every row.
--     • The Team page "Actions du jour" column is empty because
--       last_action_at is never stamped (no column to write to).
--
-- Run this once in production via Replit → Database → SQL runner. It is
-- idempotent (every statement uses IF NOT EXISTS) so it's safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. orders.magasin_id — links each order to the magasin (sub-store) it
--    belongs to. New orders coming in via webhook already set this from
--    integration.magasinId; existing rows are backfilled below.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- 2. orders action tracking — powers the Team page "Actions du jour" column.
--    Stamped only on human-driven status/comment mutations (NOT on order
--    creation or system auto-assign). See server/storage.ts updateOrder /
--    updateOrderStatus.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_action_at timestamp,
  ADD COLUMN IF NOT EXISTS last_action_by integer REFERENCES public.users(id);

-- 3. Indexes for the queries that hit these columns hardest:
--    - magasin_id: filter dropdowns + per-magasin agent stats
--    - (last_action_by, last_action_at): the Team-page daily count query
--    - (assigned_to_id, magasin_id, created_at) already exists from a
--      previous migration — it powers the percentage-based distribution
--      engine and is left untouched here.
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id
  ON public.orders (magasin_id);

CREATE INDEX IF NOT EXISTS idx_orders_last_action_by_at
  ON public.orders (last_action_by, last_action_at);

CREATE INDEX IF NOT EXISTS idx_orders_magasin_last_action_at
  ON public.orders (magasin_id, last_action_at);

-- 4. Backfill magasin_id on existing orders by joining through the
--    integration that produced them (Shopify webhook key, WooCommerce, etc).
--    This matches orders to the magasin whose integration's `provider`
--    equals the order's `source` field.
UPDATE public.orders o
SET magasin_id = si.magasin_id
FROM public.store_integrations si
WHERE o.store_id = si.store_id
  AND si.magasin_id IS NOT NULL
  AND o.magasin_id IS NULL
  AND o.source = si.provider;

-- 5. Fallback backfill: for accounts that have only one magasin under the
--    owner, attribute every remaining unattributed order to it. This avoids
--    the "—" placeholder in the Boutique column for legacy single-magasin
--    accounts. Multi-magasin accounts are unaffected (their unmatched
--    orders stay null and continue to display "—" until manually assigned).
UPDATE public.orders o
SET magasin_id = (
  SELECT s.id FROM public.stores s
  WHERE s.owner_id IN (
    SELECT id FROM public.users
    WHERE store_id = o.store_id AND role = 'owner'
  )
  LIMIT 1
)
WHERE o.magasin_id IS NULL;

-- 6. Action-tracking backfill: stamp last_action_at / last_action_by on
--    historical orders that were already actioned (status moved past
--    'nouveau') so the Team page "Actions du jour" view shows their last
--    touch date instead of being empty for old data.
UPDATE public.orders
SET last_action_at = updated_at,
    last_action_by = assigned_to_id
WHERE status <> 'nouveau'
  AND last_action_at IS NULL
  AND assigned_to_id IS NOT NULL;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- Verification queries — run these after the COMMIT above.
-- All three should return rows:
-- ──────────────────────────────────────────────────────────────────────────
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='orders' AND column_name='magasin_id';
-- -- expected: 1 row
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='orders'
--   AND column_name IN ('last_action_at','last_action_by');
-- -- expected: 2 rows
--
-- SELECT id, order_number, magasin_id FROM public.orders
-- ORDER BY id DESC LIMIT 10;
-- -- expected: recent orders should have magasin_id populated

-- ============================================================================
-- 0004_stock_movements
-- Ledger of every stock change. The "Reçu" column on the inventory page is
-- computed from this ledger (sum of all 'restock' rows) instead of being
-- inferred from current_stock + delivered_count, so manual restocks no longer
-- corrupt lifetime totals.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id           serial PRIMARY KEY,
  store_id     integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id   integer NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id   integer,
  type         text    NOT NULL CHECK (type IN (
                  'restock',         -- manual + initial stock add
                  'delivered',       -- order status -> delivered (auto)
                  'returned',        -- carrier returned (auto)
                  'adjustment',      -- manual correction (positive or negative)
                  'reservation',     -- order confirmed, stock allocated
                  'release'          -- order cancelled, stock freed
                )),
  quantity     integer NOT NULL,    -- positive = stock in, negative = stock out
  reason       text,                -- free-text note ("Inventory recount", "Damaged", etc.)
  order_id     integer REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id      integer REFERENCES public.users(id),
  created_at   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store
  ON public.stock_movements (store_id, created_at DESC);

-- Backfill the ledger from existing data
-- One 'restock' row per product representing the initial stock that was
-- entered before this ledger existed. Quantity = current_stock + delivered_count
-- so the new "Reçu" calculation matches the old behavior on day 1.
INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reason, created_at)
SELECT
  p.store_id,
  p.id,
  'restock',
  GREATEST(
    p.stock + COALESCE((
      SELECT SUM(oi.quantity)
      FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.product_id = p.id AND o.status = 'delivered'
    ), 0),
    p.stock
  ),
  'Initial backfill - pre-ledger inventory',
  COALESCE(p.created_at, now())
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_movements sm
  WHERE sm.product_id = p.id AND sm.type = 'restock'
);

-- Backfill historical 'delivered' rows from existing delivered orders so the
-- "Sortie" value the modal shows from the ledger matches reality on day 1.
INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reason, order_id, created_at)
SELECT
  o.store_id,
  oi.product_id,
  'delivered',
  -oi.quantity,
  'Backfill - delivered before ledger',
  o.id,
  COALESCE(o.updated_at, o.created_at, now())
FROM public.order_items oi
INNER JOIN public.orders o ON o.id = oi.order_id
WHERE o.status = 'delivered'
  AND oi.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = o.id AND sm.product_id = oi.product_id AND sm.type = 'delivered'
  );

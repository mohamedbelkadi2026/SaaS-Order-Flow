-- Root-cause fix: duplicate SKUs within a store (e.g. "0013" shared by two
-- products) make SKU-first matching in webhooks pick the wrong product,
-- bypassing resolveProductId() entirely.
--
-- Step 1: dedupe — keep the SKU on the OLDEST product (lowest id, i.e. the one
-- that originally owned it); newer duplicates get a unique "<sku>-<id>" suffix.
UPDATE products p
SET sku = p.sku || '-' || p.id
WHERE p.sku IS NOT NULL AND p.sku != ''
  AND EXISTS (
    SELECT 1 FROM products q
    WHERE q.store_id = p.store_id AND q.sku = p.sku AND q.id < p.id
  );

-- Step 2: make it impossible to reintroduce duplicates (per store; empty/NULL
-- SKUs stay allowed and unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_store_sku
  ON products (store_id, sku)
  WHERE sku IS NOT NULL AND sku != '';

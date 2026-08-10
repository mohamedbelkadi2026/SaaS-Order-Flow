-- Root-cause fix: duplicate SKUs within a store (e.g. "0013" shared by two
-- products) make SKU-first matching in webhooks pick the wrong product,
-- bypassing resolveProductId() entirely.
--
-- Step 1: dedupe — keep the SKU on the OLDEST product (lowest id, i.e. the one
-- that originally owned it). Newer duplicates get a "<sku>-dup<id>" suffix;
-- the loop guarantees the new value itself never collides with an existing SKU
-- in the same store (collision-safe even on pathological data).
DO $$
DECLARE
  r RECORD;
  new_sku TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT p.id, p.store_id, p.sku
    FROM products p
    WHERE p.sku IS NOT NULL AND p.sku != ''
      AND EXISTS (
        SELECT 1 FROM products q
        WHERE q.store_id = p.store_id AND q.sku = p.sku AND q.id < p.id
      )
    ORDER BY p.id
  LOOP
    new_sku := r.sku || '-dup' || r.id;
    n := 0;
    WHILE EXISTS (SELECT 1 FROM products q WHERE q.store_id = r.store_id AND q.sku = new_sku) LOOP
      n := n + 1;
      new_sku := r.sku || '-dup' || r.id || '-' || n;
    END LOOP;
    UPDATE products SET sku = new_sku WHERE id = r.id;
    RAISE NOTICE 'products dedupe: id=% store=% sku % -> %', r.id, r.store_id, r.sku, new_sku;
  END LOOP;
END $$;

-- Step 2: make it impossible to reintroduce duplicates (per store; empty/NULL
-- SKUs stay allowed and unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_store_sku
  ON products (store_id, sku)
  WHERE sku IS NOT NULL AND sku != '';

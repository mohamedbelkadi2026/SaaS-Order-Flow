-- TajerDrop Phase 2 — marketplace product enrichment
-- Adds per-product category, custom delivery/packaging fees, and active flag

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS marketplace_category      TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_delivery_fee  INTEGER,   -- centimes; NULL → use platform default 3500
  ADD COLUMN IF NOT EXISTS marketplace_packaging_fee INTEGER,   -- centimes; NULL → use platform default 600
  ADD COLUMN IF NOT EXISTS marketplace_active        BOOLEAN NOT NULL DEFAULT TRUE;

-- Back-fill: existing marketplace products are active by default
-- Guard: only run if is_marketplace_product column already exists (it may be
-- added later by initializeDatabase in server/db.ts on first boot).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_marketplace_product'
  ) THEN
    UPDATE products SET marketplace_active = TRUE WHERE is_marketplace_product = TRUE;
  END IF;
END $$;

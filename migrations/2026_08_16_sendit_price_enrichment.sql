-- Sendit price enrichment
-- 1. Extend sendit_districts with pricing columns (from official Excel)
-- 2. Create global sendit_price_ref table (source of truth for pricing, no store_id)

ALTER TABLE sendit_districts
  ADD COLUMN IF NOT EXISTS price       INTEGER,   -- centimes (DH × 100)
  ADD COLUMN IF NOT EXISTS delais      TEXT,      -- e.g. "24h - 48h"
  ADD COLUMN IF NOT EXISTS refus_fee   INTEGER,   -- centimes
  ADD COLUMN IF NOT EXISTS cancel_fee  INTEGER;   -- centimes

-- Global reference table seeded from the official Sendit Excel file.
-- No store_id — this is a shared lookup used to enrich sendit_districts rows
-- after each API sync (syncSenditDistricts).
CREATE TABLE IF NOT EXISTS sendit_price_ref (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  price       INTEGER,   -- centimes
  delais      TEXT,
  refus_fee   INTEGER,   -- centimes
  cancel_fee  INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sendit_price_ref_norm ON sendit_price_ref (name_norm);

-- TajerDrop Phase 2: controlled seller offer access and financial statements.

CREATE TABLE IF NOT EXISTS offer_requests (
  id SERIAL PRIMARY KEY,
  seller_store_id INTEGER NOT NULL REFERENCES stores(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'pending',
  cancel_reason TEXT,
  accepted_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Historical cancelled requests must remain possible for audit purposes. Active
-- request duplication is enforced by the application transaction instead.
DROP INDEX IF EXISTS offer_requests_seller_product_status_idx;
CREATE INDEX IF NOT EXISTS offer_requests_seller_product_status_idx
  ON offer_requests (seller_store_id, product_id, status);
CREATE INDEX IF NOT EXISTS offer_requests_seller_status_idx
  ON offer_requests (seller_store_id, status);
CREATE INDEX IF NOT EXISTS offer_requests_accepted_at_idx
  ON offer_requests (accepted_at)
  WHERE status = 'accepted';

CREATE TABLE IF NOT EXISTS seller_invoices (
  id SERIAL PRIMARY KEY,
  seller_store_id INTEGER NOT NULL REFERENCES stores(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  previous_invoice_id INTEGER,
  extra_items JSONB DEFAULT '[]'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal INTEGER NOT NULL DEFAULT 0,
  vat INTEGER NOT NULL DEFAULT 0,
  total_cash_collected INTEGER NOT NULL DEFAULT 0,
  total_net INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_invoices_store_period_unique
  ON seller_invoices (seller_store_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS seller_invoices_seller_created_at_idx
  ON seller_invoices (seller_store_id, created_at DESC);
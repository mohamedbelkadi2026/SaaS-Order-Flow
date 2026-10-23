-- Persist the scan position so old parcels are not starved by a newest-150 limit.
CREATE TABLE IF NOT EXISTS express_relais_sync_cursors (
  account_id integer PRIMARY KEY REFERENCES carrier_accounts(id) ON DELETE CASCADE,
  last_order_id integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bound status polling and rotate across old and new parcels fairly.
CREATE TABLE IF NOT EXISTS livcash_sync_cursors (
  account_id integer PRIMARY KEY REFERENCES carrier_accounts(id) ON DELETE CASCADE,
  last_order_id integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

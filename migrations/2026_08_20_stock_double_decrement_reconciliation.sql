CREATE TABLE IF NOT EXISTS stock_double_decrement_reconciliation_runs (
  id serial PRIMARY KEY,
  executed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  movements_deleted integer NOT NULL DEFAULT 0,
  quantity_deleted integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_double_decrement_reconciliation_backups (
  id serial PRIMARY KEY,
  reconciliation_run_id integer NOT NULL REFERENCES stock_double_decrement_reconciliation_runs(id) ON DELETE CASCADE,
  original_movement_id integer NOT NULL,
  store_id integer NOT NULL,
  product_id integer NOT NULL,
  variant_id integer,
  type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  order_id integer,
  user_id integer,
  original_created_at timestamp NOT NULL,
  backed_up_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_run_id, original_movement_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_double_decrement_reconciliation_backups_run
  ON stock_double_decrement_reconciliation_backups (reconciliation_run_id);
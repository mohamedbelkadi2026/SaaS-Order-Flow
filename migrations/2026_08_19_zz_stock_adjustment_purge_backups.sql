CREATE TABLE IF NOT EXISTS stock_adjustment_purge_runs (
  id serial PRIMARY KEY,
  executed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  movements_deleted integer NOT NULL DEFAULT 0,
  products_affected integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_adjustment_purge_backups (
  id serial PRIMARY KEY,
  purge_run_id integer NOT NULL REFERENCES stock_adjustment_purge_runs(id) ON DELETE CASCADE,
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
  UNIQUE (purge_run_id, original_movement_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_purge_backups_run
  ON stock_adjustment_purge_backups (purge_run_id);
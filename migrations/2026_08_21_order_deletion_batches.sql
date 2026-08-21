CREATE TABLE IF NOT EXISTS order_deletion_batches (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  deleted_by integer REFERENCES users(id) ON DELETE SET NULL,
  deleted_at timestamp NOT NULL DEFAULT now(),
  order_count integer NOT NULL,
  snapshot jsonb NOT NULL,
  restored_by integer REFERENCES users(id) ON DELETE SET NULL,
  restored_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_order_deletion_batches_store_latest
  ON order_deletion_batches (store_id, id);
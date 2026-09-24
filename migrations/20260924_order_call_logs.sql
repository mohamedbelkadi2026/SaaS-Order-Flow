CREATE TABLE IF NOT EXISTS order_call_logs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'tentative',
  note TEXT,
  called_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_call_logs_order_id_idx ON order_call_logs(order_id);
CREATE INDEX IF NOT EXISTS order_call_logs_store_id_idx ON order_call_logs(store_id);
CREATE INDEX IF NOT EXISTS order_call_logs_agent_id_idx ON order_call_logs(agent_id);
CREATE INDEX IF NOT EXISTS order_call_logs_called_at_idx ON order_call_logs(called_at);

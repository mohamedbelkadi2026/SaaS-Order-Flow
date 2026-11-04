ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS order_change_state jsonb;
CREATE TABLE IF NOT EXISTS ai_order_change_audit (
 id serial PRIMARY KEY,
 store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 order_id integer REFERENCES orders(id) ON DELETE SET NULL,
 conversation_id integer REFERENCES ai_conversations(id) ON DELETE SET NULL,
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_order_change_audit_order ON ai_order_change_audit(store_id,order_id);

-- Bound the recurring pending-confirmation lookup and duplicate checks.
CREATE INDEX IF NOT EXISTS idx_orders_ai_pending
  ON orders (store_id, id) WHERE status = 'nouveau';
CREATE INDEX IF NOT EXISTS idx_ai_conversations_store_order
  ON ai_conversations (store_id, order_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_active_phone
  ON ai_conversations (store_id,
    (regexp_replace(regexp_replace(customer_phone, '[^0-9]', '', 'g'), '^0', '212')))
  WHERE status = 'active';

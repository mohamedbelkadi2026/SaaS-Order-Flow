-- Shopify order de-duplication + race-safe uniqueness.
--
-- Two concurrent Shopify webhook retries (e.g. orders/create + orders/paid) can
-- both pass the app-level getOrderByNumber guard before either insert lands,
-- producing duplicate orders. This migration removes any duplicates that already
-- exist and then enforces uniqueness at the database level so it cannot recur.
--
-- For each (store_id, order_number) group of source='shopify' orders we keep the
-- EARLIEST (lowest id) and delete the rest. Only source='shopify' rows are ever
-- touched — manual orders and other integrations are left untouched. Child rows
-- that lack ON DELETE CASCADE are cleared first (stock_movements already uses
-- ON DELETE SET NULL, so it needs no handling here).
--
-- NOTE: no BEGIN/COMMIT here — the migration runner wraps this file in its own
-- transaction. The temp table is dropped on commit.

CREATE TEMP TABLE _shopify_dupe_ids ON COMMIT DROP AS
SELECT o.id
FROM orders o
WHERE o.source = 'shopify'
  AND o.id > (
    SELECT MIN(o2.id) FROM orders o2
    WHERE o2.store_id = o.store_id
      AND o2.source = 'shopify'
      AND o2.order_number = o.order_number
  );

DELETE FROM order_items          WHERE order_id IN (SELECT id FROM _shopify_dupe_ids);
DELETE FROM order_follow_up_logs WHERE order_id IN (SELECT id FROM _shopify_dupe_ids);
UPDATE stock_logs       SET order_id = NULL WHERE order_id IN (SELECT id FROM _shopify_dupe_ids);
UPDATE ai_conversations SET order_id = NULL WHERE order_id IN (SELECT id FROM _shopify_dupe_ids);
UPDATE ai_logs          SET order_id = NULL WHERE order_id IN (SELECT id FROM _shopify_dupe_ids);

DELETE FROM orders WHERE id IN (SELECT id FROM _shopify_dupe_ids);

CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_order_number_unique
  ON orders (store_id, order_number)
  WHERE source = 'shopify';

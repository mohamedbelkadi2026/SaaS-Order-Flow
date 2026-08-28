-- Completes a half-built feature: the ship-order flow (server/routes.ts,
-- see the "Ameex stock-managed fulfillment" comments around the bulk-ship
-- and single-order-ship handlers) already falls back to
-- it.product?.ameexProductId when an order has no per-order override, but
-- the products table never had this column — the fallback was always
-- undefined.
--
-- Ameex catalog product UUID, for merchants whose physical stock is held at
-- Ameex's own warehouse ("stock-managed" accounts). When set, every future
-- Ameex shipment for this product includes products[0][id] in the payload,
-- which Ameex uses to decrement their own warehouse stock automatically.

ALTER TABLE products ADD COLUMN IF NOT EXISTS ameex_product_id text;

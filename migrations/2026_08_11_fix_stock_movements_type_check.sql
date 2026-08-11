-- Bug: migrations/0004_stock_movements.sql created stock_movements_type_check
-- WITHOUT 'shipped', but the app inserts type='shipped' (decrementStockForOrder,
-- status transitions, boot-time backfill). Every 'shipped' movement insert has
-- been failing in production since the table was created — breaking product
-- history ("En cours"/expédié movements missing) and crashing part of
-- initializeDatabase() at each boot.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('restock', 'delivered', 'returned', 'adjustment', 'reservation', 'release', 'shipped'));

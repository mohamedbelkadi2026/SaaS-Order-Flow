-- Per-store return/refused stock restoration policy.
-- 'auto_on_retour_status' (default) — stock restores automatically the
--   moment an order's status becomes a "retour"-containing status (Retour
--   Recu, retourné, En Cours De Retour, etc.) — NOT just on 'refused'/
--   'Annulé' alone, since those don't guarantee the package has physically
--   started its way back to the warehouse.
-- 'manual_confirmation_only' — even reaching a "retour" status doesn't
--   restore stock automatically; requires an explicit confirmReturnReceipt()
--   call (a physical scan/confirmation button) for stores that want that
--   certainty before touching live stock.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS return_stock_policy text DEFAULT 'auto_on_retour_status';

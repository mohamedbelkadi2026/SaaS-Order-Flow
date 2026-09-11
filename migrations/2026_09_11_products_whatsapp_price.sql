-- Dedicated WhatsApp price (cents, same convention as products.selling_price)
-- — lets a merchant quote a specific price via WhatsApp AI (promo, adjusted
-- for confirmation-channel margin, etc.) separately from the normal selling
-- price. Falls back to selling_price when not set.

ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_price integer;

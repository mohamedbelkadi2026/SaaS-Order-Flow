-- Tracks the customer's confirmed delivery phone number — the WhatsApp
-- number they're messaging from may differ from the number the order
-- should actually be delivered/contacted on (e.g. ordering for someone
-- else). Now required alongside name/city/address before AI Confirmation
-- can confirm an order.

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS collected_phone text;

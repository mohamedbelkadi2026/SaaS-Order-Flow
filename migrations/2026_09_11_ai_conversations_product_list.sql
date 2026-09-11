-- Tracks the numbered product list last shown to a customer during a
-- WhatsApp conversation, so a bare-number reply (e.g. "2") can be resolved
-- to the right product — since a full catalog can't be sent as clickable
-- buttons (Green API limits interactive buttons to 3 per message).

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS last_shown_product_list jsonb;

-- Tracks the customer's street address once they actually state it during
-- the conversation, matching the existing collected_city/collected_name
-- pattern — address is now a required field before AI Confirmation can
-- confirm an order, alongside name and city.

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS collected_address text;

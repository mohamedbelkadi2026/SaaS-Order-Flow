-- Tracks the customer's full name once they actually state it during the
-- conversation (matching the existing collected_city pattern) — used to
-- stop the AI from inventing/guessing a name instead of asking for it.

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS collected_name text;

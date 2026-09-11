-- Tracks whether the Confirme/Annule interactive buttons were already sent
-- for this conversation, so they only get offered once — right when the
-- customer's name and city both become known — instead of every message.

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS confirm_buttons_sent integer DEFAULT 0;

-- Controls whether AI Confirmation handles orders from every source
-- (default) or only orders whose source='whatsapp' (the cold-lead pathway
-- in ai-agent.ts) — lets a merchant keep AI confined to the new
-- WhatsApp-first-contact flow without touching their existing confirmation
-- process for Sheet/Shopify/manual/import orders.

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS scope_mode text DEFAULT 'all_sources';

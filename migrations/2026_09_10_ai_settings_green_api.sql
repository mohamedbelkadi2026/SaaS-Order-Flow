-- Per-store Green API credentials — each merchant connects their own
-- WhatsApp number (own Instance ID + Token from green-api.com) instead of
-- sharing one global number across every store on the platform.

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS green_api_instance_id text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS green_api_api_token text;

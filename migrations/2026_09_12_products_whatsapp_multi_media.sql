-- Support multiple images/audio notes/videos per product for WhatsApp AI
-- content, instead of just one of each. Backfills the new array columns
-- from the existing single-URL fields so already-configured products keep
-- their content.

ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_image_urls jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_audio_urls jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_video_urls jsonb DEFAULT '[]';

UPDATE products
SET whatsapp_image_urls = jsonb_build_array(whatsapp_image_url)
WHERE whatsapp_image_url IS NOT NULL
  AND (whatsapp_image_urls IS NULL OR whatsapp_image_urls = '[]'::jsonb);

UPDATE products
SET whatsapp_audio_urls = jsonb_build_array(whatsapp_audio_url)
WHERE whatsapp_audio_url IS NOT NULL
  AND (whatsapp_audio_urls IS NULL OR whatsapp_audio_urls = '[]'::jsonb);

UPDATE products
SET whatsapp_video_urls = jsonb_build_array(whatsapp_video_url)
WHERE whatsapp_video_url IS NOT NULL
  AND (whatsapp_video_urls IS NULL OR whatsapp_video_urls = '[]'::jsonb);

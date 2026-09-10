-- Dedicated WhatsApp AI content per product — set from Automation & AI →
-- Produits WhatsApp, kept separate from imageUrl/descriptionDarija
-- (Modifier le produit) so the AI confirmation agent has a self-contained
-- set of assets without depending on the general product page fields.

ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_audio_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_video_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp_description text;

-- Fix existing WhatsApp content URLs that were saved as relative paths
-- (e.g. "/uploads/whatsapp-content/wa_img_....webp") before the upload
-- routes were fixed to return absolute URLs. Green API's sendFileByUrl
-- requires an absolute http(s):// URL — a relative path always fails with
-- "url has incorrect format. It should start with http(s)://".
--
-- Safe to run multiple times: only touches values that still start with
-- "/uploads/" (i.e. not already absolute).

UPDATE products
SET whatsapp_image_url = 'https://www.tajergrow.com' || whatsapp_image_url
WHERE whatsapp_image_url LIKE '/uploads/%';

UPDATE products
SET whatsapp_audio_url = 'https://www.tajergrow.com' || whatsapp_audio_url
WHERE whatsapp_audio_url LIKE '/uploads/%';

UPDATE products
SET whatsapp_video_url = 'https://www.tajergrow.com' || whatsapp_video_url
WHERE whatsapp_video_url LIKE '/uploads/%';

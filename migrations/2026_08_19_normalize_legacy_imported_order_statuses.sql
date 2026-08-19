-- Normalize legacy spreadsheet-import labels to the canonical order-status
-- codes used by filtered views and dashboard counters. Restrict the repair to
-- direct imports and exact labels: carrier statuses such as "Confirmé par
-- livreur" must remain untouched.

WITH legacy_imports AS (
  SELECT
    id,
    translate(
      lower(trim(status)),
      'àâäéèêëîïôöùûüç',
      'aaaeeeeiioouuuc'
    ) AS normalized_status
  FROM orders
  WHERE source = 'import'
)
UPDATE orders AS target
SET
  status = CASE legacy_imports.normalized_status
    WHEN 'confirme' THEN 'confirme'
    WHEN 'confirmed' THEN 'confirme'
    WHEN 'confirm' THEN 'confirme'
    WHEN 'nouveau' THEN 'nouveau'
    WHEN 'nouvelle' THEN 'nouveau'
    WHEN 'new' THEN 'nouveau'
    WHEN 'pending' THEN 'nouveau'
    WHEN 'en attente' THEN 'nouveau'
    WHEN 'annule' THEN 'Annulé (fake)'
    WHEN 'annulee' THEN 'Annulé (fake)'
    WHEN 'cancel' THEN 'Annulé (fake)'
    WHEN 'cancelled' THEN 'Annulé (fake)'
    WHEN 'canceled' THEN 'Annulé (fake)'
  END,
  updated_at = NOW()
FROM legacy_imports
WHERE target.id = legacy_imports.id
  AND legacy_imports.normalized_status IN (
    'confirme', 'confirmed', 'confirm',
    'nouveau', 'nouvelle', 'new', 'pending', 'en attente',
    'annule', 'annulee', 'cancel', 'cancelled', 'canceled'
  );
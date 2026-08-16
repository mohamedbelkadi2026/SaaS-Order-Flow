-- Sendit districts (villes de livraison) — per-store cache
-- Populated by POST /api/shipping/sendit/sync-districts
-- Structure mirrors ameex_cities / vitips_cities / ozon_express_cities

CREATE TABLE IF NOT EXISTS sendit_districts (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL,
  external_id  TEXT    NOT NULL,          -- district_id from Sendit API
  name         TEXT    NOT NULL,          -- display name (e.g. "Casablanca")
  name_norm    TEXT    NOT NULL,          -- lowercase + accent-stripped, for fuzzy match
  hub          TEXT,                      -- hub/region if provided
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sendit_districts_store   ON sendit_districts (store_id);
CREATE INDEX IF NOT EXISTS idx_sendit_districts_norm    ON sendit_districts (store_id, name_norm);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sendit_districts_uniq ON sendit_districts (store_id, external_id);

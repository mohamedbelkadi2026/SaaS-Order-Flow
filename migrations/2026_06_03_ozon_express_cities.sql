-- Ozon Express requires numeric city IDs in its add-parcel payload (the
-- 'parcel-city' field). carrier_cities only stores a JSONB array of name
-- strings, so Ozon needs its own id->name mapping table (mirrors ameex_cities
-- and express_coursier_cities). Populated by "Synchroniser les villes" on the
-- Ozon Express carrier account.
CREATE TABLE IF NOT EXISTS ozon_express_cities (
  id          serial PRIMARY KEY,
  store_id    integer NOT NULL,
  external_id text    NOT NULL,
  name        text    NOT NULL,
  name_norm   text    NOT NULL,
  created_at  timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ozon_express_cities_store_id_external_id_key
  ON ozon_express_cities (store_id, external_id);
CREATE INDEX IF NOT EXISTS idx_ozon_cities_store     ON ozon_express_cities (store_id);
CREATE INDEX IF NOT EXISTS idx_ozon_cities_name_norm ON ozon_express_cities (store_id, name_norm);

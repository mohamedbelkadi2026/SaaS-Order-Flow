-- Express Coursier requires numeric city IDs in its shipment payload (it rejects
-- city names with "Ville invalide"). carrier_cities only stores a JSONB array of
-- name strings, so EC needs its own id->name mapping table (mirrors ameex_cities).
-- Populated by "Synchroniser les villes" on the EC carrier account.
CREATE TABLE IF NOT EXISTS express_coursier_cities (
  id          serial PRIMARY KEY,
  store_id    integer NOT NULL,
  external_id text    NOT NULL,
  name        text    NOT NULL,
  name_norm   text    NOT NULL,
  created_at  timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS express_coursier_cities_store_id_external_id_key
  ON express_coursier_cities (store_id, external_id);
CREATE INDEX IF NOT EXISTS idx_ec_cities_store     ON express_coursier_cities (store_id);
CREATE INDEX IF NOT EXISTS idx_ec_cities_name_norm ON express_coursier_cities (store_id, name_norm);

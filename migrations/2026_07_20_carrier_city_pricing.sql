-- Per-city delivery pricing table
-- Used for carriers that don't expose a per-city cost via API
-- (Express Coursier has no such endpoint — unlike Digylog's getDigylogDeliveryCost).
-- One row per store+carrier+city. priceDh stored in CENTIMES (×100).

CREATE TABLE IF NOT EXISTS carrier_city_pricing (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL,
  carrier_name TEXT    NOT NULL,
  city_name    TEXT    NOT NULL,
  city_norm    TEXT    NOT NULL,
  price_dh     INTEGER NOT NULL,
  source       TEXT    DEFAULT 'manual',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_city_pricing_unique
  ON carrier_city_pricing (store_id, carrier_name, city_norm);

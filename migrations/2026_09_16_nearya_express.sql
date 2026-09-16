-- Nearya Express carrier support.
-- Region ids are opaque strings (Mongo-style), unlike the integer city ids used
-- by the other carriers, so both columns are text.

CREATE TABLE IF NOT EXISTS nearya_regions (
  id            SERIAL PRIMARY KEY,
  external_id   TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  name_norm     TEXT    NOT NULL,
  delivery_fee  INTEGER NOT NULL DEFAULT 0,
  refusal_fee   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nearya_regions_name_norm_idx ON nearya_regions (name_norm);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS nearya_region_id TEXT;

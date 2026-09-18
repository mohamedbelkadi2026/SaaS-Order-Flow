-- Meta Ads daily spend, one row per campaign per day.
-- Amounts stay in the ad account's own currency; converting on import would
-- bake a single day's rate into historical rows.
CREATE TABLE IF NOT EXISTS meta_ad_spend (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL,
  date          TEXT    NOT NULL,          -- YYYY-MM-DD, ad account timezone
  campaign_id   TEXT    NOT NULL,
  campaign_name TEXT    NOT NULL DEFAULT '',
  amount        INTEGER NOT NULL DEFAULT 0, -- minor units of `currency`
  currency      TEXT    NOT NULL DEFAULT '',
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  synced_at     TIMESTAMP DEFAULT NOW(),
  -- Meta restates figures for up to 72h, so imports overwrite rather than add.
  CONSTRAINT meta_ad_spend_unique UNIQUE (store_id, date, campaign_id)
);

CREATE INDEX IF NOT EXISTS meta_ad_spend_store_date_idx ON meta_ad_spend (store_id, date);

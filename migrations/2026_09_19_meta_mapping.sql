-- Campaign → product mapping keyed on the Meta campaign id.
-- The table already matched on campaign_name, but merchants rename campaigns
-- and the id never changes, so the link survives a rename.
ALTER TABLE ad_campaign_product_map
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'meta';

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaign_map_unique
  ON ad_campaign_product_map (store_id, source, campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Merchants settle their USD ad spend at a rate they choose (9.6, 10, …),
-- so the rate is theirs to set rather than fetched.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS usd_to_mad_rate INTEGER NOT NULL DEFAULT 1000;
COMMENT ON COLUMN stores.usd_to_mad_rate IS 'USD→MAD rate x100 (1000 = 10.00)';

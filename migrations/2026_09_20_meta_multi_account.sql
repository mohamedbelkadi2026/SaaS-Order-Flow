-- Several ad accounts under one Business Manager: spend rows now record which
-- account they came from, and the uniqueness key includes it. Without that,
-- two accounts running a campaign on the same day would overwrite each other.
ALTER TABLE meta_ad_spend
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT NOT NULL DEFAULT '';

ALTER TABLE meta_ad_spend DROP CONSTRAINT IF EXISTS meta_ad_spend_unique;

CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_spend_unique_v2
  ON meta_ad_spend (store_id, ad_account_id, date, campaign_id);

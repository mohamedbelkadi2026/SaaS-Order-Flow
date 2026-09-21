-- Adding ad_account_id to the spend key left the rows imported before that
-- change with ad_account_id = '', while every import since writes the real
-- act_ id. The same campaign-day then existed twice: a campaign that ran 20
-- days reported 40, and its spend was counted double on every page.
--
-- Drop the blank-account row wherever a real-account row covers the same
-- store, day and campaign. Blank rows with no counterpart are left alone —
-- they are the only record of that day.
DELETE FROM meta_ad_spend a
USING meta_ad_spend b
WHERE a.ad_account_id = ''
  AND b.ad_account_id <> ''
  AND a.store_id    = b.store_id
  AND a.date        = b.date
  AND a.campaign_id = b.campaign_id;

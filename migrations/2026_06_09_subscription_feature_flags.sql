ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS automation_enabled integer,
  ADD COLUMN IF NOT EXISTS media_buyers_enabled integer;

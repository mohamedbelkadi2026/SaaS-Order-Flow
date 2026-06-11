-- Adds the import_csv_enabled feature-flag column to subscriptions
-- and creates the csv_profit_reports table for saved profit reports.
-- Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is fully idempotent.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS import_csv_enabled integer;

CREATE TABLE IF NOT EXISTS csv_profit_reports (
  id         serial      PRIMARY KEY,
  store_id   integer     NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    integer     REFERENCES users(id),
  month      text        NOT NULL,
  title      text,
  payload    jsonb       NOT NULL,
  created_at timestamp   NOT NULL DEFAULT now(),
  updated_at timestamp   NOT NULL DEFAULT now()
);

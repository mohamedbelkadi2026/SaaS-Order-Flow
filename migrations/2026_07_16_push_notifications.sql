-- Web push notifications: users.notif_settings column + push_subscriptions table
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS on column)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notif_settings JSONB;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id   INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
  ON public.push_subscriptions (endpoint);

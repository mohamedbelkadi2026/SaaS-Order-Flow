-- ============================================================================
-- 0001_complete_schema_catchup
-- Adds all columns the TypeScript schema declares but production DB lacks.
-- Idempotent — safe to re-run.
-- ============================================================================

-- STORES — per-magasin distribution config + multi-magasin metadata
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_method     text      DEFAULT 'auto';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS distribution_epoch      timestamp DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS agent_ids               jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS services                jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_carriers         jsonb     DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS linked_platforms        jsonb     DEFAULT '[]'::jsonb;

-- ORDERS — magasin scope, action tracking, carrier+driver fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS magasin_id     integer    REFERENCES public.stores(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_at timestamp;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_action_by integer    REFERENCES public.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_id     integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_name   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_name    text       DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_phone   text       DEFAULT '';

-- STORE_INTEGRATIONS — link integration to specific magasin
ALTER TABLE public.store_integrations ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- STORE_AGENT_SETTINGS — per-magasin overrides
ALTER TABLE public.store_agent_settings ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

ALTER TABLE public.store_agent_settings DROP CONSTRAINT IF EXISTS store_agent_settings_agent_id_store_id_key;
DROP INDEX IF EXISTS store_agent_settings_agent_store_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_magasin_uniq;
DROP INDEX IF EXISTS store_agent_settings_agent_store_magasin_uniq;
CREATE UNIQUE INDEX store_agent_settings_agent_store_magasin_uniq
  ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));

-- AD_SPEND — per-magasin ad tracking
ALTER TABLE public.ad_spend          ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);
ALTER TABLE public.ad_spend_tracking ADD COLUMN IF NOT EXISTS magasin_id integer REFERENCES public.stores(id);

-- INDEXES for query performance
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id        ON public.orders (magasin_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin  ON public.orders (assigned_to_id, magasin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_action       ON public.orders (last_action_by, last_action_at);
CREATE INDEX IF NOT EXISTS idx_orders_track_provider    ON public.orders (shipping_provider, track_number);
CREATE INDEX IF NOT EXISTS idx_store_integrations_mag   ON public.store_integrations (magasin_id);
CREATE INDEX IF NOT EXISTS idx_store_agent_magasin      ON public.store_agent_settings (magasin_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_magasin         ON public.ad_spend (magasin_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_track_magasin   ON public.ad_spend_tracking (magasin_id, date);

-- One-shot: flip every magasin to 'pourcentage' so the percentages in the UI take effect
-- (only on first apply; subsequent runs leave it alone since the column already exists)
UPDATE public.stores SET distribution_method = 'pourcentage' WHERE distribution_method = 'auto';
UPDATE public.stores SET distribution_epoch  = now()         WHERE distribution_epoch IS NULL;

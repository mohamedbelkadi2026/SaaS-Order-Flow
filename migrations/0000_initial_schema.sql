-- ============================================================================
-- 0000_initial_schema.sql
-- Creates all core tables from scratch on a fresh database.
-- Idempotent — uses CREATE TABLE IF NOT EXISTS throughout.
-- ============================================================================

-- ── Migration state tracker ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._migration_state (
  key        TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions (connect-pg-simple) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON public.sessions (expire);

-- ── Stores (magasins) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stores (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  owner_id                INTEGER,
  last_assigned_agent_id  INTEGER,
  phone                   TEXT,
  website                 TEXT,
  facebook                TEXT,
  instagram               TEXT,
  other_social            TEXT,
  logo_url                TEXT,
  cover_image_url         TEXT,
  can_open                INTEGER DEFAULT 1,
  is_stock                INTEGER DEFAULT 0,
  is_ramassage            INTEGER DEFAULT 0,
  whatsapp_template       TEXT,
  whatsapp_template_custom TEXT,
  whatsapp_template_shipping TEXT,
  whatsapp_default_enabled INTEGER DEFAULT 1,
  whatsapp_custom_enabled  INTEGER DEFAULT 0,
  whatsapp_shipping_enabled INTEGER DEFAULT 0,
  webhook_key             TEXT,
  packaging_cost          INTEGER DEFAULT 0,
  agent_ids               JSONB DEFAULT '[]'::JSONB,
  services                JSONB DEFAULT '[]'::JSONB,
  linked_carriers         JSONB DEFAULT '[]'::JSONB,
  linked_platforms        JSONB DEFAULT '[]'::JSONB,
  distribution_method     TEXT DEFAULT 'auto',
  distribution_epoch      TIMESTAMP DEFAULT NOW(),
  created_at              TIMESTAMP DEFAULT NOW()
);

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                    SERIAL PRIMARY KEY,
  username              TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  password              TEXT NOT NULL,
  role                  TEXT NOT NULL,
  store_id              INTEGER REFERENCES public.stores(id),
  payment_type          TEXT DEFAULT 'commission',
  payment_amount        INTEGER DEFAULT 0,
  distribution_method   TEXT DEFAULT 'auto',
  is_super_admin        INTEGER DEFAULT 0,
  is_active             INTEGER DEFAULT 1,
  is_email_verified     INTEGER DEFAULT 0,
  preferred_language    TEXT DEFAULT 'fr',
  dashboard_permissions JSONB,
  buyer_code            TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Add FK from stores.owner_id → users.id (deferred to avoid circular dep)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS owner_id_fk_placeholder TEXT; -- placeholder to avoid error if column already exists

ALTER TABLE public.stores DROP COLUMN IF EXISTS owner_id_fk_placeholder;

-- ── Email Verification Codes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES public.users(id),
  code       TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES public.stores(id),
  name                TEXT NOT NULL,
  sku                 TEXT NOT NULL,
  stock               INTEGER NOT NULL DEFAULT 0,
  cost_price          INTEGER NOT NULL DEFAULT 0,
  selling_price       INTEGER NOT NULL DEFAULT 0,
  description         TEXT,
  description_darija  TEXT,
  ai_features         TEXT,
  image_url           TEXT,
  reference           TEXT,
  has_variants        INTEGER DEFAULT 0,
  settings            JSONB,
  created_at          TIMESTAMP DEFAULT NOW(),
  archived_at         TIMESTAMP
);

-- ── Product Variants ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_variants (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES public.products(id),
  store_id      INTEGER NOT NULL REFERENCES public.stores(id),
  name          TEXT NOT NULL,
  sku           TEXT NOT NULL,
  cost_price    INTEGER NOT NULL DEFAULT 0,
  selling_price INTEGER NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  image_url     TEXT
);

-- ── Orders ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL REFERENCES public.stores(id),
  magasin_id              INTEGER REFERENCES public.stores(id),
  order_number            TEXT NOT NULL,
  customer_name           TEXT NOT NULL,
  customer_phone          TEXT NOT NULL,
  customer_address        TEXT,
  customer_city           TEXT,
  status                  TEXT NOT NULL DEFAULT 'nouveau',
  total_price             INTEGER NOT NULL DEFAULT 0,
  product_cost            INTEGER NOT NULL DEFAULT 0,
  shipping_cost           INTEGER NOT NULL DEFAULT 0,
  ad_spend                INTEGER NOT NULL DEFAULT 0,
  assigned_to_id          INTEGER REFERENCES public.users(id),
  comment                 TEXT,
  track_number            TEXT,
  label_link              TEXT,
  shipping_provider       TEXT,
  replacement_track_number TEXT,
  is_stock                INTEGER DEFAULT 0,
  up_sell                 INTEGER DEFAULT 0,
  can_open                INTEGER DEFAULT 1,
  replace                 INTEGER DEFAULT 0,
  source                  TEXT DEFAULT 'manual',
  utm_source              TEXT,
  utm_campaign            TEXT,
  traffic_platform        TEXT,
  media_buyer_id          INTEGER REFERENCES public.users(id),
  raw_product_name        TEXT,
  variant_details         TEXT,
  raw_quantity            INTEGER,
  comment_status          TEXT,
  comment_order           TEXT,
  return_tracking_number  TEXT,
  was_abandoned           INTEGER DEFAULT 0,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW(),
  last_action_at          TIMESTAMP,
  last_action_by          INTEGER REFERENCES public.users(id),
  scheduled_for           DATE,
  pickup_date             TIMESTAMP,
  carrier_id              INTEGER,
  carrier_name            TEXT,
  driver_name             TEXT DEFAULT '',
  driver_phone            TEXT DEFAULT '',
  offer_name              TEXT,
  ameex_product_id        TEXT
);

-- ── Order Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES public.orders(id),
  product_id       INTEGER REFERENCES public.products(id),
  quantity         INTEGER NOT NULL DEFAULT 1,
  price            INTEGER NOT NULL DEFAULT 0,
  raw_product_name TEXT,
  variant_info     TEXT,
  sku              TEXT
);

-- ── Ad Spend Tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_spend_tracking (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES public.stores(id),
  magasin_id    INTEGER REFERENCES public.stores(id),
  media_buyer_id INTEGER REFERENCES public.users(id),
  product_id    INTEGER REFERENCES public.products(id),
  date          TEXT NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,
  source        TEXT,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── Ad Spend ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_spend (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES public.stores(id),
  magasin_id            INTEGER REFERENCES public.stores(id),
  user_id               INTEGER REFERENCES public.users(id),
  product_id            INTEGER REFERENCES public.products(id),
  source                TEXT NOT NULL,
  date                  TEXT NOT NULL,
  amount                INTEGER NOT NULL DEFAULT 0,
  product_selling_price INTEGER,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- ── Carrier Accounts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carrier_accounts (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES public.stores(id),
  carrier_name        TEXT NOT NULL DEFAULT '',
  connection_name     TEXT NOT NULL DEFAULT 'Connection 1',
  api_key             TEXT NOT NULL DEFAULT '',
  api_secret          TEXT,
  api_url             TEXT,
  webhook_token       TEXT NOT NULL DEFAULT '',
  store_name          TEXT,
  carrier_store_name  TEXT,
  is_default          INTEGER DEFAULT 0,
  is_active           INTEGER DEFAULT 1,
  assignment_rule     TEXT DEFAULT 'default',
  assignment_data     TEXT,
  settings            JSONB DEFAULT '{}'::JSONB,
  magasin_id          INTEGER,
  delivery_fee        INTEGER DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ── Carrier Cities ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carrier_cities (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL,
  carrier_name TEXT NOT NULL,
  account_id   INTEGER,
  cities       JSONB NOT NULL DEFAULT '[]'::JSONB,
  city_count   INTEGER DEFAULT 0,
  synced_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, carrier_name)
);

-- ── Ameex Cities ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ameex_cities (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ameex_cities_store_norm ON public.ameex_cities (store_id, name_norm);

-- ── Express Coursier Cities ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.express_coursier_cities (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_express_coursier_cities_store_norm ON public.express_coursier_cities (store_id, name_norm);

-- ── Ozon Express Cities ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ozon_express_cities (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ozon_express_cities_store_norm ON public.ozon_express_cities (store_id, name_norm);

-- ── Store Integrations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_integrations (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES public.stores(id),
  provider              TEXT NOT NULL,
  type                  TEXT NOT NULL,
  credentials           TEXT NOT NULL DEFAULT '{}',
  is_active             INTEGER DEFAULT 1,
  webhook_key           TEXT,
  connection_name       TEXT,
  orders_count          INTEGER DEFAULT 0,
  magasin_id            INTEGER REFERENCES public.stores(id),
  created_at            TIMESTAMP DEFAULT NOW(),
  oauth_access_token    TEXT,
  oauth_refresh_token   TEXT,
  oauth_expires_at      TIMESTAMP,
  spreadsheet_id        TEXT,
  spreadsheet_name      TEXT,
  sync_tabs             TEXT,
  last_sync_state       JSONB,
  last_sync_at          TIMESTAMP,
  gsheet_url            TEXT,
  gsheet_id             TEXT,
  gsheet_tabs           JSONB,
  gsheet_sync_state     JSONB DEFAULT '{}'::JSONB,
  gsheet_column_mapping JSONB DEFAULT NULL,
  gsheet_webhook_url    TEXT,
  status                TEXT DEFAULT 'active'
);

-- ── Integration Logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES public.stores(id),
  integration_id INTEGER REFERENCES public.store_integrations(id),
  provider       TEXT NOT NULL,
  action         TEXT NOT NULL,
  status         TEXT NOT NULL,
  message        TEXT,
  payload        TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── Subscriptions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES public.stores(id),
  plan                  TEXT NOT NULL DEFAULT 'trial',
  monthly_limit         INTEGER NOT NULL DEFAULT 60,
  price_per_month       INTEGER NOT NULL DEFAULT 0,
  current_month_orders  INTEGER NOT NULL DEFAULT 0,
  billing_cycle_start   TIMESTAMP DEFAULT NOW(),
  plan_start_date       TIMESTAMP,
  plan_expiry_date      TIMESTAMP,
  is_active             INTEGER DEFAULT 1,
  is_blocked            INTEGER DEFAULT 0,
  automation_enabled    INTEGER,
  media_buyers_enabled  INTEGER,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- ── Customers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES public.stores(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  address     TEXT,
  city        TEXT,
  email       TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Agent Products ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_products (
  id         SERIAL PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES public.users(id),
  product_id INTEGER NOT NULL REFERENCES public.products(id),
  store_id   INTEGER NOT NULL REFERENCES public.stores(id)
);

-- ── Store Agent Settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_agent_settings (
  id                  SERIAL PRIMARY KEY,
  agent_id            INTEGER NOT NULL REFERENCES public.users(id),
  store_id            INTEGER NOT NULL REFERENCES public.stores(id),
  magasin_id          INTEGER REFERENCES public.stores(id),
  role_in_store       TEXT NOT NULL DEFAULT 'confirmation',
  lead_percentage     INTEGER NOT NULL DEFAULT 100,
  allowed_product_ids TEXT NOT NULL DEFAULT '[]',
  allowed_regions     TEXT NOT NULL DEFAULT '[]',
  commission_rate     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_agent_settings_agent_store_magasin_uniq
  ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));

-- ── Order Follow-Up Logs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_follow_up_logs (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES public.orders(id),
  agent_id   INTEGER REFERENCES public.users(id),
  agent_name TEXT,
  note       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Payments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES public.stores(id),
  plan        TEXT NOT NULL,
  amount_dh   INTEGER NOT NULL,
  amount_usd  INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'dh',
  method      TEXT NOT NULL,
  receipt_url TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  notes       TEXT,
  owner_name  TEXT,
  owner_email TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Stock Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_logs (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES public.stores(id),
  product_id    INTEGER NOT NULL REFERENCES public.products(id),
  order_id      INTEGER REFERENCES public.orders(id),
  change_amount INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Stock Movements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id INTEGER,
  type       TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  reason     TEXT,
  order_id   INTEGER REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id    INTEGER REFERENCES public.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── AI Conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL REFERENCES public.stores(id),
  order_id             INTEGER REFERENCES public.orders(id),
  customer_phone       TEXT NOT NULL,
  customer_name        TEXT,
  status               TEXT DEFAULT 'active',
  is_manual            INTEGER DEFAULT 0,
  needs_attention      INTEGER DEFAULT 0,
  conversation_step    INTEGER DEFAULT 1,
  collected_city       TEXT,
  collected_variant    TEXT,
  last_message         TEXT,
  last_message_at      TIMESTAMP DEFAULT NOW(),
  created_at           TIMESTAMP DEFAULT NOW(),
  is_new_lead          INTEGER DEFAULT 0,
  lead_stage           TEXT,
  lead_name            TEXT,
  lead_city            TEXT,
  lead_address         TEXT,
  lead_product_id      INTEGER,
  lead_product_name    TEXT,
  lead_price           INTEGER,
  lead_quantity        INTEGER DEFAULT 1,
  created_order_id     INTEGER,
  whatsapp_jid         TEXT,
  confirmed_at         TIMESTAMP
);

-- ── Marketing Campaigns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES public.stores(id),
  name             TEXT NOT NULL,
  message          TEXT NOT NULL,
  product_link     TEXT,
  target_filter    TEXT DEFAULT 'delivered',
  status           TEXT DEFAULT 'draft',
  total_targets    INTEGER DEFAULT 0,
  total_sent       INTEGER DEFAULT 0,
  total_failed     INTEGER DEFAULT 0,
  sender_device_id INTEGER,
  rotation_enabled INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ── Retargeting Leads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retargeting_leads (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES public.stores(id),
  name         TEXT,
  phone        TEXT NOT NULL,
  last_product TEXT,
  source       TEXT DEFAULT 'import',
  imported_at  TIMESTAMP DEFAULT NOW()
);

-- ── WhatsApp Devices ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_devices (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL REFERENCES public.stores(id),
  label      TEXT NOT NULL DEFAULT 'WhatsApp',
  status     TEXT DEFAULT 'disconnected',
  phone      TEXT,
  qr_code    TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── Campaign Logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES public.marketing_campaigns(id),
  device_id   INTEGER,
  phone       TEXT NOT NULL,
  status      TEXT NOT NULL,
  sent_at     TIMESTAMP DEFAULT NOW()
);

-- ── AI Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_logs (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES public.stores(id),
  order_id       INTEGER REFERENCES public.orders(id),
  conv_id        INTEGER,
  customer_phone TEXT,
  role           TEXT NOT NULL,
  message        TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── WhatsApp Sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id         SERIAL PRIMARY KEY,
  store_id   INTEGER NOT NULL UNIQUE REFERENCES public.stores(id),
  status     TEXT DEFAULT 'disconnected',
  phone      TEXT,
  qr_code    TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── AI Settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL UNIQUE REFERENCES public.stores(id),
  enabled              INTEGER DEFAULT 0,
  system_prompt        TEXT,
  enabled_product_ids  JSONB DEFAULT '[]'::JSONB,
  openai_api_key       TEXT,
  openrouter_api_key   TEXT,
  ai_model             TEXT DEFAULT 'openai/gpt-4o-mini',
  updated_at           TIMESTAMP DEFAULT NOW()
);

-- ── Landing Pages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES public.stores(id),
  slug              TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  price_dh          INTEGER NOT NULL DEFAULT 0,
  description       TEXT DEFAULT '',
  hero_image_url    TEXT DEFAULT '',
  features_image_url TEXT DEFAULT '',
  proof_image_url   TEXT DEFAULT '',
  copy              JSONB DEFAULT '{}'::JSONB,
  theme             TEXT DEFAULT 'navy',
  custom_color      TEXT DEFAULT '',
  is_active         INTEGER DEFAULT 1,
  order_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ── Recovery Settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recovery_settings (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL UNIQUE REFERENCES public.stores(id),
  enabled      INTEGER DEFAULT 0,
  wait_minutes INTEGER DEFAULT 30,
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ── Ad Campaign Product Map ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_campaign_product_map (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Performance Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_store_id              ON public.orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status                ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to_id        ON public.orders (assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at            ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_magasin_id            ON public.orders (magasin_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_magasin      ON public.orders (assigned_to_id, magasin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_action           ON public.orders (last_action_by, last_action_at);
CREATE INDEX IF NOT EXISTS idx_orders_track_provider        ON public.orders (shipping_provider, track_number);
CREATE INDEX IF NOT EXISTS idx_store_integrations_mag       ON public.store_integrations (magasin_id);
CREATE INDEX IF NOT EXISTS idx_store_agent_magasin          ON public.store_agent_settings (magasin_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_magasin             ON public.ad_spend (magasin_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_track_magasin       ON public.ad_spend_tracking (magasin_id, date);
CREATE INDEX IF NOT EXISTS idx_ameex_cities_store           ON public.ameex_cities (store_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_store       ON public.ai_conversations (store_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_phone       ON public.ai_conversations (customer_phone);
CREATE INDEX IF NOT EXISTS idx_integration_logs_store       ON public.integration_logs (store_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created     ON public.integration_logs (created_at);

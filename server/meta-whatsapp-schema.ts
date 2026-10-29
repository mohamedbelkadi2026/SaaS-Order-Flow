export const META_WHATSAPP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta_whatsapp_connections (
 store_id integer PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 waba_id text NOT NULL, phone_number_id text NOT NULL UNIQUE,
 display_phone text, token_cipher text NOT NULL, active boolean NOT NULL DEFAULT true,
 template_name text NOT NULL DEFAULT 'tajergrow_order_confirmation', template_language text NOT NULL DEFAULT 'ar',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta_whatsapp_consents (
 store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE, phone text NOT NULL,
 source text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,phone)
);
CREATE TABLE IF NOT EXISTS meta_whatsapp_windows (
 store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE, phone text NOT NULL,
 last_customer_message_at timestamptz NOT NULL, PRIMARY KEY(store_id,phone)
);
CREATE TABLE IF NOT EXISTS meta_whatsapp_messages (
 id bigserial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 phone text NOT NULL, message_id text UNIQUE, kind text NOT NULL, status text NOT NULL DEFAULT 'sending',
 error_code integer, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_whatsapp_messages_store_created ON meta_whatsapp_messages(store_id,created_at DESC);
CREATE TABLE IF NOT EXISTS meta_whatsapp_inbox (
 message_id text PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 phone text NOT NULL, body text NOT NULL, state text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta_whatsapp_content_queue (
 id bigserial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE, phone text NOT NULL,
 kind text NOT NULL, content text NOT NULL, dedupe_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta_whatsapp_status_events (
 id bigserial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 message_id text NOT NULL, status text NOT NULL, error_code integer, processed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(store_id,message_id,status)
);
CREATE INDEX IF NOT EXISTS meta_whatsapp_status_pending ON meta_whatsapp_status_events(processed,id);
CREATE INDEX IF NOT EXISTS meta_whatsapp_inbox_pending ON meta_whatsapp_inbox(state,created_at);
CREATE TABLE IF NOT EXISTS meta_whatsapp_signup_states (
 nonce text PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 user_id integer NOT NULL, expires_at timestamptz NOT NULL
);
`;

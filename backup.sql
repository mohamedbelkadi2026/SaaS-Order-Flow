--
-- PostgreSQL database dump
--

\restrict 9f0f6s1hB3ZCcQKfQTmdyzkLlzWaleM01pa9uOvxeafjgSuKPW3gje5RJqr9TJ6

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_spend; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad_spend (
    id integer NOT NULL,
    store_id integer NOT NULL,
    user_id integer,
    product_id integer,
    source text NOT NULL,
    date text NOT NULL,
    amount integer DEFAULT 0 NOT NULL,
    product_selling_price integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ad_spend OWNER TO postgres;

--
-- Name: ad_spend_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ad_spend_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ad_spend_id_seq OWNER TO postgres;

--
-- Name: ad_spend_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ad_spend_id_seq OWNED BY public.ad_spend.id;


--
-- Name: ad_spend_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad_spend_tracking (
    id integer NOT NULL,
    store_id integer NOT NULL,
    media_buyer_id integer,
    product_id integer,
    date text NOT NULL,
    amount integer DEFAULT 0 NOT NULL,
    source text,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ad_spend_tracking OWNER TO postgres;

--
-- Name: ad_spend_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ad_spend_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ad_spend_tracking_id_seq OWNER TO postgres;

--
-- Name: ad_spend_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ad_spend_tracking_id_seq OWNED BY public.ad_spend_tracking.id;


--
-- Name: agent_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_products (
    id integer NOT NULL,
    agent_id integer NOT NULL,
    product_id integer NOT NULL,
    store_id integer NOT NULL
);


ALTER TABLE public.agent_products OWNER TO postgres;

--
-- Name: agent_products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.agent_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agent_products_id_seq OWNER TO postgres;

--
-- Name: agent_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.agent_products_id_seq OWNED BY public.agent_products.id;


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_conversations (
    id integer NOT NULL,
    store_id integer NOT NULL,
    order_id integer,
    customer_phone text NOT NULL,
    customer_name text,
    status text DEFAULT 'active'::text,
    is_manual integer DEFAULT 0,
    needs_attention integer DEFAULT 0,
    conversation_step integer DEFAULT 1,
    collected_city text,
    collected_variant text,
    last_message text,
    last_message_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    is_new_lead integer DEFAULT 0,
    lead_stage text,
    lead_name text,
    lead_city text,
    lead_address text,
    lead_product_id integer,
    lead_product_name text,
    lead_price integer,
    created_order_id integer,
    lead_quantity integer DEFAULT 1,
    whatsapp_jid text,
    confirmed_at timestamp without time zone
);


ALTER TABLE public.ai_conversations OWNER TO postgres;

--
-- Name: ai_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_conversations_id_seq OWNER TO postgres;

--
-- Name: ai_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_conversations_id_seq OWNED BY public.ai_conversations.id;


--
-- Name: ai_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_logs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    order_id integer,
    conv_id integer,
    customer_phone text,
    role text NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ai_logs OWNER TO postgres;

--
-- Name: ai_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_logs_id_seq OWNER TO postgres;

--
-- Name: ai_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_logs_id_seq OWNED BY public.ai_logs.id;


--
-- Name: ai_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    enabled integer DEFAULT 0,
    system_prompt text,
    enabled_product_ids jsonb DEFAULT '[]'::jsonb,
    openai_api_key text,
    openrouter_api_key text,
    ai_model text DEFAULT 'openai/gpt-4o-mini'::text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ai_settings OWNER TO postgres;

--
-- Name: ai_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_settings_id_seq OWNER TO postgres;

--
-- Name: ai_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_settings_id_seq OWNED BY public.ai_settings.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    address text,
    city text,
    email text,
    order_count integer DEFAULT 0 NOT NULL,
    total_spent integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: email_verification_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_verification_codes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    code text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.email_verification_codes OWNER TO postgres;

--
-- Name: email_verification_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.email_verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_verification_codes_id_seq OWNER TO postgres;

--
-- Name: email_verification_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.email_verification_codes_id_seq OWNED BY public.email_verification_codes.id;


--
-- Name: integration_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.integration_logs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    integration_id integer,
    provider text NOT NULL,
    action text NOT NULL,
    status text NOT NULL,
    message text,
    payload text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.integration_logs OWNER TO postgres;

--
-- Name: integration_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.integration_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.integration_logs_id_seq OWNER TO postgres;

--
-- Name: integration_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.integration_logs_id_seq OWNED BY public.integration_logs.id;


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketing_campaigns (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    message text NOT NULL,
    product_link text,
    target_filter text DEFAULT 'delivered'::text,
    status text DEFAULT 'draft'::text,
    total_targets integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.marketing_campaigns OWNER TO postgres;

--
-- Name: marketing_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.marketing_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_campaigns_id_seq OWNER TO postgres;

--
-- Name: marketing_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.marketing_campaigns_id_seq OWNED BY public.marketing_campaigns.id;


--
-- Name: order_follow_up_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_follow_up_logs (
    id integer NOT NULL,
    order_id integer NOT NULL,
    agent_id integer,
    agent_name text,
    note text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.order_follow_up_logs OWNER TO postgres;

--
-- Name: order_follow_up_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_follow_up_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_follow_up_logs_id_seq OWNER TO postgres;

--
-- Name: order_follow_up_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_follow_up_logs_id_seq OWNED BY public.order_follow_up_logs.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    quantity integer DEFAULT 1 NOT NULL,
    price integer DEFAULT 0 NOT NULL,
    raw_product_name text,
    variant_info text,
    sku text
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    store_id integer NOT NULL,
    order_number text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_address text,
    customer_city text,
    status text DEFAULT 'nouveau'::text NOT NULL,
    total_price integer DEFAULT 0 NOT NULL,
    product_cost integer DEFAULT 0 NOT NULL,
    shipping_cost integer DEFAULT 0 NOT NULL,
    ad_spend integer DEFAULT 0 NOT NULL,
    assigned_to_id integer,
    comment text,
    track_number text,
    label_link text,
    shipping_provider text,
    replacement_track_number text,
    is_stock integer DEFAULT 0,
    up_sell integer DEFAULT 0,
    can_open integer DEFAULT 1,
    replace integer DEFAULT 0,
    source text DEFAULT 'manual'::text,
    utm_source text,
    utm_campaign text,
    traffic_platform text,
    media_buyer_id integer,
    raw_product_name text,
    variant_details text,
    raw_quantity integer,
    comment_status text,
    comment_order text,
    return_tracking_number text,
    was_abandoned integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    pickup_date timestamp without time zone
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    store_id integer NOT NULL,
    plan text NOT NULL,
    amount_dh integer NOT NULL,
    amount_usd integer NOT NULL,
    currency text DEFAULT 'dh'::text NOT NULL,
    method text NOT NULL,
    receipt_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    owner_name text,
    owner_email text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_variants (
    id integer NOT NULL,
    product_id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    cost_price integer DEFAULT 0 NOT NULL,
    selling_price integer DEFAULT 0 NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    image_url text
);


ALTER TABLE public.product_variants OWNER TO postgres;

--
-- Name: product_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.product_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_variants_id_seq OWNER TO postgres;

--
-- Name: product_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.product_variants_id_seq OWNED BY public.product_variants.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id integer NOT NULL,
    store_id integer NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    cost_price integer DEFAULT 0 NOT NULL,
    selling_price integer DEFAULT 0 NOT NULL,
    description text,
    description_darija text,
    ai_features text,
    image_url text,
    reference text,
    has_variants integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: recovery_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recovery_settings (
    id integer NOT NULL,
    store_id integer NOT NULL,
    enabled integer DEFAULT 0,
    wait_minutes integer DEFAULT 30,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.recovery_settings OWNER TO postgres;

--
-- Name: recovery_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recovery_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recovery_settings_id_seq OWNER TO postgres;

--
-- Name: recovery_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recovery_settings_id_seq OWNED BY public.recovery_settings.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    sid text NOT NULL,
    sess text NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: stock_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_logs (
    id integer NOT NULL,
    store_id integer NOT NULL,
    product_id integer NOT NULL,
    order_id integer,
    change_amount integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stock_logs OWNER TO postgres;

--
-- Name: stock_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_logs_id_seq OWNER TO postgres;

--
-- Name: stock_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_logs_id_seq OWNED BY public.stock_logs.id;


--
-- Name: store_agent_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.store_agent_settings (
    id integer NOT NULL,
    agent_id integer NOT NULL,
    store_id integer NOT NULL,
    role_in_store text DEFAULT 'confirmation'::text NOT NULL,
    lead_percentage integer DEFAULT 100 NOT NULL,
    allowed_product_ids text DEFAULT '[]'::text NOT NULL,
    allowed_regions text DEFAULT '[]'::text NOT NULL,
    commission_rate integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.store_agent_settings OWNER TO postgres;

--
-- Name: store_agent_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.store_agent_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.store_agent_settings_id_seq OWNER TO postgres;

--
-- Name: store_agent_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.store_agent_settings_id_seq OWNED BY public.store_agent_settings.id;


--
-- Name: store_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.store_integrations (
    id integer NOT NULL,
    store_id integer NOT NULL,
    provider text NOT NULL,
    type text NOT NULL,
    credentials text DEFAULT '{}'::text NOT NULL,
    is_active integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.store_integrations OWNER TO postgres;

--
-- Name: store_integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.store_integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.store_integrations_id_seq OWNER TO postgres;

--
-- Name: store_integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.store_integrations_id_seq OWNED BY public.store_integrations.id;


--
-- Name: stores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stores (
    id integer NOT NULL,
    name text NOT NULL,
    owner_id integer,
    last_assigned_agent_id integer,
    phone text,
    website text,
    facebook text,
    instagram text,
    other_social text,
    logo_url text,
    cover_image_url text,
    can_open integer DEFAULT 1,
    is_stock integer DEFAULT 0,
    is_ramassage integer DEFAULT 0,
    whatsapp_template text,
    whatsapp_template_custom text,
    whatsapp_template_shipping text,
    whatsapp_default_enabled integer DEFAULT 1,
    whatsapp_custom_enabled integer DEFAULT 0,
    whatsapp_shipping_enabled integer DEFAULT 0,
    webhook_key text,
    packaging_cost integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.stores OWNER TO postgres;

--
-- Name: stores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stores_id_seq OWNER TO postgres;

--
-- Name: stores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stores_id_seq OWNED BY public.stores.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    plan text DEFAULT 'trial'::text NOT NULL,
    monthly_limit integer DEFAULT 60 NOT NULL,
    price_per_month integer DEFAULT 0 NOT NULL,
    current_month_orders integer DEFAULT 0 NOT NULL,
    billing_cycle_start timestamp without time zone DEFAULT now(),
    plan_start_date timestamp without time zone,
    plan_expiry_date timestamp without time zone,
    is_active integer DEFAULT 1,
    is_blocked integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscriptions_id_seq OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    email text,
    phone text,
    password text NOT NULL,
    role text NOT NULL,
    store_id integer,
    payment_type text DEFAULT 'commission'::text,
    payment_amount integer DEFAULT 0,
    distribution_method text DEFAULT 'auto'::text,
    is_super_admin integer DEFAULT 0,
    is_active integer DEFAULT 1,
    dashboard_permissions jsonb,
    buyer_code text,
    created_at timestamp without time zone DEFAULT now(),
    is_email_verified integer DEFAULT 0
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: whatsapp_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_sessions (
    id integer NOT NULL,
    store_id integer NOT NULL,
    status text DEFAULT 'disconnected'::text,
    phone text,
    qr_code text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.whatsapp_sessions OWNER TO postgres;

--
-- Name: whatsapp_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.whatsapp_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.whatsapp_sessions_id_seq OWNER TO postgres;

--
-- Name: whatsapp_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.whatsapp_sessions_id_seq OWNED BY public.whatsapp_sessions.id;


--
-- Name: ad_spend id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend ALTER COLUMN id SET DEFAULT nextval('public.ad_spend_id_seq'::regclass);


--
-- Name: ad_spend_tracking id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend_tracking ALTER COLUMN id SET DEFAULT nextval('public.ad_spend_tracking_id_seq'::regclass);


--
-- Name: agent_products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_products ALTER COLUMN id SET DEFAULT nextval('public.agent_products_id_seq'::regclass);


--
-- Name: ai_conversations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations ALTER COLUMN id SET DEFAULT nextval('public.ai_conversations_id_seq'::regclass);


--
-- Name: ai_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_logs ALTER COLUMN id SET DEFAULT nextval('public.ai_logs_id_seq'::regclass);


--
-- Name: ai_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_settings ALTER COLUMN id SET DEFAULT nextval('public.ai_settings_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: email_verification_codes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_codes ALTER COLUMN id SET DEFAULT nextval('public.email_verification_codes_id_seq'::regclass);


--
-- Name: integration_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_logs ALTER COLUMN id SET DEFAULT nextval('public.integration_logs_id_seq'::regclass);


--
-- Name: marketing_campaigns id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_campaigns ALTER COLUMN id SET DEFAULT nextval('public.marketing_campaigns_id_seq'::regclass);


--
-- Name: order_follow_up_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_follow_up_logs ALTER COLUMN id SET DEFAULT nextval('public.order_follow_up_logs_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: product_variants id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants ALTER COLUMN id SET DEFAULT nextval('public.product_variants_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: recovery_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recovery_settings ALTER COLUMN id SET DEFAULT nextval('public.recovery_settings_id_seq'::regclass);


--
-- Name: stock_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_logs ALTER COLUMN id SET DEFAULT nextval('public.stock_logs_id_seq'::regclass);


--
-- Name: store_agent_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_agent_settings ALTER COLUMN id SET DEFAULT nextval('public.store_agent_settings_id_seq'::regclass);


--
-- Name: store_integrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_integrations ALTER COLUMN id SET DEFAULT nextval('public.store_integrations_id_seq'::regclass);


--
-- Name: stores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores ALTER COLUMN id SET DEFAULT nextval('public.stores_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: whatsapp_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_sessions ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_sessions_id_seq'::regclass);


--
-- Data for Name: ad_spend; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ad_spend (id, store_id, user_id, product_id, source, date, amount, product_selling_price, created_at) FROM stdin;
\.


--
-- Data for Name: ad_spend_tracking; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ad_spend_tracking (id, store_id, media_buyer_id, product_id, date, amount, source, notes, created_at) FROM stdin;
\.


--
-- Data for Name: agent_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_products (id, agent_id, product_id, store_id) FROM stdin;
\.


--
-- Data for Name: ai_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_conversations (id, store_id, order_id, customer_phone, customer_name, status, is_manual, needs_attention, conversation_step, collected_city, collected_variant, last_message, last_message_at, created_at, is_new_lead, lead_stage, lead_name, lead_city, lead_address, lead_product_id, lead_product_name, lead_price, created_order_id, lead_quantity, whatsapp_jid, confirmed_at) FROM stdin;
10	1	\N	+212632595440	omar -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة omar، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 23:31:04.49	2026-03-24 23:31:04.483909	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
4	1	\N	177532607430859	\N	manual	1	0	1	\N	\N	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:42:46.598	2026-03-24 17:52:16.624772	1	AWAITING_CONFIRM	sf sftha liya	سلا	آش من لون	1	Mocassins ANAKIO	0	\N	100	177532607430859@lid	\N
9	1	\N	+212632595440	omar -	active	0	0	1	\N	\N	3lach mknajwbo	2026-03-24 23:30:31.264	2026-03-24 23:29:11.615044	0	\N	\N	\N	\N	\N	\N	\N	\N	1	177532607430859@lid	\N
3	1	\N	+212601687137	abdo -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة abdo، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 17:28:25.31	2026-03-24 17:28:25.302044	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
5	1	\N	+212632595440	Khalid -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة Khalid، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 18:46:41.926	2026-03-24 18:46:41.918673	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
1	1	\N	+212632595440	Mohamed Belkadi	closed	0	0	3	slm 3fak brti sbat	wach mn jld	وعليكم السلام خويا! 😊 عندنا السبات "Mocassins ANAKIO"، كيجمع بين الجودة والراحة. واش كاين شي لون أو قياس كيعجبك؟	2026-03-24 17:04:33.895	2026-03-24 14:14:54.448126	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
6	1	\N	+212632595440	Brahim -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة Brahim، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 19:45:51.885	2026-03-24 19:45:51.874188	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
8	1	\N	+212632595440	abdo -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة abdo، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 22:33:39.696	2026-03-24 22:33:39.680968	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
7	1	\N	+212632595440	Khadija -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة Khadija، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 20:02:24.305	2026-03-24 20:02:24.295623	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
2	1	\N	+212601687137	mjid -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة mjid، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 17:25:59.312	2026-03-24 17:25:59.305689	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
15	1	13	+212601687137	عبدو -	confirmed	0	0	3	ممكن تقول مميزات الحداء	بغيت نعرف الالون لي فيه	مفهوم سيدي/لالة، غنلغيوها ليك دابا. نتمنى ليك سفر موفق، وإلا كنت محتاج شي حاجة فالمستقبل، رانا هنا. 😊✈️	2026-03-25 18:52:27.146	2026-03-25 18:43:17.28791	0	\N	\N	\N	\N	\N	\N	\N	\N	1	226070603264231@lid	2026-03-25 18:49:50.314
13	1	11	+212632595440	said -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة said، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-25 00:22:04.012	2026-03-25 00:22:04.005139	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
11	1	\N	+212632595440	abdelah -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة abdelah، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 23:42:10.502	2026-03-24 23:42:10.494722	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
12	1	\N	+212632595440	boubakr -	closed	0	0	1	\N	\N	السلام عليكم سيدي/لالة boubakr، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-24 23:55:09.602	2026-03-24 23:55:09.595632	0	\N	\N	\N	\N	\N	\N	\N	\N	1	\N	\N
14	1	\N	+212632595440	SHABESHINY DILEEPAN	active	0	0	3	ah imta radi twslni	ah imta radi twslni	إحنا سيدي متجر إلكتروني، وكنوصلو للزبناء في جميع أنحاء المغرب 🚚. واش عندك أي سؤال آخر؟ كنا هنا دايما 🙏	2026-03-25 23:00:49.39	2026-03-25 17:31:42.444331	0	\N	\N	\N	\N	\N	\N	\N	\N	1	177532607430859@lid	\N
\.


--
-- Data for Name: ai_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_logs (id, store_id, order_id, conv_id, customer_phone, role, message, created_at) FROM stdin;
24	1	\N	4	177532607430859	user	slm	2026-03-24 17:52:16.629823
25	1	\N	4	177532607430859	assistant	و عليكم السلام! مرحبا بيك فـTajerGrow HQ. كيفاش نقدر نعاونك اليوم؟ واش شي حاجة معينة كنتي مهتم بها؟ دير لي عافاك اسمك الكامل 📝	2026-03-24 17:52:16.641417
26	1	\N	4	177532607430859	user	sf sftha liya	2026-03-24 17:52:45.357116
27	1	\N	4	177532607430859	assistant	عندنا Mocassins ANAKIO، حذاء مريح وشيك، مصنوع من مواد عالية الجودة اللي كتوفر لك راحة وطول الأمد. واش كاين شي حاجة خاصة بغيتي تعرف عليها؟ على فكرة، شنو الاسم ديالك والمدينة اللي غادي نرسلو ليك فيها؟	2026-03-24 17:52:48.130866
28	1	\N	4	177532607430859	user	سلام فين وصلات كومند	2026-03-24 18:45:44.391559
29	1	\N	4	177532607430859	assistant	سلام sf sftha liya! باش نقدر نساعدك ونتبعو الكومند ديالك، ممكن تأكد ليا المدينة والعنوان الكامل (الحي والشارع)؟ هكا غادي نعطيوك معلومات دقيقة على الوضعية ديالها.	2026-03-24 18:45:46.275807
31	1	\N	4	177532607430859	user	آش من لون	2026-03-24 18:47:02.334637
32	1	\N	4	177532607430859	assistant	آسف على اللبس. قل لي عافاك شحال من قطعة بغيتي من Mocassins ANAKIO؟ ومن بعد نقدر نعاونك فاختيار اللون اللي كاينين.	2026-03-24 18:47:03.836161
33	1	\N	4	177532607430859	user	yak ra tb9a m3aya 3la twasl	2026-03-24 19:44:42.597712
34	1	\N	4	177532607430859	assistant	بالطبع، أنا دائما هنا باش نعاونك. كيف ما بغيتي، شنو هو اللون اللي مهتم بيه فـMocassins ANAKIO؟ وأيضاً، شحال من قطعة بغيتي؟ هدشي باش نكمل ليك تفاصيل الطلبية.	2026-03-24 19:44:44.010995
36	1	\N	4	177532607430859	user	آش من لون كاين فيه	2026-03-24 19:46:12.441829
37	1	\N	4	177532607430859	assistant	الألوان المتوفرة عندنا فـMocassins ANAKIO هما: كحل (Noir)، مارون (Marron)، بلو مارين (Bleu Marine)، وكري (Gris). شنو اللون اللي عاجبك؟	2026-03-24 19:46:13.518882
38	1	\N	\N	177532607430859	user	اشنو نوع جلد	2026-03-24 20:01:10.517148
39	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 20:01:10.53068
41	1	\N	\N	177532607430859	user	شحال مدة توصيل	2026-03-24 20:02:41.423551
42	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 20:02:41.43824
44	1	\N	\N	177532607430859	user	شحال تمن	2026-03-24 23:19:21.1794
45	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:19:21.196038
46	1	\N	\N	177532607430859	user	شحال تمن	2026-03-24 23:19:38.238392
47	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:19:38.283915
49	1	\N	\N	177532607430859	user	taroudant	2026-03-24 23:29:46.699439
50	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:29:46.740597
52	1	\N	\N	177532607430859	user	chhhal tmn	2026-03-24 23:30:55.720579
53	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:30:55.769202
55	1	\N	\N	177532607430859	user	ah	2026-03-24 23:31:23.829417
56	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:31:23.844647
58	1	\N	\N	177532607430859	user	chhal tmn	2026-03-24 23:42:46.578669
59	1	\N	\N	177532607430859	assistant	شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.	2026-03-24 23:42:46.59389
61	1	11	\N	+212632595440	assistant	السلام عليكم سيدي/لالة said، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow HQ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-25 00:22:04.009929
77	1	13	\N	+212601687137	assistant	السلام عليكم سيدي/لالة عبدو، تبارك الله عليك ✨\nمعاك فريق الدعم ديال TajerGrow ، شلنا الطلب ديالك لـ "Mocassins ANAKIO".\nواش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀	2026-03-25 18:43:17.292166
78	1	13	\N	+212601687137	user	ممكن تقول مميزات الحداء	2026-03-25 18:43:35.65602
79	1	13	\N	+212601687137	assistant	بطبيعة الحال سيدي/لالة! 👞 \n"Mocassins ANAKIO" مصنوعين من مادة خارجية عالية الجودة، السميلة ديالهم مرنة ومضادة للانزلاق، وعندهم فرشة داخلية مريحة كتمنع الريحة. اللون والتصميم كيجمعو بين الأناقة والراحة، كيليقو للخدمة والمناسبات والخروج اليومي. 😊\nواش كاين شي سؤال آخر سيدي/لالة؟ كنا هنا دايما 🙏	2026-03-25 18:43:37.820716
80	1	13	\N	+212601687137	user	بغيت نعرف الالون لي فيه	2026-03-25 18:44:39.718222
81	1	13	\N	+212601687137	assistant	بالطبع سيدي/لالة! "Mocassins ANAKIO" متوفرين فـ الألوان كحل، مارون، بلو مارين، وكري. 🎨 واش عندك لون مفضل فيهم؟ 😊	2026-03-25 18:44:41.537831
82	1	13	\N	+212601687137	user	كيحبني الكحل بغيت واحد	2026-03-25 18:45:20.68114
83	1	13	\N	+212601687137	assistant	تبارك الله عليك سيدي/لالة! صافي، غنوجدو ليك "Mocassins ANAKIO" فاللون الكحل. الطلبية ديالك: مقاس بغيت نعرف الالون لي فيه، لـ ممكن تقول مميزات الحداء، 379 درهم (التوصيل مجاني 🚚). واش نؤكد ليك؟	2026-03-25 18:45:21.99724
84	1	13	\N	+212601687137	user	انا بغبتو فلكحل وبغيت مقاس 42 بغيتو غدا يوصلني	2026-03-25 18:49:16.847038
85	1	13	\N	+212601687137	assistant	صافي سيدي/لالة، غنوجدو ليك "Mocassins ANAKIO" فاللون الكحل والمقاس 42. الطلبية غتخرج اليوم وغتوصل ليك إن شاء الله في ظرف 24 لـ 48 ساعة. شكراً بزاف! 🎉 واش عندك أي سؤال آخر؟ كنا هنا دايما 🙏	2026-03-25 18:49:18.716563
86	1	13	\N	+212601687137	user	لا صافي مع سلامة	2026-03-25 18:49:50.303152
87	1	13	\N	+212601687137	assistant	صافي سيدي/لالة! الكوموند ديالك تأكدات ✅ غتخرج اليوم إن شاء الله. شكراً بزاف على ثقتك فينا 🎉🚀	2026-03-25 18:49:50.332437
88	1	13	\N	+212601687137	user	صافي مبقيتش بغيها مسافر ليوم	2026-03-25 18:52:25.008879
89	1	13	\N	+212601687137	assistant	مفهوم سيدي/لالة، غنلغيوها ليك دابا. نتمنى ليك سفر موفق، وإلا كنت محتاج شي حاجة فالمستقبل، رانا هنا. 😊✈️	2026-03-25 18:52:27.128615
\.


--
-- Data for Name: ai_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_settings (id, store_id, enabled, system_prompt, enabled_product_ids, openai_api_key, openrouter_api_key, ai_model, updated_at) FROM stdin;
1	1	1	dentity & Role:\nأنت "أمين"، موظف خدمة عملاء وخبير مبيعات في منصة [TajerGrow]. مهمتك هي التواصل مع الزبناء عبر الواتساب لتأكيد طلبياتهم بطريقة إنسانية، ذكية، ومقنعة جداً. أنت لست مجرد بوت، بل أنت ممثل لبراند [Anakio] الفاخرة.\nLanguage & Tone Rules:\nالدارجة فقط: تكلم فقط بالدارجة المغربية العصرية (Urban Darija). تجنب اللغة العربية الفصحى نهائياً (لا تقل: سوف، هل، نحن، جودة عالية).\nالأسلوب: كن مؤدباً، حماسياً، وقريباً من القلب. استخدم كلمات مثل: (تبارك الله عليك، سيدي، لالة، هاني، ناضي، الله يحفظك، ميسر، الهمة والشان).\nالجنس (Gender): حلل اسم الزبون قبل الرد. إذا كان ذكراً، ناده بـ "سيدي [الاسم]" أو "خويا". إذا كان أنثى، نادها بـ "لالة [الاسم]" أو "ختي".\nالإيموجي: استخدم الإيموجي بشكل احترافي لتعزيز الود (👞, ✨, 🌟, ✅).\nConversation Strategy (The Sales Loop):\nممنوع كثرة الأسئلة: لا تسأل عن كل شيء في رسالة واحدة. اتبع هذا التسلسل:\nالترحيب وتأكيد المدينة: "السلام عليكم سيدي محمد، تبارك الله عليك ✨. شلنا الطلب ديالك لصباط أناكيو، واش ممكن تأكد لينا غير المدينة فين ساكن باش نوجدوها ليك؟"\nتأكيد التفاصيل: بعد رد الزبون، أكد معه المقاس أو اللون.\nالإغلاق (The Close): بمجرد الحصول على المعلومات، قل له: "صافي سيدي، كولشي ناضي. الطلبية غتخرج اليوم وغتوصلك في ظرف 24 لـ 48 ساعة. نهارك مبروك!"\nHandling Objections (التعامل مع الاعتراضات):\nإذا سأل عن الجودة: قل له أن براند [Anakio] تستخدم الجلد الطبيعي 100% والصنعة يدوية مغربية أصيلة (صنعة المعلم).\nإذا سأل عن الضمان: ركز دائماً على ميزة "قلّب عاد خلّص" (المعاينة عند الاستلام). قل له: "من حقك تحل الكولية وتشوف الجودة بعينيك وتجرب الصباط، إيلا عجبك خلص الموزع، إيلا ما عجبكش رجعه فـ البلاصة."\nإذا سأل عن الثمن: أكد له أن الثمن مناسب جداً مقابل الجودة (جلد حر) وأن التوصيل مجاني (فابور).\nTechnical Integration:\nسوف يتم تزويدك ببيانات الطلب (اسم الزبون، المنتج، الثمن، المدينة) في كل رسالة. استخدمها لتبدو عارفاً بكل التفاصيل. إذا قال الزبون كلمة تعني التأكيد (أه، أكد، صيفطوه، مزيان، واك)، يجب أن تنهي المحادثة وتؤكد الطلب برمجياً.	[1]	\N	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	openai/gpt-4o	2026-03-25 13:42:39.667
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, store_id, name, phone, address, city, email, order_count, total_spent, created_at) FROM stdin;
\.


--
-- Data for Name: email_verification_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_verification_codes (id, user_id, code, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: integration_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.integration_logs (id, store_id, integration_id, provider, action, status, message, payload, created_at) FROM stdin;
1	1	1	shopify	integration_connected	success	Intégration shopify connectée	\N	2026-03-24 14:12:28.071661
2	1	1	shopify	order_synced	success	Commande 1046 importée via token webhook	\N	2026-03-24 14:14:54.429491
3	1	1	shopify	order_synced	success	Commande 1047 importée via token webhook	\N	2026-03-24 17:25:59.275125
4	1	1	shopify	order_synced	success	Commande 1048 importée via token webhook	\N	2026-03-24 17:28:25.27752
5	1	1	shopify	order_synced	success	Commande 1049 importée via token webhook	\N	2026-03-24 18:46:41.893563
6	1	1	shopify	order_synced	success	Commande 1050 importée via token webhook	\N	2026-03-24 19:45:51.838735
7	1	1	shopify	order_synced	success	Commande 1051 importée via token webhook	\N	2026-03-24 20:02:24.273094
8	1	1	shopify	order_synced	success	Commande 1052 importée via token webhook	\N	2026-03-24 22:33:39.551027
9	1	1	shopify	order_synced	success	Commande 1053 importée via token webhook	\N	2026-03-24 23:29:11.594971
10	1	1	shopify	order_synced	success	Commande 1054 importée via token webhook	\N	2026-03-24 23:42:10.46877
11	1	1	shopify	order_synced	success	Commande 1055 importée via token webhook	\N	2026-03-24 23:55:09.570153
12	1	1	shopify	order_synced	success	Commande 1056 importée via token webhook	\N	2026-03-25 00:22:03.982696
13	1	1	shopify	order_synced	success	Commande 1057 importée via token webhook	\N	2026-03-25 17:31:42.369562
14	1	1	shopify	order_synced	success	Commande 1058 importée via token webhook	\N	2026-03-25 18:43:17.263698
\.


--
-- Data for Name: marketing_campaigns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketing_campaigns (id, store_id, name, message, product_link, target_filter, status, total_targets, total_sent, total_failed, created_at) FROM stdin;
\.


--
-- Data for Name: order_follow_up_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_follow_up_logs (id, order_id, agent_id, agent_name, note, created_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, product_id, quantity, price, raw_product_name, variant_info, sku) FROM stdin;
14	11	1	1	37900	\N	\N	\N
16	13	1	1	37900	\N	\N	\N
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, store_id, order_number, customer_name, customer_phone, customer_address, customer_city, status, total_price, product_cost, shipping_cost, ad_spend, assigned_to_id, comment, track_number, label_link, shipping_provider, replacement_track_number, is_stock, up_sell, can_open, replace, source, utm_source, utm_campaign, traffic_platform, media_buyer_id, raw_product_name, variant_details, raw_quantity, comment_status, comment_order, return_tracking_number, was_abandoned, created_at, updated_at, pickup_date) FROM stdin;
11	1	1056	said -	+212632595440	douar aghechi freija taroudant	Taroudnat	nouveau	37900	18000	0	0	2	\N	\N	\N	\N	\N	0	0	1	0	shopify	\N	\N	\N	\N	Mocassins ANAKIO	45	1	\N	\N	\N	0	2026-03-25 00:22:03.95146	2026-03-25 00:22:03.95146	\N
13	1	1058	عبدو -	+212601687137	freija,taroudant	taroudant	confirme	37900	18000	0	0	2	\N	\N	\N	\N	\N	0	0	1	0	shopify	\N	\N	\N	\N	Mocassins ANAKIO	41	1	\N	\N	\N	0	2026-03-25 18:43:17.206996	2026-03-25 18:49:50.316	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, store_id, plan, amount_dh, amount_usd, currency, method, receipt_url, status, notes, owner_name, owner_email, created_at) FROM stdin;
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_variants (id, product_id, store_id, name, sku, cost_price, selling_price, stock, image_url) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, store_id, name, sku, stock, cost_price, selling_price, description, description_darija, ai_features, image_url, reference, has_variants, created_at) FROM stdin;
1	1	Mocassins ANAKIO	Mocassins	99	18000	37900	📋 معلومات أساسية للمنتج (Product Specifications):\nاسم المنتج: موكاسان للرجال (Mocassins pour Hommes).\nالنوع / الستيل: حذاء كاجوال كلاسيكي (Casual Chic)، كيليق للخدمة، المناسبات، والخروج اليومي.\nالمادة الخارجية (الوجه): [هنا كتب واش جلد (Cuir) أو دايم (Daim/Suede) أو ثوب] عالي الجودة.\nالمادة الداخلية (الفرشة): فرشة رطبة ومريحة (Semelle intérieure orthopédique)، كتمتص العرق وما كتخليش الريحة.\nالسميلة (النعل الخارجي): سميلة صحيحة من المطاط (Caoutchouc)، مرنة (Flexible) ومضادة للانزلاق (Anti-dérapant).\nطريقة اللبس: ساهل فاللبس (Slip-on)، ما فيه لا سيور لا عقد.\n🎨 الألوان والمقاسات (Colors & Sizes):\nالألوان المتوفرة: [اكتب الألوان اللي عندك، مثلاً: كحل (Noir)، مارون (Marron)، بلو مارين (Bleu Marine)، كري (Gris)...]\nالمقاسات المتوفرة (Pointures): من [مثلاً 39] حتى [مثلاً 44].\nنصيحة القياس (Sizing Guide): القياس مضبوط (Standard). الكليان ياخد نفس القياس اللي كيلبس ديما فالسبرديلة أو الصباط. (إلا كان الموديل كيزير، كتب: "ياخد نمرة كبر من قياسو").\n🚚 التوصيل والدفع (Shipping & Payment):\nطريقة الدفع: الدفع عند الاستلام (Paiement à la livraison / Cash on Delivery). الكليان ما كيخلص والو حتى كيشد الصباط فيدو ويقلبو.\nمدة التوصيل: من 24 إلى 48 ساعة فالمدن الكبرى، ومن يومين حتى لـ 3 أيام فالمدن البعيدة والقرى.\nثمن التوصيل: [اكتب واش فابور (Gratuit) أو مثلاً 20 درهم كازا و 40 درهم برا كازا].\n🔄 سياسة الاستبدال والإرجاع (Return & Exchange Policy):\nالتبديل (Exchange): إيه ممكن. إلى جاك القياس صغير أو كبير، أو ما عجبكش اللون، كنبدلوه ليك بكل فرح في ظرف [مثلاً 3 أيام أو 7 أيام]، بشرط الصباط ما يكونش تلبس برا الدار.\nمصاريف التبديل: [اكتب واش الكليان كيخلص ليفريزون ديال التبديل أو فابور].\n🧼 نصائح العناية بالمنتج (Care Instructions):\nالتنظيف: يتمسح بشيفونة (زيف) مندية شوية. (إلا كان دايم، يتنظف بالشيتة الخاصة بالدايم).\nتحذير: ممنوع يتغسل فالماكينة الصابون (Machine à laver) أو يتغطس فالما باش ما يخسرش.	\N	\N	\N	\N	0	2026-03-24 12:21:55.47336
\.


--
-- Data for Name: recovery_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recovery_settings (id, store_id, enabled, wait_minutes, updated_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (sid, sess, expire) FROM stdin;
TsUttvM2_AhDK_Wu4P8BZMRj1kFnei4q	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-22T23:55:16.870Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"passport":{"user":1}}	2026-04-22 23:55:17
58Xf5DmBWizEeE15CZ9VPxGaRNQxE-HP	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-24T23:25:04.666Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"passport":{"user":1}}	2026-04-26 21:10:29
\.


--
-- Data for Name: stock_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_logs (id, store_id, product_id, order_id, change_amount, reason, created_at) FROM stdin;
1	1	1	13	-1	Commande #13 confirmée	2026-03-25 18:49:50.315084
\.


--
-- Data for Name: store_agent_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.store_agent_settings (id, agent_id, store_id, role_in_store, lead_percentage, allowed_product_ids, allowed_regions, commission_rate, created_at) FROM stdin;
1	2	1	both	100	[]	[]	8	2026-03-24 12:22:47.341669
\.


--
-- Data for Name: store_integrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.store_integrations (id, store_id, provider, type, credentials, is_active, created_at) FROM stdin;
1	1	shopify	store	{"webhookUrl":"https://ede8a824-b44f-4cb2-98fd-6f01ad3b93ec-00-2t2vz7r31a3yi.janeway.replit.dev/api/webhooks/shopify/order/51BVWFGLHES0"}	1	2026-03-24 14:12:28.060529
2	1	open_retour	returns	{"apiKey":"Chalabi2018$","clientId":"mehamadchalabi100@gmail.com"}	1	2026-03-26 15:40:20.604484
\.


--
-- Data for Name: stores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stores (id, name, owner_id, last_assigned_agent_id, phone, website, facebook, instagram, other_social, logo_url, cover_image_url, can_open, is_stock, is_ramassage, whatsapp_template, whatsapp_template_custom, whatsapp_template_shipping, whatsapp_default_enabled, whatsapp_custom_enabled, whatsapp_shipping_enabled, webhook_key, packaging_cost, created_at) FROM stdin;
1	TajerGrow 	\N	2	\N	\N	\N	\N	\N	\N	\N	1	0	0	\N	\N	\N	1	0	0	51BVWFGLHES0	0	2026-03-23 23:54:32.754204
2	tger	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	0	\N	\N	\N	1	0	0	Y1NBA6IKNB5N	0	2026-03-25 22:11:41.516826
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscriptions (id, store_id, plan, monthly_limit, price_per_month, current_month_orders, billing_cycle_start, plan_start_date, plan_expiry_date, is_active, is_blocked, created_at) FROM stdin;
1	1	enterprise	999999	0	13	2026-03-23 23:54:32.759454	\N	\N	1	0	2026-03-23 23:54:32.759454
2	2	trial	60	0	0	2026-03-25 22:11:41.557454	\N	\N	1	0	2026-03-25 22:11:41.557454
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, email, phone, password, role, store_id, payment_type, payment_amount, distribution_method, is_super_admin, is_active, dashboard_permissions, buyer_code, created_at, is_email_verified) FROM stdin;
1	TajerGrow Admin	mehamadchalabi100@gmail.com	\N	23d58188a7cc0886f37b9770f645c86c75796a423c249bf701651ff1d51ff50a8fb637f2159aba08889318cdd40152ae70cdf1fc2f076f82a5378eda988c264b.07179a5548348c93f910a89a9c7d8aea	owner	1	commission	0	auto	1	1	\N	\N	2026-03-23 23:54:32.763762	0
2	khawla	khawla@gmail.com	\N	0f50efa259d9e3294d4ffc0e26a6f73d110cc26f0363f9f8b1910618b45871a3834b255368fab992f3aa1a3f53443142c9c06007fa708bf83b502cf41358fb38.e852dfc000cebf32bd49a96e8d491812	agent	1	commission	0	auto	0	1	\N	\N	2026-03-24 12:22:47.333399	0
3	brahim	brahim@gmail.com	\N	72ab0d4d268c67bcaca1cf9a2df5c3e3c698a832b56b6738ff501bb8c96c9ee0f2f2f8baf76f836cddc782f8d00ef8f0b25e0cd2123a6f7e6e4ce53dcd512bc7.26643456bd9a2d6c8e13b89cf8be1994	owner	2	commission	0	auto	0	1	\N	\N	2026-03-25 22:11:41.550967	0
\.


--
-- Data for Name: whatsapp_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_sessions (id, store_id, status, phone, qr_code, updated_at) FROM stdin;
1	1	connected	212688959768	\N	2026-03-27 20:55:11.434
\.


--
-- Name: ad_spend_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ad_spend_id_seq', 1, false);


--
-- Name: ad_spend_tracking_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ad_spend_tracking_id_seq', 1, false);


--
-- Name: agent_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.agent_products_id_seq', 1, false);


--
-- Name: ai_conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ai_conversations_id_seq', 15, true);


--
-- Name: ai_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ai_logs_id_seq', 93, true);


--
-- Name: ai_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ai_settings_id_seq', 1, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customers_id_seq', 1, false);


--
-- Name: email_verification_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.email_verification_codes_id_seq', 1, false);


--
-- Name: integration_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.integration_logs_id_seq', 14, true);


--
-- Name: marketing_campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.marketing_campaigns_id_seq', 1, false);


--
-- Name: order_follow_up_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_follow_up_logs_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 16, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 13, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 1, false);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 1, true);


--
-- Name: recovery_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.recovery_settings_id_seq', 1, false);


--
-- Name: stock_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_logs_id_seq', 1, true);


--
-- Name: store_agent_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.store_agent_settings_id_seq', 1, true);


--
-- Name: store_integrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.store_integrations_id_seq', 2, true);


--
-- Name: stores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stores_id_seq', 2, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: whatsapp_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.whatsapp_sessions_id_seq', 1, true);


--
-- Name: ad_spend ad_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend
    ADD CONSTRAINT ad_spend_pkey PRIMARY KEY (id);


--
-- Name: ad_spend_tracking ad_spend_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend_tracking
    ADD CONSTRAINT ad_spend_tracking_pkey PRIMARY KEY (id);


--
-- Name: agent_products agent_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_products
    ADD CONSTRAINT agent_products_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_logs ai_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_settings ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_pkey PRIMARY KEY (id);


--
-- Name: ai_settings ai_settings_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_store_id_unique UNIQUE (store_id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: email_verification_codes email_verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);


--
-- Name: integration_logs integration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: order_follow_up_logs order_follow_up_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_follow_up_logs
    ADD CONSTRAINT order_follow_up_logs_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: recovery_settings recovery_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recovery_settings
    ADD CONSTRAINT recovery_settings_pkey PRIMARY KEY (id);


--
-- Name: recovery_settings recovery_settings_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recovery_settings
    ADD CONSTRAINT recovery_settings_store_id_unique UNIQUE (store_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: stock_logs stock_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_pkey PRIMARY KEY (id);


--
-- Name: store_agent_settings store_agent_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_agent_settings
    ADD CONSTRAINT store_agent_settings_pkey PRIMARY KEY (id);


--
-- Name: store_integrations store_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_integrations
    ADD CONSTRAINT store_integrations_pkey PRIMARY KEY (id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_sessions whatsapp_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_sessions whatsapp_sessions_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_store_id_unique UNIQUE (store_id);


--
-- Name: ad_spend ad_spend_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend
    ADD CONSTRAINT ad_spend_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: ad_spend ad_spend_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend
    ADD CONSTRAINT ad_spend_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: ad_spend_tracking ad_spend_tracking_media_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend_tracking
    ADD CONSTRAINT ad_spend_tracking_media_buyer_id_users_id_fk FOREIGN KEY (media_buyer_id) REFERENCES public.users(id);


--
-- Name: ad_spend_tracking ad_spend_tracking_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend_tracking
    ADD CONSTRAINT ad_spend_tracking_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: ad_spend_tracking ad_spend_tracking_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend_tracking
    ADD CONSTRAINT ad_spend_tracking_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: ad_spend ad_spend_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_spend
    ADD CONSTRAINT ad_spend_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: agent_products agent_products_agent_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_products
    ADD CONSTRAINT agent_products_agent_id_users_id_fk FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: agent_products agent_products_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_products
    ADD CONSTRAINT agent_products_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: agent_products agent_products_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_products
    ADD CONSTRAINT agent_products_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: ai_conversations ai_conversations_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: ai_conversations ai_conversations_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: ai_logs ai_logs_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: ai_logs ai_logs_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT ai_logs_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: ai_settings ai_settings_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: customers customers_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: email_verification_codes email_verification_codes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: integration_logs integration_logs_integration_id_store_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_integration_id_store_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.store_integrations(id);


--
-- Name: integration_logs integration_logs_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: marketing_campaigns marketing_campaigns_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: order_follow_up_logs order_follow_up_logs_agent_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_follow_up_logs
    ADD CONSTRAINT order_follow_up_logs_agent_id_users_id_fk FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: order_follow_up_logs order_follow_up_logs_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_follow_up_logs
    ADD CONSTRAINT order_follow_up_logs_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_assigned_to_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_to_id_users_id_fk FOREIGN KEY (assigned_to_id) REFERENCES public.users(id);


--
-- Name: orders orders_media_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_media_buyer_id_users_id_fk FOREIGN KEY (media_buyer_id) REFERENCES public.users(id);


--
-- Name: orders orders_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: payments payments_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: product_variants product_variants_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: product_variants product_variants_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: products products_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: recovery_settings recovery_settings_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recovery_settings
    ADD CONSTRAINT recovery_settings_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: stock_logs stock_logs_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: stock_logs stock_logs_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_logs stock_logs_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: store_agent_settings store_agent_settings_agent_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_agent_settings
    ADD CONSTRAINT store_agent_settings_agent_id_users_id_fk FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: store_agent_settings store_agent_settings_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_agent_settings
    ADD CONSTRAINT store_agent_settings_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: store_integrations store_integrations_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_integrations
    ADD CONSTRAINT store_integrations_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: subscriptions subscriptions_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: users users_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: whatsapp_sessions whatsapp_sessions_store_id_stores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 9f0f6s1hB3ZCcQKfQTmdyzkLlzWaleM01pa9uOvxeafjgSuKPW3gje5RJqr9TJ6


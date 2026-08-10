import pg from "pg";

const { Pool } = pg;

async function createBaseTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("Creating base tables...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.stores (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id INTEGER,
        last_assigned_agent_id INTEGER,
        phone TEXT,
        website TEXT,
        facebook TEXT,
        instagram TEXT,
        other_social TEXT,
        logo_url TEXT,
        cover_image_url TEXT,
        can_open INTEGER DEFAULT 1,
        is_stock INTEGER DEFAULT 0,
        is_ramassage INTEGER DEFAULT 0,
        whatsapp_template TEXT,
        whatsapp_template_custom TEXT,
        whatsapp_template_shipping TEXT,
        whatsapp_default_enabled INTEGER DEFAULT 1,
        whatsapp_custom_enabled INTEGER DEFAULT 0,
        whatsapp_shipping_enabled INTEGER DEFAULT 0,
        webhook_key TEXT,
        packaging_cost INTEGER DEFAULT 0,
        agent_ids JSONB DEFAULT '[]',
        services JSONB DEFAULT '[]',
        linked_carriers JSONB DEFAULT '[]',
        linked_platforms JSONB DEFAULT '[]',
        distribution_method TEXT DEFAULT 'auto',
        distribution_epoch TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] stores");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        store_id INTEGER REFERENCES public.stores(id),
        payment_type TEXT DEFAULT 'commission',
        payment_amount INTEGER DEFAULT 0,
        distribution_method TEXT DEFAULT 'auto',
        is_super_admin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        is_email_verified INTEGER DEFAULT 0,
        preferred_language TEXT DEFAULT 'fr',
        dashboard_permissions JSONB,
        buyer_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] users");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.email_verification_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.users(id),
        code TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] email_verification_codes");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.products (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        cost_price INTEGER NOT NULL DEFAULT 0,
        selling_price INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        description_darija TEXT,
        ai_features TEXT,
        image_url TEXT,
        reference TEXT,
        has_variants INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] products");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES public.products(id),
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        cost_price INTEGER NOT NULL DEFAULT 0,
        selling_price INTEGER NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0
      );
    `);
    console.log("[OK] product_variants");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.orders (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        order_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone2 TEXT,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        selling_price INTEGER NOT NULL DEFAULT 0,
        shipping_price INTEGER NOT NULL DEFAULT 0,
        purchase_price INTEGER NOT NULL DEFAULT 0,
        total_price INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        comment_status TEXT,
        notes TEXT,
        assigned_to_id INTEGER REFERENCES public.users(id),
        assigned_at TIMESTAMP,
        confirmed_at TIMESTAMP,
        shipping_provider TEXT,
        track_number TEXT,
        source TEXT,
        upsell_product TEXT,
        upsell_quantity INTEGER DEFAULT 0,
        upsell_price INTEGER DEFAULT 0,
        product_id INTEGER REFERENCES public.products(id),
        variant_id INTEGER REFERENCES public.product_variants(id),
        offer_name TEXT,
        ameex_product_id TEXT,
        carrier_name TEXT,
        carrier_id INTEGER,
        driver_name TEXT DEFAULT '',
        driver_phone TEXT DEFAULT '',
        magasin_id INTEGER REFERENCES public.stores(id),
        last_action_at TIMESTAMP,
        last_action_by INTEGER REFERENCES public.users(id),
        scheduled_for TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] orders");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.store_integrations (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        provider TEXT NOT NULL,
        api_key TEXT,
        api_secret TEXT,
        store_url TEXT,
        webhook_secret TEXT,
        webhook_key TEXT,
        connection_name TEXT,
        orders_count INTEGER DEFAULT 0,
        magasin_id INTEGER REFERENCES public.stores(id),
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_expires_at TIMESTAMP,
        spreadsheet_id TEXT,
        spreadsheet_name TEXT,
        sync_tabs TEXT,
        last_sync_state JSONB,
        last_sync_at TIMESTAMP,
        gsheet_url TEXT,
        gsheet_id TEXT,
        gsheet_tabs JSONB,
        gsheet_sync_state JSONB DEFAULT '{}'::JSONB,
        gsheet_column_mapping JSONB DEFAULT NULL,
        status TEXT DEFAULT 'active',
        is_active INTEGER DEFAULT 1,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] store_integrations");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.store_agent_settings (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        agent_id INTEGER NOT NULL REFERENCES public.users(id),
        magasin_id INTEGER REFERENCES public.stores(id),
        lead_percentage INTEGER DEFAULT 0,
        role_in_store TEXT DEFAULT 'agent',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS store_agent_settings_agent_store_magasin_uniq
        ON public.store_agent_settings (agent_id, store_id, COALESCE(magasin_id, 0));
    `);
    console.log("[OK] store_agent_settings");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ad_spend (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        magasin_id INTEGER REFERENCES public.stores(id),
        date DATE NOT NULL,
        platform TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'MAD',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] ad_spend");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ad_spend_tracking (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        magasin_id INTEGER REFERENCES public.stores(id),
        date DATE NOT NULL,
        platform TEXT NOT NULL,
        campaign_id TEXT,
        campaign_name TEXT,
        spend INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        currency TEXT DEFAULT 'MAD',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] ad_spend_tracking");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.integration_logs (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        integration_id INTEGER,
        provider TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] integration_logs");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.action_tracking (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        order_id INTEGER REFERENCES public.orders(id),
        user_id INTEGER REFERENCES public.users(id),
        action TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] action_tracking");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.stock_movements (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES public.stores(id),
        product_id INTEGER REFERENCES public.products(id),
        variant_id INTEGER REFERENCES public.product_variants(id),
        order_id INTEGER REFERENCES public.orders(id),
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] stock_movements");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.carrier_accounts (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        carrier_name TEXT NOT NULL DEFAULT '',
        connection_name TEXT NOT NULL DEFAULT 'Connection 1',
        api_key TEXT NOT NULL DEFAULT '',
        api_secret TEXT,
        api_url TEXT,
        webhook_token TEXT NOT NULL DEFAULT '',
        store_name TEXT,
        carrier_store_name TEXT,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        assignment_rule TEXT DEFAULT 'default',
        assignment_data TEXT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[OK] carrier_accounts");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.carrier_cities (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        carrier_name TEXT NOT NULL,
        account_id INTEGER,
        cities JSONB NOT NULL DEFAULT '[]',
        city_count INTEGER DEFAULT 0,
        synced_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, carrier_name)
      );
    `);
    console.log("[OK] carrier_cities");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ameex_cities (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, external_id)
      );
    `);
    console.log("[OK] ameex_cities");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ozon_express_cities (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, external_id)
      );
    `);
    console.log("[OK] ozon_express_cities");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.express_coursier_cities (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        account_id INTEGER,
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, external_id)
      );
    `);
    console.log("[OK] express_coursier_cities");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON public.sessions(expire);
    `);
    console.log("[OK] sessions");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migration_state (
        key TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[OK] _migration_state");

    console.log("\nAll base tables created successfully!");
  } finally {
    client.release();
    await pool.end();
  }
}

createBaseTables().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});

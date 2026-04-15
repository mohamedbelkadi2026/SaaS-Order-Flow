import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await pool.query(`
    ALTER TABLE retargeting_leads ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP DEFAULT NOW();
  `);
  await pool.query(`
    ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS sender_device_id INTEGER;
  `);
  console.log("Migration done!");
  await pool.end();
}

migrate().catch(console.error);

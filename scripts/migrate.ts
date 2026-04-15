import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const migrations = [
    `ALTER TABLE retargeting_leads ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS sender_device_id INTEGER`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS rotation_enabled INTEGER DEFAULT 0`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log("OK:", sql.slice(0, 60));
    } catch (e: any) {
      console.error("FAILED:", sql.slice(0, 60), e.message);
    }
  }

  await pool.end();
  console.log("All migrations done!");
}

migrate().catch(console.error);

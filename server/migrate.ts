import pg from "pg";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const { Pool } = pg;

/**
 * Lightweight migration runner.
 *  - Reads every .sql file in /migrations sorted by filename
 *  - Applies any not yet recorded in public._migrations
 *  - Each migration runs inside its own transaction
 *  - Idempotent: re-running an already-applied migration is a no-op
 *  - Halts boot on failure so the previous deploy keeps serving traffic
 *
 * Naming convention: NNNN_description.sql (e.g. 0001_complete_schema_catchup.sql)
 */
export async function runMigrations(connectionString: string): Promise<void> {
  if (!connectionString) {
    throw new Error("[MIGRATE] DATABASE_URL is empty — cannot run migrations");
  }

  // Mirror the SSL detection used in server/db.ts so the runner behaves
  // identically against Railway / Neon / RDS (remote → SSL) and against
  // an in-cluster Postgres like helium (no SSL).
  const useSSL = isRemoteConnection(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    // Bootstrap the tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        id          serial PRIMARY KEY,
        filename    text   NOT NULL UNIQUE,
        applied_at  timestamp NOT NULL DEFAULT now(),
        checksum    text
      );
    `);

    const migrationsDir = join(process.cwd(), "migrations");
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort(); // lexicographic = numeric prefix order
    } catch (e: any) {
      if (e && e.code === "ENOENT") {
        console.log("[MIGRATE] No /migrations folder — skipping");
        return;
      }
      throw e;
    }

    if (files.length === 0) {
      console.log("[MIGRATE] No migration files to apply");
      return;
    }

    const { rows: applied } = await pool.query<{ filename: string }>(
      "SELECT filename FROM public._migrations"
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[MIGRATE] ✓ ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf-8");

      // Guardrail: the runner owns the transaction (it must commit the file's
      // statements + the _migrations insert atomically). A migration file that
      // declares its own BEGIN/COMMIT would close our transaction prematurely
      // — schema would commit before the tracking insert, and a failure of the
      // insert would leave the file applied-but-untracked → infinite re-run on
      // next boot. Reject the file before we touch the DB.
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
        throw new Error(
          `${file} contains a top-level BEGIN/COMMIT/ROLLBACK. ` +
          `Remove it — the runner already wraps each file in its own transaction.`
        );
      }

      console.log(`[MIGRATE] → Applying ${file} (${sql.length} bytes)…`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO public._migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`[MIGRATE] ✓ ${file} applied successfully`);
        count++;
      } catch (err: any) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[MIGRATE] ✗ ${file} FAILED — rolled back`);
        console.error(`[MIGRATE]   ${err?.message ?? err}`);
        throw err; // halt boot — do NOT start the server with a broken schema
      } finally {
        client.release();
      }
    }

    console.log(`[MIGRATE] Done. ${count} new migration(s) applied.`);
  } finally {
    await pool.end();
  }
}

function isRemoteConnection(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host.includes(".") && host !== "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Import Sendit cities + pricing from the official Excel file.
 *
 * What it does:
 *  1. Reads attached_assets/Villes_Sendit_Prix_Delais_*.xlsx
 *  2. Upserts every row into sendit_price_ref (global reference table, no store_id)
 *  3. Enriches all existing sendit_districts rows across every store by name_norm match
 *
 * Run once (or after updating the Excel):
 *   npx tsx scripts/import-sendit-cities-excel.ts
 *
 * The price columns also get applied automatically on each future API sync
 * because syncSenditDistricts calls applySenditPriceEnrichment() after inserting.
 */

import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { db, pool } from "../server/db";
import { senditDistricts, senditPriceRef } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Parse "35 DH" or "0 DH" or 35 → integer centimes (35 → 3500) */
function parseFee(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  if (isNaN(n)) return null;
  return Math.round(n * 100); // DH → centimes
}

// ── Locate Excel file ──────────────────────────────────────────────────────────

function findExcel(): string {
  const dir = path.resolve("attached_assets");
  const files = fs.readdirSync(dir).filter(f => f.includes("Villes_Sendit") && f.endsWith(".xlsx"));
  if (!files.length) {
    throw new Error(
      "Excel file not found. Expected a file matching Villes_Sendit*.xlsx in attached_assets/"
    );
  }
  // Pick the most recent one if several exist
  files.sort().reverse();
  const chosen = path.join(dir, files[0]);
  console.log(`[SENDIT-IMPORT] Using Excel: ${chosen}`);
  return chosen;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log("=== Import Sendit cities from Excel ===\n");

  // 1. Parse Excel
  const filePath = findExcel();
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

  console.log(`[SENDIT-IMPORT] ${rows.length} rows read from Excel`);

  // Build normalised records
  const records: Array<{
    name: string;
    nameNorm: string;
    price: number | null;
    delais: string | null;
    refusFee: number | null;
    cancelFee: number | null;
  }> = [];

  for (const row of rows) {
    const name = String(row["Ville"] ?? "").trim();
    if (!name) continue;

    const price    = parseFee(row["Prix (DH)"]);
    const delais   = String(row["Délais de livraison"] ?? "").trim() || null;
    const refusFee  = parseFee(row["Frais de refus"]);
    const cancelFee = parseFee(row["Frais d'annulation"]);

    records.push({ name, nameNorm: normalizeName(name), price, delais, refusFee, cancelFee });
  }

  // Deduplicate by name_norm (keep last occurrence — identical rows in Excel)
  const seen = new Map<string, typeof records[0]>();
  for (const r of records) seen.set(r.nameNorm, r);
  const unique = Array.from(seen.values());
  console.log(`[SENDIT-IMPORT] ${records.length} valid cities parsed → ${unique.length} unique (${records.length - unique.length} duplicate(s) removed)`);
  const deduped = unique;

  // 2. Upsert into sendit_price_ref (global reference)
  let refUpserted = 0;
  for (let i = 0; i < deduped.length; i += 100) {
    const batch = deduped.slice(i, i + 100);
    await db
      .insert(senditPriceRef)
      .values(batch)
      .onConflictDoUpdate({
        target: senditPriceRef.nameNorm,
        set: {
          name:      sql`EXCLUDED.name`,
          price:     sql`EXCLUDED.price`,
          delais:    sql`EXCLUDED.delais`,
          refusFee:  sql`EXCLUDED.refus_fee`,
          cancelFee: sql`EXCLUDED.cancel_fee`,
        },
      });
    refUpserted += batch.length;
  }
  console.log(`[SENDIT-IMPORT] ✅ sendit_price_ref: ${refUpserted} rows upserted`);

  // 3. Enrich all existing sendit_districts rows across all stores
  const result = await pool.query(`
    UPDATE sendit_districts sd
    SET
      price       = spr.price,
      delais      = spr.delais,
      refus_fee   = spr.refus_fee,
      cancel_fee  = spr.cancel_fee
    FROM sendit_price_ref spr
    WHERE sd.name_norm = spr.name_norm
  `);
  console.log(`[SENDIT-IMPORT] ✅ sendit_districts enriched: ${result.rowCount} row(s) updated across all stores`);

  // 4. Spot-check: Agadir
  const [agadir] = await db
    .select()
    .from(senditPriceRef)
    .where(eq(senditPriceRef.nameNorm, normalizeName("Agadir")));

  if (agadir) {
    const priceDH = agadir.price != null ? agadir.price / 100 : null;
    console.log(`\n[SENDIT-IMPORT] Spot-check Agadir: price=${priceDH} DH, delais="${agadir.delais}", refus=${agadir.refusFee != null ? agadir.refusFee/100 : null} DH, cancel=${agadir.cancelFee != null ? agadir.cancelFee/100 : null} DH`);
    if (priceDH !== 35) {
      console.warn(`[SENDIT-IMPORT] ⚠️  Expected price=35 DH for Agadir, got ${priceDH}`);
    } else {
      console.log("[SENDIT-IMPORT] ✅ Agadir price verified: 35 DH ✓");
    }
  } else {
    console.warn("[SENDIT-IMPORT] ⚠️  Agadir not found in sendit_price_ref — check city name in Excel");
  }

  console.log("\n=== Done ===");
  await pool.end();
}

run().catch(err => {
  console.error("[SENDIT-IMPORT] Fatal error:", err);
  process.exit(1);
});

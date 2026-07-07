/**
 * Backfill Express Coursier tracking + real status for orders stuck in "Confirmé".
 *
 * Context: parcels created directly at EC (not via the platform) have no trackNumber here.
 * This script reads an EC "Bon de Ramassage" CSV (tracking, phone, status, city, price),
 * matches each row to the most recent 'confirme' order with the same customer phone, then
 * attaches the tracking number and maps the French status label to an internal status.
 *
 * CSV expected at: attached_assets/ec-bons-backfill_1783438390877.csv
 * Columns: tracking, phone, status, city, price
 *
 * Usage:
 *   Dry-run:  node_modules/.bin/tsx scripts/backfill-ec-from-bons.ts
 *   Apply:    node_modules/.bin/tsx scripts/backfill-ec-from-bons.ts --apply
 *
 * Safety rules:
 *   - Never creates new orders.
 *   - Only updates orders whose status is 'confirme' or 'Confirmé'.
 *   - Prefers orders with an empty trackNumber; falls back to most recent.
 *   - Skips if the tracking number is already used by a different order.
 *   - Flags duplicate-phone rows in the CSV (reshipped parcels) in the output.
 *   - Dry-run prints full match table + summary; --apply writes to the DB.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { and, eq, desc, or } from "drizzle-orm";
import { db, pool } from "../server/db";
import { orders } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_PATH = path.join(
  __dirname, "..", "attached_assets", "ec-bons-backfill_1783438390877.csv"
);

// ── Phone normalization (mirrors storage.getActiveOrdersByPhone) ──────────────
function normalizePhone(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];
  const local = digits.startsWith("212")
    ? `0${digits.slice(3)}`
    : digits.startsWith("0") ? digits : `0${digits}`;
  const intl = digits.startsWith("212") ? digits : `212${local.slice(1)}`;
  return Array.from(new Set([digits, raw.trim(), local, intl, `+${intl}`]));
}

// ── French EC status label → internal status ──────────────────────────────────
// Spec mapping:
//   "livré"/"livree"/"delivered"                       → delivered
//   "refusé"/"refuse"/"retour"/"annul"                 → refused
//   everything else (en cours, recu, transport,
//     reporte, ramasse, en attente)                    → in_progress
function mapBonStatus(raw: string): string {
  // Strip accents then lowercase for robust matching
  const s = (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (s.includes("livr") || s.includes("deliver")) return "delivered";
  if (
    s.includes("refus") ||
    s.includes("retour") ||
    s.includes("annul")
  ) return "refused";
  return "in_progress";
}

// ── CSV parser ────────────────────────────────────────────────────────────────
interface CsvRow {
  tracking: string;
  phone: string;
  rawStatus: string;
  city: string;
  price: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV is empty or has only a header");

  const cols = lines[0].split(",").map(c => c.trim().toLowerCase());
  const get = (parts: string[], col: string) =>
    (parts[cols.indexOf(col)] || "").trim().replace(/^["']|["']$/g, "");

  return lines.slice(1).map(line => {
    const parts = line.split(",");
    return {
      tracking:  get(parts, "tracking"),
      phone:     get(parts, "phone"),
      rawStatus: get(parts, "status"),
      city:      get(parts, "city"),
      price:     get(parts, "price"),
    };
  }).filter(r => r.tracking && r.phone);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const divider = "═".repeat(60);
  console.log(`\n${divider}`);
  console.log(`  EC Bons Backfill — ${APPLY ? "⚡ APPLY MODE (writing to DB)" : "🔍 DRY-RUN (no writes)"}`);
  console.log(`${divider}\n`);

  // ── Load CSV ────────────────────────────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  const rows = parseCsv(CSV_PATH);
  console.log(`📄 CSV rows loaded: ${rows.length}\n`);

  // ── Flag duplicate phones (reshipped parcels) ───────────────────────────────
  const phoneCount: Record<string, number> = {};
  for (const r of rows) {
    const key = r.phone.replace(/\D/g, "");
    phoneCount[key] = (phoneCount[key] || 0) + 1;
  }
  const dupPhoneKeys = Object.entries(phoneCount)
    .filter(([, n]) => n > 1)
    .map(([p]) => p);

  if (dupPhoneKeys.length > 0) {
    console.log(`⚠️  Duplicate phones in CSV — these are likely reshipped parcels.`);
    console.log(`   The most recent 'confirme' order will be matched for each row.\n`);
    for (const key of dupPhoneKeys) {
      const dupes = rows.filter(r => r.phone.replace(/\D/g, "") === key);
      for (const d of dupes) {
        console.log(`   📱 ${d.phone}  →  ${d.tracking}  (${d.rawStatus})`);
      }
    }
    console.log();
  }

  // ── Process each CSV row ────────────────────────────────────────────────────
  let matched = 0;
  let skipped = 0;
  const sampleRows: Array<{
    phone: string; orderNumber: string; tracking: string;
    mappedStatus: string; rawStatus: string;
  }> = [];

  for (const row of rows) {
    const isDupPhone = dupPhoneKeys.includes(row.phone.replace(/\D/g, ""));
    const variants = normalizePhone(row.phone);
    if (!variants.length) {
      console.log(`  ⚪ SKIP   [bad phone]  ${row.phone}  →  ${row.tracking}`);
      skipped++;
      continue;
    }

    // Find most recent confirme orders that match any phone variant
    const phoneConditions = variants.map(v => eq(orders.customerPhone, v));
    const candidates = await db.select().from(orders)
      .where(
        and(
          or(...phoneConditions),
          or(
            eq(orders.status, "confirme"),
            eq(orders.status, "Confirmé"),
          )
        )
      )
      .orderBy(desc(orders.createdAt))
      .limit(20);

    if (candidates.length === 0) {
      console.log(`  ⚪ SKIP   ${row.phone}${isDupPhone ? " [dup]" : ""}  — no confirme order found`);
      skipped++;
      continue;
    }

    // Prefer order with empty trackNumber (not yet assigned); else take most recent
    const target = candidates.find(o => !o.trackNumber) ?? candidates[0];

    // Guard: skip if this tracking number is already on a different order
    const [dupTrack] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.trackNumber, row.tracking))
      .limit(1);

    if (dupTrack && dupTrack.id !== target.id) {
      console.log(
        `  ⚪ SKIP   ${row.phone}  (#${target.orderNumber}) — tracking already on order #${dupTrack.id}`
      );
      skipped++;
      continue;
    }

    const mappedStatus = mapBonStatus(row.rawStatus);
    const dupLabel = isDupPhone ? " [dup-phone]" : "";
    console.log(
      `  ✅ MATCH  ${row.phone}${dupLabel}  →  #${target.orderNumber}  →  ${row.tracking}  →  ${mappedStatus}  (${row.rawStatus})`
    );
    matched++;

    if (sampleRows.length < 10) {
      sampleRows.push({
        phone: row.phone,
        orderNumber: target.orderNumber || String(target.id),
        tracking: row.tracking,
        mappedStatus,
        rawStatus: row.rawStatus,
      });
    }

    if (APPLY) {
      await db.update(orders)
        .set({
          trackNumber:      row.tracking,
          shippingProvider: "expresscoursier",
          carrierName:      "expresscoursier",
          status:           mappedStatus,
          commentStatus:    row.rawStatus,
        } as any)
        .where(eq(orders.id, target.id));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const thin = "─".repeat(60);
  console.log(`\n${thin}`);
  console.log(`  Total CSV rows    : ${rows.length}`);
  console.log(`  ✅ Matched         : ${matched}  (would be / were updated)`);
  console.log(`  ⚪ Skipped         : ${skipped}  (no match / tracking conflict / bad phone)`);
  if (dupPhoneKeys.length > 0) {
    console.log(`  ⚠️  Dup-phone rows  : ${rows.filter(r => dupPhoneKeys.includes(r.phone.replace(/\D/g, ""))).length}`);
  }
  console.log(`${thin}`);

  if (sampleRows.length > 0) {
    console.log(`\n  Sample (up to 10 matched rows):`);
    console.log(`  ${"Phone".padEnd(15)}  ${"Order".padEnd(12)}  ${"Tracking".padEnd(42)}  ${"→".padEnd(2)}  Status`);
    for (const s of sampleRows) {
      console.log(
        `  ${s.phone.padEnd(15)}  ${s.orderNumber.padEnd(12)}  ${s.tracking.padEnd(42)}  →  ${s.mappedStatus}  (${s.rawStatus})`
      );
    }
  }

  if (!APPLY) {
    console.log(`\n  This was a DRY-RUN. No data was written.`);
    console.log(`  Run with --apply to commit changes to the database.\n`);
  } else {
    console.log(`\n  ✅ All matched orders updated in the database.\n`);
  }

  await pool.end();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

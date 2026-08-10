/**
 * One-shot Ameex carrier correction — runs at server startup when
 * RUN_AMEEX_CARRIER_CORRECTION is set as a Railway environment variable.
 *
 *   RUN_AMEEX_CARRIER_CORRECTION=1      → dry-run (logs, no writes)
 *   RUN_AMEEX_CARRIER_CORRECTION=apply  → writes corrections
 *
 * After it fires, remove the env var so it never runs again.
 *
 * WHAT IT CORRECTS
 * ─────────────────
 * Orders where shippingProvider/carrierName is wrong (e.g. 'expresscoursier')
 * but the tracking code belongs to Ameex. Detection methods (any one match):
 *
 *  A) Tracking code appears in integration_logs with provider='ameex' or
 *     'olivraison' and action='webhook_received' (most reliable — a real
 *     Ameex webhook was received for that code).
 *
 *  B) Tracking code is one of the 30 known Ameex codes applied by the CSV
 *     backfill (hardcoded list).
 *
 *  C) Tracking code matches the Ameex barcode pattern for this store's
 *     account: contains 'B27347' (all 30 CSV codes share this account-ID
 *     segment — catches any others we might have missed).
 *
 * Only corrects orders where the carrier is WRONG (expresscoursier, olivraison,
 * or blank) — never touches orders already set to 'ameex'.
 */

import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "../shared/schema";

// ── Known Ameex tracking codes (from the CSV backfill) ────────────────────────
const KNOWN_AMEEX_CODES = new Set([
  "ODL0726B27347KY3194798",
  "TAT0726B27347SR4229698",
  "CSA0726B27347MJ2229698",
  "TMR0726B27347XF8390798",
  "LTA0726B27347IT1185798",
  "SAB0726B27347VL1344898",
  "MRK0726B27347PO1166898",
  "AHC0726B27347FR5229698",
  "CSA0726B27347EM3185798",
  "NDR0726B27347RC7560798",
  "AGA0726B27347AP6805798",
  "CSA0726B27347RW1490798",
  "TRI0726B27347NL0490798",
  "TGR0726B27347BO9390798",
  "AGA0726B27347MC7117798",
  "RBT0726B27347CW5705798",
  "OJD0726B27347NG5390798",
  "EJD0726B27347DQ9094798",
  "NKB0726B27347XN8007898",
  "EKB0726B27347KV6117798",
  "ZGR0726B27347AP8749798",
  "SKOURA0726B27347YJ7749798",
  "KTR0726B27347YA6549798",
  "TGR0726B27347EV8166898",
  "CSA0726B27347HN2344898",
  "MRK0726B27347WV4166898",
  "CSA0726B27347WS9027898",
  "KTL0726B27347CD6838898",
  "MRK0726B27347FK6907898",
  "NDR0726B27347IP9738898",
]);

// Carriers that are definitely NOT Ameex (whitelist of wrong carriers to fix)
const WRONG_EC_CARRIERS = new Set([
  "expresscoursier", "express coursier", "olivraison",
  "expresscoursier ", "express coursier ",
]);

function isWrongCarrier(provider: string | null | undefined): boolean {
  if (!provider) return true; // blank carrier also needs fixing if code is Ameex
  return WRONG_EC_CARRIERS.has((provider || "").toLowerCase().trim());
}

function isKnownAmeexCode(code: string): boolean {
  if (!code) return false;
  // Method B: exact match against known codes
  if (KNOWN_AMEEX_CODES.has(code)) return true;
  // Method C: Ameex barcode pattern — account ID segment present
  if (code.toUpperCase().includes("B27347")) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function runAmeexCarrierCorrection(): Promise<void> {
  const applyMode = process.env.RUN_AMEEX_CARRIER_CORRECTION === "apply";
  const tag       = "[AMEEX-CARRIER-FIX]";

  console.log(`${tag} ========== START (mode=${applyMode ? "APPLY" : "DRY-RUN"}) ==========`);

  // ── Step 1: Find all orders whose carrier is wrong (EC / blank) and have a
  //           real (non-AMEEX-PENDING) tracking code ─────────────────────────
  const candidates = await db.execute(sql`
    SELECT
      o.id,
      o.store_id         AS "storeId",
      o.order_number     AS "orderNumber",
      o.track_number     AS "trackNumber",
      o.shipping_provider AS "shippingProvider",
      o.carrier_name     AS "carrierName",
      o.status
    FROM orders o
    WHERE
      o.track_number IS NOT NULL
      AND o.track_number NOT LIKE 'AMEEX-PENDING-%'
      AND o.track_number != ''
      AND (
        o.shipping_provider IS NULL
        OR o.shipping_provider = ''
        OR LOWER(o.shipping_provider) IN ('expresscoursier','express coursier','olivraison')
        OR o.carrier_name IS NULL
        OR o.carrier_name = ''
        OR LOWER(o.carrier_name) IN ('expresscoursier','express coursier','olivraison')
      )
    ORDER BY o.id
  `) as any;

  const rows: any[] = Array.isArray(candidates) ? candidates : (candidates as any).rows ?? [];
  console.log(`${tag} Candidate orders (wrong/blank carrier + real track code): ${rows.length}`);

  // ── Step 2: Load all Ameex webhook log codes (method A) ───────────────────
  // Get every unique tracking code that received a real Ameex webhook event.
  const ameexWebhookLogs = await db
    .select({
      payload: schema.integrationLogs.payload,
      message: schema.integrationLogs.message,
    })
    .from(schema.integrationLogs)
    .where(
      and(
        inArray(schema.integrationLogs.provider, ["ameex", "olivraison"]),
        eq(schema.integrationLogs.action, "webhook_received"),
      )
    )
    .orderBy(desc(schema.integrationLogs.createdAt))
    .limit(2000) as any[];

  // Parse each log to extract the tracking code
  const ameexWebhookCodes = new Set<string>();
  for (const row of ameexWebhookLogs) {
    let code = "";
    if (row.payload) {
      try {
        const p = JSON.parse(row.payload);
        if (p.code_colis || p.event === "package_updated") {
          let nested: any = {};
          if (p.payload) {
            try { nested = typeof p.payload === "object" ? p.payload : JSON.parse(String(p.payload)); } catch { /**/ }
          }
          code = (nested.order_id || p.code_colis || "").toString().trim();
        } else {
          code = (p.CODE || "").toString().trim();
        }
      } catch { /**/ }
    }
    if (!code && row.message) {
      const m = row.message.match(/CODE=([^\s]+)/);
      if (m?.[1]) code = m[1].trim();
    }
    if (code) ameexWebhookCodes.add(code.toUpperCase());
  }
  console.log(`${tag} Ameex webhook-confirmed codes: ${ameexWebhookCodes.size}`);

  // ── Step 3: Decide which candidates are actually Ameex ────────────────────
  type CorrectionRow = {
    orderId:      number;
    storeId:      number;
    orderNumber:  string;
    trackNumber:  string;
    wrongCarrier: string;
    detectedBy:   string;
  };

  const toFix: CorrectionRow[] = [];

  for (const row of rows) {
    const code         = (row.trackNumber || "").trim();
    const codeUpper    = code.toUpperCase();
    const wrongCarrier = (row.shippingProvider || row.carrierName || "").trim() || "(none)";

    // Method A — confirmed by a real Ameex webhook event
    if (ameexWebhookCodes.has(codeUpper)) {
      toFix.push({ orderId: row.id, storeId: row.storeId, orderNumber: row.orderNumber, trackNumber: code, wrongCarrier, detectedBy: "webhook_log" });
      continue;
    }
    // Method B + C — known codes or barcode pattern
    if (isKnownAmeexCode(code)) {
      toFix.push({ orderId: row.id, storeId: row.storeId, orderNumber: row.orderNumber, trackNumber: code, wrongCarrier, detectedBy: isKnownAmeexCode(code) ? "known_code_or_pattern" : "pattern" });
    }
  }

  // ── Step 4: Print dry-run table ───────────────────────────────────────────
  console.log(`\n${tag} ─── DRY-RUN CORRECTION LIST (${toFix.length} orders) ─────────────────────`);
  console.log(`${tag}   ${"orderNum".padEnd(10)} ${"store".padEnd(6)} ${"wrongCarrier".padEnd(20)} ${"detectedBy".padEnd(20)} trackNumber`);
  console.log(`${tag}   ${"-".repeat(90)}`);
  for (const r of toFix) {
    console.log(`${tag}   #${String(r.orderNumber).padEnd(9)} s${String(r.storeId).padEnd(5)} ${r.wrongCarrier.padEnd(20)} ${r.detectedBy.padEnd(20)} ${r.trackNumber}`);
  }
  console.log(`${tag} ─────────────────────────────────────────────────────────────────────────────`);
  console.log(`${tag} Total to correct: ${toFix.length}  |  mode: ${applyMode ? "APPLY" : "DRY-RUN (set =apply to write)"}\n`);

  if (toFix.length === 0) {
    console.log(`${tag} ✅ Nothing to fix — all orders have correct carrier.`);
    console.log(`${tag} ========== DONE ==========`);
    return;
  }

  if (!applyMode) {
    console.log(`${tag} DRY-RUN complete. Set RUN_AMEEX_CARRIER_CORRECTION=apply to apply.`);
    console.log(`${tag} ========== DONE (dry-run) ==========`);
    return;
  }

  // ── Step 5: Apply corrections ─────────────────────────────────────────────
  console.log(`${tag} Applying ${toFix.length} carrier corrections…`);
  let applied = 0;

  for (const r of toFix) {
    await db
      .update(schema.orders)
      .set({ shippingProvider: "ameex", carrierName: "ameex" } as any)
      .where(eq(schema.orders.id, r.orderId));

    await db.insert(schema.orderFollowUpLogs).values({
      orderId:   r.orderId,
      agentId:   null,
      agentName: "Ameex Carrier Correction",
      note:      `Carrier corrected: ${r.wrongCarrier} => ameex (trackNumber=${r.trackNumber}, detectedBy=${r.detectedBy})`,
    } as any);

    console.log(`${tag}   FIXED #${r.orderNumber} (s${r.storeId}) ${r.wrongCarrier} => ameex  [${r.trackNumber}]`);
    applied++;
  }

  console.log(`\n${tag} ========== DONE — corrected=${applied}/${toFix.length} ==========`);
}

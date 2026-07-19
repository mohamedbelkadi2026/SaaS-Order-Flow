/**
 * One-time backfill: recover real Ameex tracking codes for orders stuck on
 * AMEEX-PENDING-TJG-<orderNumber> placeholders.
 *
 * HOW IT WORKS
 * ────────────
 * Phase 1 — Log recovery (no external API call):
 *   Every successful Ameex shipment writes a [AMEEX-FULL-RESPONSE] line to
 *   integration_logs. The body contains api.data.code — the real Ameex barcode.
 *   We parse every such log entry to build: orderNumber → realCode.
 *   For orders with multiple entries (retries) we keep the LATEST.
 *
 * Phase 2 — Status enrichment:
 *   After setting the real code we also apply the latest known webhook status
 *   for that code (if any stored Ameex webhook event matches it).
 *   If none exist, we leave status alone — the next real webhook will match now.
 *
 * Phase 3 — Fallback via Ameex parcel-list API (phone matching):
 *   For orders still unresolved after Phase 1 (no logged response found),
 *   we call the Ameex parcel-list API and match by normalized recipient phone.
 *   Unique phone match → assign. Ambiguous → skip (reported).
 *
 * SAFETY
 * ──────
 * • Dry-run by default — prints what it WOULD do, writes nothing.
 * • Never overwrites a trackNumber that is already a real (non-placeholder) code.
 * • Phase-3 phone matching is unique-only (no guessing).
 *
 * USAGE
 * ─────
 *   npx tsx scripts/backfill-ameex-real-codes.ts           # dry-run
 *   npx tsx scripts/backfill-ameex-real-codes.ts --apply   # write changes
 *   npx tsx scripts/backfill-ameex-real-codes.ts --store 7 # limit to one store
 */

import { and, desc, eq, like, sql } from "drizzle-orm";
import axios from "axios";
import https from "https";
import FormData from "form-data";
import { db, pool } from "../server/db";
import { orders, integrationLogs, storeIntegrations } from "@shared/schema";
import { AMEEX_STATUS_MAP } from "../server/services/carrier-service";

const APPLY     = process.argv.includes("--apply");
const storeArg  = process.argv.find(a => a.startsWith("--store=") || a.startsWith("--store "));
const STORE_ID  = storeArg ? parseInt(storeArg.replace(/--store[= ]/, ""), 10) : null;

const SSL_AGENT = new https.Agent({ rejectUnauthorized: false });

// ─── helpers ──────────────────────────────────────────────────────────────────

function normPhone(p: string): string {
  let s = String(p || "").replace(/[\s\-().+]/g, "");
  if (s.startsWith("00212"))              s = "0" + s.slice(5);
  else if (s.startsWith("212") && s.length === 12) s = "0" + s.slice(3);
  return s;
}

function normName(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/** Extract api.data.code (or fallbacks) from an Ameex ship response body. */
function extractAmeexCode(rb: any): string | undefined {
  if (!rb || typeof rb !== "object") return undefined;
  const code =
    rb?.api?.data?.code     ||
    rb?.api?.data?.tracking ||
    rb?.api?.data?.barcode  ||
    rb?.data?.code          ||
    rb?.code;
  return code ? String(code).trim() : undefined;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Ameex PENDING backfill — ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no changes)"}`);
  if (STORE_ID) console.log(`  Scope: store ${STORE_ID} only`);
  console.log(`${"=".repeat(70)}\n`);

  // ── 0. Load all stores that have an Ameex account ─────────────────────────
  const ameexAccounts = await db
    .select()
    .from(storeIntegrations)
    .where(eq(storeIntegrations.provider, "ameex"));

  const storeIds = STORE_ID
    ? [STORE_ID]
    : [...new Set(ameexAccounts.map(a => a.storeId))];

  console.log(`Stores with Ameex accounts: ${storeIds.join(", ")}\n`);

  // Aggregate totals across all stores
  let grandTotal    = 0;
  let grandPhase1   = 0;
  let grandPhase3   = 0;
  let grandNoLog    = 0;
  let grandApplied  = 0;

  for (const storeId of storeIds) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Store ${storeId}`);
    console.log(`${"─".repeat(60)}\n`);

    // ── 1. Load AMEEX-PENDING orders for this store ────────────────────────
    const pendingRows = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        like(orders.trackNumber, "AMEEX-PENDING-%"),
      ));

    console.log(`  AMEEX-PENDING orders: ${pendingRows.length}`);
    grandTotal += pendingRows.length;
    if (pendingRows.length === 0) { console.log("  (nothing to do)\n"); continue; }

    // Build lookup: orderNumber (string) → order row
    const pendingByOrderNum = new Map<string, typeof pendingRows[0]>();
    for (const o of pendingRows) {
      pendingByOrderNum.set(String(o.orderNumber), o);
      // Also index by the number embedded in the placeholder
      const m = String(o.trackNumber || "").match(/AMEEX-PENDING-TJG-(.+)/);
      if (m && m[1] !== String(o.orderNumber)) pendingByOrderNum.set(m[1], o);
    }

    // ── 2. Phase 1 — scan integration_logs for ship responses ─────────────
    // Match: provider='ameex' AND (message contains AMEEX-FULL-RESPONSE OR payload has api.data.code).
    // We load all ameex logs (up to 5000) descending, so first match per orderNumber = latest.
    const ameexLogs = await db
      .select()
      .from(integrationLogs)
      .where(and(
        eq(integrationLogs.storeId, storeId),
        eq(integrationLogs.provider, "ameex"),
      ))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(5000);

    console.log(`  integration_logs (ameex): ${ameexLogs.length} entries`);

    // Build: orderNumber → { realCode, logId }
    const phase1Map = new Map<string, { realCode: string; logId: number; source: string }>();

    for (const row of ameexLogs) {
      // Try to extract orderNumber from message line: "order=XXXX"
      const msg = row.message || "";
      let orderNumFromMsg = "";
      const orderM = msg.match(/order[=:](\S+)/i);
      if (orderM) orderNumFromMsg = orderM[1].replace(/[^a-zA-Z0-9\-_]/g, "");

      // Try to parse real code from message body= section
      let realCodeFromMsg = "";
      const bodyM = msg.match(/body=(\{.+)/);
      if (bodyM) {
        try {
          const rb = JSON.parse(bodyM[1]);
          realCodeFromMsg = extractAmeexCode(rb) || "";
        } catch { /* ignore */ }
      }

      // Try to parse from payload JSON
      let orderNumFromPayload = "";
      let realCodeFromPayload = "";
      if (row.payload) {
        try {
          const p = JSON.parse(row.payload);
          if (p.orderNumber)  orderNumFromPayload = String(p.orderNumber);
          if (p.order_number) orderNumFromPayload = String(p.order_number);
          // Placeholder in payload
          if (!orderNumFromPayload && p.trackNumber) {
            const pm = String(p.trackNumber).match(/AMEEX-PENDING-TJG-(.+)/);
            if (pm) orderNumFromPayload = pm[1];
          }
          // Real code from rawResponse or root
          const rb = p.rawResponse || p.response || p.body || p;
          realCodeFromPayload = extractAmeexCode(rb) || "";
        } catch { /* ignore */ }
      }

      // Also check if message embeds a placeholder
      if (!orderNumFromMsg) {
        const pm = msg.match(/AMEEX-PENDING-TJG-([^\s,"']+)/);
        if (pm) orderNumFromMsg = pm[1];
      }

      const orderNum = orderNumFromMsg || orderNumFromPayload;
      const realCode = realCodeFromMsg || realCodeFromPayload;

      if (orderNum && realCode && !phase1Map.has(orderNum)) {
        phase1Map.set(orderNum, { realCode, logId: row.id, source: realCodeFromMsg ? "message.body" : "payload.api.data.code" });
      }
    }

    console.log(`  Phase 1: ${phase1Map.size} (orderNumber → realCode) pairs extracted from logs`);

    // ── 3. Also load latest webhook events so we can apply status ──────────
    // provider='ameex', action='webhook_received' — group by code, keep latest
    const webhookLogs = ameexLogs.filter(r => r.action === "webhook_received");
    const latestWebhookByCode = new Map<string, string>(); // realCode → AMEEX status string

    for (const row of webhookLogs) {
      if (!row.payload) continue;
      try {
        const p = JSON.parse(row.payload);
        let code = "";
        let statut = "";
        if (p.code_colis || p.event === "package_updated") {
          let nested: any = {};
          if (typeof p.payload === "object" && p.payload) nested = p.payload;
          else if (typeof p.payload === "string") try { nested = JSON.parse(p.payload); } catch {}
          code  = (nested.order_id || p.code_colis || "").toString().trim();
          const rs = nested.return_status === true;
          statut = rs ? "RETURNED" : (nested.status || "").toString().trim().toUpperCase();
        } else {
          code   = (p.CODE || "").toString().trim();
          statut = (p.STATUT || "").toString().trim().toUpperCase();
        }
        if (code && statut && !latestWebhookByCode.has(code)) {
          latestWebhookByCode.set(code, statut);
        }
      } catch { /* ignore */ }
    }

    // ── 4. Resolve Phase 1 matches ─────────────────────────────────────────
    type Match = {
      order:      typeof pendingRows[0];
      realCode:   string;
      source:     string;
      ameexStatut?: string;
      mappedStatus?: string;
    };

    const phase1Matches: Match[] = [];
    const remaining: typeof pendingRows[0][] = [];

    for (const order of pendingRows) {
      const orderNum = String(order.orderNumber);
      const candidate = phase1Map.get(orderNum)
        ?? phase1Map.get(String(order.trackNumber || "").replace(/AMEEX-PENDING-TJG-/, ""));

      if (candidate) {
        const ameexStatut = latestWebhookByCode.get(candidate.realCode);
        const mappedStatus = ameexStatut ? (AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress") : undefined;
        phase1Matches.push({ order, realCode: candidate.realCode, source: candidate.source, ameexStatut, mappedStatus });
      } else {
        remaining.push(order);
      }
    }

    console.log(`\n  Phase 1 matches : ${phase1Matches.length}`);
    console.log(`  Still pending   : ${remaining.length}`);
    grandPhase1 += phase1Matches.length;

    // Print Phase 1 examples (up to 10)
    const p1Examples = phase1Matches.slice(0, 10);
    if (p1Examples.length) {
      console.log("\n  Phase 1 examples (orderNumber → placeholder → realCode [→ status]):");
      for (const m of p1Examples) {
        const statusPart = m.ameexStatut ? ` → ${m.ameexStatut} (${m.mappedStatus})` : "";
        console.log(`    #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode}${statusPart}  [${m.source}]`);
      }
      if (phase1Matches.length > 10) console.log(`    … and ${phase1Matches.length - 10} more`);
    }

    // ── 5. Phase 3 — Ameex parcel-list API for remaining orders ───────────
    const phase3Matches: Match[] = [];
    const noMatch:  typeof pendingRows[0][] = [];

    if (remaining.length > 0) {
      console.log(`\n  Phase 3: probing Ameex parcel-list API for ${remaining.length} unresolved orders…`);

      const account = ameexAccounts.find(a => a.storeId === storeId);
      const stripHtml = (s: string) => (s || "").replace(/<[^>]*>/g, "").trim();
      const apiKey   = account ? stripHtml((account as any).apiKey || "") : "";
      const apiId    = account ? stripHtml((account as any).apiSecret || (account as any).storeName || "") : "";

      if (!apiKey) {
        console.log("  ⚠️  No Ameex API key found for this store — skipping Phase 3.");
        noMatch.push(...remaining);
      } else {
        const reqHeaders: Record<string, string> = {
          "C-Api-Key": apiKey, "C-Api-Id": apiId, "Accept": "application/json",
        };
        const business = apiId || "";
        const CANDIDATE_URLS = [
          "https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Get",
          "https://api.ameex.app/customer/Delivery/Parcels/Action/Type/GetAll",
          "https://api.ameex.app/customer/Delivery/Parcels/Action/Type/List",
          "https://api.ameex.app/customer/Delivery/Parcels",
          "https://api.ameex.app/customer/Delivery/Parcels/List",
          "https://api.ameex.app/customer/Parcels/Action/Type/Get",
        ];

        let parcelsRaw: any = null;
        let workingUrl = "";

        for (const url of CANDIDATE_URLS) {
          for (const method of ["get", "post"] as const) {
            try {
              let r: any;
              const opts = { headers: reqHeaders, timeout: 20_000, httpsAgent: SSL_AGENT, validateStatus: () => true };
              if (method === "get") {
                r = await axios.get(url, { ...opts, params: business ? { business } : {} });
              } else {
                const fd = new FormData();
                if (business) fd.append("business", business);
                r = await axios.post(url, fd, { ...opts, headers: { ...reqHeaders, ...fd.getHeaders() } });
              }
              process.stdout.write(`    ${method.toUpperCase()} ${url} → HTTP ${r.status}\n`);
              if (r.status === 200 && r.data && typeof r.data === "object" && Object.keys(r.data).length > 0) {
                parcelsRaw = r.data; workingUrl = `${method.toUpperCase()} ${url}`; break;
              }
            } catch (e: any) { process.stdout.write(`    ${method.toUpperCase()} ${url} → Error: ${e.message}\n`); }
          }
          if (parcelsRaw) break;
        }

        if (!parcelsRaw) {
          console.log("  ⚠️  No Ameex parcel-list endpoint responded — Phase 3 skipped.");
          noMatch.push(...remaining);
        } else {
          console.log(`  ✅ Parcel list via: ${workingUrl}`);

          // Parse parcel list
          let arr: any[] = [];
          if      (Array.isArray(parcelsRaw))              arr = parcelsRaw;
          else if (Array.isArray(parcelsRaw.data))         arr = parcelsRaw.data;
          else if (Array.isArray(parcelsRaw.parcels))      arr = parcelsRaw.parcels;
          else if (Array.isArray(parcelsRaw.items))        arr = parcelsRaw.items;
          else if (Array.isArray(parcelsRaw.result))       arr = parcelsRaw.result;
          else if (typeof parcelsRaw === "object") {
            const vals = Object.values(parcelsRaw);
            if (vals.length > 0 && typeof vals[0] === "object") arr = vals as any[];
          }

          type AmeexParcel = { trackingCode: string; phone: string; name: string; city: string; status: string };
          const parcels: AmeexParcel[] = arr.map((item: any) => ({
            trackingCode: String(item.tracking_code || item.trackingCode || item.order_id || item.code || item.barcode || item.CODE || "").trim(),
            phone:  String(item.phone || item.telephone || item.recipient_phone || item.Phone || item.PHONE || item.tel || "").trim(),
            name:   String(item.receiver || item.recipient || item.recipient_name || item.name || item.destinataire || item.nom || item.customer_name || "").trim(),
            city:   String(item.city || item.ville || item.City || item.CITY || "").trim(),
            status: String(item.status || item.statut || item.STATUS || item.STATUT || item.state || "").trim().toUpperCase(),
          })).filter((p: AmeexParcel) => p.trackingCode);

          console.log(`  Parsed ${parcels.length} parcels from API`);

          // Index by normalized phone
          const byPhone = new Map<string, AmeexParcel[]>();
          for (const p of parcels) {
            const norm = normPhone(p.phone);
            if (!norm) continue;
            if (!byPhone.has(norm)) byPhone.set(norm, []);
            byPhone.get(norm)!.push(p);
          }

          for (const order of remaining) {
            const phone = normPhone(order.customerPhone || "");
            const candidates = phone ? (byPhone.get(phone) || []) : [];

            if (candidates.length === 1) {
              const parcel = candidates[0];
              const ameexStatut = parcel.status;
              const mappedStatus = AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress";
              phase3Matches.push({ order, realCode: parcel.trackingCode, source: "api:phone", ameexStatut, mappedStatus });
            } else if (candidates.length > 1) {
              // Try to narrow by name/city
              const nameNorm = normName(order.customerName || "");
              const cityNorm = normName((order as any).city || "");
              const firstToken = nameNorm.split(" ")[0] || "";
              const narrowed = candidates.filter(c => {
                const cn = normName(c.name); const cc = normName(c.city);
                return (firstToken && cn.includes(firstToken)) || (cityNorm && cc === cityNorm);
              });
              if (narrowed.length === 1) {
                const parcel = narrowed[0];
                const ameexStatut = parcel.status;
                const mappedStatus = AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress";
                phase3Matches.push({ order, realCode: parcel.trackingCode, source: "api:phone+name/city", ameexStatut, mappedStatus });
              } else {
                noMatch.push(order); // ambiguous — skip
              }
            } else {
              noMatch.push(order);
            }
          }
        }
      }

      console.log(`  Phase 3 matches : ${phase3Matches.length}`);
      console.log(`  No match        : ${noMatch.length}`);
      grandPhase3 += phase3Matches.length;

      if (phase3Matches.length > 0) {
        console.log("\n  Phase 3 examples:");
        for (const m of phase3Matches.slice(0, 10)) {
          console.log(`    #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode} [${m.ameexStatut}→${m.mappedStatus}]  [${m.source}]`);
        }
      }
    } else {
      noMatch.push(...remaining);
    }

    grandNoLog += noMatch.length;

    if (noMatch.length > 0) {
      console.log("\n  Unresolved (no log + no API match) — attach manually:");
      for (const o of noMatch.slice(0, 20)) {
        console.log(`    #${o.orderNumber}: ${o.trackNumber}  phone=${o.customerPhone || "(none)"}`);
      }
      if (noMatch.length > 20) console.log(`    … and ${noMatch.length - 20} more`);
    }

    // ── 6. Apply ──────────────────────────────────────────────────────────
    const allMatches = [...phase1Matches, ...phase3Matches];

    if (APPLY) {
      const TERMINAL = new Set(["delivered", "refused", "retourné"]);
      let applied = 0;
      for (const m of allMatches) {
        try {
          // Guard: never overwrite a real (non-placeholder) trackNumber
          if (!String(m.order.trackNumber || "").startsWith("AMEEX-PENDING-")) {
            console.log(`    SKIP #${m.order.orderNumber} — trackNumber already real: ${m.order.trackNumber}`);
            continue;
          }
          await db.update(orders)
            .set({ trackNumber: m.realCode })
            .where(eq(orders.id, m.order.id));

          // Status enrichment (only if we have a known status and it's not a downgrade)
          if (m.mappedStatus && m.ameexStatut) {
            const currentStatus = m.order.status || "";
            if (!(TERMINAL.has(currentStatus) && !TERMINAL.has(m.mappedStatus))) {
              await db.update(orders)
                .set({ status: m.mappedStatus, commentStatus: m.ameexStatut } as any)
                .where(eq(orders.id, m.order.id));
            }
          }

          applied++;
          grandApplied++;
          console.log(`    ✅ #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode}${m.ameexStatut ? " (" + m.ameexStatut + "→" + m.mappedStatus + ")" : ""}`);
        } catch (e: any) {
          console.error(`    ❌ #${m.order.orderNumber}: ${e?.message}`);
        }
      }
      console.log(`\n  Applied: ${applied}/${allMatches.length}`);
    }
  } // end store loop

  // ── Grand summary ──────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  GRAND SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(`  Total AMEEX-PENDING orders  : ${grandTotal}`);
  console.log(`  Recoverable from logs       : ${grandPhase1}`);
  console.log(`  Recoverable via API         : ${grandPhase3}`);
  console.log(`  Unresolved                  : ${grandNoLog}`);
  if (APPLY) {
    console.log(`  Applied                     : ${grandApplied}`);
  } else {
    const recoverable = grandPhase1 + grandPhase3;
    console.log(`\n  DRY-RUN only — re-run with --apply to write ${recoverable} change(s).`);
  }
  console.log();

  await pool.end();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  try { await pool.end(); } catch {}
  process.exit(1);
});

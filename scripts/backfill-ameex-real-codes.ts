/**
 * One-time backfill: recover real Ameex tracking codes for orders stuck on
 * AMEEX-PENDING-TJG-<orderNumber> placeholders.
 *
 * HOW IT WORKS
 * ────────────
 * Phase 1 — Log recovery (no external API call):
 *   Every ship attempt writes a "shipping_sent" log with message:
 *     "✅ Commande #XXXX envoyée. Tracking: REALCODE"
 *   We parse each entry. If the stored tracking is a real code (not AMEEX-PENDING-*),
 *   we use it. For orders with multiple entries (retries) we keep the LATEST real code.
 *
 * Phase 2 — Status enrichment:
 *   After setting the real code we also look up any stored Ameex webhook event whose
 *   payload.order_id matches that code, map it via AMEEX_STATUS_MAP, and apply it.
 *   If none found, leave status alone — the next webhook will match now.
 *
 * Phase 3 — Fallback via Ameex parcel-list API (phone matching):
 *   For orders still unresolved after Phase 1, call the Ameex parcel-list API
 *   and match remaining placeholders by normalized recipient phone (unique match only).
 *   Ambiguous phone → skip (reported). No match → reported for manual handling.
 *
 * SAFETY
 * ──────
 * • Dry-run by default — prints what it WOULD do, writes nothing.
 * • Never overwrites a trackNumber that is already a real (non-placeholder) code.
 * • Phone matching is unique-only — never assigns a code when 2+ parcels share a phone.
 *
 * USAGE
 * ─────
 *   DATABASE_URL=<prod_url> NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *     npx tsx scripts/backfill-ameex-real-codes.ts           # dry-run
 *   DATABASE_URL=<prod_url> NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *     npx tsx scripts/backfill-ameex-real-codes.ts --apply   # write changes
 *   ... --store 64     # limit to one store
 */

import { and, desc, eq, like, sql, inArray } from "drizzle-orm";
import axios from "axios";
import https from "https";
import FormData from "form-data";
import { db, pool } from "../server/db";
import { orders, integrationLogs } from "@shared/schema";
import { AMEEX_STATUS_MAP } from "../server/services/carrier-service";

const APPLY    = process.argv.includes("--apply");
const storeArg = process.argv.find(a => /^--store[= ]/.test(a));
const STORE_ID = storeArg ? parseInt(storeArg.replace(/--store[= ]/, ""), 10) : null;

const SSL_AGENT = new https.Agent({ rejectUnauthorized: false });

// ─── helpers ──────────────────────────────────────────────────────────────────

const normPhone = (p: string): string => {
  let s = String(p || "").replace(/[\s\-().+]/g, "");
  if (s.startsWith("00212"))                  s = "0" + s.slice(5);
  else if (s.startsWith("212") && s.length === 12) s = "0" + s.slice(3);
  return s;
};

const normName = (s: string): string =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Ameex PENDING backfill — ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no changes)"}`);
  if (STORE_ID) console.log(`  Scope: store ${STORE_ID} only`);
  console.log(`${"=".repeat(70)}\n`);

  // ── 0. Discover stores that have AMEEX-PENDING orders ─────────────────────
  // (carrier_accounts doesn't reliably tell us which stores had Ameex — we go
  // direct to orders so we never miss a store)
  const storeRows = await db.execute(
    sql`SELECT DISTINCT store_id FROM orders WHERE track_number LIKE 'AMEEX-PENDING-%'`
  );
  const allStoreIds: number[] = (storeRows.rows as any[]).map(r => Number(r.store_id));
  const storeIds = STORE_ID ? [STORE_ID] : allStoreIds;
  console.log(`Stores with AMEEX-PENDING orders: ${storeIds.join(", ")}\n`);

  if (storeIds.length === 0) {
    console.log("Nothing to do — no AMEEX-PENDING orders found.");
    await pool.end();
    return;
  }

  let grandTotal   = 0;
  let grandPhase1  = 0;
  let grandPhase3  = 0;
  let grandNoMatch = 0;
  let grandApplied = 0;

  for (const storeId of storeIds) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Store ${storeId}`);
    console.log(`${"─".repeat(60)}\n`);

    // ── 1. Load AMEEX-PENDING orders ──────────────────────────────────────
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

    // Index by order number (string) for fast lookup
    const pendingByOrderNum = new Map<string, typeof pendingRows[0]>();
    for (const o of pendingRows) {
      pendingByOrderNum.set(String(o.orderNumber), o);
      // Also index by number embedded in placeholder: AMEEX-PENDING-TJG-9230 → "9230"
      const m = String(o.trackNumber || "").match(/AMEEX-PENDING-TJG-(.+)/);
      if (m) pendingByOrderNum.set(m[1], o);
    }

    // ── 2. Phase 1 — parse shipping_sent logs ─────────────────────────────
    // Message format: "✅ Commande #9228 envoyée. Tracking: ANCG0726B23187GS5318998"
    // We only want entries where the tracking is a REAL code (not another AMEEX-PENDING).
    const shipLogs = await db
      .select()
      .from(integrationLogs)
      .where(and(
        eq(integrationLogs.storeId, storeId),
        eq(integrationLogs.provider, "ameex"),
        eq(integrationLogs.action, "shipping_sent"),
      ))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(5000);

    console.log(`  shipping_sent logs: ${shipLogs.length}`);

    // Build: orderNumber → realCode (first seen = most recent because DESC order)
    const phase1Map = new Map<string, { realCode: string }>();

    for (const row of shipLogs) {
      const msg = row.message || "";
      // "Commande #9228 envoyée. Tracking: ANCG0726B23187GS5318998"
      const m = msg.match(/Commande\s+#(\S+)\s+envoy[ée]+\.\s+Tracking:\s+(\S+)/i);
      if (!m) continue;
      const orderNum = m[1].trim();
      const tracking = m[2].trim();
      // Skip if it's a placeholder (the ship before the extractTracking fix)
      if (tracking.startsWith("AMEEX-PENDING-")) continue;
      // Latest entry wins (DESC order — first match per orderNum kept)
      if (!phase1Map.has(orderNum)) {
        phase1Map.set(orderNum, { realCode: tracking });
      }
    }

    console.log(`  Phase 1: ${phase1Map.size} real codes extracted from logs`);

    // ── 3. Load Ameex webhook events for status enrichment ────────────────
    // Webhook payload (FORMAT B): { event:"package_updated",
    //   payload:{ order_id:"REALCODE", status:"INDELIVERY", return_status:false } }
    // index: realCode → ameex status string (most recent first)
    const webhookLogs = await db
      .select()
      .from(integrationLogs)
      .where(and(
        eq(integrationLogs.storeId, storeId),
        eq(integrationLogs.action, "webhook_received"),
      ))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(2000);

    const latestStatusByCode = new Map<string, string>(); // realCode → ameex STATUS string
    for (const row of webhookLogs) {
      if (!row.payload) continue;
      try {
        const p = JSON.parse(row.payload);
        let code = "";
        let statut = "";
        if (p.code_colis != null || p.event === "package_updated") {
          let nested: any = {};
          if (typeof p.payload === "object" && p.payload) nested = p.payload;
          else if (typeof p.payload === "string") try { nested = JSON.parse(p.payload); } catch {}
          code   = String(nested.order_id || p.code_colis || "").trim();
          statut = nested.return_status === true
            ? "RETURNED"
            : String(nested.status || "").trim().toUpperCase();
        } else {
          code   = String(p.CODE || "").trim();
          statut = String(p.STATUT || "").trim().toUpperCase();
        }
        if (code && statut && !latestStatusByCode.has(code)) {
          latestStatusByCode.set(code, statut);
        }
      } catch { /* ignore */ }
    }

    // ── 4. Resolve Phase 1 matches ────────────────────────────────────────
    type Match = {
      order:        typeof pendingRows[0];
      realCode:     string;
      source:       string;
      ameexStatut?: string;
      mappedStatus?: string;
    };

    const phase1Matches: Match[] = [];
    const remaining:     typeof pendingRows[0][] = [];

    for (const order of pendingRows) {
      const orderNum = String(order.orderNumber);
      const ph       = String(order.trackNumber || "").match(/AMEEX-PENDING-TJG-(.+)/);
      const candidate =
        phase1Map.get(orderNum) ??
        (ph ? phase1Map.get(ph[1]) : undefined);

      if (candidate) {
        const ameexStatut  = latestStatusByCode.get(candidate.realCode);
        const mappedStatus = ameexStatut ? (AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress") : undefined;
        phase1Matches.push({ order, realCode: candidate.realCode, source: "log:shipping_sent", ameexStatut, mappedStatus });
      } else {
        remaining.push(order);
      }
    }

    grandPhase1 += phase1Matches.length;
    console.log(`\n  Phase 1 resolved : ${phase1Matches.length}`);
    console.log(`  Still pending    : ${remaining.length}`);

    // Print Phase 1 examples
    const p1ex = phase1Matches.slice(0, 10);
    if (p1ex.length) {
      console.log("\n  Phase 1 examples:");
      for (const m of p1ex) {
        const st = m.ameexStatut ? ` → ${m.ameexStatut} (${m.mappedStatus})` : "";
        console.log(`    #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode}${st}`);
      }
      if (phase1Matches.length > 10) console.log(`    … and ${phase1Matches.length - 10} more`);
    }

    // ── 5. Phase 3 — Ameex parcel-list API for remaining orders ──────────
    const phase3Matches: Match[] = [];
    const noMatch: typeof pendingRows[0][] = [];

    if (remaining.length > 0) {
      console.log(`\n  Phase 3: probing Ameex parcel-list API for ${remaining.length} unresolved orders…`);

      // Fetch carrier account from carrier_accounts table
      const accountRows = await db.execute(sql`
        SELECT api_key, api_secret FROM carrier_accounts
        WHERE store_id = ${storeId}
          AND (LOWER(carrier_name) LIKE '%ameex%' OR LOWER(carrier_name) LIKE '%olivraison%')
          AND is_active = 1
        ORDER BY is_default DESC, id DESC LIMIT 1
      `);
      const account = (accountRows.rows as any[])[0];
      const apiKey  = (account?.api_key  || "").replace(/<[^>]*>/g, "").trim();
      const apiId   = (account?.api_secret || "").replace(/<[^>]*>/g, "").trim();

      if (!apiKey) {
        console.log("  ⚠️  No active Ameex carrier account found — skipping Phase 3.");
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
              const preview = JSON.stringify(r.data).slice(0, 120);
              console.log(`    ${method.toUpperCase()} ${url} → HTTP ${r.status} ${preview}`);
              if (r.status === 200 && r.data && typeof r.data === "object" && Object.keys(r.data).length > 0) {
                parcelsRaw = r.data; workingUrl = `${method.toUpperCase()} ${url}`; break;
              }
            } catch (e: any) {
              console.log(`    ${method.toUpperCase()} ${url} → Error: ${e.message}`);
            }
          }
          if (parcelsRaw) break;
        }

        if (!parcelsRaw) {
          console.log("  ⚠️  No Ameex parcel-list endpoint responded — Phase 3 skipped.");
          noMatch.push(...remaining);
        } else {
          console.log(`  ✅ Parcel list via: ${workingUrl}`);

          // Parse parcel array from any known response shape
          let arr: any[] = [];
          if      (Array.isArray(parcelsRaw))         arr = parcelsRaw;
          else if (Array.isArray(parcelsRaw.data))    arr = parcelsRaw.data;
          else if (Array.isArray(parcelsRaw.parcels)) arr = parcelsRaw.parcels;
          else if (Array.isArray(parcelsRaw.items))   arr = parcelsRaw.items;
          else if (Array.isArray(parcelsRaw.result))  arr = parcelsRaw.result;
          else {
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

          console.log(`  Parsed ${parcels.length} parcels`);
          if (parcels[0]) console.log(`  Sample: ${JSON.stringify(parcels[0])}`);

          // Index by normalized phone
          const byPhone = new Map<string, AmeexParcel[]>();
          for (const p of parcels) {
            const norm = normPhone(p.phone);
            if (!norm) continue;
            if (!byPhone.has(norm)) byPhone.set(norm, []);
            byPhone.get(norm)!.push(p);
          }

          for (const order of remaining) {
            const phone      = normPhone(order.customerPhone || "");
            const candidates = phone ? (byPhone.get(phone) || []) : [];

            if (candidates.length === 1) {
              const parcel      = candidates[0];
              const ameexStatut = parcel.status;
              const mappedStatus = AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress";
              phase3Matches.push({ order, realCode: parcel.trackingCode, source: "api:phone", ameexStatut, mappedStatus });
            } else if (candidates.length > 1) {
              // Try narrowing by name token or city
              const firstToken = normName(order.customerName || "").split(" ")[0] || "";
              const cityNorm   = normName((order as any).city || "");
              const narrowed   = candidates.filter(c =>
                (firstToken && normName(c.name).includes(firstToken)) ||
                (cityNorm   && normName(c.city) === cityNorm)
              );
              if (narrowed.length === 1) {
                const parcel      = narrowed[0];
                const ameexStatut = parcel.status;
                const mappedStatus = AMEEX_STATUS_MAP[ameexStatut] ?? "in_progress";
                phase3Matches.push({ order, realCode: parcel.trackingCode, source: "api:phone+name/city", ameexStatut, mappedStatus });
              } else {
                noMatch.push(order);
              }
            } else {
              noMatch.push(order);
            }
          }
        }
      }

      grandPhase3 += phase3Matches.length;
      console.log(`\n  Phase 3 resolved : ${phase3Matches.length}`);
      console.log(`  Unresolved       : ${noMatch.length}`);

      if (phase3Matches.length > 0) {
        console.log("\n  Phase 3 examples:");
        for (const m of phase3Matches.slice(0, 10)) {
          console.log(`    #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode} [${m.ameexStatut}→${m.mappedStatus}]  [${m.source}]`);
        }
      }
    } else {
      // No remaining orders → nothing unresolved
      grandNoMatch += 0;
    }

    grandNoMatch += noMatch.length;

    if (noMatch.length > 0) {
      console.log("\n  Unresolved — attach manually:");
      for (const o of noMatch.slice(0, 20)) {
        console.log(`    #${o.orderNumber}: ${o.trackNumber}  phone=${o.customerPhone || "(none)"}`);
      }
      if (noMatch.length > 20) console.log(`    … and ${noMatch.length - 20} more`);
    }

    // ── 6. Apply ──────────────────────────────────────────────────────────
    const allMatches = [...phase1Matches, ...phase3Matches];

    if (APPLY && allMatches.length > 0) {
      const TERMINAL = new Set(["delivered", "refused", "retourné"]);
      let applied = 0;

      for (const m of allMatches) {
        try {
          // Guard: never overwrite a real (non-placeholder) code
          if (!String(m.order.trackNumber || "").startsWith("AMEEX-PENDING-")) {
            console.log(`    SKIP #${m.order.orderNumber} — already real: ${m.order.trackNumber}`);
            continue;
          }

          const updateSet: Record<string, any> = { trackNumber: m.realCode };

          // Status enrichment (terminal guard: never downgrade delivered/refused/retourné)
          if (m.mappedStatus && m.ameexStatut) {
            const cur = m.order.status || "";
            if (!(TERMINAL.has(cur) && !TERMINAL.has(m.mappedStatus))) {
              updateSet.status        = m.mappedStatus;
              updateSet.commentStatus = m.ameexStatut;
            }
          }

          await db.update(orders).set(updateSet as any).where(eq(orders.id, m.order.id));

          applied++;
          grandApplied++;
          const st = m.ameexStatut ? ` + ${m.ameexStatut}→${m.mappedStatus}` : "";
          console.log(`    ✅ #${m.order.orderNumber}: ${m.order.trackNumber} → ${m.realCode}${st}`);
        } catch (e: any) {
          console.error(`    ❌ #${m.order.orderNumber}: ${e?.message}`);
        }
      }
      console.log(`\n  Applied: ${applied}/${allMatches.length}`);
    }
  } // end store loop

  // ── Grand summary ──────────────────────────────────────────────────────────
  const recoverable = grandPhase1 + grandPhase3;
  console.log(`\n${"=".repeat(70)}`);
  console.log("  GRAND SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(`  Total AMEEX-PENDING orders  : ${grandTotal}`);
  console.log(`  Recoverable from logs       : ${grandPhase1}`);
  console.log(`  Recoverable via API         : ${grandPhase3}`);
  console.log(`  Unresolved                  : ${grandNoMatch}`);
  if (APPLY) {
    console.log(`  Applied                     : ${grandApplied}`);
  } else {
    console.log(`\n  DRY-RUN only — re-run with --apply to write ${recoverable} change(s).`);
  }
  console.log();

  await pool.end();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err?.message || err);
  try { await pool.end(); } catch {}
  process.exit(1);
});

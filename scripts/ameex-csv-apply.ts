/**
 * One-shot: apply the 30-order Ameex CSV mapping to production.
 *
 * Runs against the DB pointed at by DATABASE_URL (set it to PROD_DATABASE_URL
 * before executing). No HTTP, no browser console needed.
 *
 * Steps:
 *  1. DRY-RUN: print per-order diff (oldCode → newCode, newStatus)
 *  2. If all 30 matched and all still AMEEX-PENDING, apply for real
 *  3. Replay stored Ameex webhook events for store 64 so newer statuses land
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, desc, eq, like } from "drizzle-orm";
import * as schema from "../shared/schema";

const { Pool } = pg;

// ── Mapping from CSV ──────────────────────────────────────────────────────────
const MAPPING: Record<string, { code: string; ameexStatus: string }> = {
  "1235": { code: "ODL0726B27347KY3194798",        ameexStatus: "Attente De Ramassage" },
  "1236": { code: "TAT0726B27347SR4229698",        ameexStatus: "Expédié" },
  "1238": { code: "CSA0726B27347MJ2229698",        ameexStatus: "Reporté" },
  "1241": { code: "TMR0726B27347XF8390798",        ameexStatus: "Reporté" },
  "1242": { code: "LTA0726B27347IT1185798",        ameexStatus: "Reçu" },
  "1246": { code: "SAB0726B27347VL1344898",        ameexStatus: "Expédié" },
  "1249": { code: "MRK0726B27347PO1166898",        ameexStatus: "Livré" },
  "1488": { code: "AHC0726B27347FR5229698",        ameexStatus: "Expédié" },
  "1495": { code: "CSA0726B27347EM3185798",        ameexStatus: "Reporté" },
  "1497": { code: "NDR0726B27347RC7560798",        ameexStatus: "Expédié" },
  "1498": { code: "AGA0726B27347AP6805798",        ameexStatus: "Attente De Ramassage" },
  "1499": { code: "CSA0726B27347RW1490798",        ameexStatus: "Reçu" },
  "1503": { code: "TRI0726B27347NL0490798",        ameexStatus: "Attente De Ramassage" },
  "1507": { code: "TGR0726B27347BO9390798",        ameexStatus: "Attente De Ramassage" },
  "1508": { code: "AGA0726B27347MC7117798",        ameexStatus: "Reporté" },
  "1510": { code: "RBT0726B27347CW5705798",        ameexStatus: "Pas de réponse" },
  "1511": { code: "OJD0726B27347NG5390798",        ameexStatus: "Attente De Ramassage" },
  "1512": { code: "EJD0726B27347DQ9094798",        ameexStatus: "Expédié" },
  "1513": { code: "NKB0726B27347XN8007898",        ameexStatus: "Attente De Ramassage" },
  "1514": { code: "EKB0726B27347KV6117798",        ameexStatus: "Attente De Ramassage" },
  "1515": { code: "ZGR0726B27347AP8749798",        ameexStatus: "Attente De Ramassage" },
  "1517": { code: "SKOURA0726B27347YJ7749798",     ameexStatus: "Reçu" },
  "1518": { code: "KTR0726B27347YA6549798",        ameexStatus: "Attente De Ramassage" },
  "1520": { code: "TGR0726B27347EV8166898",        ameexStatus: "Reporté" },
  "1522": { code: "CSA0726B27347HN2344898",        ameexStatus: "Reporté" },
  "1524": { code: "MRK0726B27347WV4166898",        ameexStatus: "Annulé" },
  "1527": { code: "CSA0726B27347WS9027898",        ameexStatus: "Mise en distribution" },
  "1528": { code: "KTL0726B27347CD6838898",        ameexStatus: "Reçu" },
  "1529": { code: "MRK0726B27347FK6907898",        ameexStatus: "Refusé" },
  "1530": { code: "NDR0726B27347IP9738898",        ameexStatus: "Expédié" },
};

const STORE_ID = 64;

// ── French label → internal status ───────────────────────────────────────────
const FRENCH_TO_INTERNAL: Record<string, { internalStatus: string; commentStatus: string }> = {
  "LIVRÉ":                { internalStatus: "delivered",   commentStatus: "Livré" },
  "LIVRE":                { internalStatus: "delivered",   commentStatus: "Livré" },
  "REFUSÉ":               { internalStatus: "refused",     commentStatus: "Refusé" },
  "REFUSE":               { internalStatus: "refused",     commentStatus: "Refusé" },
  "ANNULÉ":               { internalStatus: "refused",     commentStatus: "Annulé" },
  "ANNULE":               { internalStatus: "refused",     commentStatus: "Annulé" },
  "REPORTÉ":              { internalStatus: "in_progress", commentStatus: "Reporté" },
  "REPORTE":              { internalStatus: "in_progress", commentStatus: "Reporté" },
  "EXPÉDIÉ":              { internalStatus: "in_progress", commentStatus: "Expédié" },
  "EXPEDIE":              { internalStatus: "in_progress", commentStatus: "Expédié" },
  "REÇU":                 { internalStatus: "in_progress", commentStatus: "Reçu" },
  "RECU":                 { internalStatus: "in_progress", commentStatus: "Reçu" },
  "MISE EN DISTRIBUTION": { internalStatus: "in_progress", commentStatus: "Mise en distribution" },
  "PAS DE RÉPONSE":       { internalStatus: "in_progress", commentStatus: "Pas de réponse" },
  "PAS DE REPONSE":       { internalStatus: "in_progress", commentStatus: "Pas de réponse" },
  "ATTENTE DE RAMASSAGE": { internalStatus: "in_progress", commentStatus: "Attente De Ramassage" },
};

function resolveFrench(raw: string): { internalStatus: string; commentStatus: string } | null {
  const key     = raw.trim().toUpperCase();
  const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return FRENCH_TO_INTERNAL[key] ?? FRENCH_TO_INTERNAL[keyNorm] ?? null;
}

// ── Ameex webhook status map (mirrors carrier-service.ts) ─────────────────────
const AMEEX_STATUS_MAP: Record<string, string> = {
  "DELIVERED": "delivered", "REFUSED": "refused", "REJECTED": "refused",
  "CANCELED": "refused", "CANCELLED": "refused", "ANNULE": "refused",
  "RETURNED": "retourné", "RETOUR": "retourné", "RTS": "retourné",
  "INHOUSE": "in_progress", "INDELIVERY": "in_progress", "DISTRIBUTION": "in_progress",
  "OUT": "in_progress", "IN_PROGRESS": "in_progress", "PENDING": "in_progress",
  "PICKED": "in_progress", "RECEIVED": "in_progress", "POSTPONED": "in_progress",
  "NEW PACKAGE": "in_progress", "NEW_PACKAGE": "in_progress", "NEW": "in_progress",
};
function mapAmeexStatus(s: string): string {
  return AMEEX_STATUS_MAP[s.toUpperCase().trim()] ?? "in_progress";
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");

  const isRemote = !dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") && !dbUrl.includes("helium");
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : false,
    max: 3,
  });
  const db = drizzle(pool, { schema });

  console.log(`\n[AMEEX-CSV] Connected to DB (remote=${isRemote})`);
  console.log(`[AMEEX-CSV] Store ID: ${STORE_ID} | Orders to patch: ${Object.keys(MAPPING).length}\n`);

  // ── Fetch all store-64 orders that still have an AMEEX-PENDING track number ─
  const pendingOrders = await db
    .select()
    .from(schema.orders)
    .where(and(
      eq(schema.orders.storeId, STORE_ID),
      like(schema.orders.trackNumber as any, "AMEEX-PENDING-%"),
    )) as any[];

  console.log(`[AMEEX-CSV] Found ${pendingOrders.length} AMEEX-PENDING orders in store ${STORE_ID}\n`);

  // ── DRY-RUN ──────────────────────────────────────────────────────────────────
  type PlanRow = {
    orderNum:       string;
    orderId:        number;
    oldCode:        string;
    newCode:        string;
    internalStatus: string;
    commentStatus:  string;
  };

  const plan: PlanRow[] = [];
  const notFound: string[] = [];
  const notPending: Array<{ orderNum: string; current: string }> = [];

  for (const [orderNum, { code, ameexStatus }] of Object.entries(MAPPING)) {
    const order = pendingOrders.find((o: any) => String(o.orderNumber) === orderNum);
    if (!order) {
      // Also check all orders (maybe already patched)
      const anyOrder = await db
        .select({ id: schema.orders.id, trackNumber: schema.orders.trackNumber })
        .from(schema.orders)
        .where(and(eq(schema.orders.storeId, STORE_ID), eq(schema.orders.orderNumber as any, orderNum)))
        .limit(1);
      if (anyOrder.length && !String(anyOrder[0].trackNumber || "").startsWith("AMEEX-PENDING-")) {
        notPending.push({ orderNum, current: String(anyOrder[0].trackNumber) });
      } else {
        notFound.push(orderNum);
      }
      continue;
    }
    const statusRes = resolveFrench(ameexStatus);
    plan.push({
      orderNum,
      orderId:        order.id,
      oldCode:        String(order.trackNumber),
      newCode:        code,
      internalStatus: statusRes?.internalStatus ?? "in_progress",
      commentStatus:  statusRes?.commentStatus  ?? ameexStatus,
    });
  }

  console.log("─── DRY-RUN RESULTS ─────────────────────────────────────────────────────────");
  for (const r of plan) {
    console.log(`  #${r.orderNum} (id=${r.orderId}) | ${r.oldCode} → ${r.newCode} | status=${r.internalStatus} commentStatus="${r.commentStatus}"`);
  }
  if (notPending.length) {
    console.log("\n  [SKIP — already real code]:");
    for (const r of notPending) console.log(`    #${r.orderNum} current=${r.current}`);
  }
  if (notFound.length) {
    console.log("\n  [NOT FOUND in store 64]:", notFound.join(", "));
  }
  console.log(`\n  matched=${plan.length}  notPending=${notPending.length}  notFound=${notFound.length}`);
  console.log("─────────────────────────────────────────────────────────────────────────────\n");

  // ── APPLY ────────────────────────────────────────────────────────────────────
  const expectedMatch = Object.keys(MAPPING).length; // 30
  if (plan.length !== expectedMatch) {
    console.error(`[AMEEX-CSV] ❌ ABORT — matched ${plan.length}/${expectedMatch}. Fix notFound before applying.`);
    await pool.end();
    return;
  }

  console.log(`[AMEEX-CSV] ✅ All ${plan.length} matched — applying updates…\n`);
  let applied = 0;

  for (const r of plan) {
    await db
      .update(schema.orders)
      .set({
        trackNumber:   r.newCode,
        status:        r.internalStatus,
        commentStatus: r.commentStatus,
      } as any)
      .where(eq(schema.orders.id, r.orderId));

    // Audit log
    await db.insert(schema.orderFollowUpLogs).values({
      orderId:   r.orderId,
      agentId:   null,
      agentName: "Ameex CSV Backfill",
      note:      `CSV apply: ${r.oldCode} => ${r.newCode} | ${r.commentStatus} => ${r.internalStatus}`,
    } as any);

    console.log(`  ✓ #${r.orderNum} → ${r.newCode} [${r.internalStatus}]`);
    applied++;
  }

  console.log(`\n[AMEEX-CSV] Applied: ${applied}/${plan.length}\n`);

  // ── WEBHOOK REPLAY for store 64 ───────────────────────────────────────────
  console.log(`[AMEEX-CSV] Starting webhook replay for store ${STORE_ID}…`);

  const ameexLogs = await db
    .select()
    .from(schema.integrationLogs)
    .where(and(
      eq(schema.integrationLogs.storeId, STORE_ID),
      eq(schema.integrationLogs.provider, "ameex"),
      eq(schema.integrationLogs.action, "webhook_received"),
    ))
    .orderBy(desc(schema.integrationLogs.createdAt))
    .limit(500) as any[];

  console.log(`[AMEEX-CSV] ${ameexLogs.length} stored Ameex webhook events`);

  // Parse each log — same logic as the sync route
  type AmeexEvt = { code: string; statut: string; statutName: string };
  function parseLog(row: any): AmeexEvt | null {
    if (row.payload) {
      try {
        const p = JSON.parse(row.payload);
        if (p.code_colis || p.event === "package_updated") {
          let nested: any = {};
          if (p.payload) { try { nested = typeof p.payload === "object" ? p.payload : JSON.parse(String(p.payload)); } catch { /**/ } }
          const code   = (nested.order_id || p.code_colis || "").toString().trim();
          const rawS   = nested.return_status === true ? "RETURNED" : (nested.status || "");
          const statut = rawS.toString().trim();
          const label  = nested.description || p.commentaire || statut;
          if (code && statut) return { code, statut, statutName: label };
          if (code)           return { code, statut: "IN_PROGRESS", statutName: "En cours" };
        }
        const code   = (p.CODE || "").toString().trim();
        const statut = (p.STATUT || "").toString().trim();
        if (code && statut) return { code, statut, statutName: p.STATUT_NAME || statut };
      } catch { /**/ }
    }
    const msg    = row.message || "";
    const codeM  = msg.match(/CODE=([^\s]+)/);
    const statM  = msg.match(/STATUT=([^\s/(]+)/);
    if (codeM?.[1] && statM?.[1]) return { code: codeM[1], statut: statM[1], statutName: statM[1] };
    return null;
  }

  // Group by code — keep only the most-recent event per code (logs are DESC)
  const latestByCode = new Map<string, AmeexEvt>();
  for (const row of ameexLogs) {
    const evt = parseLog(row);
    if (!evt) continue;
    if (!latestByCode.has(evt.code)) latestByCode.set(evt.code, evt);
  }
  console.log(`[AMEEX-CSV] Unique codes in logs: ${latestByCode.size}`);

  // Build index of just-patched orders by their new real code
  const orderByCode = new Map<string, { orderId: number; orderNum: string }>();
  for (const r of plan) {
    orderByCode.set(r.newCode.toUpperCase(), { orderId: r.orderId, orderNum: r.orderNum });
  }

  let replayUpdated = 0;
  const replayDetails: string[] = [];

  for (const [code, evt] of latestByCode) {
    const match = orderByCode.get(code.toUpperCase());
    if (!match) continue;

    const newStatus     = mapAmeexStatus(evt.statut);
    const newComment    = evt.statutName || evt.statut;

    await db
      .update(schema.orders)
      .set({ status: newStatus, commentStatus: newComment } as any)
      .where(eq(schema.orders.id, match.orderId));

    replayDetails.push(`  ↺ #${match.orderNum} code=${code} statut="${evt.statut}" → ${newStatus} commentStatus="${newComment}"`);
    replayUpdated++;
  }

  if (replayDetails.length) {
    console.log("\n[AMEEX-CSV] Webhook replay — status overrides applied:");
    for (const d of replayDetails) console.log(d);
  } else {
    console.log("[AMEEX-CSV] Webhook replay — no stored webhooks matched the patched codes (status from CSV is final).");
  }

  console.log(`\n[AMEEX-CSV] Replay updated: ${replayUpdated} order(s)`);
  console.log(`\n[AMEEX-CSV] ✅ DONE — applied=${applied} replayUpdated=${replayUpdated}\n`);

  await pool.end();
}

main().catch(err => {
  console.error("[AMEEX-CSV] FATAL:", err?.message ?? err);
  process.exit(1);
});

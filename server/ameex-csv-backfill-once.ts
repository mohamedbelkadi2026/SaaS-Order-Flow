/**
 * One-shot Ameex CSV backfill — runs at server startup when
 * RUN_AMEEX_CSV_BACKFILL=1 is set as a Railway environment variable.
 *
 * After it fires, remove the env var so it never runs again.
 *
 * Reuses the already-connected `db` pool from server/db.ts — no separate
 * connection string needed (works inside Railway's private network).
 */

import { and, desc, eq, like } from "drizzle-orm";
import { db } from "./db";
import * as schema from "../shared/schema";

// ── 30-order mapping from CSV ─────────────────────────────────────────────────
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

function resolveFrench(raw: string): { internalStatus: string; commentStatus: string } {
  const key     = raw.trim().toUpperCase();
  const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return FRENCH_TO_INTERNAL[key] ?? FRENCH_TO_INTERNAL[keyNorm]
    ?? { internalStatus: "in_progress", commentStatus: raw.trim() };
}

// ── Ameex status map (mirrors carrier-service.ts) ─────────────────────────────
const AMEEX_STATUS_MAP: Record<string, string> = {
  "DELIVERED": "delivered",   "REFUSED": "refused",      "REJECTED": "refused",
  "CANCELED":  "refused",     "CANCELLED": "refused",    "ANNULE": "refused",
  "RETURNED":  "retourné",    "RETOUR": "retourné",      "RTS": "retourné",
  "INHOUSE":   "in_progress", "INDELIVERY": "in_progress", "DISTRIBUTION": "in_progress",
  "OUT":       "in_progress", "IN_PROGRESS": "in_progress", "PENDING": "in_progress",
  "PICKED":    "in_progress", "RECEIVED": "in_progress", "POSTPONED": "in_progress",
  "NEW PACKAGE": "in_progress", "NEW_PACKAGE": "in_progress", "NEW": "in_progress",
};
function mapAmeexStatus(s: string): string {
  return AMEEX_STATUS_MAP[s.toUpperCase().trim()] ?? "in_progress";
}

// ─────────────────────────────────────────────────────────────────────────────

export async function runAmeexCsvBackfill(): Promise<void> {
  const tag = "[AMEEX-CSV-BACKFILL]";
  console.log(`${tag} ========== START ==========`);
  console.log(`${tag} Store ${STORE_ID} | ${Object.keys(MAPPING).length} orders to patch`);

  // Fetch all AMEEX-PENDING orders for store 64
  const pendingOrders = await db
    .select()
    .from(schema.orders)
    .where(and(
      eq(schema.orders.storeId, STORE_ID),
      like(schema.orders.trackNumber as any, "AMEEX-PENDING-%"),
    )) as any[];

  console.log(`${tag} AMEEX-PENDING orders found in store ${STORE_ID}: ${pendingOrders.length}`);

  // ── Build plan ─────────────────────────────────────────────────────────────
  type PlanRow = {
    orderNum:       string;
    orderId:        number;
    oldCode:        string;
    newCode:        string;
    internalStatus: string;
    commentStatus:  string;
  };

  const plan: PlanRow[]  = [];
  const notFound: string[] = [];
  const alreadyPatched: Array<{ orderNum: string; current: string }> = [];

  for (const [orderNum, { code, ameexStatus }] of Object.entries(MAPPING)) {
    const order = pendingOrders.find((o: any) => String(o.orderNumber) === orderNum);

    if (!order) {
      // Check if it exists but is already patched
      const existing = await db
        .select({ id: schema.orders.id, trackNumber: schema.orders.trackNumber })
        .from(schema.orders)
        .where(and(
          eq(schema.orders.storeId, STORE_ID),
          eq(schema.orders.orderNumber as any, orderNum),
        ))
        .limit(1) as any[];

      if (existing.length && !String(existing[0].trackNumber ?? "").startsWith("AMEEX-PENDING-")) {
        alreadyPatched.push({ orderNum, current: String(existing[0].trackNumber) });
      } else {
        notFound.push(orderNum);
      }
      continue;
    }

    const { internalStatus, commentStatus } = resolveFrench(ameexStatus);
    plan.push({
      orderNum,
      orderId:       order.id,
      oldCode:       String(order.trackNumber),
      newCode:       code,
      internalStatus,
      commentStatus,
    });
  }

  // ── DRY-RUN log ────────────────────────────────────────────────────────────
  console.log(`${tag} ─── DRY-RUN ───────────────────────────────────────────`);
  for (const r of plan) {
    console.log(`${tag}   #${r.orderNum} (id=${r.orderId}) | ${r.oldCode} -> ${r.newCode} | ${r.internalStatus} | "${r.commentStatus}"`);
  }
  if (alreadyPatched.length) {
    console.log(`${tag}   [ALREADY PATCHED]: ${alreadyPatched.map(r => `#${r.orderNum}(${r.current})`).join(", ")}`);
  }
  if (notFound.length) {
    console.log(`${tag}   [NOT FOUND in store ${STORE_ID}]: ${notFound.join(", ")}`);
  }
  console.log(`${tag} matched=${plan.length}  alreadyPatched=${alreadyPatched.length}  notFound=${notFound.length}`);
  console.log(`${tag} ───────────────────────────────────────────────────────`);

  // ── Abort if not all 30 matched (or already patched — both are fine) ───────
  const totalResolved = plan.length + alreadyPatched.length;
  const expectedTotal = Object.keys(MAPPING).length; // 30

  if (totalResolved !== expectedTotal) {
    console.error(`${tag} ABORT — only ${totalResolved}/${expectedTotal} orders resolved. notFound: [${notFound.join(", ")}]`);
    return;
  }

  if (plan.length === 0) {
    console.log(`${tag} All ${alreadyPatched.length} orders already patched — nothing to do.`);
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  console.log(`${tag} Applying ${plan.length} updates…`);
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

    await db.insert(schema.orderFollowUpLogs).values({
      orderId:   r.orderId,
      agentId:   null,
      agentName: "Ameex CSV Backfill",
      note:      `CSV apply: ${r.oldCode} => ${r.newCode} | status=${r.internalStatus} commentStatus="${r.commentStatus}"`,
    } as any);

    console.log(`${tag}   APPLIED #${r.orderNum} -> ${r.newCode} [${r.internalStatus}]`);
    applied++;
  }

  console.log(`${tag} Applied: ${applied}/${plan.length}`);

  // ── WEBHOOK REPLAY for store 64 ────────────────────────────────────────────
  console.log(`${tag} Running webhook replay for store ${STORE_ID}…`);

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

  console.log(`${tag} ${ameexLogs.length} stored Ameex webhook events`);

  type AmeexEvt = { code: string; statut: string; statutName: string };
  function parseLog(row: any): AmeexEvt | null {
    if (row.payload) {
      try {
        const p = JSON.parse(row.payload);
        if (p.code_colis || p.event === "package_updated") {
          let nested: any = {};
          if (p.payload) {
            try { nested = typeof p.payload === "object" ? p.payload : JSON.parse(String(p.payload)); } catch { /**/ }
          }
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
    const msg   = row.message || "";
    const codeM = msg.match(/CODE=([^\s]+)/);
    const statM = msg.match(/STATUT=([^\s/(]+)/);
    if (codeM?.[1] && statM?.[1]) return { code: codeM[1], statut: statM[1], statutName: statM[1] };
    return null;
  }

  // Group by code — keep most-recent event per code (logs are DESC)
  const latestByCode = new Map<string, AmeexEvt>();
  for (const row of ameexLogs) {
    const evt = parseLog(row);
    if (!evt || latestByCode.has(evt.code)) continue;
    latestByCode.set(evt.code, evt);
  }
  console.log(`${tag} Unique codes in webhook logs: ${latestByCode.size}`);

  // Index just-applied orders by their new real code
  const orderByCode = new Map<string, { orderId: number; orderNum: string }>();
  for (const r of plan) {
    orderByCode.set(r.newCode.toUpperCase(), { orderId: r.orderId, orderNum: r.orderNum });
  }

  let replayUpdated = 0;
  for (const [code, evt] of latestByCode) {
    const match = orderByCode.get(code.toUpperCase());
    if (!match) continue;

    const newStatus  = mapAmeexStatus(evt.statut);
    const newComment = evt.statutName || evt.statut;

    await db
      .update(schema.orders)
      .set({ status: newStatus, commentStatus: newComment } as any)
      .where(eq(schema.orders.id, match.orderId));

    console.log(`${tag}   REPLAY #${match.orderNum} code=${code} statut="${evt.statut}" -> ${newStatus} "${newComment}"`);
    replayUpdated++;
  }

  if (replayUpdated === 0) {
    console.log(`${tag} Webhook replay — no stored webhooks matched the patched codes (CSV status is final).`);
  }

  console.log(`${tag} ========== DONE — applied=${applied}  replayUpdated=${replayUpdated} ==========`);
}

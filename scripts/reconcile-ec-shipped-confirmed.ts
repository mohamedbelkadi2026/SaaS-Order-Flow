/**
 * One-time backfill: link orphan Express Coursier webhooks to their matching
 * platform orders so stuck "Confirmé" orders enter Suivi automatically.
 *
 * Context: some orders were confirmed on the platform, then shipped DIRECTLY at
 * Express Coursier (not via the platform), so they have no trackNumber here.
 * EC sent webhooks but processCarrierWebhook logged them as webhook_no_match
 * (no order matched the tracking number). This script replays those no-match
 * logs, matches each EC parcel to the most recent confirme order with the same
 * customer phone, attaches the tracking number, and sets status to
 * 'Attente De Ramassage' so the order enters Suivi and future webhooks track it.
 *
 * SAFETY: dry-run by default — prints what it WOULD do and writes nothing.
 *   Preview:  node_modules/.bin/tsx scripts/reconcile-ec-shipped-confirmed.ts
 *   Apply:    node_modules/.bin/tsx scripts/reconcile-ec-shipped-confirmed.ts --apply
 *
 * Rules:
 *   - Never create new orders.
 *   - Only attach if the target order has an empty trackNumber AND the tracking
 *     number isn't already used by any other order in the same store.
 *   - De-duplicate orphan logs by tracking number (process each once, newest first).
 *   - The order must currently be in 'confirme' status.
 */

import { and, eq, inArray, desc, or, like, isNull } from "drizzle-orm";
import { db, pool } from "../server/db";
import { orders, integrationLogs } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

// ── Phone normalization (mirrors storage.getActiveOrdersByPhone) ──────────────
function normalizePhone(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];
  const local = digits.startsWith("212")
    ? `0${digits.slice(3)}`
    : digits.startsWith("0") ? digits : `0${digits}`;
  const intl = digits.startsWith("212") ? digits : `212${local.slice(1)}`;
  return Array.from(new Set([digits, raw, local, intl, `+${intl}`]));
}

// ── Extract tracking number from a parsed webhook payload ────────────────────
function extractTracking(body: Record<string, any>): string {
  return (
    body.CODE           || body.code           || body.traking          ||
    body.tracking_number || body.barcode        || body.code_suivi       ||
    body.track_number   || body.colis_id       || body.tracking         ||
    body.colis          || body.id             || body.package_id       ||
    body.data?.tracking_number || body.data?.package_id ||
    body.colis?.code   || ""
  ).toString().trim();
}

// ── Extract customer phone from a parsed webhook payload ─────────────────────
function extractPhone(body: Record<string, any>): string {
  return (
    body.phone          || body.receiver_phone  || body.telephone        ||
    body.tel            || body.gsm             || body.customer_phone   ||
    body.client_phone   || body.destinataire_phone || body.phone_number  ||
    body.numero         || body.num_tel         ||
    body.data?.phone    || body.data?.telephone || body.data?.receiver_phone || ""
  ).toString().trim();
}

interface OrphanEntry {
  logId: number;
  storeId: number;
  tracking: string;
  phone: string;
  rawPayload: string;
}

interface ReconcileResult {
  logId: number;
  storeId: number;
  tracking: string;
  phone: string;
  orderId: number;
  orderNumber: string;
  status: 'reconciled' | 'skip_no_phone' | 'skip_no_match' | 'skip_already_used' | 'skip_parse_error';
  reason?: string;
}

async function main() {
  console.log(`\n=== EC orphan webhook reconciliation — ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no changes)"} ===\n`);
  console.log("Reading webhook_no_match logs for expresscoursier / olivraison…\n");

  // ── Step 1: fetch all no-match EC logs ────────────────────────────────────
  const logs = await db.select().from(integrationLogs)
    .where(and(
      eq(integrationLogs.action, 'webhook_no_match'),
      or(
        eq(integrationLogs.provider, 'expresscoursier'),
        eq(integrationLogs.provider, 'olivraison'),
      ),
    ))
    .orderBy(desc(integrationLogs.createdAt));

  console.log(`Total webhook_no_match logs (EC/olivraison): ${logs.length}`);

  // ── Step 2: parse payloads, de-duplicate by tracking number ───────────────
  const seenTracking = new Set<string>();
  const orphans: OrphanEntry[] = [];
  let parseErrors = 0;

  for (const log of logs) {
    if (!log.payload) continue;
    let body: Record<string, any>;
    try {
      body = JSON.parse(log.payload);
    } catch {
      parseErrors++;
      continue;
    }
    const tracking = extractTracking(body);
    if (!tracking || seenTracking.has(`${log.storeId}:${tracking}`)) continue;
    seenTracking.add(`${log.storeId}:${tracking}`);
    orphans.push({
      logId:      log.id,
      storeId:    log.storeId,
      tracking,
      phone:      extractPhone(body),
      rawPayload: log.payload,
    });
  }

  console.log(`Unique orphan tracking numbers: ${orphans.length}`);
  console.log(`Skipped (parse errors / no payload): ${parseErrors}`);
  console.log();

  // ── Step 3: for each orphan, find a matching confirme order ───────────────
  const results: ReconcileResult[] = [];

  for (const orphan of orphans) {
    if (!orphan.phone) {
      results.push({ ...orphan, orderId: 0, orderNumber: '', status: 'skip_no_phone', reason: 'no phone in payload' });
      continue;
    }
    const phoneVariants = normalizePhone(orphan.phone);

    // Find confirme orders with empty trackNumber for this store + phone
    const candidates = await db.select().from(orders)
      .where(and(
        eq(orders.storeId, orphan.storeId),
        eq(orders.status, 'confirme'),
        or(
          inArray(orders.customerPhone, phoneVariants),
          like(orders.customerPhone, `%${orphan.phone.replace(/\D/g, '').slice(-9)}`),
        ),
      ))
      .orderBy(desc(orders.createdAt));

    const target = candidates.find(
      c => !(c as any).trackNumber || (c as any).trackNumber === '',
    );

    if (!target) {
      results.push({ ...orphan, orderId: 0, orderNumber: '', status: 'skip_no_match', reason: `no confirme+empty-track order for phone ${orphan.phone}` });
      continue;
    }

    // Ensure the tracking number isn't already attached to another order
    const existing = await db.select({ id: orders.id }).from(orders)
      .where(and(
        eq(orders.storeId, orphan.storeId),
        eq(orders.trackNumber as any, orphan.tracking),
      ))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== target.id) {
      results.push({
        ...orphan, orderId: target.id, orderNumber: (target as any).orderNumber || String(target.id),
        status: 'skip_already_used', reason: `tracking already on order #${existing[0].id}`,
      });
      continue;
    }

    results.push({
      ...orphan,
      orderId:     target.id,
      orderNumber: (target as any).orderNumber || String(target.id),
      status:      'reconciled',
    });
  }

  // ── Step 4: report summary ─────────────────────────────────────────────────
  const reconciled    = results.filter(r => r.status === 'reconciled');
  const noPhone       = results.filter(r => r.status === 'skip_no_phone');
  const noMatch       = results.filter(r => r.status === 'skip_no_match');
  const alreadyUsed   = results.filter(r => r.status === 'skip_already_used');

  console.log("=== Summary ===");
  console.log(`  Would reconcile:      ${reconciled.length}`);
  console.log(`  Skipped (no phone):   ${noPhone.length}`);
  console.log(`  Skipped (no match):   ${noMatch.length}`);
  console.log(`  Skipped (dup track):  ${alreadyUsed.length}`);
  console.log();

  if (reconciled.length > 0) {
    const sample = reconciled.slice(0, 10);
    console.log("=== Sample (up to 10) ===");
    for (const r of sample) {
      console.log(`  Order #${r.orderNumber} (id=${r.orderId}) ← tracking ${r.tracking} ← phone ${r.phone}`);
    }
    if (reconciled.length > 10) console.log(`  … and ${reconciled.length - 10} more`);
    console.log();
  }

  if (!APPLY) {
    console.log("Dry-run complete — no changes written.");
    console.log("To apply: node_modules/.bin/tsx scripts/reconcile-ec-shipped-confirmed.ts --apply");
    await pool.end();
    return;
  }

  // ── Step 5: apply changes ─────────────────────────────────────────────────
  console.log("Applying changes…");
  let written = 0;
  let failed  = 0;
  for (const r of reconciled) {
    try {
      await db.update(orders)
        .set({
          trackNumber:      r.tracking,
          shippingProvider: 'expresscoursier',
          carrierName:      'expresscoursier',
          status:           'Attente De Ramassage',
        } as any)
        .where(and(eq(orders.id, r.orderId), eq(orders.storeId, r.storeId)));
      written++;
    } catch (e: any) {
      console.error(`  ✗ Failed to update order #${r.orderId}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone — ${written} order(s) updated, ${failed} failed.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

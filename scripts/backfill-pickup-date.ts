/**
 * One-time backfill: populate `orders.pickupDate` (ship timestamp) for
 * existing shipped orders where it is NULL.
 *
 * Context: pickupDate was a half-built feature — the column and the
 * getFilteredOrders dateType==='pickupDate' filter existed, but nothing ever
 * wrote to it. Going forward, storage.updateOrder / updateOrderStatus /
 * createOrderFromCarrier set it automatically on every ship transition. This
 * script backfills the historical orders that shipped before that fix landed.
 *
 * An order is considered "shipped" if it has a trackNumber OR its status is
 * in the SHIPPED_STATUSES set (@shared/order-status-sets).
 *
 * Priority for the backfilled pickupDate value:
 *   1. lastActionAt
 *   2. timestamp of the order's earliest "shipping_sent" success
 *      integration log (matched by `#<orderNumber>` appearing in the log
 *      message — integration_logs has no orderId column)
 *   3. updatedAt
 *
 * SAFETY: dry-run by DEFAULT — prints a summary and writes nothing.
 *   Preview:  node_modules/.bin/tsx scripts/backfill-pickup-date.ts
 *   Apply:    node_modules/.bin/tsx scripts/backfill-pickup-date.ts --apply
 *
 * Idempotent: only touches orders where pickupDate IS NULL, and never
 * overwrites an existing value.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { orders, integrationLogs } from "@shared/schema";
import { SHIPPED_STATUS_SET } from "@shared/order-status-sets";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n=== pickupDate backfill — ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no changes)"} ===\n`);

  // ── Step 1: candidate shipped orders with pickupDate still NULL ─────────
  const candidates = await db.select().from(orders).where(
    and(
      isNull(orders.pickupDate),
      or(
        sql`${orders.trackNumber} IS NOT NULL AND ${orders.trackNumber} <> ''`,
        sql`${orders.status} IN (${sql.join(Array.from(SHIPPED_STATUS_SET).map(s => sql`${s}`), sql`, `)})`,
      ),
    ),
  );

  console.log(`Found ${candidates.length} shipped order(s) with pickupDate = NULL.\n`);

  let fromLastAction = 0;
  let fromLog = 0;
  let fromUpdatedAt = 0;
  let applied = 0;
  const preview: string[] = [];

  for (const order of candidates) {
    let resolvedDate: Date | null = null;
    let source = "";

    if (order.lastActionAt) {
      resolvedDate = new Date(order.lastActionAt);
      source = "lastActionAt";
      fromLastAction++;
    } else {
      // Earliest "shipping_sent" success integration log mentioning this
      // order's number. integration_logs has no orderId FK, so match by the
      // "#<orderNumber>" token the routes always embed in the log message.
      const ref = order.orderNumber || String(order.id);
      const logs = await db.select().from(integrationLogs).where(
        and(
          eq(integrationLogs.storeId, order.storeId),
          eq(integrationLogs.action, "shipping_sent"),
          eq(integrationLogs.status, "success"),
          sql`${integrationLogs.message} LIKE ${'%#' + ref + '%'}`,
        ),
      );
      if (logs.length > 0) {
        const earliest = logs.reduce((min, l) =>
          (l.createdAt && (!min.createdAt || new Date(l.createdAt) < new Date(min.createdAt))) ? l : min
        );
        if (earliest.createdAt) {
          resolvedDate = new Date(earliest.createdAt);
          source = "shipping_sent_log";
          fromLog++;
        }
      }
      if (!resolvedDate) {
        resolvedDate = order.updatedAt ? new Date(order.updatedAt) : new Date();
        source = "updatedAt";
        fromUpdatedAt++;
      }
    }

    preview.push(`  #${order.orderNumber || order.id} (status="${order.status}") → pickupDate=${resolvedDate.toISOString()} [${source}]`);

    if (APPLY) {
      await db.update(orders)
        .set({ pickupDate: resolvedDate })
        .where(and(eq(orders.id, order.id), isNull(orders.pickupDate)));
      applied++;
    }
  }

  if (preview.length) {
    console.log(preview.slice(0, 50).join("\n"));
    if (preview.length > 50) console.log(`  ... and ${preview.length - 50} more`);
  } else {
    console.log("  (nothing to do)");
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Candidates scanned          : ${candidates.length}`);
  console.log(`  Resolved via lastActionAt   : ${fromLastAction}`);
  console.log(`  Resolved via shipping log   : ${fromLog}`);
  console.log(`  Resolved via updatedAt      : ${fromUpdatedAt}`);
  if (APPLY) {
    console.log(`  Applied (pickupDate set)    : ${applied}`);
  } else {
    console.log(`\n  DRY-RUN only — re-run with --apply to write these ${candidates.length} value(s).`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  try { await pool.end(); } catch {}
  process.exit(1);
});

/**
 * One-shot backfill script — creates missing stock_movements ledger rows
 * for orders that are already in delivered/shipped status but have no
 * corresponding row in stock_movements.
 *
 * NEVER touches products.stock — purely an audit/history repair.
 * Also cleans up redundant manual adjustments when the real movements
 * make the total correct (e.g. a +1 manual patch that compensated for
 * a missing delivered movement).
 *
 * Run once:  npx tsx scripts/backfill-stock-movements.ts
 */

import { db } from "../server/db";
import {
  orders, orderItems, products, stockMovements,
} from "../shared/schema";
import { and, eq, inArray, sql, not } from "drizzle-orm";

const DELIVERED_STATUSES = ['delivered', 'livré', 'livre', 'livrée', 'Livré', 'Livrée'];
const SHIPPED_STATUSES   = [
  'in_progress', 'expédié', 'Attente De Ramassage', 'transit',
  'unreachable', 'En Cours De Retour', 'refused', 'Retour Recu',
  'confirme', 'confirme_reporte',
];
const ALL_ADVANCED   = [...DELIVERED_STATUSES, ...SHIPPED_STATUSES];
const DELIVERED_SET  = new Set(DELIVERED_STATUSES);

async function run() {
  console.log("=== Backfill stock_movements — audit trail repair ===\n");

  // ── 1. Fetch all stores (we apply the backfill across every store) ──────
  const allOrders = await db
    .select({
      id: orders.id,
      storeId: orders.storeId,
      orderNumber: orders.orderNumber,
      status: orders.status,
      updatedAt: orders.updatedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(inArray(orders.status, ALL_ADVANCED));

  if (allOrders.length === 0) {
    console.log("No advanced-status orders found — nothing to do.");
    process.exit(0);
  }

  const orderIds = allOrders.map(o => o.id);
  const orderMeta = new Map(allOrders.map(o => [o.id, o]));

  console.log(`Found ${allOrders.length} orders in advanced statuses.`);

  // ── 2. All order_items linked to a product ───────────────────────────────
  const allItems = await db
    .select()
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderIds),
        sql`${orderItems.productId} IS NOT NULL`,
      )
    );

  console.log(`Found ${allItems.length} order_items with linked products.`);

  // ── 3. Existing (shipped|delivered) movements → skip these ───────────────
  const existingMovs = await db
    .select({ orderId: stockMovements.orderId, productId: stockMovements.productId })
    .from(stockMovements)
    .where(
      and(
        inArray(stockMovements.orderId, orderIds),
        inArray(stockMovements.type, ['shipped', 'delivered']),
      )
    );
  const movKey = new Set(existingMovs.map(m => `${m.orderId}:${m.productId}`));

  console.log(`Found ${existingMovs.length} existing shipped/delivered movements (will skip these).\n`);

  // ── 4. Insert missing movements ──────────────────────────────────────────
  let created = 0;
  const byProduct: Record<number, { productId: number; count: number; totalQty: number }> = {};

  for (const item of allItems) {
    if (!item.productId) continue;
    const key = `${item.orderId}:${item.productId}`;
    if (movKey.has(key)) continue; // already exists

    const meta    = orderMeta.get(item.orderId)!;
    const qty     = item.quantity || 1;
    const isDeliv = DELIVERED_SET.has(meta.status);
    const movType = isDeliv ? 'delivered' : 'shipped';
    const movDate = meta.updatedAt ?? meta.createdAt ?? new Date();
    const reason  = isDeliv
      ? `Commande #${meta.orderNumber} livrée`
      : `Expédition commande #${meta.orderNumber}`;

    await db.insert(stockMovements).values({
      storeId:   meta.storeId!,
      productId: item.productId,
      variantId: (item as any).variantId ?? null,
      type:      movType,
      quantity:  -qty,
      orderId:   item.orderId,
      reason,
      createdAt: movDate,
    });

    movKey.add(key); // guard against duplicates within this run
    created++;

    if (!byProduct[item.productId]) byProduct[item.productId] = { productId: item.productId, count: 0, totalQty: 0 };
    byProduct[item.productId].count++;
    byProduct[item.productId].totalQty += qty;

    console.log(
      `  ✅ [${movType}] product=${item.productId} order=#${meta.orderNumber} ` +
      `qty=-${qty} date=${movDate.toISOString().slice(0,10)}`
    );
  }

  console.log(`\n→ Created ${created} missing movement(s) across ${Object.keys(byProduct).length} product(s).`);

  // ── 5. For each affected product: check if a manual adjustment is now
  //       redundant and can be removed for a cleaner history.
  //
  //       Logic: compute what the stock SHOULD be from movements alone:
  //         initial_restock (sum of restock type) + all negative movements
  //       If that equals products.stock and there's a manual "adjustment"
  //       movement that was clearly a compensating patch (reason contains
  //       "manuelle" or "ajustement"), remove it.
  // ────────────────────────────────────────────────────────────────────────
  let cleaned = 0;

  for (const productId of Object.keys(byProduct).map(Number)) {
    // Fetch current stock
    const [prod] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId));
    if (!prod) continue;

    // All movements for this product
    const movs = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));

    // Sum without manual adjustments
    const restockTotal  = movs.filter(m => m.type === 'restock').reduce((s, m) => s + m.quantity, 0);
    const outTotal      = movs.filter(m => m.quantity < 0).reduce((s, m) => s + m.quantity, 0);
    const manualMovs    = movs.filter(m =>
      m.type === 'adjustment' ||
      (m.reason && (m.reason.toLowerCase().includes('manuelle') || m.reason.toLowerCase().includes('ajustement')))
    );
    const manualTotal   = manualMovs.reduce((s, m) => s + m.quantity, 0);

    // If removing the manual adjustment(s) still gives the right stock balance
    const stockWithoutManual = restockTotal + outTotal; // restockTotal positive, outTotal negative
    if (stockWithoutManual === prod.stock && manualTotal !== 0) {
      // Safe to remove — the real movements now fully explain the current stock
      for (const m of manualMovs) {
        await db.delete(stockMovements).where(eq(stockMovements.id, m.id));
        console.log(
          `  🧹 Removed redundant manual adjustment id=${m.id} qty=${m.quantity} ` +
          `reason="${m.reason}" for product=${productId}`
        );
        cleaned++;
      }
    } else if (manualMovs.length > 0) {
      console.log(
        `  ⚠️  Kept manual adjustment(s) for product=${productId} — ` +
        `balance without them: ${stockWithoutManual}, actual stock: ${prod.stock} ` +
        `(diff=${prod.stock - stockWithoutManual})`
      );
    }
  }

  console.log(`\n→ Removed ${cleaned} redundant manual adjustment(s).`);
  console.log("\n=== Done ===");
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

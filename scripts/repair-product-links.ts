/**
 * scripts/repair-product-links.ts
 * 
 * Repairs corrupted order_items.product_id caused by the broken normStr() regex
 * that mapped all Arabic product names to the same empty string → all resolved
 * to the first Arabic product in the store (typically SKU 0013).
 *
 * Usage:
 *   npx tsx scripts/repair-product-links.ts           # dry-run (shows what WOULD change)
 *   npx tsx scripts/repair-product-links.ts --apply   # applies corrections + recalculates stock
 */

import "../server/db"; // ensure pool is configured
import { db, pool } from "../server/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { orders, orderItems, products, productVariants, stockMovements } from "../shared/schema";
import { resolveProductId } from "../server/services/variants";

const APPLY = process.argv.includes("--apply");

async function run() {
  console.log(`\n━━━ Product Link Repair Script ━━━`);
  console.log(`Mode: ${APPLY ? "🔴 APPLY (writes to DB)" : "🟡 DRY-RUN (read-only)"}\n`);

  // ── 1. Load all stores ──────────────────────────────────────────────────────
  const allStores = await db.selectDistinct({ storeId: orders.storeId }).from(orders);
  console.log(`Stores found: ${allStores.length}`);

  let grandTotalMismatches = 0;
  let grandTotalCorrected  = 0;

  for (const { storeId } of allStores) {
    if (!storeId) continue;
    console.log(`\n── Store ${storeId} ──`);

    // Load products + variants for this store
    const storeProducts = await db.select().from(products).where(eq(products.storeId, storeId));
    const allVariants   = await db.select({ productId: productVariants.productId, name: productVariants.name })
      .from(productVariants).where(eq(productVariants.storeId, storeId));

    const variantsByProd = new Map<number, { name: string }[]>();
    for (const v of allVariants) {
      if (!variantsByProd.has(v.productId)) variantsByProd.set(v.productId, []);
      variantsByProd.get(v.productId)!.push({ name: v.name });
    }
    const storeProdsWithVariants = storeProducts.map(p => ({
      id: p.id, name: p.name,
      variants: variantsByProd.get(p.id) || [],
    }));
    const productNameById = new Map(storeProducts.map(p => [p.id, p.name]));

    // Load order_items with raw_product_name for this store
    const items = await db
      .select({
        oi_id: orderItems.id,
        orderId: orderItems.orderId,
        rawProductName: orderItems.rawProductName,
        currentProductId: orderItems.productId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.storeId, storeId),
          sql`${orderItems.rawProductName} IS NOT NULL`,
          sql`${orderItems.rawProductName} != ''`,
        )
      );

    console.log(`  order_items with raw_product_name: ${items.length}`);
    if (items.length === 0) continue;

    // Identify mismatches
    type Fix = {
      oi_id: number; orderId: number;
      rawProductName: string;
      oldProductId: number | null; newProductId: number | null;
    };
    const toFix: Fix[] = [];

    for (const item of items) {
      const { productId: computedId } = resolveProductId(item.rawProductName || '', storeProdsWithVariants);
      if (computedId === item.currentProductId) continue;           // correct already
      if (!computedId && !item.currentProductId) continue;          // both null — no change
      toFix.push({
        oi_id: item.oi_id,
        orderId: item.orderId,
        rawProductName: item.rawProductName || '',
        oldProductId: item.currentProductId ?? null,
        newProductId: computedId,
      });
    }

    grandTotalMismatches += toFix.length;
    console.log(`  Mismatches detected: ${toFix.length}`);

    if (toFix.length === 0) { console.log("  ✅ All correct."); continue; }

    // Print preview (first 20)
    const preview = toFix.slice(0, 20);
    console.log(`\n  Preview (first ${preview.length} of ${toFix.length}):`);
    for (const f of preview) {
      const oldName = f.oldProductId ? (productNameById.get(f.oldProductId) ?? `id=${f.oldProductId}`) : "null";
      const newName = f.newProductId ? (productNameById.get(f.newProductId) ?? `id=${f.newProductId}`) : "NULL (non reconnu)";
      console.log(`    order_item #${f.oi_id} | "${f.rawProductName}"`);
      console.log(`      FROM: ${oldName}  →  TO: ${newName}`);
    }
    if (toFix.length > 20) console.log(`    … and ${toFix.length - 20} more.`);

    if (!APPLY) continue;

    // ── 2. Apply corrections ────────────────────────────────────────────────
    console.log(`\n  Applying ${toFix.length} correction(s)…`);
    const affectedProductIds = new Set<number>();

    for (const fix of toFix) {
      // 2a. Update order_items.product_id
      await db.update(orderItems)
        .set({ productId: fix.newProductId } as any)
        .where(eq(orderItems.id, fix.oi_id));

      if (fix.oldProductId) affectedProductIds.add(fix.oldProductId);
      if (fix.newProductId) affectedProductIds.add(fix.newProductId);

      // 2b. Update or delete stock_movements for this order × old product
      if (fix.oldProductId) {
        if (fix.newProductId) {
          await db.update(stockMovements)
            .set({ productId: fix.newProductId })
            .where(and(
              eq(stockMovements.storeId, storeId),
              eq(stockMovements.orderId, fix.orderId),
              eq(stockMovements.productId, fix.oldProductId),
            ));
        } else {
          // No valid product → remove bogus movement
          await db.delete(stockMovements)
            .where(and(
              eq(stockMovements.storeId, storeId),
              eq(stockMovements.orderId, fix.orderId),
              eq(stockMovements.productId, fix.oldProductId),
            ));
        }
      }
      grandTotalCorrected++;
    }

    // ── 3. Recalculate products.stock for affected products ──────────────────
    console.log(`\n  Recalculating stock for ${affectedProductIds.size} product(s)…`);
    for (const pid of affectedProductIds) {
      const movs = await db
        .select({ type: stockMovements.type, quantity: stockMovements.quantity })
        .from(stockMovements)
        .where(and(eq(stockMovements.storeId, storeId), eq(stockMovements.productId, pid)));

      let newStock = 0;
      for (const m of movs) {
        const qty = Number(m.quantity ?? 1);
        if (m.type === "shipped" || m.type === "delivered") newStock -= qty;
        else newStock += qty;
      }
      newStock = Math.max(0, newStock);

      await db.update(products)
        .set({ stock: newStock })
        .where(and(eq(products.id, pid), eq(products.storeId, storeId)));

      console.log(`    Product #${pid} "${productNameById.get(pid) ?? '?'}" → stock = ${newStock}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n━━━ Summary ━━━`);
  console.log(`Total mismatches found : ${grandTotalMismatches}`);
  if (APPLY) {
    console.log(`Total corrections applied: ${grandTotalCorrected}`);
    console.log(`✅ Done. Run without --apply to verify no mismatches remain.`);
  } else {
    console.log(`Run with --apply to fix them.`);
  }

  await pool.end();
}

run().catch(err => {
  console.error("Script failed:", err);
  pool.end();
  process.exit(1);
});

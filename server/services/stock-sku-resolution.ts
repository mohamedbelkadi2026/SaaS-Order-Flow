import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { orders, orderItems, products, productVariants } from "@shared/schema";

type StockItem = { id?: number; productId?: number | null; sku?: string | null; variantInfo?: string | null };

/** Resolve an unlinked item by a unique SKU in its own merchant's active catalog.
 * Variant SKUs are independent of the parent SKU and imported product title.
 * Never overwrite an explicit product link or guess between duplicate SKUs.
 */
export async function resolveStockSkuItems<T extends StockItem>(database: any, storeId: number, items: T[]): Promise<T[]> {
  const skus = [...new Set(items.filter(i => i.productId == null).map(i => i.sku?.trim()).filter((s): s is string => !!s))];
  if (!skus.length) return items;
  const [parents, variants] = await Promise.all([
    database.select({ productId: products.id, sku: products.sku }).from(products).where(and(
      eq(products.storeId, storeId), isNull(products.archivedAt), inArray(sql`trim(${products.sku})`, skus),
    )),
    database.select({ productId: products.id, sku: productVariants.sku, variantInfo: productVariants.name })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(and(
        eq(products.storeId, storeId), isNull(products.archivedAt), inArray(sql`trim(${productVariants.sku})`, skus),
      )),
  ]);
  const matches = [...parents, ...variants];
  return items.map(item => {
    if (item.productId != null || !item.sku?.trim()) return item;
    const candidates = matches.filter(m => m.sku?.trim() === item.sku!.trim());
    if (candidates.length !== 1) return item;
    const match = candidates[0];
    return { ...item, productId: match.productId, variantInfo: item.variantInfo || match.variantInfo || null };
  });
}

/** Persist only previously unlinked items, scoped to the locked owning order. */
export async function linkStockSkuItems<T extends StockItem>(database: any, orderId: number, storeId: number, items: T[]): Promise<T[]> {
  const [owner] = await database.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)));
  if (!owner) return items;
  const resolved = await resolveStockSkuItems(database, storeId, items);
  const linked: T[] = [];
  for (let index = 0; index < items.length; index++) {
    const before = items[index], after = resolved[index];
    if (before.productId == null && after.productId != null && before.id != null) {
      const [saved] = await database.update(orderItems).set({ productId: after.productId, variantInfo: after.variantInfo })
        .where(and(eq(orderItems.id, before.id), eq(orderItems.orderId, orderId), isNull(orderItems.productId))).returning();
      linked.push(saved || before);
    } else linked.push(before);
  }
  return linked;
}

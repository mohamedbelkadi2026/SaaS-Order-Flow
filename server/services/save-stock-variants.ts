import { and, eq } from 'drizzle-orm';
import { products, productVariants, stockMovements } from '@shared/schema';

type VariantInput = { name: string; sku?: string | null; stock: number; costPrice: number; sellingPrice: number };

// A product edit must preserve each variant's ledger identity. The old
// delete/reinsert path orphaned shipment rows even when no variant changed.
export async function saveStockVariants(database: any, productId: number, storeId: number, userId: number, incoming: VariantInput[]) {
  await database.transaction(async (tx: any) => {
    const owner = await tx.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, storeId))).for('update');
    if (owner.length !== 1) throw new Error('Produit introuvable');
    const previous = await tx.select().from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.storeId, storeId))).for('update');
    const keys = incoming.map(v => v.sku?.trim() ? `sku:${v.sku.trim()}` : `name:${v.name}`);
    if (new Set(keys).size !== keys.length) throw new Error('Variantes dupliquées');
    const remaining = new Map<number, any>(previous.map((v: any) => [v.id, v]));
    for (const input of incoming) {
      const sku = input.sku?.trim() || null;
      let matches = Array.from(remaining.values()).filter((v: any) => sku ? v.sku?.trim() === sku : v.name === input.name);
      if (!matches.length) matches = Array.from(remaining.values()).filter((v: any) => v.name === input.name);
      if (matches.length > 1) throw new Error('Identité de variante ambiguë');
      // Ambiguous SKU/name matches must never silently steal another identity.
      const old = matches.length === 1 ? matches[0] : undefined;
      const values = { ...input, sku, productId, storeId };
      const [saved] = old
        ? await tx.update(productVariants).set(values).where(eq(productVariants.id, old.id)).returning()
        : await tx.insert(productVariants).values(values).returning();
      if (old) remaining.delete(old.id);
      const delta = input.stock - (old?.stock || 0);
      if (delta) await tx.insert(stockMovements).values({
        storeId, productId, variantId: saved.id, userId,
        type: old ? 'adjustment' : 'restock', quantity: delta,
        reason: old ? `Édition manuelle variante ${input.name} (${old.stock} → ${input.stock})` : `Stock initial — variante ${input.name}`,
      });
    }
    for (const old of Array.from(remaining.values())) {
      if (old.stock) await tx.insert(stockMovements).values({
        storeId, productId, variantId: old.id, userId, type: 'adjustment', quantity: -old.stock,
        reason: `Suppression variante ${old.name} (${old.stock} → 0)`,
      });
      await tx.delete(productVariants).where(eq(productVariants.id, old.id));
    }
    await tx.update(products).set({ hasVariants: incoming.length ? 1 : 0 })
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)));
  });
}

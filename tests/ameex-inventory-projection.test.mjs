import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

// Exercise the actual inventory response projection used to reopen the edit
// form, without importing storage.ts (which connects to a database on import).
const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const method = source.slice(source.indexOf("  async getInventoryStats("));
const projection = method.match(/productStats\.push\((\{[\s\S]*?\n      \})\);/)?.[1];
assert.ok(projection, "Inventory product response projection must exist");

for (const hasVariants of [0, 1]) {
  for (const ameexProductId of ["ameex-product-123", "replacement-product-456", null]) {
    test(`inventory preserves Ameex ID ${ameexProductId}, variants=${hasVariants}`, () => {
      const product = {
        id: 1, name: "Test product", stock: 0, costPrice: 0, sellingPrice: 0,
        hasVariants, ameexProductId,
      };
      const result = runInNewContext(`(${projection})`, {
        p: product, variants: [], totalStock: 0, recu: 0, sortie: 0,
        inTransit: 0, available: 0, confirmRate: 0, deliverRate: 0,
        totalOrdered: 0, totalConfirmedQty: 0, lastRestock: undefined,
      });
      assert.ok(Object.hasOwn(result, "ameexProductId"));
      assert.equal(result.ameexProductId, ameexProductId);
      // The edit dialog loads this response and submits blank input as null.
      const reopenedValue = result.ameexProductId || "";
      assert.equal(reopenedValue.trim() || null, ameexProductId);
    });
  }
}
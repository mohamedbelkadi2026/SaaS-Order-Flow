// The form keeps the unallocated balance separate from variant quantities.
// Display their total without posting it back as another parent balance.
export function stockWithVariants(baseStock: number | string, variants: ReadonlyArray<{ stock: number | string }>): number {
  return (Number(baseStock) || 0) + variants.reduce((total, variant) => total + (Number(variant.stock) || 0), 0);
}

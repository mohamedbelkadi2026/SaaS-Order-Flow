/**
 * Shared variant-resolution utilities.
 * Used by routes (order creation / backfill) and profit computation.
 */

// Normalise: strip Arabic diacritics, punctuation, extra spaces, lowercase.
export function normStr(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split "Parent Name - Variant" into { base, suffix }.
// Matches the LAST separator occurrence so "Nike Air Max - Men - 42" → base="Nike Air Max - Men", suffix="42".
export function splitVariant(raw: string): { base: string; suffix: string | null } {
  const m = raw.match(/^(.*?)(?:\s*[-–\/|]\s*)([^-–\/|]{1,30})$/);
  if (!m) return { base: raw.trim(), suffix: null };
  return { base: m[1].trim(), suffix: m[2].trim() };
}

// Resolve a raw order item name to a catalog product.
// Returns { productId, variantName } where variantName is the suffix (e.g. "40") or null.
export function resolveProductId(
  rawName: string,
  storeProducts: { id: number; name: string }[],
): { productId: number | null; variantName: string | null } {
  const n = normStr;
  const rawNorm = n(rawName);

  // 1) Exact product-name match
  const exact = storeProducts.find(p => n(p.name) === rawNorm);
  if (exact) return { productId: exact.id, variantName: null };

  // 2) Strip variant suffix and match the BASE to a parent product
  const { base, suffix } = splitVariant(rawName);
  if (suffix && base !== rawName) {
    const parent = storeProducts.find(p => n(p.name) === n(base));
    if (parent) return { productId: parent.id, variantName: suffix };
  }

  return { productId: null, variantName: null };
}

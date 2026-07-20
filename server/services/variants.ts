/**
 * Shared variant-resolution utilities.
 * Used by routes (order creation / backfill) and profit computation.
 */

// Normalise: strip diacritics, collapse all whitespace variants, lowercase.
// Handles double spaces, non-breaking spaces (U+00A0), unicode spaces, tabs
// so "Cuir  Rf" (double espace catalogue) === "Cuir Rf" (commande espace simple).
export function normStr(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')          // strip combining diacritics
    .replace(/[\u00A0\u2000-\u200B\t\n\r]/g, ' ') // non-breaking / unicode spaces → normal space
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')              // punctuation & repeated spaces → single space
    .trim()
    .replace(/\s+/g, ' ');
}

// Split "Parent Name - Variant" into { base, suffix }.
// Matches the LAST separator occurrence so "Nike Air Max - Men - 42" → base="Nike Air Max - Men", suffix="42".
export function splitVariant(raw: string): { base: string; suffix: string | null } {
  const m = raw.match(/^(.*?)(?:\s*[-–\/|]\s*)([^-–\/|]{1,30})$/);
  if (!m) return { base: raw.trim(), suffix: null };
  return { base: m[1].trim(), suffix: m[2].trim() };
}

export type ProductWithVariants = {
  id: number;
  name: string;
  variants?: { name: string }[];
};

// Resolve a raw order item name to a catalog product.
// Returns { productId, variantName } where variantName is the suffix (e.g. "40") or null.
export function resolveProductId(
  rawName: string,
  storeProducts: ProductWithVariants[],
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

  // 3) No separator — "Nom Produit 42" matched against KNOWN variant names of each product.
  for (const p of storeProducts) {
    if (!p.variants || p.variants.length === 0) continue;
    for (const v of p.variants) {
      if (n(`${p.name} ${v.name}`) === rawNorm) {
        return { productId: p.id, variantName: v.name };
      }
    }
  }

  return { productId: null, variantName: null };
}

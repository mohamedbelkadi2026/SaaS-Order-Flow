/**
 * Shared variant-resolution utilities.
 * Used by routes (order creation / backfill) and profit computation.
 */

// Normalise: strip diacritics, collapse all whitespace variants, lowercase.
// CRITICAL: the regex MUST preserve Arabic characters (U+0600-U+06FF and
// related blocks) so Arabic product names normalise to distinct strings
// instead of all collapsing to the same empty/space string.
// The old broken version used [^a-z0-9]+ which stripped every Arabic char.
export function normStr(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')              // strip Latin combining diacritics
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')  // strip Arabic tashkeel / tatweel
    .replace(/[\u00A0\u2000-\u200B\t\n\r]/g, ' ') // non-breaking / unicode spaces → normal space
    .toLowerCase()
    // Keep: a-z, 0-9, Arabic (U+0600–06FF), Arabic Supplement (0750–077F),
    // Arabic Extended-A (08A0–08FF), Arabic Presentation Forms-A (FB50–FDFF),
    // Arabic Presentation Forms-B (FE70–FEFF).  Everything else → space.
    .replace(/[^a-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, ' ')
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
//
// SAFETY RULES (never match silently when uncertain):
//   1. If rawNorm is empty or < 2 meaningful chars after normStr → return null (never guess).
//   2. If multiple catalog products share the same normStr (ambiguous) → return null instead of picking first.
//   3. Same ambiguity guard for variant-base matching in step 2.
export function resolveProductId(
  rawName: string,
  storeProducts: ProductWithVariants[],
): { productId: number | null; variantName: string | null } {
  const n = normStr;
  const rawNorm = n(rawName);

  // Guard 1: empty or trivially short normalised string — never guess
  if (!rawNorm || rawNorm.replace(/\s/g, '').length < 2) {
    return { productId: null, variantName: null };
  }

  // 1) Exact product-name match — guard against ambiguity across catalog
  const exactMatches = storeProducts.filter(p => n(p.name) === rawNorm);
  if (exactMatches.length === 1) return { productId: exactMatches[0].id, variantName: null };
  if (exactMatches.length > 1) {
    // Multiple products have the same normalised name — ambiguous, do not guess
    return { productId: null, variantName: null };
  }

  // 2) Strip variant suffix and match the BASE to a parent product
  const { base, suffix } = splitVariant(rawName);
  if (suffix && base !== rawName) {
    const baseNorm = n(base);
    if (baseNorm && baseNorm.replace(/\s/g, '').length >= 2) {
      const parentMatches = storeProducts.filter(p => n(p.name) === baseNorm);
      if (parentMatches.length === 1) return { productId: parentMatches[0].id, variantName: suffix };
      if (parentMatches.length > 1) return { productId: null, variantName: null };
    }
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

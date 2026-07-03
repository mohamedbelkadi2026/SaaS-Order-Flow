// ── Single source of truth for order-status groupings ─────────────────────
// Every place that counts "confirmées", "livrées", or "expédiées" (dashboard
// cards, Statistiques, products table, commissions summary, agent my-stats)
// MUST import these sets instead of re-declaring its own — otherwise the
// numbers drift apart (e.g. LIVRÉES card = 10 vs commissions "5 livrées").

// CONFIRMED = all statuses an order passes through after agent confirmation
// (cumulative: once confirmed, always counted as confirmed regardless of
// shipping stage).
export const CONFIRMED_STATUSES = [
  'confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused',
  'Attente De Ramassage', 'in_progress', 'retourné',
] as const;

// DELIVERED = any "livré" status. Carriers normalize variants to
// 'delivered', but raw imports/webhooks may store French variants, so we
// accept them all.
export const DELIVERED_STATUSES = [
  'delivered', 'livré', 'livre', 'livrée', 'Livré', 'Livrée',
] as const;

// SHIPPED = order left the warehouse (any carrier stage) OR has a tracking
// number (checked separately by callers).
export const SHIPPED_STATUSES = [
  'expédié', 'Attente De Ramassage', 'Ramassé', 'in_progress',
  'En cours de livraison', 'En transit', 'delivered', 'livré', 'livre',
  'livrée', 'Livré', 'Livrée', 'Tentative échouée', 'retourné',
  'Retour Recu', 'refused', 'En cours de réception',
] as const;

export const CONFIRMED_STATUS_SET = new Set<string>(CONFIRMED_STATUSES);
export const DELIVERED_STATUS_SET = new Set<string>(DELIVERED_STATUSES);
export const SHIPPED_STATUS_SET = new Set<string>(SHIPPED_STATUSES);

// ── Subtractive "confirmed (cumulative)" definition ────────────────────────
// The old approach (CONFIRMED_STATUSES above) enumerated every status that
// counts as confirmed. But carrier/transit statuses are numerous and keep
// growing (e.g. 'En transit', 'Ramassé', 'Sorti pour livraison', 'Arrivé au
// hub', 'Confirmé par livreur', ...), so any status missing from that list
// silently fell OUT of "confirmed" once the order shipped — producing the
// impossible result CONFIRMÉES < EXPÉDIÉS.
//
// Instead, define the (small, stable) set of statuses that mean "never
// reached confirmation" and treat everything else as confirmed. This
// guarantees confirmed >= shipped >= delivered by construction.
export const NOT_CONFIRMED_STATUSES = new Set<string>([
  'nouveau', 'rappel', 'Injoignable', 'boite vocale',
  'Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)',
]);

// SQL-friendly array form for use in `NOT IN (...)` filters.
export const NOT_CONFIRMED_STATUSES_ARRAY = Array.from(NOT_CONFIRMED_STATUSES);

/**
 * A lead is "confirmed (cumulative)" once an agent confirms it; it STAYS
 * confirmed through every downstream carrier/transit/delivered/returned
 * status. Only statuses that mean the order never reached confirmation
 * (new/uncontacted, cancelled, "no answer") are excluded.
 */
export function isConfirmedCumulative(status: string | null | undefined): boolean {
  if (!status) return false;
  if (status.startsWith('Pas de réponse')) return false;
  if (NOT_CONFIRMED_STATUSES.has(status)) return false;
  return true;
}

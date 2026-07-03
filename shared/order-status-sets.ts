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

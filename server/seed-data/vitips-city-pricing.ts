// Tarifs Vitips Express — définis manuellement (pas de données historiques
// disponibles pour ce transporteur, contrairement à Express Coursier).
// Toute ville absente de la liste ci-dessous utilise le tarif par défaut.
export const VITIPS_DEFAULT_CITY_PRICE_DH = 35;

// Seule exception connue à ce jour : Casablanca.
export const VITIPS_CITY_PRICING_SEED: [string, number][] = [
  ["Casablanca", 20],
];

// ─── Carrier City Lists & Auto-match Utility ─────────────────────────────────
// Each carrier in Morocco has a specific set of city names they accept.
// Using an unrecognized city name causes "Ville invalide" errors at dispatch time.

export const DIGYLOG_CITIES: string[] = [
  "Agadir", "Afourer", "Aghbala", "Ain El Aouda", "Ain Harrouda", "Ain Taoujdate",
  "Ait Melloul", "Al Hoceima", "Assa", "Asilah", "Azemmour", "Azilal", "Azrou",
  "Bejaad", "Ben Ahmed", "Ben Guerir", "Beni Mellal", "Berkane", "Berrechid",
  "Bouarfa", "Boujdour", "Bouskoura",
  "Casablanca", "Chefchaouen",
  "Dakhla", "Dcheira El Jihadia",
  "El Hajeb", "El Jadida", "El Kelaa des Sraghna", "Errachidia", "Erfoud", "Essaouira",
  "Fès", "Fnideq", "Figuig",
  "Guelmim",
  "Ifrane", "Inezgane",
  "Jerada",
  "Kénitra", "Khémisset", "Khénifra", "Khouribga", "Ksar El Kebir",
  "Laâyoune", "Larache",
  "Marrakech", "Martil", "Mdiq", "Meknès", "Midelt", "Mohammedia",
  "Moulay Bousselham",
  "Nador",
  "Oued Zem", "Oujda", "Ouarzazate", "Ouled Teima",
  "Rabat", "Rissani",
  "Safi", "Salé", "Selouane", "Settat", "Sidi Bennour", "Sidi Ifni", "Sidi Kacem",
  "Sidi Slimane", "Sidi Yahia El Gharb", "Souk El Arbaa",
  "Tahanaout", "Tanger", "Taourirt", "Taroudant", "Taza", "Temara", "Tétouan",
  "Tinghir", "Tiznit",
  "Zagora",
].sort();

export const CATHEDIS_CITIES: string[] = [
  "Agadir", "Ait Melloul", "Al Hoceima", "Asilah",
  "Ben Guerir", "Beni Mellal", "Berkane", "Berrechid",
  "Casablanca", "Chefchaouen",
  "Dakhla", "Dcheira El Jihadia",
  "El Jadida", "Errachidia", "Essaouira",
  "Fès", "Fnideq",
  "Guelmim",
  "Ifrane", "Inezgane",
  "Jerada",
  "Kénitra", "Khémisset", "Khénifra", "Khouribga",
  "Laâyoune", "Larache",
  "Marrakech", "Meknès", "Mohammedia",
  "Nador",
  "Oujda", "Ouarzazate", "Ouled Teima",
  "Rabat",
  "Safi", "Salé", "Settat", "Sidi Kacem", "Sidi Slimane", "Souk El Arbaa",
  "Tanger", "Taourirt", "Taroudant", "Taza", "Temara", "Tétouan", "Tiznit",
  "Zagora",
].sort();

export const AMANA_CITIES: string[] = [
  "Agadir", "Ait Melloul", "Al Hoceima",
  "Beni Mellal", "Berkane", "Berrechid",
  "Casablanca", "Chefchaouen",
  "Dakhla", "El Jadida", "Errachidia", "Essaouira",
  "Fès", "Guelmim", "Ifrane", "Inezgane",
  "Kénitra", "Khémisset", "Khénifra", "Khouribga",
  "Laâyoune", "Larache",
  "Marrakech", "Meknès", "Mohammedia",
  "Nador", "Oujda", "Ouarzazate", "Ouled Teima",
  "Rabat", "Safi", "Salé", "Settat",
  "Sidi Kacem", "Sidi Slimane", "Souk El Arbaa",
  "Tanger", "Taourirt", "Taroudant", "Taza", "Temara", "Tétouan", "Tiznit",
  "Zagora",
].sort();

export const MOROCCAN_CITIES: string[] = [
  "Agadir", "Afourer", "Ain El Aouda", "Ain Harrouda", "Ain Taoujdate",
  "Ait Melloul", "Al Hoceima", "Assa", "Asilah", "Azemmour", "Azilal", "Azrou",
  "Bejaad", "Ben Ahmed", "Ben Guerir", "Beni Mellal", "Berkane", "Berrechid",
  "Boujdour", "Bouskoura",
  "Casablanca", "Chefchaouen",
  "Dakhla", "Dcheira El Jihadia",
  "El Hajeb", "El Jadida", "El Kelaa des Sraghna", "Errachidia", "Erfoud", "Essaouira",
  "Fès", "Fnideq",
  "Guelmim",
  "Ifrane", "Inezgane",
  "Jerada",
  "Kénitra", "Khémisset", "Khénifra", "Khouribga", "Ksar El Kebir",
  "Laâyoune", "Larache",
  "Marrakech", "Martil", "Mdiq", "Meknès", "Midelt", "Mohammedia",
  "Nador",
  "Oued Zem", "Oujda", "Ouarzazate", "Ouled Teima",
  "Rabat",
  "Safi", "Salé", "Selouane", "Settat", "Sidi Bennour", "Sidi Ifni", "Sidi Kacem",
  "Sidi Slimane", "Souk El Arbaa",
  "Tanger", "Taourirt", "Taroudant", "Taza", "Temara", "Tétouan",
  "Tinghir", "Tiznit",
  "Zagora",
].sort();

/** Return the default city list for a given carrier provider name */
export function getDefaultCitiesForCarrier(provider: string): string[] {
  const p = (provider || "").toLowerCase();
  if (p.includes("digylog") || p.includes("ecotrack") || p.includes("eco-track")) return DIGYLOG_CITIES;
  if (p.includes("cathedis")) return CATHEDIS_CITIES;
  if (p.includes("amana") || p.includes("aramex")) return AMANA_CITIES;
  return MOROCCAN_CITIES;
}

/** Strip accents and lowercase for comparison */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .trim();
}

/** Known abbreviations → canonical city name */
const CITY_ALIASES: Record<string, string> = {
  casa: "Casablanca", csl: "Casablanca", casablanca: "Casablanca", "dar beida": "Casablanca",
  rbt: "Rabat", rabat: "Rabat",
  fes: "Fès", fez: "Fès", fas: "Fès",
  tangier: "Tanger", tangermed: "Tanger", tanger: "Tanger",
  marrakesh: "Marrakech", mrc: "Marrakech",
  meknes: "Meknès", mkn: "Meknès",
  kenitra: "Kénitra", kntr: "Kénitra",
  tetouane: "Tétouan", tetouan: "Tétouan", titwan: "Tétouan",
  laayoune: "Laâyoune", ayoun: "Laâyoune",
  taroudnat: "Taroudant", taroudant: "Taroudant",
  khmisset: "Khémisset", khemisset: "Khémisset",
  khnifra: "Khénifra", khenifra: "Khénifra",
  khouribga: "Khouribga",
  "beni mellal": "Beni Mellal", benmellal: "Beni Mellal", "beni-mellal": "Beni Mellal",
  inzgane: "Inezgane", inezgane: "Inezgane",
  "ait melloul": "Ait Melloul",
  mohammadia: "Mohammedia", mohammedia: "Mohammedia",
  sale: "Salé", sale2: "Salé",
  essaouira: "Essaouira",
  agadir: "Agadir",
  oujda: "Oujda",
  taza: "Taza",
  nador: "Nador",
  zagora: "Zagora",
  tiznit: "Tiznit",
  safi: "Safi",
  settat: "Settat",
  dakhla: "Dakhla",
  "el jadida": "El Jadida", "eljadida": "El Jadida", jdida: "El Jadida",
  "beni ansar": "Nador",
  berkane: "Berkane",
  larache: "Larache",
  ksar: "Ksar El Kebir",
  ouarzazate: "Ouarzazate", wzzt: "Ouarzazate",
  errachidia: "Errachidia",
  "guelmim": "Guelmim", goulimine: "Guelmim",
  temara: "Temara",
  "sidi kacem": "Sidi Kacem",
  "sidi slimane": "Sidi Slimane",
  "souk el arbaa": "Souk El Arbaa",
};

/**
 * Try to auto-match a raw city name to the closest city in the given list.
 * Returns the matched city name from the list, or null if no match found.
 */
export function findBestCityMatch(raw: string, cities: string[]): string | null {
  if (!raw || !cities.length) return null;

  const rawN = normalize(raw);
  if (!rawN) return null;

  // 1. Exact normalized match
  const exact = cities.find(c => normalize(c) === rawN);
  if (exact) return exact;

  // 2. Known alias → look it up in the city list
  const aliasTarget = CITY_ALIASES[rawN];
  if (aliasTarget) {
    const aliasMatch = cities.find(c => normalize(c) === normalize(aliasTarget));
    if (aliasMatch) return aliasMatch;
  }

  // 3. Starts-with: raw starts with city prefix (min 3 chars)
  if (rawN.length >= 3) {
    const sw = cities.find(c => normalize(c).startsWith(rawN));
    if (sw) return sw;
  }

  // 4. City starts with raw (min 3 chars)
  if (rawN.length >= 3) {
    const rs = cities.find(c => rawN.startsWith(normalize(c)) && normalize(c).length >= 3);
    if (rs) return rs;
  }

  // 5. Contains (both directions, min 4 chars)
  if (rawN.length >= 4) {
    const inc = cities.find(c => normalize(c).includes(rawN));
    if (inc) return inc;
    const inc2 = cities.find(c => rawN.includes(normalize(c)) && normalize(c).length >= 4);
    if (inc2) return inc2;
  }

  return null;
}

/**
 * Check if a city value is in the carrier's city list.
 * Returns true if the city is valid (found), false if not.
 * Returns null if no carrier-specific list is available (generic fallback → no warning).
 */
export function isCityValid(city: string, cities: string[], isCarrierSpecific: boolean): boolean | null {
  if (!city || !isCarrierSpecific) return null;
  return cities.some(c => normalize(c) === normalize(city));
}

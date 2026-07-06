// ─── Moroccan city name normalization + matching ────────────────────────────
// Used by resolveExpressCoursierCityId / resolveOzonExpressCityId to map a
// customer's free-text city (often Arabic script, misspelled, or with extra
// words) to the numeric city ID the carrier's API requires. Carriers reject
// city NAMEs outright, so a robust match here is what keeps orders shippable.

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

export function normalizeCityKey(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "";
  s = s.replace(ARABIC_DIACRITICS, "").replace(TATWEEL, "");
  s = s.toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip Latin accents
  // Strip common punctuation (keeps Latin/Arabic letters, digits, spaces —
  // avoids the \p{L} unicode-property regex, which needs an ES2018+ target).
  s = s.replace(/[.,;:!?'"()\[\]{}\/\\_\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function cityTokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

// Arabic script (and a few common Latin misspellings/abbreviations) → the
// canonical Latin city name used by Moroccan carrier APIs. Keys/values are
// raw strings — they get normalized below when the map is built.
const RAW_CITY_ALIASES: Record<string, string> = {
  // Casablanca
  "الدار البيضاء": "casablanca",
  "دار البيضاء": "casablanca",
  "كازابلانكا": "casablanca",
  "casa": "casablanca",
  // Rabat
  "الرباط": "rabat",
  // Fès / Fes
  "فاس": "fes",
  "fès": "fes",
  // Marrakech
  "مراكش": "marrakech",
  "marrakesh": "marrakech",
  // Tanger / Tangier
  "طنجة": "tanger",
  "tangier": "tanger",
  "tanja": "tanger",
  // Agadir
  "أكادير": "agadir",
  "اكادير": "agadir",
  // Meknès / Meknes
  "مكناس": "meknes",
  "meknès": "meknes",
  // Oujda
  "وجدة": "oujda",
  // Kénitra / Kenitra
  "القنيطرة": "kenitra",
  "kénitra": "kenitra",
  // Tétouan / Tetouan
  "تطوان": "tetouan",
  "tétouan": "tetouan",
  // Salé / Sale
  "سلا": "sale",
  "salé": "sale",
  // Safi
  "آسفي": "safi",
  "اسفي": "safi",
  // Mohammedia
  "المحمدية": "mohammedia",
  // El Jadida
  "الجديدة": "el jadida",
  "eljadida": "el jadida",
  // Béni Mellal / Beni Mellal
  "بني ملال": "beni mellal",
  // Nador
  "الناظور": "nador",
  // Khouribga
  "خريبكة": "khouribga",
  // Settat
  "سطات": "settat",
  // Berrechid
  "برشيد": "berrechid",
  // Khémisset / Khemisset
  "الخميسات": "khemisset",
  // Taza
  "تازة": "taza",
  // Larache
  "العرائش": "larache",
  // Ksar El Kébir
  "القصر الكبير": "ksar el kebir",
  // Guelmim
  "كلميم": "guelmim",
  // Errachidia
  "الرشيدية": "errachidia",
  // Ouarzazate
  "ورزازات": "ouarzazate",
  // Essaouira
  "الصويرة": "essaouira",
  // Ifrane
  "إفران": "ifrane",
  // Al Hoceima
  "الحسيمة": "al hoceima",
  // Chefchaouen
  "شفشاون": "chefchaouen",
  // Taourirt
  "تاوريرت": "taourirt",
  // Sidi Kacem
  "سيدي قاسم": "sidi kacem",
  // Sidi Slimane
  "سيدي سليمان": "sidi slimane",
  // Youssoufia
  "اليوسفية": "youssoufia",
  // Azrou
  "أزرو": "azrou",
  // Tiznit
  "تزنيت": "tiznit",
  // Fkih Ben Salah
  "الفقيه بن صالح": "fkih ben salah",
};

const CITY_ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(RAW_CITY_ALIASES)) {
    const nk = normalizeCityKey(k);
    if (nk) map[nk] = normalizeCityKey(v);
  }
  return map;
})();

/** Resolve a normalized key through the alias map (Arabic/variant → canonical Latin). No-op if not found. */
export function resolveCityAlias(normalizedKey: string): string {
  return CITY_ALIAS_MAP[normalizedKey] || normalizedKey;
}

export interface CityRow {
  externalId: string;
  nameNorm: string;
}

const isNumericId = (id: string) => /^\d+$/.test(id);

/**
 * Match a free-text city name against a carrier's synced city list.
 * Tries, in order: exact match, substring/"contains" fuzzy match,
 * token-based match (handles word order / extra words), startsWith match.
 * Tries both the raw normalized key and its alias-resolved canonical form.
 * Returns the numeric external ID, or null if genuinely unresolvable —
 * callers MUST fail fast on null rather than sending a city name to the API.
 */
export function matchCityId(cities: CityRow[], rawCityName: string): string | null {
  const key = normalizeCityKey(rawCityName);
  if (!key) return null;
  const aliasKey = resolveCityAlias(key);
  const candidates = Array.from(new Set([key, aliasKey]));

  // 1. Exact normalized match
  for (const cand of candidates) {
    const exact = cities.find(c => c.nameNorm === cand);
    if (exact && isNumericId(exact.externalId)) return exact.externalId;
  }

  // 2. Contains fuzzy — either direction (handles trailing/leading extra words)
  for (const cand of candidates) {
    const contains = cities.find(c => c.nameNorm.includes(cand) || cand.includes(c.nameNorm));
    if (contains && isNumericId(contains.externalId)) return contains.externalId;
  }

  // 3. Token-based — all significant tokens (len > 1) of one side appear in the other
  for (const cand of candidates) {
    const keyTokens = cityTokens(cand).filter(t => t.length > 1);
    if (keyTokens.length === 0) continue;
    const tokenMatch = cities.find(c => {
      const cityTokensArr = cityTokens(c.nameNorm).filter(t => t.length > 1);
      if (cityTokensArr.length === 0) return false;
      const allKeyTokensInCity = keyTokens.every(t => cityTokensArr.some(ct => ct.includes(t) || t.includes(ct)));
      const allCityTokensInKey = cityTokensArr.every(ct => keyTokens.some(t => t.includes(ct) || ct.includes(t)));
      return allKeyTokensInCity || allCityTokensInKey;
    });
    if (tokenMatch && isNumericId(tokenMatch.externalId)) return tokenMatch.externalId;
  }

  // 4. startsWith — either direction
  for (const cand of candidates) {
    const starts = cities.find(c => c.nameNorm.startsWith(cand) || cand.startsWith(c.nameNorm));
    if (starts && isNumericId(starts.externalId)) return starts.externalId;
  }

  return null;
}

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
  "dar beida": "casablanca",
  "bida": "casablanca",
  // Rabat
  "الرباط": "rabat",
  // Fès / Fes
  "فاس": "fes",
  "fès": "fes",
  "fez": "fes",
  // Marrakech
  "مراكش": "marrakech",
  "marrakesh": "marrakech",
  // Tanger / Tangier
  "طنجة": "tanger",
  "tangier": "tanger",
  "tanja": "tanger",
  "tanger ville": "tanger",
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
  "sale al jadida": "sale",
  "salé al jadida": "sale",
  "hay al jadida sale": "sale",
  // Safi
  "آسفي": "safi",
  "اسفي": "safi",
  "asfi": "safi",
  // Mohammedia
  "المحمدية": "mohammedia",
  // El Jadida
  "الجديدة": "el jadida",
  "eljadida": "el jadida",
  "el-jadida": "el jadida",
  // Béni Mellal / Beni Mellal
  "بني ملال": "beni mellal",
  "beni mllal": "beni mellal",
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
  // Rommani (near Khemisset)
  "روماني": "rommani",
  "rommani khemissat": "rommani",
  "rommani(khemissat)": "rommani",
  "rommanî": "rommani",
  // Taza
  "تازة": "taza",
  // Larache
  "العرائش": "larache",
  // Ksar El Kébir
  "القصر الكبير": "ksar el kebir",
  "ksar-el-kebir": "ksar el kebir",
  "ksar el-kebir": "ksar el kebir",
  "alcazarquivir": "ksar el kebir",
  // Guelmim
  "كلميم": "guelmim",
  "guelmim": "guelmim",
  // Errachidia
  "الرشيدية": "errachidia",
  "rashidiya": "errachidia",
  // Ouarzazate
  "ورزازات": "ouarzazate",
  // Essaouira
  "الصويرة": "essaouira",
  "mogador": "essaouira",
  // Ifrane
  "إفران": "ifrane",
  // Al Hoceima
  "الحسيمة": "al hoceima",
  "al hoceïma": "al hoceima",
  "alhucemas": "al hoceima",
  // Chefchaouen
  "شفشاون": "chefchaouen",
  "chaouen": "chefchaouen",
  "xauen": "chefchaouen",
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
  // Kelaa des Sraghna / Kelaat Sraghna — common real-order city
  "الكلعة": "kelaa des sraghna",
  "كلعة السراغنة": "kelaa des sraghna",
  "kelaa sraghna": "kelaa des sraghna",
  "kelaa seraghna": "kelaa des sraghna",
  "kalaat sraghna": "kelaa des sraghna",
  "kalaat es sraghna": "kelaa des sraghna",
  "kel aa sraghna": "kelaa des sraghna",
  "kelaat sraghna": "kelaa des sraghna",
  "klaa sraghna": "kelaa des sraghna",
  "klaa seraghna": "kelaa des sraghna",
  // Sidi Bennour
  "سيدي بنور": "sidi bennour",
  "sidi benour": "sidi bennour",
  "sidi bnou": "sidi bennour",
  // Martil (near Tetouan)
  "مرتيل": "martil",
  // Driouch (Oriental)
  "دريوش": "driouch",
  // Biougra (near Agadir)
  "بيوكرى": "biougra",
  "biougra": "biougra",
  "bioukra": "biougra",
  // Tinghir (South)
  "تنغير": "tinghir",
  "tinghir": "tinghir",
  "tinghr": "tinghir",
  // Taroudant
  "تارودانت": "taroudant",
  "taroudante": "taroudant",
  // Midelt
  "ميدلت": "midelt",
  // Zagora
  "زاكورة": "zagora",
  // Boulemane
  "بولمان": "boulemane",
  // El Hajeb
  "الحاجب": "el hajeb",
  // Sefrou
  "صفرو": "sefrou",
  // Jerada
  "جرادة": "jerada",
  // Berkane
  "بركان": "berkane",
  // Ouled Teima
  "أولاد تيمة": "ouled teima",
  "oulad teima": "ouled teima",
  // Ait Melloul (near Agadir)
  "أيت ملول": "ait melloul",
  "ayt melloul": "ait melloul",
  // Inzegane (near Agadir)
  "إنزكان": "inzegane",
  "inzegan": "inzegane",
  // Bouskoura (near Casablanca)
  "بوسكورة": "bouskoura",
  // Ben Slimane
  "بن سليمان": "ben slimane",
  "benslimane": "ben slimane",
  // Skhirat
  "الصخيرات": "skhirat",
  // Témara
  "تمارة": "temara",
  "témara": "temara",
  // Jemaa Shaim / Jemaa Lhsan
  "جماعة الشايم": "jemaa shaim",
  "jemaa-shaim": "jemaa shaim",
  "jmaa shaim": "jemaa shaim",
  // Souk Larbaa (near Kenitra)
  "سوق الأربعاء": "souk larbaa",
  "souk el arbaa": "souk larbaa",
  "souk-larbaa": "souk larbaa",
  // Ain Harrouda
  "عين الحروضة": "ain harrouda",
  // Had Soualem
  "هدالسواالم": "had soualem",
  // Oulmes
  "أولمس": "oulmes",
  // Khnichet
  "خنيشات": "khnichet",
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

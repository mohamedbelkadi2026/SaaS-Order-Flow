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
  s = s.replace(/[.,;:!?'"()\[\]{}\/\\_\-–—]+/g, " ");
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
 * Match a city name against a carrier's synced city list without guessing.
 * It accepts only a normalized exact match (case, accents, whitespace and
 * punctuation are ignored) or an explicit known alias. Substring, token and
 * prefix matching are deliberately forbidden: "Casablanca - Lissasfa" must
 * never silently resolve to another Casablanca neighbourhood.
 *
 * Returns a numeric external ID only when exactly one distinct ID matches.
 * Callers must fail fast on null rather than sending a different locality.
 */
export function matchCityId(cities: CityRow[], rawCityName: string): string | null {
  const key = normalizeCityKey(rawCityName);
  if (!key) return null;
  const aliasKey = resolveCityAlias(key);
  const candidates = Array.from(new Set([key, aliasKey]));

  // A synced name_norm may have been saved by older sync code that did not
  // strip punctuation. Normalize it again at read time for backward-compatible
  // strict comparison.
  for (const cand of candidates) {
    const ids = Array.from(new Set(
      cities
        .filter(c => normalizeCityKey(c.nameNorm) === cand && isNumericId(c.externalId))
        .map(c => c.externalId),
    ));
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) return null;
  }

  return null;
}

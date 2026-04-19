/**
 * carrier-service.ts
 * Real HTTP integration with Moroccan shipping carriers.
 *
 * Uses axios (not fetch) for robust timeout, SSL, and error handling.
 * SSL certificate verification is disabled to handle self-signed/expired
 * certificates common with Moroccan carrier APIs.
 *
 * Features:
 *   - Phone sanitization (+212 → 06/07 format)
 *   - Address/city/price pre-validation before any HTTP call
 *   - Full JSON payload logged to console before every request
 *   - Exact carrier error message surfaced to the UI
 *   - Timeout: 20 seconds (was 10)
 */

import axios, { AxiosError } from "axios";
import https from "https";

// ── SSL agent — bypasses self-signed / expired certs (common in .ma APIs) ────
const SSL_AGENT = new https.Agent({ rejectUnauthorized: false });

// ── Carrier API base URLs ─────────────────────────────────────────────────────
const CARRIER_ENDPOINTS: Record<string, string> = {
  // Digylog V2.4 official endpoint (verified from API docs)
  digylog:        "https://api.digylog.com/api/v2/seller/orders",
  ecotrack:       "https://app.ecotrack.ma/api/v1/orders",
  "eco-track":    "https://app.ecotrack.ma/api/v1/orders",
  cathedis:       "https://app.cathedis.ma/api/v1/parcels",
  onessta:        "https://api.onessta.com/api/v1/orders",
  ozoneexpress:   "https://api.ozoneexpress.ma/api/v1/orders",
  sendit:         "https://api.sendit.ma/api/v1/orders",
  ameex:          "https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add",
  speedex:        "https://api.speedex.ma/api/v1/orders",
  kargoexpress:   "https://api.kargoexpress.ma/api/v1/orders",
  forcelog:       "https://api.forcelog.ma/api/v1/orders",
  livo:           "https://api.livo.ma/api/v1/orders",
  quicklivraison: "https://api.quicklivraison.ma/api/v1/orders",
  codinafrica:    "https://api.codinafrica.ma/api/v1/orders",
};

// ── Ameex tracking base URL ───────────────────────────────────────────────────
const AMEEX_TRACKING_URL = "https://api.ameex.app/customer/Delivery/Parcels/Track";

// ── Ameex status → platform status mapping ────────────────────────────────────
// Maps the French status labels Ameex returns to our internal status codes.
export const AMEEX_STATUS_MAP: Record<string, string> = {
  // Success statuses
  "livrée":        "delivered",
  "livré":         "delivered",
  "livre":         "delivered",
  "livree":        "delivered",
  "livrée avec succès": "delivered",

  // Refusal / cancellation
  "refusée":       "refused",
  "refusé":        "refused",
  "refuse":        "refused",
  "refusee":       "refused",
  "non livré":     "refused",

  // Return
  "retournée":     "Retour Recu",
  "retourné":      "Retour Recu",
  "retourne":      "Retour Recu",
  "retournee":     "Retour Recu",
  "en cours de retour": "En Cours De Retour",

  // In transit
  "en transit":    "transit",
  "en livraison":  "transit",
  "en cours":      "transit",
  "en cours de livraison": "transit",
  "expédié":       "transit",
  "expedie":       "transit",

  // Pickup / collected
  "ramassé":       "Attente De Ramassage",
  "collecté":      "Attente De Ramassage",
  "collecte":      "Attente De Ramassage",
  "en attente de ramassage": "Attente De Ramassage",
  "prêt":          "Attente De Ramassage",

  // Unreachable / no answer
  "injoignable":   "unreachable",
  "non répondu":   "unreachable",
  "absent":        "unreachable",
};

/**
 * Map a raw Ameex status string to the platform's internal status.
 * Returns null if no mapping found (keeps current status unchanged).
 */
export function mapAmeexStatus(rawStatus: string): string | null {
  if (!rawStatus) return null;
  const normalized = rawStatus.toLowerCase().trim();
  return AMEEX_STATUS_MAP[normalized] || null;
}

/**
 * Fetch the current status of an Ameex shipment by tracking number.
 * Uses GET https://app.ameex.ma/api/v1/tracking/{trackingNumber}
 */
export async function trackAmeexShipment(
  trackingNumber: string,
  apiKey: string,
  customApiUrl?: string,
): Promise<{ status: string | null; rawStatus: string | null; rawResponse: unknown; error?: string }> {
  const sanitizeToken = (raw: string | undefined | null): string => {
    if (!raw) return "";
    return raw.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
  };

  const token = sanitizeToken(apiKey);
  const baseUrl = (customApiUrl || AMEEX_TRACKING_URL).replace(/\/+$/, "");
  const trackUrl = `${baseUrl}/${encodeURIComponent(trackingNumber)}`;

  try {
    const response = await axios.get(trackUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-API-KEY":     token,
        "Accept":        "application/json",
      },
      timeout: TIMEOUT_MS_AMEEX, // 45 seconds for Ameex
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    const body = response.data;
    console.log(`[AMEEX-TRACK] ${trackingNumber} → HTTP ${response.status}: ${JSON.stringify(body)}`);

    if (response.status >= 400) {
      const errMsg = extractCarrierErrorMsg(body) || `HTTP ${response.status}`;
      return { status: null, rawStatus: null, rawResponse: body, error: errMsg };
    }

    // Extract status from common response shapes
    const rawStatus: string | null =
      body?.statut       ||
      body?.status       ||
      body?.etat         ||
      body?.data?.statut ||
      body?.data?.status ||
      body?.data?.etat   ||
      body?.result?.statut ||
      body?.result?.status ||
      null;

    const mappedStatus = rawStatus ? mapAmeexStatus(rawStatus) : null;

    return { status: mappedStatus, rawStatus, rawResponse: body };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[AMEEX-TRACK] Error for ${trackingNumber}: ${errMsg}`);
    return { status: null, rawStatus: null, rawResponse: null, error: errMsg };
  }
}

// ── Known bad-URL corrections (auto-applied before every request) ──────────
// Maps patterns in user-pasted URLs to the correct replacement domain/path.
const URL_CORRECTIONS: Array<{ match: RegExp; replace: string; hint: string }> = [
  // Digylog: any old domain pattern → api.digylog.com
  {
    match:   /app\.digylog\.com/gi,
    replace: "api.digylog.com",
    hint:    "app.digylog.com → api.digylog.com",
  },
  {
    match:   /api\.digylog\.ma/gi,
    replace: "api.digylog.com",
    hint:    "api.digylog.ma → api.digylog.com (V2 official domain)",
  },
  // Cathedis
  {
    match:   /app\.cathedis\.com/gi,
    replace: "app.cathedis.ma",
    hint:    "app.cathedis.com → app.cathedis.ma",
  },
];

/**
 * Auto-correct known wrong domains and strip trailing slashes / whitespace.
 * Returns { url, corrected } so callers can log when a fix was applied.
 */
function autoCorrectUrl(raw: string): { url: string; corrected: boolean; hints: string[] } {
  let url = raw.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim().replace(/\/+$/, "");
  const hints: string[] = [];

  for (const rule of URL_CORRECTIONS) {
    if (rule.match.test(url)) {
      url = url.replace(rule.match, rule.replace);
      hints.push(rule.hint);
      rule.match.lastIndex = 0; // reset stateful regex
    }
  }

  return { url, corrected: hints.length > 0, hints };
}

// ── Timeout ───────────────────────────────────────────────────────────────────
// 15 s total per attempt — gives carriers fair time without blocking the UI.
// Worst case: 2 attempts × 15 s + 1 delay × 2 s = 32 s max before the user
// sees an error. Never hang for 90 s.
const TIMEOUT_MS = 15_000;
const TIMEOUT_MS_AMEEX = 45_000; // Ameex server is slow — allow 45 s

// ── Transient error codes that trigger an automatic retry ────────────────────
const TRANSIENT_CODES = new Set([
  "ENOTFOUND",    // DNS resolution failure (bad/unreachable host)
  "EAI_AGAIN",    // DNS temporary failure (common on Railway)
  "ECONNRESET",   // Connection dropped mid-flight
  "ECONNREFUSED", // Server not accepting connections
  "ETIMEDOUT",    // TCP-level timeout
  "ECONNABORTED", // axios timeout / AbortSignal
]);

const MAX_ATTEMPTS   = 2;    // 1 initial + 1 retry — fail fast, report clearly
// Per-carrier max attempts
const getMaxAttempts = (provider: string) => provider === 'ameex' ? 3 : MAX_ATTEMPTS;
const RETRY_DELAY_MS = 2000; // 2 s between each attempt

export interface CarrierShipInput {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  totalPrice: number;      // in centimes — converted to DH before sending
  productName: string;
  canOpen: boolean;
  orderNumber: string;
  orderId: number;
  storeId: number;
  note?: string;             // optional admin comment / note for carrier
  quantity?: number;         // product quantity (defaults to 1)
  carrierStoreName?: string; // Digylog-side store name (legacy field)
  digylogStoreName?: string; // Digylog store name from settings.digylogStoreName
  digylogNetworkId?: number; // Digylog network ID from settings.digylogNetworkId
  digylogNetwork?: number;   // legacy alias for digylogNetworkId
}

export interface CarrierShipResult {
  success: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  rawResponse?: unknown;
  httpStatus?: number;
  error?: string;
  carrierMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone sanitization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Moroccan carriers expect 0XXXXXXXXX (10 digits).
 * Strips formatting, converts +212 / 00212 prefix.
 */
function sanitizePhone(raw: string): string {
  let cleaned = (raw || "").replace(/[\s\-().+]/g, "");

  if (cleaned.startsWith("00212")) {
    cleaned = "0" + cleaned.slice(5);
  } else if (cleaned.startsWith("212") && cleaned.length === 12) {
    cleaned = "0" + cleaned.slice(3);
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders — one per carrier format, dispatched by providerKey
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Digylog API V2.4 — exact payload structure from official docs.
 * POST https://api.digylog.com/api/v2/seller/orders
 */
function buildDigylogPayload(input: CarrierShipInput): Record<string, unknown> {
  const phone   = sanitizePhone(input.phone);
  const priceDH = +(input.totalPrice / 100).toFixed(2);
  const addr    = (input.address || "").trim() || input.city.trim();
  const qty     = input.quantity ?? 1;

  // Store name: from settings.digylogStoreName (preferred) or legacy carrierStoreName
  const storeName = (input.digylogStoreName || input.carrierStoreName || "").trim();
  if (!storeName) {
    throw Object.assign(
      new Error("⚠️ Nom du magasin Digylog manquant. Allez dans Intégrations → Digylog → Préférences et configurez votre magasin."),
      { code: "DIGYLOG_NO_STORE", httpStatus: 422 }
    );
  }

  // Network ID: from settings.digylogNetworkId (preferred) or legacy digylogNetwork
  const networkId = input.digylogNetworkId ?? input.digylogNetwork ?? 1;

  return {
    mode:           1,
    network:        networkId,
    store:          storeName,
    status:         0,
    checkDuplicate: 0,
    orders: [{
      type:        1,
      num:         input.orderNumber,
      name:        input.customerName.trim(),
      phone,
      address:     addr,
      city:        input.city.trim(),
      price:       priceDH,
      openproduct: input.canOpen ? 1 : 0,
      port:        1,
      note:        input.note || "",
      refs: [{
        designation: (input.productName || "Produit").trim(),
        quantity:    qty,
      }],
    }],
  };
}

/**
 * Generic payload — covers Eco-Track, Cathedis, and other Moroccan carriers
 * that use a flat-field JSON structure.
 */
function buildGenericPayload(input: CarrierShipInput): Record<string, unknown> {
  const phone   = sanitizePhone(input.phone);
  const priceDH = +(input.totalPrice / 100).toFixed(2);
  const addr    = (input.address || "").trim() || input.city.trim();

  return {
    // Primary field names (Eco-Track / standard Moroccan format)
    nom_complet:     input.customerName.trim(),
    telephone:       phone,
    ville:           input.city.trim(),
    adresse:         addr,
    prix:            priceDH,
    produit:         input.productName.trim(),
    ouverture_colis: input.canOpen ? 1 : 0,
    reference:       input.orderNumber,
    note:            input.note || "",

    // Aliases accepted by some carriers
    cod:             priceDH,
    description:     input.productName.trim(),
    can_open:        input.canOpen ? 1 : 0,
    customer_name:   input.customerName.trim(),
    phone,
    city:            input.city.trim(),
    address:         addr,
    price:           priceDH,
    product:         input.productName.trim(),
  };
}

/**
 * Ameex API payload builder — new API (api.ameex.app).
 * Sends as FormData (multipart/form-data) to:
 * POST https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add
 * Auth: C-Api-Key + C-Api-Id headers
 */
function buildAmeexPayload(input: CarrierShipInput, apiId?: string): Record<string, string> {
  const phone   = sanitizePhone(input.phone);
  const priceDH = String(Math.round((input.totalPrice || 0) / 100));

  return {
    type:      "SIMPLE",
    business:  apiId || String(input.storeId),
    order_num: input.orderNumber || "",
    replace:   "true",
    open:      input.canOpen ? "YES" : "NO",
    try:       "YES",
    name:      input.customerName.trim(),
    phone:     phone,
    phone2:    "",
    city:      input.city.trim(),
    address:   (input.address || "").trim() || input.city.trim(),
    price:     priceDH,
    note:      input.note || "",
    products:  JSON.stringify([{
      ref:         input.orderNumber || "PROD",
      designation: (input.productName || "Produit").trim(),
      quantity:    input.quantity ?? 1,
    }]),
  };
}

/** Dispatch to the correct builder based on the carrier. */
function buildPayload(input: CarrierShipInput, providerKey: string, apiId?: string): Record<string, unknown> {
  if (providerKey === "digylog") return buildDigylogPayload(input);
  if (providerKey === "ameex")   return buildAmeexPayload(input, apiId);
  return buildGenericPayload(input);
}

// ── Carrier-specific extra headers ─────────────────────────────────────────
function getExtraHeaders(providerKey: string): Record<string, string> {
  if (providerKey === "digylog") {
    return {
      // CRITICAL: Digylog V2.4 rejects requests without this exact Referer header
      "Referer": "https://apiseller.digylog.com",
      "Origin":  "https://apiseller.digylog.com",
    };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractTracking(body: any): string | undefined {
  if (!body) return undefined;

  // ── Digylog V2.4 — array response: [{ tracking, barcode, num, ... }]
  // IMPORTANT: `num` is our OWN order reference echoed back by Digylog — NOT a tracking number.
  // We must NEVER use `num` as the tracking number or we'll store fake references.
  // Only use `tracking` or `barcode` — these are the real Digylog barcodes.
  if (Array.isArray(body) && body.length > 0) {
    const first = body[0];
    const t = first.tracking || first.barcode || first.tracking_number || first.code_suivi || first.colis_id;
    // Explicitly exclude first.num — it is always our own order reference, not a carrier barcode
    if (t) {
      console.log(`[TRACK-EXTRACT]: Digylog array → field used: ${
        first.tracking ? "tracking" :
        first.barcode  ? "barcode"  :
        first.tracking_number ? "tracking_number" :
        first.code_suivi ? "code_suivi" : "colis_id"
      } = "${t}"`);
      return String(t);
    }
    // Log if only num is present so we know the carrier didn't return a real barcode
    if (first.num) {
      console.warn(`[TRACK-EXTRACT]: ⚠️ Digylog returned only "num"="${first.num}" — this is the order reference, NOT a barcode. Treating as no tracking number.`);
    }
    return undefined;
  }

  if (typeof body !== "object") return undefined;

  // ── Digylog V2.4 — wrapped: { orders: [{ barcode, tracking, num, ... }] }
  // Same rule: skip `num` — it is our own reference echoed back.
  if (Array.isArray(body.orders) && body.orders.length > 0) {
    const first = body.orders[0];
    const t = first.tracking || first.barcode || first.tracking_number || first.code_suivi || first.colis_id;
    if (t) {
      console.log(`[TRACK-EXTRACT]: Digylog orders[] → field used: ${
        first.tracking ? "tracking" :
        first.barcode  ? "barcode"  :
        first.tracking_number ? "tracking_number" :
        first.code_suivi ? "code_suivi" : "colis_id"
      } = "${t}"`);
      return String(t);
    }
    if (first.num) {
      console.warn(`[TRACK-EXTRACT]: ⚠️ Digylog orders[] returned only "num"="${first.num}" — skipping (order reference, not barcode).`);
    }
    return undefined;
  }

  // ── Digylog duplicate response: { success: false, data: { barcode/tracking/... } }
  // When checkDuplicate catches an existing order, Digylog returns the existing barcode here.
  if (body.data && !Array.isArray(body.data)) {
    const d = body.data;
    const t = d.barcode || d.tracking || d.tracking_number || d.code_suivi || d.colis_id;
    if (t) {
      console.log(`[TRACK-EXTRACT]: Digylog data.* → tracking = "${t}"`);
      return String(t);
    }
  }

  // ── Generic flat response ──────────────────────────────────────────────────
  // For non-Digylog carriers, `id` is also excluded — it's typically the
  // carrier's internal DB id, not the customer-facing tracking code.
  const t =
    body.tracking_number        ||
    body.trackingNumber         ||
    body.barcode                ||
    body.tracking               ||
    body.code_suivi             ||
    body.numero_suivi           ||
    body.data?.tracking_number  ||
    body.data?.barcode          ||
    body.data?.tracking         ||
    body.data?.code_suivi       ||
    body.result?.tracking_number ||
    body.result?.barcode        ||
    body.result?.tracking       ||
    // Nested data array (some carriers)
    (Array.isArray(body.data) && (body.data[0]?.barcode || body.data[0]?.tracking)) ||
    undefined;

  if (t) {
    console.log(`[TRACK-EXTRACT]: Generic → tracking = "${t}"`);
  }
  return t;
}

function extractLabelUrl(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  return (
    body.label_url        ||
    body.labelUrl         ||
    body.etiquette        ||
    body.pdf_url          ||
    body.data?.label_url  ||
    body.data?.etiquette  ||
    body.result?.label_url ||
    undefined
  );
}

/**
 * Pull the best human-readable error message from any carrier response shape.
 */
function extractCarrierErrorMsg(body: any): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 400);
  if (typeof body !== "object") return String(body).slice(0, 400);

  const msg =
    body.message          ||
    body.msg              ||
    body.error            ||
    body.detail           ||
    body.details          ||
    body.reason           ||
    body.errors           ||
    body.data?.message    ||
    body.data?.error      ||
    body.result?.message  ||
    null;

  if (!msg) return null;
  if (typeof msg === "object") return JSON.stringify(msg).slice(0, 400);
  return String(msg).slice(0, 400);
}

/**
 * Digylog-specific error detection.
 *
 * Digylog does NOT follow the generic { success: false } pattern.
 * It returns errors in several shapes:
 *   1. Plain array:  [{ num, error: "msg" }]           — per-order error
 *   2. Wrapped:      { orders: [{ num, error: "msg" }]} — per-order wrapped
 *   3. Validation:   { message: "...", errors: { field: ["msg"] } }
 *
 * Returns the error string if found, null if response looks healthy.
 */
function detectDigylogError(body: any): string | null {
  if (!body) return null;

  // If a tracking/barcode is present anywhere in the response, it's a success —
  // even if success:false (e.g. duplicate detection returns existing barcode).
  if (extractTracking(body)) return null;

  // Shape 1 — plain array of order results
  if (Array.isArray(body)) {
    const failed = body.filter((item: any) => item.error || item.errors || item.message);
    if (failed.length > 0) {
      const msg = failed
        .map((e: any) => e.error || e.message || JSON.stringify(e))
        .join(", ");
      return msg;
    }
    // Array is present but no error fields — looks like success
    return null;
  }

  // Shape 2 — wrapped in { orders: [...] }
  if (Array.isArray(body.orders)) {
    const failed = body.orders.filter((item: any) => item.error || item.errors);
    if (failed.length > 0) {
      return failed.map((e: any) => e.error || JSON.stringify(e)).join(", ");
    }
  }

  // Shape 3 — validation object: { message, errors: { field: ["msg", ...] } }
  if (body.message && body.errors && typeof body.errors === "object") {
    const fieldErrors = (Object.values(body.errors) as string[][]).flat().join(", ");
    return `${body.message}: ${fieldErrors}`;
  }

  return null;
}

/**
 * Some carriers return HTTP 200 but with { success: false, message: "..." }.
 * Detect that pattern and return the error string.
 */
function detectLogicalError(body: any): string | null {
  if (!body || typeof body !== "object") return null;

  const isOk =
    body.success === true  ||
    body.status === "success" ||
    body.status === "ok"   ||
    body.ok === true;

  const isFail =
    body.success === false ||
    body.status === "error" ||
    body.status === "fail" ||
    body.error !== undefined;

  if (isFail && !isOk) {
    return extractCarrierErrorMsg(body) || "Erreur retournée par le transporteur";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight validation
// ─────────────────────────────────────────────────────────────────────────────

function preValidate(input: CarrierShipInput, tag: string): string | null {
  const phone = sanitizePhone(input.phone);

  if (!phone) {
    console.error(`${tag} PRE-VALIDATION ❌ Phone missing`);
    return "⚠️ رقم الهاتف مفقود — لم يتم الإرسال.";
  }
  if (!/^0[1-9]\d{8}$/.test(phone)) {
    console.error(`${tag} PRE-VALIDATION ❌ Invalid phone: "${input.phone}" → "${phone}"`);
    return `⚠️ رقم الهاتف غير صحيح: "${phone}" — يجب أن يكون 10 أرقام مغربية (مثال: 0612345678).`;
  }

  const address = (input.address || "").trim();
  if (address.length < 5) {
    console.error(`${tag} PRE-VALIDATION ❌ Address too short: "${address}"`);
    return `⚠️ العنوان قصير جداً لشركة الشحن: "${address || '(vide)'}". يرجى كتابة العنوان بالكامل (10 أحرف على الأقل).`;
  }

  if (!input.city.trim()) {
    console.error(`${tag} PRE-VALIDATION ❌ City missing`);
    return "⚠️ المدينة غير محددة — لم يتم الإرسال.";
  }

  if (input.totalPrice <= 0) {
    console.error(`${tag} PRE-VALIDATION ❌ Price is 0 or negative: ${input.totalPrice}`);
    return "⚠️ السعر صفر أو غير محدد — يرجى التحقق من سعر الطلب.";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function shipOrderToCarrier(
  provider: string,
  creds: Record<string, string>,
  input: CarrierShipInput,
): Promise<CarrierShipResult> {
  const tag = `[CARRIER→${provider.toUpperCase()}][#${input.orderNumber}]`;

  // ── 1. Pre-flight validation ─────────────────────────────────────
  const validationError = preValidate(input, tag);
  if (validationError) {
    return { success: false, error: validationError, carrierMessage: validationError };
  }

  // ── 2. Resolve & sanitize URL ────────────────────────────────────
  const providerKey = provider.toLowerCase().replace(/\s+/g, "");
  const defaultUrl  = CARRIER_ENDPOINTS[providerKey];

  // Auto-correct then sanitize the URL from credentials; fall back to default
  const rawCredUrl = (creds.apiUrl || "").trim();
  const { url: apiUrl, corrected, hints } = autoCorrectUrl(rawCredUrl || defaultUrl || "");

  if (!apiUrl) {
    const err = `Aucune URL API configurée pour "${provider}". Ajoutez l'URL dans Intégrations → Transporteurs.`;
    console.error(`${tag} ❌ ${err}`);
    return { success: false, error: err };
  }

  if (corrected) {
    console.warn(`${tag} [URL-FIX] Auto-corrected URL: ${hints.join(", ")}`);
    console.warn(`${tag} [URL-FIX] Final URL: ${apiUrl}`);
  }

  // Validate that the URL actually looks like an HTTP(S) URL
  const urlLooksValid = /^https?:\/\/.+/i.test(apiUrl);
  if (!urlLooksValid) {
    const err = `⚠️ الرابط الخاص بشركة الشحن غير صحيح: "${apiUrl}". يجب أن يبدأ بـ https:// وينتهي بـ .ma`;
    console.error(`${tag} ❌ Bad URL format: "${apiUrl}"`);
    return { success: false, error: err };
  }

  // ── 3. Auth headers ──────────────────────────────────────────────
  /**
   * Strip ALL whitespace variants + ASCII control characters from the token.
   * Node.js throws "Invalid character in header content" when the value
   * contains \n, \r, \t or any other control char (Unicode < 0x20 / 0x7F).
   * This is the mandatory fix for tokens copy-pasted with hidden newlines.
   */
  const sanitizeToken = (raw: string | undefined | null): string => {
    if (!raw) return "";
    // Remove carriage returns, newlines, tabs and any other ASCII control chars
    const cleaned = raw
      .replace(/[\r\n\t]/g, "")        // explicit line endings & tabs
      .replace(/[\x00-\x1F\x7F]/g, "") // all remaining ASCII control chars
      .trim();                           // leading / trailing spaces

    // Warn if non-ASCII characters remain (e.g. invisible Unicode spaces)
    if (/[^\x20-\x7E]/.test(cleaned)) {
      console.error(`[AUTH-ERROR]: Token contains illegal non-ASCII characters — this will cause header errors. Please re-copy the token from the carrier dashboard.`);
    }

    return cleaned;
  };

  const apiKey    = sanitizeToken(creds.apiKey);
  const apiSecret = sanitizeToken(creds.apiSecret);

  // Log key resolution for Digylog/EcoTrack (first 5 chars only for security)
  if (providerKey.includes("digylog") || providerKey.includes("ecotrack") || providerKey.includes("cathedis")) {
    if (apiKey) {
      const preview = apiKey.slice(0, 5) + "*".repeat(Math.max(0, apiKey.length - 5));
      console.log(`${tag} [KEY-CHECK] API key resolved ✅ — starts with: "${preview.slice(0, 5)}..." (length: ${apiKey.length})`);
    } else {
      console.warn(`${tag} [KEY-CHECK] ⚠️ API key is EMPTY — shipping will likely fail with 401.`);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };

  if (providerKey === "ameex") {
    // Ameex uses C-Api-Key / C-Api-Id header pair — strip any HTML wrapping
    const cleanKey = (k: string) => k.replace(/<[^>]*>/g, "").trim();
    if (apiKey)    headers["C-Api-Key"] = cleanKey(apiKey);
    if (apiSecret) headers["C-Api-Id"]  = cleanKey(apiSecret);
  } else {
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-KEY"]     = apiKey;
      headers["Token"]         = apiKey;
    }
    if (apiSecret) {
      headers["X-API-SECRET"] = apiSecret;
    }
  }

  // Inject carrier-specific extra headers (e.g. Referer for Digylog)
  const extraHeaders = getExtraHeaders(providerKey);
  Object.assign(headers, extraHeaders);
  if (Object.keys(extraHeaders).length > 0) {
    console.log(`${tag} [HEADERS+] Extra headers injected: ${Object.keys(extraHeaders).join(", ")}`);
  }

  // ── 4. Build payload & log everything ───────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = buildPayload(input, providerKey, apiSecret);
  } catch (payloadErr: any) {
    const errMsg = payloadErr?.message || String(payloadErr);
    console.error(`${tag} ❌ Payload build failed: ${errMsg}`);
    return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: payloadErr?.httpStatus ?? 422 };
  }
  const sanitizedPhone = sanitizePhone(input.phone);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`${tag} 🚀 SENDING ORDER TO CARRIER`);
  console.log(`[API-DEBUG]: Calling Carrier at: ${apiUrl}`);
  console.log(`${tag} URL:            ${apiUrl}`);
  console.log(`${tag} PHONE SANITIZE: "${input.phone}" → "${sanitizedPhone}"`);
  console.log(`${tag} CITY:           "${input.city}"   ADDRESS: "${input.address}"`);
  console.log(`${tag} PRICE:          ${input.totalPrice} centimes → ${+(input.totalPrice / 100).toFixed(2)} DH`);

  // ── Digylog-specific pre-flight log ─────────────────────────────
  if (providerKey === "digylog") {
    const digylogStore = (payload as any).store || "(missing)";
    console.log(`[DIGYLOG-SEND]: Sending order ${input.orderId} (ref: ${input.orderNumber}) to store "${digylogStore}" via ${apiUrl}`);
    console.log(`[DIGYLOG-SEND]: network=${(payload as any).network}  mode=${(payload as any).mode}  status=${(payload as any).status}`);
    console.log(`[DIGYLOG-SEND]: Timeout=${TIMEOUT_MS / 1000}s  MaxAttempts=${MAX_ATTEMPTS}`);
  }

  console.log(`${tag} PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
  console.log(`${"═".repeat(70)}\n`);

  // ── 5. HTTP request via axios (timeout per carrier, SSL bypass) ──────────
  // For Ameex: convert payload to FormData (multipart) instead of JSON
  let ameexFd: any = null;
  if (providerKey === 'ameex') {
    const FormDataLib = (await import('form-data')).default;
    ameexFd = new FormDataLib();
    Object.entries(payload).forEach(([k, v]) => ameexFd.append(k, String(v)));
    // Replace Content-Type with multipart boundary from form-data
    Object.assign(headers, ameexFd.getHeaders());
  }

  // Inner helper — runs one attempt and throws on network error
  const timeoutMs = providerKey === 'ameex' ? TIMEOUT_MS_AMEEX : TIMEOUT_MS;
  const attempt = () => axios.post(apiUrl, ameexFd ?? payload, {
    headers,
    timeout: timeoutMs,
    httpsAgent: SSL_AGENT,
    validateStatus: () => true, // Don't throw on 4xx/5xx — handled below
  });

  let httpStatus = 0;
  let rawBody: unknown;

  try {
    let response: Awaited<ReturnType<typeof attempt>>;

    // ── Retry loop: up to maxAttempts with RETRY_DELAY_MS (2s) between ──
    const maxAttempts = getMaxAttempts(providerKey);
    let lastErr: any;
    let succeeded = false;

    for (let attempt_n = 1; attempt_n <= maxAttempts; attempt_n++) {
      try {
        response = await attempt();
        succeeded = true;
        break;
      } catch (err: any) {
        lastErr = err;
        const code = err?.code as string | undefined;
        const isTransient =
          TRANSIENT_CODES.has(code ?? "") ||
          err?.message?.toLowerCase().includes("eai_again") ||
          err?.message?.toLowerCase().includes("enotfound");

        if (isTransient && attempt_n < maxAttempts) {
          console.warn(`${tag} ⚠️ Transient network error [${code}] — attempt ${attempt_n}/${maxAttempts}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
          console.warn(`[API-DEBUG]: Retry attempt ${attempt_n + 1} for URL: ${apiUrl}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        } else if (isTransient && attempt_n === maxAttempts) {
          // All retries exhausted for a transient error — throw with friendly message
          const exhausted = new Error(`EAI_AGAIN_EXHAUSTED:${code || "TRANSIENT"}`);
          (exhausted as any).code = code;
          (exhausted as any).isExhausted = true;
          throw exhausted;
        } else {
          throw err; // non-transient — fail immediately
        }
      }
    }

    if (!succeeded) throw lastErr;

    httpStatus = response.status;
    rawBody    = response.data;

    console.log(`${tag} Response: HTTP ${httpStatus}`);
    if (providerKey === "digylog") {
      // Full pretty-printed body so we can see exactly what Digylog returns
      console.log(`[DIGYLOG-RESP]: HTTP ${httpStatus}`);
      console.log(`[DIGYLOG-RESP-FULL]: ${JSON.stringify(rawBody, null, 2)}`);
    } else {
      console.log(`${tag} Body: ${JSON.stringify(rawBody)}`);
    }

    // ── 5a. 4xx / 5xx ────────────────────────────────────────────
    if (httpStatus >= 400) {
      const errMsg = extractCarrierErrorMsg(rawBody) || `HTTP ${httpStatus}`;
      console.error(`${tag} ❌ Carrier rejected (HTTP ${httpStatus}): ${errMsg}`);
      return {
        success: false,
        httpStatus,
        rawResponse: rawBody,
        error: `[HTTP ${httpStatus}] ${errMsg}`,
        carrierMessage: errMsg,
      };
    }

    // ── 5b. Digylog-specific response handling ────────────────────
    if (providerKey === "digylog") {
      console.log(`[DIGYLOG-RAW-RESPONSE] HTTP ${httpStatus}: ${JSON.stringify(rawBody)}`);

      // Digylog returns an array — check for error first, then tracking
      if (Array.isArray(rawBody)) {
        const first = rawBody[0];

        // Per-order error field takes priority (e.g. duplicate, invalid address, etc.)
        if (first?.error) {
          const errMsg = String(first.error);
          console.error(`[DIGYLOG] ❌ Order error: ${errMsg}`);
          return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus, rawResponse: rawBody };
        }

        // Use extractTracking() which checks tracking, barcode, num, code_suivi, tracking_number
        const tracking = extractTracking(rawBody);
        if (tracking) {
          console.log(`[DIGYLOG] ✅ Success! tracking=${tracking}`);
          return { success: true, trackingNumber: tracking, labelUrl: `/api/labels/${tracking}.pdf`, httpStatus, rawResponse: rawBody };
        }

        // Array returned but no error field AND no tracking number — fail loudly
        console.error(`[DIGYLOG] ❌ No tracking number in Digylog response. Raw body: ${JSON.stringify(rawBody)}`);
        const noTrackMsg = "Digylog n'a pas retourné de numéro de suivi. La commande n'a pas été créée chez Digylog.";
        return { success: false, error: noTrackMsg, carrierMessage: noTrackMsg, httpStatus, rawResponse: rawBody };
      }

      // Error: object with message / validation errors
      if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) && (rawBody as any).message) {
        const body = rawBody as any;
        const fieldErrors = body.errors ? Object.values(body.errors).flat().join(", ") : "";
        const errMsg = fieldErrors ? `${body.message}: ${fieldErrors}` : body.message;
        console.error(`[DIGYLOG] ❌ API error: ${errMsg}`);
        return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus, rawResponse: rawBody };
      }

      // Generic Digylog error detection (handles other shapes)
      const digylogError = detectDigylogError(rawBody);
      if (digylogError) {
        console.error(`${tag} ❌ Digylog order error: ${digylogError}`);
        return { success: false, httpStatus, rawResponse: rawBody, error: digylogError, carrierMessage: digylogError };
      }

      // Unrecognized Digylog response format — never silently succeed
      console.error(`[DIGYLOG] ❌ Unexpected response format (no array, no message, no error). Raw body: ${JSON.stringify(rawBody)}`);
      const unexpectedMsg = "Réponse Digylog inattendue. Aucun numéro de suivi retourné. La commande reste Confirmée.";
      return { success: false, error: unexpectedMsg, carrierMessage: unexpectedMsg, httpStatus, rawResponse: rawBody };
    }

    // ── 5c. Generic: 2xx with logical error ───────────────────────
    const logicalError = detectLogicalError(rawBody);
    if (logicalError) {
      console.error(`${tag} ❌ Carrier logical error (HTTP ${httpStatus}): ${logicalError}`);
      return {
        success: false,
        httpStatus,
        rawResponse: rawBody,
        error: logicalError,
        carrierMessage: logicalError,
      };
    }

    // ── 5d. Generic success — must have a real tracking number ────
    // NEVER generate a fake tracking number. If the carrier didn't return one,
    // treat it as a failure so the order stays as 'Confirme' in the dashboard.
    const trackingNumber = extractTracking(rawBody);
    if (!trackingNumber) {
      console.error(`${tag} ❌ No tracking number in carrier response. Raw body: ${JSON.stringify(rawBody)}`);
      const noTrackMsg = `${provider} n'a pas retourné de numéro de suivi. La commande reste Confirmée — vérifiez le portail ${provider}.`;
      return { success: false, error: noTrackMsg, carrierMessage: noTrackMsg, httpStatus, rawResponse: rawBody };
    }
    const labelUrl = extractLabelUrl(rawBody) || `/api/labels/${trackingNumber}.pdf`;

    console.log(`${tag} ✅ SUCCESS! Tracking: ${trackingNumber}`);
    return { success: true, trackingNumber, labelUrl, httpStatus, rawResponse: rawBody };

  } catch (err: any) {
    // ── Classify the error ─────────────────────────────────────────
    const isTimeout =
      err?.code === "ECONNABORTED" ||
      err?.code === "ETIMEDOUT"    ||
      axios.isCancel(err)          ||
      err?.message?.toLowerCase().includes("timeout");

    // DNS resolution failure or all-retries-exhausted transient error
    const isDnsError =
      err?.code === "ENOTFOUND"  ||
      err?.code === "EAI_AGAIN"  ||
      err?.isExhausted === true  ||
      err?.message?.toLowerCase().includes("enotfound") ||
      err?.message?.toLowerCase().includes("eai_again") ||
      err?.message?.startsWith("EAI_AGAIN_EXHAUSTED");

    const isConnRefused = err?.code === "ECONNREFUSED";
    const isConnReset   = err?.code === "ECONNRESET";

    const isFetchFailed =
      isConnRefused ||
      isConnReset   ||
      err?.message?.toLowerCase().includes("fetch failed") ||
      err?.message?.toLowerCase().includes("network");

    // Detect "Invalid character in header" — caused by \n or control chars in token
    const isInvalidHeader =
      err?.message?.toLowerCase().includes("invalid character") ||
      err?.message?.toLowerCase().includes("invalid header") ||
      err?.message?.toLowerCase().includes("header content");

    // ── Detailed diagnostic log ───────────────────────────────────
    console.error(`\n${"─".repeat(70)}`);
    console.error(`${tag} ❌ SHIPPING ${isInvalidHeader ? "HEADER" : isDnsError ? "DNS" : "NETWORK"} ERROR`);
    console.error(`[SHIPPING-ERROR] URL attempted: ${apiUrl}`);
    console.error(`[SHIPPING-ERROR] Error code:    ${err?.code || "(no code)"}`);
    console.error(`[SHIPPING-ERROR] Error message: ${err?.message || String(err)}`);
    if (isDnsError) {
      console.error(`[API-DEBUG]: ENOTFOUND — DNS cannot resolve "${apiUrl}". Verify the URL ends with .ma (e.g. api.digylog.ma). Check Shipping Integrations.`);
    }
    if (isInvalidHeader) {
      console.error(`[AUTH-ERROR]: Token contains illegal characters (newline/control char). Re-paste the API token in Shipping Integrations.`);
    }
    if (err?.response) {
      console.error(`[SHIPPING-ERROR] HTTP status:   ${err.response.status}`);
      console.error(`[SHIPPING-ERROR] HTTP body:     ${JSON.stringify(err.response.data)}`);
    }
    console.error(`[ERROR-DETAIL] Full stack:\n${err?.stack || "(no stack)"}`);
    console.error(`${"─".repeat(70)}\n`);

    // ── User-facing error string ──────────────────────────────────
    let errMsg: string;

    if (isDnsError) {
      const exhausted = err?.isExhausted || err?.message?.startsWith("EAI_AGAIN_EXHAUSTED");
      errMsg = exhausted
        ? `⚠️ مشكل في الاتصال: سيرفر شركة الشحن مستغرق وقتاً طويلاً للاستجابة (${MAX_ATTEMPTS} محاولات فاشلة). يرجى المحاولة بعد قليل.`
        : `⚠️ رابط شركة الشحن غير صحيح. يرجى التأكد من استعمال رابط ينتهي بـ .ma (مثال: api.digylog.ma). الرابط المستخدم: "${apiUrl}".`;
    } else if (isInvalidHeader) {
      errMsg = `⚠️ خطأ في رمز الربط (Token): يرجى التأكد من نسخه ولصقه بشكل صحيح بدون فراغات أو أسطر إضافية. اذهب إلى إعدادات التكامل وأعد لصق المفتاح.`;
    } else if (isTimeout) {
      errMsg = `⚠️ سيرفر شركة الشحن ثقيل جداً (لم يستجب خلال ${TIMEOUT_MS / 1000} ثانية). حاول مجدداً بعد قليل.`;
    } else if (isFetchFailed) {
      errMsg = `⚠️ تعذّر الاتصال بسيرفر شركة الشحن (${err?.code || "fetch failed"}). تحقق من رابط API في إعدادات التكامل.`;
    } else {
      errMsg = err?.message || String(err);
    }

    return {
      success: false,
      httpStatus,
      rawResponse: rawBody,
      error: errMsg,
      carrierMessage: errMsg,
    };
  }
}

// ── DIGYLOG — STATUS TRACKING ──────────────────────────────────────────────

export async function trackDigylogShipment(
  trackingNumber: string,
  apiKey: string,
  apiUrl?: string,
): Promise<{ status: string | null; rawStatus: string | null; rawResponse: unknown; deliveryCost?: number | null; error?: string }> {
  try {
    const base = (apiUrl || 'https://api.digylog.com/api/v2/seller')
      .replace(/\/+$/, '')
      .replace(/api\.digylog\.ma/i, 'api.digylog.com')
      .replace(/app\.digylog\.com/i, 'api.digylog.com');

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Referer': 'https://apiseller.digylog.com',
      'Origin': 'https://apiseller.digylog.com',
    };

    // Primary: /historics endpoint — returns full history with latest status
    const historicsUrl = `${base}/historics?trackings=${encodeURIComponent(trackingNumber)}`;
    console.log(`[DIGYLOG-TRACK] ${trackingNumber} → GET ${historicsUrl}`);

    const histResp = await axios.get(historicsUrl, {
      headers,
      timeout: 15000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    console.log(`[DIGYLOG-TRACK] ${trackingNumber} → HTTP ${histResp.status}: ${JSON.stringify(histResp.data).slice(0, 300)}`);

    if (histResp.status === 200 && histResp.data) {
      const body = histResp.data;
      const records = Array.isArray(body) ? body : (body.data || body.historics || body.orders || []);
      const record = records[0] || body;

      const rawText = (
        record?.last_event    ||
        record?.etat_libelle  ||
        record?.statut_libelle ||
        record?.status        ||
        record?.etat          ||
        record?.libelle       ||
        ''
      ).toString().trim();

      if (rawText) {
        const rawLow = rawText.toLowerCase();
        let mappedStatus = 'in_progress';
        if (
          rawLow === 'livré' || rawLow === 'livre' || rawLow === 'livrée' ||
          rawLow === 'livrée *' || rawLow === 'livré *' ||
          rawLow === 'livraison effectuée' ||
          rawLow === 'remis au client' || rawLow === 'remis au client *' ||
          rawLow === 'delivered' || rawLow.includes('distribu')
        ) { mappedStatus = 'delivered'; }
        else if (rawLow.includes('livr') || rawLow.includes('cours de livr')) { mappedStatus = 'in_progress'; }
        else if (rawLow.includes('retour') && !rawLow.includes('en cours')) { mappedStatus = 'retourné'; }
        else if (rawLow.includes('refus') || rawLow.includes('annul')) { mappedStatus = 'refused'; }
        else if (rawLow.includes('injoignable') || rawLow.includes('absent')) { mappedStatus = 'Injoignable'; }
        else if (rawLow.includes('ramass') || rawLow.includes('attente')) { mappedStatus = 'Attente De Ramassage'; }

        console.log(`[DIGYLOG-TRACK] ${trackingNumber} → rawStatus="${rawText}" mapped="${mappedStatus}"`);
        return { status: mappedStatus, rawStatus: rawText, rawResponse: body, deliveryCost: null };
      }
    }

    // Fallback: /order/:tracking/infos
    const infosUrl = `${base}/order/${encodeURIComponent(trackingNumber)}/infos`;
    console.log(`[DIGYLOG-TRACK] ${trackingNumber} → GET ${infosUrl} (fallback)`);

    const infosResp = await axios.get(infosUrl, {
      headers,
      timeout: 15000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    console.log(`[DIGYLOG-TRACK] ${trackingNumber} → infos HTTP ${infosResp.status}: ${JSON.stringify(infosResp.data).slice(0, 300)}`);

    if (infosResp.status === 200 && infosResp.data) {
      const body = infosResp.data;
      const rawText = (
        body?.last_event   ||
        body?.etat_libelle ||
        body?.status       ||
        body?.etat         ||
        ''
      ).toString().trim();

      if (rawText) {
        const rawLow = rawText.toLowerCase();
        let mappedStatus = 'in_progress';
        if (
          rawLow === 'livré' || rawLow === 'livre' || rawLow === 'livrée' ||
          rawLow === 'livrée *' || rawLow === 'livré *' ||
          rawLow === 'livraison effectuée' ||
          rawLow === 'remis au client' || rawLow === 'remis au client *' ||
          rawLow === 'delivered' || rawLow.includes('distribu')
        ) { mappedStatus = 'delivered'; }
        else if (rawLow.includes('livr') || rawLow.includes('cours de livr')) { mappedStatus = 'in_progress'; }
        else if (rawLow.includes('retour') && !rawLow.includes('en cours')) { mappedStatus = 'retourné'; }
        else if (rawLow.includes('refus')) { mappedStatus = 'refused'; }
        else if (rawLow.includes('ramass') || rawLow.includes('attente')) { mappedStatus = 'Attente De Ramassage'; }

        console.log(`[DIGYLOG-TRACK] ${trackingNumber} → rawStatus="${rawText}" mapped="${mappedStatus}"`);
        const deliveryCostRaw = body?.deliveryCost ?? body?.frais_livraison ?? body?.port ?? null;
        const deliveryCost = deliveryCostRaw ? Math.round(parseFloat(String(deliveryCostRaw)) * 100) : null;
        return { status: mappedStatus, rawStatus: rawText, rawResponse: body, deliveryCost };
      }
    }

    console.warn(`[DIGYLOG-TRACK] ${trackingNumber} → No status found`);
    return { status: null, rawStatus: null, rawResponse: null, deliveryCost: null, error: 'No status found' };

  } catch (err: any) {
    console.error(`[DIGYLOG-TRACK] ${trackingNumber} → Error:`, err?.message);
    return { status: null, rawStatus: null, rawResponse: null, deliveryCost: null, error: err?.message };
  }
}

// ── DIGYLOG — DELIVERY COST LOOKUP ─────────────────────────────────────────
export async function getDigylogDeliveryCost(
  trackingNumber: string,
  apiKey: string,
  networkId: number = 1,
  apiUrl?: string,
): Promise<number | null> {
  try {
    if (!trackingNumber || !apiKey) return null;
    const base = (apiUrl || 'https://api.digylog.com/api/v2/seller')
      .replace(/\/+$/, '')
      .replace(/api\.digylog\.ma/i, 'api.digylog.com');

    const resp = await axios.get(`${base}/order/${encodeURIComponent(trackingNumber)}/infos`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Referer': 'https://apiseller.digylog.com',
      },
      timeout: 10000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    console.log(`[DIGYLOG-COST] ${trackingNumber} → HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 400)}`);

    if (resp.status !== 200 || !resp.data) return null;

    const body = resp.data;
    const price =
      body?.deliveryCost ??      // Digylog V2 actual field name
      body?.frais_livraison ?? body?.frais ?? body?.port ??
      body?.delivery_cost ?? body?.shipping_cost ??
      body?.cout_livraison ?? body?.data?.frais_livraison ??
      body?.data?.port ?? null;

    if (price === null || price === undefined) return null;

    const priceInCentimes = Math.round(parseFloat(String(price)) * 100);
    console.log(`[DIGYLOG-COST] ${trackingNumber} → ${price} DH = ${priceInCentimes} centimes`);
    return priceInCentimes > 0 ? priceInCentimes : null;

  } catch (err: any) {
    console.error(`[DIGYLOG-COST] Error:`, err?.message);
    return null;
  }
}

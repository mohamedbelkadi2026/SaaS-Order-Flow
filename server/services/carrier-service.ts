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
import { db } from "../db";
import { orderItems } from "@shared/schema";
import { eq } from "drizzle-orm";

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
  ozonexpress:    "https://api.ozonexpress.ma",
  sendit:         "https://api.sendit.ma/api/v1/orders",
  ameex:          "https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add",
  expresscoursier: "https://expresscoursier.ma/v1.0/batch",
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

  // Deleted / cancelled by carrier system
  "supprimée":          "Supprimée",
  "supprimé":           "Supprimée",
  "supprime":           "Supprimée",
  "annulé par système": "Supprimée",
  "annule par systeme": "Supprimée",
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

const MAX_ATTEMPTS   = 3;    // 1 initial + 2 retries — handles transient carrier hiccups
const BASE_DELAY_MS  = 800;  // 800ms → 1.6s → 3.2s (exponential + jitter)
// Per-carrier max attempts (uniform: all carriers get 3 attempts)
const getMaxAttempts = (_provider: string) => MAX_ATTEMPTS;
const RETRY_DELAY_MS = BASE_DELAY_MS; // kept for legacy compat

/**
 * Decide whether a carrier HTTP response warrants a retry.
 * Transient = server errors, rate limits, or completely empty 2xx body.
 * Permanent = validation/auth errors (4xx other than 429) → don't waste retries.
 */
function isTransientHttpError(httpStatus: number, rawBody: any, permanent?: boolean): boolean {
  // Carrier explicitly flagged this as permanent — don't waste retries
  if (permanent === true) return false;

  if (httpStatus === 429) return true;
  if (httpStatus >= 500 && httpStatus < 600) return true;
  // 2xx with completely empty body → carrier hiccup, retry
  if (httpStatus >= 200 && httpStatus < 300) {
    if (rawBody == null) return true;
    if (Array.isArray(rawBody) && rawBody.length === 0) return true;
    // Digylog explicit rejection (isSuccess:false + non-empty errors[]) → permanent, no retry
    if (Array.isArray(rawBody) && (rawBody[0] as any)?.isSuccess === false &&
        Array.isArray((rawBody[0] as any)?.errors) && (rawBody[0] as any).errors.length > 0) return false;
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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
  apiId?: string;            // Ameex: C-Api-Id / Business ID
  apiSecret?: string;        // Ameex: C-Api-Id / Business ID (stored as apiSecret)
  // Ameex idempotency: set true when the order already has an AMEEX-PENDING-
  // placeholder from a previous attempt — signals that the parcel may already
  // exist in Ameex's portal and we should be careful about recreating it.
  previousAttemptHadPlaceholder?: boolean;
  // Ameex/Express Coursier: numeric city ID resolved from city name via *_cities table.
  // Both APIs require the city field to be an integer ID, not a name string.
  cityId?: string;
  // Ameex-specific: product catalog UUID for stock-managed Ameex accounts.
  ameexProductId?: string;
  // Express Coursier: settings JSONB object from carrierAccounts (contains expressCoursierStoreId)
  ecSettings?: Record<string, unknown>;
  // Ozon Express: settings JSONB object from carrierAccounts (contains ozonExpressCustomerId)
  ozonSettings?: Record<string, unknown>;
}

export interface CarrierShipResult {
  success: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  rawResponse?: unknown;
  httpStatus?: number;
  error?: string;
  carrierMessage?: string;
  attempts?: number;
  permanent?: boolean;
  /**
   * Set when the carrier ACCEPTED the shipment (success=true) but did not
   * return a tracking number. The order must still be marked shipped — never
   * failed — and this message surfaced to the user.
   */
  warning?: string;
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

/**
 * Strip invisible Unicode characters that often hide in customer-facing fields
 * imported from Shopify/WooCommerce stores. These characters render as nothing
 * in the UI but cause server-side validation failures on third-party APIs.
 */
function cleanText(s: any): string {
  return String(s ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate Ameex-mandatory fields BEFORE making the API call.
 * Returns a list of human-readable issues, or an empty array if all OK.
 * Failures are marked permanent=true so the retry loop doesn't waste attempts.
 */
function validateAmeexInput(input: CarrierShipInput): string[] {
  const issues: string[] = [];
  const name    = cleanText(input.customerName);
  const phone   = cleanText(input.phone).replace(/\D/g, '');
  const city    = cleanText(input.city);
  const address = cleanText(input.address) || city;
  const product = cleanText(input.productName);

  if (!name || name.length < 2)            issues.push('Nom du destinataire manquant ou trop court');
  if (!phone || phone.length < 8)          issues.push('Téléphone manquant ou invalide');
  if (!city)                               issues.push('Ville manquante');
  if (!address)                            issues.push('Adresse manquante');
  if (!product)                            issues.push('Nom du produit manquant');
  if (!input.totalPrice || input.totalPrice <= 0) issues.push('Prix total manquant ou nul');

  return issues;
}

/**
 * Ameex API payload builder — field names verified against official Postman docs:
 * https://documenter.getpostman.com/view/10265205/2sA3rwLZD1
 *
 * Endpoint: POST https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add
 * Format:   multipart/form-data
 * Auth:     Headers C-Api-Id + C-Api-Key
 *
 * Key: field names are ENGLISH (receiver, phone, city, address, product, comment),
 * NOT French (destinataire, telephone, ville, adresse, produit, note).
 * The 'city' field is a NUMERIC ID, not a city name string.
 */
function buildAmeexPayload(input: CarrierShipInput): Record<string, unknown> {
  const receiver = cleanText(input.customerName);
  const phone    = sanitizePhone(input.phone);
  const cityId   = String(input.cityId || '');   // numeric ID resolved from ameex_cities
  const address  = cleanText(input.address) || cleanText(input.city);
  const product  = cleanText(input.productName) || 'Produit';
  const note     = cleanText(input.note);
  const priceDH  = +(input.totalPrice / 100).toFixed(2);

  const payload: Record<string, unknown> = {
    type:      "SIMPLE",
    business:  String(input.apiSecret || input.apiId || ""),
    order_num: String(input.orderNumber),
    replace:   "true",
    open:      input.canOpen ? "YES" : "NO",
    try:       "YES",
    fragile:   "0",

    // ── Customer info — ENGLISH field names per official Ameex Postman docs ──
    receiver,
    phone,
    city:      cityId,      // ⚠ Ameex expects a numeric ID, not a city name
    address,

    // ── Order details ────────────────────────────────────────────────────────
    comment:   note,
    product,
    cod:       String(priceDH),
  };

  // Product quantity: Ameex uses the array notation products[0][qty]
  if (input.ameexProductId) {
    payload['products[0][id]']  = input.ameexProductId;
    payload['products[0][qty]'] = String(input.quantity ?? 1);
  } else {
    payload['products[0][qty]'] = String(input.quantity ?? 1);
  }

  return payload;
}

// ── Data-driven carrier registry ────────────────────────────────────────────
// Adding a new standard REST/Bearer carrier requires ONLY a new entry here.
// Digylog and Ameex have dedicated builders and are NOT in this map.
const carrierConfigs: Record<string, {
  authType: 'bearer' | 'apikey' | 'custom';
  bodyFormat?: Record<string, string>;
}> = {
  ecotrack:       { authType: 'bearer' },
  cathedis:       { authType: 'bearer' },
  onessta:        { authType: 'bearer' },
  ozoneexpress:   { authType: 'bearer' },
  sendit:         { authType: 'bearer' },
  speedex:        { authType: 'bearer' },
  kargoexpress:   { authType: 'bearer' },
  forcelog:       { authType: 'bearer' },
  livo:           { authType: 'bearer' },
  quicklivraison: { authType: 'bearer' },
  codinafrica:    { authType: 'bearer' },
  olivraison:     { authType: 'bearer' },
  livreego:       { authType: 'bearer' },
  powerdelivery:  { authType: 'bearer' },
  caledex:        { authType: 'bearer' },
  oscario:        { authType: 'bearer' },
  colisspeed:     { authType: 'bearer' },
};

/** Dispatch to the correct builder based on the carrier. */
function buildPayload(input: CarrierShipInput, providerKey: string, _apiId?: string): Record<string, unknown> {
  if (providerKey === "digylog") return buildDigylogPayload(input);
  if (providerKey === "ameex")   return buildAmeexPayload(input);
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
// Ozon Express helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractOzonTracking(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const ap = data?.['ADD-PARCEL'] || data?.add_parcel;

  const candidates = [
    // ADD-PARCEL shape (the real Ozon response envelope)
    ap?.['TRACKING-NUMBER'],
    ap?.tracking_number,
    ap?.PARCEL?.['TRACKING-NUMBER'],
    ap?.PARCEL?.tracking_number,
    // Flat shapes
    data['tracking-number'],
    data.tracking_number,
    data.trackingNumber,
    data?.PARCEL?.['TRACKING-NUMBER'],
    data?.PARCEL?.['tracking-number'],
    data?.PARCEL?.tracking_number,
    data?.DELIVERY?.['TRACKING-NUMBER'],
    data?.DELIVERY?.['tracking-number'],
    data?.RESULT?.['TRACKING-NUMBER'],
    data?.data?.['tracking-number'],
    data?.data?.tracking_number,
    data?.data?.PARCEL?.['TRACKING-NUMBER'],
    data?.parcel?.tracking_number,
    data?.parcel?.['tracking-number'],
    data?.parcel?.['TRACKING-NUMBER'],
  ];
  for (const v of candidates) {
    const s = v == null ? '' : String(v).trim();
    // Must look like a tracking number (alphanum+dashes, 6+ chars, no spaces)
    if (s && /^[A-Z0-9][A-Z0-9\-_]{5,}$/i.test(s) && !/\s/.test(s)) return s;
  }

  // Last-resort: recursive key search for anything matching /tracking[-_]?number|tracking[-_]?code/i
  const stack: any[] = [data];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const [k, v] of Object.entries(cur)) {
      if (/tracking[-_]?number|tracking[-_]?code/i.test(k) && v && typeof v !== 'object') {
        const s = String(v).trim();
        if (s) return s;
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function isOzonValidationOnly(data: any): boolean {
  const msg = data?.CHECK_API?.MESSAGE || data?.check_api?.message || data?.CHECK_API?.message;
  return !!msg && /valide/i.test(String(msg));
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

  // ── Express Coursier: token embedded in URL path, JSON body with packages array ──
  if (providerKey === 'expresscoursier') {
    if (!apiKey) {
      return { success: false, error: "Token Express Coursier manquant. Configurez votre compte dans Intégrations → Transporteurs.", carrierMessage: "missing token", httpStatus: 0, rawResponse: null, permanent: true };
    }
    const cityToSend = input.cityId || input.city; // numeric ID preferred; fall back to city name
    console.log(`[EC-CITY-RESOLVE] order=${input.orderNumber} city="${input.city}" cityId="${input.cityId}" → sending "${cityToSend}"`);
    const ecSettings = (input as any).ecSettings || {};
    const rawStoreId =
      ecSettings.expressCoursierStoreId ??
      ecSettings.storeId ??
      (input as any).carrierStoreName ??
      null;
    const ecStoreId = Number(String(rawStoreId ?? "").trim());
    if (!ecStoreId || !Number.isFinite(ecStoreId) || ecStoreId <= 0) {
      const errMsg = `Store ID Express Coursier manquant ou invalide (valeur: "${rawStoreId}"). Allez dans Intégrations → Sociétés de Livraison → modifier le compte Express Coursier, et renseignez votre Store ID.`;
      console.error(`[EC][#${input.orderNumber}] ❌ ${errMsg}`);
      return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
    }
    const priceDH   = +(input.totalPrice / 100).toFixed(2);
    const sanitized = sanitizePhone(input.phone);
    const ecPayload = {
      store_id: ecStoreId,
      packages: [{
        receiver_name: input.customerName,
        address:       input.address || input.city,
        city:          String(cityToSend),
        phone:         sanitized,
        price:         String(priceDH),
        note:          input.note || "",
        product:       input.productName || "Produit",
        internal_id:   input.orderNumber || `ORD-${input.orderId}`,
      }],
    };
    const ecUrl = `https://expresscoursier.ma/v1.0/batch/${encodeURIComponent(apiKey.trim())}`;
    console.log(`[EC-SEND] order=${input.orderNumber} url=${ecUrl}`);
    console.log(`[EC-PAYLOAD] ${JSON.stringify(ecPayload)}`);
    try {
      const ecResp = await axios.post(ecUrl, ecPayload, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 30_000,
        httpsAgent: SSL_AGENT,
        validateStatus: () => true,
      });
      const ecData: any = ecResp.data;
      console.log(`[EC-RESP] HTTP ${ecResp.status}: ${JSON.stringify(ecData).slice(0, 500)}`);
      if (ecResp.status >= 400) {
        const msg = ecData?.message || ecData?.error || ecData?.detail || `HTTP ${ecResp.status}`;
        console.error(`[EC][#${input.orderNumber}] ❌ ${msg}`);
        return { success: false, error: `Express Coursier: ${msg}`, carrierMessage: msg, httpStatus: ecResp.status, rawResponse: ecData };
      }

      // ── Real EC batch response shape ────────────────────────────────────
      // { success: true,
      //   data: { summary: {...},
      //           successful_packages: [{ index, package_id, data: { package_id, ... } }],
      //           failed_packages: [] },
      //   message, errors, timestamp }
      // The tracking number lives at data.successful_packages[0].package_id
      // (or nested .data.package_id). Older/alternate shapes are tolerated too.
      const inner      = ecData?.data || {};
      const successful = Array.isArray(inner.successful_packages) ? inner.successful_packages : [];
      const failed     = Array.isArray(inner.failed_packages)    ? inner.failed_packages    : [];
      const apiSuccess = ecData?.success !== false; // treat absent flag as success (HTTP was <400)

      // Explicit failure: EC reported the package(s) as failed and none succeeded.
      if ((!apiSuccess && successful.length === 0) || (failed.length > 0 && successful.length === 0)) {
        const reason =
          failed[0]?.message || failed[0]?.error ||
          ecData?.message || ecData?.errors?.[0]?.message ||
          "Échec à l'import côté Express Coursier";
        console.error(`[EC][#${input.orderNumber}] ❌ ${reason}`);
        return { success: false, error: `Express Coursier: ${reason}`, carrierMessage: reason, httpStatus: ecResp.status, rawResponse: ecData, permanent: true };
      }

      // Extract the tracking number from the correct path, with legacy fallbacks.
      const firstSuccess = successful[0] || {};
      const packageId =
        firstSuccess.package_id ||
        firstSuccess?.data?.package_id ||
        (Array.isArray(ecData?.packages) ? ecData.packages[0]?.package_id : null) ||
        ecData?.package_id || ecData?.id || null;

      if (!packageId) {
        // EC accepted the shipment (success=true) but returned no tracking number.
        // Do NOT mark the order as failed — surface a warning instead.
        const warn = `Expédition acceptée par Express Coursier mais aucun numéro de suivi retourné. Vérifiez le portail EC.`;
        console.warn(`[EC][#${input.orderNumber}] ⚠️ ${warn}. Raw: ${JSON.stringify(ecData)}`);
        return { success: true, trackingNumber: undefined, warning: warn, httpStatus: ecResp.status, rawResponse: ecData };
      }

      console.log(`[EC][#${input.orderNumber}] ✅ SUCCESS! package_id=${packageId}`);
      return { success: true, trackingNumber: String(packageId), httpStatus: ecResp.status, rawResponse: ecData };
    } catch (ecErr: any) {
      const msg = ecErr?.message || "Erreur réseau Express Coursier";
      console.error(`[EC][#${input.orderNumber}] ❌ Network error: ${msg}`);
      return { success: false, error: `Express Coursier: ${msg}`, carrierMessage: msg };
    }
  }

  // ── Ozon Express: customer_id + api_key embedded in URL path, multipart/form-data body ──
  if (providerKey === 'ozonexpress') {
    const ozonSettings = (input as any).ozonSettings || {};
    const customerId = String(
      ozonSettings.ozonExpressCustomerId ??
      ozonSettings.ozonCustomerId ??
      ""
    ).trim();
    if (!customerId || !/^\d+$/.test(customerId)) {
      const errMsg = `Customer ID Ozon Express manquant ou invalide (valeur: "${customerId}"). Allez dans Intégrations → Sociétés de Livraison → modifier le compte Ozon Express, et renseignez votre Customer ID.`;
      console.error(`[OZON][#${input.orderNumber}] ❌ ${errMsg}`);
      return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
    }
    if (!apiKey) {
      return { success: false, error: "Clé API Ozon Express manquante. Configurez votre compte dans Intégrations → Transporteurs.", carrierMessage: "missing api key", httpStatus: 0, rawResponse: null, permanent: true };
    }
    const cityId = input.cityId; // numeric Ozon city ID, resolved upstream from ozon_express_cities
    if (!cityId || !/^\d+$/.test(String(cityId))) {
      const errMsg = `Ville "${input.city}" non synchronisée avec Ozon Express. Cliquez "Synchroniser les villes" sur le compte Ozon Express dans Intégrations, puis réessayez.`;
      console.error(`[OZON][#${input.orderNumber}] ❌ ${errMsg}`);
      return { success: false, error: errMsg, carrierMessage: 'City not found in ozon_express_cities', httpStatus: 0, rawResponse: null, permanent: true };
    }
    const priceDH   = Math.round(input.totalPrice / 100); // Ozon expects MAD as an integer
    const sanitized = sanitizePhone(input.phone);
    const FormDataLib = (await import('form-data')).default;
    const fd = new FormDataLib();
    fd.append('parcel-receiver', input.customerName || '');
    fd.append('parcel-phone',    sanitized);
    fd.append('parcel-city',     String(cityId));
    fd.append('parcel-address',  input.address || input.city || '');
    fd.append('parcel-price',    String(priceDH));
    // parcel-stock: "0" = Pickup/Ramassage (default, recommended for COD/dropshipping)
    //              "1" = Stock chez Ozon (requires SKUs pre-registered in Ozon portal)
    const parcelStockMode = String(ozonSettings.ozonParcelStock ?? '0').trim() === '1' ? '1' : '0';
    fd.append('parcel-stock', parcelStockMode);
    fd.append('parcel-note',     input.note || '');
    fd.append('parcel-nature',   input.productName || 'Produit');
    if (input.orderNumber) fd.append('tracking-number', `TG-${input.orderNumber}`);

    // ── Products field: required only in stock mode (parcel-stock=1) ──
    // In pickup mode Ozon ignores the field — omitting it avoids the
    // "Products data required for stock parcels" rejection.
    if (parcelStockMode === '1') {
      let rawItems: Array<{ sku: string | null; quantity: number }> = [];
      try {
        rawItems = await db
          .select({ sku: orderItems.sku, quantity: orderItems.quantity })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.orderId));
      } catch (itemErr: any) {
        console.warn(`[OZON-SHIP][#${input.orderNumber}] Could not fetch order items: ${itemErr.message}`);
      }

      const productsArr: Array<{ ref: string; qnty: number }> = [];
      for (const it of rawItems) {
        const sku = String(it.sku || '').trim();
        if (!sku) continue; // Stock mode strictly needs pre-registered SKUs
        const qnty = Math.max(1, parseInt(String(it.quantity ?? 1), 10) || 1);
        productsArr.push({ ref: sku, qnty });
      }
      if (productsArr.length === 0) {
        const errMsg = `Ozon Express (mode Stock): aucun SKU valide trouvé pour cette commande. Enregistrez les produits dans votre portail Ozon Express ou passez en mode Pickup dans les paramètres du compte.`;
        console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ ${errMsg}`);
        return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
      }
      fd.append('products', JSON.stringify(productsArr));
      console.log(`[OZON-SHIP][#${input.orderNumber}] products payload (stock mode): ${JSON.stringify(productsArr)}`);
    } else {
      console.log(`[OZON-SHIP][#${input.orderNumber}] pickup mode — products field omitted`);
    }

    const ozonUrl = `https://api.ozonexpress.ma/customers/${encodeURIComponent(customerId)}/${encodeURIComponent(apiKey.trim())}/add-parcel`;
    console.log(`[OZON-SEND] order=${input.orderNumber} url=https://api.ozonexpress.ma/customers/${customerId}/***/add-parcel city=${cityId} price=${priceDH}`);
    try {
      const ozonResp = await axios.post(ozonUrl, fd, {
        headers: { ...fd.getHeaders(), Accept: 'application/json' },
        timeout: 30_000,
        httpsAgent: SSL_AGENT,
        validateStatus: () => true,
      });
      const ozonData: any = ozonResp.data;

      // ── DIAGNOSTIC: log full response so we can see the real shape ──
      console.log(`[OZON-SHIP][#${input.orderNumber}] HTTP ${ozonResp.status}`);
      console.log(`[OZON-SHIP][#${input.orderNumber}] Response body (first 1000 chars): ${JSON.stringify(ozonData).slice(0, 1000)}`);

      if (ozonResp.status >= 400) {
        const msg = ozonData?.message || ozonData?.error || ozonData?.MESSAGE || (typeof ozonData === 'string' ? ozonData : '') || `HTTP ${ozonResp.status}`;
        console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ HTTP error: ${msg}`);
        return { success: false, error: `Ozon Express: ${msg}`, carrierMessage: msg, httpStatus: ozonResp.status, rawResponse: ozonData };
      }

      // ── Guard: validation-only response means NO parcel was created ──
      // Shape: { "CHECK_API": { "RESULT": "SUCCESS", "MESSAGE": "Valide API Key" } }
      if (isOzonValidationOnly(ozonData)) {
        const errMsg = `Ozon Express: la réponse contient seulement une validation API (Valide API Key), aucun colis créé. Vérifiez les paramètres d'envoi (Customer ID, City ID, format form-data).`;
        console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ Validation-only response. Full data: ${JSON.stringify(ozonData)}`);
        return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: ozonResp.status, rawResponse: ozonData, permanent: true };
      }

      // ── Guard: ADD-PARCEL envelope (real Ozon response shape) ──
      // Shape: { "ADD-PARCEL": { "CUSTOMER": { "RESULT": "SUCCESS" }, "RESULT": "ERROR"|"SUCCESS", "MESSAGE": "..." } }
      const addParcel = ozonData?.['ADD-PARCEL'] || ozonData?.add_parcel;
      if (addParcel && typeof addParcel === 'object') {
        const customerResult = String(addParcel?.CUSTOMER?.RESULT || addParcel?.customer?.result || '');
        const parcelResult   = String(addParcel?.RESULT   || addParcel?.result   || '');
        const parcelMessage  = String(addParcel?.MESSAGE  || addParcel?.message  || '');

        if (/error/i.test(customerResult)) {
          const errMsg = `Ozon Express (Customer): ${addParcel?.CUSTOMER?.MESSAGE || customerResult}`;
          console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ ${errMsg}`);
          return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: ozonResp.status, rawResponse: ozonData, permanent: true };
        }
        if (/error/i.test(parcelResult)) {
          const errMsg = `Ozon Express: ${parcelMessage || parcelResult}`;
          console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ ${errMsg}`);
          return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: ozonResp.status, rawResponse: ozonData, permanent: true };
        }
        // ADD-PARCEL.RESULT === "SUCCESS" — fall through to tracking extraction
      }

      // ── Guard: logical failure embedded in a 200 body ──
      const okFlag =
        ozonData?.success !== false &&
        String(ozonData?.STATUS ?? ozonData?.status ?? '').toLowerCase() !== 'error' &&
        ozonData?.error == null;
      if (!okFlag) {
        const reason = ozonData?.message || ozonData?.error || ozonData?.MESSAGE || "Échec à l'import côté Ozon Express";
        console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ Logical failure: ${reason}`);
        return { success: false, error: `Ozon Express: ${reason}`, carrierMessage: reason, httpStatus: ozonResp.status, rawResponse: ozonData, permanent: true };
      }

      // ── Extract tracking number (handles uppercase keys + recursive search) ──
      const trackingNumber = extractOzonTracking(ozonData);

      if (!trackingNumber) {
        // CRITICAL: Ozon returned HTTP 200 but no tracking number → parcel was NOT created.
        // Throw so the caller never marks the order as shipped.
        const errMsg = `Ozon Express a répondu HTTP 200 mais aucun numéro de suivi n'a été retourné. Le colis n'a probablement pas été créé — vérifiez le portail Ozon. Réponse: ${JSON.stringify(ozonData).slice(0, 300)}`;
        console.error(`[OZON-SHIP][#${input.orderNumber}] ❌ No tracking number in response. Full data: ${JSON.stringify(ozonData)}`);
        return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: ozonResp.status, rawResponse: ozonData, permanent: true };
      }

      console.log(`[OZON-SHIP][#${input.orderNumber}] ✅ tracking=${trackingNumber}`);
      return { success: true, trackingNumber: String(trackingNumber), httpStatus: ozonResp.status, rawResponse: ozonData };
    } catch (ozonErr: any) {
      const msg = ozonErr?.message || "Erreur réseau Ozon Express";
      console.error(`[OZON][#${input.orderNumber}] ❌ Network error: ${msg}`);
      return { success: false, error: `Ozon Express: ${msg}`, carrierMessage: msg };
    }
  }

  if (providerKey === 'ameex') {
    // Pre-flight validation — refuse to call Ameex if mandatory fields are missing
    // or contain only invisible characters. permanent=true stops the retry loop.
    const validationIssues = validateAmeexInput(input);
    if (validationIssues.length > 0) {
      const errMsg = `Données manquantes pour Ameex: ${validationIssues.join(', ')}`;
      console.error(`[CARRIER→AMEEX][#${input.orderNumber}] ❌ Pre-flight validation failed: ${errMsg}`);
      console.error(`[CARRIER→AMEEX][#${input.orderNumber}] Raw input: customerName="${input.customerName}" (len=${(input.customerName || '').length}) phone="${input.phone}" city="${input.city}" address="${input.address}"`);
      return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
    }

    // ── City ID guard ─────────────────────────────────────────────────────────
    // Ameex requires a numeric city ID in the 'city' field, not a city name.
    // The ID is resolved from the ameex_cities table in routes.ts before calling
    // this function. If it's missing, the user hasn't synced cities yet.
    if (!input.cityId) {
      const errMsg = `Ameex: ID de ville manquant pour "${input.city}". Synchronisez les villes Ameex dans Paramètres → Transporteurs puis réessayez.`;
      console.error(`[CARRIER→AMEEX][#${input.orderNumber}] ❌ ${errMsg}`);
      return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
    }

    // ── Business / auth guard ─────────────────────────────────────────────────
    // Ameex uses the 'business' field to identify the account. If apiSecret and
    // apiId are both empty, business="" and Ameex returns the misleading
    // "Destinataire est obligatoire" error instead of a proper 401.
    const businessValue = String(input.apiSecret || input.apiId || "").trim();
    if (!businessValue) {
      const errMsg = `Ameex: identifiant 'business' manquant. Vérifiez la configuration de votre intégration Ameex (champ 'API Secret' ou 'API ID').`;
      console.error(`[CARRIER→AMEEX][#${input.orderNumber}] ❌ ${errMsg}`);
      console.error(`[AMEEX-CREDS-AUDIT] apiKey_present=${!!apiKey} apiSecret_present=${!!input.apiSecret} apiId_present=${!!input.apiId} business_value="" business_present=false`);
      return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus: 0, rawResponse: null, permanent: true };
    }

    console.log(`[AMEEX-REACHED] input=`, JSON.stringify(input));
    // Ameex requires multipart/form-data
    const FormDataLib = (await import('form-data')).default;
    const fd = new FormDataLib();
    const fdFields: Record<string, string> = {};
    const cleanKey = (k: string) => (k || '').replace(/<[^>]*>/g, '').trim();

    Object.entries(payload).forEach(([k, v]) => {
      const val = String(v ?? '').trim();
      fd.append(k, val);
      fdFields[k] = val;
    });

    console.log(`[AMEEX-CREDS-AUDIT] order=${input.orderNumber}`, {
      apiKey_present:    !!apiKey,
      apiKey_length:     (apiKey || '').length,
      apiKey_prefix:     (apiKey || '').slice(0, 8) + '...',
      apiSecret_present: !!input.apiSecret,
      apiSecret_length:  (input.apiSecret || '').length,
      apiSecret_prefix:  (input.apiSecret || '').slice(0, 8) + '...',
      apiId_present:     !!input.apiId,
      apiId_length:      (input.apiId || '').length,
      apiId_prefix:      (input.apiId || '').slice(0, 8) + '...',
      business_value:    businessValue,
      business_present:  !!businessValue,
    });
    console.log(`[AMEEX-FORMDATA] Fields being sent:`, JSON.stringify(fdFields, null, 2));
    console.log(`[AMEEX-PAYLOAD] order=${input.orderNumber}`, JSON.stringify({
      destinataire: payload.destinataire,
      telephone:    payload.telephone,
      ville:        payload.ville,
      adresse:      payload.adresse,
      montant:      payload.montant,
      produit:      payload.produit,
      quantite:     payload.quantite,
      ref:          payload.ref,
    }));

    console.log(`[AMEEX-REQUEST] url=${apiUrl} method=POST contentType=multipart/form-data businessLen=${businessValue.length} apiKeyLen=${(apiKey || '').length}`);
    const resp = await axios.post(apiUrl, fd, {
      headers: {
        ...fd.getHeaders(),        // multipart/form-data + correct boundary
        // Send auth token under multiple header names — different Ameex API
        // versions / portal configs may expect different auth header names.
        'C-Api-Key':     cleanKey(apiKey),
        'C-Api-Id':      cleanKey(input.apiSecret || apiKey || ''),
        'Authorization': `Bearer ${cleanKey(apiKey)}`,
        'Token':         cleanKey(apiKey),
        'X-Api-Key':     cleanKey(apiKey),
      },
      timeout: 45000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });
    // log and handle response
    console.log(`[AMEEX-SHIP-DEBUG] FormData sent → HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 500)}`);

    // Process Ameex response using shared helpers
    const httpSt  = resp.status;
    const rb: any = resp.data;
    if (httpSt >= 400) {
      const errMsg = extractCarrierErrorMsg(rb) || `HTTP ${httpSt}`;
      console.error(`${tag} ❌ Ameex rejected (HTTP ${httpSt}): ${errMsg}`);
      return { success: false, httpStatus: httpSt, rawResponse: rb, error: `[HTTP ${httpSt}] ${errMsg}`, carrierMessage: errMsg };
    }
    const logicalError = detectLogicalError(rb);
    if (logicalError) {
      console.error(`${tag} ❌ Ameex logical error: ${logicalError}`);
      return { success: false, httpStatus: httpSt, rawResponse: rb, error: logicalError, carrierMessage: logicalError };
    }
    // Idempotency guard: if this order already had an AMEEX-PENDING- placeholder
    // from a previous attempt, log a warning so we know a duplicate might be created.
    // (We cannot query Ameex by ref yet — no search endpoint exposed — so we proceed,
    // but the broader success detection below will avoid re-marking as failure.)
    if (input.previousAttemptHadPlaceholder) {
      console.warn(`${tag} ⚠️ AMEEX-RETRY: order=${input.orderNumber} had a placeholder from a previous attempt. Parcel may already exist in Ameex portal. Proceeding with new attempt.`);
    }

    console.log(`[AMEEX-FULL-RESPONSE] order=${input.orderNumber} httpStatus=${httpSt} body=${JSON.stringify(rb).slice(0, 800)}`);
    const trackingNumber = extractTracking(rb);
    // Ameex returns several "success" shapes — all must be recognized or we create
    // duplicates on retry when the user clicks "Réessayer".
    const isSuccessShape =
      // Shape 1: explicit tracking number returned
      !!trackingNumber ||
      // Shape 2: original known success response (login:success, no api error)
      (rb?.login === 'success' && rb?.api?.type !== 'error') ||
      // Shape 3: status field signals success
      (typeof rb?.status === 'string' && /^(ok|success|created|added)$/i.test(rb.status)) ||
      // Shape 4: HTTP 200 + empty body — Ameex sometimes does this on success
      (httpSt >= 200 && httpSt < 300 && (rb == null || (typeof rb === 'object' && Object.keys(rb as object).length === 0))) ||
      // Shape 5: response message indicates parcel creation
      (typeof rb?.message === 'string' && /créé|created|added|enregistr/i.test(rb.message)) ||
      // Shape 6: parcel/colis object present without explicit tracking
      (!!rb?.parcel || !!rb?.colis);

    if (!isSuccessShape) {
      // Surface Ameex's exact api.msg so the user sees what to fix, not a generic message.
      const ameexApiMsg = rb?.api?.msg || rb?.message || rb?.error;
      const userMsg = ameexApiMsg
        ? `Ameex: ${ameexApiMsg}`
        : `Ameex n'a pas retourné de numéro de suivi. Vérifiez le portail Ameex.`;
      console.error(`${tag} ❌ ${userMsg}. Raw: ${JSON.stringify(rb)}`);
      return {
        success:        false,
        error:          userMsg,
        carrierMessage: ameexApiMsg || userMsg,
        httpStatus:     httpSt,
        rawResponse:    rb,
        permanent:      !!ameexApiMsg,
      };
    }
    // Placeholder embeds TJG-{orderNumber} so the webhook can correlate before
    // the real tracking number arrives.
    const finalTracking = trackingNumber || `AMEEX-PENDING-TJG-${input.orderNumber}`;
    const labelUrl = `/api/labels/${finalTracking}.pdf`;
    console.log(`${tag} ✅ Ameex SUCCESS! Tracking: ${finalTracking} (webhook will resolve real number later)`);
    return {
      success: true,
      trackingNumber: finalTracking,
      labelUrl,
      httpStatus: httpSt,
      rawResponse: rb,
      pendingReal: !trackingNumber,
      externalRef: `TJG-${input.orderNumber}`,
    };
  }

  // Inner helper — runs one attempt and throws on network error (non-Ameex carriers)
  const timeoutMs = TIMEOUT_MS;
  const attempt = async () => {
    if (providerKey === 'ameex') {
      // Ameex requires multipart/form-data
      const FormData = (await import('form-data')).default;
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v ?? '')));
      const cleanKey = (s: string) => (s || '').replace(/<[^>]*>/g, '').trim();
      return axios.post(apiUrl, fd, {
        headers: {
          'C-Api-Key': cleanKey(apiKey || ''),
          'C-Api-Id': cleanKey(apiSecret || ''),
          ...fd.getHeaders(),
        },
        timeout: 45000,
        httpsAgent: SSL_AGENT,
        validateStatus: () => true,
      });
    }
    return axios.post(apiUrl, payload, {
      headers,
      timeout: timeoutMs,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true, // Don't throw on 4xx/5xx — handled below
    });
  };

  let httpStatus = 0;
  let rawBody: unknown;
  let usedAttempts = 1;

  try {
    let response: Awaited<ReturnType<typeof attempt>>;

    // ── Retry loop: up to maxAttempts with exponential backoff + jitter ──
    // Retries on: network errors (ECONNRESET, ETIMEDOUT, …)
    //             HTTP 429 / 5xx
    //             2xx with completely empty body (carrier hiccup)
    const maxAttempts = getMaxAttempts(providerKey);
    let lastErr: any;
    let succeeded = false;

    for (let attempt_n = 1; attempt_n <= maxAttempts; attempt_n++) {
      usedAttempts = attempt_n;
      try {
        response = await attempt();

        // HTTP-level transient check — retry without throwing
        if (isTransientHttpError(response.status, response.data, false) && attempt_n < maxAttempts) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt_n - 1) + Math.floor(Math.random() * 200);
          console.warn(`${tag} [SHIP-RETRY] HTTP ${response.status} transient on attempt ${attempt_n}/${maxAttempts} — retrying in ${delay}ms`);
          await sleep(delay);
          continue;
        }

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
          const delay = BASE_DELAY_MS * Math.pow(2, attempt_n - 1) + Math.floor(Math.random() * 200);
          console.warn(`${tag} ⚠️ Transient network error [${code}] — attempt ${attempt_n}/${maxAttempts}. Retrying in ${delay}ms...`);
          console.warn(`[API-DEBUG]: Retry attempt ${attempt_n + 1} for URL: ${apiUrl}`);
          await sleep(delay);
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
        const first = rawBody[0] as any;

        // ── Digylog rejection envelope (isSuccess: false + errors array) ────
        // Examples: blacklisted phone, duplicate order, validation errors
        if (first && first.isSuccess === false) {
          const errs = Array.isArray(first.errors) ? first.errors.filter(Boolean).map(String) : [];
          const rawErrMsg = errs.length > 0
            ? errs.join(' — ')
            : (first.error || first.message || 'Digylog a refusé la commande sans message');

          const lc = rawErrMsg.toLowerCase();
          let userMsg = rawErrMsg;
          if (lc.includes('liste noire') || lc.includes('blacklist')) {
            userMsg = `🚫 Numéro client blacklisté par Digylog. ${rawErrMsg}`;
          } else if (lc.includes('existe déjà') || lc.includes('duplicate')) {
            userMsg = `⚠️ Commande en double chez Digylog. ${rawErrMsg}`;
          } else if (lc.includes('adresse') || lc.includes('ville')) {
            userMsg = `📍 Adresse/ville invalide. ${rawErrMsg}`;
          }

          console.error(`[DIGYLOG] ❌ Rejected (isSuccess=false): ${userMsg}`);
          return {
            success: false, error: userMsg, carrierMessage: rawErrMsg,
            httpStatus, rawResponse: rawBody,
            permanent: true, // explicit rejection — don't retry
          };
        }

        // Per-order error field (legacy single string format)
        if (first?.error) {
          const errMsg = String(first.error);
          console.error(`[DIGYLOG] ❌ Order error: ${errMsg}`);
          return { success: false, error: errMsg, carrierMessage: errMsg, httpStatus, rawResponse: rawBody, permanent: true };
        }

        // Use extractTracking() which checks tracking, barcode, num, code_suivi, tracking_number
        const tracking = extractTracking(rawBody);
        if (tracking) {
          if (usedAttempts > 1) console.log(`[SHIP-RETRY] order=${input.orderId} succeeded on attempt ${usedAttempts}/${maxAttempts}`);
          console.log(`[DIGYLOG] ✅ Success! tracking=${tracking}`);
          return { success: true, trackingNumber: tracking, labelUrl: `/api/labels/${tracking}.pdf`, httpStatus, rawResponse: rawBody, attempts: usedAttempts };
        }

        // Array returned but no error field AND no tracking number — possible transient
        console.error(`[DIGYLOG] ❌ No tracking number in Digylog response. Raw body: ${JSON.stringify(rawBody)}`);
        const noTrackMsg = "Digylog n'a pas retourné de numéro de suivi. Possible problème transitoire — sera réessayé.";
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

    if (usedAttempts > 1) console.log(`[SHIP-RETRY] order=${input.orderId} succeeded on attempt ${usedAttempts}/${maxAttempts}`);
    console.log(`${tag} ✅ SUCCESS! Tracking: ${trackingNumber}`);
    return { success: true, trackingNumber, labelUrl, httpStatus, rawResponse: rawBody, attempts: usedAttempts };

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
): Promise<{ status: string | null; rawStatus: string | null; rawResponse: unknown; deliveryCost?: number | null; driverPhone?: string; driverName?: string; error?: string }> {
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
    console.log(`[DIGYLOG-HISTORICS-FULL] ${trackingNumber} → ${JSON.stringify(histResp.data)}`);

    // Detect Digylog API outage: server returned an HTML error page instead of JSON.
    // Without this guard the function falls through to /infos and re-burns 15s on a dead API.
    {
      const responseBody = typeof histResp.data === 'string' ? histResp.data : JSON.stringify(histResp.data ?? '');
      if (
        histResp.status >= 500 ||
        responseBody.includes('<!DOCTYPE') ||
        responseBody.includes('<html') ||
        responseBody.toLowerCase().includes('internal server error') ||
        responseBody.toLowerCase().includes('an error occurred')
      ) {
        console.warn(`[DIGYLOG-TRACK] ${trackingNumber} → API DOWN (HTTP ${histResp.status}, HTML/5xx response)`);
        return { status: null, rawStatus: null, rawResponse: null, deliveryCost: null, error: `Digylog API indisponible (HTTP ${histResp.status})` };
      }
    }

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

      // Try to extract driver phone + name from historics COMMENT field.
      // Historics are returned newest-first, so the first record yielding a
      // phone is the most recent driver assignment. We try several patterns
      // because Digylog comments are free-text and inconsistent across
      // accounts.
      const allRecords = Array.isArray(records) ? records : [];
      let histDriverPhone = "";
      let histDriverName  = "";

      // Driver-context keywords. We only accept "bare number" matches when one
      // of these keywords appears in the same comment, otherwise we'd happily
      // pick up the customer's phone (which often shows up in delivery notes).
      const DRIVER_CTX = /(livreur|driver|chauffeur|affect[ée]|assign[ée]|sous[-\s]?traitant|coursier)/i;

      for (const rec of allRecords) {
        const commentText = String(
          rec?.comment || rec?.COMMENT || rec?.note || rec?.newvalue || rec?.location || ""
        );
        if (!commentText) continue;
        const hasDriverCtx = DRIVER_CTX.test(commentText);

        // Strategy 1 — explicit "téléphone:" / "tél:" / "phone:" prefix.
        // The prefix itself is the driver-context signal, so no extra gate.
        // Require exactly 9 (with country code stripped) or 10 digits.
        if (!histDriverPhone) {
          const m = commentText.match(
            /(?:t[ée]l[ée]phone|t[ée]l|phone)\s*[:=\-]?\s*\+?(?:212|0)?([0-9\s.-]{8,12})/i
          );
          if (m) {
            const cleaned = m[1].replace(/\D/g, "");
            if (cleaned.length === 10 && /^0[67]/.test(cleaned)) {
              histDriverPhone = cleaned;
            } else if (cleaned.length === 9 && /^[67]/.test(cleaned)) {
              histDriverPhone = "0" + cleaned;
            }
          }
        }

        // Strategy 2 — bare 10-digit Moroccan mobile (06xx or 07xx). Only
        // accept if a driver-context keyword is present in the comment.
        if (!histDriverPhone && hasDriverCtx) {
          const m = commentText.match(/(?:^|[^0-9])(0[67][0-9]{8})(?:[^0-9]|$)/);
          if (m) histDriverPhone = m[1];
        }

        // Strategy 3 — international format +212 6/7 xxxxxxx, with a trailing
        // boundary to avoid swallowing into longer numeric strings. Also
        // gated on driver-context keyword presence.
        if (!histDriverPhone && hasDriverCtx) {
          const m = commentText.match(/\+?212[\s.-]?([67][0-9]{8})(?:[^0-9]|$)/);
          if (m) histDriverPhone = "0" + m[1];
        }

        // Driver name — common assignment patterns. Strip mixed-in digits
        // and trailing separator chunks (e.g. "Hassan - 0607394948").
        if (!histDriverName) {
          const nameM =
            commentText.match(/(?:affect[ée]|assign[ée])\s*(?:à|a)?\s*([A-Za-zÀ-ÿ' .-]{3,40})/i) ||
            commentText.match(/(?:livreur|driver|chauffeur)\s*[:=\-]?\s*([A-Za-zÀ-ÿ' .-]{3,40})/i);
          if (nameM) {
            const cleaned = nameM[1]
              .trim()
              .replace(/[\d+]/g, "")
              .replace(/[\-:,].*$/, "")
              .trim();
            if (cleaned.length >= 2) histDriverName = cleaned;
          }
        }

        if (histDriverPhone) break;
      }

      if (histDriverPhone || histDriverName) {
        console.log(
          `[DRIVER-HISTORICS] ${trackingNumber} → phone="${histDriverPhone}" name="${histDriverName}"`
        );
      }

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
        else if (rawLow.includes('supprim')) { mappedStatus = 'Supprimée'; }
        else if (rawLow.includes('retour') && !rawLow.includes('en cours')) { mappedStatus = 'retourné'; }
        else if (rawLow.includes('refus') || rawLow.includes('annul')) { mappedStatus = 'refused'; }
        else if (rawLow.includes('injoignable') || rawLow.includes('absent')) { mappedStatus = 'Injoignable'; }
        else if (rawLow.includes('ramass') || rawLow.includes('attente')) { mappedStatus = 'Attente De Ramassage'; }

        console.log(`[DIGYLOG-TRACK] ${trackingNumber} → rawStatus="${rawText}" mapped="${mappedStatus}"`);
        return { status: mappedStatus, rawStatus: rawText, rawResponse: body, deliveryCost: null, driverPhone: histDriverPhone, driverName: histDriverName };
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
    console.log(`[DIGYLOG-INFOS-FULL] ${trackingNumber}: ${JSON.stringify(infosResp.data)}`);

    // Same outage detection on the /infos fallback.
    {
      const responseBody = typeof infosResp.data === 'string' ? infosResp.data : JSON.stringify(infosResp.data ?? '');
      if (
        infosResp.status >= 500 ||
        responseBody.includes('<!DOCTYPE') ||
        responseBody.includes('<html') ||
        responseBody.toLowerCase().includes('internal server error') ||
        responseBody.toLowerCase().includes('an error occurred')
      ) {
        console.warn(`[DIGYLOG-TRACK] ${trackingNumber} → /infos API DOWN (HTTP ${infosResp.status}, HTML/5xx response)`);
        return { status: null, rawStatus: null, rawResponse: null, deliveryCost: null, error: `Digylog API indisponible (HTTP ${infosResp.status})` };
      }
    }

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
        else if (rawLow.includes('supprim')) { mappedStatus = 'Supprimée'; }
        else if (rawLow.includes('retour') && !rawLow.includes('en cours')) { mappedStatus = 'retourné'; }
        else if (rawLow.includes('refus')) { mappedStatus = 'refused'; }
        else if (rawLow.includes('ramass') || rawLow.includes('attente')) { mappedStatus = 'Attente De Ramassage'; }

        console.log(`[DIGYLOG-TRACK] ${trackingNumber} → rawStatus="${rawText}" mapped="${mappedStatus}"`);
        const deliveryCostRaw = body?.deliveryCost ?? body?.frais_livraison ?? body?.port ?? null;
        const deliveryCost = deliveryCostRaw ? Math.round(parseFloat(String(deliveryCostRaw)) * 100) : null;

        // Extract driver phone + name from Digylog /infos response. Account
        // configurations vary — some return top-level fields, some nest the
        // driver under livreur/driver/affecteA/assigned_to. Cover all the
        // shapes we've seen in the wild.
        let driverPhone =
          body?.livreur_phone || body?.livreur_tel || body?.driver_phone ||
          body?.livreur?.phone || body?.livreur?.telephone ||
          body?.driver?.phone  || body?.driver?.tel ||
          body?.affecteA?.phone || body?.affecte_a_phone ||
          body?.assigned_to?.phone || body?.courier_phone || "";

        let driverName =
          body?.livreur_name || body?.livreur?.name || body?.livreur?.nom ||
          body?.driver_name  || body?.driver?.name  ||
          body?.affecteA?.name || body?.affecte_a_name ||
          body?.assigned_to?.name || body?.courier_name || "";

        // If neither field gave us a phone, fall back to scanning any
        // free-text fields the response might carry (some accounts only
        // expose driver info inside comment/note/last_status). Same
        // false-positive guard as the historics path: bare numbers are only
        // accepted when a driver-context keyword is present.
        if (!driverPhone) {
          const freeText = String(
            body?.comment || body?.note || body?.last_status || body?.location || ""
          );
          if (freeText) {
            const hasDriverCtx =
              /(livreur|driver|chauffeur|affect[ée]|assign[ée]|sous[-\s]?traitant|coursier)/i.test(
                freeText
              );
            // Strategy 1 — explicit prefix is its own context signal
            const prefixed = freeText.match(
              /(?:t[ée]l[ée]phone|t[ée]l|phone)\s*[:=\-]?\s*\+?(?:212|0)?([0-9\s.-]{8,12})/i
            );
            if (prefixed) {
              const cleaned = prefixed[1].replace(/\D/g, "");
              if (cleaned.length === 10 && /^0[67]/.test(cleaned)) driverPhone = cleaned;
              else if (cleaned.length === 9 && /^[67]/.test(cleaned)) driverPhone = "0" + cleaned;
            }
            // Bare-number strategies — gated on driver context
            if (!driverPhone && hasDriverCtx) {
              const bare = freeText.match(/(?:^|[^0-9])(0[67][0-9]{8})(?:[^0-9]|$)/);
              if (bare) driverPhone = bare[1];
            }
            if (!driverPhone && hasDriverCtx) {
              const intl = freeText.match(/\+?212[\s.-]?([67][0-9]{8})(?:[^0-9]|$)/);
              if (intl) driverPhone = "0" + intl[1];
            }
          }
        }

        console.log(`[DIGYLOG-DRIVER] ${trackingNumber} → phone="${driverPhone}" name="${driverName}" raw keys=${Object.keys(body).join(',')}`);

        return { status: mappedStatus, rawStatus: rawText, rawResponse: body, deliveryCost, driverPhone, driverName };
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

/**
 * Map a Digylog raw status string ("Livré", "En cours de livraison", …) to one of
 * our internal statuses. Kept in sync with the inline mapping inside
 * `trackDigylogShipment` — extract here so importers/auto-create paths can reuse it.
 */
export function mapDigylogStatus(rawText: string): string {
  const rawLow = (rawText || '').toLowerCase().trim();
  if (!rawLow) return 'Attente De Ramassage';
  if (
    rawLow === 'livré' || rawLow === 'livre' || rawLow === 'livrée' ||
    rawLow === 'livrée *' || rawLow === 'livré *' ||
    rawLow === 'livraison effectuée' ||
    rawLow === 'remis au client' || rawLow === 'remis au client *' ||
    rawLow === 'delivered' || rawLow.includes('distribu')
  ) return 'delivered';
  if (rawLow.includes('retour') && !rawLow.includes('en cours')) return 'retourné';
  if (rawLow.includes('refus') || rawLow.includes('annul')) return 'refused';
  if (rawLow.includes('injoignable') || rawLow.includes('absent')) return 'Injoignable';
  if (rawLow.includes('ramass') || rawLow.includes('attente')) return 'Attente De Ramassage';
  if (rawLow.includes('livr') || rawLow.includes('cours de livr')) return 'in_progress';
  return 'in_progress';
}

/**
 * Fetch full order details (customer name, phone, address, city, price, status)
 * for a single tracking number. Used by the webhook auto-create path so that
 * orders shipped BEFORE the integration was configured can be backfilled into
 * the platform from the carrier's data.
 *
 * Returns `null` when the carrier doesn't expose a per-order detail endpoint
 * yet — callers fall back to "log as orphan".
 */
export async function fetchOrderDetails(
  provider: string,
  trackingNumber: string,
  account: any
): Promise<{
  status: string | null;
  rawStatus: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  totalPrice?: number;
  shippingCost?: number;
  productName?: string;
  driverName?: string;
  driverPhone?: string;
  rawPayload?: any;
} | null> {
  const p = (provider || '').toLowerCase().trim();

  if (p === 'digylog') {
    const apiKey    = (account as any).apiKey;
    const customUrl = (account as any).apiUrl || undefined;
    if (!apiKey) return null;

    const base = (customUrl || 'https://api.digylog.com/api/v2/seller')
      .replace(/\/+$/, '').replace(/api\.digylog\.ma/i, 'api.digylog.com');

    const resp = await axios.get(`${base}/order/${encodeURIComponent(trackingNumber)}/infos`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      timeout: 15000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    if (resp.status !== 200 || !resp.data) {
      console.warn(`[FETCH-DETAILS] Digylog ${trackingNumber} → HTTP ${resp.status}`);
      return null;
    }
    const b = resp.data;

    const tracked = await trackDigylogShipment(trackingNumber, apiKey, customUrl);

    const priceCentimes = (val: any): number | undefined => {
      if (val === null || val === undefined || val === '') return undefined;
      const n = parseFloat(String(val));
      return isNaN(n) ? undefined : Math.round(n * 100);
    };

    return {
      status:    tracked.status,
      rawStatus: tracked.rawStatus,
      customerName:    b.name        || b.client_name  || b.customer_name || '',
      customerPhone:   b.phone       || b.tel          || b.client_phone  || '',
      customerAddress: b.address     || b.adresse      || '',
      customerCity:    b.city        || b.ville        || '',
      totalPrice:      priceCentimes(b.price ?? b.amount ?? b.cod),
      shippingCost:    priceCentimes(b.deliveryCost ?? b.frais_livraison ?? b.port),
      productName:     (b.product || b.produit || b.article || b.designation || b.product_name || '').toString().trim() || undefined,
      driverName:      tracked.driverName,
      driverPhone:     tracked.driverPhone,
      rawPayload:      b,
    };
  }

  // Ameex (and other carriers) not implemented yet — caller logs as orphan.
  return null;
}

/**
 * List all orders the carrier has shipped on behalf of the merchant. Used by the
 * "Importer commandes historiques" button to backfill orders that were shipped
 * BEFORE the integration was wired up.
 *
 * Returns an empty array for carriers without a list endpoint yet.
 */
export async function listOrdersFromCarrier(
  provider: string,
  account: any,
  options?: { since?: string }
): Promise<Array<{
  trackingNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  totalPrice: number;
  shippingCost: number;
  productName?: string;
  rawStatus: string;
  status: string;
}>> {
  const p = (provider || '').toLowerCase().trim();

  if (p === 'digylog') {
    const apiKey    = (account as any).apiKey;
    const customUrl = (account as any).apiUrl || undefined;
    if (!apiKey) return [];

    const base = (customUrl || 'https://api.digylog.com/api/v2/seller')
      .replace(/\/+$/, '').replace(/api\.digylog\.ma/i, 'api.digylog.com');

    const params: any = {};
    if (options?.since) params.from = options.since;

    const resp = await axios.get(`${base}/orders`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      params,
      timeout: 30000,
      httpsAgent: SSL_AGENT,
      validateStatus: () => true,
    });

    if (resp.status !== 200) {
      console.warn(`[LIST-ORDERS] Digylog HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 200)}`);
      return [];
    }

    const list: any[] = resp.data?.data || resp.data?.orders || (Array.isArray(resp.data) ? resp.data : []);
    const priceCentimes = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      const n = parseFloat(String(val));
      return isNaN(n) ? 0 : Math.round(n * 100);
    };

    return list
      .map((o: any) => {
        const trackingNumber = String(o.traking || o.tracking || o.code || '').trim();
        return {
          trackingNumber,
          customerName:    String(o.name    || o.client_name || o.customer_name || ''),
          customerPhone:   String(o.phone   || o.tel         || o.client_phone  || ''),
          customerAddress: String(o.address || o.adresse     || ''),
          customerCity:    String(o.city    || o.ville       || ''),
          totalPrice:      priceCentimes(o.price ?? o.amount ?? o.cod),
          shippingCost:    priceCentimes(o.deliveryCost ?? o.frais_livraison ?? o.port),
          productName:     (o.product || o.produit || o.article || o.designation || o.product_name || '').toString().trim() || undefined,
          rawStatus:       String(o.status || o.etat || ''),
          status:          mapDigylogStatus(String(o.status || o.etat || '')),
        };
      })
      .filter((o) => o.trackingNumber.length > 0);
  }

  return [];
}

/**
 * Generic per-carrier tracker dispatcher.
 * Add a new branch here when a new carrier-tracking helper is exported above.
 * Returned shape is intentionally narrow so callers (sync loop) can stay carrier-agnostic.
 */
export async function trackByCarrier(
  provider: string,
  trackingNumber: string,
  account: any
): Promise<{ status: string | null; rawStatus: string | null; fee?: number | null; error?: string }> {
  const p = (provider || '').toLowerCase().trim();
  const apiKey  = (account as any)?.apiKey;
  const apiUrl  = (account as any)?.apiUrl || undefined;

  if (!apiKey) {
    return { status: null, rawStatus: null, error: `Compte ${provider} sans clé API.` };
  }

  if (p === 'ameex') {
    const r = await trackAmeexShipment(trackingNumber, apiKey, apiUrl);
    return { status: r.status, rawStatus: r.rawStatus, error: r.error };
  }

  if (p === 'digylog') {
    const r = await trackDigylogShipment(trackingNumber, apiKey, apiUrl);
    return { status: r.status, rawStatus: r.rawStatus, error: r.error };
  }

  if (p === 'ozonexpress') {
    const r = await trackOzonExpressShipment(trackingNumber, apiKey, account);
    return { status: r.status, rawStatus: r.rawStatus, error: r.error };
  }

  if (p === 'expresscoursier') {
    const r = await trackExpressCoursierShipment(trackingNumber, apiKey, account);
    return { status: r.status, rawStatus: r.rawStatus, fee: r.fee, error: r.error };
  }

  return { status: null, rawStatus: null, error: `Carrier "${provider}" sync not implemented yet` };
}

// ─── Ozon Express tracking ────────────────────────────────────────────────────

// ── Status CODES (sent by webhook + possibly by tracking endpoint) ────────────
// Unknown/financial codes intentionally absent — they return null (keep current status).
export const OZON_STATUS_MAP: Record<string, string> = {
  DELIVERED:             "delivered",
  PAID:                  "delivered",
  RETURNED:              "Retour Recu",
  REFUSE:                "refused",
  CANCELED:              "annule",
  NEW_PARCEL:            "Attente De Ramassage",
  WAITING_PICKUP:        "Attente De Ramassage",
  PRE_PICKED_UP:         "Attente De Ramassage",
  PICKED_UP:             "transit",
  SENT:                  "transit",
  SENT_TO_AGENCY:        "transit",
  RECEIVED:              "transit",
  RECEIVED_IN_AGENCY:    "transit",
  DISTRIBUTION:          "transit",
  IN_PROGRESS:           "transit",
  DELAYED:               "transit",
  VLMN:                  "transit",
  PROGRAMED:             "transit",
  NOANSWER:              "unreachable",
  NOANSWER_DAY_2:        "unreachable",
  NOANSWER_DAY_3:        "unreachable",
  DEPLA:                 "unreachable",
  DEPLA_DAY_2:           "unreachable",
  DEPLA_DAY_3:           "unreachable",
  POSTPONED:             "confirme_reporte",
  RPO:                   "confirme_reporte",
  // Intentionally unmapped (financial/edge — never overwrite):
  // INVOICED, NOT_PAID, REMBOURSED, EN, INT, SANS_ADRE, OUT_OF_AREA, SCTR, NCVRT, BAM_SEIZED, DAMAGED
};

// ── French STATUS NAMES (returned by the tracking/polling endpoint) ───────────
export const OZON_NAME_MAP: Record<string, string> = {
  "paye":                              "delivered",
  "livre":                             "delivered",
  "retourne":                          "Retour Recu",
  "refuse":                            "refused",
  "annule":                            "annule",
  "nouveau colis":                     "Attente De Ramassage",
  "attente de ramassage":              "Attente De Ramassage",
  "pre ramasse":                       "Attente De Ramassage",
  "ramasse":                           "transit",
  "expedie":                           "transit",
  "recu":                              "transit",
  "mise en distribution":              "transit",
  "en cours":                          "transit",
  "programme":                         "transit",
  "retarde":                           "transit",
  "livraison sous conditions":         "transit",
  "envoye a l'agence":                 "transit",
  "recu en agence de livraison":       "transit",
  "reporte":                           "confirme_reporte",
  "reporte aujourd hui":               "confirme_reporte",
  "pas de reponse + sms":              "unreachable",
  "pas reponse +deplacement":          "unreachable",
  "pas de reponse j+2":                "unreachable",
  "pas de reponse j+3":                "unreachable",
  "pas reponse + deplacement j+2":     "unreachable",
  "pas reponse + deplacement j+3":     "unreachable",
  // Intentionally unmapped (null): facture, hors-zone, erreur numero, client interesse,
  // non paye, sans adresse, rembourse, saisi par barid al-maghrib, endommage, hors secteur
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function mapOzonStatus(raw: string): string | null {
  if (!raw) return null;
  // Try CODE lookup first (webhook path)
  const code = raw.toString().trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (OZON_STATUS_MAP[code]) return OZON_STATUS_MAP[code];
  // Fall back to French name lookup (polling/tracking path)
  const name = stripAccents(raw.toString().toLowerCase().trim());
  return OZON_NAME_MAP[name] ?? null; // unknown → null = keep current status, just log
}

export async function trackOzonExpressShipment(
  trackingNumber: string,
  apiKey: string,
  account: any
): Promise<{ status: string | null; rawStatus: string | null; rawResponse: any; error?: string }> {
  const customerId =
    account?.settings?.ozonExpressCustomerId ??
    account?.ozonSettings?.ozonExpressCustomerId ??
    (account as any)?.customerId;
  const base = `https://api.ozonexpress.ma/customers/${customerId}/${apiKey}`;

  // Try the tracking endpoint first, then fall back to parcel-info
  const tryEndpoints = [
    `${base}/parcels/tracking`,
    `${base}/tracking`,
    `${base}/parcel-info`,
  ];

  const { default: FormData } = await import('form-data');
  let body: any = null;
  let usedUrl = "";

  for (const url of tryEndpoints) {
    try {
      const fd = new FormData();
      fd.append('tracking-number', trackingNumber);
      const r = await axios.post(url, fd, {
        headers: { ...fd.getHeaders() },
        timeout: 15000,
        validateStatus: () => true,
      });
      console.log(`[OZON-TRACK] ${trackingNumber} via ${url} HTTP ${r.status}: ${JSON.stringify(r.data)}`);
      if (r.status < 400 && r.data) { body = r.data; usedUrl = url; break; }
    } catch (e: any) {
      console.log(`[OZON-TRACK] ${trackingNumber} ${url} error: ${e?.message}`);
    }
  }

  if (!body) {
    return { status: null, rawStatus: null, rawResponse: null, error: "Ozon: no tracking response" };
  }

  // Extract status from the common Ozon tracking response shapes
  const t = body['TRACKING'] || body['PARCEL-TRACKING'] || body['PARCEL-INFO'] || body;
  const rawStatus =
    t?.['LAST-TRANSITION']?.['STATUT'] ??
    t?.['LAST-TRANSITION']?.['STATUS'] ??
    (Array.isArray(t?.['TRANSITIONS']) && t['TRANSITIONS'].length
      ? t['TRANSITIONS'][t['TRANSITIONS'].length - 1]?.['STATUT'] : null) ??
    (Array.isArray(t?.['TRACKING']) && t['TRACKING'].length
      ? t['TRACKING'][t['TRACKING'].length - 1]?.['STATUT'] : null) ??
    t?.['STATUT'] ?? t?.['STATUS'] ?? t?.['INFOS']?.['STATUT'] ?? null;

  return {
    status: rawStatus ? mapOzonStatus(rawStatus) : null,
    rawStatus,
    rawResponse: body,
    error: undefined,
  };
}

// ─── Express Coursier tracking ────────────────────────────────────────────────

export const EC_STATUS_MAP: Record<string, string> = {
  // TODO: fill remaining real Express Coursier status labels → internal codes
  // once API docs are confirmed. Confirmed so far from real webhook traffic:
  //   "Livré" (2026-07-06, live "olivraison" webhook test) → delivered
  "delivered":  "delivered",
  "livre":      "delivered",
  "livré":      "delivered",
  "retour":     "refused",
  "refuse":     "refused",
  "refusé":     "refused",
  "in_transit": "in_progress",
};

export function mapEcStatus(raw: string): string | null {
  return EC_STATUS_MAP[(raw || '').toLowerCase().trim()] ?? null;
}

// Masks an API key for logging — keeps only the last 4 characters visible.
function maskApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  if (trimmed.length <= 4) return '****';
  return `****${trimmed.slice(-4)}`;
}

// Default EC track endpoint — UNVERIFIED. Confirmed to 404 on real package_ids
// (e.g. "CL-EXP-2607041205-164X55103261"). Do NOT trust this URL as correct.
// TODO(EC-DOCS): replace with the real Express Coursier tracking endpoint once
// their API docs are provided. Once confirmed, either update this default or
// set `settings.ecTrackUrlTemplate` on the carrier account (see below) so no
// code change is needed for existing stores.
const EC_TRACK_URL_TEMPLATE_DEFAULT =
  "https://expresscoursier.ma/v1.0/track/{apiKey}/{tracking}";

export async function trackExpressCoursierShipment(
  trackingNumber: string,
  apiKey: string,
  account?: any
): Promise<{ status: string | null; rawStatus: string | null; rawResponse: any; fee: number | null; error?: string }> {
  // Endpoint is configurable per carrier account via settings.ecTrackUrlTemplate
  // (placeholders: {apiKey}, {tracking}, {storeId}). Falls back to the current
  // (unverified) default when not set.
  const template: string =
    (account?.settings as any)?.ecTrackUrlTemplate || EC_TRACK_URL_TEMPLATE_DEFAULT;
  const url = template
    .replace("{apiKey}", encodeURIComponent(apiKey.trim()))
    .replace("{tracking}", encodeURIComponent(trackingNumber))
    .replace("{storeId}", encodeURIComponent(String(account?.storeId ?? "")));

  // Always log the exact request URL (API key masked) so the correct endpoint
  // can be verified by hand against Express Coursier's real docs.
  const maskedUrl = url.replace(encodeURIComponent(apiKey.trim()), maskApiKey(apiKey));
  console.log(`[EC-TRACK-REQUEST] tracking=${trackingNumber} url=${maskedUrl}`);

  try {
    const r = await axios.get(url, { timeout: 15000, validateStatus: () => true });
    const body = r.data;
    const contentType = String(r.headers?.["content-type"] || "");
    const isJson = contentType.includes("application/json") || (typeof body === "object" && body !== null);

    // Non-JSON response (HTML error page, etc.) or HTTP 4xx/5xx — the endpoint
    // is very likely wrong. Surface a clear, structured error instead of
    // silently returning a null status.
    if (!isJson || r.status >= 400) {
      const rawSnippet = (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 300);
      console.log(`[EC-TRACK-FULL] ${trackingNumber}: HTTP ${r.status} non-JSON/error response — raw="${rawSnippet}"`);
      return {
        status: null,
        rawStatus: null,
        rawResponse: rawSnippet,
        fee: null,
        error: `EC track endpoint returned HTTP ${r.status} / non-JSON — endpoint likely wrong`,
      };
    }

    // Full raw response — used to identify fee field name
    console.log(`[EC-TRACK-FULL] ${trackingNumber}: ${JSON.stringify(body)}`);

    const rawStatus =
      body?.status ??
      body?.data?.status ??
      body?.tracking?.status ??
      null;

    // Fee extraction — probe all common field names in all known response shapes
    const d = body?.data ?? body;
    const t = body?.tracking ?? d;
    const feeRaw =
      d?.delivery_price ?? d?.deliveryPrice ?? d?.price ?? d?.fee ??
      d?.frais ?? d?.montant ?? d?.tarif ?? d?.shipping_price ??
      t?.delivery_price ?? t?.price ?? null;
    const feeNum = Number(feeRaw);
    const fee = Number.isFinite(feeNum) && feeNum > 0 ? feeNum : null;

    return {
      status: rawStatus ? mapEcStatus(rawStatus) : null,
      rawStatus,
      rawResponse: body,
      fee,
      error: r.status >= 400 ? `HTTP ${r.status}` : undefined,
    };
  } catch (e: any) {
    console.log(`[EC-TRACK-FULL] ${trackingNumber}: request failed — ${e?.message || e}`);
    return { status: null, rawStatus: null, rawResponse: null, fee: null, error: e?.message || 'EC track error' };
  }
}

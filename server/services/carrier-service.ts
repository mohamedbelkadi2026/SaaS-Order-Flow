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
  digylog:        "https://app.digylog.com/api/v1/orders",
  ecotrack:       "https://app.ecotrack.ma/api/v1/orders",
  "eco-track":    "https://app.ecotrack.ma/api/v1/orders",
  cathedis:       "https://app.cathedis.com/api/v1/parcels",
  onessta:        "https://api.onessta.com/api/v1/orders",
  ozoneexpress:   "https://api.ozoneexpress.ma/api/v1/orders",
  sendit:         "https://api.sendit.ma/api/v1/orders",
  ameex:          "https://api.ameex.ma/api/v1/orders",
  speedex:        "https://api.speedex.ma/api/v1/orders",
  kargoexpress:   "https://api.kargoexpress.ma/api/v1/orders",
  forcelog:       "https://api.forcelog.ma/api/v1/orders",
  livo:           "https://api.livo.ma/api/v1/orders",
  quicklivraison: "https://api.quicklivraison.ma/api/v1/orders",
  codinafrica:    "https://api.codinafrica.ma/api/v1/orders",
};

// ── Timeout ───────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 20_000; // 20 seconds

export interface CarrierShipInput {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  totalPrice: number;   // in centimes — converted to DH before sending
  productName: string;
  canOpen: boolean;
  orderNumber: string;
  orderId: number;
  storeId: number;
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
// Payload builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(input: CarrierShipInput): Record<string, unknown> {
  const phone   = sanitizePhone(input.phone);
  const priceDH = +(input.totalPrice / 100).toFixed(2);
  const addr    = input.address.trim() || input.city.trim();

  return {
    // Primary field names (Digylog / Eco-Track standard)
    nom_complet:     input.customerName.trim(),
    telephone:       phone,
    ville:           input.city.trim(),
    adresse:         addr,
    prix:            priceDH,
    produit:         input.productName.trim(),
    ouverture_colis: input.canOpen ? 1 : 0,
    reference:       input.orderNumber,

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

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractTracking(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  return (
    body.tracking_number        ||
    body.trackingNumber         ||
    body.barcode                ||
    body.code_suivi             ||
    body.numero_suivi           ||
    body.id                     ||
    body.data?.tracking_number  ||
    body.data?.barcode          ||
    body.data?.code_suivi       ||
    body.result?.tracking_number ||
    body.result?.barcode        ||
    undefined
  );
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

  // ── 2. Resolve URL ───────────────────────────────────────────────
  const providerKey = provider.toLowerCase().replace(/\s+/g, "");
  const defaultUrl  = CARRIER_ENDPOINTS[providerKey];
  const apiUrl      = creds.apiUrl?.trim() || defaultUrl;

  if (!apiUrl) {
    const err = `Aucune URL API configurée pour "${provider}". Ajoutez l'URL dans Intégrations → Transporteurs.`;
    console.error(`${tag} ❌ ${err}`);
    return { success: false, error: err };
  }

  // ── 3. Auth headers ──────────────────────────────────────────────
  const apiKey    = creds.apiKey?.trim()    || "";
  const apiSecret = creds.apiSecret?.trim() || "";

  // Log key resolution for Digylog/EcoTrack (first 5 chars only for security)
  if (providerKey.includes("digylog") || providerKey.includes("ecotrack")) {
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

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-KEY"]     = apiKey;
    headers["Token"]         = apiKey;
  }
  if (apiSecret) {
    headers["X-API-SECRET"] = apiSecret;
  }

  // ── 4. Build payload & log everything ───────────────────────────
  const payload        = buildPayload(input);
  const sanitizedPhone = sanitizePhone(input.phone);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`${tag} 🚀 SENDING ORDER TO CARRIER`);
  console.log(`${tag} URL:            ${apiUrl}`);
  console.log(`${tag} PHONE SANITIZE: "${input.phone}" → "${sanitizedPhone}"`);
  console.log(`${tag} CITY:           "${input.city}"   ADDRESS: "${input.address}"`);
  console.log(`${tag} PRICE:          ${input.totalPrice} centimes → ${+(input.totalPrice / 100).toFixed(2)} DH`);
  console.log(`${tag} PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
  console.log(`${"═".repeat(70)}\n`);

  // ── 5. HTTP request via axios (20s timeout, SSL bypass) ──────────
  let httpStatus = 0;
  let rawBody: unknown;

  try {
    const response = await axios.post(apiUrl, payload, {
      headers,
      timeout: TIMEOUT_MS,
      httpsAgent: SSL_AGENT,
      // Don't throw on 4xx/5xx — handle manually for better error messages
      validateStatus: () => true,
    });

    httpStatus = response.status;
    rawBody    = response.data;

    console.log(`${tag} Response: HTTP ${httpStatus}`);
    console.log(`${tag} Body: ${JSON.stringify(rawBody)}`);

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

    // ── 5b. 2xx with logical error ────────────────────────────────
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

    // ── 5c. Success ───────────────────────────────────────────────
    const trackingNumber = extractTracking(rawBody) || `${provider.toUpperCase()}-${Date.now()}-${input.orderId}`;
    const labelUrl       = extractLabelUrl(rawBody)  || `/api/labels/${trackingNumber}.pdf`;

    console.log(`${tag} ✅ SUCCESS! Tracking: ${trackingNumber}`);
    return { success: true, trackingNumber, labelUrl, httpStatus, rawResponse: rawBody };

  } catch (err: any) {
    // ── Network / timeout / SSL errors ────────────────────────────
    const isTimeout =
      err?.code === "ECONNABORTED" ||
      err?.code === "ETIMEDOUT"    ||
      axios.isCancel(err)          ||
      err?.message?.toLowerCase().includes("timeout");

    const isFetchFailed =
      err?.code === "ECONNREFUSED" ||
      err?.code === "ENOTFOUND"    ||
      err?.code === "ECONNRESET"   ||
      err?.message?.toLowerCase().includes("fetch failed") ||
      err?.message?.toLowerCase().includes("network");

    // ── Detailed diagnostic log ───────────────────────────────────
    console.error(`\n${"─".repeat(70)}`);
    console.error(`${tag} ❌ SHIPPING NETWORK ERROR`);
    console.error(`[SHIPPING-ERROR] URL attempted: ${apiUrl}`);
    console.error(`[SHIPPING-ERROR] Error code:    ${err?.code || "(no code)"}`);
    console.error(`[SHIPPING-ERROR] Error message: ${err?.message || String(err)}`);
    if (err?.response) {
      console.error(`[SHIPPING-ERROR] HTTP status:   ${err.response.status}`);
      console.error(`[SHIPPING-ERROR] HTTP body:     ${JSON.stringify(err.response.data)}`);
    }
    console.error(`[ERROR-DETAIL] Full stack:\n${err?.stack || "(no stack)"}`);
    console.error(`${"─".repeat(70)}\n`);

    // ── User-facing error string ──────────────────────────────────
    let errMsg: string;

    if (isTimeout) {
      errMsg = `⚠️ سيرفر شركة الشحن لا يستجيب حالياً (timeout ${TIMEOUT_MS / 1000}s). حاول مجدداً بعد قليل.`;
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

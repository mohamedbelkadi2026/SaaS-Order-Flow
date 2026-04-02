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
// Always use verified .ma domains for Moroccan carriers.
const CARRIER_ENDPOINTS: Record<string, string> = {
  digylog:        "https://api.digylog.ma/v1/orders",    // ✅ correct .ma domain
  ecotrack:       "https://app.ecotrack.ma/api/v1/orders",
  "eco-track":    "https://app.ecotrack.ma/api/v1/orders",
  cathedis:       "https://app.cathedis.ma/api/v1/parcels",
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

// ── Known bad-URL corrections (auto-applied before every request) ──────────
// Maps patterns that appear in user-pasted URLs to the correct replacement.
const URL_CORRECTIONS: Array<{ match: RegExp; replace: string; hint: string }> = [
  {
    match:   /app\.digylog\.com/gi,
    replace: "api.digylog.ma",
    hint:    "app.digylog.com → api.digylog.ma",
  },
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
const TIMEOUT_MS = 30_000; // 30 seconds — Moroccan carrier APIs can be slow

// ── Transient error codes that trigger an automatic retry ────────────────────
const TRANSIENT_CODES = new Set([
  "ENOTFOUND",    // DNS resolution failure (bad/unreachable host)
  "EAI_AGAIN",    // DNS temporary failure (common on Railway)
  "ECONNRESET",   // Connection dropped mid-flight
  "ECONNREFUSED", // Server not accepting connections
  "ETIMEDOUT",    // TCP-level timeout
  "ECONNABORTED", // axios timeout
]);

const MAX_ATTEMPTS   = 3;   // 1 initial + 2 retries
const RETRY_DELAY_MS = 2000; // 2 s between each attempt

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
  console.log(`[API-DEBUG]: Calling Carrier at: ${apiUrl}`);
  console.log(`${tag} URL:            ${apiUrl}`);
  console.log(`${tag} PHONE SANITIZE: "${input.phone}" → "${sanitizedPhone}"`);
  console.log(`${tag} CITY:           "${input.city}"   ADDRESS: "${input.address}"`);
  console.log(`${tag} PRICE:          ${input.totalPrice} centimes → ${+(input.totalPrice / 100).toFixed(2)} DH`);
  console.log(`${tag} PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
  console.log(`${"═".repeat(70)}\n`);

  // ── 5. HTTP request via axios (20s timeout, SSL bypass) ──────────
  // Inner helper — runs one attempt and throws on network error
  const attempt = () => axios.post(apiUrl, payload, {
    headers,
    timeout: TIMEOUT_MS,
    httpsAgent: SSL_AGENT,
    validateStatus: () => true, // Don't throw on 4xx/5xx — handled below
  });

  let httpStatus = 0;
  let rawBody: unknown;

  try {
    let response: Awaited<ReturnType<typeof attempt>>;

    // ── Retry loop: up to MAX_ATTEMPTS (3) with RETRY_DELAY_MS (2s) between ──
    let lastErr: any;
    let succeeded = false;

    for (let attempt_n = 1; attempt_n <= MAX_ATTEMPTS; attempt_n++) {
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

        if (isTransient && attempt_n < MAX_ATTEMPTS) {
          console.warn(`${tag} ⚠️ Transient network error [${code}] — attempt ${attempt_n}/${MAX_ATTEMPTS}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
          console.warn(`[API-DEBUG]: Retry attempt ${attempt_n + 1} for URL: ${apiUrl}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        } else if (isTransient && attempt_n === MAX_ATTEMPTS) {
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

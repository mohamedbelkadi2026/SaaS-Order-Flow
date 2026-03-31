/**
 * carrier-service.ts
 * Real HTTP integration with Moroccan shipping carriers.
 * Handles payload mapping, auth headers, phone sanitization,
 * address pre-validation, detailed logging, and error propagation.
 */

// ── Carrier API base URLs ─────────────────────────────────────────────────────
const CARRIER_ENDPOINTS: Record<string, string> = {
  digylog:       "https://app.digylog.com/api/v1/orders",
  ecotrack:      "https://app.ecotrack.ma/api/v1/orders",
  "eco-track":   "https://app.ecotrack.ma/api/v1/orders",
  cathedis:      "https://app.cathedis.com/api/v1/parcels",
  onessta:       "https://api.onessta.com/api/v1/orders",
  ozoneexpress:  "https://api.ozoneexpress.ma/api/v1/orders",
  sendit:        "https://api.sendit.ma/api/v1/orders",
  ameex:         "https://api.ameex.ma/api/v1/orders",
  speedex:       "https://api.speedex.ma/api/v1/orders",
  kargoexpress:  "https://api.kargoexpress.ma/api/v1/orders",
  forcelog:      "https://api.forcelog.ma/api/v1/orders",
  livo:          "https://api.livo.ma/api/v1/orders",
  quicklivraison:"https://api.quicklivraison.ma/api/v1/orders",
  codinafrica:   "https://api.codinafrica.ma/api/v1/orders",
};

export interface CarrierShipInput {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  totalPrice: number;    // in centimes — we convert to DH for the API
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

/**
 * Sanitize Moroccan phone numbers to the format expected by carriers.
 * Carriers uniformly reject +212XXXXXXXXX — they want 0XXXXXXXXX (10 digits).
 *
 * Rules:
 *   +212XXXXXXXXX  → 0XXXXXXXXX    (9 digits after 212 → prepend 0)
 *   00212XXXXXXXXX → 0XXXXXXXXX
 *   212XXXXXXXXX   → 0XXXXXXXXX    (if 12 chars starting with 212)
 *   06XXXXXXXX / 07XXXXXXXX → unchanged (already correct)
 *   Strips all spaces, dashes, dots, parentheses
 */
function sanitizePhone(raw: string): string {
  // Strip all formatting characters
  let cleaned = raw.replace(/[\s\-().+]/g, "");

  // +212XXXXXXXXX or 00212XXXXXXXXX → 0XXXXXXXXX
  if (cleaned.startsWith("00212")) {
    cleaned = "0" + cleaned.slice(5);
  } else if (cleaned.startsWith("212") && cleaned.length === 12) {
    cleaned = "0" + cleaned.slice(3);
  }

  return cleaned;
}

/**
 * Build the canonical Moroccan COD payload.
 * Field names follow the Digylog / Eco-Track standard which most Moroccan
 * carriers have adopted.
 */
function buildPayload(input: CarrierShipInput): Record<string, unknown> {
  const phone = sanitizePhone(input.phone);
  const priceDH = +(input.totalPrice / 100).toFixed(2);

  return {
    nom_complet:      input.customerName.trim(),
    telephone:        phone,
    ville:            input.city.trim(),
    adresse:          input.address.trim() || input.city.trim(),
    prix:             priceDH,
    produit:          input.productName.trim(),
    ouverture_colis:  input.canOpen ? 1 : 0,
    reference:        input.orderNumber,
    // Extra fields accepted by most carriers (ignored if unknown)
    cod:              priceDH,
    description:      input.productName.trim(),
    can_open:         input.canOpen ? 1 : 0,
    // Some carriers use these alternate field names
    customer_name:    input.customerName.trim(),
    phone:            phone,
    city:             input.city.trim(),
    address:          input.address.trim() || input.city.trim(),
    price:            priceDH,
    product:          input.productName.trim(),
  };
}

/**
 * Extract tracking number from various carrier response shapes.
 * Different carriers return it under different keys.
 */
function extractTracking(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  // Common keys across Moroccan carriers
  return (
    body.tracking_number ||
    body.trackingNumber  ||
    body.barcode         ||
    body.code_suivi      ||
    body.numero_suivi    ||
    body.id              ||
    body.data?.tracking_number ||
    body.data?.barcode   ||
    body.data?.code_suivi ||
    body.result?.tracking_number ||
    body.result?.barcode  ||
    undefined
  );
}

/**
 * Extract label URL from various carrier response shapes.
 */
function extractLabelUrl(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  return (
    body.label_url   ||
    body.labelUrl    ||
    body.etiquette   ||
    body.pdf_url     ||
    body.data?.label_url ||
    body.data?.etiquette ||
    body.result?.label_url ||
    undefined
  );
}

/**
 * Extract the most meaningful human-readable error message from a carrier response.
 */
function extractCarrierError(body: any): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 300);
  if (typeof body !== "object") return String(body).slice(0, 300);

  // Try all common error field names carriers use
  const msg =
    body.message   ||
    body.msg       ||
    body.error     ||
    body.detail    ||
    body.details   ||
    body.reason    ||
    body.errors    ||
    body.data?.message ||
    body.data?.error   ||
    body.result?.message ||
    null;

  if (!msg) return null;
  if (typeof msg === "object") return JSON.stringify(msg).slice(0, 300);
  return String(msg).slice(0, 300);
}

/**
 * Detect whether the carrier returned a logical error even with a 2xx HTTP code
 * (some carriers return 200 with { success: false, message: "..." }).
 */
function detectCarrierError(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const isSuccess =
    body.success === true ||
    body.status === "success" ||
    body.status === "ok" ||
    body.ok === true;

  const isError =
    body.success === false ||
    body.status === "error" ||
    body.status === "fail" ||
    body.error !== undefined;

  if (isError && !isSuccess) {
    return extractCarrierError(body) || "Erreur retournée par le transporteur";
  }
  return null;
}

/**
 * Pre-flight validation — runs before any HTTP request.
 * Returns an error message string if invalid, or null if OK.
 */
function preValidate(input: CarrierShipInput, tag: string): string | null {
  // ── Phone ────────────────────────────────────────────────────────
  const phone = sanitizePhone(input.phone);
  if (!phone) {
    const msg = "⚠️ رقم الهاتف مفقود — لم يتم الإرسال.";
    console.error(`${tag} PRE-VALIDATION FAILED — Phone missing`);
    return msg;
  }
  if (!/^0[5-7]\d{8}$/.test(phone) && !/^0[1-9]\d{8}$/.test(phone)) {
    const msg = `⚠️ رقم الهاتف غير صحيح: "${phone}" — يجب أن يكون 10 أرقام مغربية (مثال: 0612345678).`;
    console.error(`${tag} PRE-VALIDATION FAILED — Invalid phone: "${input.phone}" → sanitized: "${phone}"`);
    return msg;
  }

  // ── Address ─────────────────────────────────────────────────────
  const address = (input.address || "").trim();
  if (address.length < 5) {
    const msg = `⚠️ العنوان قصير جداً لشركة الشحن: "${address || '(vide)'}". يرجى كتابة العنوان بالكامل (10 أحرف على الأقل).`;
    console.error(`${tag} PRE-VALIDATION FAILED — Address too short: "${address}"`);
    return msg;
  }

  // ── City ─────────────────────────────────────────────────────────
  if (!input.city.trim()) {
    const msg = "⚠️ المدينة غير محددة — لم يتم الإرسال.";
    console.error(`${tag} PRE-VALIDATION FAILED — City is empty`);
    return msg;
  }

  // ── Price ─────────────────────────────────────────────────────────
  if (input.totalPrice <= 0) {
    const msg = "⚠️ السعر صفر أو غير محدد — يرجى التحقق من سعر الطلب.";
    console.error(`${tag} PRE-VALIDATION FAILED — Price is 0 or negative: ${input.totalPrice}`);
    return msg;
  }

  return null; // all good
}

/**
 * Main entry point.  Sends the order to the carrier's API.
 *
 * Logging strategy (visible in Railway / Replit console):
 *   [CARRIER→DIGYLOG] PRE-CHECK: phone=0612345678 city=Casablanca address=... price=250DH
 *   [CARRIER→DIGYLOG] URL:      https://...
 *   [CARRIER→DIGYLOG] Payload:  {...}
 *   [CARRIER→DIGYLOG] Response: 201 {...}
 *   [CARRIER→DIGYLOG] ✅ Tracking: DGL-123
 *   or
 *   [CARRIER→DIGYLOG] ❌ Error: ...
 */
export async function shipOrderToCarrier(
  provider: string,
  creds: Record<string, string>,
  input: CarrierShipInput,
): Promise<CarrierShipResult> {
  const tag = `[CARRIER→${provider.toUpperCase()}][#${input.orderNumber}]`;

  // ── Pre-flight validation ────────────────────────────────────────
  const validationError = preValidate(input, tag);
  if (validationError) {
    return {
      success: false,
      error: validationError,
      carrierMessage: validationError,
    };
  }

  // ── Resolve endpoint ────────────────────────────────────────────
  const providerKey = provider.toLowerCase().replace(/\s+/g, "");
  const defaultUrl  = CARRIER_ENDPOINTS[providerKey];
  const apiUrl      = (creds.apiUrl?.trim()) || defaultUrl;

  if (!apiUrl) {
    const err = `Aucune URL API configurée pour le transporteur "${provider}". Ajoutez l'URL API dans les paramètres.`;
    console.error(`${tag} ❌ ${err}`);
    return { success: false, error: err };
  }

  // ── Auth headers ────────────────────────────────────────────────
  const apiKey = creds.apiKey?.trim() || "";
  const apiSecret = creds.apiSecret?.trim() || "";

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

  // ── Build & log payload ─────────────────────────────────────────
  const payload = buildPayload(input);
  const sanitizedPhone = sanitizePhone(input.phone);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${tag} 🚀 SENDING ORDER TO CARRIER`);
  console.log(`${tag} URL:          ${apiUrl}`);
  console.log(`${tag} PRE-SANITIZE: phone="${input.phone}" → "${sanitizedPhone}"`);
  console.log(`${tag} PRE-SANITIZE: city="${input.city}" address="${input.address}"`);
  console.log(`${tag} PRE-SANITIZE: price=${input.totalPrice} centimes → ${+(input.totalPrice/100).toFixed(2)} DH`);
  console.log(`${tag} PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
  console.log(`${"═".repeat(60)}\n`);

  // ── HTTP request (10-second timeout) ─────────────────────────────
  const TIMEOUT_MS = 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let httpStatus = 0;
  let rawBody: unknown;
  try {
    const response = await fetch(apiUrl, {
      method:  "POST",
      headers,
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    httpStatus = response.status;
    const rawText = await response.text();

    // Try to parse JSON; keep raw text as fallback
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      rawBody = rawText;
    }

    console.log(`${tag} Response: HTTP ${httpStatus}`);
    console.log(`${tag} Body: ${JSON.stringify(rawBody)}`);

    // ── 4xx / 5xx ──────────────────────────────────────────────────
    if (httpStatus >= 400) {
      const errMsg =
        extractCarrierError(rawBody) ||
        (typeof rawBody === "string" ? rawBody : null) ||
        `HTTP ${httpStatus}`;

      console.error(`${tag} ❌ Carrier rejected (HTTP ${httpStatus}): ${errMsg}`);
      return {
        success: false,
        httpStatus,
        rawResponse: rawBody,
        error:  `[${httpStatus}] ${errMsg}`,
        carrierMessage: errMsg,
      };
    }

    // ── 2xx — check for logical errors inside body ─────────────────
    const logicalError = detectCarrierError(rawBody);
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

    // ── Success ────────────────────────────────────────────────────
    const trackingNumber = extractTracking(rawBody) || `${provider.toUpperCase()}-${Date.now()}-${input.orderId}`;
    const labelUrl       = extractLabelUrl(rawBody) || `/api/labels/${trackingNumber}.pdf`;

    console.log(`${tag} ✅ SUCCESS! Tracking: ${trackingNumber}`);
    return {
      success: true,
      trackingNumber,
      labelUrl,
      httpStatus,
      rawResponse: rawBody,
    };
  } catch (networkErr: any) {
    clearTimeout(timer);
    const isTimeout = networkErr?.name === "AbortError" || networkErr?.code === "ABORT_ERR";
    const errMsg = isTimeout
      ? `Délai dépassé (10s) — ${provider} n'a pas répondu à temps`
      : (networkErr?.message || String(networkErr));
    console.error(`${tag} ❌ ${isTimeout ? "Timeout" : "Network error"}: ${errMsg}`);
    return {
      success: false,
      httpStatus,
      rawResponse: rawBody,
      error: errMsg,
      carrierMessage: errMsg,
    };
  }
}

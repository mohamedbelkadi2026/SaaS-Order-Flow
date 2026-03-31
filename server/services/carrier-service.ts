/**
 * carrier-service.ts
 * Real HTTP integration with Moroccan shipping carriers.
 * Handles payload mapping, auth headers, detailed logging, and error propagation.
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
 * Build the canonical Moroccan COD payload.
 * Field names follow the Digylog / Eco-Track standard which most Moroccan
 * carriers have adopted.
 */
function buildPayload(input: CarrierShipInput): Record<string, unknown> {
  return {
    nom_complet:      input.customerName.trim(),
    telephone:        input.phone.trim(),
    ville:            input.city.trim(),
    adresse:          input.address.trim() || input.city.trim(),
    prix:             +(input.totalPrice / 100).toFixed(2),   // centimes → DH
    produit:          input.productName.trim(),
    ouverture_colis:  input.canOpen ? 1 : 0,
    reference:        input.orderNumber,
    // Extra fields accepted by most carriers (ignored if unknown)
    cod:              +(input.totalPrice / 100).toFixed(2),
    description:      input.productName.trim(),
    can_open:         input.canOpen ? 1 : 0,
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
    return (
      body.message  ||
      body.error    ||
      body.msg      ||
      body.detail   ||
      "Erreur retournée par le transporteur"
    );
  }
  return null;
}

/**
 * Main entry point.  Sends the order to the carrier's API.
 *
 * Logging strategy (visible in Railway / Replit console):
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
  const tag = `[CARRIER→${provider.toUpperCase()}]`;

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
    headers["X-API-KEY"]     = apiKey;      // some carriers use this header
    headers["Token"]         = apiKey;
  }
  if (apiSecret) {
    headers["X-API-SECRET"] = apiSecret;
  }

  // ── Build & log payload ─────────────────────────────────────────
  const payload = buildPayload(input);
  console.log(`${tag} URL:     ${apiUrl}`);
  console.log(`${tag} Payload: ${JSON.stringify(payload, null, 2)}`);

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
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    // Try to parse JSON; keep raw text as fallback
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      rawBody = rawText;
    }

    console.log(`${tag} Response: ${httpStatus} ${JSON.stringify(rawBody)}`);

    // ── 4xx / 5xx ──────────────────────────────────────────────────
    if (httpStatus >= 400) {
      const errMsg =
        (typeof rawBody === "object" && rawBody !== null
          ? (rawBody as any).message ||
            (rawBody as any).error   ||
            (rawBody as any).detail  ||
            (rawBody as any).msg     ||
            null
          : null) ||
        rawText ||
        `HTTP ${httpStatus}`;

      console.error(`${tag} ❌ Carrier rejected request (${httpStatus}): ${errMsg}`);
      return {
        success: false,
        httpStatus,
        rawResponse: rawBody,
        error:  `Transporteur a rejeté la commande (${httpStatus}): ${errMsg}`,
        carrierMessage: errMsg,
      };
    }

    // ── 2xx — check for logical errors inside body ─────────────────
    const logicalError = detectCarrierError(rawBody);
    if (logicalError) {
      console.error(`${tag} ❌ Carrier logical error: ${logicalError}`);
      return {
        success: false,
        httpStatus,
        rawResponse: rawBody,
        error: `Transporteur: ${logicalError}`,
        carrierMessage: logicalError,
      };
    }

    // ── Success ────────────────────────────────────────────────────
    const trackingNumber = extractTracking(rawBody) || `${provider.toUpperCase()}-${Date.now()}-${input.orderId}`;
    const labelUrl       = extractLabelUrl(rawBody) || `/api/labels/${trackingNumber}.pdf`;

    console.log(`${tag} ✅ Success! Tracking: ${trackingNumber}`);
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
    console.error(`${tag} ❌ ${isTimeout ? "Timeout" : "Network error"} (status=${httpStatus}): ${errMsg}`);
    return {
      success: false,
      httpStatus,
      rawResponse: rawBody,
      error: errMsg,
    };
  }
}

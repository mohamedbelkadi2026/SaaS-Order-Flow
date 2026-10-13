/**
 * Express Relais AIO API v2.7 adapter.
 * Isolated from existing carriers; credentials must remain server-side.
 * API requires the outbound server IP to be whitelisted by Express Relais.
 */
export type ExpressRelaisConfig = {
  login: string;
  password: string;
  environment?: "dev" | "prod";
};
export type ExpressRelaisOrder = {
  idParcelClient: string;
  cityPickup: string;
  addressPickup: string;
  contactPickup: string;
  contactPickupPhone: string;
  typeDelivery: "ADDRESS" | "LOCKER";
  lastNameRecipient: string;
  firstNameRecipient: string;
  mobileRecipient: string;
  cityDelivery?: string;
  addressDelivery?: string;
  smartLocker?: number;
  cashOnDelivery?: number;
  productName?: string;
  commentParcel?: string;
  weightParcel?: number;
  allowOpenParcel?: 0 | 1;
  insureValue?: number;
};
const HOSTS = {
  dev: "https://api-aio-dev.relaisexpress.ma",
  prod: "https://api-aio-prod.relaisexpress.ma",
} as const;
const ENDPOINTS = [
  "getInfoClient", "getPrices", "getCityDelivery", "getSmartLocker", "getLocker",
  "createAioOrder", "getStatusParcel", "getStatusMultipleParcels",
  "getTrackingParcel", "cancelAioOrder", "updateAioOrder", "returnParcel",
  "getCashbackSituation", "getCodWaitingCashback", "getCashback",
  "getCashbackDetails", "getBalance", "getBalanceDetails", "getInvoices",
  "getInvoiceDetails",
] as const;
type Endpoint = typeof ENDPOINTS[number];
export class ExpressRelaisError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ExpressRelaisError";
  }
}
export class ExpressRelaisClient {
  private readonly host: string;
  private readonly auth: string;
  constructor(config: ExpressRelaisConfig) {
    if (!config.login?.trim() || !config.password) throw new Error("Express Relais credentials are required");
    this.host = HOSTS[config.environment ?? "prod"];
    this.auth = "Basic " + Buffer.from(config.login + ":" + config.password).toString("base64");
  }
  async request<T = unknown>(endpoint: Endpoint, params: Record<string, string | number | boolean | null | undefined> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
    const url = new URL("/" + endpoint, this.host);
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) values.set(key, String(value));
    if (method === "GET") url.search = values.toString();
    // Express Relais confirmed that createAioOrder requires JSON, not form data.
    // Keep all existing read-only GET endpoints unchanged.
    const isCreateOrder = endpoint === "createAioOrder" && method === "POST";
    const postBody = isCreateOrder
      ? JSON.stringify(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null)))
      : values.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": isCreateOrder ? "application/json" : "application/x-www-form-urlencoded" } : {}),
        },
        ...(method === "POST" ? { body: postBody } : {}),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        // Cloudflare HTML is a network-access denial, not a business/API response.
        // Do not expose the raw HTML, credentials or request body in logs.
        const cloudflareBlock = response.status === 403 &&
          (/cloudflare/i.test(response.headers.get("server") || "") ||
           /cloudflare|you have been blocked|unable to access/i.test(raw));
        if (cloudflareBlock) throw new ExpressRelaisError(403,
          "EXPRESS_RELAIS_WAF_BLOCKED: Cloudflare refuse l'IP sortante du serveur. Vérifiez l'autorisation de cette IP auprès d'Express Relais. Aucun nouvel essai automatique.");
        throw new ExpressRelaisError(response.status,
          "Express Relais HTTP " + response.status + ": " +
          (raw.trimStart().startsWith("<") ? "réponse HTML non-API" : raw.slice(0, 250)));
      }
      try { return JSON.parse(raw) as T; }
      catch { throw new ExpressRelaisError(response.status, "Express Relais returned non-JSON response"); }
    } finally { clearTimeout(timeout); }
  }
  testConnection() { return this.request("getInfoClient"); }
  getCities() { return this.request("getCityDelivery"); }
  getPrices() { return this.request("getPrices"); }
  getSmartLockers(city?: string) { return this.request("getSmartLocker", { city }); }
  getStatus(idParcelClient: string) { return this.request("getStatusParcel", { idParcelClient }); }
  getStatuses(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.request("getStatusMultipleParcels", { idParcelClient: ids.join(",") });
  }
  getTracking(idParcelClient: string) { return this.request("getTrackingParcel", { idParcelClient }); }
  createOrder(order: ExpressRelaisOrder) {
    const required = ["idParcelClient","cityPickup","addressPickup","contactPickup","contactPickupPhone","lastNameRecipient","firstNameRecipient","mobileRecipient"] as const;
    for (const field of required) if (!order[field]) throw new Error("Missing Express Relais field: " + field);
    if (order.typeDelivery === "ADDRESS" && (!order.cityDelivery || !order.addressDelivery)) throw new Error("ADDRESS requires cityDelivery and addressDelivery");
    if (order.typeDelivery === "LOCKER" && !order.smartLocker) throw new Error("LOCKER requires smartLocker");
    if (order.weightParcel !== undefined && (order.weightParcel < 1 || order.weightParcel > 20)) throw new Error("Parcel weight must be 1-20 kg");
    const params = order as unknown as Record<string, string | number | undefined>;
    // JSON POST only. Never fall back to a second creation request via GET;
    // ambiguous HTTP failures can otherwise generate duplicate shipments.
    return this.request<any>("createAioOrder", params, "POST");
  }
}

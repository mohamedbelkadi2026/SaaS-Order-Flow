/**
 * WhatsApp service via Green API (https://green-api.com)
 * REST-based — no Chromium / puppeteer required.
 *
 * Required secrets:
 *   GREENAPI_INSTANCE_ID  — e.g. "7103123456"
 *   GREENAPI_API_TOKEN    — from green-api.com dashboard
 *
 * Webhook URL (set in Green-API dashboard):
 *   https://<your-replit-domain>/api/webhooks/whatsapp-incoming
 */

const BASE = "https://api.green-api.com";

function instanceId() { return process.env.GREENAPI_INSTANCE_ID ?? ""; }
function apiToken()  { return process.env.GREENAPI_API_TOKEN ?? ""; }

export function isConfigured() {
  return !!(instanceId() && apiToken());
}

/** Format a phone number for Green API: remove + and add country code */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Moroccan numbers: if starts with 0, replace with 212
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}@c.us`;
  if (!digits.includes("@")) return `${digits}@c.us`;
  return digits;
}

/** Send a WhatsApp text message */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn("[WA] Green API not configured — message not sent to", phone);
    return false;
  }
  try {
    const chatId = formatPhone(phone);
    const url = `${BASE}/waInstance${instanceId()}/sendMessage/${apiToken()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[WA] Send error:", res.status, body);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA] Network error:", err.message);
    return false;
  }
}

/** Get the QR code from Green API (returns base64 image or null) */
export async function getGreenApiQR(): Promise<string | null> {
  if (!isConfigured()) return null;
  try {
    const url = `${BASE}/waInstance${instanceId()}/qr/${apiToken()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json.message ?? null; // base64 PNG
  } catch {
    return null;
  }
}

/** Get Green API account state */
export async function getGreenApiState(): Promise<"authorized" | "notAuthorized" | "unknown"> {
  if (!isConfigured()) return "unknown";
  try {
    const url = `${BASE}/waInstance${instanceId()}/getStateInstance/${apiToken()}`;
    const res = await fetch(url);
    if (!res.ok) return "unknown";
    const json = await res.json() as any;
    return json.stateInstance === "authorized" ? "authorized" : "notAuthorized";
  } catch {
    return "unknown";
  }
}

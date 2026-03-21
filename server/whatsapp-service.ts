/**
 * TajerGrow WhatsApp transport layer.
 * Priority: Baileys (direct) → Green API (cloud fallback).
 */

/* ── Baileys direct send (primary) ──────────────────────────── */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const { baileysService } = await import("./baileys-service");
    if (baileysService.isConnected()) {
      return await baileysService.sendMessage(phone, message);
    }
  } catch { /* fall through */ }

  /* ── Green API fallback ─────────────────────────────────────── */
  const instanceId = process.env.GREENAPI_INSTANCE_ID ?? "";
  const apiToken   = process.env.GREENAPI_API_TOKEN ?? "";
  if (!instanceId || !apiToken) {
    console.warn("[WA] No transport available (Baileys not connected, Green API not configured)");
    return false;
  }

  try {
    const digits = phone.replace(/\D/g, "");
    const chatId = digits.startsWith("0") && digits.length === 10
      ? `212${digits.slice(1)}@c.us`
      : `${digits}@c.us`;
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    return res.ok;
  } catch (err: any) {
    console.error("[WA] Green API send error:", err.message);
    return false;
  }
}

/* ── Green API helpers (kept for optional fallback status check) */
export function isGreenApiConfigured(): boolean {
  return !!(process.env.GREENAPI_INSTANCE_ID && process.env.GREENAPI_API_TOKEN);
}

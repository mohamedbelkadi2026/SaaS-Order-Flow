/**
 * TajerGrow WhatsApp transport layer.
 * Priority: Baileys (direct) → Green API (cloud fallback).
 */

/* ── Phone number normalisation ─────────────────────────────── */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Already in international format (212XXXXXXXXX)
  if (digits.startsWith("212") && digits.length === 12) return digits;
  // Moroccan local format 06/07 XXXXXXXX
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  // Has country code without +
  if (digits.length >= 11) return digits;
  return digits;
}

/* ── Baileys direct send (primary) ──────────────────────────── */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  console.log(`[WA Transport] Sending to ${phone} → normalised: ${formatted}@s.whatsapp.net`);

  try {
    const { baileysService } = await import("./baileys-service");
    const status = baileysService.getStatus();
    console.log(`[WA Transport] Baileys state: ${status.state} | Connected phone: ${status.phone || "none"}`);

    if (status.state === "connected" && baileysService.isConnected()) {
      const ok = await baileysService.sendMessage(phone, message);
      if (ok) {
        console.log(`[WA Transport] ✅ Sent via Baileys to ${formatted}`);
        return true;
      }
      console.warn(`[WA Transport] ⚠️ Baileys send returned false — trying fallback`);
    } else {
      console.warn(`[WA Transport] ⚠️ Baileys not connected (state=${status.state}) — trying auto-reconnect`);
      // Attempt reconnect if not already connecting
      if (status.state === "idle" || status.state === "qr") {
        console.log(`[WA Transport] Skipping reconnect (state=${status.state} — user action required for QR scan)`);
      } else {
        // disconnected state — trigger reconnect
        baileysService.start().catch(() => {});
        console.log(`[WA Transport] Reconnect triggered — message will need to be retried`);
      }
      // Fall through to Green API fallback
    }
  } catch (err: any) {
    console.error(`[WA Transport] Baileys error: ${err.message}`);
  }

  /* ── Green API fallback ─────────────────────────────────────── */
  const instanceId = process.env.GREENAPI_INSTANCE_ID ?? "";
  const apiToken   = process.env.GREENAPI_API_TOKEN ?? "";
  if (!instanceId || !apiToken) {
    console.error(`[WA Transport] ❌ NO TRANSPORT AVAILABLE — Baileys not connected AND Green API not configured!`);
    console.error(`[WA Transport] ❌ Message to ${formatted} was NOT sent. Connect WhatsApp in Automation → WhatsApp tab.`);
    return false;
  }

  try {
    const chatId = `${formatted}@c.us`;
    console.log(`[WA Transport] Trying Green API fallback → chatId: ${chatId}`);
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (res.ok) {
      console.log(`[WA Transport] ✅ Sent via Green API to ${chatId}`);
      return true;
    }
    console.error(`[WA Transport] ❌ Green API error: ${res.status} ${await res.text()}`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport] ❌ Green API exception: ${err.message}`);
    return false;
  }
}

/* ── Green API helpers (kept for optional fallback status check) */
export function isGreenApiConfigured(): boolean {
  return !!(process.env.GREENAPI_INSTANCE_ID && process.env.GREENAPI_API_TOKEN);
}

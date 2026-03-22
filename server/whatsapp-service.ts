/**
 * TajerGrow WhatsApp transport layer.
 * Priority: Baileys (direct) → Green API (cloud fallback).
 * 
 * Includes a persistent retry queue: messages that fail (WA not connected) 
 * are stored and retried every 60s up to 3 times.
 * Queue is also flushed immediately when Baileys connects.
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

/* ── Retry queue ────────────────────────────────────────────── */
interface PendingMessage {
  phone: string;
  message: string;
  retries: number;
  nextRetry: number;  // epoch ms
}

const pendingRetryQueue: PendingMessage[] = [];

export function flushPendingQueue(): void {
  if (pendingRetryQueue.length === 0) return;
  console.log(`[WA Transport] 🔄 Flushing ${pendingRetryQueue.length} queued message(s) now that WA is connected`);
  const toFlush = pendingRetryQueue.splice(0, pendingRetryQueue.length);
  for (const item of toFlush) {
    sendWhatsAppMessage(item.phone, item.message).catch(console.error);
  }
}

// Background retry interval — every 60 seconds
setInterval(async () => {
  const now = Date.now();
  const due = pendingRetryQueue.filter(m => m.nextRetry <= now);
  if (due.length === 0) return;

  console.log(`[WA Transport] ⏱ Retry interval: ${due.length} message(s) due`);
  for (const item of due) {
    pendingRetryQueue.splice(pendingRetryQueue.indexOf(item), 1);
    const ok = await sendWhatsAppMessage(item.phone, item.message);
    if (!ok && item.retries < 3) {
      console.warn(`[WA Transport] 🔁 Retry ${item.retries + 1}/3 failed — will retry again in 60s`);
      pendingRetryQueue.push({
        phone: item.phone,
        message: item.message,
        retries: item.retries + 1,
        nextRetry: Date.now() + 60_000,
      });
    } else if (!ok) {
      console.error(`[WA Transport] ❌ Max retries (3) exceeded for ${item.phone} — message dropped`);
    }
  }
}, 60_000);

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
        console.log(`[SUCCESS]: Message sent to customer via Baileys → ${formatted}`);
        return true;
      }
      console.warn(`[WA Transport] ⚠️ Baileys send returned false — trying fallback`);
    } else {
      console.warn(`[WA Transport] ⚠️ Baileys not connected (state=${status.state})`);
      if (status.state === "idle" || status.state === "qr") {
        console.warn(`[WA Transport] User action required (QR scan). Message queued for retry.`);
      } else {
        baileysService.start().catch(() => {});
        console.log(`[WA Transport] Reconnect triggered — message queued for retry`);
      }
      // Queue for retry
      pendingRetryQueue.push({ phone, message, retries: 0, nextRetry: Date.now() + 60_000 });
      console.log(`[WA Transport] 📋 Message added to retry queue (${pendingRetryQueue.length} total). Will retry in 60s.`);
      return false;
    }
  } catch (err: any) {
    console.error(`[WA Transport] Baileys error: ${err.message}`);
  }

  /* ── Green API fallback ─────────────────────────────────────── */
  const instanceId = process.env.GREENAPI_INSTANCE_ID ?? "";
  const apiToken   = process.env.GREENAPI_API_TOKEN ?? "";
  if (!instanceId || !apiToken) {
    console.error(`[ERROR]: Store has no active WhatsApp session. Message to ${formatted} NOT sent.`);
    console.error(`[WA Transport] Connect WhatsApp in Automation → WhatsApp tab. Message queued for retry.`);
    if (!pendingRetryQueue.some(m => m.phone === phone && m.message === message)) {
      pendingRetryQueue.push({ phone, message, retries: 0, nextRetry: Date.now() + 60_000 });
    }
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
      console.log(`[SUCCESS]: Message sent to customer via Green API → ${chatId}`);
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

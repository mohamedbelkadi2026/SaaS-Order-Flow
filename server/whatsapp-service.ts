/**
 * TajerGrow WhatsApp transport layer — Multi-Tenant Edition.
 * Each store uses its own Baileys session via getBaileysInstance(storeId).
 *
 * Retry queue is per-store so Store A's failed messages never block Store B.
 */

/* ── Phone number normalisation ─────────────────────────────── */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  if (digits.length >= 11) return digits;
  return digits;
}

/* ── Per-store retry queue ───────────────────────────────────── */
interface PendingMessage {
  phone: string;
  message: string;
  storeId: number;
  retries: number;
  nextRetry: number;
}

const pendingRetryQueues = new Map<number, PendingMessage[]>();

function getQueue(storeId: number): PendingMessage[] {
  if (!pendingRetryQueues.has(storeId)) pendingRetryQueues.set(storeId, []);
  return pendingRetryQueues.get(storeId)!;
}

/** Called by Baileys on connect — flush queued messages for this store */
export function flushPendingQueue(storeId: number): void {
  const queue = getQueue(storeId);
  if (queue.length === 0) return;
  console.log(`[WA Transport:${storeId}] 🔄 Flushing ${queue.length} queued message(s)`);
  const toFlush = queue.splice(0, queue.length);
  for (const item of toFlush) {
    sendWhatsAppMessage(item.phone, item.message, item.storeId).catch(console.error);
  }
}

// Background retry — every 60 seconds across all stores
setInterval(async () => {
  const now = Date.now();
  for (const [storeId, queue] of pendingRetryQueues) {
    const due = queue.filter(m => m.nextRetry <= now);
    if (due.length === 0) continue;
    console.log(`[WA Transport:${storeId}] ⏱ Retry: ${due.length} message(s) due`);
    for (const item of due) {
      queue.splice(queue.indexOf(item), 1);
      const ok = await sendWhatsAppMessage(item.phone, item.message, storeId);
      if (!ok && item.retries < 3) {
        queue.push({ ...item, retries: item.retries + 1, nextRetry: Date.now() + 60_000 });
      } else if (!ok) {
        console.error(`[WA Transport:${storeId}] ❌ Max retries (3) exceeded for ${item.phone} — dropped`);
      }
    }
  }
}, 60_000);

/* ── Primary send via per-store Baileys instance ─────────────── */
export async function sendWhatsAppMessage(phone: string, message: string, storeId = 1): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  console.log(`[WA Transport:${storeId}] Sending to ${phone} → ${formatted}@s.whatsapp.net`);

  try {
    const { getBaileysInstance } = await import("./baileys-service");
    const instance = getBaileysInstance(storeId);
    const status = instance.getStatus();
    console.log(`[WA Transport:${storeId}] Baileys state: ${status.state} | phone: ${status.phone || "none"}`);

    if (status.state === "connected" && instance.isConnected()) {
      const ok = await instance.sendMessage(phone, message);
      if (ok) {
        console.log(`[WA Transport:${storeId}] ✅ Message sent via Baileys → ${formatted}`);
        return true;
      }
      console.warn(`[WA Transport:${storeId}] ⚠️ Baileys send returned false`);
    } else {
      console.warn(`[WA Transport:${storeId}] ⚠️ Baileys not connected (state=${status.state})`);
      if (status.state !== "idle" && status.state !== "qr") {
        instance.start().catch(() => {});
        console.log(`[WA Transport:${storeId}] Reconnect triggered`);
      }
      const queue = getQueue(storeId);
      queue.push({ phone, message, storeId, retries: 0, nextRetry: Date.now() + 60_000 });
      console.log(`[WA Transport:${storeId}] 📋 Queued message (${queue.length} total)`);
      return false;
    }
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] Baileys error: ${err.message}`);
  }

  /* ── Green API fallback (store-independent) ─────────────────── */
  const instanceId = process.env.GREENAPI_INSTANCE_ID ?? "";
  const apiToken   = process.env.GREENAPI_API_TOKEN ?? "";
  if (!instanceId || !apiToken) {
    console.error(`[WA Transport:${storeId}] No active WA session. Message to ${formatted} NOT sent.`);
    const queue = getQueue(storeId);
    if (!queue.some(m => m.phone === phone && m.message === message)) {
      queue.push({ phone, message, storeId, retries: 0, nextRetry: Date.now() + 60_000 });
    }
    return false;
  }

  try {
    const chatId = `${formatted}@c.us`;
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (res.ok) {
      console.log(`[WA Transport:${storeId}] ✅ Message sent via Green API → ${chatId}`);
      return true;
    }
    console.error(`[WA Transport:${storeId}] ❌ Green API error: ${res.status}`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] ❌ Green API exception: ${err.message}`);
    return false;
  }
}

/* ── Image send via per-store Baileys instance ───────────────── */
export async function sendWhatsAppImage(phone: string, imageUrl: string, caption: string, storeId = 1): Promise<boolean> {
  try {
    const { getBaileysInstance } = await import("./baileys-service");
    const instance = getBaileysInstance(storeId);
    if (instance.isConnected()) {
      const ok = await instance.sendImage(phone, imageUrl, caption);
      if (ok) {
        console.log(`[WA Transport:${storeId}] ✅ Image sent via Baileys → ${phone}`);
        return true;
      }
    }
    console.warn(`[WA Transport:${storeId}] ⚠️ Cannot send image — not connected`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] ❌ Image send exception: ${err.message}`);
    return false;
  }
}

/* ── Green API config check ─────────────────────────────────── */
export function isGreenApiConfigured(): boolean {
  return !!(process.env.GREENAPI_INSTANCE_ID && process.env.GREENAPI_API_TOKEN);
}

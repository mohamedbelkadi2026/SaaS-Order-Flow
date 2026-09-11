/**
 * TajerGrow WhatsApp transport layer — Multi-Tenant Edition.
 * Each store uses its own Baileys session via getBaileysInstance(storeId).
 * Green API credentials are ALSO per-store (ai_settings.greenApiInstanceId/
 * greenApiApiToken) — each merchant connects their own WhatsApp number, so
 * Store A's messages never go out through Store B's number. Falls back to
 * the global GREENAPI_INSTANCE_ID/GREENAPI_API_TOKEN env vars only if a
 * store hasn't configured its own (useful as a shared default/dev fallback).
 *
 * Retry queue is per-store so Store A's failed messages never block Store B.
 */

import { storage } from "./storage";

/** Per-store Green API credentials, with the global env vars as fallback. */
async function getGreenApiCredentials(storeId: number): Promise<{ instanceId: string; apiToken: string } | null> {
  try {
    const settings = await storage.getAiSettings(storeId);
    const instanceId = (settings as any)?.greenApiInstanceId?.trim() || process.env.GREENAPI_INSTANCE_ID?.trim() || "";
    const apiToken   = (settings as any)?.greenApiApiToken?.trim()   || process.env.GREENAPI_API_TOKEN?.trim()   || "";
    if (!instanceId || !apiToken) return null;
    return { instanceId, apiToken };
  } catch {
    const instanceId = process.env.GREENAPI_INSTANCE_ID?.trim() || "";
    const apiToken   = process.env.GREENAPI_API_TOKEN?.trim()   || "";
    return (instanceId && apiToken) ? { instanceId, apiToken } : null;
  }
}

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

// ── Queue safety cap — clear any per-store queue that grows beyond 10 ─────────
setInterval(() => {
  for (const [storeId, queue] of pendingRetryQueues) {
    if (queue.length > 10) {
      queue.length = 0;
      console.warn(`[WA] Queue for store ${storeId} cleared — was too large (>10)`);
    }
  }
}, 30_000); // every 30 seconds

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
        if (queue.length >= 5) {
          queue.length = 0;
          console.warn(`[WA] Queue limit reached — cleared`);
          return;
        }
        queue.push({ ...item, retries: item.retries + 1, nextRetry: Date.now() + 60_000 });
      } else if (!ok) {
        console.error(`[WA Transport:${storeId}] ❌ Max retries (3) exceeded for ${item.phone} — dropped`);
      }
    }
  }
}, 60_000);

/** Clear all pending queues — called externally by memory guard */
export function clearQueue(): void {
  for (const [storeId, queue] of pendingRetryQueues) {
    if (queue.length > 0) {
      queue.length = 0;
      console.log(`[WA] Queue for store ${storeId} cleared externally`);
    }
  }
}

/* ── Primary send via per-store Baileys instance ─────────────── */
export async function sendWhatsAppMessage(phone: string, message: string, storeId = 1): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  console.log(`[WA Transport:${storeId}] Sending to ${phone} → ${formatted}@s.whatsapp.net`);

  // ── Try Baileys first, but NEVER exit early on "not connected" — that used
  // to `return false` immediately, skipping the Green API fallback below
  // entirely (only an exception fell through; the stub never throws, it just
  // returns {state:'idle'} gracefully, so Green API was never reached at all
  // while Baileys stays a stub). Any non-success here now falls through.
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
      console.warn(`[WA Transport:${storeId}] ⚠️ Baileys not connected (state=${status.state}) — trying Green API`);
      if (status.state !== "idle" && status.state !== "qr") {
        instance.start().catch(() => {});
        console.log(`[WA Transport:${storeId}] Reconnect triggered`);
      }
    }
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] Baileys error: ${err.message}`);
  }

  /* ── Green API fallback — PER-STORE credentials (falls back to global env vars) ── */
  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No active WA session and no Green API config for this store — message DROPPED (no queue)`);
    return false;
  }
  const { instanceId, apiToken } = creds;

  try {
    const chatId = `${formatted}@c.us`;
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal: AbortSignal.timeout(15000),
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

/* ── Image send via per-store Baileys instance, Green API fallback ──── */
export async function sendWhatsAppImage(phone: string, imageUrl: string, caption: string, storeId = 1): Promise<boolean> {
  return sendWhatsAppFile(phone, imageUrl, "produit.jpg", caption, storeId);
}

/* ── Generic file send (audio/video/image) via Baileys, Green API fallback ── */
export async function sendWhatsAppFile(phone: string, fileUrl: string, fileName: string, caption: string, storeId = 1): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);

  try {
    const { getBaileysInstance } = await import("./baileys-service");
    const instance = getBaileysInstance(storeId);
    if (instance.isConnected() && typeof (instance as any).sendImage === "function" && fileName.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      const ok = await (instance as any).sendImage(phone, fileUrl, caption);
      if (ok) {
        console.log(`[WA Transport:${storeId}] ✅ File sent via Baileys → ${phone}`);
        return true;
      }
    } else {
      console.warn(`[WA Transport:${storeId}] ⚠️ Baileys not connected/unsupported — trying Green API for file`);
    }
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] Baileys file exception: ${err.message}`);
  }

  /* ── Green API fallback — PER-STORE credentials ──────────────── */
  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No active WA session and no Green API config for this store — file DROPPED`);
    return false;
  }
  const { instanceId, apiToken } = creds;

  try {
    const chatId = `${formatted}@c.us`;
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, urlFile: fileUrl, fileName, caption }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      console.log(`[WA Transport:${storeId}] ✅ File sent via Green API → ${chatId}`);
      return true;
    }
    console.error(`[WA Transport:${storeId}] ❌ Green API file error: ${res.status}`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] ❌ Green API file exception: ${err.message}`);
    return false;
  }
}

/* ── Green API config check (per-store, falls back to global) ──── */
export async function isGreenApiConfigured(storeId: number): Promise<boolean> {
  return !!(await getGreenApiCredentials(storeId));
}

/* ── Interactive reply buttons (Green API only — Baileys has no equivalent) ──
 * Max 3 buttons, 25 chars per button text, per Green API's docs
 * (sendInteractiveButtonsReply). Beta endpoint on their side — can change.  */
export async function sendWhatsAppButtons(
  phone: string,
  body: string,
  buttons: { id: string; text: string }[],
  storeId = 1,
  header?: string,
  footer?: string,
): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No Green API config for this store — buttons DROPPED`);
    return false;
  }
  const { instanceId, apiToken } = creds;
  try {
    const chatId = `${formatted}@c.us`;
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendInteractiveButtonsReply/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        ...(header ? { header } : {}),
        body,
        ...(footer ? { footer } : {}),
        buttons: buttons.slice(0, 3).map(b => ({ buttonId: b.id, buttonText: b.text.slice(0, 25) })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      console.log(`[WA Transport:${storeId}] ✅ Buttons sent via Green API → ${chatId}`);
      return true;
    }
    console.error(`[WA Transport:${storeId}] ❌ Green API buttons error: ${res.status}`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] ❌ Green API buttons exception: ${err.message}`);
    return false;
  }
}

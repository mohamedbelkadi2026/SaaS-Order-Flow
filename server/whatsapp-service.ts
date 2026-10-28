/** WhatsApp transport: every send requires an explicit store and its own
 * saved Green API pair. Missing settings and database errors fail closed. */
import { greenApiUrl } from "./green-api";
import { getStoreGreenCredentials } from "./green-api-tenant";

async function getGreenApiCredentials(storeId: number) {
  try { return await getStoreGreenCredentials(storeId); }
  catch { return null; }
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

/* ── Text send via this store’s Green API instance ──────────── */
export async function sendWhatsAppMessage(phone: string, message: string, storeId: number): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  console.log(`[WA Transport:${storeId}] Sending to ${phone} → ${formatted}@s.whatsapp.net`);

  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No Green API credentials belonging to this store — message DROPPED (no queue)`);
    return false;
  }
  const { instanceId, apiToken } = creds;

  try {
    const chatId = `${formatted}@c.us`;
    const res = await fetch(greenApiUrl(instanceId, "sendMessage", apiToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok && typeof (await res.json().catch(() => ({}))).idMessage === "string") {
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

/* ── Image send via this store’s Green API instance ──────────── */
export async function sendWhatsAppImage(phone: string, imageUrl: string, caption: string, storeId: number): Promise<boolean> {
  return sendWhatsAppFile(phone, imageUrl, "produit.jpg", caption, storeId);
}

/* ── File send via this store’s Green API instance ───────────── */
export async function sendWhatsAppFile(phone: string, fileUrl: string, fileName: string, caption: string, storeId: number): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);

  // Green API determines the outgoing file type from the fileName field's
  // extension (their docs: "By the extension specified in the file name, in
  // the fileName field"). Trust the REAL uploaded file's extension (from the
  // URL) over whatever generic name the caller passed in — a mismatch here
  // (e.g. an uploaded .mp3 sent as "audio.opus") is exactly what was causing
  // audio/video to silently fail to send.
  const urlExtMatch = fileUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  const realExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : null;
  const fallbackBase = fileName.replace(/\.[^.]+$/, "") || "file";
  const resolvedFileName = realExt ? `${fallbackBase}.${realExt}` : fileName;

  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No Green API credentials belonging to this store — file DROPPED`);
    return false;
  }
  const { instanceId, apiToken } = creds;

  try {
    const chatId = `${formatted}@c.us`;
    console.log(`[WA Transport:${storeId}] Sending file via Green API: url=${fileUrl} fileName=${resolvedFileName}`);
    const res = await fetch(greenApiUrl(instanceId, "sendFileByUrl", apiToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, urlFile: fileUrl, fileName: resolvedFileName, caption }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok && typeof (await res.json().catch(() => ({}))).idMessage === "string") {
      console.log(`[WA Transport:${storeId}] ✅ File sent via Green API → ${chatId}`);
      return true;
    }
    const errBody = await res.text().catch(() => "");
    console.error(`[WA Transport:${storeId}] ❌ Green API file error: ${res.status} — ${errBody.slice(0, 300)}`);
    return false;
  } catch (err: any) {
    console.error(`[WA Transport:${storeId}] ❌ Green API file exception: ${err.message}`);
    return false;
  }
}

/* ── Green API config check for this store only ──── */
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
  storeId: number,
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
    const res = await fetch(greenApiUrl(instanceId, "sendInteractiveButtonsReply", apiToken), {
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
    if (res.ok && typeof (await res.json().catch(() => ({}))).idMessage === "string") {
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


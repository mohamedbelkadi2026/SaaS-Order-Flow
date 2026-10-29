/** WhatsApp transport: every send requires an explicit store and its own
 * saved Green API pair. Missing settings and database errors fail closed. */
import { getMetaConnection, sendMetaMessage, sendMetaFile } from "./meta-whatsapp-service";
import { metaInteractive } from "./meta-whatsapp-core";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
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

export interface WhatsAppSendOutcome {
  error?: string;
  uncertain?: boolean;
}

// Retry only an explicit rate-limit rejection. A timeout may already have
// queued the message, so blindly retrying it could contact the customer twice.
async function postGreenMessage(instanceId: string, apiToken: string, method: string,
  body: Record<string, unknown>, outcome: WhatsAppSendOutcome): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(greenApiUrl(instanceId, method, apiToken), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.idMessage === "string" && data.idMessage.trim()) return true;
      if (res.status === 429 && attempt < 2) {
        const seconds = Number(res.headers.get("retry-after"));
        const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : (attempt + 1) * 2000;
        if (delay <= 10000) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      // Classify upstream errors without exposing credentials or raw bodies.
      const reason = String(data?.message || data?.error || "").toLowerCase();
      if (res.status === 401 || res.status === 403) outcome.error = "Identifiants Green API refusés. Vérifiez Instance ID et API Token de ce magasin.";
      else if (/limit|quota|tariff|payment|plan|contact.*count/.test(reason) && res.status !== 429) outcome.error = "Limite du forfait Green API atteinte. Vérifiez les contacts autorisés et le forfait dans Green API.";
      else if (/not authorized|notauthorized|loggedout|not logged|instance.*state/.test(reason)) outcome.error = "WhatsApp déconnecté dans Green API. Reconnectez le numéro de ce magasin.";
      else if (res.status === 429) outcome.error = "Green API limite temporairement les envois (HTTP 429). Réessayez après quelques minutes.";
      else if (/chatid|phone|recipient/.test(reason)) outcome.error = "Green API refuse le destinataire. Vérifiez son numéro WhatsApp au format international.";
      else outcome.error = `Green API n'a pas accepté l'envoi (HTTP ${res.status}). Consultez le journal Green API de ce magasin.`;
      outcome.uncertain = (res.ok && !reason) || res.status >= 500;
      if (outcome.uncertain) outcome.error = `Résultat d'envoi incertain (HTTP ${res.status}). Vérifiez le journal Green API avant de relancer pour éviter un doublon.`;
      return false;
    } catch {
      outcome.uncertain = true;
      outcome.error = "Green API n'a pas répondu à temps ou la connexion a échoué. L'envoi est incertain : vérifiez le journal Green API avant de relancer.";
      return false;
    }
  }
  return false;
}

/* ── Text send via this store’s Green API instance ──────────── */
export async function sendWhatsAppMessage(phone: string, message: string, storeId: number, outcome: WhatsAppSendOutcome = {}): Promise<boolean> {
  if (await getMetaConnection(storeId)) return sendMetaMessage(storeId, phone, {type:"text",text:{body:message}}, outcome);
  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    outcome.error = "Connexion Green API absente ou non valide pour ce magasin. Vérifiez ses identifiants.";
    return false;
  }
  return postGreenMessage(creds.instanceId, creds.apiToken, "sendMessage",
    { chatId: `${formatPhoneForWhatsApp(phone)}@c.us`, message }, outcome);
}

/* ── Image send via this store’s Green API instance ──────────── */
export async function sendWhatsAppImage(phone: string, imageUrl: string, caption: string, storeId: number): Promise<boolean> {
  return sendWhatsAppFile(phone, imageUrl, "produit.jpg", caption, storeId);
}

/* ── File send via this store’s Green API instance ───────────── */
export async function sendWhatsAppFile(phone: string, fileUrl: string, fileName: string, caption: string, storeId: number): Promise<boolean> {
  if (await getMetaConnection(storeId)) return sendMetaFile(storeId,phone,fileUrl,fileName,caption);
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
    // Upload our stored media directly: relative/private application URLs cannot
    // be downloaded by Green API. Restrict WhatsApp files to their owning store.
    const parsed = new URL(fileUrl, process.env.PUBLIC_APP_URL || "https://www.tajergrow.com");
    const local = parsed.pathname.match(/^\/uploads\/(whatsapp\/(\d+)\/|products\/)([a-zA-Z0-9_.-]+)$/);
    if (local) {
      if (local[2] && Number(local[2]) !== storeId) return false;
      const filename = path.join(process.env.DATA_DIR ?? path.resolve("."), "uploads", local[1], local[3]);
      const info = await stat(filename);
      if (!info.isFile() || info.size <= 0 || info.size > 100 * 1024 * 1024) return false;
      const form = new FormData();
      form.set("chatId", chatId);
      form.set("fileName", resolvedFileName);
      form.set("caption", caption);
      form.set("file", new Blob([await readFile(filename)]), resolvedFileName);
      const endpoint = greenApiUrl(instanceId, "sendFileByUpload", apiToken)
        .replace(".api.greenapi.com", ".media.greenapi.com").replace("https://api.green-api.com", "https://media.green-api.com");
      const uploaded = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
      const result = await uploaded.json().catch(() => ({}));
      return uploaded.ok && typeof result.idMessage === "string" && result.idMessage.length > 0;
    }
    if (!/^https?:$/.test(parsed.protocol) || fileUrl.startsWith("/")) return false;
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
  const meta = await getMetaConnection(storeId);
  return meta ? meta.active : !!(await getGreenApiCredentials(storeId));
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
  outcome: WhatsAppSendOutcome = {},
): Promise<boolean> {
  if (await getMetaConnection(storeId)) return sendMetaMessage(storeId,phone,metaInteractive(body,buttons,header,footer),outcome);
  const formatted = formatPhoneForWhatsApp(phone);
  const creds = await getGreenApiCredentials(storeId);
  if (!creds) {
    console.warn(`[WA Transport:${storeId}] No Green API config for this store — buttons DROPPED`);
    return false;
  }
  return postGreenMessage(creds.instanceId, creds.apiToken, "sendInteractiveButtonsReply", {
    chatId: `${formatted}@c.us`, ...(header ? { header } : {}), body,
    ...(footer ? { footer } : {}),
    buttons: buttons.slice(0, 3).map(b => ({ buttonId: b.id, buttonText: b.text.slice(0, 25) })),
  }, outcome);
}

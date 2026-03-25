/**
 * TajerGrow — WhatsApp engine via @whiskeysockets/baileys
 * Pure Node.js WebSocket — no Chromium/Puppeteer required.
 * Session persists in ./auth_info_baileys across restarts.
 *
 * STATE MACHINE:
 *   idle → connecting → qr (waiting for scan) → connecting → connected
 *   Any close: → idle (auto-restart unless manual logout)
 *   401 logged-out: clear files → auto-restart in 3s → qr
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { db } from "./db";
import { aiConversations } from "@shared/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

/* ── Types ─────────────────────────────────────────────────── */
export type WAState = "idle" | "qr" | "connecting" | "connected";

interface BaileysStatus {
  state: WAState;
  phone: string | null;
  qr: string | null;
}

/* ── Auth directory (persists on Replit filesystem) ─────────── */
const AUTH_DIR = path.join(process.cwd(), "auth_info_baileys");

/* ── Singleton state — all variables initialized at module load ─ */
let _sock: ReturnType<typeof makeWASocket> | null = null;
let _waState: WAState = "idle";
let _qrDataUrl: string | null = null;
let _phoneNumber: string | null = null;
let _reconnectTimer: NodeJS.Timeout | null = null;
let _isRunning = false; // prevent concurrent connectToWhatsApp() calls
let _activeStoreId: number | null = null; // storeId of the currently connected WhatsApp account

/* ── Message deduplication cache ─────────────────────────────── */
// WhatsApp multi-device can deliver the same message event multiple times.
// We cache processed message IDs for 5 minutes to avoid duplicate AI replies.
const _processedMsgIds = new Map<string, number>(); // msgId → timestamp
const MSG_DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── LID → Phone mapping cache ─────────────────────────────────
 * WhatsApp privacy accounts reply via @lid JIDs (e.g. 177532607430859@lid)
 * Baileys automatically writes lid-mapping-{lid}_reverse.json files in auth_info_baileys/
 * containing the real phone number. We read those files on first @lid encounter
 * and cache the result in memory for subsequent messages.
 * ─────────────────────────────────────────────────────────────── */
const _lidToPhone = new Map<string, string>(); // LID prefix → real phone string

async function resolveLidToPhone(lidPrefix: string): Promise<string | null> {
  // 1. Check in-memory cache
  const cached = _lidToPhone.get(lidPrefix);
  if (cached) return cached;

  // 2. Read Baileys' own lid-mapping-{lid}_reverse.json file
  // Baileys writes this automatically when it decrypts messages from LID users
  try {
    const mapFile = path.join(AUTH_DIR, `lid-mapping-${lidPrefix}_reverse.json`);
    const raw = await fs.readFile(mapFile, "utf8");
    const phone: string = JSON.parse(raw); // contains just the phone digits, e.g. "212632595440"
    const resolved = phone.startsWith("+") ? phone : `+${phone}`;
    _lidToPhone.set(lidPrefix, resolved);
    console.log(`[LID] ✅ Resolved ${lidPrefix}@lid → ${resolved} (from auth file)`);
    return resolved;
  } catch {
    // File doesn't exist yet (first message before Baileys has written it)
    console.log(`[LID] ⚠️ No mapping file for LID ${lidPrefix} yet — Baileys will write it during decryption`);
    return null;
  }
}

function isDuplicateMessage(msgId: string): boolean {
  const now = Date.now();
  // Clean up old entries
  for (const [id, ts] of _processedMsgIds) {
    if (now - ts > MSG_DEDUP_TTL_MS) _processedMsgIds.delete(id);
  }
  if (_processedMsgIds.has(msgId)) return true;
  _processedMsgIds.set(msgId, now);
  return false;
}

/* ── SSE broadcast helper — lazy import to avoid circulars ─── */
async function broadcastWAStatus() {
  try {
    const { broadcastToStore } = await import("./sse");
    // Broadcast to store 0 = global Baileys events (all authenticated clients listen)
    broadcastToStore(0, "wa_status", {
      state: _waState,
      phone: _phoneNumber,
      qr: _qrDataUrl,
      ts: Date.now(),
    });
  } catch { /* sse not ready yet */ }
}

/* ── Lazy import to avoid circular deps ─────────────────────── */
async function callAIHandler(storeId: number, phone: string, text: string) {
  try {
    const { handleIncomingMessage } = await import("./ai-agent");
    console.log(`[ROUTING] Message from ${phone} | Store: ${storeId} | Msg: "${text.substring(0, 60)}"`);
    await handleIncomingMessage(storeId, phone, text);
  } catch (err: any) {
    console.error("[Baileys] AI handler error:", err.message);
  }
}

/* ── Phone normalisation ─────────────────────────────────────── */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  return digits;
}

function toJid(phone: string): string {
  return `${normalisePhone(phone)}@s.whatsapp.net`;
}

/* ── Resolve storeId reliably (4 fallback strategies) ─────────
 * This is the single source of truth for figuring out which store
 * the currently-connected WhatsApp account belongs to.
 * Strategy order (most → least reliable):
 *  1. whatsappSessions WHERE status = 'connected'  (set on connect)
 *  2. whatsappSessions ANY row  (handles stale "disconnected" status)
 *  3. stores table single row   (only store in DB)
 *  4. Hard-coded storeId = 1   (absolute last resort, single-tenant)
 * ─────────────────────────────────────────────────────────────── */
async function resolveStoreId(): Promise<number | null> {
  try {
    const { whatsappSessions, stores } = await import("@shared/schema");
    const { eq: drEq } = await import("drizzle-orm");

    // Strategy 1: any session with status=connected
    const [connected] = await db.select({ storeId: whatsappSessions.storeId })
      .from(whatsappSessions).where(drEq(whatsappSessions.status, "connected")).limit(1);
    if (connected) {
      console.log(`[WA-STATUS] resolveStoreId → strategy 1 (connected): storeId=${connected.storeId}`);
      return connected.storeId;
    }

    // Strategy 2: any session in the table (most recent)
    const [anySession] = await db.select({ storeId: whatsappSessions.storeId })
      .from(whatsappSessions).limit(1);
    if (anySession) {
      console.log(`[WA-STATUS] resolveStoreId → strategy 2 (any session): storeId=${anySession.storeId}`);
      return anySession.storeId;
    }

    // Strategy 3: only one store in the DB
    const allStores = await db.select({ id: stores.id }).from(stores).limit(2);
    if (allStores.length === 1) {
      console.log(`[WA-STATUS] resolveStoreId → strategy 3 (single store): storeId=${allStores[0].id}`);
      return allStores[0].id;
    }

    // Strategy 4: hard-coded fallback (single-tenant default)
    console.warn("[WA-STATUS] resolveStoreId → strategy 4 (hard-coded fallback): storeId=1");
    return 1;
  } catch (e: any) {
    console.error("[WA-STATUS] resolveStoreId failed:", e.message);
    return 1; // absolute last resort
  }
}

/* ── Clear session files ─────────────────────────────────────── */
async function clearSessionFiles() {
  try {
    await fs.rm(AUTH_DIR, { recursive: true, force: true });
    console.log("[WA-STATUS] Session files deleted — fresh QR will be generated.");
  } catch (e: any) {
    console.warn("[WA-STATUS] Could not delete session files:", e.message);
  }
}

/* ── Schedule reconnect ──────────────────────────────────────── */
function scheduleReconnect(delayMs = 3000) {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connectToWhatsApp().catch(e => console.error("[Baileys] Reconnect failed:", e.message));
  }, delayMs);
}

/* ── Main connect function ───────────────────────────────────── */
async function connectToWhatsApp(): Promise<void> {
  // Prevent concurrent init
  if (_isRunning) {
    console.log("[WA-STATUS] Connect already in progress — skipping.");
    return;
  }
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

  _isRunning = true;
  _waState = "connecting";
  console.log("[WA-STATUS] Connecting...");
  await broadcastWAStatus();

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: "silent" });

    _sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ["TajerGrow", "Chrome", "1.0.0"],
      getMessage: async () => undefined,
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 500,
    });

    _sock.ev.on("creds.update", saveCreds);

    /* ── Connection events ────────────────────────────────────── */
    _sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR received ──────────────────────────────────────────
      if (qr) {
        try {
          _qrDataUrl = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: "#1e1b4b", light: "#ffffff" },
          });
          _waState = "qr";
          console.log("[WA-STATUS] QR_READY — waiting for scan");
          await broadcastWAStatus();
        } catch (e: any) {
          console.error("[Baileys] QR generation error:", e.message);
        }
      }

      // ── Connecting ───────────────────────────────────────────
      if (connection === "connecting") {
        _waState = "connecting";
        console.log("[WA-STATUS] Connecting...");
        await broadcastWAStatus();
      }

      // ── Connected ────────────────────────────────────────────
      if (connection === "open") {
        _waState = "connected";
        _qrDataUrl = null;
        _isRunning = false;
        _phoneNumber = _sock?.user?.id?.split(":")[0] ?? null;
        console.log(`[WA-STATUS] Connected — phone: ${_phoneNumber}`);
        await broadcastWAStatus();

        // Resolve storeId from DB if not already cached (e.g. on auto-restart)
        if (!_activeStoreId) {
          _activeStoreId = await resolveStoreId();
        }

        // Write connected status to DB so getConnectedStoreIds() works too
        if (_activeStoreId) {
          try {
            const { whatsappSessions } = await import("@shared/schema");
            const { and: drAnd, eq: drEq } = await import("drizzle-orm");
            const [existing] = await db.select().from(whatsappSessions).where(drEq(whatsappSessions.storeId, _activeStoreId));
            if (existing) {
              await db.update(whatsappSessions).set({ status: "connected", phone: _phoneNumber, updatedAt: new Date() }).where(drEq(whatsappSessions.storeId, _activeStoreId));
            }
            console.log(`[WA-STATUS] DB session updated → connected for storeId ${_activeStoreId}`);
          } catch (e: any) {
            console.warn("[WA-STATUS] Could not update session status in DB:", e.message);
          }
        }

        // Flush any messages that were queued while WA was disconnected
        try {
          const { flushPendingQueue } = await import("./whatsapp-service");
          flushPendingQueue();
        } catch {}
      }

      // ── Closed ───────────────────────────────────────────────
      if (connection === "close") {
        _isRunning = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`[WA-STATUS] Disconnected — code: ${statusCode} | loggedOut: ${loggedOut}`);

        _waState = "idle";
        _sock = null;
        _phoneNumber = null;
        await broadcastWAStatus();

        if (loggedOut) {
          // 401: WhatsApp explicitly removed the linked device
          // Must delete stale files — otherwise every reconnect immediately gets another 401
          console.log("[WA-STATUS] Logged out (401). Clearing stale session files...");
          _qrDataUrl = null;
          await clearSessionFiles();
          // Auto-restart after 3s → will show fresh QR since no creds file
          console.log("[WA-STATUS] Will show fresh QR in 3s...");
          scheduleReconnect(3000);
        } else {
          // Network drop or timeout — reconnect quickly
          console.log("[WA-STATUS] Reconnecting in 5s...");
          scheduleReconnect(5000);
        }
      }
    });

    /* ── Voice note / audio transcription ───────────────────── */
    async function transcribeAudio(sock: typeof _sock, msg: any): Promise<string | null> {
      try {
        // Prefer OPENAI_API_KEY (direct OpenAI), fallback to OPENROUTER_API_KEY
        const openaiKey = process.env.OPENAI_API_KEY;
        const routerKey = process.env.OPENROUTER_API_KEY;
        const apiKey = openaiKey || routerKey;
        if (!apiKey) {
          console.warn("[Whisper] ⚠️ No API key for transcription (set OPENAI_API_KEY)");
          return null;
        }
        // Whisper API only available on OpenAI directly (not OpenRouter)
        // If only OPENROUTER_API_KEY, transcription will fail gracefully
        const baseURL = "https://api.openai.com/v1";
        const effectiveKey = openaiKey || apiKey; // will fail gracefully if it's an OR key

        const buffer = await downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock!.updateMediaMessage });
        if (!buffer || (buffer as Buffer).length === 0) {
          console.warn("[Whisper] ⚠️ Empty audio buffer");
          return null;
        }

        // Write to temp .ogg file (Whisper accepts OGG/Opus natively)
        const tmpPath = path.join(os.tmpdir(), `wa_audio_${Date.now()}.ogg`);
        await fs.writeFile(tmpPath, buffer as Buffer);

        const { createReadStream } = await import("fs");
        const openai = new OpenAI({ apiKey: effectiveKey, baseURL });

        let transcription = "";
        try {
          const result = await openai.audio.transcriptions.create({
            file: createReadStream(tmpPath) as any,
            model: "whisper-1",
            language: "ar",
          });
          transcription = (result.text || "").trim();
        } finally {
          await fs.unlink(tmpPath).catch(() => {});
        }

        console.log(`[Whisper] ✅ Transcribed: "${transcription.substring(0, 100)}"`);
        return transcription || null;
      } catch (err: any) {
        console.error("[Whisper] ❌ Transcription error:", err.message);
        return null;
      }
    }

    /* ── Incoming messages → AI handler ─────────────────────── */
    _sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) {
          // Bot's own outgoing messages — skip silently (they're already handled)
          continue;
        }
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid ?? "";
        if (remoteJid.endsWith("@g.us")) continue;

        // ── LID resolution: @lid JIDs are WhatsApp privacy-mode addresses ──
        // Baileys writes lid-mapping-{lid}_reverse.json files automatically when
        // it decrypts messages. We read those files to get the real phone number.
        const isLid = remoteJid.endsWith("@lid");
        let resolvedPhone: string | null = null;

        if (isLid) {
          const lidPrefix = remoteJid.split("@")[0].split(":")[0]; // e.g. "177532607430859"
          resolvedPhone = await resolveLidToPhone(lidPrefix);
          if (!resolvedPhone) {
            // File not yet written — Baileys writes it after decryption.
            // Try once more after a short delay (gives Baileys time to write the file)
            await new Promise(r => setTimeout(r, 800));
            resolvedPhone = await resolveLidToPhone(lidPrefix);
          }
        }

        const rawPhone = isLid
          ? (resolvedPhone?.replace("+", "") ?? remoteJid.split("@")[0])
          : remoteJid.replace("@s.whatsapp.net", "");
        const phone = resolvedPhone ? normalisePhone(resolvedPhone) : normalisePhone(rawPhone);

        // ── Check for audio / voice note messages ─────────────
        const isAudio = !!(msg.message.audioMessage || msg.message.pttMessage);
        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseMessage?.selectedButtonId ||
          msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
          "";

        if (!text.trim() && isAudio) {
          console.log(`[Baileys] 🎤 Voice note from ${phone} — transcribing...`);
          // Broadcast audio received event so Live Monitoring shows it
          try {
            const { broadcastToStore: bcast } = await import("./sse");
            if (_activeStoreId) {
              bcast(_activeStoreId, "audio_received", { phone, ts: Date.now(), status: "transcribing" });
            }
          } catch { /* sse not ready */ }

          const transcription = await transcribeAudio(_sock, msg);
          if (transcription) {
            text = transcription;
            console.log(`[Baileys] 🎤 Using transcription as message: "${text.substring(0, 80)}"`);
            // Broadcast with transcription
            try {
              const { broadcastToStore: bcast } = await import("./sse");
              if (_activeStoreId) {
                bcast(_activeStoreId, "audio_received", { phone, ts: Date.now(), status: "done", transcription: text });
              }
            } catch { /* sse not ready */ }
          } else {
            // Transcription failed — notify admin and skip
            console.warn(`[Baileys] 🎤 Transcription failed for ${phone} — sending fallback`);
            try {
              const { broadcastToStore: bcast } = await import("./sse");
              if (_activeStoreId) {
                bcast(_activeStoreId, "audio_received", { phone, ts: Date.now(), status: "failed" });
              }
            } catch { /* sse not ready */ }
            // Use a placeholder text so AI can acknowledge it
            text = "[رسالة صوتية]";
          }
        }

        if (!text.trim()) {
          console.log(`[Baileys] ⏭ Skipping media-only message from ${phone} (no text)`);
          continue;
        }

        // ── Deduplication: WhatsApp multi-device fires same event several times ──
        const msgId = msg.key.id ?? `${phone}-${text.substring(0, 20)}-${Date.now()}`;
        if (isDuplicateMessage(msgId)) {
          console.log(`[Baileys] ⏭ Skipping duplicate message ${msgId} from ${phone}`);
          continue;
        }

        console.log(`[INCOMING MESSAGE]: "${text.substring(0, 80)}" | from: ${remoteJid}`);
        console.log(`[RECEIVED] WhatsApp message from ${phone}: "${text.substring(0, 80)}"`);

        try {
          const { storage: stor } = await import("./storage");

          // ══════════════════════════════════════════════════════════════════
          // ROUTING PRIORITY (prevents conversation mixing between customers):
          // 1. JID match  — most reliable, survives multi-device LID changes
          // 2. Phone match — normalized phone formats (+212 / 0X / raw)
          // 3. Order check — customer with order but no active conv → re-open
          // 4. Unknown     — no order in DB → silently ignore
          // ══════════════════════════════════════════════════════════════════

          // ── Step 1: Match by stored WhatsApp JID ─────────────────────────
          const rawJid = remoteJid; // e.g. "212688959768@s.whatsapp.net"
          const jidConv = await stor.getActiveAiConversationByJid(rawJid);

          if (jidConv) {
            console.log(`[Baileys] ✅ JID match → conv ${jidConv.id} (${jidConv.customerPhone}) | "${text.substring(0, 40)}"`);
            await callAIHandler(jidConv.storeId, jidConv.customerPhone!, text);
            continue; // skip further routing for this message
          }

          // ── Step 2: Match by normalized phone number ──────────────────────
          // Build all phone variants we will search for
          const phoneVariants = [
            phone,           // e.g. 212688959768 (international, no +)
            `+${phone}`,     // +212688959768
            `0${phone.slice(3)}`,  // 0688959768 (local Moroccan)
            `+0${phone.slice(3)}`, // +0688959768 (some stores enter this)
          ];
          // Helper: normalize a stored phone to pure digits for comparison
          const normalize = (p: string) => p.replace(/\D/g, "");

          const { or: drizzleOr } = await import("drizzle-orm");
          const activeConvs = await db
            .select()
            .from(aiConversations)
            .where(drizzleOr(
              eq(aiConversations.status, "active"),
              eq(aiConversations.status, "confirmed"),
            ));

          // Normalize stored phones too — handles "06 88 95 97 68" (spaces), dashes, etc.
          const normalizedIncoming = new Set(phoneVariants.map(normalize));
          const matched = activeConvs.filter(c =>
            c.customerPhone && normalizedIncoming.has(normalize(c.customerPhone))
          );

          if (matched.length > 0) {
            console.log(`[Baileys] ✅ Phone matched to conv(s): ${matched.map(c => c.id).join(", ")} | JID: ${rawJid}`);
            for (const conv of matched) {
              // Store JID now so future messages from this JID route via Step 1 (instant, exact)
              if (!conv.whatsappJid) {
                stor.updateConversationJid(conv.id, rawJid).catch(() => {});
                console.log(`[Baileys] 📌 Stored JID ${rawJid} → conv ${conv.id}`);
              }
              await callAIHandler(conv.storeId, conv.customerPhone!, text);
            }
            continue;
          }

          // ── Step 3: Unknown JID → phone NOT in orders → IGNORE ───────────
          // Only customers who have placed an order receive AI responses.
          let storeId = _activeStoreId;
          if (!storeId) {
            storeId = await resolveStoreId();
            if (storeId) _activeStoreId = storeId;
          }

          if (storeId) {
            try {
              const hasOrders = await stor.phoneHasOrdersInStore(storeId, phone);
              if (hasOrders) {
                // Known customer with a prior order but no active conv → auto-start confirmation
                console.log(`[Baileys] ℹ️ Phone ${phone} has prior orders → auto-starting confirmation`);
                await callAIHandler(storeId, phone, text);
              } else {
                // Unknown phone — no order in DB → silently ignore
                console.log(`[Baileys] ⏭ Ignoring message from unknown phone ${phone} — no orders in DB`);
              }
            } catch (routeErr: any) {
              console.error("[Baileys] Unknown-phone routing error:", routeErr.message);
            }
          } else {
            console.warn(`[Baileys] ⚠️ Cannot route phone ${phone} — no storeId resolved`);
          }

        } catch (err: any) {
          console.error("[Baileys] Message routing error:", err.message);
        }
      }
    });

  } catch (err: any) {
    _isRunning = false;
    console.error("[WA-STATUS] Fatal init error:", err.message);
    _waState = "idle";
    _sock = null;
    await broadcastWAStatus();
    // Retry after 8s
    scheduleReconnect(8000);
  }
}

/* ── Public API ──────────────────────────────────────────────── */
export const baileysService = {

  /** Start the WhatsApp connection (idempotent) */
  async start(): Promise<void> {
    if (_waState === "connected") {
      console.log("[WA-STATUS] Already connected — skipping start.");
      return;
    }
    if (_isRunning) {
      console.log("[WA-STATUS] Already connecting — skipping start.");
      return;
    }
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
    await connectToWhatsApp();
  },

  /** Force-reset: wipe session, stop current socket, generate fresh QR */
  async resetAndRestart(): Promise<void> {
    console.log("[WA-STATUS] Force reset requested — wiping session...");
    // Stop current socket
    if (_sock) {
      try { _sock.end(undefined); } catch { /* ignore */ }
      _sock = null;
    }
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _isRunning = false;
    _waState = "idle";
    _qrDataUrl = null;
    _phoneNumber = null;
    await broadcastWAStatus();

    // Clear auth files
    await clearSessionFiles();

    // Start fresh — will show QR
    await connectToWhatsApp();
  },

  /** Graceful logout — clear session and stop */
  async logout(): Promise<void> {
    console.log("[WA-STATUS] Logout requested.");
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _isRunning = false;

    if (_sock) {
      try { await _sock.logout(); } catch { /* ignore */ }
      try { _sock.end(undefined); } catch { /* ignore */ }
      _sock = null;
    }
    _waState = "idle";
    _qrDataUrl = null;
    _phoneNumber = null;
    await broadcastWAStatus();
    await clearSessionFiles();
    console.log("[WA-STATUS] Logged out and session cleared.");
  },

  /** Current status snapshot (used by polling endpoint) */
  getStatus(): BaileysStatus {
    return {
      state: _waState,
      phone: _phoneNumber,
      qr: _qrDataUrl,
    };
  },

  /** Send a text message. Returns true on success. */
  async sendMessage(phone: string, text: string): Promise<boolean> {
    if (!_sock || _waState !== "connected") {
      console.warn("[WA-STATUS] Cannot send — not connected. State:", _waState);
      return false;
    }
    try {
      const jid = toJid(phone);
      console.log(`[Baileys] Sending to JID: ${jid}`);
      await _sock.sendMessage(jid, { text });
      console.log(`[Baileys] ✅ Message sent to ${jid}`);
      // Note: LID ↔ phone mapping is resolved via Baileys' lid-mapping files on first reply.
      return true;
    } catch (err: any) {
      console.error(`[Baileys] ❌ Send error to ${phone}:`, err.message);
      return false;
    }
  },

  isConnected(): boolean {
    return _waState === "connected";
  },

  /** Set the storeId this WhatsApp instance serves — call before start() */
  setActiveStoreId(id: number): void {
    _activeStoreId = id;
    console.log(`[WA-STATUS] Active storeId set to ${id}`);
  },

  getActiveStoreId(): number | null {
    return _activeStoreId;
  },
};

/* ── Auto-start if session files exist ──────────────────────── */
export async function autoStartBaileys(): Promise<void> {
  try {
    await fs.access(path.join(AUTH_DIR, "creds.json"));
    console.log("[WA-STATUS] Existing session found — auto-connecting...");

    // Pre-load storeId so new-lead routing works immediately on restart
    _activeStoreId = await resolveStoreId();
    console.log(`[WA-STATUS] Pre-loaded storeId: ${_activeStoreId}`);

    await baileysService.start();
  } catch {
    console.log("[WA-STATUS] No existing session — waiting for user to connect.");
  }
}

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
    const { handleIncomingMessage, handleLeadMessage } = await import("./ai-agent");

    // Check if this is an active lead (FB-Ads Sales Mode) conversation
    // Use all phone format variants (212..., +212..., 06...)
    const { aiConversations: convTable } = await import("@shared/schema");
    const { and: drAnd, eq: drEq, inArray: drIn } = await import("drizzle-orm");
    const phoneVariants = [
      phone,
      phone.startsWith("+") ? phone.slice(1) : `+${phone}`,
      phone.startsWith("212") ? `0${phone.slice(3)}` : phone,
    ];
    const activeConvs = await db.select()
      .from(convTable)
      .where(drAnd(drEq(convTable.storeId, storeId), drIn(convTable.customerPhone, phoneVariants), drEq(convTable.status, "active")))
      .limit(1);

    if (activeConvs[0]?.isNewLead) {
      await handleLeadMessage(storeId, phone, text, activeConvs[0]);
    } else {
      await handleIncomingMessage(storeId, phone, text);
    }
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
        if (!_activeStoreId && _phoneNumber) {
          try {
            const { whatsappSessions } = await import("@shared/schema");
            const rows = await db.select({ storeId: whatsappSessions.storeId })
              .from(whatsappSessions);
            if (rows.length === 1) {
              // Only one store has a WhatsApp session — use it
              _activeStoreId = rows[0].storeId;
              console.log(`[WA-STATUS] StoreId resolved from DB: ${_activeStoreId}`);
            }
          } catch (e: any) {
            console.warn("[WA-STATUS] Could not resolve storeId from DB:", e.message);
          }
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

        const rawPhone = remoteJid.replace("@s.whatsapp.net", "");
        const phone = normalisePhone(rawPhone);

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

        console.log(`[Baileys] Incoming from ${phone}: "${text.substring(0, 80)}"`);

        try {
          // Match all possible phone formats stored in DB
          const phoneVariants = [
            phone,              // 212632595440
            `+${phone}`,       // +212632595440
            `0${phone.slice(3)}`,   // 0632595440
          ];
          const { or: drizzleOr } = await import("drizzle-orm");
          const activeConvs = await db
            .select()
            .from(aiConversations)
            .where(drizzleOr(
              eq(aiConversations.status, "active"),
              eq(aiConversations.status, "confirmed"),
            ));

          const matched = activeConvs.filter(c =>
            c.customerPhone && phoneVariants.some(v => c.customerPhone === v)
          );

          if (matched.length > 0) {
            // ── Exact phone match — pass stored phone so AI lookup is reliable ──
            console.log(`[Baileys] ✅ Phone matched to conv(s): ${matched.map(c => c.id).join(", ")} | "${text.substring(0, 40)}"`);
            for (const conv of matched) {
              await callAIHandler(conv.storeId, conv.customerPhone!, text);
            }
          } else {
            // ── LID Fallback ────────────────────────────────────────────
            // WhatsApp multi-device can report sender JIDs as Linked Account
            // IDs (e.g. 177532607430859) instead of real phone numbers.
            // Strategy: find the most recently created ORDER conv (not lead)
            // within the last 4 hours — this is almost certainly the sender.
            // If no order conv, try a fresh lead.
            console.log(`[Baileys] ⚠️ No exact phone match for "${phone}" — trying LID fallback. Active convs: ${activeConvs.length}`);
            const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4-hour window
            // Only use ORDER convs (orderId != null) for LID fallback — leads have known phones
            const recentOrderConvs = activeConvs
              .filter(c => c.orderId !== null && c.createdAt && new Date(c.createdAt as any) > cutoff)
              .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

            if (recentOrderConvs.length > 0) {
              // Route to the most recently created order conv
              const c = recentOrderConvs[0];
              console.log(`[Baileys] ⚠️ LID→ORDER fallback: routing to conv ${c.id} (order #${c.orderId}) | stored: ${c.customerPhone} | incoming JID: ${phone}`);
              await callAIHandler(c.storeId, c.customerPhone!, text);
            } else {
              // No recent order conv — this is a potentially new unknown number
              console.log(`[RECEIVED]: Message from unknown number: ${phone} — "${text.substring(0, 60)}"`);

              // Resolve storeId — use in-memory value or fall back to DB lookup
              let storeId = _activeStoreId;
              if (!storeId) {
                try {
                  const { whatsappSessions } = await import("@shared/schema");
                  const { eq: drEq2 } = await import("drizzle-orm");
                  const rows = await db.select({ storeId: whatsappSessions.storeId })
                    .from(whatsappSessions)
                    .where(drEq2(whatsappSessions.status, "connected"))
                    .limit(1);
                  if (rows.length > 0) {
                    storeId = rows[0].storeId;
                    _activeStoreId = storeId; // cache it
                    console.log(`[Baileys] 🔧 Recovered storeId from DB: ${storeId}`);
                  }
                } catch (sErr: any) {
                  console.warn("[Baileys] Could not recover storeId from DB:", sErr.message);
                }
              }

              console.log(`[Baileys] 🔍 Checking ${phone} as potential new lead. StoreId: ${storeId ?? "none"}`);

              if (storeId) {
                try {
                  const { storage: stor } = await import("./storage");
                  const hasOrders = await stor.phoneHasOrdersInStore(storeId, phone);
                  if (!hasOrders) {
                    console.log(`[Baileys] 🎯 New lead! Phone ${phone} → store ${storeId} — triggering Sales Closer AI`);
                    const { triggerLeadConversation } = await import("./ai-agent");
                    await triggerLeadConversation(storeId, phone, text);
                  } else {
                    // Phone has prior orders but no active conv — auto-start confirmation flow
                    console.log(`[Baileys] ℹ️ Phone ${phone} has prior orders in store ${storeId} — auto-starting confirmation`);
                    await callAIHandler(storeId, phone, text);
                  }
                } catch (leadErr: any) {
                  console.error("[Baileys] Lead detection error:", leadErr.message);
                }
              } else {
                console.warn(`[Baileys] ⚠️ Cannot route unknown phone ${phone} — no storeId available (WA not linked to a store yet).`);
              }
            }
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

    // Pre-load storeId from DB so new-lead detection works immediately on restart
    try {
      const { whatsappSessions } = await import("@shared/schema");
      const rows = await db.select({ storeId: whatsappSessions.storeId }).from(whatsappSessions);
      if (rows.length === 1) {
        _activeStoreId = rows[0].storeId;
        console.log(`[WA-STATUS] Pre-loaded storeId from DB: ${_activeStoreId}`);
      } else if (rows.length > 1) {
        // Multiple stores — find the most recently updated connected one
        const { whatsappSessions: ws2 } = await import("@shared/schema");
        const { eq: drEq } = await import("drizzle-orm");
        const connectedRows = await db.select({ storeId: ws2.storeId }).from(ws2).where(drEq(ws2.status, "connected")).limit(1);
        if (connectedRows.length > 0) {
          _activeStoreId = connectedRows[0].storeId;
          console.log(`[WA-STATUS] Pre-loaded storeId (connected) from DB: ${_activeStoreId}`);
        }
      }
    } catch (e: any) {
      console.warn("[WA-STATUS] Could not pre-load storeId:", e.message);
    }

    await baileysService.start();
  } catch {
    console.log("[WA-STATUS] No existing session — waiting for user to connect.");
  }
}

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
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import fs from "fs/promises";
import { db } from "./db";
import { aiConversations } from "@shared/schema";
import { eq } from "drizzle-orm";

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

    /* ── Incoming messages → AI handler ─────────────────────── */
    _sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid ?? "";
        if (remoteJid.endsWith("@g.us")) continue;

        const rawPhone = remoteJid.replace("@s.whatsapp.net", "");
        const phone = normalisePhone(rawPhone);

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseMessage?.selectedButtonId ||
          msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
          "";

        if (!text.trim()) continue;

        console.log(`[Baileys] Incoming from ${phone}: "${text.substring(0, 80)}"`);

        try {
          // Match all possible phone formats stored in DB
          const phoneVariants = [
            phone,              // 212632595440
            `+${phone}`,       // +212632595440
            `0${phone.slice(3)}`,   // 0632595440
          ];
          const activeConvs = await db
            .select()
            .from(aiConversations)
            .where(eq(aiConversations.status, "active"));

          const matched = activeConvs.filter(c =>
            c.customerPhone && phoneVariants.some(v => c.customerPhone === v)
          );

          if (matched.length === 0) {
            console.log(`[Baileys] No active conv for ${phone}`);
          }

          for (const conv of matched) {
            await callAIHandler(conv.storeId, phone, text);
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
};

/* ── Auto-start if session files exist ──────────────────────── */
export async function autoStartBaileys(): Promise<void> {
  try {
    await fs.access(path.join(AUTH_DIR, "creds.json"));
    console.log("[WA-STATUS] Existing session found — auto-connecting...");
    await baileysService.start();
  } catch {
    console.log("[WA-STATUS] No existing session — waiting for user to connect.");
  }
}

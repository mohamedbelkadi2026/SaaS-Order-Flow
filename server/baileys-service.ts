/**
 * TajerGrow — WhatsApp engine via @whiskeysockets/baileys
 * Pure Node.js WebSocket — no Chromium/Puppeteer required.
 * Session persists in ./auth_info_baileys across restarts.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import { db } from "./db";
import { aiConversations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/* ── Types ─────────────────────────────────────────────────── */
export type WAState = "idle" | "qr" | "connecting" | "connected";

interface BaileysStatus {
  state: WAState;
  phone: string | null;
  qr: string | null;           // base64 PNG data-URL
}

/* ── Auth directory (persists on Replit filesystem) ─────────── */
const AUTH_DIR = path.join(process.cwd(), "auth_info_baileys");

/* ── Internal state ─────────────────────────────────────────── */
let sock: ReturnType<typeof makeWASocket> | null = null;
let waState: WAState = "idle";
let qrDataUrl: string | null = null;
let phoneNumber: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isLoggedOut = false;

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

/* ── Main connect function ───────────────────────────────────── */
async function connectToWhatsApp(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ["TajerGrow", "Chrome", "1.0.0"],
      getMessage: async () => undefined,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrDataUrl = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: "#1e1b4b", light: "#ffffff" },
          });
          waState = "qr";
          console.log("[Baileys] QR code generated — scan with WhatsApp");
        } catch (e: any) {
          console.error("[Baileys] QR generation error:", e.message);
        }
      }

      if (connection === "connecting") {
        waState = "connecting";
        console.log("[Baileys] Connecting to WhatsApp...");
      }

      if (connection === "open") {
        waState = "connected";
        qrDataUrl = null;
        isLoggedOut = false;
        phoneNumber = sock?.user?.id?.split(":")[0] ?? null;
        console.log("[Baileys] Connected to WhatsApp:", phoneNumber);
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log("[Baileys] Connection closed. Code:", statusCode, "| Logged out:", loggedOut);

        waState = "idle";
        sock = null;

        if (loggedOut) {
          isLoggedOut = true;
          phoneNumber = null;
          qrDataUrl = null;
          console.log("[Baileys] Logged out. Session cleared.");
        } else {
          console.log("[Baileys] Reconnecting in 5s...");
          reconnectTimer = setTimeout(() => {
            connectToWhatsApp().catch(console.error);
          }, 5000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid ?? "";
        if (remoteJid.endsWith("@g.us")) continue; // skip groups

        const rawPhone = remoteJid.replace("@s.whatsapp.net", "");
        const phone = rawPhone.startsWith("212")
          ? `0${rawPhone.slice(3)}`
          : rawPhone;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseMessage?.selectedButtonId ||
          msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
          "";

        if (!text.trim()) continue;

        console.log(`[Baileys] Incoming from ${phone}: ${text.substring(0, 60)}`);

        // Route to active AI conversations
        try {
          const activeConvs = await db
            .select()
            .from(aiConversations)
            .where(
              and(
                eq(aiConversations.customerPhone, phone),
                eq(aiConversations.status, "active")
              )
            );

          for (const conv of activeConvs) {
            await callAIHandler(conv.storeId, phone, text);
          }
        } catch (err: any) {
          console.error("[Baileys] Message routing error:", err.message);
        }
      }
    });

  } catch (err: any) {
    console.error("[Baileys] Fatal init error:", err.message);
    waState = "idle";
    sock = null;
  }
}

/* ── Public API ──────────────────────────────────────────────── */

export const baileysService = {
  /** Start (or restart) the WhatsApp connection */
  async start(): Promise<void> {
    if (waState === "connected" || waState === "connecting") return;
    isLoggedOut = false;
    waState = "connecting";
    await connectToWhatsApp();
  },

  /** Logout and clear the session */
  async logout(): Promise<void> {
    try {
      if (sock) {
        await sock.logout().catch(() => {});
        sock = null;
      }
    } catch { /* ignore */ }
    waState = "idle";
    qrDataUrl = null;
    phoneNumber = null;
    isLoggedOut = true;

    // Wipe auth files
    try {
      const fs = await import("fs/promises");
      await fs.rm(AUTH_DIR, { recursive: true, force: true });
      console.log("[Baileys] Session files cleared.");
    } catch { /* ignore */ }
  },

  /** Get current status snapshot */
  getStatus(): BaileysStatus {
    return {
      state: waState,
      phone: phoneNumber,
      qr: qrDataUrl,
    };
  },

  /** Send a text message. Returns true on success. */
  async sendMessage(phone: string, text: string): Promise<boolean> {
    if (!sock || waState !== "connected") {
      console.warn("[Baileys] Cannot send — not connected.");
      return false;
    }
    try {
      const jid = toJid(phone);
      console.log(`[Baileys] Sending to JID: ${jid}`);
      await sock.sendMessage(jid, { text });
      console.log(`[Baileys] ✅ Message sent to ${jid}`);
      return true;
    } catch (err: any) {
      console.error(`[Baileys] ❌ Send error to ${phone}:`, err.message);
      return false;
    }
  },

  isConnected(): boolean {
    return waState === "connected";
  },
};

/* ── Auto-start if session files exist ──────────────────────── */
export async function autoStartBaileys(): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.access(path.join(AUTH_DIR, "creds.json"));
    console.log("[Baileys] Existing session found — auto-connecting...");
    await baileysService.start();
  } catch {
    console.log("[Baileys] No existing session — waiting for user to connect.");
  }
}

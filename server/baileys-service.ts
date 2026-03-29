/**
 * TajerGrow — Multi-Tenant WhatsApp Engine via @whiskeysockets/baileys
 *
 * Each store gets a fully isolated session:
 *   Auth files: ./auth_info/store_<storeId>/
 *   LID mapping: ./auth_info/store_<storeId>/lid-mapping-{lid}_reverse.json
 *
 * Sessions are created on-demand via getBaileysInstance(storeId) and stored
 * in a Map so subsequent calls return the same instance.
 *
 * STATE MACHINE per session:
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

/* ── Auth directories ───────────────────────────────────────── */
const DATA_DIR = process.env.DATA_DIR ?? process.cwd();
const MULTI_AUTH_BASE = path.join(DATA_DIR, "auth_info");

function getAuthDir(storeId: number): string {
  return path.join(MULTI_AUTH_BASE, `store_${storeId}`);
}

/* ── Session instance type ──────────────────────────────────── */
export interface BaileysSessionInstance {
  start(): Promise<void>;
  resetAndRestart(): Promise<void>;
  logout(): Promise<void>;
  getStatus(): BaileysStatus;
  sendMessage(phone: string, text: string): Promise<boolean>;
  sendImage(phone: string, imageUrl: string, caption: string): Promise<boolean>;
  isConnected(): boolean;
}

/* ── Per-store session map ──────────────────────────────────── */
const _sessions = new Map<number, BaileysSessionInstance>();

/* ── Phone normalisation (shared util) ───────────────────────── */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  return digits;
}

function toJid(phone: string): string {
  return `${normalisePhone(phone)}@s.whatsapp.net`;
}

const MSG_DEDUP_TTL_MS = 5 * 60 * 1000;

/* ── Session factory ────────────────────────────────────────── */
function createBaileysSession(storeId: number): BaileysSessionInstance {
  const AUTH_DIR = getAuthDir(storeId);

  /* ── Per-session state ──────────────────────────────────── */
  let _sock: ReturnType<typeof makeWASocket> | null = null;
  let _waState: WAState = "idle";
  let _qrDataUrl: string | null = null;
  let _phoneNumber: string | null = null;
  let _reconnectTimer: NodeJS.Timeout | null = null;
  let _isRunning = false;
  const _lidToPhone = new Map<string, string>();
  const _processedMsgIds = new Map<string, number>();

  /* ── LID → Phone resolution ─────────────────────────────── */
  async function resolveLidToPhone(lidPrefix: string): Promise<string | null> {
    const cached = _lidToPhone.get(lidPrefix);
    if (cached) return cached;
    try {
      const mapFile = path.join(AUTH_DIR, `lid-mapping-${lidPrefix}_reverse.json`);
      const raw = await fs.readFile(mapFile, "utf8");
      const phone: string = JSON.parse(raw);
      const resolved = phone.startsWith("+") ? phone : `+${phone}`;
      _lidToPhone.set(lidPrefix, resolved);
      console.log(`[LID:${storeId}] ✅ Resolved ${lidPrefix}@lid → ${resolved}`);
      return resolved;
    } catch {
      console.log(`[LID:${storeId}] ⚠️ No mapping file for LID ${lidPrefix} yet`);
      return null;
    }
  }

  /* ── Deduplication ──────────────────────────────────────── */
  function isDuplicateMessage(msgId: string): boolean {
    const now = Date.now();
    for (const [id, ts] of _processedMsgIds) {
      if (now - ts > MSG_DEDUP_TTL_MS) _processedMsgIds.delete(id);
    }
    if (_processedMsgIds.has(msgId)) return true;
    _processedMsgIds.set(msgId, now);
    return false;
  }

  /* ── SSE broadcast ──────────────────────────────────────── */
  async function broadcastWAStatus() {
    try {
      const { broadcastToStore } = await import("./sse");
      broadcastToStore(storeId, "wa_status", {
        state: _waState,
        phone: _phoneNumber,
        qr: _qrDataUrl,
        ts: Date.now(),
      });
    } catch { /* sse not ready yet */ }
  }

  /* ── Clear session files ────────────────────────────────── */
  async function clearSessionFiles() {
    try {
      await fs.rm(AUTH_DIR, { recursive: true, force: true });
      console.log(`[WA:${storeId}] Session files deleted — fresh QR will be generated.`);
    } catch (e: any) {
      console.warn(`[WA:${storeId}] Could not delete session files:`, e.message);
    }
  }

  /* ── Schedule reconnect ─────────────────────────────────── */
  function scheduleReconnect(delayMs = 3000) {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      connectToWhatsApp().catch(e => console.error(`[WA:${storeId}] Reconnect failed:`, e.message));
    }, delayMs);
  }

  /* ── AI handler dispatcher ──────────────────────────────── */
  async function callAIHandler(convStoreId: number, phone: string, text: string) {
    try {
      const { handleIncomingMessage } = await import("./ai-agent");
      console.log(`[ROUTING:${storeId}] Message from ${phone} | "${text.substring(0, 60)}"`);
      await handleIncomingMessage(convStoreId, phone, text);
    } catch (err: any) {
      console.error(`[WA:${storeId}] AI handler error:`, err.message);
    }
  }

  /* ── Audio transcription ────────────────────────────────── */
  async function transcribeAudio(sock: typeof _sock, msg: any): Promise<string | null> {
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      const routerKey = process.env.OPENROUTER_API_KEY;
      const apiKey = openaiKey || routerKey;
      if (!apiKey) {
        console.warn(`[Whisper:${storeId}] ⚠️ No API key for transcription`);
        return null;
      }
      const baseURL = "https://api.openai.com/v1";
      const effectiveKey = openaiKey || apiKey;

      const buffer = await downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock!.updateMediaMessage });
      if (!buffer || (buffer as Buffer).length === 0) return null;

      const tmpPath = path.join(os.tmpdir(), `wa_audio_${storeId}_${Date.now()}.ogg`);
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

      console.log(`[Whisper:${storeId}] ✅ Transcribed: "${transcription.substring(0, 100)}"`);
      return transcription || null;
    } catch (err: any) {
      console.error(`[Whisper:${storeId}] ❌ Transcription error:`, err.message);
      return null;
    }
  }

  /* ── Main connect function ──────────────────────────────── */
  async function connectToWhatsApp(): Promise<void> {
    if (_isRunning) {
      console.log(`[WA:${storeId}] Connect already in progress — skipping.`);
      return;
    }
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

    _isRunning = true;
    _waState = "connecting";
    console.log(`[WA:${storeId}] Connecting...`);
    await broadcastWAStatus();

    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });
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

      /* ── Connection events ────────────────────────────── */
      _sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            _qrDataUrl = await QRCode.toDataURL(qr, {
              width: 300, margin: 2,
              color: { dark: "#1e1b4b", light: "#ffffff" },
            });
            _waState = "qr";
            console.log(`[WA:${storeId}] QR_READY — waiting for scan`);
            await broadcastWAStatus();
          } catch (e: any) {
            console.error(`[WA:${storeId}] QR generation error:`, e.message);
          }
        }

        if (connection === "connecting") {
          _waState = "connecting";
          console.log(`[WA:${storeId}] Connecting...`);
          await broadcastWAStatus();
        }

        if (connection === "open") {
          _waState = "connected";
          _qrDataUrl = null;
          _isRunning = false;
          _phoneNumber = _sock?.user?.id?.split(":")[0] ?? null;
          console.log(`[WA:${storeId}] Connected — phone: ${_phoneNumber}`);
          await broadcastWAStatus();

          // Update DB session status
          try {
            const { whatsappSessions } = await import("@shared/schema");
            const { eq: drEq } = await import("drizzle-orm");
            const [existing] = await db.select().from(whatsappSessions).where(drEq(whatsappSessions.storeId, storeId));
            if (existing) {
              await db.update(whatsappSessions).set({ status: "connected", phone: _phoneNumber, updatedAt: new Date() }).where(drEq(whatsappSessions.storeId, storeId));
            } else {
              await db.insert(whatsappSessions).values({ storeId, status: "connected", phone: _phoneNumber });
            }
            console.log(`[WA:${storeId}] DB session updated → connected`);
          } catch (e: any) {
            console.warn(`[WA:${storeId}] Could not update session in DB:`, e.message);
          }

          // Flush queued messages
          try {
            const { flushPendingQueue } = await import("./whatsapp-service");
            flushPendingQueue(storeId);
          } catch {}
        }

        if (connection === "close") {
          _isRunning = false;
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`[WA:${storeId}] Disconnected — code: ${statusCode} | loggedOut: ${loggedOut}`);
          _waState = "idle";
          _sock = null;
          _phoneNumber = null;
          await broadcastWAStatus();

          // Update DB
          try {
            const { whatsappSessions } = await import("@shared/schema");
            const { eq: drEq } = await import("drizzle-orm");
            await db.update(whatsappSessions).set({ status: "disconnected", updatedAt: new Date() }).where(drEq(whatsappSessions.storeId, storeId));
          } catch {}

          if (loggedOut) {
            console.log(`[WA:${storeId}] Logged out (401). Clearing session files...`);
            _qrDataUrl = null;
            await clearSessionFiles();
            console.log(`[WA:${storeId}] Will show fresh QR in 3s...`);
            scheduleReconnect(3000);
          } else {
            console.log(`[WA:${storeId}] Reconnecting in 5s...`);
            scheduleReconnect(5000);
          }
        }
      });

      /* ── Incoming messages → AI handler ────────────────── */
      _sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;

          const remoteJid = msg.key.remoteJid ?? "";
          if (remoteJid.endsWith("@g.us")) continue;

          // ── LID resolution ─────────────────────────────
          const isLid = remoteJid.endsWith("@lid");
          let resolvedPhone: string | null = null;

          if (isLid) {
            const lidPrefix = remoteJid.split("@")[0].split(":")[0];
            resolvedPhone = await resolveLidToPhone(lidPrefix);
            if (!resolvedPhone) {
              await new Promise(r => setTimeout(r, 800));
              resolvedPhone = await resolveLidToPhone(lidPrefix);
            }
          }

          const rawPhone = isLid
            ? (resolvedPhone?.replace("+", "") ?? remoteJid.split("@")[0])
            : remoteJid.replace("@s.whatsapp.net", "");
          const phone = resolvedPhone ? normalisePhone(resolvedPhone) : normalisePhone(rawPhone);

          // ── Audio / voice note ─────────────────────────
          const isAudio = !!(msg.message.audioMessage || msg.message.pttMessage);
          let text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.buttonsResponseMessage?.selectedButtonId ||
            msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
            "";

          if (!text.trim() && isAudio) {
            console.log(`[WA:${storeId}] 🎤 Voice note from ${phone} — transcribing...`);
            try {
              const { broadcastToStore: bcast } = await import("./sse");
              bcast(storeId, "audio_received", { phone, ts: Date.now(), status: "transcribing" });
            } catch {}

            const transcription = await transcribeAudio(_sock, msg);
            if (transcription) {
              text = transcription;
              try {
                const { broadcastToStore: bcast } = await import("./sse");
                bcast(storeId, "audio_received", { phone, ts: Date.now(), status: "done", transcription: text });
              } catch {}
            } else {
              console.warn(`[WA:${storeId}] 🎤 Transcription failed — sending fallback`);
              try {
                const { broadcastToStore: bcast } = await import("./sse");
                bcast(storeId, "audio_received", { phone, ts: Date.now(), status: "failed" });
              } catch {}
              text = "[رسالة صوتية]";
            }
          }

          if (!text.trim()) {
            console.log(`[WA:${storeId}] ⏭ Skipping media-only message from ${phone}`);
            continue;
          }

          // ── Deduplication ──────────────────────────────
          const msgId = msg.key.id ?? `${phone}-${text.substring(0, 20)}-${Date.now()}`;
          if (isDuplicateMessage(msgId)) {
            console.log(`[WA:${storeId}] ⏭ Skipping duplicate message ${msgId}`);
            continue;
          }

          console.log(`[INCOMING:${storeId}] "${text.substring(0, 80)}" | from: ${remoteJid}`);

          try {
            const { storage: stor } = await import("./storage");
            const { or: drizzleOr } = await import("drizzle-orm");

            // ── Step 1: Match by stored WhatsApp JID ─────
            const rawJid = remoteJid;
            const jidConv = await stor.getActiveAiConversationByJid(rawJid);
            if (jidConv) {
              console.log(`[WA:${storeId}] ✅ JID match → conv ${jidConv.id}`);
              await callAIHandler(jidConv.storeId, jidConv.customerPhone!, text);
              continue;
            }

            // ── Step 2: Match by normalized phone ─────────
            const phoneVariants = [
              phone,
              `+${phone}`,
              `0${phone.slice(3)}`,
              `+0${phone.slice(3)}`,
            ];
            const normalize = (p: string) => p.replace(/\D/g, "");

            const activeConvs = await db
              .select()
              .from(aiConversations)
              .where(drizzleOr(
                eq(aiConversations.status, "active"),
                eq(aiConversations.status, "confirmed"),
              ));

            const normalizedIncoming = new Set(phoneVariants.map(normalize));
            const matched = activeConvs.filter(c =>
              c.customerPhone && normalizedIncoming.has(normalize(c.customerPhone))
            );

            if (matched.length > 0) {
              console.log(`[WA:${storeId}] ✅ Phone matched to conv(s): ${matched.map(c => c.id).join(", ")}`);
              for (const conv of matched) {
                if (!conv.whatsappJid) {
                  stor.updateConversationJid(conv.id, rawJid).catch(() => {});
                }
                await callAIHandler(conv.storeId, conv.customerPhone!, text);
              }
              continue;
            }

            // ── Step 3: Check if phone has orders in this store ──
            try {
              const hasOrders = await stor.phoneHasOrdersInStore(storeId, phone);
              if (hasOrders) {
                console.log(`[WA:${storeId}] ℹ️ Phone ${phone} has prior orders → auto-starting confirmation`);
                await callAIHandler(storeId, phone, text);
              } else {
                console.log(`[WA:${storeId}] ⏭ Ignoring unknown phone ${phone} — no orders in DB`);
              }
            } catch (routeErr: any) {
              console.error(`[WA:${storeId}] Unknown-phone routing error:`, routeErr.message);
            }

          } catch (err: any) {
            console.error(`[WA:${storeId}] Message routing error:`, err.message);
          }
        }
      });

    } catch (err: any) {
      _isRunning = false;
      console.error(`[WA:${storeId}] Fatal init error:`, err.message);
      _waState = "idle";
      _sock = null;
      await broadcastWAStatus();
      scheduleReconnect(8000);
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    async start(): Promise<void> {
      if (_waState === "connected") {
        console.log(`[WA:${storeId}] Already connected — skipping start.`);
        return;
      }
      if (_isRunning) {
        console.log(`[WA:${storeId}] Already connecting — skipping start.`);
        return;
      }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      await connectToWhatsApp();
    },

    async resetAndRestart(): Promise<void> {
      console.log(`[WA:${storeId}] Force reset — wiping session...`);
      if (_sock) {
        try { _sock.end(undefined); } catch {}
        _sock = null;
      }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _isRunning = false;
      _waState = "idle";
      _qrDataUrl = null;
      _phoneNumber = null;
      await broadcastWAStatus();
      await clearSessionFiles();
      await connectToWhatsApp();
    },

    async logout(): Promise<void> {
      console.log(`[WA:${storeId}] Logout requested.`);
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _isRunning = false;
      if (_sock) {
        try { await _sock.logout(); } catch {}
        try { _sock.end(undefined); } catch {}
        _sock = null;
      }
      _waState = "idle";
      _qrDataUrl = null;
      _phoneNumber = null;
      await broadcastWAStatus();
      await clearSessionFiles();

      // Update DB
      try {
        const { whatsappSessions } = await import("@shared/schema");
        const { eq: drEq } = await import("drizzle-orm");
        await db.update(whatsappSessions).set({ status: "disconnected", phone: null, updatedAt: new Date() }).where(drEq(whatsappSessions.storeId, storeId));
      } catch {}

      console.log(`[WA:${storeId}] Logged out and session cleared.`);
    },

    getStatus(): BaileysStatus {
      return { state: _waState, phone: _phoneNumber, qr: _qrDataUrl };
    },

    async sendMessage(phone: string, text: string): Promise<boolean> {
      if (!_sock || _waState !== "connected") {
        console.warn(`[WA:${storeId}] Cannot send — not connected. State:`, _waState);
        return false;
      }
      try {
        const jid = toJid(phone);
        console.log(`[WA:${storeId}] Sending to JID: ${jid}`);
        await _sock.sendMessage(jid, { text });
        console.log(`[WA:${storeId}] ✅ Message sent to ${jid}`);
        return true;
      } catch (err: any) {
        console.error(`[WA:${storeId}] ❌ Send error to ${phone}:`, err.message);
        return false;
      }
    },

    async sendImage(phone: string, imageUrl: string, caption: string): Promise<boolean> {
      if (!_sock || _waState !== "connected") {
        console.warn(`[WA:${storeId}] Cannot send image — not connected. State:`, _waState);
        return false;
      }
      try {
        const jid = toJid(phone);
        console.log(`[WA:${storeId}] Sending image to JID: ${jid} | ${imageUrl.substring(0, 60)}...`);
        if (imageUrl.startsWith("/uploads/")) {
          const { readFileSync } = await import("fs");
          const buffer = readFileSync(`.${imageUrl}`);
          await _sock.sendMessage(jid, { image: buffer, caption });
        } else {
          await _sock.sendMessage(jid, { image: { url: imageUrl }, caption });
        }
        console.log(`[WA:${storeId}] ✅ Image sent to ${jid}`);
        return true;
      } catch (err: any) {
        console.error(`[WA:${storeId}] ❌ Image send error to ${phone}:`, err.message);
        return false;
      }
    },

    isConnected(): boolean {
      return _waState === "connected";
    },
  };
}

/* ── Factory: get or create a per-store session ─────────────── */
export function getBaileysInstance(storeId: number): BaileysSessionInstance {
  if (!_sessions.has(storeId)) {
    _sessions.set(storeId, createBaileysSession(storeId));
  }
  return _sessions.get(storeId)!;
}

/* ── Backward-compat shim (used by old code during transition) ─ */
export const baileysService = {
  async start() { return getBaileysInstance(1).start(); },
  async resetAndRestart() { return getBaileysInstance(1).resetAndRestart(); },
  async logout() { return getBaileysInstance(1).logout(); },
  getStatus() { return getBaileysInstance(1).getStatus(); },
  async sendMessage(phone: string, text: string) { return getBaileysInstance(1).sendMessage(phone, text); },
  async sendImage(phone: string, imageUrl: string, caption: string) { return getBaileysInstance(1).sendImage(phone, imageUrl, caption); },
  isConnected() { return getBaileysInstance(1).isConnected(); },
  setActiveStoreId(_id: number) { /* no-op in multi-tenant */ },
  getActiveStoreId() { return 1 as number | null; },
};

/* ═══════════════════════════════════════════════════════════════════
   MULTI-DEVICE MANAGER — one Baileys socket per whatsapp_devices row
   Auth dir: auth_info/store_<storeId>/device_<deviceId>/
═══════════════════════════════════════════════════════════════════ */

function getDeviceAuthDir(storeId: number, deviceId: number): string {
  return path.join(MULTI_AUTH_BASE, `store_${storeId}`, `device_${deviceId}`);
}

const _deviceSessions = new Map<number, BaileysSessionInstance>();

function createDeviceSession(deviceId: number, storeId: number): BaileysSessionInstance {
  const AUTH_DIR = getDeviceAuthDir(storeId, deviceId);
  const tag = `DEV:${deviceId}`;

  let _sock: ReturnType<typeof makeWASocket> | null = null;
  let _waState: WAState = "idle";
  let _qrDataUrl: string | null = null;
  let _phoneNumber: string | null = null;
  let _reconnectTimer: NodeJS.Timeout | null = null;
  let _isRunning = false;

  async function persistStatus(status: string, phone?: string | null, qr?: string | null) {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { eq: drEq } = await import("drizzle-orm");
      await db.update(whatsappDevices)
        .set({ status, phone: phone ?? null, qrCode: qr ?? null, updatedAt: new Date() })
        .where(drEq(whatsappDevices.id, deviceId));
    } catch { /* non-fatal */ }
  }

  async function clearSessionFiles() {
    try { await fs.rm(AUTH_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  function scheduleReconnect(delayMs = 5000) {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      connectDevice().catch(e => console.error(`[${tag}] Reconnect failed:`, e.message));
    }, delayMs);
  }

  async function connectDevice(): Promise<void> {
    if (_isRunning) return;
    _isRunning = true;
    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }) as any) },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: [`TajerGrow-D${deviceId}`, "Chrome", "1.0"],
      });
      _sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            _qrDataUrl = await QRCode.toDataURL(qr);
          } catch { _qrDataUrl = null; }
          _waState = "qr";
          await persistStatus("qr", null, _qrDataUrl);
          console.log(`[${tag}] QR ready`);
        }

        if (connection === "connecting") {
          _waState = "connecting";
          await persistStatus("connecting");
          console.log(`[${tag}] Connecting...`);
        }

        if (connection === "open") {
          _waState = "connected";
          _phoneNumber = sock.user?.id?.split(":")[0] ?? null;
          _qrDataUrl = null;
          await persistStatus("connected", _phoneNumber, null);
          console.log(`[${tag}] Connected — phone: ${_phoneNumber}`);
        }

        if (connection === "close") {
          _isRunning = false;
          _sock = null;
          const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          _waState = "disconnected";
          await persistStatus("disconnected");
          console.log(`[${tag}] Disconnected — code: ${code} | loggedOut: ${loggedOut}`);
          if (loggedOut) {
            await clearSessionFiles();
            await persistStatus("disconnected", null, null);
          } else if (code !== 401) {
            scheduleReconnect(5000);
          }
        }
      });
    } catch (err: any) {
      _isRunning = false;
      console.error(`[${tag}] connectDevice error:`, err.message);
      scheduleReconnect(8000);
    }
  }

  return {
    async start() { await connectDevice(); },

    async resetAndRestart() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      try { await _sock?.logout(); } catch { /* ignore */ }
      _sock = null;
      _isRunning = false;
      _waState = "idle";
      _phoneNumber = null;
      _qrDataUrl = null;
      await clearSessionFiles();
      await persistStatus("disconnected", null, null);
      setTimeout(() => connectDevice().catch(console.error), 1000);
    },

    async logout() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      try { await _sock?.logout(); } catch { /* ignore */ }
      _sock = null;
      _isRunning = false;
      _waState = "idle";
      _phoneNumber = null;
      _qrDataUrl = null;
      await clearSessionFiles();
      await persistStatus("disconnected", null, null);
      _deviceSessions.delete(deviceId);
    },

    getStatus(): BaileysStatus {
      return { state: _waState, phone: _phoneNumber, qr: _qrDataUrl };
    },

    async sendMessage(phone: string, text: string): Promise<boolean> {
      if (!_sock || _waState !== "connected") return false;
      try {
        await _sock.sendMessage(`${normalisePhone(phone)}@s.whatsapp.net`, { text });
        return true;
      } catch (err: any) {
        console.error(`[${tag}] Send error:`, err.message);
        return false;
      }
    },

    async sendImage(phone: string, imageUrl: string, caption: string): Promise<boolean> {
      if (!_sock || _waState !== "connected") return false;
      try {
        await _sock.sendMessage(`${normalisePhone(phone)}@s.whatsapp.net`, { image: { url: imageUrl }, caption });
        return true;
      } catch (err: any) {
        console.error(`[${tag}] Image send error:`, err.message);
        return false;
      }
    },

    isConnected(): boolean { return _waState === "connected"; },
  };
}

export function getDeviceInstance(deviceId: number, storeId: number): BaileysSessionInstance {
  if (!_deviceSessions.has(deviceId)) {
    _deviceSessions.set(deviceId, createDeviceSession(deviceId, storeId));
  }
  return _deviceSessions.get(deviceId)!;
}

export function removeDeviceInstance(deviceId: number): void {
  _deviceSessions.delete(deviceId);
}

export async function getConnectedDevicesForStore(storeId: number): Promise<{ id: number; phone: string }[]> {
  const result: { id: number; phone: string }[] = [];
  for (const [deviceId, session] of _deviceSessions) {
    if (session.isConnected()) {
      const status = session.getStatus();
      result.push({ id: deviceId, phone: status.phone ?? "" });
    }
  }
  return result;
}

export async function autoStartDevices(): Promise<void> {
  try {
    const { whatsappDevices } = await import("@shared/schema");
    const devices = await db.select().from(whatsappDevices);
    for (const device of devices) {
      const deviceAuthDir = getDeviceAuthDir(device.storeId, device.id);
      const credsFile = path.join(deviceAuthDir, "creds.json");
      try {
        await fs.access(credsFile);
        console.log(`[WA-AUTO-DEV] Starting device ${device.id} (store ${device.storeId})...`);
        getDeviceInstance(device.id, device.storeId).start().catch(console.error);
      } catch {
        // No creds yet — user hasn't scanned QR
      }
    }
  } catch (e: any) {
    console.log("[WA-AUTO-DEV] No devices to auto-start:", e.message);
  }
}

/* ── Migration: move old auth_info_baileys/ → auth_info/store_N/ ─ */
async function migrateOldSession(): Promise<void> {
  const OLD_DIR = path.join(DATA_DIR, "auth_info_baileys");
  const oldCreds = path.join(OLD_DIR, "creds.json");
  try {
    await fs.access(oldCreds);
    // Determine storeId from DB
    let storeId = 1;
    try {
      const { stores } = await import("@shared/schema");
      const { whatsappSessions } = await import("@shared/schema");
      // Check whatsappSessions first
      const [sess] = await db.select({ storeId: whatsappSessions.storeId }).from(whatsappSessions).limit(1);
      if (sess) storeId = sess.storeId;
    } catch {}

    const newDir = getAuthDir(storeId);
    await fs.mkdir(newDir, { recursive: true });

    const files = await fs.readdir(OLD_DIR);
    for (const file of files) {
      const src = path.join(OLD_DIR, file);
      const dst = path.join(newDir, file);
      try {
        await fs.copyFile(src, dst);
      } catch {}
    }

    // Remove old dir after copy
    await fs.rm(OLD_DIR, { recursive: true, force: true });
    console.log(`[WA-MIGRATE] ✅ Migrated auth_info_baileys/ → auth_info/store_${storeId}/`);
  } catch {
    // No old session to migrate — that's fine
  }
}

/* ── Auto-start: called once on server boot ─────────────────── */
export async function autoStartBaileys(): Promise<void> {
  // 1. Migrate old single-tenant session if it exists
  await migrateOldSession();

  // 2. Scan auth_info/ for all store_N directories with creds.json
  try {
    await fs.mkdir(MULTI_AUTH_BASE, { recursive: true });
    const entries = await fs.readdir(MULTI_AUTH_BASE, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("store_")) continue;
      const storeId = parseInt(entry.name.replace("store_", ""), 10);
      if (isNaN(storeId)) continue;

      const credsFile = path.join(MULTI_AUTH_BASE, entry.name, "creds.json");
      try {
        await fs.access(credsFile);
        console.log(`[WA-AUTO] Starting session for store ${storeId}...`);
        getBaileysInstance(storeId).start().catch(console.error);
      } catch {
        // No creds.json — user hasn't scanned QR for this store yet
      }
    }
  } catch (e: any) {
    console.log("[WA-AUTO] No existing sessions to auto-start:", e.message);
  }
}

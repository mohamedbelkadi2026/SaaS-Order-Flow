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
  disconnect?(): Promise<void>;
  getStatus(): BaileysStatus;
  sendMessage(phone: string, text: string): Promise<boolean>;
  sendImage(phone: string, imageUrl: string, caption: string): Promise<boolean>;
  isConnected(): boolean;
  requestPairingCode(phoneNumber: string): Promise<string>;
}

/* ── Per-store session map ──────────────────────────────────── */
const _sessions = new Map<number, BaileysSessionInstance>();

/* ── Shared Baileys version cache (one network call for all) ── */
type WAVersion = [number, number, number];
let _cachedBaileysVersion: WAVersion | null = null;
let _versionFetchPromise: Promise<WAVersion> | null = null;
async function getCachedVersion(): Promise<WAVersion> {
  if (_cachedBaileysVersion) return _cachedBaileysVersion;
  if (!_versionFetchPromise) {
    _versionFetchPromise = fetchLatestBaileysVersion()
      .then(r => { _cachedBaileysVersion = r.version as WAVersion; _versionFetchPromise = null; return r.version as WAVersion; })
      .catch(() => { _versionFetchPromise = null; return [2, 3000, 1023534] as WAVersion; });
  }
  return _versionFetchPromise;
}

/* ── Connection semaphore (one Baileys socket initialises at a time) ── */
let _connectChain: Promise<void> = Promise.resolve();
function withConnectLock(tag: string, fn: () => Promise<void>): Promise<void> {
  const next = _connectChain
    .then(() => fn())
    .catch(e => console.error(`[WA-LOCK:${tag}]`, e?.message ?? e));
  _connectChain = next.then(() => {}, () => {});
  return next;
}

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

  /**
   * PAIRING CODE STATE
   * isPairingMode         → true while waiting for phone-number confirmation.
   *                         QR generation is fully suppressed in this state.
   * _pairingPhone         → E.164 pure digits (e.g. "212600000000")
   * _pairingCodeRequested → set to true after the FIRST call to
   *                         sock.requestPairingCode so multiple QR events
   *                         (Baileys re-emits every ~20s) don't generate new
   *                         codes that invalidate the previous one.
   * _pairingCodeIssuedAt  → timestamp of last code generation; used to enforce
   *                         a 2-minute cooldown between requests.
   * _pairingCodeResolve / _pairingCodeReject → callbacks that resolve the
   *   promise returned by the public requestPairingCode() method.
   */
  let isPairingMode = false;
  let _pairingPhone: string | null = null;
  let _pairingCodeRequested = false;
  let _pairingCodeIssuedAt = 0;
  let _pairingCodeResolve: ((code: string) => void) | null = null;
  let _pairingCodeReject: ((err: Error) => void) | null = null;

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
      console.log(`[WA:${storeId}] ⚡ Connect already in progress — skipping.`);
      return;
    }
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

    _isRunning = true;
    _waState = "connecting";
    console.log(`[WA:${storeId}] 🔌 Connecting to WhatsApp... (mode: ${isPairingMode ? "PAIRING" : "QR"})`);
    await broadcastWAStatus();

    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const version = await getCachedVersion();
      console.log(`[WA:${storeId}] 📦 Baileys version: ${version.join(".")}`);

      /*
       * Browser identifier — "Ubuntu" + "Chrome" is the most compatible
       * choice for pairing codes. Custom strings have been known to cause
       * WhatsApp to reject pairing codes silently.
       */
      const logger = pino({ level: "silent" }); // suppress Baileys internal noise

      _sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: ["Ubuntu", "Chrome", "22.0.0"],
        syncFullHistory: false,
        getMessage: async () => undefined,
        connectTimeoutMs: 60_000,
        retryRequestDelayMs: 250,
        generateHighQualityLinkPreview: false,
      });

      _sock.ev.on("creds.update", saveCreds);

      /* ── Connection events ────────────────────────────── */
      _sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log(`[WA:${storeId}] 🔄 Connection Update: connection=${connection ?? "(none)"} | qr=${qr ? "YES" : "no"} | mode=${isPairingMode ? "PAIRING" : "QR"}`);

        /* ── QR event ─────────────────────────────────── */
        if (qr) {
          if (isPairingMode) {
            /*
             * ✅ CORRECT MOMENT: Baileys emits a QR event exactly when the
             * socket handshake is complete and the server is ready to receive
             * requestPairingCode(). We call it here instead of showing the QR.
             *
             * IMPORTANT: Baileys re-emits QR every ~20s. The `_pairingCodeRequested`
             * guard ensures we only call requestPairingCode() ONCE — calling it
             * again would generate a new code and INVALIDATE the one the user
             * already received on their screen.
             */
            if (_pairingCodeRequested) {
              console.log(`[WA:${storeId}] 📱 QR re-emit ignored — code already requested, socket staying alive`);
              return;
            }

            _pairingCodeRequested = true;
            console.log(`[WA:${storeId}] 📱 Requesting pairing code for +${_pairingPhone}...`);
            try {
              const rawCode: string = await (_sock as any).requestPairingCode(_pairingPhone!);
              if (!rawCode) throw new Error("WhatsApp n'a renvoyé aucun code");
              const formatted = rawCode.trim().replace(/(.{4})(?=.)/g, "$1-");
              _pairingCodeIssuedAt = Date.now();
              console.log(`[WA:${storeId}] ✅ Code generated: ${formatted} — socket will stay alive until user confirms`);
              if (_pairingCodeResolve) {
                _pairingCodeResolve(formatted);
                _pairingCodeResolve = null;
                _pairingCodeReject  = null;
              }
            } catch (err: any) {
              console.error(`[WA:${storeId}] ❌ requestPairingCode error:`, err.message);
              _pairingCodeRequested = false; // allow retry
              if (_pairingCodeReject) {
                _pairingCodeReject(new Error(err.message ?? "Impossible de générer le code"));
                _pairingCodeResolve = null;
                _pairingCodeReject  = null;
              }
            }
          } else {
            /* Normal QR flow */
            try {
              _qrDataUrl = await QRCode.toDataURL(qr, {
                width: 300, margin: 2,
                color: { dark: "#1e1b4b", light: "#ffffff" },
              });
              _waState = "qr";
              console.log(`[WA:${storeId}] 📷 QR_READY — waiting for scan`);
              await broadcastWAStatus();
            } catch (e: any) {
              console.error(`[WA:${storeId}] QR generation error:`, e.message);
            }
          }
        }

        if (connection === "connecting") {
          if (!isPairingMode) {
            _waState = "connecting";
            await broadcastWAStatus();
          }
        }

        if (connection === "open") {
          const connectedPhone = _sock?.user?.id?.split(":")[0] ?? null;
          _waState = "connected";
          _qrDataUrl = null;
          _isRunning = false;
          isPairingMode = false;
          _pairingPhone = null;
          _pairingCodeRequested = false;
          _pairingCodeResolve = null;
          _pairingCodeReject  = null;
          _phoneNumber = connectedPhone;
          console.log(`[WA:${storeId}] ✅ CONNECTION OPEN — phone: +${_phoneNumber}`);
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
          const wasInPairingMode = isPairingMode;

          console.log(`[WA:${storeId}] Disconnected — code: ${statusCode} | loggedOut: ${loggedOut} | pairingMode: ${wasInPairingMode}`);

          // Reject any pending pairing code promise
          if (_pairingCodeReject) {
            _pairingCodeReject(new Error("Connexion fermée avant la génération du code"));
          }
          isPairingMode = false;
          _pairingPhone = null;
          _pairingCodeRequested = false;
          _pairingCodeResolve = null;
          _pairingCodeReject  = null;

          _waState = "idle";
          _sock = null;
          _phoneNumber = null;
          _qrDataUrl = null;
          await broadcastWAStatus();

          // Update DB
          try {
            const { whatsappSessions } = await import("@shared/schema");
            const { eq: drEq } = await import("drizzle-orm");
            await db.update(whatsappSessions).set({ status: "disconnected", updatedAt: new Date() }).where(drEq(whatsappSessions.storeId, storeId));
          } catch {}

          if (wasInPairingMode) {
            // Code expired or wrong — go to idle, no auto-reconnect (avoids QR loop)
            console.log(`[WA:${storeId}] 📱 Pairing session closed — returning to idle (no auto-reconnect)`);
          } else if (loggedOut) {
            console.log(`[WA:${storeId}] Logged out (401). Clearing session files...`);
            await clearSessionFiles();
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
      if (_pairingCodeReject) {
        _pairingCodeReject(new Error("Réinitialisation forcée"));
      }
      if (_sock) {
        try { _sock.end(undefined); } catch {}
        _sock = null;
      }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _isRunning = false;
      isPairingMode = false;
      _pairingPhone = null;
      _pairingCodeRequested = false;
      _pairingCodeIssuedAt = 0;
      _pairingCodeResolve = null;
      _pairingCodeReject  = null;
      _waState = "idle";
      _qrDataUrl = null;
      _phoneNumber = null;
      await broadcastWAStatus();
      await clearSessionFiles();
      await connectToWhatsApp();
    },

    async logout(): Promise<void> {
      console.log(`[WA:${storeId}] Logout requested.`);
      if (_pairingCodeReject) {
        _pairingCodeReject(new Error("Déconnexion demandée"));
      }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _isRunning = false;
      isPairingMode = false;
      _pairingPhone = null;
      _pairingCodeRequested = false;
      _pairingCodeIssuedAt = 0;
      _pairingCodeResolve = null;
      _pairingCodeReject  = null;
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

    async requestPairingCode(phoneNumber: string): Promise<string> {
      /*
       * ── Step 1: Phone sanitisation ────────────────────────────────────
       * Baileys requires PURE DIGITS only — no +, no spaces, no dashes.
       * Convert Moroccan local format (06XXXXXXXX) to international (212XXXXXXXX).
       */
      let clean = phoneNumber.replace(/\D/g, "");
      if (clean.startsWith("00")) clean = clean.slice(2);        // 00212... → 212...
      if (clean.startsWith("0") && clean.length === 10) {        // 06... (Morocco) → 2126...
        clean = `212${clean.slice(1)}`;
      }
      if (clean.length < 7) {
        throw new Error("Numéro de téléphone invalide — utilisez le format international (ex: +212 6 12 34 56 78)");
      }
      console.log(`[WA:${storeId}] 📱 Requesting pairing code for: +${clean} (raw input: "${phoneNumber}")`);

      if (_waState === "connected") throw new Error("Déjà connecté à WhatsApp");

      /*
       * ── Step 2: 2-minute cooldown guard ───────────────────────────────
       * Prevent spamming the API. A code is valid for ~60s; let 120s pass.
       */
      const COOLDOWN_MS = 120_000;
      const msSinceLastCode = Date.now() - _pairingCodeIssuedAt;
      if (_pairingCodeIssuedAt > 0 && msSinceLastCode < COOLDOWN_MS) {
        const secondsLeft = Math.ceil((COOLDOWN_MS - msSinceLastCode) / 1000);
        throw new Error(`Un code a déjà été généré. Attendez ${secondsLeft}s ou entrez le code affiché.`);
      }

      // Cancel any lingering previous attempt
      if (_pairingCodeReject) {
        _pairingCodeReject(new Error("Nouvel essai demandé"));
        _pairingCodeReject = null;
        _pairingCodeResolve = null;
      }

      /*
       * ── Step 3: Tear down existing socket + clear auth state ──────────
       * CRITICAL: if there are stale credentials in AUTH_DIR from a previous
       * QR scan or failed pairing, WhatsApp will reject the new pairing code.
       * We always start with a completely fresh auth state for pairing.
       */
      if (_sock) {
        console.log(`[WA:${storeId}] 🧹 Tearing down existing socket for fresh pairing session`);
        try { _sock.end(undefined); } catch {}
        _sock = null;
      }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _isRunning = false;
      _qrDataUrl = null;
      _pairingCodeRequested = false;

      // Wipe auth directory → guarantees a clean registration handshake
      console.log(`[WA:${storeId}] 🗑️  Clearing auth state at: ${AUTH_DIR}`);
      try {
        await fs.rm(AUTH_DIR, { recursive: true, force: true });
        await fs.mkdir(AUTH_DIR, { recursive: true });
        console.log(`[WA:${storeId}] ✅ Auth state cleared — starting fresh`);
      } catch (e: any) {
        console.warn(`[WA:${storeId}] ⚠️  Could not clear auth dir:`, e.message);
      }

      /*
       * ── Step 4: Set pairing mode flags BEFORE connecting ──────────────
       * isPairingMode=true suppresses all QR broadcasts in the event handler.
       * The promise resolve/reject are stored so the QR event handler can
       * resolve them once sock.requestPairingCode() returns.
       */
      isPairingMode = true;
      _pairingPhone = clean;

      const codePromise = new Promise<string>((resolve, reject) => {
        _pairingCodeResolve = resolve;
        _pairingCodeReject  = reject;
      });

      /*
       * ── Step 5: Start fresh connection (non-blocking) ─────────────────
       * connectToWhatsApp() creates a new socket. When the socket handshake
       * completes, Baileys emits the first QR event → our handler calls
       * sock.requestPairingCode(clean) at exactly the right moment.
       */
      connectToWhatsApp().catch(e => {
        console.error(`[WA:${storeId}] ❌ pairingCode connect error:`, e.message);
        if (_pairingCodeReject) {
          _pairingCodeReject(new Error(e.message ?? "Erreur de connexion"));
          _pairingCodeResolve = null;
          _pairingCodeReject  = null;
        }
        isPairingMode = false;
        _pairingPhone = null;
        _pairingCodeRequested = false;
      });

      // Race: code arrives via QR event handler OR 45s hard timeout
      const TIMEOUT_MS = 45_000;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Délai dépassé — réessayez dans quelques secondes")), TIMEOUT_MS)
      );

      try {
        const code = await Promise.race([codePromise, timeout]);
        console.log(`[WA:${storeId}] 📬 Code delivered to client: ${code}`);
        return code;
      } catch (err: any) {
        isPairingMode = false;
        _pairingPhone = null;
        _pairingCodeRequested = false;
        _pairingCodeResolve = null;
        _pairingCodeReject  = null;
        console.error(`[WA:${storeId}] ❌ Pairing failed:`, err.message);
        throw new Error(err.message ?? "Impossible de générer le code");
      }
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
  let _heartbeatTimer: NodeJS.Timeout | null = null;
  let _isRunning = false;
  let _connectingAt: number | null = null;

  /* ── SSE broadcast for this device ──────────────────────── */
  async function broadcastDevice() {
    try {
      const { broadcastToStore } = await import("./sse");
      broadcastToStore(storeId, "wa_device_status", {
        deviceId,
        state: _waState,
        phone: _phoneNumber,
        qr: _qrDataUrl,
        ts: Date.now(),
      });
    } catch { /* sse not ready */ }
  }

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

  function clearHeartbeat() {
    if (_heartbeatTimer) { clearTimeout(_heartbeatTimer); _heartbeatTimer = null; }
  }

  function scheduleHeartbeat() {
    clearHeartbeat();
    /* If still "connecting" after 90 s with no QR → assume dead, restart */
    _heartbeatTimer = setTimeout(async () => {
      _heartbeatTimer = null;
      if (_waState === "connecting" && _connectingAt && Date.now() - _connectingAt > 90_000) {
        console.warn(`[${tag}] Heartbeat: stuck connecting for 90 s — restarting`);
        _isRunning = false;
        try { _sock?.end(new Error("heartbeat-timeout")); } catch { /* ignore */ }
        _sock = null;
        _waState = "idle";
        scheduleReconnect(3000);
      }
    }, 95_000);
  }

  function scheduleReconnect(delayMs = 5000) {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      doConnect().catch(e => console.error(`[${tag}] Reconnect failed:`, e.message));
    }, delayMs);
  }

  async function doConnect(): Promise<void> {
    if (_isRunning) {
      console.log(`[${tag}] Already connecting — skipping.`);
      return;
    }
    _isRunning = true;
    _connectingAt = Date.now();

    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      /* Use shared version cache — avoids redundant network calls */
      const version = await getCachedVersion();
      const logger = pino({ level: "error" });

      const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        printQRInTerminal: false,
        logger,
        browser: [`TajerGrow-D${deviceId}`, "Chrome", "1.0"],
        connectTimeoutMs: 40_000,
        retryRequestDelayMs: 500,
        getMessage: async () => undefined,
      });
      _sock = sock;

      scheduleHeartbeat();
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            _qrDataUrl = await QRCode.toDataURL(qr, {
              width: 280, margin: 2,
              color: { dark: "#1e1b4b", light: "#ffffff" },
            });
          } catch { _qrDataUrl = null; }
          _waState = "qr";
          _connectingAt = null;
          clearHeartbeat();
          await persistStatus("qr", null, _qrDataUrl);
          await broadcastDevice();
          console.log(`[${tag}] QR ready`);
        }

        if (connection === "connecting") {
          _waState = "connecting";
          _connectingAt = _connectingAt ?? Date.now();
          await persistStatus("connecting");
          await broadcastDevice();
          console.log(`[${tag}] Connecting...`);
        }

        if (connection === "open") {
          _waState = "connected";
          _phoneNumber = sock.user?.id?.split(":")[0] ?? null;
          _qrDataUrl = null;
          _isRunning = false;
          _connectingAt = null;
          clearHeartbeat();
          await persistStatus("connected", _phoneNumber, null);
          await broadcastDevice();
          console.log(`[${tag}] Connected — phone: ${_phoneNumber}`);
        }

        if (connection === "close") {
          _isRunning = false;
          _sock = null;
          _connectingAt = null;
          clearHeartbeat();
          const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          _waState = "idle";
          await persistStatus("disconnected");
          await broadcastDevice();
          console.log(`[${tag}] Disconnected — code: ${code} | loggedOut: ${loggedOut}`);
          if (loggedOut) {
            await clearSessionFiles();
            await persistStatus("disconnected", null, null);
          } else if (code !== 401) {
            scheduleReconnect(6000);
          }
        }
      });
    } catch (err: any) {
      _isRunning = false;
      _connectingAt = null;
      clearHeartbeat();
      console.error(`[${tag}] connectDevice error:`, err.message);
      scheduleReconnect(10_000);
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    async start() {
      /* Use semaphore so 2nd/3rd device waits for 1st to finish init */
      return withConnectLock(tag, () => doConnect());
    },

    async resetAndRestart() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      clearHeartbeat();
      try { _sock?.end(new Error("reset")); } catch { /* ignore */ }
      _sock = null;
      _isRunning = false;
      _waState = "idle";
      _phoneNumber = null;
      _qrDataUrl = null;
      await clearSessionFiles();
      await persistStatus("disconnected", null, null);
      await broadcastDevice();
      setTimeout(() => withConnectLock(tag, () => doConnect()).catch(console.error), 1500);
    },

    async logout() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      clearHeartbeat();
      try { await _sock?.logout(); } catch { /* ignore */ }
      _sock = null;
      _isRunning = false;
      _waState = "idle";
      _phoneNumber = null;
      _qrDataUrl = null;
      await clearSessionFiles();
      await persistStatus("disconnected", null, null);
      await broadcastDevice();
      _deviceSessions.delete(deviceId);
    },

    /* Disconnect without wiping files (preserves session for next restart) */
    async disconnect() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      clearHeartbeat();
      try { _sock?.end(new Error("user-disconnect")); } catch { /* ignore */ }
      _sock = null;
      _isRunning = false;
      _waState = "idle";
      _connectingAt = null;
      await persistStatus("disconnected");
      await broadcastDevice();
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

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupAuth, ensureSessionTable } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startWooCommerceSync } from "./jobs/woocommerce-sync";
import { startRecoveryJob } from "./recovery-job";
import { initSocket } from "./socket";
import { autoStartBaileys, autoStartDevices } from "./baileys-service";
import { db, initializeDatabase } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

const SUPER_ADMIN_EMAIL = "mehamadchalabi100@gmail.com";

async function ensureSuperAdmin() {
  try {
    const [user] = await db.select().from(users).where(eq(users.email, SUPER_ADMIN_EMAIL));
    if (user && !user.isSuperAdmin) {
      await db.update(users).set({ isSuperAdmin: 1 }).where(eq(users.email, SUPER_ADMIN_EMAIL));
      console.log("[SuperAdmin] isSuperAdmin flag set for", SUPER_ADMIN_EMAIL);
    }
  } catch (e) {
    console.warn("[SuperAdmin] Could not seed super admin:", e);
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// ── Global uncaught exception handler ─────────────────────────────────────────
// Baileys (WhatsApp library) can throw synchronous crypto errors inside WebSocket
// event handlers (e.g. aesDecryptGCM "Unsupported state or unable to authenticate
// data"). These are uncaught exceptions that would otherwise crash the process.
// We catch them here, log them, and let the Baileys reconnect logic handle recovery.
process.on("uncaughtException", (err: Error) => {
  const msg = err?.message ?? String(err);
  // Baileys crypto / WebSocket decode errors — non-fatal, ignore gracefully
  if (
    msg.includes("Unsupported state or unable to authenticate") ||
    msg.includes("aesDecryptGCM") ||
    msg.includes("decodeFrame") ||
    msg.includes("noise-handler")
  ) {
    console.warn("[WA] Baileys crypto error (non-fatal, session will reconnect):", msg);
    return;
  }
  // For all other uncaught exceptions, log and exit so the process manager restarts
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (
    msg.includes("Unsupported state or unable to authenticate") ||
    msg.includes("aesDecryptGCM")
  ) {
    console.warn("[WA] Baileys unhandled rejection (non-fatal):", msg);
    return;
  }
  console.error("[FATAL] Unhandled rejection:", reason);
});

const app = express();
const httpServer = createServer(app);

// ── Trust the Railway / Cloudflare proxy — MUST be first ──────────────────────
// Without this, Express sees every request as HTTP (x-forwarded-proto is ignored),
// causing session cookies to be rejected in production and redirect loops.
app.set("trust proxy", true);

// ── Health probes — synchronous, registered before everything else ─────────────
// Railway checks these immediately on deploy. They must never be blocked
// by Helmet, rate-limiters, body-parsers, auth, or static-file middleware.
app.get("/health",     (_req, res) => res.status(200).send("OK"));
app.get("/api/health", (_req, res) =>
  res.status(200).json({ status: "ok", uptime: process.uptime() })
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const isProduction = process.env.NODE_ENV === "production";

// ── CORS — allow the production domain + Railway previews ─────────────────────
const ALLOWED_ORIGINS = [
  "https://tajergrow.com",
  "https://www.tajergrow.com",
  /https:\/\/.*\.railway\.app$/,
  /https:\/\/.*\.up\.railway\.app$/,
];
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (server-to-server, mobile, curl)
    if (!origin) return callback(null, true);
    const ok = ALLOWED_ORIGINS.some((allowed) =>
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );
    if (ok || !isProduction) {
      callback(null, true);
    } else {
      console.warn("[CORS] Blocked origin:", origin);
      callback(null, false);
    }
  },
  credentials: true,
}));

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: isProduction,
  crossOriginEmbedderPolicy: false,
}));

// ── Brute-force protection on auth endpoints ──────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
});
app.use("/api/auth/login",  authLimiter);
app.use("/api/auth/signup", authLimiter);

// ── Body parsers (MUST come before any route handlers) ───────────────────────
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }),
);
app.use(express.urlencoded({ extended: false }));

// ── Uploaded files served statically ─────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(".");
const uploadsDir = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const p = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (p.startsWith("/api")) {
      let logLine = `${req.method} ${p} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 200)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Register ALL routes BEFORE opening the port ───────────────────────────
  // This guarantees no request can arrive before routes are wired up.
  // (Health probes above are exempt — they're synchronous and always available.)

  // 0. Ensure the sessions table exists in the DB BEFORE setting up auth.
  //    connect-pg-simple's createTableIfMissing is unreliable on first boot;
  //    we do it explicitly so req.login() never fails with "relation not found".
  await ensureSessionTable();

  // ── PUBLIC WEBHOOK ROUTES — registered BEFORE setupAuth/session middleware ──
  // These routes must be reachable by carrier servers (Digylog, etc.) without
  // any authentication or session cookie. Registering them here guarantees
  // passport.session() and requireAuth are NEVER applied to them.

  // Test endpoint: POST /api/debug-webhook — returns 200 with echo of body.
  // Use this to confirm Digylog can reach the server at all.
  app.post("/api/debug-webhook", async (req: Request, res: Response) => {
    const payload = JSON.stringify(req.body, null, 2);
    console.log('[DEBUG-WEBHOOK-TEST]: Hit! Body:', payload);
    try {
      const { storage: st } = await import("./storage");
      await st.createIntegrationLog({
        storeId: 1, integrationId: null, provider: 'debug',
        action: 'webhook_hit', status: 'success',
        message: `🔔 DEBUG-WEBHOOK-TEST reçu — keys: ${Object.keys(req.body || {}).join(', ')}`,
        payload: payload.slice(0, 500),
      });
    } catch (_) { /* non-fatal */ }
    res.json({ received: true, keys: Object.keys(req.body || {}), body: req.body });
  });

  // ── Simplified public Digylog webhook — /api/webhook/digylog/public ─────────
  // No auth, no token, no storeId required. Always returns 200.
  // Use this URL in Digylog webhook settings:
  //   https://<your-domain>/api/webhook/digylog/public
  app.post("/api/webhook/digylog/public", async (req: Request, res: Response) => {
    const rawBody  = JSON.stringify(req.body);
    const bodyKeys = Object.keys(req.body || {}).join(', ') || '(empty)';

    console.log('=== DIGYLOG PUBLIC WEBHOOK ===');
    console.log('Keys:', bodyKeys);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Respond immediately so Digylog doesn't time out
    res.json({ received: true });

    // ── Step 1: Write immediate log (storeId=1 as placeholder) ───────────
    const { storage: st } = await import("./storage");
    try {
      await st.createIntegrationLog({
        storeId: 1, integrationId: null, provider: 'digylog',
        action: 'webhook_received', status: 'success',
        message: `🔔 RAW HIT FROM DIGYLOG — keys: ${bodyKeys}`,
        payload: rawBody.slice(0, 1000),
      });
    } catch (e) {
      console.error('[DigylogPublic:log1-error]', e);
    }

    // ── Step 2: Extract identifiers ───────────────────────────────────────
    const b = req.body || {};
    const incomingTracking = (
      b.tracking || b.barcode || b.tracking_number || b.code_suivi ||
      b.track_number || b.colis_id || b.colis || ""
    ).toString().trim();

    const rawText = (
      b.last_event || b.etat_libelle || b.statut_libelle || b.libelle ||
      b.label      || b.last_status  || b.current_status || b.event_label ||
      b.event      || b.status       || b.etat            || b.statut ||
      b.description || ""
    ).trim() || (
      // body-scan fallback: first string value that looks like a status phrase
      Object.values(b).find((v): v is string =>
        typeof v === 'string' && v.length > 3 &&
        !v.startsWith('http') && v !== incomingTracking
      ) || ""
    );

    if (!incomingTracking) {
      console.warn('[DigylogPublic]: No tracking number found in payload');
      return;
    }

    // ── Step 3: Find order — cross-store, case-insensitive ────────────────
    let order: any;
    try {
      order = await st.getOrderByTrackingNumberAnyStore(incomingTracking);
    } catch (e) {
      console.error('[DigylogPublic:match-error]', e);
      return;
    }

    if (!order) {
      console.warn(`[DigylogPublic]: No order found for tracking="${incomingTracking}"`);
      try {
        await st.createIntegrationLog({
          storeId: 1, integrationId: null, provider: 'digylog',
          action: 'webhook_no_match', status: 'fail',
          message: `⚠️ Commande introuvable — tracking: "${incomingTracking}" | statut: "${rawText}"`,
          payload: rawBody.slice(0, 1000),
        });
      } catch (_) {}
      return;
    }

    // ── Step 4: Map status ────────────────────────────────────────────────
    const rawLow = rawText.toLowerCase();
    let newStatus = "in_progress";
    if (rawLow.includes("livr") || rawLow.includes("distribu")) newStatus = "delivered";
    else if (rawLow.includes("refus") || rawLow.includes("retour") || rawLow.includes("annul")) newStatus = "refused";
    else if (rawLow.includes("injoignable") || rawLow.includes("pas de réponse")) newStatus = "Injoignable";

    // ── Step 5: Update order ──────────────────────────────────────────────
    try {
      await st.updateOrder(order.id, { commentStatus: rawText || incomingTracking });
      await st.updateOrderStatus(order.id, newStatus);
    } catch (e) {
      console.error('[DigylogPublic:update-error]', e);
      return;
    }

    console.log(`[WEBHOOK-SUCCESS]: Updated Order ID ${order.id} (${order.orderNumber}) → status="${newStatus}" commentStatus="${rawText}" tracking="${incomingTracking}"`);

    // ── Step 6: Journal entry + real-time broadcast ───────────────────────
    try {
      await st.createIntegrationLog({
        storeId: order.storeId, integrationId: null, provider: 'digylog',
        action: 'status_update', status: 'success',
        message: `✅ Commande #${order.orderNumber} → "${rawText}" (statut: ${newStatus}) [tracking: ${incomingTracking}]`,
        payload: rawBody.slice(0, 1000),
      });
    } catch (_) {}

    try {
      const { broadcastToStore } = await import("./sse");
      broadcastToStore(order.storeId, "order_updated", {
        orderId: order.id, status: newStatus, commentStatus: rawText,
      });
    } catch (_) {}
  });

  // Early carrier webhook logger — fires BEFORE any route handler in routes.ts.
  // Writes an immediate DB log entry so it appears in the Journal tab even if
  // the order-matching logic later fails. Calls next() to hand off to routes.ts.
  app.post("/api/webhooks/carrier/:storeId/:carrierName", async (req: Request, res: Response, next: NextFunction) => {
    console.log('=== CARRIER WEBHOOK EARLY HANDLER ===');
    console.log('Params:', req.params);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const storeId = Number(req.params.storeId);
    const carrier = req.params.carrierName || 'unknown';
    const keys    = Object.keys(req.body || {}).join(', ') || '(empty)';

    if (!isNaN(storeId) && storeId > 0) {
      try {
        const { storage: st } = await import("./storage");
        await st.createIntegrationLog({
          storeId, integrationId: null, provider: carrier,
          action: 'webhook_hit', status: 'success',
          message: `🔔 DEBUG: Webhook Hit — carrier: ${carrier} — keys: ${keys}`,
          payload: JSON.stringify(req.body).slice(0, 500),
        });
      } catch (e) {
        console.error('[EarlyWebhook:log-error]', e);
      }
    } else {
      console.warn('[EarlyWebhook]: storeId invalide ou manquant:', req.params.storeId);
    }

    next(); // pass to the real handler registered in routes.ts
  });

  // 0b. Debug/diagnostic endpoint — useful for Railway log inspection
  app.get("/api/debug", async (_req, res) => {
    try {
      const dbResult = await import("./db").then(m => m.pool.query("SELECT NOW() AS now, current_database() AS db"));
      res.json({
        status: "ok",
        time: dbResult.rows[0].now,
        database: dbResult.rows[0].db,
        node: process.version,
        env: process.env.NODE_ENV,
        sessionSecret: process.env.SESSION_SECRET ? "SET" : "MISSING (using random fallback)",
        databaseUrl: process.env.DATABASE_URL
          ? process.env.DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@")
          : "NOT SET",
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // 0. Startup DB migrations — ensures critical tables exist on Railway prod
  await initializeDatabase();

  // 1. Auth middleware + login/logout/signup/user routes
  setupAuth(app);
  console.log("[Startup] Auth routes registered (/api/auth/login, /api/auth/signup, ...)");

  // 1b. Initialize Socket.io (must be before routes so emit helpers are ready)
  initSocket(httpServer);

  // 2. All other API routes
  await registerRoutes(httpServer, app);
  console.log("[Startup] API routes registered");

  // 3. Global error handler (must come after routes, before static)
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isProd = process.env.NODE_ENV === "production";

    // Always log full details — stack trace is critical for Railway debugging
    console.error(`[SERVER_ERROR] status=${status} message=${err.message}`);
    if (err.stack) console.error(err.stack);

    if (res.headersSent) return next(err);

    const message = isProd && status === 500
      ? "Une erreur s'est produite. Veuillez réessayer."
      : (err.message || "Internal Server Error");

    return res.status(status).json({ message });
  });

  // 4. Static file serving + React Router catch-all (must be LAST)
  if (isProduction) {
    serveStatic(app);
    console.log("[Startup] Static file serving enabled (production)");
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── NOW open the port — all routes are ready ──────────────────────────────
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise<void>((resolve) =>
    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      console.log(`HEALTHCHECK_READY: Port ${port} is now open.`);
      log(`serving on port ${port}`);
      resolve();
    })
  );

  // ── Background jobs — start after port is open ────────────────────────────
  await ensureSuperAdmin();
  startWooCommerceSync();
  startRecoveryJob();
  autoStartBaileys().catch(console.error);
  autoStartDevices().catch(console.error);
})();

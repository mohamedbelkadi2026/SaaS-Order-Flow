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
import { db, pool, initializeDatabase } from "./db";
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

// ── Shared interval registry — used for graceful shutdown ─────────────────────
const intervals: NodeJS.Timeout[] = [];

// ── Global uncaught exception handler ─────────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  const msg = err?.message ?? String(err);
  if (
    msg.includes("Unsupported state or unable to authenticate") ||
    msg.includes("aesDecryptGCM") ||
    msg.includes("decodeFrame") ||
    msg.includes("noise-handler") ||
    msg.includes("Connection Closed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("EPIPE") ||
    msg.includes("read ECONNRESET")
  ) {
    console.warn("[Non-fatal error, continuing]:", msg);
    return;
  }
  console.error("[FATAL] Uncaught exception:", err);
  // Log only — do not exit. Let the process manager decide.
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[UnhandledRejection — continuing]:", msg);
});

// ── Graceful shutdown on SIGTERM / SIGINT ─────────────────────────────────────
const app = express();
const httpServer = createServer(app);

process.on("SIGTERM", () => {
  console.log("[Shutdown] SIGTERM received — closing gracefully...");
  intervals.forEach(clearInterval);
  httpServer.close(() => {
    console.log("[Shutdown] HTTP server closed");
    pool.end(() => {
      console.log("[Shutdown] DB pool closed");
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error("[Shutdown] Forced exit after 15s");
    process.exit(1);
  }, 15000);
});

process.on("SIGINT", () => {
  intervals.forEach(clearInterval);
  httpServer.close(() => process.exit(0));
});

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

// ── Global request timeout — 25s max (Cloudflare 524 / Railway hang protection) ──
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') return next();
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[TIMEOUT] ${req.method} ${req.path} timed out after 25s`);
      res.status(504).json({ message: 'Request timeout' });
    }
  }, 25000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ── Cloudflare 524 prevention — keepalive headers ─────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=60');
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
      b.traking || b.tracking || b.barcode || b.tracking_number || b.code_suivi ||
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

  // ── Early Shopify webhook pre-flight logger ────────────────────────────────
  // Registered BEFORE setupAuth so session/passport middleware never touches it.
  // Logs the raw hit immediately (for Railway log visibility) then calls next()
  // to hand off processing to the full handler registered in routes.ts.
  app.post("/api/webhooks/shopify/order/:webhookKey", async (req: Request, res: Response, next: NextFunction) => {
    console.log('--- NEW SHOPIFY WEBHOOK ARRIVED ---');
    console.log('Key:', req.params.webhookKey);
    console.log('Topic:', req.headers['x-shopify-topic'] || 'n/a');
    console.log('Body:', JSON.stringify(req.body));
    next(); // hand off to the real handler in routes.ts
  });

  // ── Canonical public URL endpoint — used by frontend to generate correct webhook URLs ──
  app.get("/api/system/public-url", (_req, res) => {
    // Railway sets RAILWAY_PUBLIC_DOMAIN; fall back to custom domain then localhost
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const customDomain = process.env.APP_PUBLIC_URL;
    const publicUrl = railwayDomain
      ? `https://${railwayDomain}`
      : customDomain
      ? customDomain
      : null; // null → frontend uses window.location.origin
    res.json({ publicUrl });
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

  // ── DB keepalive — ping every 4 min to prevent idle connection drops ─────
  const dbKeepalive = setInterval(async () => {
    try {
      await pool.query("SELECT 1");
    } catch (err: any) {
      console.error("[Keepalive] DB ping failed:", err.message);
    }
  }, 4 * 60 * 1000);
  intervals.push(dbKeepalive);

  // ── Background jobs — start after port is open ────────────────────────────
  await ensureSuperAdmin();
  startWooCommerceSync(intervals);
  startRecoveryJob(intervals);

  // ── Auto Digylog status sync ───────────────────────────────────────────────
  async function runDigylogSync(label: string) {
    try {
      const { storage: st } = await import('./storage');
      const { trackDigylogShipment } = await import('./services/carrier-service');
      const { db: dbInst } = await import('./db');
      const { carrierAccounts: caTable } = await import('@shared/schema');
      const { eq: eqFn } = await import('drizzle-orm');

      const accounts = await dbInst.select().from(caTable)
        .where(eqFn(caTable.carrierName, 'digylog'));

      for (const account of accounts) {
        const storeId = (account as any).storeId;
        const apiKey  = (account as any).apiKey;
        const allOrders = await st.getOrdersByStore(storeId);
        const toSync = allOrders.filter((o: any) =>
          o.shippingProvider === 'digylog' &&
          o.trackNumber &&
          !['delivered', 'refused', 'Retour Recu'].includes(o.status || '')
        );
        if (!toSync.length) continue;

        console.log(`[AUTO-SYNC][${label}] store=${storeId}: syncing ${toSync.length} orders`);
        for (const order of toSync) {
          const result = await trackDigylogShipment(order.trackNumber!, apiKey);
          if (result.status && result.status !== order.status) {
            await st.updateOrderStatus(order.id, result.status);
            await st.updateOrder(order.id, { commentStatus: result.rawStatus || result.status });

            // Auto-set shippingCost when delivered
            if (result.status === 'delivered') {
              const fee = (account as any).deliveryFee || 0;
              if (fee > 0) {
                await st.updateOrder(order.id, { shippingCost: fee });
              }
            }

            await st.createOrderFollowUpLog({
              orderId: order.id,
              agentId: null,
              agentName: 'Digylog Auto-Sync',
              note: `📦 Statut mis à jour automatiquement: ${result.rawStatus} → ${result.status}`,
            });
            console.log(`[AUTO-SYNC][${label}] Order #${(order as any).orderNumber} → ${result.rawStatus} (${result.status})`);
            try {
              const { broadcastToStore } = await import('./sse');
              broadcastToStore(storeId, 'order_updated', {
                orderId: order.id,
                status: result.status,
                commentStatus: result.rawStatus,
              });
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error(`[AUTO-SYNC][${label}] Error:`, err?.message);
    }
  }

  // Run once after 2 minutes on startup, then every 15 minutes
  setTimeout(() => runDigylogSync('initial'), 2 * 60 * 1000);
  const autoDigylogSync = setInterval(() => runDigylogSync('interval'), 15 * 60 * 1000);
  intervals.push(autoDigylogSync);

  setTimeout(() => {
    autoStartBaileys().catch(err =>
      console.error('[Baileys] autoStart failed (non-fatal):', err.message)
    );
  }, 30000); // wait 30s after server starts

  setTimeout(() => {
    autoStartDevices().catch(err =>
      console.error('[Devices] autoStart failed (non-fatal):', err.message)
    );
  }, 35000); // wait 35s after server starts

  // ── WA queue guard — clear every 5 min unconditionally ──────────────────────
  setInterval(() => {
    try {
      const { clearQueue } = require('./baileys-service');
      clearQueue?.();
    } catch {}
  }, 5 * 60 * 1000); // clear queue every 5 min

  // ── Memory monitor — log every 2 min, GC + clear WA queue if heap > 400 MB ──
  setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssM = Math.round(mem.rss / 1024 / 1024);
    console.log(`[Memory] Heap: ${heapUsedMB}MB RSS: ${rssM}MB`);
    if (heapUsedMB > 400) {
      console.warn(`[Memory] High memory ${heapUsedMB}MB — clearing WA queue`);
      if (global.gc) global.gc();
      try {
        const { clearQueue } = require('./whatsapp-service');
        clearQueue?.();
      } catch {}
    }
  }, 2 * 60 * 1000);
})();

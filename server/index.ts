import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startWooCommerceSync } from "./jobs/woocommerce-sync";
import { startRecoveryJob } from "./recovery-job";
import { autoStartBaileys } from "./baileys-service";
import { db } from "./db";
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

const app = express();
const httpServer = createServer(app);

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

  // 1. Auth middleware + login/logout/signup/user routes
  setupAuth(app);
  console.log("[Startup] Auth routes registered (/api/auth/login, /api/auth/signup, ...)");

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
})();

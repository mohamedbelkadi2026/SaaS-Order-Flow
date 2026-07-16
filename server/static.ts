import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  // ESM-safe __dirname: resolves to the directory of the running bundle (dist/)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // ── PWA: service worker — must be served before generic static middleware ──
  // Browsers require sw.js to have no long-term cache (each navigation checks
  // for a new version) and the Service-Worker-Allowed header to set scope to /.
  const swPath = path.resolve(distPath, "sw.js");
  if (fs.existsSync(swPath)) {
    app.get("/sw.js", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Service-Worker-Allowed", "/");
      res.sendFile(swPath);
    });
  }

  // ── PWA: manifest — explicit route so it always returns the right MIME type ─
  const manifestPath = path.resolve(distPath, "site.webmanifest");
  if (fs.existsSync(manifestPath)) {
    app.get("/site.webmanifest", (_req, res) => {
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(manifestPath);
    });
  }

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));

  // Catch-all for React Router — GET only, never intercept /api/* paths.
  // This MUST be last so all API routes registered before this take priority.
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

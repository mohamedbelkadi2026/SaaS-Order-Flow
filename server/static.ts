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

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));

  // Catch-all for React Router — GET only, never intercept /api/* paths.
  // This MUST be last so all API routes registered before this take priority.
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

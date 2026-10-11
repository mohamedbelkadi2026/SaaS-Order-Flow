import type { Express } from "express";
import { ExpressRelaisClient } from "./integrations/express-relais";

export function registerExpressRelaisRoutes(app: Express) {
  app.post("/api/shipping/expressrelais/test", async (req, res) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ ok: false, message: "Connexion requise" });
    const login = typeof req.body?.login === "string" ? req.body.login.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!login || !password) return res.status(400).json({ ok: false, message: "Login et mot de passe requis" });
    try {
      const client = new ExpressRelaisClient({ login, password, environment: "prod" });
      const info = await client.testConnection();
      return res.json({ ok: true, message: "Connexion Express Relais réussie", account: info });
    } catch (error: any) {
      const upstreamStatus = Number(error?.status) || null;
      const wafBlocked = String(error?.message || "").includes("EXPRESS_RELAIS_WAF_BLOCKED");
      const reason = wafBlocked ? "cloudflare_waf" : upstreamStatus === 401 ? "invalid_credentials" : upstreamStatus === 403 ? "access_denied" : "upstream_error";
      console.warn("[ExpressRelais-ConnectionTest]", { reason, upstreamStatus });
      const message = wafBlocked
        ? "Cloudflare bloque les requêtes sortantes de ce serveur. Vérifiez l'autorisation des IPs Railway auprès d'Express Relais."
        : upstreamStatus === 401 ? "Identifiants Express Relais refusés (HTTP 401)."
        : upstreamStatus === 403 ? "Accès Express Relais refusé (HTTP 403). Vérifiez les droits API et les IPs autorisées."
        : "Connexion Express Relais impossible. Consultez les logs du serveur.";
      return res.status(wafBlocked ? 502 : upstreamStatus === 401 ? 401 : upstreamStatus === 403 ? 403 : 502).json({ ok: false, reason, upstreamStatus, message });
    }
  });
}

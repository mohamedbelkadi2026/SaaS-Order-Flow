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
      const status = error?.status === 401 || error?.status === 403 ? 400 : 502;
      return res.status(status).json({ ok: false, message: error?.status === 401 || error?.status === 403 ? "Accès refusé : vérifiez vos identifiants et l'IP autorisée." : "Impossible de joindre Express Relais. Vérifiez l'accès réseau et les identifiants." });
    }
  });
}

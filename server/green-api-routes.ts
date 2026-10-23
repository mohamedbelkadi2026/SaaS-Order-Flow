import type { Express, RequestHandler } from "express";
import { greenApiGet, GreenApiError } from "./green-api";

type SettingsStore = {
  getAiSettings(storeId: number): Promise<{ greenApiInstanceId?: string | null; greenApiApiToken?: string | null } | undefined>;
};

export function registerGreenApiRoutes(app: Express, requireAuth: RequestHandler, storage: SettingsStore) {
  async function credentials(req: any) {
    const storeId = req.user?.storeId;
    if (!storeId) throw new GreenApiError("Magasin introuvable.", 403);
    const saved = await storage.getAiSettings(storeId);
    const suppliedId = req.body?.instanceId;
    const suppliedToken = req.body?.apiToken;
    if ((suppliedId !== undefined && typeof suppliedId !== "string") ||
        (suppliedToken !== undefined && typeof suppliedToken !== "string")) {
      throw new GreenApiError("Identifiants Green API invalides.", 400);
    }
    const instanceId = suppliedId?.trim() || saved?.greenApiInstanceId?.trim() || "";
    // A saved token may only be reused for the same instance of this store.
    const apiToken = suppliedToken?.trim() ||
      (instanceId === saved?.greenApiInstanceId?.trim() ? saved?.greenApiApiToken?.trim() : "") || "";
    if (!instanceId || !apiToken) throw new GreenApiError("Entrez Instance ID et API Token pour ce magasin.", 400);
    if (!/^\d{4,20}$/.test(instanceId) || /\s/.test(apiToken) || apiToken.length > 512) {
      throw new GreenApiError("Identifiants Green API invalides.", 400);
    }
    return { instanceId, apiToken };
  }

  const handler = (kind: "test" | "qr" | "status") => async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    try {
      const { instanceId, apiToken } = await credentials(req);
      const data = await greenApiGet(instanceId, apiToken, kind === "qr" ? "qr" : "getStateInstance");
      if (kind === "qr") {
        if (data.type === "alreadyLogged") return res.json({ ok: true, alreadyLogged: true });
        if (data.type === "qrCode" && typeof data.message === "string" && data.message) {
          return res.json({ ok: true, qrBase64: data.message });
        }
        return res.json({ ok: false, message: data.type === "timeout"
          ? "QR code expiré. Cliquez à nouveau pour le renouveler."
          : "QR code indisponible. Vérifiez l'état de l'instance dans Green API." });
      }
      if (typeof data.stateInstance !== "string") throw new GreenApiError("Réponse Green API invalide.");
      const status = data.stateInstance;
      return res.json({ ok: status === "authorized", status, message: status === "authorized"
        ? "WhatsApp connecté avec succès."
        : status === "notAuthorized" ? "WhatsApp non connecté. Scannez le QR code."
        : "WhatsApp n'est pas prêt. Vérifiez l'état de l'instance dans Green API." });
    } catch (error) {
      return res.status(error instanceof GreenApiError ? error.status : 500).json({
        ok: false, message: error instanceof GreenApiError ? error.message : "Impossible de vérifier la connexion Green API.",
      });
    }
  };
  app.post("/api/automation/green-api-test", requireAuth, handler("test"));
  app.post("/api/automation/green-api-qr", requireAuth, handler("qr"));
  app.get("/api/automation/whatsapp/green-status", requireAuth, handler("status"));
}

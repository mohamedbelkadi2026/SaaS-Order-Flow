import type { Express, RequestHandler } from "express";
import { greenApiGet, greenApiRequest, GreenApiError } from "./green-api";

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

  // Short, bounded cache coalesces polling across tabs without storing chat history in the DB.
  const inboxCache = new Map<string, { expires: number; promise: Promise<any> }>();
  async function cached(key: string, ttl: number, fetcher: () => Promise<any>) {
    const existing = inboxCache.get(key);
    if (existing && existing.expires > Date.now()) return existing.promise;
    if (inboxCache.size >= 500) inboxCache.delete(inboxCache.keys().next().value!);
    const entry = { expires: Date.now() + ttl, promise: fetcher() };
    inboxCache.set(key, entry);
    try { return await entry.promise; }
    catch (error) { if (inboxCache.get(key) === entry) inboxCache.delete(key); throw error; }
  }
  const validChatId = (id: unknown): id is string => typeof id === "string" && /^\d[\d-]{3,79}@(c\.us|g\.us|lid)$/.test(id);
  const inboxHandler = (kind: "chats" | "messages" | "send" | "sync") => async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    try {
      // Inbox always uses this store's saved account, never credentials supplied by the client.
      const { instanceId, apiToken } = await credentials({ user: req.user });
      const prefix = `${req.user.storeId}:${instanceId}:${apiToken}:`;
      if (kind === "sync") {
        const result = await greenApiRequest(instanceId, apiToken, "setSettings", {
          incomingWebhook: "yes", outgoingMessageWebhook: "yes", outgoingAPIMessageWebhook: "yes", outgoingWebhook: "yes",
        });
        if (result.saveSettings !== true) throw new GreenApiError("La synchronisation n'a pas été activée.");
        inboxCache.forEach((_entry, key) => { if (key.startsWith(prefix)) inboxCache.delete(key); });
        return res.json({ ok: true });
      }
      if (kind === "chats") {
        const chats = await cached(prefix + "chats", 30_000, async () => {
          const data = await greenApiRequest(instanceId, apiToken, "getChats");
          if (!Array.isArray(data)) throw new GreenApiError("Liste des discussions Green API invalide.");
          return data.filter(chat => validChatId(chat?.id)).map(chat => ({
            id: chat.id, name: typeof chat.name === "string" ? chat.name : chat.id.split("@")[0],
            type: chat.type === "group" ? "group" : "user", archive: !!chat.archive,
            unreadCount: Number.isFinite(chat.unreadCount) ? chat.unreadCount : 0,
          }));
        });
        return res.json({ chats });
      }
      const chatId = kind === "messages" ? req.query?.chatId : req.body?.chatId;
      if (!validChatId(chatId)) throw new GreenApiError("Discussion WhatsApp invalide.", 400);
      if (kind === "send") {
        const message = req.body?.message;
        if (typeof message !== "string" || !message.trim() || message.length > 20000) throw new GreenApiError("Message invalide.", 400);
        const result = await greenApiRequest(instanceId, apiToken, "sendMessage", { chatId, message: message.trim() });
        if (typeof result.idMessage !== "string") throw new GreenApiError("L'envoi du message n'a pas été confirmé.");
        inboxCache.delete(prefix + chatId);
        inboxCache.delete(prefix + "chats");
        return res.json({ ok: true, idMessage: result.idMessage });
      }
      const messages = await cached(prefix + chatId, 10_000, async () => {
        const data = await greenApiRequest(instanceId, apiToken, "getChatHistory", { chatId, count: 100 });
        if (!Array.isArray(data)) throw new GreenApiError("Historique Green API invalide.");
        return data.filter(message => message && message.chatId === chatId).map(message => ({
          id: message.idMessage, timestamp: Number(message.timestamp) || 0,
          outgoing: message.type === "outgoing", type: message.typeMessage,
          text: message.isDeleted ? "Message supprimé" : (message.textMessage || message.extendedTextMessage?.text || message.caption || ""),
          senderName: message.senderContactName || message.senderName || "",
          mediaUrl: !message.isDeleted && typeof message.downloadUrl === "string" && /^https:\/\//.test(message.downloadUrl) ? message.downloadUrl : null,
          fileName: message.fileName || "Fichier", status: message.statusMessage || null,
        })).sort((a, b) => a.timestamp - b.timestamp);
      });
      return res.json({ messages });
    } catch (error) {
      return res.status(error instanceof GreenApiError ? error.status : 500).json({
        message: error instanceof GreenApiError ? error.message : "Impossible de charger WhatsApp.",
      });
    }
  };
  app.get("/api/automation/whatsapp/chats", requireAuth, inboxHandler("chats"));
  app.get("/api/automation/whatsapp/messages", requireAuth, inboxHandler("messages"));
  app.post("/api/automation/whatsapp/messages", requireAuth, inboxHandler("send"));
  app.post("/api/automation/whatsapp/sync", requireAuth, inboxHandler("sync"));
}

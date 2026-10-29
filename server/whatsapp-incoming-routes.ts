import { getMetaConnection } from "./meta-whatsapp-service";
import type { Express } from "express";
import { db } from "./db";
import { aiConversations } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { findGreenApiStore, getStoreGreenCredentials } from "./green-api-tenant";
import { handleIncomingMessage } from "./ai-agent";

export function registerWhatsappIncomingRoutes(app: Express) {
  app.post("/api/webhooks/whatsapp-incoming", async (req, res) => {
    res.status(200).json({ ok: true });
    try {
      const body = req.body;
      if (body?.typeWebhook !== "incomingMessageReceived") return;
      const instanceId = String(body?.instanceData?.idInstance ?? "").trim();
      const storeId = await findGreenApiStore(instanceId);
      if (!storeId || !await getStoreGreenCredentials(storeId) || await getMetaConnection(storeId)) return;
      const sender = body.senderData?.sender;
      if (typeof sender !== "string" || !/^\d+@c\.us$/.test(sender)) return;
      const digits = sender.replace("@c.us", "");
      const selection = body.messageData?.buttonsResponseMessage || body.messageData?.templateButtonReplyMessage;
      const labels: Record<string, string> = { confirm: "تأكيد الطلب", cancel: "إلغاء الطلب", edit: "بغيت نعدل معلومات الطلب" };
      const text = labels[selection?.selectedButtonId || selection?.selectedId] || selection?.selectedButtonText || selection?.selectedDisplayText || body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
      if (typeof text !== "string" || !text.trim()) return;
      const [conv] = await db.select({ customerPhone: aiConversations.customerPhone }).from(aiConversations).where(and(
        eq(aiConversations.storeId, storeId), eq(aiConversations.status, "active"),
        sql`regexp_replace(regexp_replace(${aiConversations.customerPhone}, '[^0-9]', '', 'g'), '^0', '212') = ${digits}`,
      )).limit(1);
      await handleIncomingMessage(storeId, conv?.customerPhone || `+${digits}`, text);
    } catch {
      console.error("[WA Webhook] Unable to process incoming message for its linked store");
    }
  });
}

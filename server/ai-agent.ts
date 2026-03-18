import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage } from "./whatsapp-service";

const DEFAULT_PROMPT = `أنت وكيل خدمة عملاء محترف مغربي. تتحدث بالدارجة المغربية فقط.
مهمتك هي تأكيد تفاصيل الطلب (الاسم، المدينة، المقاس إن وجد) مع الزبون على واتساب.
كون مؤدب وودود وطبيعي. لا تذكر أنك روبوت.
إذا قال الزبون "نعم" أو "واخا" أو "صيفطوه" أو "اه" — أخبره أن الطلب مؤكد وفي الطريق إليه.
إذا قال "لا" أو "نلغي" أو "ما بغيتش" — أخبره أن الطلب تلغى وشكره.`;

const CONFIRM_KEYWORDS = [
  "نعم", "صيفطوه", "صافي", "واخا", "wakha", "اه", "آه", "oui", "yes", "confirm",
  "مزيان", "كنقبل", "يعطيك الصحة", "مؤكد", "تأكيد", "ok", "okay", "d'accord",
];
const CANCEL_KEYWORDS = [
  "لا", "non", "no", "cancel", "annuler", "نلغي", "ما كنقبلش", "ما بغيتش",
  "إلغاء", "الغ", "annulé",
];

function detectIntent(msg: string): "confirm" | "cancel" | null {
  const lower = msg.toLowerCase().trim();
  if (CONFIRM_KEYWORDS.some((kw) => lower.includes(kw))) return "confirm";
  if (CANCEL_KEYWORDS.some((kw) => lower.includes(kw))) return "cancel";
  return null;
}

async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY non configuré");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Called when a new order arrives — starts the AI conversation */
export async function triggerAIForNewOrder(
  storeId: number,
  orderId: number,
  customerPhone: string,
  customerName: string,
  productId?: number | null,
) {
  if (!process.env.OPENAI_API_KEY) return;

  const settings = await storage.getAiSettings(storeId);
  if (!settings?.enabled) return;

  // Check if this product is AI-enabled
  const enabledIds: number[] = settings.enabledProductIds ?? [];
  if (enabledIds.length > 0 && productId && !enabledIds.includes(productId)) return;

  // Create conversation record
  const conv = await storage.createAiConversation({
    storeId, orderId, customerPhone, customerName: customerName || null,
    status: "active", isManual: 0,
  });

  const systemPrompt = settings.systemPrompt || DEFAULT_PROMPT;
  let firstMessage: string;

  try {
    const ai = await getOpenAI();
    const completion = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `الزبون اسمه ${customerName}، أرسل له أول رسالة لتأكيد الطلب رقم ${orderId}.` },
      ],
      max_tokens: 200,
    });
    firstMessage = completion.choices[0]?.message?.content ?? `مرحبا ${customerName}، وصلنا طلبك. واش تقدر تأكد لينا؟`;
  } catch (err: any) {
    console.error("[AI] GPT error on first message:", err.message);
    firstMessage = `مرحبا ${customerName}! وصلنا طلبك 🎉 واش تأكد لينا؟`;
  }

  await storage.createAiLog({ storeId, orderId, customerPhone, role: "assistant", message: firstMessage });
  await storage.updateAiConversationLastMessage(conv.id, firstMessage);

  broadcastToStore(storeId, "new_conversation", {
    conversation: { ...conv, lastMessage: firstMessage },
    message: { role: "assistant", content: firstMessage, ts: Date.now() },
  });

  await sendWhatsAppMessage(customerPhone, firstMessage);
}

/** Called when a WhatsApp message is received from a customer */
export async function handleIncomingMessage(
  storeId: number,
  customerPhone: string,
  customerMessage: string,
) {
  if (!process.env.OPENAI_API_KEY) return;

  // Find active conversation for this phone
  const conv = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
  if (!conv) return; // No active conversation

  // If admin took manual control, don't respond
  if (conv.isManual === 1) {
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
    await storage.updateAiConversationLastMessage(conv.id, customerMessage);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });
    return;
  }

  // Log customer message
  await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
  await storage.updateAiConversationLastMessage(conv.id, customerMessage);
  broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });

  // Detect intent
  const intent = detectIntent(customerMessage);

  if (intent === "confirm" && conv.orderId) {
    await storage.updateOrderStatus(conv.orderId, "confirme");
    await storage.updateAiConversationStatus(conv.id, "confirmed");
    const msg = "بارك الله فيك! طلبك تأكد ✅ غادي يوصلك قريبا إن شاء الله 🚀";
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
    await storage.updateAiConversationLastMessage(conv.id, msg);
    broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now() });
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
    await sendWhatsAppMessage(customerPhone, msg);
    return;
  }

  if (intent === "cancel" && conv.orderId) {
    await storage.updateOrderStatus(conv.orderId, "annulé fake");
    await storage.updateAiConversationStatus(conv.id, "cancelled");
    const msg = "مفهوم، طلبك تلغى 🙏 إلا بغيتي تكمل راسل المتجر. شكرا على اهتمامك!";
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
    await storage.updateAiConversationLastMessage(conv.id, msg);
    broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
    await sendWhatsAppMessage(customerPhone, msg);
    return;
  }

  // Generate AI reply
  const settings = await storage.getAiSettings(storeId);
  const systemPrompt = settings?.systemPrompt || DEFAULT_PROMPT;
  const recentLogs = await storage.getAiLogs(storeId, conv.orderId ?? undefined);

  try {
    const ai = await getOpenAI();
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...recentLogs.slice(-12).map((l) => ({ role: l.role === "user" ? "user" : "assistant", content: l.message })),
    ];
    const completion = await ai.chat.completions.create({ model: "gpt-4o", messages, max_tokens: 250 });
    const aiReply = completion.choices[0]?.message?.content ?? "";

    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: aiReply });
    await storage.updateAiConversationLastMessage(conv.id, aiReply);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: aiReply, ts: Date.now() });
    await sendWhatsAppMessage(customerPhone, aiReply);
  } catch (err: any) {
    console.error("[AI] GPT reply error:", err.message);
    broadcastToStore(storeId, "ai_error", { conversationId: conv.id, error: err.message });
  }
}

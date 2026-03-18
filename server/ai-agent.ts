import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { db } from "./db";
import { products, orderItems } from "@shared/schema";
import { eq } from "drizzle-orm";

/* ── Constants ───────────────────────────────────────────────────── */
const DEFAULT_PROMPT = `أنت وكيل خدمة عملاء محترف مغربي اسمك "أمين". تتحدث بالدارجة المغربية فقط.
مهمتك الوحيدة هي تأكيد تفاصيل الطلب مع الزبون على واتساب بطريقة طبيعية وودودة.
- اسأل عن العنوان أو المدينة إذا لم تكن واضحة.
- إذا أكد الزبون: أخبره أن الطلب في الطريق إليه وشكره.
- إذا ألغى الزبون: أخبره بلطف أن الطلب تلغى.
- لا تذكر أبداً أنك روبوت أو ذكاء اصطناعي.
- رسائلك قصيرة وطبيعية، لا تكتب فقرات طويلة.`;

const CONFIRM_KEYWORDS = [
  "نعم", "اه", "آه", "صيفطوه", "صافي", "واخا", "wakha", "waxxa", "oui",
  "yes", "confirm", "مزيان", "كنقبل", "يعطيك", "مؤكد", "تأكيد",
  "ok", "okay", "d'accord", "c'est bon", "cest bon", "go", "ابعتوه",
  "موافق", "راضي", "عيوني", "بالتوفيق", "ابعت", "كملوه",
];
const CANCEL_KEYWORDS = [
  "لا", "non", "no", "cancel", "annuler", "نلغي", "الغ", "إلغاء",
  "ما بغيتش", "ما كنقبلش", "annulé", "annule", "stop", "باش", "مابغيتش",
];

function detectIntent(msg: string): "confirm" | "cancel" | null {
  const lower = msg.toLowerCase().trim();
  if (CONFIRM_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "confirm";
  if (CANCEL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "cancel";
  return null;
}

/* ────────────────────────────────────────────────────────────────
   OPENROUTER RESOLVER — multi-tenant, store key has priority
   Key chain: store openrouterApiKey → OPENROUTER_API_KEY env
              → store openaiApiKey (legacy) → OPENAI_API_KEY env
──────────────────────────────────────────────────────────────── */
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://tajergrow.com",
  "X-Title": "TajerGrow",
};
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export const AI_MODELS: Record<string, { label: string; provider: string }> = {
  "openai/gpt-4o-mini":           { label: "GPT-4o Mini",       provider: "OpenRouter" },
  "anthropic/claude-3.5-sonnet":  { label: "Claude 3.5 Sonnet", provider: "OpenRouter" },
  "deepseek/deepseek-chat":       { label: "DeepSeek Chat",      provider: "OpenRouter" },
};

interface ResolvedClient {
  client: OpenAI;
  model: string;
  provider: string;
}

/** Resolve API client + model for a store. Strict store isolation — no cross-store leakage. */
async function resolveAIClient(storeId: number): Promise<ResolvedClient> {
  const settings = await storage.getAiSettings(storeId);

  // Priority: store OpenRouter key → env OpenRouter key → store OpenAI key (legacy) → env OpenAI key (legacy)
  const orKey   = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  const oaiKey  = settings?.openaiApiKey?.trim()     || process.env.OPENAI_API_KEY?.trim();
  const model   = settings?.aiModel?.trim() || DEFAULT_MODEL;

  if (orKey) {
    const client = new OpenAI({
      apiKey: orKey,
      baseURL: OPENROUTER_BASE,
      defaultHeaders: OPENROUTER_HEADERS,
    });
    return { client, model, provider: "OpenRouter" };
  }

  if (oaiKey) {
    const client = new OpenAI({ apiKey: oaiKey });
    return { client, model: "gpt-4o-mini", provider: "OpenAI" };
  }

  throw new Error("Veuillez configurer votre clé API OpenRouter pour activer la confirmation automatique.");
}

/** Quick check — does this store have ANY usable AI key? */
async function storeHasAIKey(storeId: number): Promise<boolean> {
  const settings = await storage.getAiSettings(storeId);
  return !!(settings?.openrouterApiKey?.trim())
    || !!(process.env.OPENROUTER_API_KEY)
    || !!(settings?.openaiApiKey?.trim())
    || !!(process.env.OPENAI_API_KEY);
}

/** Look up the first product name for an order */
async function getOrderProductName(orderId: number): Promise<string | null> {
  try {
    const items = await db.select({ productId: orderItems.productId, rawProductName: orderItems.rawProductName })
      .from(orderItems).where(eq(orderItems.orderId, orderId));
    if (!items.length) return null;
    const item = items[0];
    if (item.rawProductName) return item.rawProductName;
    if (item.productId) {
      const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, item.productId));
      return product?.name ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════
   TRIGGER — Called fire-and-forget when a new order is created
════════════════════════════════════════════════════════════════ */
export async function triggerAIForNewOrder(
  storeId: number,
  orderId: number,
  customerPhone: string,
  customerName: string,
  productId?: number | null,
): Promise<void> {
  if (!(await storeHasAIKey(storeId))) {
    console.warn("[AI] No AI key configured for store", storeId, "— skipping trigger");
    return;
  }

  try {
    const settings = await storage.getAiSettings(storeId);
    if (!settings?.enabled) return;

    // Product filter check
    const enabledIds: number[] = settings.enabledProductIds ?? [];
    if (enabledIds.length > 0 && productId && !enabledIds.includes(productId)) return;

    // Don't create duplicate active conversation for same phone
    const existing = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (existing) {
      console.log(`[AI] Already active conversation for ${customerPhone} — skipping`);
      return;
    }

    // Create conversation record
    const conv = await storage.createAiConversation({
      storeId, orderId, customerPhone,
      customerName: customerName || null,
      status: "active", isManual: 0,
    });

    // Lookup product name for the first message
    const productName = await getOrderProductName(orderId);
    const cleanName = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || "سيدي";

    // Fixed first message template as requested
    const firstMessage = productName
      ? `السلام عليكم سيدي ${cleanName}، نأكد معاك طلبية "${productName}"؟ 🙏`
      : `السلام عليكم سيدي ${cleanName}، وصلنا طلبيتك 🎉 واش تقدر تأكد لينا؟`;

    // Log and broadcast
    await storage.createAiLog({
      storeId, orderId, customerPhone,
      role: "assistant", message: firstMessage,
    });
    await storage.updateAiConversationLastMessage(conv.id, firstMessage);

    broadcastToStore(storeId, "new_conversation", {
      conversation: { ...conv, lastMessage: firstMessage, status: "active" },
      message: { role: "assistant", content: firstMessage, ts: Date.now() },
    });

    // Send via WhatsApp
    const sent = await sendWhatsAppMessage(customerPhone, firstMessage);
    if (!sent) {
      console.warn(`[AI] WhatsApp not configured — message logged but not sent to ${customerPhone}`);
    }

    console.log(`[AI] Conversation started: store=${storeId} order=${orderId} phone=${customerPhone}`);
  } catch (err: any) {
    console.error(`[AI] triggerAIForNewOrder error (order ${orderId}):`, err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   HANDLE INCOMING — Called when customer replies via WhatsApp
════════════════════════════════════════════════════════════════ */
export async function handleIncomingMessage(
  storeId: number,
  customerPhone: string,
  customerMessage: string,
): Promise<void> {
  if (!(await storeHasOpenAIKey(storeId))) return;

  try {
    // Find active conversation for this phone in this store
    const conv = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (!conv) return; // No active conversation

    // If admin is in manual control — just log and broadcast, don't reply
    if (conv.isManual === 1) {
      await storage.createAiLog({
        storeId, orderId: conv.orderId, customerPhone,
        role: "user", message: customerMessage,
      });
      await storage.updateAiConversationLastMessage(conv.id, customerMessage);
      broadcastToStore(storeId, "message", {
        conversationId: conv.id, role: "user",
        content: customerMessage, ts: Date.now(),
      });
      return;
    }

    // Log customer message + broadcast immediately
    await storage.createAiLog({
      storeId, orderId: conv.orderId, customerPhone,
      role: "user", message: customerMessage,
    });
    await storage.updateAiConversationLastMessage(conv.id, customerMessage);
    broadcastToStore(storeId, "message", {
      conversationId: conv.id, role: "user",
      content: customerMessage, ts: Date.now(),
    });

    // ── Intent detection (fast path — no GPT needed) ─────────────
    const intent = detectIntent(customerMessage);

    if (intent === "confirm" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "confirme"); // also decrements stock (RULE 0)
      await storage.updateAiConversationStatus(conv.id, "confirmed");
      const msg = "بارك الله فيك! طلبك تأكد ✅ غادي يوصلك قريبا إن شاء الله 🚀";
      await storage.createAiLog({
        storeId, orderId: conv.orderId, customerPhone,
        role: "assistant", message: msg,
      });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "confirmed", {
        conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now(),
      });
      broadcastToStore(storeId, "message", {
        conversationId: conv.id, role: "assistant", content: msg, ts: Date.now(),
      });
      await sendWhatsAppMessage(customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} confirmed via AI — stock decremented`);
      return;
    }

    if (intent === "cancel" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "annulé fake");
      await storage.updateAiConversationStatus(conv.id, "cancelled");
      const msg = "مفهوم، طلبك تلغى 🙏 إلا بغيتي تكمل راسل المتجر. شكرا على اهتمامك!";
      await storage.createAiLog({
        storeId, orderId: conv.orderId, customerPhone,
        role: "assistant", message: msg,
      });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "cancelled", {
        conversationId: conv.id, orderId: conv.orderId, ts: Date.now(),
      });
      broadcastToStore(storeId, "message", {
        conversationId: conv.id, role: "assistant", content: msg, ts: Date.now(),
      });
      await sendWhatsAppMessage(customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} cancelled via AI`);
      return;
    }

    // ── GPT-4o-mini reply (intent unclear) ───────────────────────
    // Broadcast "typing" indicator to live monitoring
    broadcastToStore(storeId, "typing", { conversationId: conv.id, ts: Date.now() });

    try {
      const settings = await storage.getAiSettings(storeId);
      const systemPrompt = settings?.systemPrompt || DEFAULT_PROMPT;
      const recentLogs = await storage.getAiLogs(storeId, conv.orderId ?? undefined);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...recentLogs.slice(-14).map((l) => ({
          role: (l.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: l.message,
        })),
      ];

      const { client: ai, model, provider } = await resolveAIClient(storeId);
      const completion = await ai.chat.completions.create({
        model,
        messages,
        max_tokens: 200,
        temperature: 0.7,
      });

      const aiReply = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!aiReply) throw new Error("Empty AI response");
      console.log(`[AI] Reply via ${provider}/${model} for conv ${conv.id}`);

      await storage.createAiLog({
        storeId, orderId: conv.orderId, customerPhone,
        role: "assistant", message: aiReply,
      });
      await storage.updateAiConversationLastMessage(conv.id, aiReply);

      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "message", {
        conversationId: conv.id, role: "assistant",
        content: aiReply, ts: Date.now(),
        model, provider,
      });

      await sendWhatsAppMessage(customerPhone, aiReply);
    } catch (gptErr: any) {
      console.error("[AI] GPT reply error:", gptErr.message);
      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "ai_error", {
        conversationId: conv.id, error: gptErr.message,
      });

      // Fallback message if GPT fails
      const fallback = "شكرا على رسالتك، واش تقدر تأكد لنا الطلبية؟ 🙏";
      await storage.createAiLog({
        storeId, orderId: conv.orderId, customerPhone,
        role: "assistant", message: fallback,
      });
      await storage.updateAiConversationLastMessage(conv.id, fallback);
      broadcastToStore(storeId, "message", {
        conversationId: conv.id, role: "assistant", content: fallback, ts: Date.now(),
      });
      await sendWhatsAppMessage(customerPhone, fallback);
    }
  } catch (err: any) {
    console.error(`[AI] handleIncomingMessage error (phone ${customerPhone}):`, err.message);
  }
}

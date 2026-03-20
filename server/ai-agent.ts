import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { db } from "./db";
import { products, orderItems, orders, stores } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/* ── Default Moroccan Darija System Prompt ───────────────────── */
const DEFAULT_PROMPT = `أنت موظف خدمة عملاء محترف في متجر مغربي للتجارة الإلكترونية. اسمك "أمين".
تتحدث بالدارجة المغربية فقط. أسلوبك ودود وطبيعي كإنسان حقيقي.

قاعدة مهمة جداً: لا ترسل كل الأسئلة في رسالة واحدة. اتبع هذا التسلسل خطوة بخطوة:

الخطوة 1 — تأكيد المدينة:
رسالتنا الأولى طلبنا من الزبون المدينة فقط. إذا جاوب، احفظ المدينة وانتقل للخطوة 2.

الخطوة 2 — تأكيد المقاس أو الكمية:
بعد أن تعرف المدينة، اسأله بشكل طبيعي عن المقاس أو أي تفصيل آخر مطلوب (حسب المنتج).
مثال: "الله يحفظك سيدي، والمدينة [كازا] واش المقاس [42] هو هاداك؟"

الخطوة 3 — التأكيد النهائي:
بعد تأكيد المقاس، لخص الطلب مع السعر الإجمالي وأخبره أن الطلبية تأكدت.
مثال: "صافي سيدي، الطلبية ديالك تأكدت وغتوصلك فـ 24 ساعة. نهارك مبروك! 🎉"

قواعد إضافية:
- إذا سألك الزبون عن السعر: أخبره بالسعر الموجود في تفاصيل الطلب.
- إذا سألك عن الجودة أو التوصيل: جاوبه بإيجاب وثقة.
- إذا أكد الزبون (واخا / ok / مزيان / صيفطوه): أنهِ المحادثة بالخطوة 3.
- إذا ألغى الزبون: أخبره بلطف أن الطلب تلغى.
- لا تذكر أبداً أنك روبوت أو ذكاء اصطناعي.
- رسائلك قصيرة (سطر أو سطرين فقط). لا فقرات طويلة.`;

/* ── Keyword banks ───────────────────────────────────────────── */
const CONFIRM_KEYWORDS = [
  "نعم", "اه", "آه", "صيفطوه", "صافي", "واخا", "wakha", "waxxa", "oui",
  "yes", "confirm", "مزيان", "كنقبل", "يعطيك", "مؤكد", "تأكيد",
  "ok", "okay", "d'accord", "c'est bon", "cest bon", "go", "ابعتوه",
  "موافق", "راضي", "عيوني", "بالتوفيق", "ابعت", "كملوه", "أكيد", "اكيد",
];
const CANCEL_KEYWORDS = [
  "لا", "non", "no", "cancel", "annuler", "نلغي", "الغ", "إلغاء",
  "ما بغيتش", "ما كنقبلش", "annulé", "annule", "stop", "باش", "مابغيتش",
];
const ATTENTION_KEYWORDS = [
  "بغيت واحد", "human", "admin", "مدير", "إنسان", "شخص حقيقي",
  "واحد حقيقي", "تكلم معاي", "تكلموا معايا", "بشر", "مسؤول",
  "complaint", "شكاية", "عندي مشكل", "مشكلة", "راجعني", "انسان",
];

function detectIntent(msg: string): "confirm" | "cancel" | null {
  const lower = msg.toLowerCase().trim();
  if (CONFIRM_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "confirm";
  if (CANCEL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "cancel";
  return null;
}

function detectAttentionNeeded(msg: string): boolean {
  const lower = msg.toLowerCase();
  return ATTENTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/* ── OpenRouter resolver ─────────────────────────────────────── */
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

interface ResolvedClient { client: OpenAI; model: string; provider: string; }

async function resolveAIClient(storeId: number): Promise<ResolvedClient> {
  const settings = await storage.getAiSettings(storeId);
  const orKey  = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  const oaiKey = settings?.openaiApiKey?.trim()     || process.env.OPENAI_API_KEY?.trim();
  const model  = settings?.aiModel?.trim() || DEFAULT_MODEL;

  if (orKey) {
    return {
      client: new OpenAI({ apiKey: orKey, baseURL: OPENROUTER_BASE, defaultHeaders: OPENROUTER_HEADERS }),
      model, provider: "OpenRouter",
    };
  }
  if (oaiKey) {
    return { client: new OpenAI({ apiKey: oaiKey }), model: "gpt-4o-mini", provider: "OpenAI" };
  }
  throw new Error("Veuillez configurer votre clé API OpenRouter pour activer la confirmation automatique.");
}

async function storeHasAIKey(storeId: number): Promise<boolean> {
  const s = await storage.getAiSettings(storeId);
  return !!(s?.openrouterApiKey?.trim()) || !!(process.env.OPENROUTER_API_KEY)
    || !!(s?.openaiApiKey?.trim()) || !!(process.env.OPENAI_API_KEY);
}

/* ── WhatsApp message queue (per-store rate limiter) ─────────── */
const waQueue = new Map<number, Array<{ phone: string; message: string }>>();
const waProcessing = new Set<number>();

async function queueWhatsApp(storeId: number, phone: string, message: string): Promise<void> {
  if (!waQueue.has(storeId)) waQueue.set(storeId, []);
  waQueue.get(storeId)!.push({ phone, message });
  if (!waProcessing.has(storeId)) {
    processWaQueue(storeId).catch(console.error);
  }
}

async function processWaQueue(storeId: number): Promise<void> {
  waProcessing.add(storeId);
  const queue = waQueue.get(storeId) ?? [];
  while (queue.length > 0) {
    const item = queue.shift()!;
    await sendWhatsAppMessage(item.phone, item.message);
    if (queue.length > 0) {
      await new Promise(r => setTimeout(r, 10000)); // 10s between messages (human-like pacing)
    }
  }
  waProcessing.delete(storeId);
}

/* ── Data helpers ────────────────────────────────────────────── */
interface OrderContext {
  productName: string | null;
  productVariant: string | null;
  totalPrice: number | null;
  customerCity: string | null;
  stockQty: number | null;
  productId: number | null;
}

export async function getOrderContextForRoute(orderId: number): Promise<OrderContext> {
  return getOrderContext(orderId);
}

async function getOrderContext(orderId: number): Promise<OrderContext> {
  try {
    const [order] = await db.select({
      totalPrice: orders.totalPrice,
      customerCity: orders.customerCity,
    }).from(orders).where(eq(orders.id, orderId));

    const items = await db.select({
      productId: orderItems.productId,
      rawProductName: orderItems.rawProductName,
      variant: orderItems.variant,
    }).from(orderItems).where(eq(orderItems.orderId, orderId));

    let productName: string | null = null;
    let productVariant: string | null = null;
    let stockQty: number | null = null;
    let resolvedProductId: number | null = null;

    if (items.length > 0) {
      const item = items[0];
      productVariant = item.variant ?? null;
      resolvedProductId = item.productId ?? null;
      if (item.rawProductName) {
        productName = item.rawProductName;
        // still try to get stock from product table if productId exists
        if (item.productId) {
          const [p] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, item.productId));
          stockQty = p?.stock ?? null;
        }
      } else if (item.productId) {
        const [p] = await db.select({ name: products.name, stock: products.stock }).from(products).where(eq(products.id, item.productId));
        productName = p?.name ?? null;
        stockQty = p?.stock ?? null;
      }
    }

    return {
      productName,
      productVariant,
      totalPrice: order?.totalPrice ?? null,
      customerCity: order?.customerCity ?? null,
      stockQty,
      productId: resolvedProductId,
    };
  } catch {
    return { productName: null, productVariant: null, totalPrice: null, customerCity: null, stockQty: null, productId: null };
  }
}

async function getStoreName(storeId: number): Promise<string> {
  try {
    const [store] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId));
    return store?.name || "المتجر";
  } catch {
    return "المتجر";
  }
}

/* ════════════════════════════════════════════════════════════════
   TRIGGER — Fire-and-forget on new order creation
════════════════════════════════════════════════════════════════ */
export async function triggerAIForNewOrder(
  storeId: number,
  orderId: number,
  customerPhone: string,
  customerName: string,
  productId?: number | null,
): Promise<void> {
  if (!(await storeHasAIKey(storeId))) {
    console.warn("[AI] No AI key for store", storeId, "— skipping trigger");
    return;
  }

  try {
    const settings = await storage.getAiSettings(storeId);
    if (!settings?.enabled) return;

    // Product filter check
    const enabledIds: number[] = settings.enabledProductIds ?? [];
    if (enabledIds.length > 0 && productId && !enabledIds.includes(productId)) return;

    // Prevent duplicate active conversation for same phone
    const existing = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (existing) {
      console.log(`[AI] Active conversation already exists for ${customerPhone}`);
      return;
    }

    // Gather context for the first message
    const [ctx, storeName] = await Promise.all([
      getOrderContext(orderId),
      getStoreName(storeId),
    ]);

    const cleanName = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || "سيدي";
    const productLabel = ctx.productName || "منتجك";
    const variantPart = ctx.productVariant ? ` (${ctx.productVariant})` : "";

    // Stock urgency line (only shown when stock is critically low)
    const stockUrgency = (ctx.stockQty !== null && ctx.stockQty > 0 && ctx.stockQty <= 3)
      ? `\n⚠️ ماتأخروش — بقاو غير ${ctx.stockQty} قطع فـ السطوك!`
      : "";

    // Step 1 — Ask for city only (progressive flow)
    const firstMessage =
      `السلام عليكم سيدي/لالة ${cleanName}، تبارك الله عليك 🌟\n` +
      `معاك فريق الدعم ديال ${storeName}، شلنا الطلب ديالك لـ "${productLabel}"${variantPart}.${stockUrgency}\n` +
      `واش ممكن تأكد لينا غير المدينة باش نخرجوها ليك اليوم؟ 🚀`;

    // Create conversation record
    const conv = await storage.createAiConversation({
      storeId, orderId, customerPhone,
      customerName: customerName || null,
      status: "active", isManual: 0,
    });

    // Log + broadcast to live monitoring
    await storage.createAiLog({ storeId, orderId, customerPhone, role: "assistant", message: firstMessage });
    await storage.updateAiConversationLastMessage(conv.id, firstMessage);

    broadcastToStore(storeId, "new_conversation", {
      conversation: { ...conv, lastMessage: firstMessage, status: "active" },
      message: { role: "assistant", content: firstMessage, ts: Date.now() },
    });

    // Queue the WhatsApp send (rate-limited)
    await queueWhatsApp(storeId, customerPhone, firstMessage);

    console.log(`[AI] Triggered: store=${storeId} order=${orderId} phone=${customerPhone} product="${productLabel}"`);
  } catch (err: any) {
    console.error(`[AI] triggerAIForNewOrder error (order ${orderId}):`, err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   RECOVERY TRIGGER — Fire-and-forget for abandoned lead outreach
════════════════════════════════════════════════════════════════ */
const RECOVERY_SYSTEM_PROMPT = `أنت موظف مبيعات محترف مغربي اسمك "أمين". تتحدث بالدارجة المغربية فقط.
مهمتك هي إرجاع الزبون الذي تخلى عن سلته واقناعه يكمل الشراء بطريقة طبيعية وودودة.

قواعد المحادثة:
- رسائلك قصيرة جداً (سطر أو سطرين). لا فقرات طويلة.
- إذا اشتكى الزبون أن الثمن غالي: قل له "الله يحفظك، هادا أرخص ثمن كيف دايرين ودابا كاين تخفيض" ثم اذكر قيمة له.
- إذا سأل عن الجودة: جاوبه بإيجاب وثقة كاملة.
- إذا سأل عن التوصيل: "غيتوصل ليك من 24 لـ 48 ساعة مجانًا إن شاء الله".
- إذا أكد الزبون (واخا / ok / مزيان / صيفطوه): أخبره أن الطلبية تأكدت وغتصل به في أقرب وقت.
- إذا ألغى: رد بلطف وشكره.
- لا تذكر أبداً أنك روبوت أو ذكاء اصطناعي.`;

export async function triggerRecoveryMessage(
  storeId: number,
  orderId: number,
  customerPhone: string,
  customerName: string,
  productName: string,
  stockQty: number | null,
): Promise<void> {
  if (!(await storeHasAIKey(storeId))) {
    console.warn("[Recovery] No AI key for store", storeId, "— skipping");
    return;
  }

  try {
    const cleanName = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || "سيدي/لالة";
    const stockPart = stockQty !== null && stockQty > 0 ? ` راه بقى لينا غير ${stockQty} حبات فـ السطوك.` : "";

    const recoveryMessage =
      `السلام عليكم ${cleanName}، شلنا باللي كنتي باغي تاخد "${productName}" ولكن وقع شي مشكل؟\n` +
      `واش عندك شي تساؤل نقدر نجاوبك عليه؟${stockPart} 🛍️`;

    // Create conversation record
    const conv = await storage.createAiConversation({
      storeId, orderId, customerPhone,
      customerName: customerName || null,
      status: "active", isManual: 0,
    });

    await storage.createAiLog({ storeId, orderId, customerPhone, role: "assistant", message: recoveryMessage });
    await storage.updateAiConversationLastMessage(conv.id, recoveryMessage);

    broadcastToStore(storeId, "new_conversation", {
      conversation: { ...conv, lastMessage: recoveryMessage, status: "active", isRecovery: true },
      message: { role: "assistant", content: recoveryMessage, ts: Date.now(), isRecovery: true },
    });

    await queueWhatsApp(storeId, customerPhone, recoveryMessage);
    console.log(`[Recovery] Sent recovery message to ${customerPhone} for order ${orderId}`);
  } catch (err: any) {
    console.error(`[Recovery] triggerRecoveryMessage error (order ${orderId}):`, err.message);
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
  if (!(await storeHasAIKey(storeId))) return;

  try {
    const conv = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (!conv) return;

    // Manual takeover — log & broadcast only, no AI reply
    if (conv.isManual === 1) {
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
      await storage.updateAiConversationLastMessage(conv.id, customerMessage);
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });
      return;
    }

    // Log + broadcast customer message immediately
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
    await storage.updateAiConversationLastMessage(conv.id, customerMessage);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });

    // Check if customer is asking for human attention
    if (detectAttentionNeeded(customerMessage)) {
      await storage.updateConversationNeedsAttention(conv.id, 1);
      broadcastToStore(storeId, "needs_attention", { conversationId: conv.id, ts: Date.now() });
      console.log(`[AI] Attention needed: conv=${conv.id} phone=${customerPhone}`);
    }

    // ── Fast intent detection (no AI needed) ─────────────────────
    const intent = detectIntent(customerMessage);

    if (intent === "confirm" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "confirme"); // RULE 0: decrements stock
      await storage.updateAiConversationStatus(conv.id, "confirmed");
      const msg = "بارك الله فيك! طلبك تأكد ✅ غادي يوصلك قريبا إن شاء الله 🚀";
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      await queueWhatsApp(storeId, customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} CONFIRMED — stock decremented`);
      return;
    }

    if (intent === "cancel" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "annulé fake");
      await storage.updateAiConversationStatus(conv.id, "cancelled");
      const msg = "مفهوم، طلبك تلغى 🙏 إلا بغيتي تكمل راسل المتجر مباشرة. شكرا على اهتمامك!";
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      await queueWhatsApp(storeId, customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} CANCELLED`);
      return;
    }

    // ── OpenRouter AI reply ───────────────────────────────────────
    broadcastToStore(storeId, "typing", { conversationId: conv.id, ts: Date.now() });

    try {
      const settings = await storage.getAiSettings(storeId);
      const recentLogs = await storage.getAiLogs(storeId, conv.orderId ?? undefined);

      // Build rich system prompt with order context
      // Check if this is a recovery conversation (order was abandoned)
      let isRecovery = false;
      if (conv.orderId) {
        const { orders: ordersTable } = await import("@shared/schema");
        const [orderRow] = await db.select({ wasAbandoned: ordersTable.wasAbandoned }).from(ordersTable).where(eq(ordersTable.id, conv.orderId));
        isRecovery = (orderRow?.wasAbandoned ?? 0) === 1;
      }
      let systemPrompt = isRecovery ? RECOVERY_SYSTEM_PROMPT : (settings?.systemPrompt || DEFAULT_PROMPT);
      if (conv.orderId) {
        const ctx = await getOrderContext(conv.orderId);
        const priceDh = ctx.totalPrice ? `${(ctx.totalPrice / 100).toFixed(0)} درهم` : "كما اتفقنا";
        const details: string[] = [];
        if (ctx.productName) details.push(`المنتج: ${ctx.productName}${ctx.productVariant ? ` (${ctx.productVariant})` : ""}`);
        details.push(`السعر: ${priceDh}`);
        if (ctx.customerCity) details.push(`المدينة: ${ctx.customerCity}`);
        // Stock awareness — agent knows actual inventory
        if (ctx.stockQty !== null) {
          if (ctx.stockQty <= 0) {
            details.push(`المخزون: نفد! لا تعد بالتسليم إلا بعد مراجعة الفريق`);
          } else if (ctx.stockQty <= 5) {
            details.push(`المخزون: ${ctx.stockQty} قطع فقط — استخدم هذا كحجة لإقناع الزبون بالتأكيد الآن`);
          } else {
            details.push(`المخزون: متوفر (${ctx.stockQty} قطعة)`);
          }
        }
        if (details.length) {
          systemPrompt = `${systemPrompt}\n\n[تفاصيل الطلب الحالي: ${details.join(" | ")}]`;
        }
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...recentLogs.slice(-14).map((l) => ({
          role: (l.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: l.message,
        })),
      ];

      const { client: ai, model, provider } = await resolveAIClient(storeId);
      const completion = await ai.chat.completions.create({ model, messages, max_tokens: 200, temperature: 0.7 });
      const aiReply = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!aiReply) throw new Error("Empty AI response");

      console.log(`[AI] Reply via ${provider}/${model} for conv ${conv.id}`);

      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: aiReply });
      await storage.updateAiConversationLastMessage(conv.id, aiReply);

      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: aiReply, ts: Date.now(), model, provider });

      await queueWhatsApp(storeId, customerPhone, aiReply);
    } catch (aiErr: any) {
      console.error("[AI] OpenRouter error:", aiErr.message);
      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "ai_error", { conversationId: conv.id, error: aiErr.message });

      // Mark as needs attention when AI fails
      await storage.updateConversationNeedsAttention(conv.id, 1);
      broadcastToStore(storeId, "needs_attention", { conversationId: conv.id, ts: Date.now() });

      // Polite fallback + notify admin
      const fallback = "شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.";
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: fallback });
      await storage.updateAiConversationLastMessage(conv.id, fallback);
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: fallback, ts: Date.now() });
      await queueWhatsApp(storeId, customerPhone, fallback);
    }
  } catch (err: any) {
    console.error(`[AI] handleIncomingMessage error (phone ${customerPhone}):`, err.message);
  }
}

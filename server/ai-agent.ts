import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { db } from "./db";
import { products, orderItems, orders, stores } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { AiConversation } from "@shared/schema";

/* ── OpenRouter config ───────────────────────────────────────── */
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://tajergrow.com",
  "X-Title": "TajerGrow",
};
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export const AI_MODELS: Record<string, { label: string; provider: string }> = {
  "openai/gpt-4o":                { label: "GPT-4o",             provider: "OpenRouter" },
  "openai/gpt-4o-mini":           { label: "GPT-4o Mini",        provider: "OpenRouter" },
  "anthropic/claude-3.5-sonnet":  { label: "Claude 3.5 Sonnet",  provider: "OpenRouter" },
  "deepseek/deepseek-chat":       { label: "DeepSeek Chat",       provider: "OpenRouter" },
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

/* ── Keyword banks ───────────────────────────────────────────── */
const CONFIRM_KEYWORDS = [
  "نعم", "اه", "آه", "صيفطوه", "صافي", "واخا", "wakha", "waxxa", "oui",
  "yes", "confirm", "مزيان", "كنقبل", "يعطيك", "مؤكد", "تأكيد",
  "ok", "okay", "d'accord", "c'est bon", "cest bon", "go", "ابعتوه",
  "موافق", "راضي", "عيوني", "بالتوفيق", "ابعت", "كملوه", "أكيد", "اكيد",
];
const CANCEL_KEYWORDS = [
  "لا", "non", "no", "cancel", "annuler", "نلغي", "الغ", "إلغاء",
  "ما بغيتش", "ما كنقبلش", "annulé", "annule", "stop", "مابغيتش",
];
const ATTENTION_KEYWORDS = [
  "بغيت واحد", "human", "admin", "مدير", "إنسان", "شخص حقيقي",
  "واحد حقيقي", "تكلم معاي", "تكلموا معايا", "بشر", "مسؤول",
  "complaint", "شكاية", "عندي مشكل", "مشكلة", "راجعني", "انسان",
];

const MOROCCAN_CITIES = [
  "الدار البيضاء", "كازابلانكا", "كازا", "الرباط", "فاس", "مراكش",
  "طنجة", "أكادير", "مكناس", "وجدة", "القنيطرة", "تطوان", "سلا",
  "العيون", "الجديدة", "بني ملال", "خريبكة", "الناظور", "الحسيمة",
  "تازة", "ورززات", "خميسات", "تيفلت", "سطات", "برشيد", "محمدية",
  "قلعة السراغنة", "الفقيه بن صالح", "تارودانت", "الرشيدية", "الراشيدية",
  "زاكورة", "طاطا", "مديونة", "بن سليمان", "بنسليمان", "تمارة", "الحي الحسني",
  "سيدي بنور", "آسفي", "اسفي", "الصويرة", "صفرو", "ازيلال", "ميدلت",
  "casablanca", "rabat", "fes", "marrakech", "tanger", "tangier",
  "agadir", "meknes", "oujda", "kenitra", "tetouan", "sale",
  "laayoune", "el jadida", "beni mellal", "khouribga", "nador",
  "al hoceima", "taza", "settat", "berrechid", "mohammedia",
  "khemisset", "tifelt", "taroudant", "essaouira", "safi", "azemmour",
  "temara", "mediouna", "ouarzazate", "errachidia", "midelt", "ifrane",
  "tiznit", "guelmim", "tan tan", "dakhla", "laayoune", "smara",
  "ksar el kebir", "larache", "al hoceima", "nador", "berkane",
  "taourirt", "guercif", "taza", "sefrou", "boulemane", "missour",
  "tinghir", "kelaa sraghna", "beni mellal",
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

function detectCity(msg: string): string | null {
  const lower = msg.toLowerCase().trim();
  for (const city of MOROCCAN_CITIES) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return null;
}

function looksLikeDirectAnswer(msg: string): boolean {
  const trimmed = msg.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const isQuestion = trimmed.includes("?") || trimmed.includes("؟") || trimmed.includes("واش");
  return wordCount <= 8 && !isQuestion;
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
      await new Promise(r => setTimeout(r, 10000));
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

/* ── Step-specific system prompts ────────────────────────────── */
function buildStepPrompt(
  step: number,
  ctx: OrderContext | null,
  storeName: string,
  conv: AiConversation,
  customSystemPrompt?: string | null,
): string {
  const priceDh = ctx?.totalPrice ? `${(ctx.totalPrice / 100).toFixed(0)} درهم` : null;
  const productLabel = ctx?.productName ?? "المنتج";
  const city = conv.collectedCity ?? ctx?.customerCity ?? null;
  const variant = conv.collectedVariant ?? ctx?.productVariant ?? null;

  const stockNote = ctx?.stockQty !== null
    ? (ctx!.stockQty! <= 0
        ? " (تنبيه: المخزون نفد! لا تعد بالتسليم الفوري)"
        : ctx!.stockQty! <= 5
          ? ` (تنبيه: بقى غير ${ctx!.stockQty} في المخزون — استخدم هذا كحجة للإسراع)`
          : "")
    : "";

  const base = `You are "أمين", a professional and warm customer service agent at "${storeName}", a Moroccan e-commerce store.

CRITICAL OUTPUT RULES:
- Write ONLY in natural Moroccan Darija (not standard Arabic, not French, not Arabizi)
- Keep replies SHORT: maximum 2 lines
- Never mention you are an AI, bot, or automated system
- Be friendly, human, and natural — like a real Moroccan employee
- Shipping is always FREE — never say otherwise
${customSystemPrompt ? `\nExtra store instructions: ${customSystemPrompt}` : ""}`;

  if (step === 1) {
    return `${base}

CURRENT STEP — 1 of 3: Confirm the customer's delivery city.
Product ordered: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}${stockNote}

Your task:
- The customer just received our greeting asking for their city
- If they gave a city name: warmly acknowledge it (e.g. "يزاك الله خير! وصلنا المدينة...") and move to asking about size/variant
- If they asked about price: tell them ${priceDh ?? "as displayed"} with free delivery, then ask for city again
- If unclear: ask for city naturally once more in Darija
- Never ask for city AND size in the same message`;
  }

  if (step === 2) {
    const cityLine = city ? `Customer's city: ${city}.` : "";
    return `${base}

CURRENT STEP — 2 of 3: Confirm the product size, color, or variant.
Product: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}${stockNote}
${cityLine}

Your task:
- Ask naturally about size/color/variant for this product (if applicable)
- If the product has no variants, skip this step and summarize the order
- Example: "الله يحفظك، وواش المقاس ديالك [X] هو نفس؟" or "واش اللون ديالك..."
- If they answer with a size or color: acknowledge it and confirm
- Keep it brief and warm`;
  }

  // Step 3 — final confirmation
  const summaryParts: string[] = [];
  if (productLabel) summaryParts.push(`المنتج: ${productLabel}`);
  if (variant) summaryParts.push(`المقاس/اللون: ${variant}`);
  if (city) summaryParts.push(`المدينة: ${city}`);
  if (priceDh) summaryParts.push(`السعر: ${priceDh} (التوصيل مجاني)`);

  return `${base}

CURRENT STEP — 3 of 3: Final order confirmation.
Order summary: ${summaryParts.length ? summaryParts.join(" | ") : `"${productLabel}"`}${stockNote}

Your task:
- Summarize the full order details warmly and ask for final confirmation
- Example: "إذن سيدي، الطلبية ديالك: [المنتج] مقاس [X] لـ [المدينة] بـ [السعر]. واش نؤكد ليك؟"
- If they say YES (واخا / صيفطوه / ok / مزيان / any positive): celebrate and tell them the order is confirmed ✅
- If they have a question: answer it then re-ask for confirmation
- Keep it warm and brief`;
}

/* ── Recovery system prompt ──────────────────────────────────── */
const RECOVERY_SYSTEM_PROMPT = `You are "أمين", a professional Moroccan sales agent.
Write ONLY in natural Moroccan Darija. Keep replies SHORT (1-2 lines).

Your goal: win back the customer who abandoned their cart.
- If they say price is too high: "الله يحفظك، هادا أرخص ثمن — ودابا كاين تخفيض"
- If they ask about quality: respond with full confidence
- If they ask about delivery: "التوصيل مجاني من 24 لـ 48 ساعة إن شاء الله"
- If they confirm (واخا / ok / صيفطوه): tell them order is confirmed
- If they cancel: respond kindly and thank them
- Never reveal you are an AI`;

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

    const enabledIds: number[] = settings.enabledProductIds ?? [];
    if (enabledIds.length > 0 && productId && !enabledIds.includes(productId)) return;

    const existing = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (existing) {
      console.log(`[AI] Active conversation already exists for ${customerPhone}`);
      return;
    }

    const [ctx, storeName] = await Promise.all([
      getOrderContext(orderId),
      getStoreName(storeId),
    ]);

    const cleanName = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || "سيدي/لالة";
    const productLabel = ctx.productName || "منتجك";
    const variantPart = ctx.productVariant ? ` (${ctx.productVariant})` : "";
    const stockUrgency = (ctx.stockQty !== null && ctx.stockQty > 0 && ctx.stockQty <= 3)
      ? `\n⚠️ ماتأخروش — بقاو غير ${ctx.stockQty} قطع فـ السطوك!`
      : "";

    // Exact template from spec — Step 1: ask for city only
    const firstMessage =
      `السلام عليكم سيدي/لالة ${cleanName}، تبارك الله عليك 🌟\n` +
      `معاك فريق الدعم ديال ${storeName}، شلنا الطلب ديالك لـ "${productLabel}"${variantPart}.${stockUrgency}\n` +
      `واش ممكن تأكد لينا غير المدينة باش نخرجوها ليك اليوم؟ 🚀`;

    const conv = await storage.createAiConversation({
      storeId, orderId, customerPhone,
      customerName: customerName || null,
      status: "active", isManual: 0,
      conversationStep: 1,
    });

    await storage.createAiLog({ storeId, orderId, customerPhone, role: "assistant", message: firstMessage });
    await storage.updateAiConversationLastMessage(conv.id, firstMessage);

    broadcastToStore(storeId, "new_conversation", {
      conversation: { ...conv, lastMessage: firstMessage, status: "active" },
      message: { role: "assistant", content: firstMessage, ts: Date.now() },
    });

    await queueWhatsApp(storeId, customerPhone, firstMessage);
    console.log(`[AI] Triggered: store=${storeId} order=${orderId} phone=${customerPhone} product="${productLabel}"`);
  } catch (err: any) {
    console.error(`[AI] triggerAIForNewOrder error (order ${orderId}):`, err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   RECOVERY TRIGGER
════════════════════════════════════════════════════════════════ */
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

    const conv = await storage.createAiConversation({
      storeId, orderId, customerPhone,
      customerName: customerName || null,
      status: "active", isManual: 0,
      conversationStep: 3, // recovery starts at confirmation step
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
   HANDLE INCOMING — Step-based AI conversation engine
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

    // Manual takeover — just log and broadcast, AI is paused
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

    // Human escalation detection
    if (detectAttentionNeeded(customerMessage)) {
      await storage.updateConversationNeedsAttention(conv.id, 1);
      broadcastToStore(storeId, "needs_attention", { conversationId: conv.id, ts: Date.now() });
      console.log(`[AI] Attention needed: conv=${conv.id} phone=${customerPhone}`);
    }

    // ── Fast intent detection — works at any step ─────────────────
    const intent = detectIntent(customerMessage);

    if (intent === "confirm" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "confirme");
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

    // ── Step-based AI reply ───────────────────────────────────────
    const currentStep = conv.conversationStep ?? 1;
    broadcastToStore(storeId, "typing", { conversationId: conv.id, ts: Date.now() });

    try {
      const settings = await storage.getAiSettings(storeId);

      // Determine if recovery conversation
      let isRecovery = false;
      if (conv.orderId) {
        const { orders: ordersTable } = await import("@shared/schema");
        const [orderRow] = await db.select({ wasAbandoned: ordersTable.wasAbandoned }).from(ordersTable).where(eq(ordersTable.id, conv.orderId));
        isRecovery = (orderRow?.wasAbandoned ?? 0) === 1;
      }

      const ctx = conv.orderId ? await getOrderContext(conv.orderId) : null;
      const storeName = await getStoreName(storeId);

      // Build step-specific system prompt
      const systemPrompt = isRecovery
        ? RECOVERY_SYSTEM_PROMPT
        : buildStepPrompt(currentStep, ctx, storeName, conv, settings?.systemPrompt);

      // Build message history
      const recentLogs = await storage.getAiLogs(storeId, conv.orderId ?? undefined);
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

      console.log(`[AI] Step ${currentStep} reply via ${provider}/${model} for conv ${conv.id}`);

      // ── Advance step based on what the customer just said ────────
      if (!isRecovery) {
        let nextStep = currentStep;
        let stepData: { city?: string; variant?: string } = {};

        if (currentStep === 1) {
          const detectedCity = detectCity(customerMessage);
          if (detectedCity) {
            stepData.city = detectedCity;
            nextStep = 2;
            // If product already has a variant from order, skip step 2
            if (ctx?.productVariant) {
              stepData.variant = ctx.productVariant;
              nextStep = 3;
            }
          } else if (looksLikeDirectAnswer(customerMessage) && customerMessage.length > 3) {
            // Short direct answer that's not a city we recognize — treat as city anyway
            stepData.city = customerMessage.trim();
            nextStep = 2;
            if (ctx?.productVariant) {
              stepData.variant = ctx.productVariant;
              nextStep = 3;
            }
          }
        } else if (currentStep === 2) {
          if (looksLikeDirectAnswer(customerMessage) && customerMessage.length > 1) {
            stepData.variant = customerMessage.trim();
            nextStep = 3;
          }
        }

        if (nextStep !== currentStep) {
          await storage.updateConversationStep(conv.id, nextStep, stepData);
          console.log(`[AI] Conv ${conv.id} advanced: step ${currentStep} → ${nextStep}`, stepData);
        }
      }

      // Log + broadcast + queue outgoing message
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: aiReply });
      await storage.updateAiConversationLastMessage(conv.id, aiReply);

      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: aiReply, ts: Date.now(), model, provider, step: currentStep });

      await queueWhatsApp(storeId, customerPhone, aiReply);

    } catch (aiErr: any) {
      console.error("[AI] Reply error:", aiErr.message);
      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "ai_error", { conversationId: conv.id, error: aiErr.message });

      await storage.updateConversationNeedsAttention(conv.id, 1);
      broadcastToStore(storeId, "needs_attention", { conversationId: conv.id, ts: Date.now() });

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

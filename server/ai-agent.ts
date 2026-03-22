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
  descriptionDarija: string | null;
  aiFeatures: string[] | null;
}

export async function getOrderContextForRoute(orderId: number): Promise<OrderContext> {
  return getOrderContext(orderId);
}

async function getOrderContext(orderId: number): Promise<OrderContext> {
  try {
    const [order] = await db.select({
      totalPrice: orders.totalPrice,
      customerCity: orders.customerCity,
      rawProductName: orders.rawProductName,
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
    let descriptionDarija: string | null = null;
    let aiFeatures: string[] | null = null;

    if (items.length > 0) {
      const item = items[0];
      productVariant = item.variant ?? null;
      resolvedProductId = item.productId ?? null;

      if (item.rawProductName) {
        productName = item.rawProductName;
      }
      if (item.productId) {
        const [p] = await db.select({
          name: products.name,
          stock: products.stock,
          descriptionDarija: products.descriptionDarija,
          aiFeatures: products.aiFeatures,
        }).from(products).where(eq(products.id, item.productId));
        if (p) {
          if (!productName) productName = p.name ?? null;
          stockQty = p.stock ?? null;
          descriptionDarija = p.descriptionDarija ?? null;
          if (p.aiFeatures) {
            try { aiFeatures = JSON.parse(p.aiFeatures); } catch { aiFeatures = null; }
          }
        }
      }
    }

    // Fallback: use rawProductName from orders table if still no product name
    if (!productName && order?.rawProductName) {
      productName = order.rawProductName;
    }

    return {
      productName,
      productVariant,
      totalPrice: order?.totalPrice ?? null,
      customerCity: order?.customerCity ?? null,
      stockQty,
      productId: resolvedProductId,
      descriptionDarija,
      aiFeatures,
    };
  } catch {
    return { productName: null, productVariant: null, totalPrice: null, customerCity: null, stockQty: null, productId: null, descriptionDarija: null, aiFeatures: null };
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

/* ── Gender detection from Arabic/French customer name ───────── */
const MALE_NAMES = [
  "محمد","Mohamed","Mohammed","Ahmed","أحمد","Amine","أمين","Khalid","خالد",
  "Youssef","يوسف","Omar","عمر","Hassan","حسن","Hamid","حميد","Rachid","رشيد",
  "Nabil","نبيل","Karim","كريم","Samir","سمير","Tarik","طارق","Adil","عادل",
  "Brahim","Ibrahim","إبراهيم","Ali","علي","Mustapha","مصطفى","Driss","إدريس",
  "Hicham","هشام","Mehdi","مهدي","Younes","يونس","Ayoub","أيوب","Zakaria","زكريا",
  "Abdellah","عبدالله","Abdelali","Abderrahim","عبدالرحيم","Soufiane","سفيان",
];
const FEMALE_NAMES = [
  "Fatima","فاطمة","Sara","سارة","Khadija","خديجة","Aisha","عائشة","Maryam","مريم",
  "Nadia","ناديا","Laila","ليلى","Zineb","زينب","Hanane","حنان","Samira","سميرة",
  "Houda","هدى","Rim","ريم","Hasnaa","حسناء","Kawtar","كوثر","Sanaa","سناء",
  "Imane","إيمان","Loubna","لبنى","Wiam","وئام","Chaimae","شيماء","Soukaina","سكينة",
  "Asma","أسماء","Hiba","هبة","Manal","منال","Salma","سلمى","Amina","آمينة",
  "Rajaa","رجاء","Hayat","حياة","Ghita","غيثة","Meriem","مريم","Ikram","إكرام",
];

function detectGender(name: string): "male" | "female" | "unknown" {
  if (!name) return "unknown";
  const cleaned = name.split(/[\s\-_,]/)[0].trim();
  if (MALE_NAMES.some(n => cleaned.toLowerCase().includes(n.toLowerCase()))) return "male";
  if (FEMALE_NAMES.some(n => cleaned.toLowerCase().includes(n.toLowerCase()))) return "female";
  return "unknown";
}

function getGenderAddress(gender: "male" | "female" | "unknown"): { formal: string; friendly: string } {
  if (gender === "male")   return { formal: "سيدي", friendly: "خويا" };
  if (gender === "female") return { formal: "لالة", friendly: "اختي" };
  return { formal: "سيدي/لالة", friendly: "صديقي" };
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
  const gender = detectGender(conv.customerName ?? "");
  const address = getGenderAddress(gender);

  const stockNote = ctx?.stockQty !== null
    ? (ctx!.stockQty! <= 0
        ? " (IMPORTANT: Stock is ZERO — do not promise delivery, say team will confirm availability)"
        : ctx!.stockQty! <= 5
          ? ` (URGENCY: Only ${ctx!.stockQty} units left — use scarcity to close the sale faster)`
          : "")
    : "";

  // Product knowledge section
  const productKnowledge: string[] = [];
  if (ctx?.descriptionDarija) productKnowledge.push(`Description: ${ctx.descriptionDarija}`);
  if (ctx?.aiFeatures?.length) productKnowledge.push(`Features: ${ctx.aiFeatures.join(" | ")}`);
  const knowledgeBlock = productKnowledge.length
    ? `\nPRODUCT KNOWLEDGE BASE:\n${productKnowledge.join("\n")}`
    : "";

  const base = `You are "أمين", a human customer service agent at "${storeName}" (Moroccan e-commerce store). You are a master Moroccan salesperson.

CRITICAL OUTPUT RULES:
- Write ONLY in natural Moroccan Darija (not MSA, not French, not Arabizi)
- Keep replies SHORT: 1-2 lines maximum — never long paragraphs
- Never reveal you are an AI or robot
- Be warm, friendly, use emojis naturally 😊
- Shipping is ALWAYS FREE — never say otherwise
- When hesitant: emphasize "قلب عاد خلص" (inspect before paying), free returns, and premium quality
- Gender: address as ${address.formal} (formal) or ${address.friendly} (friendly) based on name "${conv.customerName ?? "unknown"}"

ORDER DETAILS:
- Product: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}
${city ? `- City: ${city}` : ""}${variant ? `\n- Size/Variant: ${variant}` : ""}${stockNote}
${knowledgeBlock}
${customSystemPrompt ? `\nSTORE EXTRA RULES:\n${customSystemPrompt}` : ""}`;

  if (step === 1) {
    return `${base}

CURRENT TASK — Step 1/3: Get the customer's delivery city.
- They just received our greeting asking for city
- If they gave a city: warmly acknowledge it then naturally move toward size/variant
- If they asked about price: answer then ask city again
- If they asked about quality/material: use the product knowledge above and reassure them confidently
- NEVER ask for city AND size in the same message`;
  }

  if (step === 2) {
    return `${base}

CURRENT TASK — Step 2/3: Confirm size, color, or variant.
${city ? `City confirmed: ${city}.` : ""}
- Ask naturally about size/color for "${productLabel}"
- If product has no variants (e.g. it's a one-size item): skip this and summarize the order
- If they hesitate or ask questions: use the product knowledge to reassure, then ask again
- Keep it very brief and warm`;
  }

  // Step 3 — final confirmation
  const summaryParts: string[] = [];
  if (productLabel) summaryParts.push(`${productLabel}`);
  if (variant)       summaryParts.push(`مقاس ${variant}`);
  if (city)          summaryParts.push(`لـ ${city}`);
  if (priceDh)       summaryParts.push(`${priceDh} (التوصيل مجاني 🚚)`);

  return `${base}

CURRENT TASK — Step 3/3: Get final confirmation.
Order summary to present: ${summaryParts.length ? summaryParts.join("، ") : productLabel}

- Summarize warmly: "صافي ${address.formal}، الطلبية ديالك: [summary]. واش نؤكد ليك؟"
- If they say YES (واخا / صيفطوه / ok / مزيان / any positive): celebrate! "صافي ${address.formal}، الكوموند ديالك غتخرج اليوم إن شاء الله. شكراً بزاف! 🎉"
- If they hesitate: emphasize free shipping + "قلب عاد خلص"
- If they have questions: answer using product knowledge then re-confirm
- Once confirmed say the success message then the conversation is DONE`;
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
  console.log(`[AI] triggerAIForNewOrder called → store=${storeId} order=${orderId} phone=${customerPhone}`);

  if (!(await storeHasAIKey(storeId))) {
    console.error(`[AI] ❌ BLOCKED: No OpenRouter/OpenAI API key configured for store ${storeId}. Add OPENROUTER_API_KEY secret or configure it in Automation → IA Confirmation.`);
    return;
  }

  try {
    const settings = await storage.getAiSettings(storeId);
    if (!settings?.enabled) {
      console.warn(`[AI] ⚠️ BLOCKED: AI confirmation is DISABLED for store ${storeId}. Enable it in Automation → IA Confirmation.`);
      return;
    }

    const enabledIds: number[] = settings.enabledProductIds ?? [];
    if (enabledIds.length > 0 && productId && !enabledIds.includes(productId)) {
      console.warn(`[AI] ⚠️ BLOCKED: Product ${productId} not in store ${storeId}'s enabled product list [${enabledIds.join(", ")}]`);
      return;
    }

    const existing = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (existing) {
      if (existing.orderId === orderId) {
        console.log(`[AI] ⚠️ BLOCKED: Same order (orderId=${orderId}) already has an active conversation (conv.id=${existing.id}) — true duplicate, skipping`);
        return;
      }
      // Different order from the same phone — close stale conv and open a fresh one
      console.log(`[AI] 🔄 Closing stale conversation (conv.id=${existing.id}, old orderId=${existing.orderId}) — new order ${orderId} takes priority`);
      await storage.updateAiConversationStatus(existing.id, "closed");
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

    console.log(`[AI] ✅ Conversation created (conv.id=${conv.id}) — queuing WhatsApp message`);
    console.log(`[AI] Sending first WA message to: ${customerPhone}`);
    await queueWhatsApp(storeId, customerPhone, firstMessage);
    console.log(`[AI] ✅ Triggered: store=${storeId} order=${orderId} phone=${customerPhone} product="${productLabel}" step=1`);
  } catch (err: any) {
    console.error(`[AI] ❌ triggerAIForNewOrder error (order ${orderId}):`, err.message);
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
      const gender = detectGender(conv.customerName ?? "");
      const addr = getGenderAddress(gender);
      const msg = `صافي ${addr.formal}! الكوموند ديالك تأكدات ✅ غتخرج اليوم إن شاء الله. شكراً بزاف على ثقتك فينا 🎉🚀`;
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      await queueWhatsApp(storeId, customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} CONFIRMED by ${conv.customerName}`);
      return;
    }

    if (intent === "cancel" && conv.orderId) {
      await storage.updateOrderStatus(conv.orderId, "annulé fake");
      await storage.updateAiConversationStatus(conv.id, "cancelled");
      const gender = detectGender(conv.customerName ?? "");
      const addr = getGenderAddress(gender);
      const msg = `مفهوم ${addr.formal} 🙏 إلا بغيتي تكمل أو عندك سؤال راسل المتجر مباشرة. نتمنى نخدموا معك قريبا!`;
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      await queueWhatsApp(storeId, customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} CANCELLED by ${conv.customerName}`);
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

import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { db } from "./db";
import { products, orderItems, orders, stores, aiConversations } from "@shared/schema";
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

/** Wrap AI errors with clearer diagnostics */
function enrichAiError(err: any): Error {
  const msg: string = err?.message || String(err);
  if (msg.includes("401") || msg.toLowerCase().includes("user not found") || msg.toLowerCase().includes("unauthorized")) {
    return new Error("❌ Clé OpenRouter invalide (401 User not found). Allez sur openrouter.ai/keys → créez une nouvelle clé → mettez-la dans Replit Secrets sous OPENROUTER_API_KEY.");
  }
  if (msg.includes("402") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("balance")) {
    return new Error("❌ Solde OpenRouter insuffisant. Rechargez sur openrouter.ai/credits (minimum $5).");
  }
  if (msg.includes("429")) {
    return new Error("⚠️ Limite de requêtes OpenRouter atteinte. Réessayez dans quelques secondes.");
  }
  return err;
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
  // Strong buying signals
  "بغيتها", "بغيتوه", "نبغيها", "نبغيه", "بغي نطلب", "بغيت نطلب",
  "خاصني", "خاصنيه", "خاصنيها", "كيفاش نطلب", "عندي نية",
  "طلبوه", "ابعتوها", "دير ليا", "دير ليه", "كمل معايا",
];
// ── Strict cancellation only — single "لا/no/non" alone is NOT a cancel
// because customers say "لا، واش عندكم مقاس 41؟" (still interested).
// Only explicit, unambiguous phrases trigger cancellation.
const CANCEL_KEYWORDS = [
  "بلاش",               // "forget it / nevermind" — strongest Darija cancel
  "ما بقيتش بغيت",      // "I no longer want it"
  "ما بقيتش",           // "I no longer (want it)"
  "ما بغيتش",           // "I don't want it"
  "ما كنقبلش",          // "I won't accept it"
  "مابغيتش",            // merged
  "بغيت نلغي",          // "I want to cancel"
  "نلغي الطلب",         // "cancel the order"
  "الغ الطلب",          // "cancel the order"
  "إلغاء الطلب",        // "cancel the order"
  "ما كناخدوش",         // "we won't take it"
  "ما بقيناش",          // "we no longer (want it)"
];
const ATTENTION_KEYWORDS = [
  "بغيت واحد", "human", "admin", "مدير", "إنسان", "شخص حقيقي",
  "واحد حقيقي", "تكلم معاي", "تكلموا معايا", "بشر", "مسؤول",
  "complaint", "شكاية", "عندي مشكل", "مشكلة", "راجعني", "انسان",
  // Complex post-order requests that require human intervention
  "بغيت نبدل المقاس", "بغيت نبدل اللون", "بغيت نبدل العنوان",
  "بغيت نغير المقاس", "بغيت نغير العنوان", "بغيت نغير اللون",
  "غلطت فـ العنوان", "غلطت فـ المقاس", "عنواني غلط",
  "بغيت نرجع", "رجوع", "استرجاع", "تبديل", "ناو صحيح",
  "ما جاتش", "ما وصلاتش", "مشكلة فـ التوصيل",
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

  // Confirm check first
  if (CONFIRM_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "confirm";

  // ── Question guard: customer is asking something → still interested, never cancel ──
  // Catches: "لا، واش عندكم 41؟" / "واش كتوصل لا؟" / "شحال الثمن؟" etc.
  const isQuestion =
    lower.includes("؟") ||
    lower.endsWith("?") ||
    /^(واش|كيفاش|فين|شحال|شنو|علاش|فاش|وقت|امتى|امتا|كيفما)\b/.test(lower) ||
    lower.includes("امتا ") || lower.includes("امتى ");
  if (isQuestion) return null;

  // Cancel only on explicit, unambiguous phrases
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

export async function queueWhatsApp(storeId: number, phone: string, message: string): Promise<void> {
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
  orderStatus: string | null;
  trackNumber: string | null;
  shippingProvider: string | null;
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
      status: orders.status,
      trackNumber: orders.trackNumber,
      shippingProvider: orders.shippingProvider,
    }).from(orders).where(eq(orders.id, orderId));

    const items = await db.select({
      productId: orderItems.productId,
      rawProductName: orderItems.rawProductName,
      variantInfo: orderItems.variantInfo,
    }).from(orderItems).where(eq(orderItems.orderId, orderId));

    let productName: string | null = null;
    let productVariant: string | null = null;
    let stockQty: number | null = null;
    let resolvedProductId: number | null = null;
    let descriptionDarija: string | null = null;
    let aiFeatures: string[] | null = null;

    if (items.length > 0) {
      const item = items[0];
      productVariant = item.variantInfo ?? null;
      resolvedProductId = item.productId ?? null;

      if (item.rawProductName) {
        productName = item.rawProductName;
      }
      if (item.productId) {
        const [p] = await db.select({
          name: products.name,
          stock: products.stock,
          description: products.description,
          descriptionDarija: products.descriptionDarija,
          aiFeatures: products.aiFeatures,
        }).from(products).where(eq(products.id, item.productId));
        if (p) {
          if (!productName) productName = p.name ?? null;
          stockQty = p.stock ?? null;
          // Use descriptionDarija first, fall back to regular description
          descriptionDarija = p.descriptionDarija || p.description || null;
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
      orderStatus: order?.status ?? null,
      trackNumber: order?.trackNumber ?? null,
      shippingProvider: order?.shippingProvider ?? null,
    };
  } catch {
    return { productName: null, productVariant: null, totalPrice: null, customerCity: null, stockQty: null, productId: null, descriptionDarija: null, aiFeatures: null, orderStatus: null, trackNumber: null, shippingProvider: null };
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

  const base = `You are "أمين", a patient and helpful human customer service agent at "${storeName}" (Moroccan e-commerce store). You are a trusted Moroccan salesperson — never pushy, always supportive.

CRITICAL OUTPUT RULES:
- Write ONLY in natural Moroccan Darija (not MSA, not French, not Arabizi)
- Keep replies SHORT: 1-2 lines maximum — never long paragraphs
- Never reveal you are an AI or robot
- Be warm, friendly, use emojis naturally 😊
- Shipping is ALWAYS FREE — never say otherwise
- When hesitant: emphasize "قلب عاد خلص" (inspect before paying), free returns, and premium quality
- Gender: address as ${address.formal} (formal) or ${address.friendly} (friendly) based on name "${conv.customerName ?? "unknown"}"

PATIENCE MODE — READ CAREFULLY:
- ANSWER EVERY question about the product FIRST, then gently ask for city/confirmation
- If the customer says "لا" followed by a question, they are STILL INTERESTED — keep helping
- If the customer asks 10 questions, answer all 10 warmly — never get frustrated or give up
- Do NOT push for confirmation after every reply — build trust naturally
- ONLY mark as cancelled if customer says explicitly: "بلاش" / "ما بقيتش" / "ما بغيتش" / "بغيت نلغي"
- If undecided, always end with: "واش عندك أي سؤال آخر ${address.formal}؟ كنا هنا دايما 🙏"
- Your goal is to CLOSE THE SALE by being helpful, not by rushing

ORDER DETAILS:
- Product: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}
${city ? `- City: ${city}` : ""}${variant ? `\n- Size/Variant: ${variant}` : ""}${stockNote}
${knowledgeBlock}
${customSystemPrompt ? `\nSTORE EXTRA RULES:\n${customSystemPrompt}` : ""}`;

  // ── POST-DELIVERY MODE — order was delivered ────────────────────────
  if (ctx?.orderStatus === "livré") {
    const productLabel2 = ctx.productName ?? "المنتج";
    return `${base}

POST-DELIVERY SUPPORT MODE — The order has been DELIVERED (status: livré).
Your role: thank the customer, ask for a review, and handle any post-delivery issues warmly.

RULES FOR THIS MODE:
- Start with: "وصلاتك الكوموند ${address.formal}؟ كنتمنى يكون عجبك ${productLabel2}! 😊"
- If they are happy: celebrate and ask for a review/recommendation
- If they have a problem (wrong size, defective, etc.): respond with empathy and say a human agent will follow up
- ALWAYS be warm and appreciative
- Keep replies SHORT: 1-2 lines max`;
  }

  // ── DELIVERY COMPANION MODE — activated when order already confirmed ──
  if (ctx?.orderStatus === "confirme" || ctx?.orderStatus === "expédié" || ctx?.orderStatus === "en_cours") {
    const trackingLine = ctx.trackNumber
      ? `رقم التتبع ديالك: *${ctx.trackNumber}*${ctx.shippingProvider ? ` (${ctx.shippingProvider})` : ""}`
      : null;
    const deliveryStatus = ctx.orderStatus === "expédié" || ctx.orderStatus === "en_cours"
      ? `الكوموند ديالك راها عند شركة الشحن${ctx.shippingProvider ? ` (${ctx.shippingProvider})` : ""} وهي فـ الطريق ليك 🚚${trackingLine ? `\nرقم التتبع ديالك: *${ctx.trackNumber}*` : ""}`
      : "الكوموند ديالك سيدي/لالة راه مأكدة وحنا كنوجدوا فيها دبا باش تخرج ✅";

    return `${base}

DELIVERY COMPANION MODE — The order is ALREADY CONFIRMED (status: ${ctx.orderStatus}).
Your role now is LOGISTICS SUPPORT, not sales.

CURRENT ORDER STATUS: "${ctx.orderStatus}"
${trackingLine ? `TRACKING: ${trackingLine}` : "No tracking number yet."}

RULES FOR THIS MODE:
- Do NOT ask for city/variant/confirmation — order is already placed
- If customer asks "فين الكوموند؟" / "فين وصلات؟" / "وين الكوموند" / "سلام" / "متى يجي":
  Respond EXACTLY with the status: "${deliveryStatus}"
- If status is "confirme": say "الكوموند ديالك سيدي/لالة راه مأكدة وحنا كنوجدوا فيها دبا باش تخرج ✅"
- If status is "expédié" or "en_cours": give tracking info if available, say "وجد راسك ${address.formal} وكن فـ الدار باش يوصلك 🚚"
- If customer wants to CANCEL: respond with "مفهوم ${address.formal}، غنلغيوها ليك دابا" — this signals CANCEL intent
- If customer asks about product after confirm: answer questions warmly
- ALWAYS be reassuring — the order is safe and coming
- Keep replies SHORT: 1-2 lines max`;
  }

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
  console.log(`[WEBHOOK]: New order received for ${customerName} | Order #${orderId} | Store: ${storeId}`);

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

    console.log(`[AI]: Initializing conversation context for order #${orderId}`);
    const [ctx, storeName] = await Promise.all([
      getOrderContext(orderId),
      getStoreName(storeId),
    ]);

    const cleanName    = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || "سيدي/لالة";
    const productLabel = ctx.productName || "منتجك";
    const variantPart  = ctx.productVariant ? ` (${ctx.productVariant})` : "";
    const stockUrgency = (ctx.stockQty !== null && ctx.stockQty > 0 && ctx.stockQty <= 3)
      ? `\n⚠️ ماتأخروش — بقاو غير ${ctx.stockQty} قطع فـ السطوك!`
      : "";

    // Greeting — exact format as specified
    const firstMessage =
      `السلام عليكم سيدي/لالة ${cleanName}، تبارك الله عليك ✨\n` +
      `معاك فريق الدعم ديال ${storeName}، شلنا الطلب ديالك لـ "${productLabel}"${variantPart}.${stockUrgency}\n` +
      `واش نأكد ليك المدينة والمقاس باش نخرجوها ليك اليوم؟ 🚀`;

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

    console.log(`[WHATSAPP]: Attempting to send message to ${customerPhone}`);
    await queueWhatsApp(storeId, customerPhone, firstMessage);
    console.log(`[SUCCESS]: Outreach sent successfully → order #${orderId} | phone: ${customerPhone} | product: "${productLabel}"`);
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
    let conv = await storage.getActiveAiConversationByPhone(storeId, customerPhone);

    // ── Auto-start / re-open conversation for customers who text without an active conv ──
    // Handles all order statuses so "expédié" / "livré" customers are NEVER routed to lead flow
    if (!conv) {
      const { orders: ordersTable } = await import("@shared/schema");
      const { and: drAnd, eq: drEq, inArray: drIn, desc: drDesc } = await import("drizzle-orm");
      const phoneVariants = [
        customerPhone,
        customerPhone.startsWith("+") ? customerPhone.slice(1) : `+${customerPhone}`,
        customerPhone.replace(/^\+?212/, "0"),
      ];

      // Search across ALL statuses — priority: active statuses first, then delivered, then cancelled
      const STATUS_PRIORITY = ["confirme", "expédié", "en_cours", "nouveau", "livré", "annulé", "annulé fake"];
      const [recentOrder] = await db.select()
        .from(ordersTable)
        .where(drAnd(
          drEq(ordersTable.storeId, storeId),
          drIn(ordersTable.customerPhone, phoneVariants),
        ))
        .orderBy(drDesc(ordersTable.id))
        .limit(10)
        .then(rows => {
          // Sort by priority: active statuses first
          return rows.sort((a, b) => {
            const ai = STATUS_PRIORITY.indexOf(a.status ?? "");
            const bi = STATUS_PRIORITY.indexOf(b.status ?? "");
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
        });

      if (recentOrder) {
        const orderStatus = recentOrder.status ?? "nouveau";
        const isCancelled = orderStatus === "annulé" || orderStatus === "annulé fake";

        if (isCancelled) {
          // Cancelled order — tell them it was cancelled, offer to re-order
          const gender2 = detectGender(recentOrder.customerName ?? "");
          const addr2 = getGenderAddress(gender2);
          const cancelledMsg = `السلام عليكم ${addr2.formal}! الكوموند السابقة ديالك راها ألغات. إلا بغيتي تكمل طلب جديد، راسلنا وغنساعدوك 🙏`;
          // Create a temp conv to send the message
          const cancelConv = await storage.createAiConversation({
            storeId, orderId: recentOrder.id, customerPhone,
            customerName: recentOrder.customerName ?? null,
            status: "closed", isManual: 0, conversationStep: 1,
          });
          await storage.createAiLog({ storeId, orderId: recentOrder.id, customerPhone, role: "user", message: customerMessage });
          await storage.createAiLog({ storeId, orderId: recentOrder.id, customerPhone, role: "assistant", message: cancelledMsg });
          await storage.updateAiConversationLastMessage(cancelConv.id, cancelledMsg);
          broadcastToStore(storeId, "message", { conversationId: cancelConv.id, role: "assistant", content: cancelledMsg, ts: Date.now() });
          await queueWhatsApp(storeId, customerPhone, cancelledMsg);
          console.log(`[AI] Replied to cancelled-order customer ${customerPhone} — no new conv opened`);
          return;
        }

        // For active/shipped/delivered orders — create a live delivery companion conv
        const startStep = (orderStatus === "nouveau") ? 2 : 1;
        console.log(`[AI] Re-opening conv for ${customerPhone} — order #${recentOrder.id} status="${orderStatus}"`);
        const newConv = await storage.createAiConversation({
          storeId,
          orderId: recentOrder.id,
          customerPhone,
          customerName: recentOrder.customerName ?? null,
          status: "active",
          isManual: 0,
          conversationStep: startStep,
        });
        conv = newConv;
      } else {
        // No order at all for this phone — nothing to do here (leads handled separately)
        return;
      }
    }

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
      broadcastToStore(storeId, "needs_attention", {
        conversationId: conv.id,
        customerPhone,
        customerName: conv.customerName ?? null,
        trigger: customerMessage.substring(0, 80),
        ts: Date.now(),
      });
      console.log(`[AI] Attention needed: conv=${conv.id} phone=${customerPhone} trigger="${customerMessage.substring(0, 40)}"`);
    }

    // ── Fast intent detection — works at any step ─────────────────
    const intent = detectIntent(customerMessage);

    // Fetch live order status from DB to determine current phase
    let liveOrderStatus: string | null = null;
    if (conv.orderId) {
      const [liveOrder] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, conv.orderId));
      liveOrderStatus = liveOrder?.status ?? null;
    }

    const gender = detectGender(conv.customerName ?? "");
    const addr = getGenderAddress(gender);

    if (intent === "confirm" && conv.orderId) {
      // Only auto-confirm if order is still in "nouveau" state (not already confirmed)
      if (liveOrderStatus === "nouveau" || liveOrderStatus === null) {
        await storage.updateOrderStatus(conv.orderId, "confirme");
        const msg = `صافي ${addr.formal}! الكوموند ديالك تأكدات ✅ غتخرج اليوم إن شاء الله. شكراً بزاف على ثقتك فينا 🎉🚀`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
        await storage.updateAiConversationLastMessage(conv.id, msg);
        // Keep conv ACTIVE — delivery companion continues
        broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now() });
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, msg);
        console.log(`[AI] Order ${conv.orderId} CONFIRMED by ${conv.customerName} — conv stays ACTIVE for delivery companion`);
        return;
      }
      // Already confirmed — fall through to delivery companion AI reply
    }

    if (intent === "cancel" && conv.orderId) {
      const isPostConfirm = liveOrderStatus === "confirme" || liveOrderStatus === "expédié" || liveOrderStatus === "en_cours";
      const cancelStatus = isPostConfirm ? "annulé" : "annulé fake";
      await storage.updateOrderStatus(conv.orderId, cancelStatus);
      await storage.updateAiConversationStatus(conv.id, "cancelled");
      const msg = `مفهوم ${addr.formal} 🙏 إلا بغيتي تكمل أو عندك سؤال راسل المتجر مباشرة. نتمنى نخدموا معك قريبا!`;
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      if (isPostConfirm) {
        // Admin toast — confirmed order cancelled via WhatsApp
        broadcastToStore(storeId, "post_confirm_cancel", {
          conversationId: conv.id,
          orderId: conv.orderId,
          customerName: conv.customerName,
          customerPhone,
          message: `⚠️ ${conv.customerName ?? customerPhone} a annulé sa commande #${conv.orderId} via WhatsApp`,
          ts: Date.now(),
        });
        console.log(`[AI] ⚠️ POST-CONFIRM CANCEL: Order ${conv.orderId} cancelled by ${conv.customerName} via WhatsApp`);
      }
      await queueWhatsApp(storeId, customerPhone, msg);
      console.log(`[AI] Order ${conv.orderId} CANCELLED (${cancelStatus}) by ${conv.customerName}`);
      return;
    }

    // ── Step-based AI reply ───────────────────────────────────────
    const currentStep = conv.conversationStep ?? 1;
    console.log(`[INCOMING] Conv ${conv.id} | Phone: ${customerPhone} | Step: ${currentStep} | Msg: "${customerMessage.substring(0, 80)}"`);
    broadcastToStore(storeId, "typing", { conversationId: conv.id, ts: Date.now() });
    console.log(`[SOCKET_EMIT] typing → conv ${conv.id}`);

    try {
      const settings = await storage.getAiSettings(storeId);

      // Determine if recovery conversation
      let isRecovery = false;
      if (conv.orderId) {
        const [orderRow] = await db.select({ wasAbandoned: orders.wasAbandoned }).from(orders).where(eq(orders.id, conv.orderId));
        isRecovery = (orderRow?.wasAbandoned ?? 0) === 1;
      }

      const ctx = conv.orderId ? await getOrderContext(conv.orderId) : null;
      const storeName = await getStoreName(storeId);

      // Build step-specific system prompt
      const systemPrompt = isRecovery
        ? RECOVERY_SYSTEM_PROMPT
        : buildStepPrompt(currentStep, ctx, storeName, conv, settings?.systemPrompt);

      // Build message history — filter null/empty messages to avoid OpenAI rejection
      const recentLogs = conv.orderId
        ? await storage.getAiLogs(storeId, conv.orderId)
        : await storage.getAiLogs(storeId, undefined, conv.id);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...recentLogs
          .filter(l => l.message && l.message.trim().length > 0)
          .slice(-14)
          .map((l) => ({
            role: (l.role === "user" ? "user" : "assistant") as "user" | "assistant",
            content: l.message as string,
          })),
      ];

      const { client: ai, model, provider } = await resolveAIClient(storeId);
      console.log(`[AI_THINKING] Conv ${conv.id} | Model: ${model} | History: ${messages.length} msgs → sending to ${provider}...`);
      const completion = await ai.chat.completions.create({ model, messages, max_tokens: 200, temperature: 0.7 });
      const aiReply = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!aiReply) throw new Error("Empty AI response");

      console.log(`[SUCCESS]: AI replied on conv ${conv.id} via ${provider}/${model} — step ${currentStep} — "${aiReply.substring(0, 60)}..."`);

      // ── Advance step based on what the customer just said ────────
      // Skip step advancement when in delivery companion mode (order already confirmed)
      const isDeliveryMode = ctx?.orderStatus === "confirme" || ctx?.orderStatus === "expédié" || ctx?.orderStatus === "en_cours";
      if (!isRecovery && !isDeliveryMode) {
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
      console.log(`[SOCKET_EMIT] message (assistant) → conv ${conv.id} | "${aiReply.substring(0, 60)}"`);
      console.log(`[OUTGOING] AI reply queued for ${customerPhone} | Conv: ${conv.id}`);

      // ── Post-AI confirmation sync: if AI reply signals order confirmed, update DB ──
      // Catches cases where customer said ok in a phrasing detectIntent missed,
      // but the AI correctly understood and replied with a confirmation.
      if (conv.orderId && liveOrderStatus === "nouveau") {
        const replyLower = aiReply.toLowerCase();
        const aiConfirmedOrder =
          replyLower.includes("غتخرج اليوم") ||
          replyLower.includes("تأكدات") ||
          replyLower.includes("الطلب تأكد") ||
          (replyLower.includes("مزيان") && replyLower.includes("خرج")) ||
          (replyLower.includes("شكراً") && replyLower.includes("اليوم"));
        if (aiConfirmedOrder) {
          console.log(`[AI] Post-reply confirm detected → updating order ${conv.orderId} to 'confirme'`);
          await storage.updateOrderStatus(conv.orderId, "confirme");
          broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: aiReply, ts: Date.now() });
        }
      }

      // ── Long conversation detection: 8+ messages without decision ──
      // Fires exactly once at message 8 (even count) to notify admin
      const totalLogs = conv.orderId
        ? await storage.getAiLogs(storeId, conv.orderId)
        : await storage.getAiLogs(storeId, undefined, conv.id);
      if (totalLogs.length === 8 || totalLogs.length === 16) {
        console.log(`[AI] ⏱️ Long conversation: conv ${conv.id} has ${totalLogs.length} messages — notifying admin`);
        broadcastToStore(storeId, "long_chat", {
          conversationId: conv.id,
          messageCount: totalLogs.length,
          customerName: conv.customerName,
          ts: Date.now(),
        });
      }

      await queueWhatsApp(storeId, customerPhone, aiReply);

    } catch (aiErr: any) {
      const richErr = enrichAiError(aiErr);
      console.error("[AI] Reply error:", richErr.message);
      const isKeyError = richErr.message.includes("401") || richErr.message.includes("402") || richErr.message.includes("Clé OpenRouter");
      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "ai_error", {
        conversationId: conv.id,
        error: richErr.message,
        isKeyError,
        customerPhone,
        customerName: conv.customerName ?? null,
        ts: Date.now(),
      });

      if (!isKeyError) {
        // Non-key error → mark attention + send fallback to customer
        await storage.updateConversationNeedsAttention(conv.id, 1);
        broadcastToStore(storeId, "needs_attention", {
          conversationId: conv.id,
          customerPhone,
          customerName: conv.customerName ?? null,
          trigger: "AI generation failed",
          ts: Date.now(),
        });
        const fallback = "شكرا على رسالتك 🙏 سيتواصل معاك فريقنا خلال دقائق.";
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: fallback });
        await storage.updateAiConversationLastMessage(conv.id, fallback);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: fallback, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, fallback);
      }
      // Key errors: keep conv ACTIVE so AI auto-retries once key is fixed — admin sees banner
    }

  } catch (err: any) {
    console.error(`[AI] handleIncomingMessage error (phone ${customerPhone}):`, err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   LEAD SALES MODE — Facebook Ads WhatsApp Conversion
   State machine: AWAITING_NAME → AWAITING_CITY → AWAITING_ADDRESS
                  → (AWAITING_PRODUCT) → AWAITING_CONFIRM → DONE
════════════════════════════════════════════════════════════════ */

type LeadStage = "AWAITING_NAME" | "AWAITING_CITY" | "AWAITING_ADDRESS" | "AWAITING_QUANTITY" | "AWAITING_PRODUCT" | "AWAITING_CONFIRM" | "DONE";

/* ── Find best matching product for a store from a free-text message ── */
async function detectLeadProduct(storeId: number, message: string): Promise<{ id: number; name: string; price: number; description: string } | null> {
  const prods = await storage.getProductsByStore(storeId);
  if (prods.length === 0) return null;

  const lower = message.toLowerCase();
  // Keyword match: any significant word in product name found in message
  for (const p of prods) {
    const words = (p.name || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => lower.includes(w)) || lower.includes((p.name || "").toLowerCase())) {
      return { id: p.id, name: p.name || "Produit", price: p.price ?? 0, description: (p as any).descriptionDarija || (p as any).description || (p as any).aiFeatures || "" };
    }
  }
  // If store has only 1 product, use it automatically
  if (prods.length === 1) {
    const p = prods[0];
    return { id: p.id, name: p.name || "Produit", price: p.price ?? 0, description: (p as any).descriptionDarija || (p as any).description || (p as any).aiFeatures || "" };
  }
  return null;
}

/* ── Generate a lead-stage specific AI reply ─────────────────────────── */
async function generateLeadReply(
  storeId: number,
  stage: LeadStage,
  conv: AiConversation,
  customerMessage: string,
  storeName: string,
  productList?: string,
): Promise<string> {
  const name    = conv.leadName        || "";
  const product = conv.leadProductName || "المنتج";
  const city    = conv.leadCity        || "";
  const priceLabel = conv.leadPrice ? `${Math.round(conv.leadPrice / 100)} درهم` : "...";

  // Cached fallback replies — used if AI call fails
  const fallbacks: Partial<Record<LeadStage, string>> = {
    AWAITING_NAME:     `مرحبا ${name || "صديقي"} 😊! فأي مدينة غتوصلوك؟`,
    AWAITING_CITY:     `مزيان ${name}! أعطيني عنوانك بالتفصيل (الحي والشارع) 📦`,
    AWAITING_ADDRESS:  `صافي ${name} 📋 شحال بغيتي من ${product}؟ (1، 2، ...)`,
    AWAITING_QUANTITY: `صافي ${name} 📋\n✅ ${product}\n📍 ${city} — ${customerMessage}\n💰 ${priceLabel} + شحن مجاني\nواش نؤكد ليك؟`,
    AWAITING_CONFIRM:  `شكراً على السؤال 🙏 المنتج ممتاز والتوصيل مجاني. واش نؤكد ليك الطلبية؟`,
  };

  try {
    // ── Load product knowledge (AWAITING_CONFIRM only) ────────────
    let productKnowledge = "";
    if (stage === "AWAITING_CONFIRM" && conv.leadProductId) {
      try {
        const [p] = await db
          .select({ descriptionDarija: products.descriptionDarija, description: products.description, aiFeatures: products.aiFeatures })
          .from(products)
          .where(eq(products.id, conv.leadProductId));
        if (p) {
          const desc  = (p.descriptionDarija || p.description || "").trim();
          const feats = p.aiFeatures
            ? (() => { try { return (JSON.parse(p.aiFeatures!) as string[]).join("، "); } catch { return ""; } })()
            : "";
          productKnowledge = [desc, feats].filter(Boolean).join(" | ");
          if (productKnowledge) console.log(`[Lead] Product knowledge loaded for product ${conv.leadProductId}: "${productKnowledge.substring(0, 80)}..."`);
        }
      } catch (pkErr: any) {
        console.warn(`[Lead] product-knowledge load failed for product ${conv.leadProductId}:`, pkErr.message);
      }
    }

    const systemPrompts: Record<LeadStage, string> = {
      AWAITING_NAME:     `أنت وكيل مبيعات محترف "Sales Closer" من متجر "${storeName}" على واتساب. العميل تواصل معك بعد رؤية إعلانك. تحدث فقط بالدارجة المغربية الطبيعية. إذا سأل عن المنتج أو الثمن أو الجودة: أجبه بثقة باستخدام معلومات المنتج: ${productList || product}. هدفك: أجب على أسئلته، ثم أكد اسمه واسأله عن المدينة ديالو للتوصيل. جواب 2-3 سطر.`,
      AWAITING_CITY:     `أنت وكيل مبيعات من "${storeName}". العميل اسمو "${name}". أكد المدينة واسأله عن العنوان الكامل (الحي والشارع) باش نوصلوه مزيان. دارجة مغربية طبيعية. جواب 2 سطر.`,
      AWAITING_ADDRESS:  `أنت وكيل مبيعات من "${storeName}". العميل اسمو "${name}"، ساكن ف "${city}". أعطاك العنوان. الآن اسأله كم عدد القطع بغيهم من ${product}. دارجة مغربية. جواب سطر واحد.`,
      AWAITING_QUANTITY: `أنت وكيل مبيعات من "${storeName}". العميل اسمو "${name}"، ساكن ف "${city}". أعطاك الكمية. دير ملخص الطلبية بالكامل:\n- المنتج: ${product}\n- المدينة: ${city}\n- الكمية: القطع المطلوبة\n- الثمن: ${priceLabel} (توصيل مجاني)\n- الدفع عند الاستلام "قلب عاد خلص" ✅\nواسأله "واش نؤكد ليك الطلبية؟" بالدارجة. جواب 4 سطر.`,
      AWAITING_PRODUCT:  `أنت وكيل مبيعات من "${storeName}". العميل بغى يطلب منتج من هاد القائمة:\n${productList || "—"}\nبناءً على جواب العميل: "${customerMessage}"، دير مطابقة وقول لو المنتج لي اخترو وسأله "واش هادا هو؟". دارجة مغربية. جواب 2 سطر.`,
      AWAITING_CONFIRM:  `أنت وكيل مبيعات محترف من "${storeName}".\nالمنتج: ${product}\nالثمن: ${priceLabel}\nالدفع عند الاستلام "قلب عاد خلص"\nالتوصيل مجاني 24-48 ساعة${productKnowledge ? `\nمعلومات المنتج: ${productKnowledge}` : ""}.\n\nإذا سألك العميل عن الجودة أو الثمن أو التوصيل: جاوبه بثقة باستخدام معلومات المنتج.\nإذا قال "واخا" أو "نعم" أو "موافق": قل له الطلبية تأكدات.\nإذا رفض: ودعه بلطف.\nدارجة مغربية طبيعية. 2-3 سطر.`,
      DONE:              `قل للعميل أن طلبيته في المعالجة وأنكم ستتواصل معه للتأكيد. دارجة مغربية. سطر واحد.`,
    };

    // ── Call AI ───────────────────────────────────────────────────
    const { client: ai, model } = await resolveAIClient(storeId);
    const logs = await storage.getAiLogs(storeId, undefined, conv.id);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompts[stage] },
      // Filter out null/empty messages to avoid OpenAI rejection
      ...logs.slice(-8)
        .filter(l => l.message && l.message.trim().length > 0)
        .map(l => ({
          role: (l.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: l.message as string,
        })),
      { role: "user", content: customerMessage },
    ];
    const completion = await ai.chat.completions.create({ model, messages, max_tokens: 200, temperature: 0.75 });
    return completion.choices[0]?.message?.content?.trim() || fallbacks[stage] || "شكراً على رسالتك 🙏";

  } catch (err: any) {
    console.warn(`[Lead] generateLeadReply fallback (stage=${stage}):`, err.message);
    return fallbacks[stage] || "شكراً 🙏";
  }
}

/* ════════════════════════════════════════════════════════════════
   TRIGGER — Called when a new FB-Ads lead contacts for the first time
════════════════════════════════════════════════════════════════ */
export async function triggerLeadConversation(
  storeId: number,
  phone: string,
  initialMessage: string,
  whatsappJid?: string,
): Promise<void> {
  console.log(`[Lead] 🎯 New FB-Ads lead: store=${storeId} phone=${phone} msg="${initialMessage.substring(0, 60)}"`);

  if (!(await storeHasAIKey(storeId))) {
    console.warn(`[Lead] No AI key for store ${storeId} — ignoring new lead`);
    return;
  }

  // Avoid duplicate lead convs for the same phone
  const existing = await storage.getActiveAiConversationByPhone(storeId, phone);
  if (existing) {
    console.log(`[Lead] Already have active conv ${existing.id} for ${phone} — routing to it`);
    if (existing.isNewLead) {
      await handleLeadMessage(storeId, phone, initialMessage, existing);
    } else {
      await handleIncomingMessage(storeId, phone, initialMessage);
    }
    return;
  }

  try {
    const [storeName, productMatch] = await Promise.all([
      getStoreName(storeId),
      detectLeadProduct(storeId, initialMessage),
    ]);

    const prods = await storage.getProductsByStore(storeId);

    // Build product catalogue snippet for the AI (so it can describe features)
    const productCatalogue = prods.length > 0
      ? prods.map(p => {
          const desc = (p as any).descriptionDarija || (p as any).description || "";
          let feats = "";
          if ((p as any).aiFeatures) {
            try { feats = (JSON.parse((p as any).aiFeatures) as string[]).slice(0, 3).join("، "); } catch {}
          }
          return `• ${p.name} — ${Math.round((p.price ?? 0) / 100)} DH${desc ? ` | ${desc.substring(0, 80)}` : ""}${feats ? ` | ${feats}` : ""}`;
        }).join("\n")
      : "";

    // ── Generate contextual AI greeting that responds to the customer's first message ──
    let greeting = "";
    try {
      const { client: ai, model } = await resolveAIClient(storeId);
      const greetingSystem =
        `أنت بائع محترف من متجر "${storeName}" على واتساب. وصلتك رسالة من عميل جديد رأى إعلانك على فيسبوك أو واتساب.\n` +
        `هدفك: رحب بيه بدفء بالدارجة المغربية، رد على سؤاله أو اهتمامه بالمنتج إذا ذكر شي، ` +
        `قدم المنتج المناسب إذا كان عندك معلومات عليه، وفي آخر الرسالة اسأله عن اسمه الكامل باش تكمل معه الطلبية.\n` +
        `منتجاتنا المتاحة:\n${productCatalogue || "— متجر عام —"}\n` +
        `⚠️ مهم: رد بالدارجة المغربية الطبيعية فقط. لا تتحدث بالفصحى. جواب 3-4 سطر. ` +
        `لا تذكر أنك روبوت. في نهاية ردك اسأل: "دير لي عافاك اسمك الكامل 📝"`;

      const completion = await ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: greetingSystem },
          { role: "user", content: initialMessage },
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      greeting = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (aiErr: any) {
      console.warn(`[Lead] AI greeting failed, using static fallback:`, aiErr.message);
    }

    // Fallback to static greeting if AI fails
    if (!greeting) {
      greeting =
        `السلام عليكم! 👋 معاك فريق ${storeName} 🌟\n` +
        (productMatch
          ? `شفنا باللي كنتي مهتم بـ *${productMatch.name}* — المنتج ممتاز وتوصيل مجاني 🚚\n`
          : `يسعدنا نساعدك ونجيب ليك اللي بغيتي 😊\n`) +
        `دير لي عافاك *اسمك الكامل* باش نكملو معاك 📝`;
    }

    const conv = await storage.createAiConversation({
      storeId,
      orderId: null,
      customerPhone: phone,
      customerName: null,
      status: "active",
      isManual: 0,
      conversationStep: 1,
      isNewLead: 1,
      leadStage: "AWAITING_NAME",
      leadProductId: productMatch?.id ?? null,
      leadProductName: productMatch?.name ?? null,
      leadPrice: productMatch?.price ?? null,
      whatsappJid: whatsappJid ?? null,
    } as any);

    // Log customer's initial message first
    await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "user", message: initialMessage });
    // Log AI greeting
    await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "assistant", message: greeting });
    await storage.updateAiConversationLastMessage(conv.id, greeting);

    broadcastToStore(storeId, "new_conversation", {
      conversation: { ...conv, lastMessage: greeting, isNewLead: 1, leadStage: "AWAITING_NAME", leadLabel: "Nouveau Prospect" },
      message: { role: "assistant", content: greeting, ts: Date.now(), isNewLead: true },
    });
    // Also broadcast the customer's initial message so it appears in the chat
    broadcastToStore(storeId, "message", {
      conversationId: conv.id, role: "user", content: initialMessage, ts: Date.now() - 500, isNewLead: true,
    });

    await queueWhatsApp(storeId, phone, greeting);
    console.log(`[Lead] ✅ Lead conv ${conv.id} created for ${phone} — product: ${productMatch?.name ?? "unknown"}`);
  } catch (err: any) {
    console.error(`[Lead] triggerLeadConversation error:`, err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   HANDLE — Each subsequent message in a lead conversation
════════════════════════════════════════════════════════════════ */
export async function handleLeadMessage(
  storeId: number,
  phone: string,
  message: string,
  conv: AiConversation,
): Promise<void> {
  if (!conv.isNewLead) return; // Safety guard

  const stage = (conv.leadStage || "AWAITING_NAME") as LeadStage;
  console.log(`[Lead] Conv ${conv.id} @ ${stage} — "${message.substring(0, 60)}"`);

  // Log + broadcast customer message
  await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "user", message });
  await storage.updateAiConversationLastMessage(conv.id, message);
  broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: message, ts: Date.now(), isNewLead: true });

  // Human escalation
  if (detectAttentionNeeded(message)) {
    await storage.updateConversationNeedsAttention(conv.id, 1);
    broadcastToStore(storeId, "needs_attention", { conversationId: conv.id, ts: Date.now() });
  }

  broadcastToStore(storeId, "typing", { conversationId: conv.id, ts: Date.now() });

  try {
    const storeName = await getStoreName(storeId);
    let reply = "";
    let nextStage: LeadStage = stage;
    let leadUpdates: Parameters<typeof storage.updateLeadFields>[1] = {};

    /* ── State transitions ─────────────────────────────────────── */
    if (stage === "AWAITING_NAME") {
      // Take message as name (trim to first 3 words max)
      const extractedName = message.trim().split(/[\n,،]+/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
      leadUpdates = { leadName: extractedName, leadStage: "AWAITING_CITY" };
      nextStage = "AWAITING_CITY";
      // Reload conv with name for reply
      const updatedConv = { ...conv, leadName: extractedName };
      reply = await generateLeadReply(storeId, "AWAITING_NAME", updatedConv as any, message, storeName);

    } else if (stage === "AWAITING_CITY") {
      const detectedCity = detectCity(message);
      // Short message (1-3 words, no question, no cancel) is probably a city even if unknown to our list
      const wordCount = message.trim().split(/\s+/).length;
      const isLikelyCity = !detectedCity && wordCount <= 3 && !message.includes("؟") && !message.includes("?")
        && !CANCEL_KEYWORDS.some(kw => message.toLowerCase().includes(kw.toLowerCase()))
        && !CONFIRM_KEYWORDS.some(kw => message.toLowerCase().includes(kw.toLowerCase()));
      const cityValue = detectedCity || (isLikelyCity ? message.trim() : null);
      if (cityValue) {
        // City accepted → advance to address
        leadUpdates = { leadCity: cityValue, leadStage: "AWAITING_ADDRESS" };
        nextStage = "AWAITING_ADDRESS";
        reply = await generateLeadReply(storeId, "AWAITING_CITY", { ...conv, leadCity: cityValue } as any, message, storeName);
        console.log(`[Lead] Conv ${conv.id} AWAITING_CITY: city accepted = "${cityValue}" (detected=${!!detectedCity})`);
      } else {
        // Message too long / looks like a sentence — ask again (do NOT save garbage as city)
        nextStage = "AWAITING_CITY";
        reply = `عفاك ${conv.leadName || "صديقي"} 🙏، محتاجين تعطيني المدينة ديالك باش نوصلوك الطلبية — مثلاً: الدار البيضاء، الرباط، مراكش، أكادير...`;
        console.log(`[Lead] Conv ${conv.id} AWAITING_CITY: city not recognised in "${message.substring(0, 40)}" — asking again`);
      }

    } else if (stage === "AWAITING_ADDRESS") {
      const address = message.trim();
      // Always ask for quantity next (new stage)
      leadUpdates = { leadAddress: address, leadStage: "AWAITING_QUANTITY" };
      nextStage = "AWAITING_QUANTITY";
      reply = await generateLeadReply(storeId, "AWAITING_ADDRESS", { ...conv, leadAddress: address } as any, message, storeName);

    } else if (stage === "AWAITING_QUANTITY") {
      // Extract quantity from message (number detection)
      const num = parseInt(message.trim().replace(/[^\d]/g, "")) || 1;
      const qty = Math.max(1, Math.min(100, num));
      // Now decide next stage: product detection or confirm
      if (!conv.leadProductId) {
        const prods = await storage.getProductsByStore(storeId);
        if (prods.length > 1) {
          const productList = prods.map((p, i) => `${i + 1}. ${p.name} — ${Math.round((p.price || 0) / 100)} DH`).join("\n");
          leadUpdates = { leadQuantity: qty, leadStage: "AWAITING_PRODUCT" };
          nextStage = "AWAITING_PRODUCT";
          reply = await generateLeadReply(storeId, "AWAITING_QUANTITY", { ...conv, leadQuantity: qty } as any, message, storeName, productList);
        } else if (prods.length === 1) {
          leadUpdates = { leadQuantity: qty, leadProductId: prods[0].id, leadProductName: prods[0].name, leadPrice: prods[0].price ?? 0, leadStage: "AWAITING_CONFIRM" };
          nextStage = "AWAITING_CONFIRM";
          reply = await generateLeadReply(storeId, "AWAITING_QUANTITY", { ...conv, leadQuantity: qty, leadProductName: prods[0].name, leadPrice: prods[0].price ?? 0 } as any, message, storeName);
        } else {
          leadUpdates = { leadQuantity: qty, leadStage: "AWAITING_CONFIRM" };
          nextStage = "AWAITING_CONFIRM";
          reply = await generateLeadReply(storeId, "AWAITING_QUANTITY", { ...conv, leadQuantity: qty } as any, message, storeName);
        }
      } else {
        leadUpdates = { leadQuantity: qty, leadStage: "AWAITING_CONFIRM" };
        nextStage = "AWAITING_CONFIRM";
        reply = await generateLeadReply(storeId, "AWAITING_QUANTITY", { ...conv, leadQuantity: qty } as any, message, storeName);
      }

    } else if (stage === "AWAITING_PRODUCT") {
      // Try to match product from message
      const prods = await storage.getProductsByStore(storeId);
      let matched = await detectLeadProduct(storeId, message);
      // Also try by number (e.g. customer says "1" or "الأول")
      if (!matched) {
        const num = parseInt(message.trim());
        if (!isNaN(num) && num >= 1 && num <= prods.length) matched = { id: prods[num - 1].id, name: prods[num - 1].name || "", price: prods[num - 1].price ?? 0, description: "" };
      }
      if (matched) {
        leadUpdates = { leadProductId: matched.id, leadProductName: matched.name, leadPrice: matched.price, leadStage: "AWAITING_CONFIRM" };
        nextStage = "AWAITING_CONFIRM";
        reply = await generateLeadReply(storeId, "AWAITING_PRODUCT", { ...conv, leadProductName: matched.name, leadPrice: matched.price } as any, message, storeName);
      } else {
        // Product not matched — ask again
        const productList = prods.map((p, i) => `${i + 1}. ${p.name} — ${Math.round((p.price || 0) / 100)} DH`).join("\n");
        reply = `عافاك، اختار المنتج من اللي قلت:\n${productList}`;
        nextStage = "AWAITING_PRODUCT";
      }

    } else if (stage === "AWAITING_CONFIRM") {
      const intent = detectIntent(message);

      if (intent === "confirm") {
        // ── Create the order! ─────────────────────────────────────
        try {
          const order = await storage.createOrderFromLead({
            storeId,
            customerName: conv.leadName || "Lead",
            customerPhone: phone,
            customerCity: conv.leadCity || "",
            customerAddress: conv.leadAddress || "",
            productId: conv.leadProductId ?? null,
            productName: conv.leadProductName || "",
            price: conv.leadPrice ?? 0,
            quantity: conv.leadQuantity ?? 1,
          });

          await storage.updateLeadFields(conv.id, { leadStage: "DONE", createdOrderId: order.id });
          await storage.updateAiConversationStatus(conv.id, "confirmed");

          const successMsg =
            `يا سلاامم ${conv.leadName || "صديقي"} 🎉✅\n` +
            `الطلبية ديالك تأكدات بنجاح!\n` +
            `📦 *${conv.leadProductName}* غيوصلك ف 24-48 ساعة إن شاء الله\n` +
            `💰 كتخلص عند الاستلام — قلب عاد خلص 🙏\n` +
            `شكراً بزاف على ثقتك فينا! 🌟`;

          await storage.createAiLog({ storeId, orderId: order.id, convId: conv.id, customerPhone: phone, role: "assistant", message: successMsg });
          await storage.updateAiConversationLastMessage(conv.id, successMsg);
          broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
          broadcastToStore(storeId, "lead_confirmed", { conversationId: conv.id, orderId: order.id, orderNumber: order.orderNumber, customerName: conv.leadName, ts: Date.now() });
          broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: successMsg, ts: Date.now(), isNewLead: true });
          await queueWhatsApp(storeId, phone, successMsg);
          console.log(`[Lead] 🎉 Order CREATED from lead — orderId=${order.id} orderNumber=${order.orderNumber} customer=${conv.leadName}`);
          return;
        } catch (err: any) {
          console.error(`[Lead] Order creation error:`, err.message);
          reply = "كاين شي مشكل تقني، فريقنا غيتواصل معاك دابا 🙏";
        }

      } else if (intent === "cancel") {
        await storage.updateAiConversationStatus(conv.id, "cancelled");
        reply = `مفهوم، لا باس 🙏 إلا غيرت رأيك أو عندك سؤال راسلنا — نتمنى نخدموا معك قريبا!`;
        await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "assistant", message: reply });
        await storage.updateAiConversationLastMessage(conv.id, reply);
        broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: reply, ts: Date.now() });
        await queueWhatsApp(storeId, phone, reply);
        return;
      } else {
        // Customer has a question — use AI with product knowledge
        reply = await generateLeadReply(storeId, "AWAITING_CONFIRM", conv, message, storeName);
        nextStage = "AWAITING_CONFIRM"; // Stay on this stage
      }
    }

    // Apply lead field updates + persist
    if (Object.keys(leadUpdates).length > 0) {
      await storage.updateLeadFields(conv.id, leadUpdates);
    }

    // Log + broadcast AI reply
    await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "assistant", message: reply });
    await storage.updateAiConversationLastMessage(conv.id, reply);
    broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: reply, ts: Date.now(), isNewLead: true, leadStage: nextStage });

    await queueWhatsApp(storeId, phone, reply);

  } catch (err: any) {
    console.error(`[Lead] handleLeadMessage error (conv ${conv.id}):`, err.message);
    broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
    const fallback = "شكراً على رسالتك 🙏 سيتواصل معاك فريقنا قريباً.";
    await storage.createAiLog({ storeId, orderId: null, convId: conv.id, customerPhone: phone, role: "assistant", message: fallback });
    await storage.updateAiConversationLastMessage(conv.id, fallback);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: fallback, ts: Date.now() });
    await queueWhatsApp(storeId, phone, fallback);
  }
}

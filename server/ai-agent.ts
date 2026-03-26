import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage, sendWhatsAppImage } from "./whatsapp-service";
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
  "إلغاء",              // "cancellation"
  "الغاء",              // "cancellation" (alt spelling)
  "ألغي",               // "cancel (it)"
  "الغيت",              // "I cancelled"
  "بدلت رأيي",          // "I changed my mind"
  "غيرت رأيي",          // "I changed my mind"
  "بدلت راي",           // "I changed my mind"
  "غيرت راي",           // merged
  "ما كنبغيهاش",        // "I don't want it (f)"
  "ما كنبغيهش",         // "I don't want it (m)"
  "مبقيتش بغيت",        // "I no longer want it" (alt)
  "annuler",             // French cancel
  "cancel",              // English cancel
  "ما كناخدوش",         // "we won't take it"
  "ما بقيناش",          // "we no longer (want it)"
];
// ── Image request keywords — customer wants to see the product ──
const IMAGE_KEYWORDS = [
  "صيفط ليا تصويرة", "صيفط تصويرة", "صيفط ليا صورة", "صيفط صورة",
  "بنيت نشوفو", "نبغي نشوفو", "نبغي نشوفها", "وريني", "ورينيها", "وريهولي",
  "وريني صباط", "وريني المنتج", "وريني القاعدة", "كيف كيفاش هو", "كيفاش يبان",
  "send photo", "send image", "show me photo", "photo stp", "photo svp",
  "صورة", "تصويرة", "photo", "image du produit",
  "بنيتي نشوفها", "بغيت نشوف", "مممكن تعطيني صورة",
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

function detectIntent(msg: string): "confirm" | "cancel" | "image" | null {
  const lower = msg.toLowerCase().trim();

  // Image request check — check before confirm to catch "وريني" which can overlap
  if (IMAGE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "image";

  // Confirm check
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

/* ── JSON decision parser (robust, never throws) ────────────── */
interface AIDecision { reply: string; isConfirmed: boolean; isCancelled: boolean; }

function parseAIDecision(raw: string): AIDecision {
  // Strip markdown code fences if present
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    // Try to extract the first JSON object in the response
    const match = stripped.match(/\{[\s\S]*"reply"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const reply = String(parsed.reply ?? parsed.message ?? "").trim();
      return {
        reply: reply || stripped,
        isConfirmed: !!(parsed.is_confirmed ?? parsed.isConfirmed ?? false),
        isCancelled: !!(parsed.is_cancelled ?? parsed.isCancelled ?? false),
      };
    }
  } catch { /* ignore JSON parse error, fall through */ }
  // Fallback: treat the whole response as the reply text, no decision signals
  return { reply: stripped || raw, isConfirmed: false, isCancelled: false };
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
    await sendWhatsAppMessage(item.phone, item.message, storeId);
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
  productImageUrl: string | null;
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
    let productImageUrl: string | null = null;

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
          imageUrl: products.imageUrl,
        }).from(products).where(eq(products.id, item.productId));
        if (p) {
          if (!productName) productName = p.name ?? null;
          stockQty = p.stock ?? null;
          // Use descriptionDarija first, fall back to regular description
          descriptionDarija = p.descriptionDarija || p.description || null;
          productImageUrl = p.imageUrl ?? null;
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
      productImageUrl,
    };
  } catch {
    return { productName: null, productVariant: null, totalPrice: null, customerCity: null, stockQty: null, productId: null, descriptionDarija: null, aiFeatures: null, orderStatus: null, trackNumber: null, shippingProvider: null, productImageUrl: null };
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

/* ── JSON output mandate appended to every prompt ───────────── */
const JSON_OUTPUT_RULE = `
━━━ MANDATORY JSON OUTPUT FORMAT ━━━
You MUST respond with ONLY a valid JSON object — NO markdown, NO code fences, NO extra text before or after.
Format:
{"reply":"<your Darija response here>","is_confirmed":false,"is_cancelled":false}

Rules for the flags:
- Set "is_confirmed": true ONLY when the customer explicitly agrees to receive the order (e.g. "واخا", "صيفطوه", "ok", "موافق", "نعم").
- Set "is_cancelled": true ONLY when the customer explicitly says they no longer want it (e.g. "بلاش", "ما بقيتش", "ما بغيتش").
- For ALL other messages (questions, hesitation, chatting): set BOTH to false and keep the conversation going.
- NEVER set is_confirmed=true just because the customer asked a question.
- After confirmation, keep responding helpfully — the conversation does not end.`;

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

  const genderNote = gender === "male"
    ? `Customer is MALE — always call him "سيدي" or "خويا"`
    : gender === "female"
      ? `Customer is FEMALE — always call her "لالة" or "ختي"`
      : `Gender unknown — use "سيدي/لالة"`;

  const base = `You are "أمين", a patient and helpful human customer service agent at "${storeName}" (Moroccan e-commerce store). You are a trusted Moroccan salesperson — never pushy, always supportive.

GENDER RULE (MANDATORY):
- Customer name: "${conv.customerName ?? "unknown"}" → ${genderNote}
- ALWAYS use the correct gender address throughout the ENTIRE conversation

LANGUAGE & STYLE:
- Write ONLY in natural Moroccan Darija (not MSA, not French, not Arabizi)
- Keep replies SHORT: 1-2 lines maximum — never long paragraphs
- Never reveal you are an AI or robot
- Be warm, friendly, use emojis naturally 😊
- Shipping is ALWAYS FREE — never say otherwise
- When hesitant: emphasize "قلب عاد خلص" (inspect before paying), free returns, and premium quality

PATIENCE MODE — NO-STOP RULE:
- ANSWER EVERY question about the product FIRST, then gently ask for city/confirmation
- If the customer says "لا" followed by a question, they are STILL INTERESTED — keep helping
- If the customer asks 10 questions, answer all 10 warmly — never get frustrated or give up
- Do NOT push for confirmation after every reply — build trust naturally
- ONLY set is_cancelled=true if customer says explicitly: "بلاش" / "ما بقيتش" / "ما بغيتش" / "بغيت نلغي"
- If undecided, always end with: "واش عندك أي سؤال آخر ${address.formal}؟ كنا هنا دايما 🙏"
- Your goal is to CLOSE THE SALE by being helpful, not by rushing

HUMAN REQUEST RULE (CRITICAL — NEVER BREAK):
- If the customer says "بغيت واحد حقيقي" / "مسؤول" / "مدير" / "بشر" / "إنسان" / "human" / "admin" or anything similar:
  → NEVER say "wait for our team" or "someone will contact you"
  → ALWAYS respond: "أنا هنا ${address.formal}! أنا المسؤول ومعاك دابا شخصياً 🙏 قولي شنو المشكل وغنحلها ليك فـ الحين."
  → Then immediately continue the conversation and try to resolve their concern
- You are the ONLY agent. There is no human team. Solve everything yourself in Darija.

ORDER DETAILS:
- Customer: ${conv.customerName ?? "Unknown"} (${genderNote})
- Product: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}
${city ? `- City: ${city}` : ""}${variant ? `\n- Size/Variant: ${variant}` : ""}${stockNote}
${knowledgeBlock}
${customSystemPrompt ? `\nSTORE EXTRA RULES:\n${customSystemPrompt}` : ""}
${JSON_OUTPUT_RULE}`;

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
    const isShipped = ctx.orderStatus === "expédié" || ctx.orderStatus === "en_cours";
    const deliveryStatus = isShipped
      ? `الكوموند ديالك ${address.formal} راها عند شركة الشحن${ctx.shippingProvider ? ` (${ctx.shippingProvider})` : ""} وهي فـ الطريق ليك 🚚${trackingLine ? `\n${trackingLine}` : ""}`
      : `الكوموند ديالك ${address.formal} راه مأكدة وحنا كنوجدوا فيها دبا باش تخرج ✅`;

    // Gender-aware messages
    const cancelConfirmedReply = `ما كاين حتى مشكل ${address.formal}، الطلب ديالك تلغى كيفما بغيتي. إيلا حتاجيتي شي حاجة أخرى حنا هنا. نهارك مبروك! 🙏`;
    const shippedCancelBlockReply = `سمح لينا ${address.formal}، الطلبية راها خرجت دبا مع الموزع، حاول تواصل معانا ملي يعيط ليك 🚚`;

    return `${base}

DELIVERY COMPANION MODE — The order is ALREADY CONFIRMED (status: ${ctx.orderStatus}).
Your role now is LOGISTICS SUPPORT, not sales.

CURRENT ORDER STATUS: "${ctx.orderStatus}"
${trackingLine ? `TRACKING: ${trackingLine}` : "No tracking number yet."}

RULES FOR THIS MODE:
- Do NOT ask for city/variant/confirmation — order is already placed
- If customer asks about order status ("فين الكوموند؟" / "فين وصلات؟" / "وين الكوموند" / "سلام" / "متى يجي" / "ماعرفتش"):
  Respond EXACTLY with: "${deliveryStatus}"
- If status is "confirme": reassure them the order is confirmed and being prepared to ship
- If status is "expédié" or "en_cours": give tracking info if available, say "وجد راسك ${address.formal} وكن فـ الدار باش يوصلك 🚚"
- If customer asks about product, quality, delivery time: answer warmly and briefly
- ALWAYS be reassuring — the order is safe and on its way
- Keep replies SHORT: 1-2 lines max
${isShipped
  ? `CANCELLATION RULE (SHIPPED — CANNOT CANCEL):
- If customer asks to cancel or says "بلاش" / "الغاء" / "ما بغيتش" / "cancel":
  REFUSE politely using EXACTLY this reply: "${shippedCancelBlockReply}"
  Set is_cancelled=false — order cannot be cancelled once shipped.`
  : `CANCELLATION RULE (CONFIRMED — CAN CANCEL):
- If customer asks to cancel or expresses regret ("بلاش" / "الغاء" / "ما بغيتش" / "بدلت رأيي" / "cancel" / "annuler"):
  Reply EXACTLY: "${cancelConfirmedReply}"
  Set is_cancelled=true — this will cancel the order and restore stock automatically.`}`;
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
- If they confirm (واخا / ok / صيفطوه): set is_confirmed=true and tell them order is confirmed
- If they cancel explicitly: set is_cancelled=true and respond kindly
- Never reveal you are an AI
${JSON_OUTPUT_RULE}`;

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

    // Check if customer has multiple orders (duplicate detection)
    let dupNote = "";
    try {
      const dupCount = await storage.getPhoneOrderCount(storeId, customerPhone);
      if (dupCount > 1) {
        dupNote = `\nشفنا سيدي باللي عندك ${dupCount} طلبات عندنا — واش بغيتي نأكد ليك الطلب الجديد هذا، ولا بغيتي نلغيو الطلبات اللي فاتت؟ 🙏`;
      }
    } catch { /* non-fatal */ }

    // Greeting — exact format as specified
    const firstMessage =
      `السلام عليكم سيدي/لالة ${cleanName}، تبارك الله عليك ✨\n` +
      `معاك فريق الدعم ديال ${storeName}، شلنا الطلب ديالك لـ "${productLabel}"${variantPart}.${stockUrgency}${dupNote}\n` +
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
  // ── ALWAYS log + show incoming messages in Live Chat, regardless of AI key ──
  // The AI key check only blocks the AI reply, NOT the message visibility.
  console.log(`[INCOMING MESSAGE]: "${customerMessage.substring(0, 100)}" | from: ${customerPhone} | store: ${storeId}`);

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

    // ── Log + broadcast customer message IMMEDIATELY (always, regardless of AI key) ──
    // This ensures the message ALWAYS appears in Live Chat even if AI is disabled/no key.
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
    await storage.updateAiConversationLastMessage(conv.id, customerMessage);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[INCOMING] Message from ${customerPhone}: "${customerMessage}"`);
    console.log(`[INCOMING] Conv: ${conv.id} | Order: ${conv.orderId ?? "none"} | Customer: ${conv.customerName ?? "unknown"}`);

    // ── AI key gate — block AI reply but message is already visible in Live Chat ──
    if (!(await storeHasAIKey(storeId))) {
      console.warn(`[AI] ⚠️ No API key — message logged to conv ${conv.id} but AI cannot reply. Configure OPENROUTER_API_KEY.`);
      broadcastToStore(storeId, "ai_error", {
        conversationId: conv.id, customerPhone, customerName: conv.customerName,
        error: "Clé API manquante — configurez OPENROUTER_API_KEY pour activer les réponses IA.",
        isKeyError: true,
      });
      return;
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

    // ── Image request fast-path ────────────────────────────────────
    if (intent === "image" && conv.orderId) {
      const ctx = await getOrderContext(conv.orderId);
      if (ctx.productImageUrl) {
        const caption = ctx.productName
          ? `هذي هي صورة ${ctx.productName} 📸`
          : "هذي هي صورة المنتج 📸";
        const imageLogMsg = `[IMAGE] ${ctx.productImageUrl}`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: imageLogMsg });
        await storage.updateAiConversationLastMessage(conv.id, imageLogMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: imageLogMsg, ts: Date.now() });
        console.log(`[AI] 📸 Sending product image to ${customerPhone}: ${ctx.productImageUrl.substring(0, 60)}...`);
        await sendWhatsAppImage(customerPhone, ctx.productImageUrl, caption, storeId);
      } else {
        const noImgReply = `عفواً ${addr.casual}، ما عنديش تصويرة للمنتج دابا 🙏`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: noImgReply });
        await storage.updateAiConversationLastMessage(conv.id, noImgReply);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: noImgReply, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, noImgReply);
      }
      return;
    }

    if (intent === "confirm" && conv.orderId) {
      // Only auto-confirm if order is still in "nouveau" state (not already confirmed)
      if (liveOrderStatus === "nouveau" || liveOrderStatus === null) {
        const confirmedAt = new Date();
        await storage.updateOrderStatus(conv.orderId, "confirme");
        await storage.updateAiConversationStatus(conv.id, "confirmed");
        await storage.updateConversationConfirmedAt(conv.id, confirmedAt);
        const msg = `صافي ${addr.formal}! الكوموند ديالك تأكدات ✅ غتخرج اليوم إن شاء الله. شكراً بزاف على ثقتك فينا 🎉🚀`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
        await storage.updateAiConversationLastMessage(conv.id, msg);
        const convAgeMs = confirmedAt.getTime() - new Date(conv.createdAt!).getTime();
        console.log(`[PERFORMANCE] ⚡ Order #${conv.orderId} confirmed in ${(convAgeMs / 1000).toFixed(1)}s from conv start (fast-path keyword)`);
        broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: msg, ts: Date.now() });
        broadcastToStore(storeId, "ORDER_STATUS_UPDATED", { orderId: conv.orderId, status: "confirme", conversationId: conv.id, customerName: conv.customerName, ts: confirmedAt.getTime() });
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
        console.log(`[AI] ✅ Order #${conv.orderId} CONFIRMED (fast-path) by ${conv.customerName}`);
        await new Promise(r => setTimeout(r, 5000)); // human typing delay
        await queueWhatsApp(storeId, customerPhone, msg);
        return;
      }
      // Already confirmed — fall through to delivery companion AI reply
    }

    if (intent === "cancel" && conv.orderId) {
      const isAlreadyShipped = liveOrderStatus === "expédié" || liveOrderStatus === "en_cours";

      // ── Safety guard: Order already with courier — cannot cancel ──
      if (isAlreadyShipped) {
        const shippedMsg = `سمح لينا ${addr.formal}، الطلبية راها خرجت دبا مع الموزع، حاول تواصل معانا ملي يعيط ليك 🚚`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "user", message: customerMessage });
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: shippedMsg });
        await storage.updateAiConversationLastMessage(conv.id, shippedMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "user", content: customerMessage, ts: Date.now() });
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: shippedMsg, ts: Date.now() });
        console.log(`[AI] 🚚 Cancel blocked (fast-path): order #${conv.orderId} already ${liveOrderStatus} — cannot cancel`);
        await new Promise(r => setTimeout(r, 3000));
        await queueWhatsApp(storeId, customerPhone, shippedMsg);
        return;
      }

      // ── Cancel allowed: confirme → annulé / nouveau → annulé fake ──
      const cancelStatus = liveOrderStatus === "confirme" ? "annulé" : "annulé fake";
      await storage.updateOrderStatus(conv.orderId, cancelStatus);
      await storage.updateAiConversationStatus(conv.id, "cancelled");

      // Use the polite post-confirm message if order was confirmed, generic otherwise
      const msg = liveOrderStatus === "confirme"
        ? `ما كاين حتى مشكل ${addr.formal}، الطلب ديالك تلغى كيفما بغيتي. إيلا حتاجيتي شي حاجة أخرى حنا هنا. نهارك مبروك! 🙏`
        : `مفهوم ${addr.formal} 🙏 إلا بغيتي تكمل أو عندك سؤال راسل المتجر مباشرة. نتمنى نخدموا معك قريبا!`;

      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: msg });
      await storage.updateAiConversationLastMessage(conv.id, msg);
      broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
      broadcastToStore(storeId, "ORDER_STATUS_UPDATED", { orderId: conv.orderId, status: cancelStatus, conversationId: conv.id, customerName: conv.customerName, ts: Date.now() });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: msg, ts: Date.now() });
      if (liveOrderStatus === "confirme") {
        broadcastToStore(storeId, "post_confirm_cancel", {
          conversationId: conv.id, orderId: conv.orderId, customerName: conv.customerName, customerPhone,
          message: `⚠️ ${conv.customerName ?? customerPhone} a annulé sa commande #${conv.orderId} via WhatsApp (après confirmation)`,
          ts: Date.now(),
        });
        console.log(`[AI] ⚠️ POST-CONFIRM CANCEL: Order #${conv.orderId} cancelled by ${conv.customerName} via WhatsApp`);
      }
      console.log(`[AI] ❌ Order #${conv.orderId} CANCELLED (fast-path → ${cancelStatus}) by ${conv.customerName}`);
      await new Promise(r => setTimeout(r, 5000)); // human typing delay
      await queueWhatsApp(storeId, customerPhone, msg);
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
      console.log(`[AI] Searching context for ${customerPhone}... Context found: ${ctx?.productName ?? "no product"} | Price: ${ctx?.totalPrice ? (ctx.totalPrice/100).toFixed(0)+"DH" : "N/A"} | Status: ${ctx?.orderStatus ?? "N/A"}`);

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
      console.log(`[AI] Calling ${provider} (${model}) | Conv: ${conv.id} | History: ${messages.length - 1} msgs...`);
      let completion: Awaited<ReturnType<typeof ai.chat.completions.create>>;
      try {
        completion = await ai.chat.completions.create({ model, messages, max_tokens: 400, temperature: 0.7 });
      } catch (apiErr: any) {
        console.error(`[AI-ERROR] OpenRouter/OpenAI call FAILED for conv ${conv.id}:`, apiErr?.message || apiErr);
        console.error(`[AI-ERROR] Status: ${apiErr?.status} | Code: ${apiErr?.code} | Model: ${model}`);
        throw apiErr;
      }
      const rawAIResponse = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!rawAIResponse) throw new Error("Empty AI response");

      // ── Parse structured JSON response from AI ────────────────────
      const decision = parseAIDecision(rawAIResponse);
      const aiReply = decision.reply;
      console.log(`[REPLY] AI sending back to ${customerPhone}: "${aiReply.substring(0, 100)}"`);
      console.log(`[REPLY] confirmed=${decision.isConfirmed} | cancelled=${decision.isCancelled} | conv=${conv.id}`);

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
            if (ctx?.productVariant) { stepData.variant = ctx.productVariant; nextStep = 3; }
          } else if (looksLikeDirectAnswer(customerMessage) && customerMessage.length > 3) {
            stepData.city = customerMessage.trim();
            nextStep = 2;
            if (ctx?.productVariant) { stepData.variant = ctx.productVariant; nextStep = 3; }
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

      // ── Log + broadcast reply to admin dashboard immediately ─────
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: aiReply });
      await storage.updateAiConversationLastMessage(conv.id, aiReply);

      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: aiReply, ts: Date.now(), model, provider, step: currentStep });
      console.log(`[SOCKET_EMIT] message (assistant) → conv ${conv.id} | "${aiReply.substring(0, 60)}"`);

      // ── JSON-driven confirmation / cancellation sync ──────────────
      // PRIMARY: rely on AI's structured JSON decision
      // FALLBACK: fast-path keyword detection (catches simple "واخا" before AI call runs below)
      const needsConfirm = decision.isConfirmed && conv.orderId && liveOrderStatus === "nouveau";
      const needsCancel  = decision.isCancelled && conv.orderId;

      if (needsConfirm) {
        const confirmedAt = new Date();
        await storage.updateOrderStatus(conv.orderId!, "confirme");
        await storage.updateAiConversationStatus(conv.id, "confirmed");
        await storage.updateConversationConfirmedAt(conv.id, confirmedAt);
        const convAgeMs = confirmedAt.getTime() - new Date(conv.createdAt!).getTime();
        console.log(`[PERFORMANCE] ⚡ Order #${conv.orderId} confirmed in ${(convAgeMs / 1000).toFixed(1)}s from conv start (AI JSON decision)`);
        broadcastToStore(storeId, "confirmed", { conversationId: conv.id, orderId: conv.orderId, message: aiReply, ts: confirmedAt.getTime() });
        broadcastToStore(storeId, "ORDER_STATUS_UPDATED", { orderId: conv.orderId, status: "confirme", conversationId: conv.id, customerName: conv.customerName, ts: confirmedAt.getTime() });
        console.log(`[AI] ✅ JSON-confirmed: order #${conv.orderId} → 'confirme'`);
      } else if (needsCancel) {
        const isAlreadyShippedJSON = liveOrderStatus === "expédié" || liveOrderStatus === "en_cours";

        if (isAlreadyShippedJSON) {
          // Safety guard: AI decided to cancel but order is already with courier — block it
          // The AI reply was already sent above ("راها خرجت مع الموزع") via the delivery companion prompt
          console.log(`[AI] 🚚 Cancel blocked (JSON): order #${conv.orderId} already ${liveOrderStatus} — DB not updated`);
        } else {
          const cancelStatus = liveOrderStatus === "confirme" ? "annulé" : "annulé fake";
          await storage.updateOrderStatus(conv.orderId!, cancelStatus);
          await storage.updateAiConversationStatus(conv.id, "cancelled");
          broadcastToStore(storeId, "cancelled", { conversationId: conv.id, orderId: conv.orderId, ts: Date.now() });
          broadcastToStore(storeId, "ORDER_STATUS_UPDATED", { orderId: conv.orderId, status: cancelStatus, conversationId: conv.id, customerName: conv.customerName, ts: Date.now() });
          console.log(`[AI] ❌ JSON-cancelled: order #${conv.orderId} → '${cancelStatus}'`);

          // ── Admin toast for post-confirmed cancellations ──────────────
          if (liveOrderStatus === "confirme") {
            broadcastToStore(storeId, "post_confirm_cancel", {
              conversationId: conv.id,
              orderId: conv.orderId,
              customerName: conv.customerName,
              customerPhone,
              message: `⚠️ ${conv.customerName ?? customerPhone} a annulé sa commande #${conv.orderId} via WhatsApp (après confirmation)`,
              ts: Date.now(),
            });
            console.log(`[AI] ⚠️ POST-CONFIRM JSON-CANCEL: order #${conv.orderId} | customer: ${conv.customerName}`);
          }
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

      // ── 5-second human typing delay before sending to customer ──
      // Admin dashboard already shows the reply. The delay makes the customer
      // experience feel like a real person is typing, not a bot firing instantly.
      console.log(`[OUTGOING] Waiting 5s before sending to ${customerPhone}...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      await queueWhatsApp(storeId, customerPhone, aiReply);
      console.log(`[OUTGOING] AI reply sent to ${customerPhone} | Conv: ${conv.id}`);

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
   SHIPMENT NOTIFICATION — Triggered when admin marks order "expédié"
   Sends proactive WhatsApp message + logs to DB + admin Live Chat
════════════════════════════════════════════════════════════════ */
export async function triggerShipmentNotification(
  storeId: number,
  orderId: number,
  customerPhone: string,
  customerName: string,
  productName: string,
  trackNumber?: string | null,
  shippingProvider?: string | null,
): Promise<void> {
  try {
    const gender = detectGender(customerName || "");
    const addr = getGenderAddress(gender);
    const cleanName = (customerName || "").replace(/[^a-zA-Zء-ي\s]/g, "").trim() || addr.formal;

    const trackLine = trackNumber
      ? `\nرقم التتبع ديالك: *${trackNumber}*${shippingProvider ? ` (${shippingProvider})` : ""}`
      : "";

    const msg =
      `خبار زوين ${addr.formal} ${cleanName}! 📦\n` +
      `الطلبية ديالك لـ *${productName || "منتجك"}* راها خرجات دبا وغتوصلك فـ أقرب وقت إن شاء الله 🚚${trackLine}\n` +
      `إلا عندك أي سؤال كنا هنا 🙏`;

    // Find or re-use the existing active conversation for this customer
    let conv = await storage.getActiveAiConversationByPhone(storeId, customerPhone);
    if (!conv) {
      conv = await storage.createAiConversation({
        storeId, orderId, customerPhone,
        customerName: customerName || null,
        status: "active", isManual: 0, conversationStep: 1,
      });
      broadcastToStore(storeId, "new_conversation", {
        conversation: { ...conv, lastMessage: msg, status: "active" },
        message: { role: "assistant", content: msg, ts: Date.now() },
      });
    }

    // Log to DB + broadcast to admin Live Chat
    await storage.createAiLog({ storeId, orderId, customerPhone, role: "assistant", message: msg });
    await storage.updateAiConversationLastMessage(conv.id, msg);
    broadcastToStore(storeId, "message", {
      conversationId: conv.id, role: "assistant", content: msg, ts: Date.now(),
    });
    broadcastToStore(storeId, "shipped_notification", {
      conversationId: conv.id, orderId, customerName: cleanName, trackNumber, ts: Date.now(),
    });

    // Send directly (no 5s delay — admin manually triggered this)
    await queueWhatsApp(storeId, customerPhone, msg);
    console.log(`[SHIPPED] ✅ Notification sent → ${customerPhone} | order #${orderId}${trackNumber ? ` | Track: ${trackNumber}` : ""}`);

  } catch (err: any) {
    console.error(`[SHIPPED] ❌ triggerShipmentNotification error (order ${orderId}):`, err.message);
  }
}


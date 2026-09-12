import OpenAI from "openai";
import { storage } from "./storage";
import { broadcastToStore } from "./sse";
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppFile, sendWhatsAppButtons } from "./whatsapp-service";
import { db } from "./db";
import { products, orderItems, orders, stores, aiConversations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { AiConversation } from "@shared/schema";

/* ── OpenRouter config ───────────────────────────────────────── */
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://tajergrow.com",
  "X-Title": "TajerGrow",
};
const DEFAULT_MODEL = "anthropic/claude-3.7-sonnet";

export const AI_MODELS: Record<string, { label: string; provider: string }> = {
  "anthropic/claude-3.7-sonnet":  { label: "Claude 3.7 Sonnet — NEW Hybrid Reasoning", provider: "OpenRouter" },
  "anthropic/claude-3.5-sonnet":  { label: "Claude 3.5 Sonnet — Best for Design",      provider: "OpenRouter" },
  "openai/gpt-4o":                { label: "GPT-4o — Best for Sales Copy",              provider: "OpenRouter" },
  "openai/gpt-4o-mini":           { label: "GPT-4o Mini — Fast & economical",           provider: "OpenRouter" },
  "deepseek/deepseek-chat":       { label: "DeepSeek V3 — Best for Darija",             provider: "OpenRouter" },
};

interface ResolvedClient { client: OpenAI; model: string; provider: string; }

async function resolveAIClient(storeId: number): Promise<ResolvedClient> {
  const settings = await storage.getAiSettings(storeId);
  const orKey  = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  const oaiKey = settings?.openaiApiKey?.trim()     || process.env.OPENAI_API_KEY?.trim();
  const model  = settings?.aiModel?.trim() || DEFAULT_MODEL;

  if (orKey) {
    return {
      client: new OpenAI({ apiKey: orKey, baseURL: OPENROUTER_BASE, defaultHeaders: OPENROUTER_HEADERS, timeout: 12000, maxRetries: 1 }),
      model, provider: "OpenRouter",
    };
  }
  if (oaiKey) {
    return { client: new OpenAI({ apiKey: oaiKey, timeout: 12000, maxRetries: 1 }), model: "gpt-4o-mini", provider: "OpenAI" };
  }
  throw new Error("Veuillez configurer votre clé API OpenRouter pour activer la confirmation automatique.");
}

/**
 * Dedicated product-matching classifier — deliberately separate from the
 * main conversational reply generation. Asking one LLM call to (a) write a
 * natural Darija reply, (b) decide is_confirmed/is_cancelled, AND (c)
 * reliably flag which of 40+ catalog products the customer just described
 * turned out to be unreliable in practice (confirmed live multiple times:
 * the model would answer about another product directly from the catalog
 * list without ever setting mentioned_product, or set it inconsistently).
 * This function does ONE thing only — temperature=0, minimal output format,
 * and the result is verified against the REAL catalog before being trusted
 * (guards against hallucinated product names).
 */
async function detectProductMentionAI(
  customerMessage: string,
  catalogNames: string[],
  currentProductName: string | null,
  storeId: number,
): Promise<string | null> {
  if (catalogNames.length === 0) return null;
  try {
    const { client, model } = await resolveAIClient(storeId);
    const prompt = `You are a precise product-matching classifier for a Moroccan e-commerce WhatsApp bot. Nothing else — just classify.

CURRENT PRODUCT (already being discussed — do NOT match to this, even if mentioned): ${currentProductName ?? "none"}

CATALOG (other available products, exact names):
${catalogNames.map(n => `- ${n}`).join("\n")}

CUSTOMER MESSAGE (Darija/Arabic/French — may be a question, a description, or use the exact name):
"${customerMessage}"

Does the customer's message refer to ANY product in the catalog above — by exact name, partial name, OR by
describing it conceptually (e.g. "ساعة وسماعات في جهاز واحد" matching "ساعة ذكية بسماعات مدمجة") — and is it
DIFFERENT from the current product? If yes, respond with ONLY that product's name, copied EXACTLY
character-for-character from the catalog list above. If no (message isn't about any catalog product, refers to
the current product, or is a generic question/greeting/confirmation/cancellation), respond with ONLY the single
word NONE. No explanation. No punctuation. No quotes. Output ONLY the exact catalog name or NONE.`;

    const completion = await client.chat.completions.create({
      model, messages: [{ role: "user", content: prompt }], max_tokens: 60, temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw || raw.toUpperCase().includes("NONE")) return null;
    // Verify against the REAL catalog — never trust the raw output directly,
    // guards against the model paraphrasing or inventing a name.
    const rawNorm = normalizeForMatch(raw);
    const matched = catalogNames.find(n => normalizeForMatch(n) === rawNorm)
      ?? catalogNames.find(n => rawNorm.includes(normalizeForMatch(n)) || normalizeForMatch(n).includes(rawNorm));
    if (matched) console.log(`[AI] detectProductMentionAI: "${customerMessage.slice(0, 60)}" → "${matched}"`);
    return matched ?? null;
  } catch (err: any) {
    console.error(`[AI] detectProductMentionAI failed (non-fatal, falls back to in-reply detection):`, err.message);
    return null;
  }
}

/**
 * Given an EXACT catalog product name (already verified by
 * detectProductMentionAI), looks it up, sends its real WhatsApp content
 * (description/price/image/audio/video), and switches the conversation's
 * order to it. Returns true if handled (content sent either way — in-stock
 * info or an honest "not in stock" message), false only on unexpected error.
 */
async function applyProductSwitch(
  storeId: number,
  customerPhone: string,
  conv: AiConversation,
  exactProductName: string,
): Promise<boolean> {
  try {
    const [found] = await db.select({
      id: products.id, name: products.name, stock: products.stock, sellingPrice: products.sellingPrice, whatsappPrice: products.whatsappPrice,
      whatsappDescription: products.whatsappDescription,
      whatsappImageUrls: products.whatsappImageUrls,
      whatsappAudioUrls: products.whatsappAudioUrls,
      whatsappVideoUrls: products.whatsappVideoUrls,
    }).from(products).where(and(eq(products.storeId, storeId), eq(products.name, exactProductName))).limit(1);

    if (!found) {
      console.warn(`[AI] applyProductSwitch: "${exactProductName}" not found in catalog (race condition?) — skipping`);
      return false;
    }

    const inStock = (found.stock ?? 0) > 0;
    let followUp: string;
    if (inStock) {
      const priceDh = (found.whatsappPrice ?? found.sellingPrice ?? 0) / 100;
      const priceLine = priceDh > 0 ? `💰 الثمن: ${priceDh} درهم` : "";
      followUp = [found.whatsappDescription || `إيوا خويا، "${found.name}" كاين فالستوك ✅`, priceLine].filter(Boolean).join("\n\n");
    } else {
      followUp = `سمح ليا خويا، "${found.name}" ما كاينش فالستوك دابا. إيلا بغيتي، نعلمك ملي يرجع.`;
    }

    await queueWhatsApp(storeId, customerPhone, followUp);
    await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: followUp });
    await storage.updateAiConversationLastMessage(conv.id, followUp);
    broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: followUp, ts: Date.now() });
    console.log(`[AI] applyProductSwitch: sent info for "${found.name}" (stock=${found.stock ?? 0}) to ${customerPhone}`);

    if (inStock) {
      for (const url of (found.whatsappImageUrls as string[]) || []) await sendWhatsAppImage(customerPhone, url, found.name, storeId).catch(() => {});
      for (const url of (found.whatsappAudioUrls as string[]) || []) await sendWhatsAppFile(customerPhone, url, "audio.opus", "", storeId).catch(() => {});
      for (const url of (found.whatsappVideoUrls as string[]) || []) await sendWhatsAppFile(customerPhone, url, "video.mp4", "", storeId).catch(() => {});
    }

    // Switch the conversation's own order to this product so subsequent
    // messages (and the main conversational reply about to be generated)
    // correctly reflect it, instead of staying on the old product.
    if (inStock && conv.orderId) {
      const [existingItem] = await db.select({ id: orderItems.id, quantity: orderItems.quantity })
        .from(orderItems).where(eq(orderItems.orderId, conv.orderId)).limit(1);
      const qty = existingItem?.quantity || 1;
      const effectivePrice = found.whatsappPrice ?? found.sellingPrice ?? 0;
      const newPriceCents = effectivePrice * qty;
      if (existingItem) {
        await db.update(orderItems).set({ productId: found.id, rawProductName: found.name, price: effectivePrice } as any)
          .where(eq(orderItems.id, existingItem.id));
      } else {
        await db.insert(orderItems).values({ orderId: conv.orderId, productId: found.id, rawProductName: found.name, quantity: 1, price: effectivePrice } as any);
      }
      await db.update(orders).set({ totalPrice: newPriceCents, rawProductName: found.name } as any).where(eq(orders.id, conv.orderId));
      console.log(`[AI] applyProductSwitch: order #${conv.orderId} switched to "${found.name}" (id=${found.id})`);
    }
    return true;
  } catch (err: any) {
    console.error(`[AI] applyProductSwitch FAILED for "${exactProductName}":`, err.message);
    return false;
  }
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

// ── Video request keywords — customer wants to see a video of the product ──
const VIDEO_KEYWORDS = [
  "صيفط ليا فيديو", "صيفط فيديو", "غا صفت ليا فيديو", "صفتو ليا فيديو",
  "عندك فيديو", "كاين فيديو", "بغيت نشوف فيديو", "بغيت الفيديو",
  "send video", "send me video", "video stp", "video svp", "فيديو",
];

// ── Audio request keywords — customer wants a voice note about the product ──
const AUDIO_KEYWORDS = [
  "صيفط ليا صوت", "صيفط صوت", "بغيت نسمع", "تسجيل صوتي", "note vocale",
  "voice note", "send audio", "send voice", "صوتية", "رسالة صوتية",
];

// ── Catalog browse keywords — customer wants to see ALL/OTHER products,
// not a specific one. Handled as a deterministic fast-path (no LLM
// judgment call needed) since this is exactly the kind of intent that was
// unreliably falling through to a stalled "checking..." reply with no
// follow-up (confirmed live).
const CATALOG_KEYWORDS = [
  "منتجاتكم", "شنو عندكم", "واش عندكم", "شنو كاين عندكم", "شنو منتجات",
  "شنو كاين", "اش عندكم", "عندكم شنو", "لائحة المنتجات", "شنو تبيعو",
  "montajet", "produits", "catalogue", "قائمة المنتجات",
];

// ── "Order for someone else" keywords — the customer already has their own
// order/conversation, but now wants a SEPARATE order for a friend/family
// member. Detected so the system creates a NEW order instead of silently
// overwriting the customer's own order with the friend's delivery info
// (confirmed live: exactly this happened — "طلبية لصحبي" got attached to
// the customer's own existing order).
const FRIEND_ORDER_KEYWORDS = [
  "لصحبي", "لصاحبي", "لصديقي", "لخويا", "لأختي", "لصاحبتي", "لواحد صاحبي",
  "طلبية لصحبي", "طلبية لصاحبي", "commande لصحبي", "pour un ami", "pour une amie",
  "لواحد من الأصحاب", "بغيت ندوز طلبية لـ", "بغيت نطلب لـ",
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

function detectIntent(msg: string): "confirm" | "cancel" | "image" | "video" | "audio" | "catalog" | null {
  const lower = msg.toLowerCase().trim();

  // Catalog browse check — "شنو عندكم" etc. Checked first since it's the
  // most general ask; more specific media requests below take priority if
  // the message ALSO names a specific product/media type.
  if (CATALOG_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "catalog";

  // Video/audio request check — check before image so "فيديو" doesn't
  // accidentally fall through to the image path via a shared substring
  if (VIDEO_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "video";
  if (AUDIO_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "audio";

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

/* ── Normalize text for product-name matching (shared) ───────── */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Builds a structured, line-by-line request for whichever fields are
 * missing — easier for the customer to fill in clearly, and easier to
 * parse reliably than a free-flowing sentence asking for several things
 * at once. */
function buildMissingInfoMessage(missing: { name: boolean; phone: boolean; city: boolean; address: boolean }): string {
  const lines: string[] = [];
  if (missing.name) lines.push("الاسم الكامل: ");
  if (missing.phone) lines.push("رقم الهاتف: ");
  if (missing.city) lines.push("المدينة: ");
  if (missing.address) lines.push("العنوان بالتفصيل (الحي/الشارع): ");
  return `قبل نأكدو الطلب، عطيني المعلومات هادي، كل واحدة فسطر:\n\n${lines.join("\n")}\n\n🙏`;
}

/* ── JSON decision parser (robust, never throws) ────────────── */
interface AIDecision { reply: string; isConfirmed: boolean; isCancelled: boolean; mentionedProduct: string | null; collectedName: string | null; collectedCity: string | null; collectedAddress: string | null; collectedPhone: string | null; }

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
        mentionedProduct: (parsed.mentioned_product ?? parsed.mentionedProduct ?? null) || null,
        collectedName: (parsed.collected_name ?? parsed.collectedName ?? null) || null,
        collectedCity: (parsed.collected_city ?? parsed.collectedCity ?? null) || null,
        collectedAddress: (parsed.collected_address ?? parsed.collectedAddress ?? null) || null,
        collectedPhone: (parsed.collected_phone ?? parsed.collectedPhone ?? null) || null,
      };
    }
  } catch { /* ignore JSON parse error, fall through */ }
  // Fallback: treat the whole response as the reply text, no decision signals
  return { reply: stripped || raw, isConfirmed: false, isCancelled: false, mentionedProduct: null, collectedName: null, collectedCity: null, collectedAddress: null, collectedPhone: null };
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
  customerAddress: string | null;
  customerPhone: string | null;
  orderSource: string | null;
  stockQty: number | null;
  productId: number | null;
  descriptionDarija: string | null;
  aiFeatures: string[] | null;
  orderStatus: string | null;
  trackNumber: string | null;
  shippingProvider: string | null;
  productImageUrl: string | null;
  productVideoUrl: string | null;
  productAudioUrl: string | null;
  productImageUrls: string[];
  productVideoUrls: string[];
  productAudioUrls: string[];
}

export async function getOrderContextForRoute(orderId: number): Promise<OrderContext> {
  return getOrderContext(orderId);
}

async function getOrderContext(orderId: number): Promise<OrderContext> {
  try {
    const [order] = await db.select({
      totalPrice: orders.totalPrice,
      customerCity: orders.customerCity,
      customerAddress: orders.customerAddress,
      customerPhone: orders.customerPhone,
      source: orders.source,
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
    let productVideoUrl: string | null = null;
    let productAudioUrl: string | null = null;
    let productImageUrls: string[] = [];
    let productVideoUrls: string[] = [];
    let productAudioUrls: string[] = [];

    if (items.length > 0) {
      const item = items[0];
      productVariant = item.variantInfo ?? null;
      resolvedProductId = item.productId ?? null;

      if (item.productId) {
        const [p] = await db.select({
          name: products.name,
          stock: products.stock,
          description: products.description,
          descriptionDarija: products.descriptionDarija,
          aiFeatures: products.aiFeatures,
          imageUrl: products.imageUrl,
          whatsappImageUrls: products.whatsappImageUrls,
          whatsappVideoUrls: products.whatsappVideoUrls,
          whatsappAudioUrls: products.whatsappAudioUrls,
          whatsappDescription: products.whatsappDescription,
        }).from(products).where(eq(products.id, item.productId));
        if (p) {
          if (!productName) productName = p.name ?? null;
          stockQty = p.stock ?? null;
          // Prefer the dedicated WhatsApp content (Produits WhatsApp) over the
          // general product-page fields when set — that's what's actually
          // curated for the AI to send, e.g. a Darija-specific description.
          descriptionDarija = p.whatsappDescription || p.descriptionDarija || p.description || null;
          productImageUrls = (p.whatsappImageUrls as string[]) || [];
          productVideoUrls = (p.whatsappVideoUrls as string[]) || [];
          productAudioUrls = (p.whatsappAudioUrls as string[]) || [];
          productImageUrl = productImageUrls[0] || p.imageUrl || null;
          productVideoUrl = productVideoUrls[0] ?? null;
          productAudioUrl = productAudioUrls[0] ?? null;
          if (p.aiFeatures) {
            try { aiFeatures = JSON.parse(p.aiFeatures); } catch { aiFeatures = null; }
          }
        }
      }
    }

    // Fallback chain: verified catalog name (set above) > item's raw label > order's raw label
    if (!productName && items.length > 0 && items[0].rawProductName) {
      productName = items[0].rawProductName;
    }
    if (!productName && order?.rawProductName) {
      productName = order.rawProductName;
    }

    return {
      productName,
      productVariant,
      totalPrice: order?.totalPrice ?? null,
      customerCity: order?.customerCity ?? null,
      customerAddress: order?.customerAddress ?? null,
      customerPhone: order?.customerPhone ?? null,
      orderSource: order?.source ?? null,
      stockQty,
      productId: resolvedProductId,
      descriptionDarija,
      aiFeatures,
      orderStatus: order?.status ?? null,
      trackNumber: order?.trackNumber ?? null,
      shippingProvider: order?.shippingProvider ?? null,
      productImageUrl,
      productVideoUrl,
      productAudioUrl,
      productImageUrls,
      productVideoUrls,
      productAudioUrls,
    };
  } catch {
    return { productName: null, productVariant: null, totalPrice: null, customerCity: null, customerAddress: null, customerPhone: null, orderSource: null, stockQty: null, productId: null, descriptionDarija: null, aiFeatures: null, orderStatus: null, trackNumber: null, shippingProvider: null, productImageUrl: null, productVideoUrl: null, productAudioUrl: null, productImageUrls: [], productVideoUrls: [], productAudioUrls: [] };
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
{"reply":"<your Darija response here>","is_confirmed":false,"is_cancelled":false,"mentioned_product":null,"collected_name":null,"collected_city":null,"collected_address":null,"collected_phone":null}

Rules for the flags:
- Set "is_confirmed": true ONLY when the customer explicitly agrees to receive the order (e.g. "واخا", "صيفطوه", "ok", "موافق", "نعم").
- Set "is_cancelled": true ONLY when the customer explicitly says they no longer want it (e.g. "بلاش", "ما بقيتش", "ما بغيتش").
- For ALL other messages (questions, hesitation, chatting): set BOTH to false and keep the conversation going.
- NEVER set is_confirmed=true just because the customer asked a question.
- After confirmation, keep responding helpfully — the conversation does not end.
- "mentioned_product": if the customer asks about, or clearly wants, a DIFFERENT product than the one currently
  being discussed (not the one already in this order/conversation), figure out which real product from the
  "OTHER PRODUCTS AVAILABLE" list above they mean — even if they describe it in their own words instead of using
  its exact name (e.g. customer says "ساعة وسماعات في جهاز واحد" and the real catalog name is "ساعة ذكية بسماعات
  مدمجة" — match the DESCRIPTION to the right catalog item and put the EXACT name from the list here). If you
  genuinely can't tell which product from the list they mean, put their own words here instead so the system can
  still try a text search. Otherwise leave it null. Do NOT guess whether it's in stock or make up details about
  it in your reply yet — the system will look up the real product and give you its actual info for your NEXT
  reply. For THIS reply, just acknowledge you're checking (e.g. "نتأكد ليك دابا 🙏").
- "collected_name": if the customer just told you their full name in THIS message, put it here exactly as they
  wrote it. Otherwise leave it null. NEVER fill this with a guess.
- "collected_city": if the customer just told you their city in THIS message, put it here exactly as they wrote
  it. Otherwise leave it null. NEVER fill this with a guess.
- "collected_address": if the customer just told you their street address / neighborhood / detailed location in
  THIS message, put it here exactly as they wrote it. Otherwise leave it null. NEVER fill this with a guess.
- "collected_phone": if the customer just told you a phone number to deliver/contact them on in THIS message
  (may differ from the number they're messaging from — e.g. ordering for someone else), put it here exactly as
  they wrote it. Otherwise leave it null. NEVER fill this with a guess or assume it's the same as the WhatsApp
  sender's number — always ask explicitly.

━━━ NEVER INVENT CUSTOMER DETAILS (CRITICAL) ━━━
- NEVER invent, guess, or assume the customer's name, city, address, or phone number. If you don't have it, ASK
  for it — do not write a name, city, address, or phone into your reply that the customer never actually told you.
- If "Customer name" below is marked UNKNOWN, you do not know their name. Ask for it naturally before or while
  confirming the order. Do not address them by an invented name, and do not write a confirmation message that
  states a specific name, city, address, or phone unless it was actually provided in this conversation.
- Do NOT set is_confirmed=true until you have a real name, city, address, AND phone number for this order —
  either already known from before, or collected from the customer in this conversation. If any is still missing when they
  say "واخا"/"ok", ask for the missing piece(s) first instead of confirming.
- When you ask for missing info (name/phone/city/address), ALWAYS use this exact structured format — one label
  per line, so the customer's reply is easy to read back correctly — do not ask for several things in one
  free-flowing sentence:
  "عطيني المعلومات هادي، كل واحدة فسطر:

  الاسم الكامل:
  رقم الهاتف:
  المدينة:
  العنوان بالتفصيل (الحي/الشارع):"
  (only include the lines for what's actually still missing — skip any already known.)`;

/* ── Step-specific system prompts ────────────────────────────── */
function buildStepPrompt(
  step: number,
  ctx: OrderContext | null,
  storeName: string,
  conv: AiConversation,
  customSystemPrompt?: string | null,
  catalogNames: string[] = [],
): string {
  const priceDh = ctx?.totalPrice ? `${(ctx.totalPrice / 100).toFixed(0)} درهم` : null;
  const _baseProductLabel = ctx?.productName ?? "المنتج";
  const _orderVariant = ctx?.productVariant ?? null;
  const productLabel = (_orderVariant && _orderVariant !== 'Default Title' && _orderVariant !== 'null')
    ? `${_baseProductLabel} - ${_orderVariant}`
    : _baseProductLabel;
  const city = conv.collectedCity ?? ctx?.customerCity ?? null;
  const streetAddress = conv.collectedAddress ?? null;
  const deliveryPhone = conv.collectedPhone ?? null;
  const customerName = conv.collectedName ?? conv.customerName ?? null;
  const variant = conv.collectedVariant ?? ctx?.productVariant ?? null;
  const gender = detectGender(customerName ?? "");
  const address = getGenderAddress(gender);

  const stockNote = ctx?.stockQty !== null
    ? (ctx!.stockQty! <= 0
        ? " (IMPORTANT: Stock is ZERO — do not promise delivery, say team will confirm availability)"
        : ctx!.stockQty! <= 5
          ? ` (URGENCY: Only ${ctx!.stockQty} units left — use scarcity to close the sale faster)`
          : "")
    : (ctx?.productName
        ? " (WARNING: this product name is not linked to a verified catalog entry — real-time stock is unknown. Discuss it ONLY as this specific customer's own order item. NEVER offer or recommend it to answer a general \"what do you have\" question, since we cannot confirm it's actually sellable.)"
        : "");

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
- Customer name: "${customerName ?? "UNKNOWN — not provided yet"}" → ${genderNote}
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
- Customer: ${customerName ?? "⚠️ NAME NOT PROVIDED — you must ask for their full name"} (${genderNote})
- Product: "${productLabel}"${priceDh ? ` | Price: ${priceDh}` : ""}
- City: ${city ?? "⚠️ CITY NOT PROVIDED — you must ask for their city"}
- Address: ${streetAddress ?? "⚠️ ADDRESS NOT PROVIDED — you must ask for their street address/neighborhood"}
- Delivery phone: ${deliveryPhone ?? "⚠️ PHONE NOT CONFIRMED — you must ask them to confirm a delivery phone number (may differ from the WhatsApp number)"}${variant ? `\n- Size/Variant: ${variant}` : ""}${stockNote}
${catalogNames.length > 0 ? `\nOTHER PRODUCTS AVAILABLE (names ONLY, for matching mentioned_product — you know NOTHING else about these: no price, no stock, no description, no media. NEVER confirm, describe, or discuss any of these directly from this list — if the customer's message is about ANY of them, you MUST set mentioned_product and say only that you're checking. Answering from this list without setting mentioned_product means the system never actually looks up real info or sends real content — exactly the bug being fixed):\n${catalogNames.map(n => `- ${n}`).join("\n")}` : ""}
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
  if (ctx?.orderStatus === "confirme" || ctx?.orderStatus === "expédié" || ctx?.orderStatus === "en_cours" || ctx?.orderStatus === "Attente De Ramassage") {
    const trackingLine = ctx.trackNumber
      ? `رقم التتبع ديالك: *${ctx.trackNumber}*${ctx.shippingProvider ? ` (${ctx.shippingProvider})` : ""}`
      : null;
    const isShipped = ctx.orderStatus === "expédié" || ctx.orderStatus === "en_cours";
    const isAwaitingPickup = ctx.orderStatus === "Attente De Ramassage";
    const deliveryStatus = isAwaitingPickup
      ? `الطلبية ديالك راها واجدة وفـ انتظار شركة الشحن تجي تهزها اليوم 📦${trackingLine ? `\n${trackingLine}` : ""}`
      : isShipped
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
- If status is "Attente De Ramassage": tell them exactly: "الطلبية ديالك راها واجدة وفـ انتظار شركة الشحن تجي تهزها اليوم 📦"
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
- If they say YES (واخا / صيفطوه / ok / مزيان / any positive): celebrate! "صافي ${address.formal}، الكوموند ديالك تأكدات ✅. غتخرج اليوم إن شاء الله وتوصلك من 24 لـ 48 ساعة. شكراً بزاف على ثقتك فينا! 🎉"
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

    // Scope gate: 'whatsapp_only' means AI should leave every non-WhatsApp
    // order (Sheet, Shopify, manual add, import, etc.) to the normal human
    // confirmation workflow, and only engage orders created by the cold-lead
    // pathway (source='whatsapp', see handleIncomingMessage below).
    if ((settings as any).scopeMode === "whatsapp_only") {
      const [orderRow] = await db.select({ source: orders.source }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderRow?.source !== "whatsapp") {
        console.log(`[AI] ⚠️ SKIPPED: store ${storeId} scope is 'whatsapp_only', order #${orderId} source is '${orderRow?.source}' — leaving to human confirmation`);
        return;
      }
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
    const _baseLabel   = ctx.productName || "منتجك";
    const _initVariant = (ctx.productVariant && ctx.productVariant !== 'Default Title' && ctx.productVariant !== 'null') ? ctx.productVariant : null;
    const productLabel = _initVariant ? `${_baseLabel} - ${_initVariant}` : _baseLabel;
    const variantPart  = "";
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
      const STATUS_PRIORITY = ["confirme", "Attente De Ramassage", "expédié", "en_cours", "nouveau", "livré", "annulé", "annulé fake"];
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
        // ── Cold lead: no order at all for this phone — this is a brand-new
        // customer, most likely from a WhatsApp ad (wa.me link with the
        // product name pre-filled as the message text). Try to recognize
        // which product they're asking about and start a lead from scratch,
        // instead of doing nothing.
        const coldLeadSettings = await storage.getAiSettings(storeId);
        if (!coldLeadSettings?.enabled) {
          console.log(`[AI] Cold lead from ${customerPhone} — AI disabled for store ${storeId}, nothing to do`);
          return;
        }

        const normalize = normalizeForMatch;
        const msgNorm = normalize(customerMessage);
        const candidateProducts = await db.select({
          id: products.id, name: products.name, sellingPrice: products.sellingPrice, whatsappPrice: products.whatsappPrice,
          whatsappDescription: products.whatsappDescription,
          whatsappImageUrls: products.whatsappImageUrls,
          whatsappAudioUrls: products.whatsappAudioUrls,
          whatsappVideoUrls: products.whatsappVideoUrls,
        }).from(products).where(eq(products.storeId, storeId));

        const matchedProduct = candidateProducts.find(p => p.name && msgNorm.includes(normalize(p.name)));

        if (!matchedProduct) {
          // Not a product-related first message — most likely a personal
          // contact (friend, family) rather than a Facebook-ad lead, since a
          // real ad-driven wa.me message always has the product name
          // pre-filled. Stay silent rather than replying like a bot to
          // someone who isn't a customer at all — do NOT create a lead/order.
          console.log(`[AI] First message from ${customerPhone} has no product mention — not treating as a lead, staying silent: "${customerMessage.slice(0, 80)}"`);
          return;
        }

        console.log(`[AI] Cold lead from ${customerPhone} — matched product "${matchedProduct.name}" (id=${matchedProduct.id}), creating order`);
        const priceCents = matchedProduct.whatsappPrice ?? matchedProduct.sellingPrice ?? 0; // already in cents
        const newOrder = await storage.createOrder({
          storeId,
          orderNumber: `WA-${Date.now()}`,
          customerName: "Client WhatsApp",
          customerPhone,
          customerCity: "",
          customerAddress: "",
          status: "nouveau",
          source: "whatsapp",
          totalPrice: priceCents,
        } as any, [{
          productId: matchedProduct.id,
          quantity: 1,
          price: priceCents,
          rawProductName: matchedProduct.name,
          sku: "",
          variantInfo: "",
        }] as any);

        const newConv = await storage.createAiConversation({
          storeId,
          orderId: newOrder.id,
          customerPhone,
          customerName: null,
          status: "active",
          isManual: 0,
          conversationStep: 1,
        });
        conv = newConv;

        await storage.createAiLog({ storeId, orderId: newOrder.id, customerPhone, role: "user", message: customerMessage });

        // Send the dedicated WhatsApp content for this product before the
        // normal conversation flow continues below (asking city/address).
        const coldLeadImages = (matchedProduct.whatsappImageUrls as string[]) || [];
        const coldLeadAudios = (matchedProduct.whatsappAudioUrls as string[]) || [];
        const coldLeadVideos = (matchedProduct.whatsappVideoUrls as string[]) || [];
        for (const url of coldLeadImages) {
          await sendWhatsAppImage(customerPhone, url, matchedProduct.whatsappDescription || matchedProduct.name, storeId).catch(() => {});
        }
        const priceDh = (matchedProduct.whatsappPrice ?? matchedProduct.sellingPrice ?? 0) / 100;
        const priceLine = priceDh > 0 ? `💰 الثمن: ${priceDh} درهم` : "";
        const descWithPrice = [matchedProduct.whatsappDescription, priceLine].filter(Boolean).join("\n\n");
        if (descWithPrice) {
          await queueWhatsApp(storeId, customerPhone, descWithPrice);
          await storage.createAiLog({ storeId, orderId: newOrder.id, customerPhone, role: "assistant", message: descWithPrice });
        }
        for (const url of coldLeadAudios) {
          await sendWhatsAppFile(customerPhone, url, "audio.opus", "", storeId).catch(() => {});
        }
        for (const url of coldLeadVideos) {
          await sendWhatsAppFile(customerPhone, url, "video.mp4", "", storeId).catch(() => {});
        }

        const introMsg = "واش بغيتي نأكدو ليك الطلب؟ عطيني المعلومات ديالك بهاد الترتيب، كل واحدة فسطر:\n\nالاسم الكامل: \nرقم الهاتف: \nالمدينة: \nالعنوان بالتفصيل (الحي/الشارع): \n\n🙏";
        await queueWhatsApp(storeId, customerPhone, introMsg);
        await storage.createAiLog({ storeId, orderId: newOrder.id, customerPhone, role: "assistant", message: introMsg });
        await storage.updateAiConversationLastMessage(newConv.id, introMsg);
        broadcastToStore(storeId, "message", { conversationId: newConv.id, role: "assistant", content: introMsg, ts: Date.now() });
        console.log(`[AI] Cold lead → order #${newOrder.id} created, conv #${newConv.id} started for ${customerPhone}`);
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

    // ── "Order for someone else" — create a SEPARATE order, don't overwrite
    // the customer's own order with the friend's delivery info ────────────
    // Confirmed live: customer already had an order, said "بغيت ندوز طلبية
    // لصحبي" (order for my friend), and the friend's name/phone/city/address
    // silently got attached to the CUSTOMER's own existing order instead of
    // a new one. Only triggers when there's an existing order to protect —
    // a brand new conversation with no order yet already goes through the
    // normal cold-lead pathway.
    const isFriendOrderRequest = FRIEND_ORDER_KEYWORDS.some(kw => customerMessage.includes(kw));
    if (isFriendOrderRequest && conv.orderId) {
      const currentCtx = await getOrderContext(conv.orderId);
      // Try to find a specific product mentioned in the SAME message; fall
      // back to whatever product the conversation is currently about, since
      // "order for my friend" without naming a different item usually means
      // the same product just discussed.
      let friendProductId = currentCtx?.productId ?? null;
      let friendProductName = currentCtx?.productName ?? null;
      const catalogForFriend = await db.select({ id: products.id, name: products.name, sellingPrice: products.sellingPrice, whatsappPrice: products.whatsappPrice })
        .from(products).where(eq(products.storeId, storeId));
      const msgNormFriend = normalizeForMatch(customerMessage);
      const directMatch = catalogForFriend.find(p => p.name && msgNormFriend.includes(normalizeForMatch(p.name)));
      if (directMatch) { friendProductId = directMatch.id; friendProductName = directMatch.name; }

      if (friendProductId && friendProductName) {
        const matchedForPrice = catalogForFriend.find(p => p.id === friendProductId);
        const priceCents = matchedForPrice?.whatsappPrice ?? matchedForPrice?.sellingPrice ?? currentCtx?.totalPrice ?? 0;
        const newFriendOrder = await storage.createOrder({
          storeId,
          orderNumber: `WA-${Date.now()}`,
          customerName: "Client WhatsApp (ami)",
          customerPhone, // same WhatsApp sender — this is who we're chatting with
          customerCity: "",
          customerAddress: "",
          status: "nouveau",
          source: "whatsapp",
          totalPrice: priceCents,
        } as any, [{
          productId: friendProductId,
          quantity: 1,
          price: priceCents,
          rawProductName: friendProductName,
          sku: "",
          variantInfo: "",
        }] as any);

        // Switch this conversation to the new order — from here on, info
        // collected (name/phone/city/address) belongs to the FRIEND's order,
        // not the customer's own original order (left untouched).
        await db.update(aiConversations).set({
          orderId: newFriendOrder.id,
          collectedName: null, collectedPhone: null, collectedCity: null, collectedAddress: null,
          confirmButtonsSent: 0,
        }).where(eq(aiConversations.id, conv.id));
        conv.orderId = newFriendOrder.id;
        conv.collectedName = null; conv.collectedPhone = null; conv.collectedCity = null; conv.collectedAddress = null;
        conv.confirmButtonsSent = 0;

        console.log(`[AI] Friend-order request detected — created NEW order #${newFriendOrder.id} for "${friendProductName}", conv ${conv.id} switched to it`);

        const friendIntroMsg = `مزيان خويا! غادي نديرو طلبية منفصلة ديال "${friendProductName}" لصاحبك. عطيني المعلومات ديالو، كل واحدة فسطر:\n\nالاسم الكامل: \nرقم الهاتف: \nالمدينة: \nالعنوان بالتفصيل (الحي/الشارع): \n\n🙏`;
        await queueWhatsApp(storeId, customerPhone, friendIntroMsg);
        await storage.createAiLog({ storeId, orderId: newFriendOrder.id, customerPhone, role: "assistant", message: friendIntroMsg });
        await storage.updateAiConversationLastMessage(conv.id, friendIntroMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: friendIntroMsg, ts: Date.now() });
        return;
      }
      // No product identifiable at all — let the normal flow handle it
      // (will likely ask which product, or fall through to catalog browse).
    }

    // Fetch live order status from DB to determine current phase
    let liveOrderStatus: string | null = null;
    if (conv.orderId) {
      const [liveOrder] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, conv.orderId));
      liveOrderStatus = liveOrder?.status ?? null;
    }

    const gender = detectGender(conv.customerName ?? "");
    const addr = getGenderAddress(gender);

    // ── Image request fast-path ────────────────────────────────────
    // ── Catalog browse fast-path ──────────────────────────────────────
    if (intent === "catalog" && conv.orderId) {
      const ctxForCatalog = await getOrderContext(conv.orderId);
      const currentNorm = ctxForCatalog?.productName ? normalizeForMatch(ctxForCatalog.productName) : null;
      const catalogRows = await db.select({ id: products.id, name: products.name, stock: products.stock })
        .from(products).where(eq(products.storeId, storeId));
      const availableProducts = catalogRows
        .filter(p => p.name && (p.stock ?? 0) > 0 && normalizeForMatch(p.name) !== currentNorm)
        .slice(0, 15);

      let catalogMsg: string;
      if (availableProducts.length > 0) {
        const listText = availableProducts.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
        catalogMsg = `هاد المنتجات لي عندنا دابا 👇 بعث ليا الرقم لي يعجبك باش نعطيك المعلومات كاملة:\n\n${listText}`;
        await db.update(aiConversations).set({ lastShownProductList: availableProducts.map(p => p.id) })
          .where(eq(aiConversations.id, conv.id)).catch(() => {});
      } else {
        catalogMsg = `عندنا حاليا ${ctxForCatalog?.productName ?? "هاد المنتج"} لي كنتكلمو عليه. واش بغيتي معلومات زيادة عليه؟ 🙏`;
      }
      await queueWhatsApp(storeId, customerPhone, catalogMsg);
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: catalogMsg });
      await storage.updateAiConversationLastMessage(conv.id, catalogMsg);
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: catalogMsg, ts: Date.now() });
      console.log(`[AI] Catalog browse fast-path → sent ${availableProducts.length} product(s) to ${customerPhone}`);
      return;
    }

    if (intent === "image" && conv.orderId) {
      const ctx = await getOrderContext(conv.orderId);
      if (ctx.productImageUrls.length > 0) {
        const caption = ctx.productName
          ? `هذي هي صورة ${ctx.productName} 📸`
          : "هذي هي صورة المنتج 📸";
        const imageLogMsg = `[IMAGE] ${ctx.productImageUrls.join(", ")}`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: imageLogMsg });
        await storage.updateAiConversationLastMessage(conv.id, imageLogMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: imageLogMsg, ts: Date.now() });
        console.log(`[AI] 📸 Sending ${ctx.productImageUrls.length} product image(s) to ${customerPhone}`);
        for (const url of ctx.productImageUrls) {
          await sendWhatsAppImage(customerPhone, url, caption, storeId).catch(() => {});
        }
      } else {
        const noImgReply = `عفواً ${addr.friendly}، ما عنديش تصويرة للمنتج دابا 🙏`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: noImgReply });
        await storage.updateAiConversationLastMessage(conv.id, noImgReply);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: noImgReply, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, noImgReply);
      }
      return;
    }

    // ── Video request fast-path ─────────────────────────────────────
    if (intent === "video" && conv.orderId) {
      const ctx = await getOrderContext(conv.orderId);
      if (ctx.productVideoUrls.length > 0) {
        const videoLogMsg = `[VIDEO] ${ctx.productVideoUrls.join(", ")}`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: videoLogMsg });
        await storage.updateAiConversationLastMessage(conv.id, videoLogMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: videoLogMsg, ts: Date.now() });
        console.log(`[AI] 🎥 Sending ${ctx.productVideoUrls.length} product video(s) to ${customerPhone}`);
        for (const url of ctx.productVideoUrls) {
          await sendWhatsAppFile(customerPhone, url, "video.mp4", ctx.productName ? `فيديو ${ctx.productName}` : "", storeId).catch(() => {});
        }
      } else {
        const noVidReply = `عفواً ${addr.friendly}، ما عنديش فيديو للمنتج دابا 🙏. بغيتي نبعث ليك تصويرة ولا وصف كامل؟`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: noVidReply });
        await storage.updateAiConversationLastMessage(conv.id, noVidReply);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: noVidReply, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, noVidReply);
      }
      return;
    }

    // ── Audio request fast-path ─────────────────────────────────────
    if (intent === "audio" && conv.orderId) {
      const ctx = await getOrderContext(conv.orderId);
      if (ctx.productAudioUrls.length > 0) {
        const audioLogMsg = `[AUDIO] ${ctx.productAudioUrls.join(", ")}`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: audioLogMsg });
        await storage.updateAiConversationLastMessage(conv.id, audioLogMsg);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: audioLogMsg, ts: Date.now() });
        console.log(`[AI] 🎙️ Sending ${ctx.productAudioUrls.length} product audio(s) to ${customerPhone}`);
        for (const url of ctx.productAudioUrls) {
          await sendWhatsAppFile(customerPhone, url, "audio.opus", "", storeId).catch(() => {});
        }
      } else {
        const noAudioReply = `عفواً ${addr.friendly}، ما عنديش تسجيل صوتي للمنتج دابا 🙏`;
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: noAudioReply });
        await storage.updateAiConversationLastMessage(conv.id, noAudioReply);
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: noAudioReply, ts: Date.now() });
        await queueWhatsApp(storeId, customerPhone, noAudioReply);
      }
      return;
    }

    if (intent === "confirm" && conv.orderId) {
      // Only auto-confirm if order is still in "nouveau" state (not already confirmed)
      if (liveOrderStatus === "nouveau" || liveOrderStatus === null) {
        // Same safety gate as the JSON-based confirmation path below — never
        // confirm blind without a real name, city, address, and delivery
        // phone, either known already or collected during this conversation.
        const ctxForGate = await getOrderContext(conv.orderId);
        const fastPathCity = conv.collectedCity ?? ctxForGate?.customerCity ?? null;
        const fastPathName = conv.collectedName ?? conv.customerName ?? null;
        const fastPathAddress = conv.collectedAddress ?? ctxForGate?.customerAddress ?? null;
        const fastPathPhone = conv.collectedPhone ?? (ctxForGate?.orderSource !== "whatsapp" ? ctxForGate?.customerPhone : null) ?? null;
        if (!fastPathCity || !fastPathName || !fastPathAddress || !fastPathPhone) {
          const askMsg = buildMissingInfoMessage({ name: !fastPathName, phone: !fastPathPhone, city: !fastPathCity, address: !fastPathAddress });
          await queueWhatsApp(storeId, customerPhone, askMsg).catch(() => {});
          await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: askMsg }).catch(() => {});
          broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: askMsg, ts: Date.now() });
          return;
        }
        const confirmedAt = new Date();
        await storage.updateOrderStatus(conv.orderId, "confirme");
        // Sync the collected info into the real order record — not just aiConversations
        await db.update(orders).set({
          customerName: fastPathName, customerCity: fastPathCity, customerAddress: fastPathAddress, customerPhone: fastPathPhone,
        } as any).where(eq(orders.id, conv.orderId)).catch(() => {});
        await storage.updateAiConversationStatus(conv.id, "confirmed");
        await storage.updateConversationConfirmedAt(conv.id, confirmedAt);
        const msg = `صافي ${addr.formal}! الكوموند ديالك تأكدات ✅ غتخرج اليوم إن شاء الله وتوصلك من 24 لـ 48 ساعة. شكراً بزاف على ثقتك فينا 🎉🚀`;
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
      const isAlreadyShipped = liveOrderStatus === "expédié" || liveOrderStatus === "en_cours" || liveOrderStatus === "Attente De Ramassage";

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

      let ctx = conv.orderId ? await getOrderContext(conv.orderId) : null;
      const storeName = await getStoreName(storeId);
      console.log(`[AI] Searching context for ${customerPhone}... Context found: ${ctx?.productName ?? "no product"} | Price: ${ctx?.totalPrice ? (ctx.totalPrice/100).toFixed(0)+"DH" : "N/A"} | Status: ${ctx?.orderStatus ?? "N/A"}`);

      // Real catalog names for the LLM to match against when the customer
      // describes a product in their own words (e.g. "ساعة وسماعات في جهاز
      // واحد") rather than using its exact name — without this, mentioned_product
      // matching relied on the customer's phrasing literally containing the
      // real product name as a substring, which fails for paraphrases/descriptions.
      let catalogNamesForPrompt: string[] = [];
      try {
        const currentNorm = ctx?.productName ? normalizeForMatch(ctx.productName) : null;
        const catalogRows = await db.select({ name: products.name, stock: products.stock })
          .from(products).where(eq(products.storeId, storeId));
        catalogNamesForPrompt = catalogRows
          .filter(p => p.name && (p.stock ?? 0) > 0 && normalizeForMatch(p.name) !== currentNorm)
          .map(p => p.name!)
          .slice(0, 40);
      } catch { /* non-fatal — prompt just won't include the catalog list */ }

      // ── Dedicated, early product-mention check (before the main
      // conversational reply) ─────────────────────────────────────────
      // Runs a SEPARATE, focused classifier call instead of relying on the
      // main LLM to reliably self-report a product switch amid everything
      // else it's doing (confirmed live, repeatedly: unreliable). If a real
      // catalog product is detected, apply the switch and content-send NOW,
      // then refresh ctx so the main reply below reflects it correctly —
      // this is what fixes "asked about product B, still got info/media for
      // product A" once and for all.
      let earlyProductSwitchHandled = false;
      if (conv.orderId && catalogNamesForPrompt.length > 0) {
        const earlyMatch = await detectProductMentionAI(customerMessage, catalogNamesForPrompt, ctx?.productName ?? null, storeId);
        if (earlyMatch) {
          earlyProductSwitchHandled = await applyProductSwitch(storeId, customerPhone, conv, earlyMatch);
          if (earlyProductSwitchHandled) {
            ctx = await getOrderContext(conv.orderId); // refresh — now reflects the switch
            console.log(`[AI] Early product switch applied → ctx refreshed, now: ${ctx?.productName}`);
          }
        }
      }

      // Build step-specific system prompt
      const systemPrompt = isRecovery
        ? RECOVERY_SYSTEM_PROMPT
        : buildStepPrompt(currentStep, ctx, storeName, conv, settings?.systemPrompt, catalogNamesForPrompt);

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

      // ── Detect early whether this message is about a DIFFERENT product ──
      // Computed here (before step advancement) so the city/variant capture
      // below can skip it — otherwise a short, non-question message like
      // "بغيت شاحن العجيب" (3 words, not a question) would blindly get
      // stored as the customer's city/variant via looksLikeDirectAnswer,
      // which is exactly what was happening (confirmed live: an invented-
      // looking city that was actually the customer's product question).
      let effectiveMentionedProduct = earlyProductSwitchHandled ? null : decision.mentionedProduct;
      const currentProductNorm = ctx?.productName ? normalizeForMatch(ctx.productName) : null;
      if (!effectiveMentionedProduct && !earlyProductSwitchHandled) {
        const msgNorm = normalizeForMatch(customerMessage);
        const quickCatalog = await db.select({ name: products.name })
          .from(products).where(eq(products.storeId, storeId));
        const textMatch = quickCatalog.find(p => {
          if (!p.name || p.name.length < 3) return false;
          const pNorm = normalizeForMatch(p.name);
          if (currentProductNorm && pNorm === currentProductNorm) return false;
          return msgNorm.includes(pNorm);
        });
        if (textMatch) effectiveMentionedProduct = textMatch.name;
      }

      // ── Advance step based on what the customer just said ────────
      // Skip step advancement when in delivery companion mode (order already confirmed)
      const isDeliveryMode = ctx?.orderStatus === "confirme" || ctx?.orderStatus === "expédié" || ctx?.orderStatus === "en_cours" || ctx?.orderStatus === "Attente De Ramassage";
      if (!isRecovery && !isDeliveryMode) {
        let nextStep = currentStep;
        let stepData: { city?: string; variant?: string } = {};

        if (currentStep === 1) {
          const detectedCity = detectCity(customerMessage);
          if (detectedCity) {
            stepData.city = detectedCity;
            nextStep = 2;
            if (ctx?.productVariant) { stepData.variant = ctx.productVariant; nextStep = 3; }
          } else if (!effectiveMentionedProduct && looksLikeDirectAnswer(customerMessage) && customerMessage.length > 3) {
            stepData.city = customerMessage.trim();
            nextStep = 2;
            if (ctx?.productVariant) { stepData.variant = ctx.productVariant; nextStep = 3; }
          }
        } else if (currentStep === 2) {
          if (!effectiveMentionedProduct && looksLikeDirectAnswer(customerMessage) && customerMessage.length > 1) {
            stepData.variant = customerMessage.trim();
            nextStep = 3;
          }
        }

        if (nextStep !== currentStep) {
          await storage.updateConversationStep(conv.id, nextStep, stepData);
          console.log(`[AI] Conv ${conv.id} advanced: step ${currentStep} → ${nextStep}`, stepData);
        }
      }

      // ── Save name/city/address/phone the customer just stated (from the
      // LLM's own extraction) — separate from the step-based heuristic
      // above, this is the LLM reading what the customer actually wrote and
      // echoing it back verbatim, only when it says so explicitly (never
      // inferred/guessed).
      if (decision.collectedCity || decision.collectedName || decision.collectedAddress || decision.collectedPhone) {
        try {
          const update: Record<string, unknown> = {};
          if (decision.collectedCity) update.collectedCity = decision.collectedCity;
          if (decision.collectedName) update.collectedName = decision.collectedName;
          if (decision.collectedAddress) update.collectedAddress = decision.collectedAddress;
          if (decision.collectedPhone) update.collectedPhone = decision.collectedPhone;
          await db.update(aiConversations).set(update).where(eq(aiConversations.id, conv.id));
        } catch (e: any) {
          console.error(`[AI] Failed to save collected name/city/address/phone for conv ${conv.id}:`, e.message);
        }
      }

      // ── Offer real Confirme/Annule buttons the moment we have everything ──
      // Only once per conversation (confirmButtonsSent), right when
      // name+city+address+phone all become known — before this, wait for the
      // missing piece(s).
      const wasCityKnown = !!(conv.collectedCity ?? ctx?.customerCity);
      const wasNameKnown = !!(conv.collectedName ?? conv.customerName);
      const wasAddressKnown = !!(conv.collectedAddress ?? ctx?.customerAddress);
      const wasPhoneKnown = !!(conv.collectedPhone ?? (ctx?.orderSource !== "whatsapp" ? ctx?.customerPhone : null));
      const isCityKnownNow = wasCityKnown || !!decision.collectedCity;
      const isNameKnownNow = wasNameKnown || !!decision.collectedName;
      const isAddressKnownNow = wasAddressKnown || !!decision.collectedAddress;
      const isPhoneKnownNow = wasPhoneKnown || !!decision.collectedPhone;
      if (isCityKnownNow && isNameKnownNow && isAddressKnownNow && isPhoneKnownNow && !conv.confirmButtonsSent && conv.orderId && liveOrderStatus === "nouveau" && !decision.isConfirmed && !decision.isCancelled) {
        const buttonsSent = await sendWhatsAppButtons(
          customerPhone,
          "واش نأكدو الطلب ديالك؟ 🙏",
          [{ id: "confirm", text: "✅ تأكيد الطلبية" }, { id: "cancel", text: "❌ إلغاء الطلبية" }],
          storeId,
        ).catch(() => false);
        if (buttonsSent) {
          await db.update(aiConversations).set({ confirmButtonsSent: 1 }).where(eq(aiConversations.id, conv.id)).catch(() => {});
          console.log(`[AI] Conv ${conv.id} — sent Confirme/Annule buttons (name+city+address+phone now complete)`);
        }
      }

      // ── Log + broadcast reply to admin dashboard immediately ─────
      await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: aiReply });
      await storage.updateAiConversationLastMessage(conv.id, aiReply);

      broadcastToStore(storeId, "typing_stop", { conversationId: conv.id });
      broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: aiReply, ts: Date.now(), model, provider, step: currentStep });
      console.log(`[SOCKET_EMIT] message (assistant) → conv ${conv.id} | "${aiReply.substring(0, 60)}"`);

      // ── Customer asked about a DIFFERENT product than the current context ──
      // The AI has no real data about any product outside the conversation's
      // own order, so it was hallucinating answers (e.g. "not in stock" for a
      // product that IS in stock, and never sending its image/audio/video even
      // when configured in Produits WhatsApp). Look up the REAL product here
      // and send accurate info as a follow-up, instead of trusting the LLM's guess.
      // (effectiveMentionedProduct was already computed above, before step
      // advancement, so the city/variant heuristic could skip it too.)
      // ── Numbered catalog selection: customer replies with just a number ──
      // after being shown a list (e.g. "2") — resolve directly against the
      // list shown, since browsing a full catalog can't use real clickable
      // buttons (Green API caps interactive buttons at 3 per message).
      let numberSelectionProductId: number | null = null;
      const bareNumberMatch = customerMessage.trim().match(/^(\d+)$/);
      if (bareNumberMatch && conv.lastShownProductList?.length) {
        const idx = parseInt(bareNumberMatch[1], 10) - 1;
        if (idx >= 0 && idx < conv.lastShownProductList.length) {
          numberSelectionProductId = conv.lastShownProductList[idx];
        }
      }

      if (effectiveMentionedProduct || numberSelectionProductId) {
        const catalogProducts = await db.select({
          id: products.id, name: products.name, stock: products.stock, sellingPrice: products.sellingPrice, whatsappPrice: products.whatsappPrice,
          whatsappDescription: products.whatsappDescription,
          whatsappImageUrls: products.whatsappImageUrls,
          whatsappAudioUrls: products.whatsappAudioUrls,
          whatsappVideoUrls: products.whatsappVideoUrls,
        }).from(products).where(eq(products.storeId, storeId));

        const found = numberSelectionProductId
          ? catalogProducts.find(p => p.id === numberSelectionProductId)
          : (() => {
              const mentionedNorm = normalizeForMatch(effectiveMentionedProduct!);
              return catalogProducts.find(p => p.name && (
                mentionedNorm.includes(normalizeForMatch(p.name)) || normalizeForMatch(p.name).includes(mentionedNorm)
              ));
            })();

        let followUp: string;
        let sendImageUrls: string[] = [];
        let sendAudioUrls: string[] = [];
        let sendVideoUrls: string[] = [];
        if (found) {
          const inStock = (found.stock ?? 0) > 0;
          if (inStock) {
            const priceDh = (found.whatsappPrice ?? found.sellingPrice ?? 0) / 100;
            const priceLine = priceDh > 0 ? `💰 الثمن: ${priceDh} درهم` : "";
            followUp = [found.whatsappDescription || `إيوا خويا، "${found.name}" كاين فالستوك ✅`, priceLine].filter(Boolean).join("\n\n");
            sendImageUrls = (found.whatsappImageUrls as string[]) || [];
            sendAudioUrls = (found.whatsappAudioUrls as string[]) || [];
            sendVideoUrls = (found.whatsappVideoUrls as string[]) || [];
          } else {
            followUp = `سمح ليا خويا، "${found.name}" ما كاينش فالستوك دابا. إيلا بغيتي، نعلمك ملي يرجع.`;
          }
        } else if (numberSelectionProductId) {
          followUp = `سمح ليا خويا، ماكاينش هاد الرقم فاللائحة. عاود دير ليا الرقم الصحيح 🙏`;
        } else {
          // Not found by name — send the numbered catalog list so the
          // customer can browse and pick by number instead.
          const allProducts = catalogProducts.filter(p => (p.stock ?? 0) > 0).slice(0, 15);
          if (allProducts.length > 0) {
            const listText = allProducts.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
            followUp = `سمح ليا خويا، ما لقيتش "${effectiveMentionedProduct}" بالضبط. هاد المنتجات لي عندنا — بعث ليا الرقم لي يعجبك:\n\n${listText}`;
            await db.update(aiConversations).set({ lastShownProductList: allProducts.map(p => p.id) })
              .where(eq(aiConversations.id, conv.id)).catch(() => {});
          } else {
            followUp = `سمح ليا خويا، ما لقيتش "${effectiveMentionedProduct}" فالمنتجات ديالنا. واش عندك سؤال آخر؟ 🙏`;
          }
        }

        try {
          await queueWhatsApp(storeId, customerPhone, followUp);
          await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: followUp });
          await storage.updateAiConversationLastMessage(conv.id, followUp);
          broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: followUp, ts: Date.now() });
          console.log(`[AI] mentioned_product="${effectiveMentionedProduct}" → matched=${found?.name ?? "none"} stock=${found?.stock ?? "n/a"}`);

          // Send media as actual WhatsApp files, never as raw text URLs
          for (const url of sendImageUrls) await sendWhatsAppImage(customerPhone, url, found!.name, storeId).catch(() => {});
          for (const url of sendAudioUrls) await sendWhatsAppFile(customerPhone, url, "audio.opus", "", storeId).catch(() => {});
          for (const url of sendVideoUrls) await sendWhatsAppFile(customerPhone, url, "video.mp4", "", storeId).catch(() => {});

          // Switch the conversation's own product to the one just discussed —
          // otherwise the customer gets accurate info here, but the very next
          // reply falls back to whatever the order was originally about,
          // confusing the whole conversation.
          if (found && (found.stock ?? 0) > 0 && conv.orderId) {
            const [existingItem] = await db.select({ id: orderItems.id, quantity: orderItems.quantity })
              .from(orderItems).where(eq(orderItems.orderId, conv.orderId)).limit(1);
            const qty = existingItem?.quantity || 1;
            const effectivePrice = found.whatsappPrice ?? found.sellingPrice ?? 0;
            const newPriceCents = effectivePrice * qty;
            if (existingItem) {
              await db.update(orderItems).set({
                productId: found.id, rawProductName: found.name, price: effectivePrice,
              } as any).where(eq(orderItems.id, existingItem.id));
            } else {
              await db.insert(orderItems).values({
                orderId: conv.orderId, productId: found.id, rawProductName: found.name,
                quantity: 1, price: effectivePrice,
              } as any);
            }
            await db.update(orders).set({ totalPrice: newPriceCents, rawProductName: found.name } as any).where(eq(orders.id, conv.orderId));
            console.log(`[AI] Conv ${conv.id} order #${conv.orderId} switched to product "${found.name}" (id=${found.id})`);
          }
        } catch (mpErr: any) {
          // Never let a failure here silently swallow the customer's question —
          // log it loudly so it's visible instead of leaving them with just
          // the LLM's "checking..." placeholder and no real answer.
          console.error(`[AI] mentioned_product follow-up FAILED for conv ${conv.id}:`, mpErr?.message || mpErr);
        }
      }

      // ── JSON-driven confirmation / cancellation sync ──────────────
      // PRIMARY: rely on AI's structured JSON decision
      // FALLBACK: fast-path keyword detection (catches simple "واخا" before AI call runs below)
      //
      // Hard code-level gate — never trust the LLM's is_confirmed alone: it's
      // a prompt instruction, and prompt instructions aren't 100% reliable
      // (confirmed live: the model has invented names/cities before). Only
      // actually confirm when a real name, city, address, AND delivery
      // phone are known, either already on the order or collected during
      // this conversation.
      const effectiveCityForConfirm = conv.collectedCity ?? ctx?.customerCity ?? decision.collectedCity ?? null;
      const effectiveNameForConfirm = conv.collectedName ?? conv.customerName ?? decision.collectedName ?? null;
      const effectiveAddressForConfirm = conv.collectedAddress ?? ctx?.customerAddress ?? decision.collectedAddress ?? null;
      const effectivePhoneForConfirm = conv.collectedPhone ?? (ctx?.orderSource !== "whatsapp" ? ctx?.customerPhone : null) ?? decision.collectedPhone ?? null;
      const missingForConfirm = decision.isConfirmed && (!effectiveCityForConfirm || !effectiveNameForConfirm || !effectiveAddressForConfirm || !effectivePhoneForConfirm);
      const needsConfirm = decision.isConfirmed && conv.orderId && liveOrderStatus === "nouveau" && !missingForConfirm;
      if (missingForConfirm) {
        console.warn(`[AI] Blocked premature confirm for conv ${conv.id} — name=${effectiveNameForConfirm ?? "MISSING"} city=${effectiveCityForConfirm ?? "MISSING"} address=${effectiveAddressForConfirm ?? "MISSING"} phone=${effectivePhoneForConfirm ?? "MISSING"}`);
        const askMsg = buildMissingInfoMessage({ name: !effectiveNameForConfirm, phone: !effectivePhoneForConfirm, city: !effectiveCityForConfirm, address: !effectiveAddressForConfirm });
        await queueWhatsApp(storeId, customerPhone, askMsg).catch(() => {});
        await storage.createAiLog({ storeId, orderId: conv.orderId, customerPhone, role: "assistant", message: askMsg }).catch(() => {});
        broadcastToStore(storeId, "message", { conversationId: conv.id, role: "assistant", content: askMsg, ts: Date.now() });
      }
      const needsCancel  = decision.isCancelled && conv.orderId;

      if (needsConfirm) {
        const confirmedAt = new Date();
        await storage.updateOrderStatus(conv.orderId!, "confirme");
        // Sync the collected info into the real order record — not just aiConversations
        await db.update(orders).set({
          customerName: effectiveNameForConfirm, customerCity: effectiveCityForConfirm, customerAddress: effectiveAddressForConfirm, customerPhone: effectivePhoneForConfirm,
        } as any).where(eq(orders.id, conv.orderId!)).catch(() => {});
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


import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireAuth, requireAdmin, requireActiveSubscription, hashPassword, comparePasswords } from "./auth";
import { db } from "./db";
import { encrypt, decrypt } from "./crypto";
import { getValidAccessToken } from "./cron/sync-gsheets";
import { casablancaTomorrow, countConfirmeReporte } from "./utils/casablanca-time";
import { users, orders, orderItems, products, productVariants, stockMovements, storeIntegrations, integrationLogs, aiConversations, stores, storeAgentSettings, carrierAccounts, adSpendTracking, passwordSchema } from "@shared/schema";
import { eq, and, gte, lte, lt, count, desc, sql, inArray, sum } from "drizzle-orm";
import multer from "multer";
import path from "path";
import archiver from "archiver";
import { addSSEClient, broadcastToStore } from "./sse";
import { triggerAIForNewOrder, handleIncomingMessage } from "./ai-agent";
import { shipOrderToCarrier, trackAmeexShipment, mapAmeexStatus, getDigylogDeliveryCost } from "./services/carrier-service";
import { emitNewOrder, emitOrderUpdated } from "./socket";
import { pushOrderToSheet } from "./services/gsheets-push";

import fs from "fs";

// ── Strip HTML tags from API keys (Ameex sometimes stores wrapped values) ─────
function stripHtml(val: string | null | undefined): string {
  if (!val) return "";
  return val.replace(/<[^>]*>/g, "").trim();
}

// ── WhatsApp auto-send settings — per-store, in-memory ───────────────────────
const waAutoSettings: Record<number, { aiConfirmation: boolean; recoveryMessages: boolean; marketingAuto: boolean }> = {};

export function getWaAutoSettings(storeId: number) {
  return waAutoSettings[storeId] ?? { aiConfirmation: false, recoveryMessages: false, marketingAuto: false };
}

// All user-uploaded files live under DATA_DIR so Railway volumes work correctly.
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(".");
const UPLOADS_BASE = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOADS_BASE)) fs.mkdirSync(UPLOADS_BASE, { recursive: true });

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_BASE,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Seuls les fichiers PDF, JPG et PNG sont acceptés."));
  },
});

// Product image upload — saves to uploads/products/ (persistent between restarts)
const PRODUCT_IMG_DIR = path.join(UPLOADS_BASE, "products");
if (!fs.existsSync(PRODUCT_IMG_DIR)) fs.mkdirSync(PRODUCT_IMG_DIR, { recursive: true });

// LP builder image upload — saves to uploads/lp-images/
const LP_IMG_DIR = path.join(UPLOADS_BASE, "lp-images");
if (!fs.existsSync(LP_IMG_DIR)) fs.mkdirSync(LP_IMG_DIR, { recursive: true });

const lpImageUpload = multer({
  storage: multer.diskStorage({
    destination: LP_IMG_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Seuls les fichiers image (JPG, PNG, WEBP) sont acceptés."));
  },
});

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: PRODUCT_IMG_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Seuls les fichiers image (JPG, PNG, WEBP) sont acceptés."));
  },
});

// Leads import — memory storage (CSV / XLSX, max 5 MB)
const leadsImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv", "application/csv", "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ext === ".csv" || ext === ".xlsx" || ext === ".xls") cb(null, true);
    else cb(new Error("Seuls les fichiers CSV et XLSX sont acceptés."));
  },
});

/**
 * Replaces WhatsApp template variables with actual order data.
 * Returns the formatted message and a wa.me deep link.
 */
function formatWhatsAppMessage(order: any, template: string): { message: string; link: string } {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });

  const _baseProdName = order.rawProductName || order.productName || (order.items?.[0]?.rawProductName) || (order.items?.[0]?.product?.name) || '';
  const _prodVariant = (order.items?.[0]?.variantInfo || '').trim();
  const _displayProdName = (_prodVariant && _prodVariant !== 'Default Title' && _prodVariant !== 'null' && _prodVariant !== '-')
    ? `${_baseProdName} - ${_prodVariant}`
    : _baseProdName;

  const message = template
    .replace(/\*?\{Nom_Client\}\*?/g, order.customerName || '')
    .replace(/\*?\{Ville_Client\}\*?/g, order.customerCity || '')
    .replace(/\*?\{Address_Client\}\*?/g, order.customerAddress || '')
    .replace(/\*?\{Phone_Client\}\*?/g, order.customerPhone || '')
    .replace(/\*?\{Date_Commande\}\*?/g, dateStr)
    .replace(/\*?\{Heure\}\*?/g, timeStr)
    .replace(/\*?\{Nom_Produit\}\*?/g, _displayProdName)
    .replace(/\*?\{Transporteur\}\*?/g, order.shippingProvider || '')
    .replace(/\*?\{Date_Livraison\}\*?/g, order.expectedDelivery || '');

  const phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
  const intlPhone = phone.startsWith('0') ? '212' + phone.slice(1) : phone;
  const link = `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`;
  return { message, link };
}

function splitUtmSource(raw: string | null): { buyerCode: string | null; trafficPlatform: string | null } {
  if (!raw) return { buyerCode: null, trafficPlatform: null };
  const parts = raw.split('*');
  // Always uppercase the buyer code so it matches the DB (stored as uppercase)
  const buyerCode = parts[0].trim().toUpperCase() || null;
  const trafficPlatform = parts.length > 1 ? parts[1].trim() || null : null;
  return { buyerCode, trafficPlatform };
}

function extractUtmParams(payload: any): { utmSource: string | null; utmCampaign: string | null; trafficPlatform: string | null } {
  let rawSource: string | null = null;
  let rawCampaign: string | null = null;

  const noteAttributes = payload.note_attributes || payload.note_attribute || [];
  if (Array.isArray(noteAttributes) && noteAttributes.length > 0) {
    const src = noteAttributes.find((a: any) => a.name === 'utm_source')?.value || null;
    const cmp = noteAttributes.find((a: any) => a.name === 'utm_campaign')?.value || null;
    if (src || cmp) { rawSource = src; rawCampaign = cmp; }
  }
  if (!rawSource && !rawCampaign) {
    const metaData = payload.meta_data || [];
    if (Array.isArray(metaData) && metaData.length > 0) {
      const srcMeta = metaData.find((m: any) => m.key === '_utm_source' || m.key === 'utm_source');
      const cmpMeta = metaData.find((m: any) => m.key === '_utm_campaign' || m.key === 'utm_campaign');
      if (srcMeta || cmpMeta) { rawSource = srcMeta?.value || null; rawCampaign = cmpMeta?.value || null; }
    }
  }
  if (!rawSource && !rawCampaign && (payload.utm_source || payload.utm_campaign)) {
    rawSource = payload.utm_source || null;
    rawCampaign = payload.utm_campaign || null;
  }
  if (!rawSource && !rawCampaign) {
    const landingSite = payload.landing_site || payload.landing_site_ref || '';
    if (landingSite) {
      try {
        const url = new URL(landingSite.startsWith('http') ? landingSite : `https://x.com${landingSite}`);
        rawSource = url.searchParams.get('utm_source');
        rawCampaign = url.searchParams.get('utm_campaign');
      } catch {}
    }
  }
  const { buyerCode, trafficPlatform } = splitUtmSource(rawSource);
  return { utmSource: rawSource, buyerCode, utmCampaign: rawCampaign, trafficPlatform };
}

// ─── Carrier city lists (mirrored from client/src/lib/carrier-cities.ts) ─────
const DIGYLOG_CITIES_DEFAULT = [
  "Agadir","Afourer","Aghbala","Ain El Aouda","Ain Harrouda","Ain Taoujdate",
  "Ait Melloul","Al Hoceima","Assa","Asilah","Azemmour","Azilal","Azrou",
  "Bejaad","Ben Ahmed","Ben Guerir","Beni Mellal","Berkane","Berrechid",
  "Bouarfa","Boujdour","Bouskoura","Casablanca","Chefchaouen",
  "Dakhla","Dcheira El Jihadia",
  "El Hajeb","El Jadida","El Kelaa des Sraghna","Errachidia","Erfoud","Essaouira",
  "Fès","Fnideq","Figuig","Guelmim","Ifrane","Inezgane","Jerada",
  "Kénitra","Khémisset","Khénifra","Khouribga","Ksar El Kebir",
  "Laâyoune","Larache",
  "Marrakech","Martil","Mdiq","Meknès","Midelt","Mohammedia","Moulay Bousselham",
  "Nador","Oued Zem","Oujda","Ouarzazate","Ouled Teima",
  "Rabat","Rissani",
  "Safi","Salé","Selouane","Settat","Sidi Bennour","Sidi Ifni","Sidi Kacem",
  "Sidi Slimane","Sidi Yahia El Gharb","Souk El Arbaa",
  "Tahanaout","Tanger","Taourirt","Taroudant","Taza","Temara","Tétouan",
  "Tinghir","Tiznit","Zagora",
].sort();

const AMEEX_CITIES_DEFAULT = [
  "Agadir","Afourer","Aghbala","Ain El Aouda","Ain Harrouda","Ain Taoujdate",
  "Ait Melloul","Al Hoceima","Assa","Asilah","Azemmour","Azilal","Azrou",
  "Bejaad","Ben Ahmed","Ben Guerir","Beni Mellal","Berkane","Berrechid",
  "Bouarfa","Boujdour","Bouskoura","Casablanca","Chefchaouen",
  "Dakhla","Dcheira El Jihadia",
  "El Hajeb","El Jadida","El Kelaa des Sraghna","Errachidia","Erfoud","Essaouira",
  "Fès","Fnideq","Figuig","Guelmim","Ifrane","Inezgane","Jerada",
  "Kénitra","Khémisset","Khénifra","Khouribga","Ksar El Kebir",
  "Laâyoune","Larache",
  "Marrakech","Martil","Mdiq","Meknès","Midelt","Mohammedia","Moulay Bousselham",
  "Nador","Oued Zem","Oujda","Ouarzazate","Ouled Teima",
  "Rabat","Rissani",
  "Safi","Salé","Selouane","Settat","Sidi Bennour","Sidi Ifni","Sidi Kacem",
  "Sidi Slimane","Sidi Yahia El Gharb","Souk El Arbaa",
  "Tahanaout","Tanger","Taourirt","Taroudant","Taza","Temara","Tétouan",
  "Tinghir","Tiznit","Zagora",
].sort();

const CATHEDIS_CITIES_DEFAULT = [
  "Agadir","Ait Melloul","Al Hoceima","Asilah","Ben Guerir","Beni Mellal",
  "Berkane","Berrechid","Casablanca","Chefchaouen","Dakhla","Dcheira El Jihadia",
  "El Jadida","Errachidia","Essaouira","Fès","Fnideq","Guelmim","Ifrane","Inezgane",
  "Jerada","Kénitra","Khémisset","Khénifra","Khouribga","Laâyoune","Larache",
  "Marrakech","Meknès","Mohammedia","Nador","Oujda","Ouarzazate","Ouled Teima",
  "Rabat","Safi","Salé","Settat","Sidi Kacem","Sidi Slimane","Souk El Arbaa",
  "Tanger","Taourirt","Taroudant","Taza","Temara","Tétouan","Tiznit","Zagora",
].sort();

const MOROCCAN_CITIES_DEFAULT = [
  "Agadir","Ait Melloul","Al Hoceima","Asilah","Azilal","Azrou",
  "Beni Mellal","Berkane","Berrechid","Casablanca","Chefchaouen",
  "Dakhla","Dcheira El Jihadia","El Jadida","Errachidia","Essaouira",
  "Fès","Guelmim","Ifrane","Inezgane","Jerada",
  "Kénitra","Khémisset","Khénifra","Khouribga","Laâyoune","Larache",
  "Marrakech","Meknès","Mohammedia","Nador","Oujda","Ouarzazate","Ouled Teima",
  "Rabat","Safi","Salé","Settat","Sidi Kacem","Sidi Slimane","Souk El Arbaa",
  "Tanger","Taourirt","Taroudant","Taza","Temara","Tétouan","Tiznit","Zagora",
].sort();

const CITY_ALIASES_SERVER: Record<string, string> = {
  casa:"Casablanca",csl:"Casablanca","dar beida":"Casablanca",casablanca:"Casablanca",
  rbt:"Rabat",fes:"Fès",fez:"Fès",fas:"Fès",
  tangier:"Tanger",tangermed:"Tanger",
  marrakesh:"Marrakech",meknes:"Meknès",kenitra:"Kénitra",
  tetouane:"Tétouan",tetouan:"Tétouan",laayoune:"Laâyoune",
  taroudnat:"Taroudant",khmisset:"Khémisset",khemisset:"Khémisset",
  khnifra:"Khénifra",khenifra:"Khénifra",benmellal:"Beni Mellal",
  inzgane:"Inezgane",mohammadia:"Mohammedia",sale:"Salé",
  jdida:"El Jadida","eljadida":"El Jadida",ksar:"Ksar El Kebir",
  wzzt:"Ouarzazate",goulimine:"Guelmim",
};

function normCity(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}

function getDefaultCitiesForProvider(provider: string): string[] {
  const p = (provider||"").toLowerCase();
  if (p.includes("digylog")||p.includes("ecotrack")||p.includes("eco-track")) return DIGYLOG_CITIES_DEFAULT;
  if (p.includes("cathedis")) return CATHEDIS_CITIES_DEFAULT;
  if (p.includes("ameex")) return AMEEX_CITIES_DEFAULT;
  return MOROCCAN_CITIES_DEFAULT;
}

const CARRIER_LOGOS_SERVER: Record<string, string> = {
  digylog: '/carriers/digylog.svg',
  onessta: '/carriers/onessta.svg',
  ozoneexpress: '/carriers/ozon.svg',
  'ozone express': '/carriers/ozon.svg',
  ozon: '/carriers/ozon.svg',
  sendit: '/carriers/sendit.svg',
  ameex: '/carriers/ameex.svg',
  cathedis: '/carriers/cathidis.svg',
  cathidis: '/carriers/cathidis.svg',
  speedex: '/carriers/speedx.png',
  speedx: '/carriers/speedx.png',
  kargoexpress: '/carriers/cargo.svg',
  'kargo express': '/carriers/cargo.svg',
  cargo: '/carriers/cargo.svg',
  forcelog: '/carriers/forcelog.png',
  livo: '/carriers/ol.svg',
  ol: '/carriers/ol.svg',
  quicklivraison: '/carriers/ql.svg',
  'quick livraison': '/carriers/ql.svg',
  ql: '/carriers/ql.svg',
};

/** Auto-match a raw city name against a carrier's city list. Returns best match or null. */
function autoMatchCity(raw: string, cities: string[]): string | null {
  if (!raw || !cities.length) return null;
  const rawN = normCity(raw);
  if (!rawN) return null;
  const exact = cities.find(c => normCity(c) === rawN);
  if (exact) return exact;
  const alias = CITY_ALIASES_SERVER[rawN];
  if (alias) {
    const am = cities.find(c => normCity(c) === normCity(alias));
    if (am) return am;
  }
  if (rawN.length >= 3) {
    const sw = cities.find(c => normCity(c).startsWith(rawN));
    if (sw) return sw;
    const rs = cities.find(c => rawN.startsWith(normCity(c)) && normCity(c).length >= 3);
    if (rs) return rs;
  }
  if (rawN.length >= 4) {
    const inc = cities.find(c => normCity(c).includes(rawN));
    if (inc) return inc;
    const inc2 = cities.find(c => rawN.includes(normCity(c)) && normCity(c).length >= 4);
    if (inc2) return inc2;
  }
  return null;
}

/** Strip meaningless variant strings that arrive from Shopify/YouCan */
function sanitizeVariant(raw: any): string {
  if (!raw) return '';
  const s = String(raw).trim();
  // Shopify default, JS null coercion, or empty placeholder
  if (s === 'null' || s === 'undefined' || s === 'Default Title' || s === '-') return '';
  return s;
}

/** Strip lone hyphens/dashes left by stores that use "-" as a placeholder last name */
function cleanName(raw: string): string {
  return raw
    .split(' ')
    .map(p => p.trim())
    .filter(p => p !== '' && p !== '-' && p !== '–' && p !== '—')
    .join(' ')
    .trim();
}

function parseWebhookOrder(provider: string, payload: any) {
  const { utmSource, buyerCode, utmCampaign, trafficPlatform } = extractUtmParams(payload);

  if (provider === 'shopify') {
    const firstName = payload.customer?.first_name?.trim() || '';
    const lastName = payload.customer?.last_name?.trim() || '';
    const rawName = payload.customer
      ? (firstName.toLowerCase() === lastName.toLowerCase() || !lastName
          ? firstName
          : `${firstName} ${lastName}`).trim()
      : (payload.shipping_address?.name || 'Client Shopify');
    const customerName = cleanName(rawName) || 'Client Shopify';
    const customerPhone = payload.customer?.phone
      || payload.shipping_address?.phone
      || payload.billing_address?.phone
      || '';
    const customerAddress = payload.shipping_address
      ? `${payload.shipping_address.address1 || ''} ${payload.shipping_address.address2 || ''}`.trim()
      : '';
    const customerCity = payload.shipping_address?.city || '';
    const totalPrice = Math.round(parseFloat(payload.total_price || '0') * 100);
    const orderNumber = String(payload.order_number || payload.id);
    const lineItems = (payload.line_items || []).map((item: any) => ({
      sku: item.sku || '',
      title: item.title || '',
      variantInfo: sanitizeVariant(item.variant_title),
      quantity: item.quantity || 1,
      price: Math.round(parseFloat(item.price || '0') * 100),
    }));
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.note || null, utmSource, buyerCode, utmCampaign, trafficPlatform };
  }

  if (provider === 'youcan') {
    const customerName = payload.customer?.full_name || payload.customer?.first_name || 'Client YouCan';
    const customerPhone = payload.customer?.phone || payload.shipping_address?.phone || '';
    const customerAddress = payload.shipping_address?.address || '';
    const customerCity = payload.shipping_address?.city || '';
    const totalPrice = Math.round(parseFloat(payload.total_price || payload.total || '0') * 100);
    const orderNumber = String(payload.ref || payload.id || Date.now());
    const lineItems = (payload.items || payload.line_items || []).map((item: any) => ({
      sku: item.sku || '',
      title: item.name || item.title || '',
      variantInfo: sanitizeVariant(item.variant_title),
      quantity: item.quantity || 1,
      price: Math.round(parseFloat(item.price || '0') * 100),
    }));
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.note || null, utmSource, buyerCode, utmCampaign, trafficPlatform };
  }

  if (provider === 'woocommerce') {
    const billing = payload.billing || {};
    const shipping = payload.shipping || {};
    const customerName = cleanName(`${billing.first_name || shipping.first_name || ''} ${billing.last_name || shipping.last_name || ''}`) || 'Client WooCommerce';
    const customerPhone = billing.phone || '';
    const customerAddress = `${shipping.address_1 || billing.address_1 || ''} ${shipping.address_2 || billing.address_2 || ''}`.trim();
    const customerCity = shipping.city || billing.city || '';
    const totalPrice = Math.round(parseFloat(payload.total || '0') * 100);
    const orderNumber = String(payload.number || payload.id);
    const lineItems = (payload.line_items || []).map((item: any) => {
      // Extract human-readable variant from meta_data attributes
      const meta: any[] = item.meta_data || [];
      const variantParts = meta
        .filter((m: any) => m.display_key && !String(m.display_key).startsWith('_') && m.display_value && String(m.display_value).trim())
        .map((m: any) => String(m.display_value).trim());
      const variantInfo = variantParts.length > 0
        ? sanitizeVariant(variantParts.join(' / '))
        : (item.variation_id ? sanitizeVariant(String(item.variation_id)) : '');
      return {
        sku: item.sku || '',
        title: item.name || '',
        variantInfo,
        quantity: item.quantity || 1,
        price: Math.round(parseFloat(item.price || '0') * 100),
      };
    });
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.customer_note || null, utmSource, buyerCode, utmCampaign, trafficPlatform };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// Bump distribution_epoch on every magasin AFFECTED by a change to this agent.
// A magasin is affected when:
//   - its agentIds explicitly contains this agentId, OR
//   - its agentIds is empty (legacy fallback = "all account agents are eligible")
// Returns the number of magasins bumped (for logging).
async function bumpAgentRelatedEpochs(ownerId: number, agentId: number): Promise<number> {
  try {
    const owned = await storage.getStoresByOwner(ownerId);
    const affected = owned.filter(m => {
      const ids = Array.isArray((m as any).agentIds) ? (m as any).agentIds.map(Number) : [];
      return ids.length === 0 || ids.includes(agentId);
    });
    for (const m of affected) await storage.bumpDistributionEpoch(m.id);
    return affected.length;
  } catch (err) {
    console.warn('[DIST-EPOCH] bumpAgentRelatedEpochs failed (non-fatal):', err);
    return 0;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  /* ── Health check — used by Railway (and load balancers) ─────── */
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.get(api.stats.get.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const ordersList = await storage.getOrdersByStore(storeId);

    // Cumulative confirmed statuses: once an order is confirmed it stays "confirmed"
    // regardless of shipping progress (expédié, in_progress, delivered, refused, retourné)
    const CONFIRMED_STATUSES = new Set(['confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné']);

    let totalOrders = ordersList.length;
    let cumConfirmed = 0, inProgress = 0, delivered = 0, refused = 0;
    let injoignable = 0, annuleFake = 0, annuleFauxNumero = 0, annuleDouble = 0, boiteVocale = 0;
    let nouveau = 0;
    let revenue = 0, profit = 0;

    ordersList.forEach(o => {
      if (o.status === 'nouveau') nouveau++;
      else if (o.status === 'Injoignable') injoignable++;
      else if (o.status === 'Annulé (fake)') annuleFake++;
      else if (o.status === 'Annulé (faux numéro)') annuleFauxNumero++;
      else if (o.status === 'Annulé (double)') annuleDouble++;
      else if (o.status === 'boite vocale') boiteVocale++;

      // Cumulative: count as confirmed if order ever reached confirmation stage
      if (CONFIRMED_STATUSES.has(o.status)) cumConfirmed++;
      if (o.status === 'in_progress') inProgress++;
      if (o.status === 'delivered') delivered++;
      if (o.status === 'refused') refused++;

      if (['confirme', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
      }
      if (o.status === 'delivered') {
        profit += (o.totalPrice - o.productCost - 4000 - o.adSpend);
      }
    });

    const cancelled = annuleFake + annuleFauxNumero + annuleDouble;
    // Confirmation rate = cumulative confirmed / total leads (stays stable after shipping)
    const confirmationRate = totalOrders > 0 ? Math.round(cumConfirmed / totalOrders * 100) : 0;

    // ── "Confirmé Reporté" badge counts ─────────────────────────────────────
    // Drives the amber badge on the sidebar. We count any reporté order whose
    // scheduled date is today or tomorrow (Casablanca calendar) so agents have
    // a 24h heads-up to call the customer before the auto-promotion fires.
    const tomorrowCas = casablancaTomorrow();
    const reporteCounts = countConfirmeReporte(ordersList, tomorrowCas);

    res.json({
      totalOrders, nouveau, confirme: cumConfirmed, inProgress, cancelled, delivered, refused,
      injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale,
      revenue, profit, confirmationRate,
      confirmeReporteDueSoon: reporteCounts.dueSoon,
      confirmeReporteTotal:   reporteCounts.total,
    });
  });

  app.get("/api/stats/daily", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const ordersList = await storage.getOrdersByStore(storeId);
    const dailyMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    ordersList.forEach(o => {
      if (o.createdAt) {
        const day = new Date(o.createdAt).toISOString().slice(0, 10);
        if (dailyMap[day] !== undefined) dailyMap[day]++;
      }
    });
    const daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));
    res.json(daily);
  });

  app.get("/api/stats/top-products", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const ordersList = await storage.getOrdersByStore(storeId);
    const productMap: Record<number, { name: string; orders: number; quantity: number; revenue: number }> = {};
    ordersList.forEach(o => {
      if (['confirme', 'delivered'].includes(o.status) && o.items) {
        o.items.forEach((item: any) => {
          const pid = item.productId;
          if (!productMap[pid]) productMap[pid] = { name: item.product?.name || `Produit #${pid}`, orders: 0, quantity: 0, revenue: 0 };
          productMap[pid].orders++;
          productMap[pid].quantity += item.quantity;
          productMap[pid].revenue += item.price * item.quantity;
        });
      }
    });
    const sorted = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const maxRevenue = sorted[0]?.revenue || 1;
    res.json(sorted.map(p => ({ ...p, share: Math.round((p.revenue / maxRevenue) * 100) })));
  });

  app.get("/api/stats/filter-options", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const { magasinId } = req.query as Record<string, string>;
    let allOrders = await storage.getOrdersByStore(storeId);
    // When a magasin is selected on the dashboard, narrow the dropdown
    // options (cities, sources, etc.) to that magasin's data so users don't
    // see options that won't match anything once the magasin filter applies.
    if (magasinId && magasinId !== 'all') {
      const mid = Number(magasinId);
      allOrders = allOrders.filter(o => (o as any).magasinId === mid);
    }
    const storeProducts = await storage.getProductsByStore(storeId);
    const storeAgents = (await storage.getUsersByStore(storeId)).filter(u => u.role === 'agent');

    const cities = [...new Set(allOrders.map(o => o.customerCity).filter(Boolean))].sort();
    const sources = [...new Set(allOrders.map(o => o.source).filter(Boolean))].sort();
    const shippingProviders = [...new Set(allOrders.map(o => o.shippingProvider).filter(Boolean))].sort();
    const utmSources = [...new Set(allOrders.map(o => (o as any).utmSource).filter(Boolean))].sort();
    const utmCampaigns = [...new Set(allOrders.map(o => (o as any).utmCampaign).filter(Boolean))].sort();

    res.json({
      cities,
      sources,
      shippingProviders,
      utmSources,
      utmCampaigns,
      products: storeProducts.map(p => ({ id: p.id, name: p.name })),
      agents: storeAgents.map(a => ({ id: a.id, username: a.username })),
    });
  });

  app.get("/api/stats/filtered", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const currentUser = req.user!;
    const isAgent = currentUser.role === 'agent';
    const { city, productId, source, dateFrom, dateTo, shippingProvider, utmSource, utmCampaign, magasinId } = req.query as Record<string, string>;
    let { agentId } = req.query as Record<string, string>;
    console.log(`[STATS] storeId=${storeId} magasinId=${magasinId ?? 'all'} city=${city ?? 'all'} agent=${agentId ?? 'all'}`);

    let agentPermissions: Record<string, boolean> = {};
    if (isAgent) {
      agentPermissions = await storage.getAgentPermissions(currentUser.id);
      if (!agentPermissions.show_store_orders) {
        agentId = String(currentUser.id);
      }
    }

    let allOrders = await storage.getOrdersByStore(storeId);

    if (city && city !== 'all') {
      allOrders = allOrders.filter(o => o.customerCity === city);
    }
    if (productId && productId !== 'all') {
      const pid = Number(productId);
      // Also match by rawProductName for orders created before the product was added to stock
      const productRecord = await db.select({ name: products.name })
        .from(products).where(eq(products.id, pid)).limit(1);
      const productName = productRecord[0]?.name?.toLowerCase().trim() || '';
      allOrders = allOrders.filter(o =>
        o.items?.some((i: any) =>
          i.productId === pid ||
          (productName && (i.rawProductName || '').toLowerCase().trim().includes(productName)) ||
          (productName && (o as any).rawProductName && (o as any).rawProductName.toLowerCase().trim().includes(productName))
        )
      );
    }
    if (agentId && agentId !== 'all') {
      allOrders = allOrders.filter(o => o.assignedToId === Number(agentId));
    }
    if (source && source !== 'all') {
      allOrders = allOrders.filter(o => o.source === source);
    }
    if (shippingProvider && shippingProvider !== 'all') {
      allOrders = allOrders.filter(o => o.shippingProvider === shippingProvider);
    }
    if (utmSource && utmSource !== 'all') {
      allOrders = allOrders.filter(o => (o as any).utmSource === utmSource);
    }
    if (utmCampaign && utmCampaign !== 'all') {
      allOrders = allOrders.filter(o => (o as any).utmCampaign === utmCampaign);
    }
    if (magasinId && magasinId !== 'all') {
      const mid = Number(magasinId);
      allOrders = allOrders.filter(o => (o as any).magasinId === mid);
    }
    if (dateFrom) {
      // Parse as local calendar date (not UTC midnight) to avoid TZ shift
      const [fy, fm, fd] = dateFrom.split('-').map(Number);
      const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (dateTo) {
      const [ty, tm, td] = dateTo.split('-').map(Number);
      const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) <= to);
    }

    let totalOrders = allOrders.length;
    // CONFIRMED = all statuses an order passes through after agent confirmation
    // (cumulative: once confirmed, always counted as confirmed regardless of shipping stage)
    const ADMIN_CONFIRMED = new Set(['confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné']);
    let nouveau = 0, confirme = 0, inProgress = 0, delivered = 0, refused = 0;
    let injoignable = 0, annuleFake = 0, annuleFauxNumero = 0, annuleDouble = 0, boiteVocale = 0;
    let pasReponse = 0, rappel = 0;
    let revenue = 0, totalProductCost = 0, totalShipping = 0, totalPackaging = 0, totalAgentCommissions = 0;

    // Fetch store packaging cost and agent commission rates for accurate profit calc
    const storeData = await storage.getStore(storeId);
    const storePackagingCost = (storeData as any)?.packagingCost ?? 0;
    const agentSettingsList = await storage.getStoreAgentSettings(storeId);
    const agentCommissionMap = new Map<number, number>(
      agentSettingsList.map((s: any) => [s.agentId, s.commissionRate ?? 0])
    );

    // Real COGS: use order_items × products.cost_price, fallback to orders.product_cost
    const deliveredInFilter = allOrders.filter(o => o.status === 'delivered');
    const statsCogsMap = await storage.computeOrdersCOGS(
      deliveredInFilter.map(o => ({ id: o.id, productCost: (o as any).productCost ?? 0 }))
    );

    // Delivery tracking
    let totalShipped = 0, deliveredShipped = 0, refusedShipped = 0, pendingShipped = 0;
    const byCarrier: Record<string, { total: number; delivered: number; pending: number; refused: number }> = {};

    allOrders.forEach(o => {
      if (o.status === 'nouveau') nouveau++;
      else if (o.status === 'rappel') rappel++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'refused') refused++;
      else if (o.status === 'Injoignable') injoignable++;
      else if (o.status === 'Annulé (fake)') annuleFake++;
      else if (o.status === 'Annulé (faux numéro)') annuleFauxNumero++;
      else if (o.status === 'Annulé (double)') annuleDouble++;
      else if (o.status === 'boite vocale') boiteVocale++;
      // Pas de réponse 1/2/3/4 grouped count for sidebar badge
      if (typeof o.status === 'string' && o.status.startsWith('Pas de réponse')) pasReponse++;

      // confirme = ALL confirmed statuses: 'confirme' + 'expédié' + 'delivered'
      if (ADMIN_CONFIRMED.has(o.status)) confirme++;
      // delivered = only truly delivered
      if (o.status === 'delivered') delivered++;

      // Delivery shipping tracking
      if ((o as any).trackNumber) {
        totalShipped++;
        const carrier = (o as any).shippingProvider || 'Inconnu';
        if (!byCarrier[carrier]) byCarrier[carrier] = { total: 0, delivered: 0, pending: 0, refused: 0 };
        byCarrier[carrier].total++;
        if (o.status === 'delivered') { deliveredShipped++; byCarrier[carrier].delivered++; }
        else if (['refused', 'retourné', 'Retour Recu'].includes(o.status)) { refusedShipped++; byCarrier[carrier].refused++; }
        else { pendingShipped++; byCarrier[carrier].pending++; }
      }

      // Revenue & costs: only from delivered orders
      if (o.status === 'delivered') {
        revenue += (o.totalPrice ?? 0);
        totalProductCost += statsCogsMap.get(o.id) ?? 0;
        totalShipping += (o.shippingCost ?? 0);
        totalPackaging += storePackagingCost;
        // Agent commission: stored in DH, convert to cents
        if (o.assignedToId) {
          const rate = agentCommissionMap.get(o.assignedToId) ?? 0;
          totalAgentCommissions += rate * 100;
        }
      }
    });

    // City stats
    const cityMap: Record<string, { name: string; total: number; confirmed: number; delivered: number }> = {};
    allOrders.forEach(o => {
      const city = (o as any).customerCity || 'Inconnue';
      if (!cityMap[city]) cityMap[city] = { name: city, total: 0, confirmed: 0, delivered: 0 };
      cityMap[city].total++;
      if (ADMIN_CONFIRMED.has(o.status)) cityMap[city].confirmed++;
      if (o.status === 'delivered') cityMap[city].delivered++;
    });
    const cityStats = Object.values(cityMap).sort((a, b) => b.delivered - a.delivered).slice(0, 10);

    const cancelled = annuleFake + annuleFauxNumero + annuleDouble;
    // confirmationRate = (confirme + expédié + delivered) / total
    const confirmationRate = totalOrders > 0 ? Math.round(confirme / totalOrders * 100) : 0;
    // deliveryRate = delivered / confirmed (not divided by total)
    const deliveryRate = confirme > 0 ? Math.round(delivered / confirme * 100) : 0;

    const dailyMap: Record<string, { total: number; confirmed: number; delivered: number }> = {};
    const now = new Date();
    const startDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const endDate = dateTo ? new Date(dateTo + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dailyMap[cursor.toISOString().slice(0, 10)] = { total: 0, confirmed: 0, delivered: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }
    allOrders.forEach(o => {
      if (o.createdAt) {
        const day = new Date(o.createdAt).toISOString().slice(0, 10);
        if (dailyMap[day] !== undefined) {
          dailyMap[day].total++;
          if (ADMIN_CONFIRMED.has(o.status)) dailyMap[day].confirmed++;
          if (o.status === 'delivered') dailyMap[day].delivered++;
        }
      }
    });
    const daily = Object.entries(dailyMap).map(([date, d]) => ({ date, count: d.total, confirmed: d.confirmed, delivered: d.delivered }));

    const storeProducts = await storage.getProductsByStore(storeId);
    const internalProductNames = new Set(storeProducts.map((p: any) => p.name.toLowerCase().trim()));

    const rawProductMap: Record<string, { name: string; total: number; confirme: number; inProgress: number; delivered: number; inStock: boolean }> = {};
    allOrders.forEach(o => {
      const rawName: string | null = (o as any).rawProductName
        || (o.items && o.items.length > 0
          ? ((o.items[0] as any).rawProductName || o.items[0].product?.name)
          : null)
        || null;
      if (!rawName) return;
      const rawVariantVal: string = (o.items && o.items.length > 0 ? (o.items[0] as any).variantInfo : null) || '';
      const v = rawVariantVal.trim();
      // Avoid duplicate variant: if rawName already ends with the variant value, don't append it again
      const variantAlreadyInName = v && rawName.toLowerCase().trim().endsWith(v.toLowerCase().trim());
      const displayName = (v && v !== 'Default Title' && v !== 'null' && v !== '-' && !variantAlreadyInName)
        ? `${rawName} - ${v}`
        : rawName;
      const key = displayName.toLowerCase().trim();
      if (!rawProductMap[key]) {
        rawProductMap[key] = {
          name: displayName,
          total: 0,
          confirme: 0,
          inProgress: 0,
          delivered: 0,
          inStock: internalProductNames.has(rawName.toLowerCase().trim()),
        };
      }
      rawProductMap[key].total++;
      // confirme column = ALL confirmed: 'confirme' + 'expédié' + 'delivered'
      if (ADMIN_CONFIRMED.has(o.status)) rawProductMap[key].confirme++;
      // inProgress = all orders currently with the carrier
      if (['in_progress', 'expédié', 'Attente De Ramassage'].includes(o.status)) rawProductMap[key].inProgress++;
      if (o.status === 'delivered') rawProductMap[key].delivered++;
    });
    const productPerformance = Object.values(rawProductMap).sort((a, b) => b.total - a.total);
    const topProducts = productPerformance.slice(0, 10);
    const maxRevenue = 1;

    // Derive ad source filter from UTM source (e.g. "BB*Facebook-Ads" → "Facebook Ads")
    const AD_SOURCE_MAP: Record<string, string> = {
      'Facebook-Ads': 'Facebook Ads', 'TikTok-Ads': 'TikTok Ads',
      'Google-Ads': 'Google Ads', 'Snapchat-Ads': 'Snapchat Ads',
    };
    let adSourceFilter: string | null = null;
    if (utmSource && utmSource !== 'all') {
      const platformPart = utmSource.includes('*') ? utmSource.split('*')[1] : utmSource;
      adSourceFilter = AD_SOURCE_MAP[platformPart] || null;
    }

    let adSpendTotal = 0;
    const productAdCostMap: Record<number, number> = {};
    const activeProductId = (productId && productId !== 'all') ? Number(productId) : null;
    // Legacy adSpendTracking — amounts stored in DH → multiply by 100 to convert to centimes
    const adSpendEntries = await storage.getAdSpend(storeId);
    adSpendEntries.forEach((e: any) => {
      // Product isolation: when a product is selected, ONLY include spend tagged for that product.
      // Untagged (null) entries are global marketing costs — excluded from single-product view.
      if (activeProductId !== null) {
        if (e.productId !== activeProductId) return;
      }
      if (adSourceFilter && e.source && e.source !== adSourceFilter) return;
      // Filter by date range — both bounds
      const eDate = (e.date || '').substring(0, 10);
      if (dateFrom && eDate < dateFrom.substring(0, 10)) return;
      if (dateTo   && eDate > dateTo.substring(0, 10))   return;
      const amountCents = Math.round(Number(e.amount ?? 0) * 100);
      adSpendTotal += amountCents;
      if (e.productId) productAdCostMap[e.productId] = (productAdCostMap[e.productId] || 0) + amountCents;
    });
    // New adSpend table (Publicités module) — amounts already in centimes
    const newAdSpendEntries = await storage.getAdSpendEntries(storeId, {
      source: adSourceFilter || undefined,
      dateFrom: dateFrom ? dateFrom.substring(0, 10) : undefined,
      dateTo: dateTo ? dateTo.substring(0, 10) : undefined,
      productId: activeProductId ?? undefined,
      allUsers: true,
    });
    newAdSpendEntries.forEach((e: any) => {
      const amountCents = Number(e.amount ?? 0);
      adSpendTotal += amountCents;
      if (e.productId) productAdCostMap[e.productId] = (productAdCostMap[e.productId] || 0) + amountCents;
    });

    // Build per-platform ad spend breakdown
    const byPlatform: Record<string, { spend: number; delivered: number; revenue: number }> = {};

    adSpendEntries.forEach((e: any) => {
      if (activeProductId !== null && e.productId !== activeProductId) return;
      if (dateFrom && e.date < dateFrom) return;
      if (dateTo && e.date > dateTo) return;
      const src = e.source || 'Autre';
      if (!byPlatform[src]) byPlatform[src] = { spend: 0, delivered: 0, revenue: 0 };
      byPlatform[src].spend += Math.round(Number(e.amount ?? 0) * 100);
    });

    newAdSpendEntries.forEach((e: any) => {
      const src = e.source || 'Autre';
      if (!byPlatform[src]) byPlatform[src] = { spend: 0, delivered: 0, revenue: 0 };
      byPlatform[src].spend += Number(e.amount ?? 0);
    });

    allOrders.forEach((o: any) => {
      const src = o.utmSource || o.source || null;
      if (!src || o.status !== 'delivered') return;
      const platformKey = src.toLowerCase().includes('facebook') ? 'Facebook Ads'
        : src.toLowerCase().includes('tiktok') ? 'TikTok Ads'
        : src.toLowerCase().includes('google') ? 'Google Ads'
        : src.toLowerCase().includes('snapchat') ? 'Snapchat Ads'
        : src;
      if (byPlatform[platformKey]) {
        byPlatform[platformKey].delivered++;
        byPlatform[platformKey].revenue += (o.totalPrice ?? 0);
      }
    });

    // Build a name→productId map from store products
    const productNameToId = new Map(storeProducts.map((p: any) => [p.name.toLowerCase().trim(), p.id]));

    // Full net profit formula: Revenue(delivered) - ProductCost - Shipping - Packaging - AgentCommissions - AdSpend
    const netProfit = revenue - totalProductCost - totalShipping - totalPackaging - totalAgentCommissions - adSpendTotal;
    const roas = adSpendTotal > 0 ? revenue / adSpendTotal : 0;
    const roi = adSpendTotal > 0 ? (netProfit / adSpendTotal) * 100 : 0;

    const canRevenue = !isAgent || agentPermissions.show_revenue;
    const canProfit = !isAgent || agentPermissions.show_profit;
    const canCharts = !isAgent || agentPermissions.show_charts;
    const canProducts = !isAgent || agentPermissions.show_top_products;

    // Sidebar badge counts for "Confirmé Reporté" — see comment on /api/stats
    const reporteCounts = countConfirmeReporte(allOrders as any[], casablancaTomorrow());

    res.json({
      totalOrders, nouveau, rappel, confirme, inProgress, cancelled, delivered, refused,
      injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale,
      pasReponse,
      confirmeReporteDueSoon: reporteCounts.dueSoon,
      confirmeReporteTotal:   reporteCounts.total,
      confirmationRate, deliveryRate,
      totalShipped,
      deliveredShipped,
      refusedShipped,
      pendingShipped,
      deliveryShippingRate: totalShipped > 0 ? Math.round((deliveredShipped / totalShipped) * 100) : 0,
      returnShippingRate: totalShipped > 0 ? Math.round((refusedShipped / totalShipped) * 100) : 0,
      byCarrier,
      cityStats,
      byPlatform: canRevenue ? byPlatform : undefined,
      totalShippingCost: canRevenue ? totalShipping : undefined,
      revenue: canRevenue ? revenue : undefined,
      roas: canRevenue ? roas : undefined,
      roi: canRevenue ? roi : undefined,
      adSpendTotal: canRevenue ? adSpendTotal : undefined,
      profit: canProfit ? netProfit : undefined,
      totalProductCost: canProfit ? totalProductCost : undefined,
      totalShipping: canProfit ? totalShipping : undefined,
      totalPackaging: canProfit ? totalPackaging : undefined,
      totalAgentCommissions: canProfit ? totalAgentCommissions : undefined,
      daily: canCharts ? daily : [],
      topProducts: canProducts ? topProducts.map(p => ({ ...p, share: 100 })) : [],
      productPerformance: canProducts
        ? productPerformance.map(p => {
            const pid = productNameToId.get(p.name.toLowerCase().trim());
            const adCost = pid ? (productAdCostMap[pid] || 0) : 0;
            return {
              ...p,
              confirmationRate: p.total > 0 ? Math.round((p.confirme / p.total) * 100) : 0,
              deliveryRate: p.confirme > 0 ? Math.round((p.delivered / p.confirme) * 100) : 0,
              adCost,
            };
          })
        : [],
    });
  });

  app.get("/api/store", requireAuth, async (req, res) => {
    const store = await storage.getStore(req.user!.storeId!);
    if (!store) return res.status(404).json({ message: "Boutique introuvable" });
    res.json(store);
  });

  app.get("/api/store/webhook-key", requireAuth, async (req, res) => {
    try {
      const key = await storage.getOrGenerateWebhookKey(req.user!.storeId!);
      res.json({ webhookKey: key });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur" });
    }
  });

  // ─── Profile System Routes ─────────────────────────────────────────────────

  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(1),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const updated = await storage.updateUser(req.user!.id, {
        username: data.username,
        email: data.email ?? undefined,
        phone: data.phone ?? undefined,
      });
      if (!updated) return res.status(404).json({ message: "Utilisateur introuvable" });
      const { password: _, ...safe } = updated as any;
      res.json(safe);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.put("/api/user/password", requireAuth, async (req, res) => {
    try {
      // Apply the same password policy as signup — see passwordSchema in
      // shared/schema.ts (min 8, 1 uppercase, 1 digit). Keeps the rule
      // consistent across all password-setting flows.
      const schema = z.object({
        currentPassword: z.string().min(1, "Mot de passe actuel requis"),
        newPassword: passwordSchema,
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message || "Données invalides",
          errors: parsed.error.flatten(),
        });
      }
      const { currentPassword, newPassword } = parsed.data;
      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      const valid = await comparePasswords(currentPassword, user.password);
      if (!valid) return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(req.user!.id, { password: hashed });
      res.json({ message: "Mot de passe mis à jour" });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.put("/api/store/social", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        website: z.string().nullable().optional(),
        facebook: z.string().nullable().optional(),
        instagram: z.string().nullable().optional(),
        otherSocial: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const updated = await storage.updateStore(req.user!.storeId!, data);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.put("/api/store/whatsapp-templates", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        whatsappTemplate: z.string().nullable().optional(),
        whatsappTemplateCustom: z.string().nullable().optional(),
        whatsappTemplateShipping: z.string().nullable().optional(),
        whatsappDefaultEnabled: z.number().optional(),
        whatsappCustomEnabled: z.number().optional(),
        whatsappShippingEnabled: z.number().optional(),
      });
      const data = schema.parse(req.body);
      const updated = await storage.updateStore(req.user!.storeId!, data);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.post("/api/store/logo", requireAuth, async (req, res) => {
    try {
      const schema = z.object({ logoUrl: z.string() });
      const { logoUrl } = schema.parse(req.body);
      const updated = await storage.updateStore(req.user!.storeId!, { logoUrl });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.get("/api/user/subscription-detail", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const sub = await storage.getSubscription(storeId);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [monthlyCount] = await db.select({ count: count() }).from(orders)
        .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, monthStart), lt(orders.createdAt, monthEnd)));
      const teamMembers = await db.select().from(users).where(eq(users.storeId, storeId));
      res.json({
        plan: sub?.plan ?? 'starter',
        monthlyLimit: sub?.monthlyLimit ?? 1500,
        billingCycleStart: sub?.billingCycleStart,
        isActive: sub?.isActive ?? 1,
        currentMonthOrders: Number(monthlyCount?.count ?? 0),
        teamCount: teamMembers.length,
        storeCount: 1,
        month: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur" });
    }
  });

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    const user = req.user!;
    const status = req.query.status as string | undefined;
    const includeShippingCost = (ordersList: any[]) =>
      ordersList.map((order) => ({
        ...order,
        shippingCost: order.shippingCost ?? 0,
      }));

    // Status group constants (mirrors status-badge.tsx)
    const SUIVI_GROUP = [
      'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
      'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
      'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
      // Digylog exact statuses
      'En cours de réception au network',
      'Arrivé au hub',
      'En cours de livraison',
      'Sorti pour livraison',
      'Pris en charge',
      'Collecté',
      'Chargé',
      'En attente de ramassage',
      'Non Reçu',
      'Retour en cours',
      "Retourné à l'expéditeur",
      'Tentative échouée',
    ];
    const REFUSED_GROUP = [
      'refused',
      'Client intéressé', 'Remboursé', 'Adresse inconnue', 'Retour en route',
      'Incompatibilité avec les attentes', 'Article retourné', "Erreur d'expédition",
      'Pas de réponse + SMS', 'Boîte vocale', 'Pas réponse 1 (Suivi)',
      'Pas réponse 2 (Suivi)', 'Pas réponse 3 (Suivi)', 'Demande retour',
      // New cancellation statuses for agent confirmation
      'Pas de réponse 1',
      'Pas de réponse 2',
      'Pas de réponse 3',
      'Pas de réponse 4',
      "Client n'a pas commandé",
      'Produit non disponible',
    ];
    // Statuses that legitimately belong to the Nouveaux / Confirmation tab
    const CONFIRMATION_STATUSES = [
      'nouveau', 'confirme', 'Injoignable', 'Annulé',
      'Annulé Faux Numéro', 'Annulé Double', 'Annulé Fake',
      'Boite vocale', 'Rappel', 'En cours'
    ];

    if (user.role === 'agent') {
      const ordersList = await storage.getOrdersByAgent(user.id);
      if (status === 'annule_group') {
        res.json(includeShippingCost(ordersList.filter(o => o.status?.startsWith('Annulé'))));
      } else if (status === 'pas_reponse_group') {
        res.json(includeShippingCost(ordersList.filter(o => (o.status || '').startsWith('Pas de réponse'))));
      } else if (status === 'suivi_group') {
        res.json(includeShippingCost(ordersList.filter(o =>
          SUIVI_GROUP.includes(o.status) ||
          SUIVI_GROUP.includes((o as any).commentStatus || '') ||
          (!!(o as any).trackNumber && !['nouveau','confirme','confirme_reporte','delivered','refused'].includes(o.status) && !o.status?.startsWith('Annulé'))
        )));
      } else if (status === 'refused') {
        res.json(includeShippingCost(ordersList.filter(o => REFUSED_GROUP.includes(o.status))));
      } else if (status === 'nouveau') {
        // Nouveaux = only real new orders (no carrier statuses)
        res.json(includeShippingCost(ordersList.filter(o =>
          o.status === 'nouveau' &&
          !SUIVI_GROUP.includes((o as any).commentStatus || '') &&
          !(o as any).trackNumber
        )));
      } else {
        res.json(includeShippingCost(status ? ordersList.filter(o => o.status === status) : ordersList));
      }
    } else {
      if (status === 'annule_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(includeShippingCost(ordersList.filter(o => o.status?.startsWith('Annulé'))));
      } else if (status === 'pas_reponse_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(includeShippingCost(ordersList.filter(o => (o.status || '').startsWith('Pas de réponse'))));
      } else if (status === 'suivi_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(includeShippingCost(ordersList.filter(o =>
          SUIVI_GROUP.includes(o.status) ||
          SUIVI_GROUP.includes((o as any).commentStatus || '') ||
          (!!(o as any).trackNumber && !['nouveau','confirme','confirme_reporte','delivered','refused'].includes(o.status) && !o.status?.startsWith('Annulé'))
        )));
      } else if (status === 'refused') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(includeShippingCost(ordersList.filter(o => REFUSED_GROUP.includes(o.status))));
      } else if (status === 'nouveau') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(includeShippingCost(ordersList.filter(o =>
          o.status === 'nouveau' &&
          !SUIVI_GROUP.includes((o as any).commentStatus || '') &&
          !(o as any).trackNumber
        )));
      } else {
        const ordersList = await storage.getOrdersByStore(user.storeId!, status || undefined);
        res.json(includeShippingCost(ordersList));
      }
    }
  });

  app.get("/api/orders/filtered", requireAuth, async (req, res) => {
    const user = req.user!;
    const magasinIdRaw = req.query.magasinId as string | undefined;
    const productIdRaw = req.query.productId as string | undefined;
    const filters = {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      city: req.query.city as string | undefined,
      source: req.query.source as string | undefined,
      utmSource: req.query.utmSource as string | undefined,
      utmCampaign: req.query.utmCampaign as string | undefined,
      magasinId: magasinIdRaw && magasinIdRaw !== 'all' ? Number(magasinIdRaw) : undefined,
      productId: productIdRaw && productIdRaw !== 'all' ? Number(productIdRaw) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      dateType: req.query.dateType as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    };
    const agentOnly = user.role === 'agent' ? user.id : undefined;
    // Media buyers only see their own attributed orders (by ID or UTM pattern CODE*%)
    const mediaBuyerOnly = user.role === 'media_buyer' ? user.id : undefined;
    const result = await storage.getFilteredOrders(user.storeId!, filters, agentOnly, mediaBuyerOnly);
    res.json(result);
  });

  app.get("/api/orders/all", requireAuth, async (req, res) => {
    const user = req.user!;
    const magasinIdRaw = req.query.magasinId as string | undefined;
    const productIdRaw = req.query.productId as string | undefined;
    const filters = {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      city: req.query.city as string | undefined,
      source: req.query.source as string | undefined,
      utmSource: req.query.utmSource as string | undefined,
      utmCampaign: req.query.utmCampaign as string | undefined,
      magasinId: magasinIdRaw && magasinIdRaw !== 'all' ? Number(magasinIdRaw) : undefined,
      productId: productIdRaw && productIdRaw !== 'all' ? Number(productIdRaw) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    };
    const agentOnly = user.role === 'agent' ? user.id : undefined;
    const mediaBuyerOnly = user.role === 'media_buyer' ? user.id : undefined;
    const result = await storage.getFilteredOrders(user.storeId!, filters, agentOnly, mediaBuyerOnly);
    res.json(result);
  });

  app.post("/api/orders/bulk-assign", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === 'agent') {
        return res.status(403).json({ message: "Agents cannot bulk assign orders" });
      }
      const { orderIds, agentId } = req.body;
      if (!Array.isArray(orderIds) || !agentId) {
        return res.status(400).json({ message: "orderIds (array) and agentId required" });
      }
      const targetAgent = await storage.getUserById(Number(agentId));
      if (!targetAgent || targetAgent.storeId !== user.storeId) {
        return res.status(400).json({ message: "Agent not found in your store" });
      }
      const updated = await storage.bulkAssignOrders(orderIds, Number(agentId), user.storeId!);
      res.json({ updated });
    } catch (err) {
      res.status(500).json({ message: "Bulk assign failed" });
    }
  });

  app.post("/api/orders/bulk-ship", requireAuth, requireActiveSubscription, async (req, res) => {
    req.setTimeout(60000); // 60s for carrier API calls
    res.setTimeout(60000);
    try {
      const user = req.user!;
      if (user.role === 'agent') {
        return res.status(403).json({ message: "Les agents ne peuvent pas expédier en masse" });
      }

      const { orderIds, provider, accountId } = req.body;
      if (!Array.isArray(orderIds) || orderIds.length === 0 || !provider) {
        return res.status(400).json({ message: "orderIds (tableau) et provider sont obligatoires" });
      }

      const storeId = user.storeId!;

      // ── If user explicitly selected an account, pin all orders to it ──────
      let pinnedCreds: Record<string, any> | null = null;
      if (accountId) {
        const pinned = await storage.getCarrierAccount(Number(accountId));
        if (pinned && pinned.storeId === storeId && pinned.isActive === 1) {
          const ps = (pinned.settings as any) || {};
          pinnedCreds = {
            apiKey:           pinned.apiKey,
            apiSecret:        pinned.apiSecret        ?? undefined,
            apiUrl:           pinned.apiUrl           ?? undefined,
            carrierStoreName: pinned.carrierStoreName  ?? ps.digylogStoreName ?? undefined,
            digylogStoreName: ps.digylogStoreName      ?? pinned.carrierStoreName ?? undefined,
            digylogNetworkId: ps.digylogNetworkId
              ? Number(ps.digylogNetworkId)
              : ps.networkId ? Number(ps.networkId) : 1,
            deliveryFee:      (pinned as any).deliveryFee || 0,
          };
          console.log(`[BulkShip] Using pinned account id=${accountId} (${pinned.connectionName}) digylogStore="${pinnedCreds.digylogStoreName}" network=${pinnedCreds.digylogNetworkId}`);
        }
      }

      // Smart dispatch: try carrier accounts first, fall back to legacy storeIntegrations
      const defaultCreds = pinnedCreds ?? await storage.getAccountForShipping(storeId, provider);
      if (!defaultCreds) {
        return res.status(400).json({ message: `Transporteur ${provider} non connecté. Ajoutez un compte dans Intégrations → Sociétés de Livraison.` });
      }

      const eligible = await storage.bulkShipOrders(orderIds, storeId);

      // All statuses that allow shipping (mirrors storage.bulkShipOrders eligibility)
      const SHIPPABLE_STATUSES = [
        'confirme', 'expédié', 'Attente De Ramassage',
        'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
        'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
        'En cours de réception au network', 'Arrivé au hub', 'En cours de livraison',
        'Sorti pour livraison', 'Pris en charge', 'Collecté', 'Chargé',
        'Confirmé par livreur', 'Confirmé par livreur *',
      ];

      // Identify blocked orders (requested but not eligible — wrong status
      // OR already has a tracking number, which means it was already shipped).
      const allRequested = await storage.getOrdersByIds(orderIds, storeId);
      const eligibleIds = new Set(eligible.map((o: any) => o.id));
      const blockedOrders = allRequested.filter((o: any) => !eligibleIds.has(o.id));

      if (eligible.length === 0 && blockedOrders.length === 0) {
        return res.status(400).json({ message: "Aucune commande éligible (statut shippable requis, sans numéro de suivi)" });
      }
      if (eligible.length === 0) {
        // Distinguish "already has tracking" from "wrong status" so the user
        // gets an actionable message instead of a generic one.
        const alreadyShipped = blockedOrders.filter((o: any) =>
          !!o.trackNumber || SHIPPABLE_STATUSES.includes(o.status)
        ).length;
        return res.status(400).json({
          message: alreadyShipped > 0
            ? `${alreadyShipped} commande(s) déjà expédiée(s). Réinitialisez l'expédition avant de renvoyer.`
            : `Aucune commande éligible — ${blockedOrders.length} commande(s) bloquée(s) (statut requis: shippable, sans numéro de suivi).`,
        });
      }

      // ── Pre-load everything needed for the background job ────────
      type ShipResult = { orderId: number; orderNumber?: string; trackingNumber?: string; labelLink?: string; status: 'shipped' | 'failed'; error?: string };
      const total = eligible.length + blockedOrders.length;

      // Pre-load all active carrier accounts for smart city-based dispatch
      const allCarrierAccounts = await storage.getCarrierAccounts(storeId, provider);
      const activeAccounts = allCarrierAccounts.filter((a: any) => a.isActive === 1);

      // ── Reply IMMEDIATELY — processing continues in background ───
      res.status(202).json({ queued: true, total });

      // ── Background processing ─────────────────────────────────────
      setImmediate(async () => {
        const results: ShipResult[] = [];
        let done = 0;
        let shippedCount = 0;
        let failedCount  = 0;
        let retryCount   = 0;

        // ── Pre-fill blocked (non-shippable status) orders ───────────
        blockedOrders.forEach((order: any) => {
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'failed',
            error: `❌ Commande #${order.orderNumber} non envoyée — statut "${order.status}" doit être "Confirmé" avant expédition.`,
          });
          failedCount++;
          done++;
        });
        if (blockedOrders.length > 0) broadcastProgress();

        // ── Helpers ─────────────────────────────────────────────────
        const getProductName = (order: any) =>
          order.rawProductName ||
          (order.items?.length > 0
            ? (order.items[0].rawProductName || order.items[0].product?.name || 'Produit')
            : 'Produit');

        // Resolve credentials per-order:
        // if user pinned an account → always use it; otherwise use city routing
        const extractAcctCreds = (a: any): Record<string, any> => {
          const s = (a.settings as any) || {};
          return {
            apiKey:           a.apiKey,
            apiSecret:        a.apiSecret || (a.settings as any)?.apiId || '',
            apiUrl:           a.apiUrl           || '',
            carrierStoreName: a.carrierStoreName  ?? s.digylogStoreName ?? '',
            digylogStoreName: s.digylogStoreName  ?? a.carrierStoreName ?? '',
            digylogNetworkId: s.digylogNetworkId
              ? Number(s.digylogNetworkId)
              : s.networkId ? Number(s.networkId) : 1,
            deliveryFee:      a.deliveryFee || 0,
          };
        };

        const getCredsForOrder = (city: string): Record<string, any> => {
          if (pinnedCreds) return pinnedCreds;
          const cityAcct = activeAccounts.find((a: any) => {
            if (a.assignmentRule !== 'city') return false;
            try {
              const cities: string[] = JSON.parse(a.assignmentData || '[]');
              return cities.some((c: string) => c.toLowerCase() === city.toLowerCase());
            } catch { return false; }
          });
          if (cityAcct) return extractAcctCreds(cityAcct);
          const def = activeAccounts.find((a: any) => a.isDefault === 1) || activeAccounts[0];
          if (def) return extractAcctCreds(def);
          return defaultCreds as Record<string, any>;
        };

        // Pre-load carrier city list for auto-matching
        const bulkCityList: string[] = getDefaultCitiesForProvider(provider);

        const getResolvedCity = (order: any): string => {
          const raw = ((order as any).customerCity || '').trim();
          const matched = autoMatchCity(raw, bulkCityList);
          if (matched && matched !== raw) {
            console.log(`[BulkShip] City auto-corrected: "${raw}" → "${matched}" (#${(order as any).orderNumber})`);
          }
          return matched || raw;
        };

        const broadcastProgress = () => broadcastToStore(storeId, 'shipping_progress', {
          done, total, shipped: shippedCount, failed: failedCount,
        });

        try {
          // ── Batch processing (10 simultaneous, DB writes collected end-of-run) ─
          const BATCH_SIZE = 10;
          const allDbUpdates: Promise<unknown>[] = [];
          const allLogUpdates: Promise<unknown>[] = [];
          for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            const batch = eligible.slice(i, i + BATCH_SIZE);

            // ── Precompute per-order context BEFORE Promise.allSettled ──
            // Previously `resolvedCity` and `orderCreds` were only declared
            // inside the inner `batch.map(order => {...})` arrow; the later
            // `settled.forEach` referenced them out of scope, throwing
            // "Cannot read properties of undefined" on every successful
            // shipment. The throw broke the forEach mid-iteration and the
            // subsequent `Promise.all([...dbUpdates, ...logUpdates])` was
            // never reached → orders kept their tracking number AT THE
            // CARRIER but stayed in 'confirme' on our side. This was the
            // real reason "only 1-2 orders moved status".
            const perOrderCtx = batch.map(order => {
              const resolvedCity = getResolvedCity(order);
              const orderCreds = getCredsForOrder(resolvedCity);
              // Sum items[].quantity FIRST (most accurate), fall back to
              // rawQuantity only when items are missing (legacy orders).
              const bulkQty: number = (() => {
                const items = (order as any).items;
                if (Array.isArray(items) && items.length > 0) {
                  const sum = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);
                  if (sum > 0) return sum;
                }
                const raw = Number((order as any).rawQuantity);
                return raw > 0 ? raw : 1;
              })();
              console.log(`[SHIPPING-QTY] order=${order.id} items=${JSON.stringify((order as any).items?.map((i: any) => ({ p: i.rawProductName, q: i.quantity })))} → bulkQty=${bulkQty}`);
              return { order, resolvedCity, orderCreds, bulkQty };
            });

            const settled = await Promise.allSettled(
              perOrderCtx.map(async ({ order, resolvedCity, orderCreds, bulkQty }) => {
                console.log(`[CREDS-DEBUG-BULK] carrierStoreName="${(orderCreds as any)?.carrierStoreName}"`);
                console.log(`[DIGYLOG-STORE-DEBUG]: carrierStoreName from creds = "${(orderCreds as any).carrierStoreName}"`);
                console.log(`[DIGYLOG-FINAL] order=${order.id} store="${(orderCreds as any).digylogStoreName || (orderCreds as any).carrierStoreName}" network=${(orderCreds as any).digylogNetworkId} qty=${bulkQty}`);
                console.log(`[AMEEX-PRE-SHIP] order=${order.id} customerName="${order.customerName}" apiSecret="${(orderCreds as any).apiSecret}" settings=${JSON.stringify((orderCreds as any).settings || {})}`);
                // Detect Ameex retry: order already has a PENDING placeholder from
                // a previous attempt — warn the carrier service so it can log
                // appropriately and avoid silent duplicates.
                const isAmeexRetry =
                  provider.toLowerCase() === 'ameex' &&
                  !!(order as any).trackNumber &&
                  String((order as any).trackNumber).startsWith('AMEEX-PENDING-');

                // For Ameex: resolve city name → numeric city ID (required by Ameex API)
                let ameexCityId: string | undefined;
                if (provider.toLowerCase() === 'ameex') {
                  const resolved = await storage.getAmeexCityId(storeId, resolvedCity);
                  if (!resolved) {
                    return {
                      success:        false,
                      error:          `Ameex: Ville "${resolvedCity}" non reconnue. Synchronisez les villes dans Paramètres → Transporteurs, puis réessayez.`,
                      carrierMessage: 'City not found in ameex_cities',
                      httpStatus:     0,
                      rawResponse:    null,
                      permanent:      true,
                    };
                  }
                  ameexCityId = resolved;
                }

                return shipOrderToCarrier(provider, orderCreds, {
                  customerName:     order.customerName,
                  phone:            order.customerPhone,
                  city:             resolvedCity,
                  address:          (order as any).customerAddress || (order as any).customerCity || '',
                  totalPrice:       order.totalPrice,
                  productName:      getProductName(order),
                  quantity:         bulkQty,
                  canOpen:          (order as any).canOpen === 1,
                  orderNumber:      (order as any).orderNumber || String(order.id),
                  orderId:          order.id,
                  storeId,
                  note:             (order as any).comment || "",
                  carrierStoreName: (orderCreds as any).carrierStoreName || "",
                  digylogStoreName: (orderCreds as any).digylogStoreName || (orderCreds as any).carrierStoreName || "",
                  digylogNetworkId: (orderCreds as any).digylogNetworkId || 1,
                  apiId:            (orderCreds as any).apiSecret || (orderCreds as any).settings?.apiId || '',
                  apiSecret:        (orderCreds as any).apiSecret || '',
                  previousAttemptHadPlaceholder: isAmeexRetry,
                  cityId:           ameexCityId,
                });
              })
            );

            settled.forEach((outcome, idx) => {
              const { order, resolvedCity, orderCreds } = perOrderCtx[idx];
              const ref   = (order as any).orderNumber || order.id;

              if (outcome.status === 'fulfilled' && outcome.value.success) {
                const { trackingNumber, labelUrl } = outcome.value;

                // Hard guard: never save undefined as the tracking number
                if (!trackingNumber) {
                  console.error(`[SHIPPING-LOG]: ❌ Order #${ref} — carrier returned success but no tracking number. Skipping DB save.`);
                  allLogUpdates.push(storage.createIntegrationLog({
                    storeId, integrationId: null, provider,
                    action: 'shipping_sent', status: 'fail',
                    message: `❌ Commande #${ref}: ${provider} a confirmé mais sans numéro de suivi. Commande reste Confirmée.`,
                  }));
                  results.push({ orderId: order.id, orderNumber: (order as any).orderNumber, status: 'failed', error: 'Pas de numéro de suivi retourné' });
                  failedCount++;
                } else {
                console.log(`[SHIPPING-LOG]: ✅ Order #${ref} dispatched — tracking: ${trackingNumber} (saved to track_number column)`);
                // Track retries (attempts > 1 means at least one retry was needed)
                if ((outcome.value as any).attempts && (outcome.value as any).attempts > 1) retryCount++;
                // ── Atomic post-ship update ─────────────────────────────────────
                // Previously this was 2 calls (updateOrderShipping +
                // updateOrderStatus) pushed into dbUpdates and run via
                // Promise.all. They raced: sometimes status was clobbered back
                // to 'confirme', so only some orders moved to "Attente De
                // Ramassage". One updateOrder call sets all fields together.
                allDbUpdates.push(
                  storage.updateOrder(order.id, {
                    trackNumber:      trackingNumber,
                    labelLink:        labelUrl ?? null,
                    shippingProvider: provider,
                    carrierName:      provider,
                    status:           'Attente De Ramassage',
                  } as any)
                );
                const fee = (orderCreds as any).deliveryFee || 0;
                if (fee > 0) {
                  allDbUpdates.push(storage.updateOrder(order.id, { shippingCost: fee }));
                }
                // Try to get real per-city delivery cost from Digylog
                if (provider === 'digylog') {
                  const networkId = (orderCreds as any).digylogNetworkId || 1;
                  allDbUpdates.push(
                    getDigylogDeliveryCost(trackingNumber, (orderCreds as any).apiKey, networkId, (orderCreds as any).apiUrl)
                      .then(cost => {
                        if (cost && cost > 0) {
                          console.log(`[DIGYLOG-COST] Order #${ref} → shippingCost=${cost} centimes for city "${resolvedCity}"`);
                          return storage.updateOrder(order.id, { shippingCost: cost });
                        }
                      })
                      .catch(costErr => console.error('[DIGYLOG-COST] Failed to fetch cost:', costErr))
                  );
                }
                allLogUpdates.push(storage.createIntegrationLog({
                  storeId, integrationId: null, provider,
                  action: 'shipping_sent', status: 'success',
                  message: `✅ Commande #${ref} envoyée. Tracking: ${trackingNumber}`,
                }));
                results.push({ orderId: order.id, orderNumber: (order as any).orderNumber, trackingNumber, labelLink: labelUrl, status: 'shipped' });
                shippedCount++;
                }
              } else {
                const errMsg =
                  outcome.status === 'rejected'
                    ? String(outcome.reason?.message || outcome.reason || 'Erreur inconnue')
                    : (outcome.value?.error || 'Erreur inconnue');
                const httpCode = outcome.status === 'fulfilled' ? (outcome.value?.httpStatus ?? '?') : '?';
                console.error(`[SHIPPING-LOG]: ❌ Order #${ref} failed — HTTP ${httpCode}: ${errMsg}`);
                allLogUpdates.push(storage.createIntegrationLog({
                  storeId, integrationId: null, provider,
                  action: 'shipping_sent', status: 'fail',
                  message: `❌ Commande #${ref} refusée (HTTP ${httpCode}): ${errMsg}`,
                }));
                results.push({ orderId: order.id, orderNumber: (order as any).orderNumber, status: 'failed', error: errMsg });
                failedCount++;
              }
            });

            // Don't await DB writes here — collect across all batches, flush at end
            done += batch.length;
            broadcastProgress();
          }
          // Flush all DB + log writes after all batches complete
          await Promise.allSettled([...allDbUpdates, ...allLogUpdates]);
        } catch (bgErr) {
          console.error("[BULK-SHIP:BG] Unexpected error in background job:", bgErr);
        } finally {
          // Final broadcast — always sent, even on partial failure
          broadcastToStore(storeId, 'shipping_progress', {
            done: total, total, shipped: shippedCount, failed: failedCount,
            complete: true, results, retries: retryCount,
          });
          console.log(`[BULK-SHIP:BG] Done — ${shippedCount} shipped, ${failedCount} failed out of ${total}`);
        }
      });
    } catch (err) {
      console.error("[BULK-SHIP] Unexpected error:", err);
      res.status(500).json({ message: "Erreur inattendue lors de l'expédition en masse" });
    }
  });

  // ── Single order delete ──────────────────────────────────────────────────────
  app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === 'agent' || user.role === 'media_buyer') {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const orderId = Number(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ message: "ID invalide" });
      await storage.deleteOrder(orderId, user.storeId!);
      res.json({ ok: true, deleted: orderId });
    } catch (err: any) {
      res.status(err.message?.includes('not found') ? 404 : 500).json({ message: err.message || "Suppression échouée" });
    }
  });

  // ── Bulk order delete ────────────────────────────────────────────────────────
  app.post("/api/orders/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === 'agent' || user.role === 'media_buyer') {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const { orderIds } = req.body;
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ message: "orderIds (array) requis" });
      }
      const deleted = await storage.bulkDeleteOrders(orderIds.map(Number), user.storeId!);
      res.json({ ok: true, deleted });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Suppression en masse échouée" });
    }
  });

  // Customer order history — MUST be before /api/orders/:id to avoid route conflict
  app.get("/api/orders/customer/:phone", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const phone = decodeURIComponent(req.params.phone).trim();
      if (!phone) return res.status(400).json({ message: "Numéro de téléphone requis" });
      const customerOrders = await storage.getOrdersByPhone(storeId, phone);
      // Attach store name for display
      const store = await storage.getStore(storeId);
      const enriched = customerOrders.map(o => ({ ...o, storeName: store?.name ?? "" }));
      res.json(enriched);
    } catch (err: any) {
      console.error("[DB-ERROR] GET /api/orders/customer/:phone:", err?.message);
      res.status(500).json({ message: err?.message || "Erreur serveur" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    // Super admins may access any store; all other users are strictly scoped to their store
    if (order.storeId !== req.user!.storeId && !req.user!.isSuperAdmin) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    if (req.user!.role === 'agent' && order.assignedToId !== req.user!.id) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    console.log(`[GET /api/orders/${orderId}] totalPrice=${order.totalPrice} (${((order.totalPrice ?? 0) / 100).toFixed(2)} DH) items=${(order as any).items?.length ?? 0}`);
    res.json(order);
  });

  app.get("/api/orders/:id/whatsapp-link", requireAuth, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.storeId !== req.user!.storeId) return res.status(403).json({ message: "Access denied" });
    const store = await storage.getStore(order.storeId);
    const template = store?.whatsappTemplate || "Bonjour *{Nom_Client}* 👋\nVotre commande est en cours de traitement.\nVille: *{Ville_Client}*\nAdresse: *{Address_Client}*";
    const result = formatWhatsAppMessage(order, template);
    res.json(result);
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.storeId !== req.user!.storeId) return res.status(403).json({ message: "Access denied" });
      const { status } = api.orders.updateStatus.input.parse(req.body);
      // ── Block bypass route for confirme_reporte ──
      // This endpoint takes only `status` and cannot accept a `scheduledFor`,
      // so allowing the transition here would leave `scheduled_for=NULL` and
      // the cron would never promote the order. Force callers through
      // PATCH /api/orders/:id which validates the date.
      if (status === 'confirme_reporte') {
        return res.status(400).json({
          message: "Le statut Confirmé Reporté nécessite une date programmée. Utilisez la fenêtre détaillée de la commande.",
        });
      }
      const previousStatus = order.status;
      const updated = await storage.updateOrderStatus(orderId, status, req.user!.id);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      if (status === 'delivered' && previousStatus !== 'delivered') {
        await storage.syncCustomerOnDelivery(order.storeId, {
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress,
          customerCity: order.customerCity,
          totalPrice: order.totalPrice ?? 0,
        });
      }
      // Real-time: notify all connected clients of this store
      const cs = updated?.commentStatus ?? undefined;
      emitOrderUpdated(order.storeId, orderId, status, cs);
      broadcastToStore(order.storeId, "order_updated", { orderId, status, commentStatus: cs });
      pushOrderToSheet(order.storeId, {
        action: "order.updated",
        orderNumber: (updated as any)?.orderNumber || String(orderId),
        customerName: order.customerName || "",
        customerPhone: order.customerPhone || "",
        customerAddress: order.customerAddress || "",
        customerCity: order.customerCity || "",
        productName: "",
        totalPrice: 0,
        quantity: 1,
        note: null,
        status,
        utmSource: null,
        utmCampaign: null,
        productId: null,
        magasin: null,
        createdAt: "",
      }).catch(() => {});
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/orders/:id/assign", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.storeId !== req.user!.storeId && !req.user!.isSuperAdmin) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const { agentId } = api.orders.assign.input.parse(req.body);
      const updated = await storage.assignOrder(orderId, agentId);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      // Stamp the action: a manual reassignment by an admin counts as a
      // human action on this order (different from system auto-assign at
      // order-creation time, which goes through getNextAgent and is silent).
      await storage.updateOrder(orderId, {}, req.user!.id);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    res.json(await storage.getProductsByStore(storeId));
  });

  app.get(api.agents.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const agentsList = await storage.getUsersByStore(storeId);
    res.json(agentsList.map(({ password, ...rest }) => rest));
  });

  app.post(api.agents.create.path, requireAdmin, async (req, res) => {
    try {
      const data = api.agents.create.input.parse(req.body);
      const storeId = req.user!.storeId!;
      const emailVal = data.email && data.email.trim() !== '' ? data.email.trim() : null;
      if (emailVal) {
        const existingUser = await storage.getUserByEmail(emailVal);
        if (existingUser) return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }
      const userRole = data.role || "agent";
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        username: data.username, email: emailVal, phone: data.phone || null,
        password: hashedPassword, role: userRole, storeId,
        paymentType: data.paymentType || "commission",
        paymentAmount: data.paymentAmount || 0,
        distributionMethod: data.distributionMethod || "auto",
        isActive: data.isActive ?? 1,
        buyerCode: (userRole === 'media_buyer' && data.buyerCode) ? data.buyerCode.trim().toUpperCase() : null,
      } as any);

      // Save store-specific agent settings (role, distribution rules) — agents only.
      // Persist ALL rule values unconditionally — distribution method now lives
      // on the magasin (stores.distributionMethod), not on the agent. Whichever
      // method a magasin picks, the corresponding rule will already be set.
      if (userRole === 'agent') {
        const settingsPayload: any = {
          roleInStore: (req.body.roleInStore as string) || "confirmation",
        };
        if (typeof req.body.leadPercentage === 'number' || typeof req.body.leadPercentage === 'string') {
          const lp = parseInt(String(req.body.leadPercentage));
          if (!isNaN(lp)) settingsPayload.leadPercentage = lp;
        }
        if (Array.isArray(req.body.allowedProductIds)) {
          settingsPayload.allowedProductIds = JSON.stringify(req.body.allowedProductIds);
        }
        if (Array.isArray(req.body.allowedRegions)) {
          settingsPayload.allowedRegions = JSON.stringify(req.body.allowedRegions);
        }
        if (typeof req.body.commissionRate === 'number') {
          settingsPayload.commissionRate = req.body.commissionRate;
        }
        await storage.upsertStoreAgentSetting(user.id, storeId, null, settingsPayload);
      }

      // Adding an agent changes the eligible pool for legacy "all-agents" magasins
      // (and any magasin that later links them); bump their windows now.
      if (userRole === 'agent') {
        const n = await bumpAgentRelatedEpochs(req.user!.id, user.id);
        console.log(`[DIST-EPOCH] agent ${user.id} created → bumped ${n} magasin(s)`);
      }

      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get(api.adSpend.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const date = req.query.date as string | undefined;
    res.json(await storage.getAdSpend(storeId, date));
  });

  app.post(api.adSpend.upsert.path, requireAuth, async (req, res) => {
    try {
      const data = api.adSpend.upsert.input.parse(req.body);
      const storeId = req.user!.storeId!;
      const entry = await storage.upsertAdSpend({ storeId, productId: data.productId || null, date: data.date, amount: data.amount });
      res.json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // MARKETING SPEND (Media Buyer per-buyer ad spend)
  // ============================================================
  app.get("/api/marketing-spend", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const mediaBuyerId = user.role === 'media_buyer' ? user.id : (req.query.buyerId ? Number(req.query.buyerId) : user.id);
    res.json(await storage.getMediaBuyerAdSpend(storeId, mediaBuyerId, dateFrom, dateTo));
  });

  app.post("/api/marketing-spend", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const storeId = user.storeId!;
      const { date, amount, productId, source, notes } = req.body;
      if (!date || !amount) return res.status(400).json({ message: "Date et montant requis" });
      if (!source) return res.status(400).json({ message: "Source publicitaire requise" });
      const amountCents = Math.round(parseFloat(amount) * 100);
      if (isNaN(amountCents) || amountCents <= 0) return res.status(400).json({ message: "Montant invalide" });
      const VALID_SOURCES = ['Facebook Ads', 'TikTok Ads', 'Google Ads', 'Snapchat Ads'];
      if (!VALID_SOURCES.includes(source)) return res.status(400).json({ message: "Source invalide" });
      const entry = await storage.upsertMediaBuyerAdSpend({
        storeId, mediaBuyerId: user.id, date,
        productId: productId ? Number(productId) : null,
        amount: amountCents, source, notes: notes || null,
      });
      res.json(entry);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  app.delete("/api/marketing-spend/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    await storage.deleteAdSpendEntry(Number(req.params.id), user.storeId!);
    res.json({ ok: true });
  });

  app.get("/api/marketing-spend/admin", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const entries = await storage.getAdminAdSpendList(storeId, dateFrom, dateTo);
    const byProduct: Record<string, { productName: string; total: number; entries: number }> = {};
    for (const e of entries) {
      const key = e.productId ? `product_${e.productId}` : 'all';
      if (!byProduct[key]) byProduct[key] = { productName: e.productName || 'Tous les produits', total: 0, entries: 0 };
      byProduct[key].total += e.amount;
      byProduct[key].entries++;
    }
    res.json({ entries, byProduct: Object.values(byProduct) });
  });

  // ============================================================
  // AD SPEND — Publicités module (all authenticated users)
  // ============================================================
  app.get("/api/publicites", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const isAdmin = user.role === 'owner' || user.role === 'admin';
    const { productId, source, dateFrom, dateTo, tab, userId, magasinId } = req.query as Record<string, string>;
    const opts: any = { source, dateFrom, dateTo };
    if (tab === 'source') opts.productId = null;
    else if (productId && productId !== 'all') opts.productId = Number(productId);
    // Per-magasin scope: 'all' (or absent) = no filter; numeric = restrict to that magasin
    if (magasinId && magasinId !== 'all') opts.magasinId = Number(magasinId);
    if (isAdmin) {
      // Admin can filter by a specific user or see all
      if (userId && userId !== 'all') opts.userId = Number(userId);
      else opts.allUsers = true;
    } else {
      // Non-admin (media buyer etc.) sees only their own entries
      opts.userId = user.id;
    }
    const entries = await storage.getAdSpendEntries(storeId, opts);
    res.json(entries);
  });

  app.post("/api/publicites", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const { source, date, amount, productId, productSellingPrice, magasinId } = req.body;
    if (!source || !date || amount === undefined) return res.status(400).json({ message: "Champs requis manquants" });

    // magasinId is required so each ad spend row attributes to one magasin →
    // honest per-magasin ROI. Validate the magasin belongs to this account
    // (owner_id matches the requester's account-level user) so a malicious
    // user can't write spend rows against another tenant's magasin id.
    if (!magasinId) {
      return res.status(400).json({ message: "Magasin requis" });
    }
    const owned = await storage.getStoresByOwner(user.id);
    if (!owned.some((m: any) => m.id === Number(magasinId))) {
      return res.status(403).json({ message: "Magasin non autorisé" });
    }

    const amountCents = Math.round(Number(amount) * 100);
    const pspCents = productSellingPrice ? Math.round(Number(productSellingPrice) * 100) : null;
    const entry = await storage.createAdSpendEntry({
      storeId,
      magasinId: Number(magasinId),
      userId: user.id,
      source,
      date,
      amount: amountCents,
      productId: productId ? Number(productId) : null,
      productSellingPrice: pspCents,
    });
    res.json(entry);
  });

  app.delete("/api/publicites/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const isAdmin = user.role === 'owner' || user.role === 'admin';
    // Admin can delete any; others can only delete their own
    const userIdForDelete = isAdmin ? undefined : user.id;
    await storage.deleteAdSpendNew(Number(req.params.id), storeId, userIdForDelete);
    res.json({ ok: true });
  });

  // ============================================================
  // NET PROFIT ENGINE
  // ============================================================
  app.get("/api/profit/admin-summary", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const productId = req.query.productId && req.query.productId !== 'all' ? Number(req.query.productId) : undefined;
    const mediaBuyerIdFilter = req.query.mediaBuyerId && req.query.mediaBuyerId !== 'all' ? Number(req.query.mediaBuyerId) : undefined;
    const magasinIdFilter = req.query.magasinId && req.query.magasinId !== 'all' ? Number(req.query.magasinId) : undefined;
    res.json(await storage.getAdminProfitSummary(storeId, dateFrom, dateTo, productId, mediaBuyerIdFilter, magasinIdFilter));
  });

  app.get("/api/profit/team-summary", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    res.json(await storage.getTeamProfitSummary(storeId, dateFrom, dateTo));
  });

  app.get("/api/media-buyer/profit", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const mediaBuyerId = user.role === 'media_buyer' ? user.id : (req.query.buyerId ? Number(req.query.buyerId) : user.id);
    // Honour per-magasin scope from the dashboard top filter (treat 'all' / missing as undefined).
    const rawMagasin = req.query.magasinId;
    const parsedMagasin = rawMagasin && rawMagasin !== 'all' ? Number(rawMagasin) : undefined;
    const magasinId = Number.isFinite(parsedMagasin) ? parsedMagasin : undefined;
    res.json(await storage.getMediaBuyerProfit(storeId, mediaBuyerId, dateFrom, dateTo, magasinId));
  });

  // ============================================================
  // INTEGRATION CRUD
  // ============================================================
  app.get("/api/integrations", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const type = req.query.type as string | undefined;
    const integrations = await storage.getIntegrationsByStore(storeId, type);
    const safe = integrations.map(i => ({
      ...i,
      credentials: undefined,
      hasCredentials: i.credentials !== '{}',
    }));
    res.json(safe);
  });

  app.post("/api/integrations", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        provider: z.string().min(1),
        type: z.enum(["store", "shipping"]),
        credentials: z.record(z.string()).default({}),
        magasinId: z.number().optional(),
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const existing = await storage.getIntegrationByProvider(storeId, data.provider, data.magasinId);
      if (existing) {
        const updated = await storage.updateIntegration(existing.id, {
          credentials: JSON.stringify(data.credentials),
          isActive: 1,
        });
        await storage.createIntegrationLog({
          storeId, integrationId: existing.id, provider: data.provider,
          action: 'integration_updated', status: 'success',
          message: `Intégration ${data.provider} mise à jour`,
        });
        return res.json(updated);
      }

      const integration = await storage.createIntegration({
        storeId,
        provider: data.provider,
        type: data.type,
        credentials: JSON.stringify(data.credentials),
        isActive: 1,
        magasinId: data.magasinId || null,
      } as any);
      await storage.createIntegrationLog({
        storeId, integrationId: integration.id, provider: data.provider,
        action: 'integration_connected', status: 'success',
        message: `Intégration ${data.provider} connectée`,
      });
      res.status(201).json(integration);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const integration = await storage.getIntegration(id);
      if (!integration || integration.storeId !== req.user!.storeId) {
        return res.status(404).json({ message: "Integration not found" });
      }
      const schema = z.object({
        credentials: z.record(z.string()).optional(),
        isActive: z.number().optional(),
        // Allow re-linking an existing integration to a different magasin.
        // Accept null to explicitly clear the link, or a number to set it.
        magasinId: z.number().nullable().optional(),
      });
      const data = schema.parse(req.body);

      // Cross-tenant guard: if the caller is trying to link this integration to a
      // specific magasin, verify that magasin belongs to the same owner as the
      // requesting user. Without this, a malicious user could re-link their own
      // integration to another tenant's store by guessing a stores.id.
      if (data.magasinId !== undefined && data.magasinId !== null) {
        const targetStore = await storage.getStore(data.magasinId);
        if (!targetStore || targetStore.ownerId !== req.user!.id) {
          return res.status(403).json({ message: "Magasin invalide ou non autorisé." });
        }
      }

      const updateData: any = {};
      if (data.credentials) updateData.credentials = JSON.stringify(data.credentials);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.magasinId !== undefined) updateData.magasinId = data.magasinId;

      const updated = await storage.updateIntegration(id, updateData);
      if (data.magasinId !== undefined) {
        console.log(`[INTEGRATION-PATCH] integrationId=${id} re-linked to magasinId=${data.magasinId ?? 'null'} by userId=${req.user!.id}`);
      }
      await storage.createIntegrationLog({
        storeId: req.user!.storeId!, integrationId: id, provider: integration.provider,
        action: 'integration_updated', status: 'success',
        message: `Intégration ${integration.provider} mise à jour`,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/integrations/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const integration = await storage.getIntegration(id);
    if (!integration || integration.storeId !== req.user!.storeId) {
      return res.status(404).json({ message: "Integration not found" });
    }
    await storage.createIntegrationLog({
      storeId: req.user!.storeId!, integrationId: null, provider: integration.provider,
      action: 'integration_disconnected', status: 'success',
      message: `Intégration ${integration.provider} déconnectée`,
    });
    await storage.deleteIntegration(id);
    res.json({ message: "Déconnecté" });
  });

  // ============================================================
  // SHOPIFY MULTI-STORE INTEGRATIONS
  // ============================================================

  // List all Shopify integrations across all of the user's magasins
  app.get("/api/integrations/shopify", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userStores = await storage.getStoresByOwner(userId);
      const storeIds = userStores.map(s => s.id);
      const integrations = await storage.getIntegrationsByProvider("shopify", storeIds);
      // Attach store names for display
      const result = integrations.map(i => ({
        ...i,
        storeName: userStores.find(s => s.id === i.storeId)?.name ?? "Magasin",
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Create a new Shopify integration for a specific magasin
  app.post("/api/integrations/shopify", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const bodySchema = z.object({
        storeId: z.number(),
        connectionName: z.string().min(1),
        canOpen: z.boolean().optional().default(true),
        ramassage: z.boolean().optional().default(false),
        stock: z.boolean().optional().default(false),
      });
      const { storeId, connectionName, canOpen, ramassage, stock } = bodySchema.parse(req.body);
      // Verify user owns this magasin
      const userStores = await storage.getStoresByOwner(userId);
      if (!userStores.find(s => s.id === storeId)) {
        return res.status(403).json({ message: "Ce magasin ne vous appartient pas" });
      }
      // Generate a unique webhook key and mark as verified immediately.
      // 32 bytes = 64-char hex = 256 bits of entropy.
      const { randomBytes } = await import("crypto");
      const webhookKey = randomBytes(32).toString("hex");
      const credentials = JSON.stringify({ verified: true, canOpen, ramassage, stock });
      const integration = await storage.createIntegration({
        storeId,
        provider: "shopify",
        type: "store",
        credentials,
        isActive: 1,
        webhookKey,
        connectionName,
        ordersCount: 0,
      } as any);
      res.json(integration);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Verify a Shopify integration (checks for webhook hits via integration_logs or ordersCount)
  app.post("/api/integrations/shopify/:id/verify", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const integration = await storage.getIntegration(id);
      if (!integration || integration.provider !== "shopify") {
        return res.status(404).json({ message: "Introuvable" });
      }
      const userId = req.user!.id;
      const userStores = await storage.getStoresByOwner(userId);
      if (!userStores.find(s => s.id === integration.storeId)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      // Check if any logs exist for this integration (real orders OR test pings)
      const logs = await storage.getIntegrationLogs(integration.storeId, 100);
      const hasHit = logs.some(l =>
        l.integrationId === id &&
        (l.action === "order_received" || l.action === "webhook_ping")
      );
      const connected = hasHit || (integration.ordersCount ?? 0) > 0;
      if (connected) {
        // Mark as verified in credentials
        let creds: any = {};
        try { creds = JSON.parse(integration.credentials || "{}"); } catch {}
        creds.verified = true;
        await storage.updateIntegration(id, { credentials: JSON.stringify(creds), isActive: 1 } as any);
      }
      res.json({ connected, ordersCount: integration.ordersCount ?? 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle active / inactive for a Shopify integration
  app.patch("/api/integrations/shopify/:id/toggle", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const integration = await storage.getIntegration(id);
      if (!integration) return res.status(404).json({ message: "Introuvable" });
      // Verify ownership
      const userId = req.user!.id;
      const userStores = await storage.getStoresByOwner(userId);
      if (!userStores.find(s => s.id === integration.storeId)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const updated = await storage.updateIntegration(id, {
        isActive: integration.isActive === 1 ? 0 : 1,
      } as any);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a Shopify integration (reuse the generic delete, but scoped to Shopify)
  app.delete("/api/integrations/shopify/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const integration = await storage.getIntegration(id);
      if (!integration || integration.provider !== "shopify") {
        return res.status(404).json({ message: "Introuvable" });
      }
      const userId = req.user!.id;
      const userStores = await storage.getStoresByOwner(userId);
      if (!userStores.find(s => s.id === integration.storeId)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      await storage.deleteIntegration(id);
      res.json({ message: "Supprimé" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============================================================
  // CARRIER ACCOUNTS (Multi-account per carrier)
  // ============================================================

  app.get("/api/carrier-accounts", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const provider = req.query.provider as string | undefined;
    const accounts = await storage.getCarrierAccounts(storeId, provider);
    // Never expose the raw apiKey to the frontend — return mask + presence flag only
    const masked = accounts.map(({ apiKey, apiSecret, ...rest }) => ({
      ...rest,
      hasApiKey:    !!(apiKey && apiKey.length > 0),
      apiKeyMasked: apiKey
        ? (apiKey.slice(0, 4) + "•".repeat(Math.max(0, apiKey.length - 4)))
        : "",
    }));
    res.json(masked);
  });

  /**
   * GET /api/shipping/active-accounts
   * Returns only active carrier accounts for the current store.
   * Never exposes the raw API key — safe to call from the frontend.
   * Used by the "Expédier les commandes" modal to build the carrier list.
   */
  app.get("/api/shipping/active-accounts", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      console.log(`[DISPATCH-START]: Searching for active carrier accounts for store: ${storeId}`);

      const all = await storage.getCarrierAccounts(storeId);

      // Normalise is_active — DB returns integer 1/0; guard against booleans too
      const active = all.filter((a: any) => a.isActive === 1 || a.isActive === true);

      if (active.length === 0) {
        console.log(`[DISPATCH-ERROR]: No active credentials found in carrier_accounts table for store ${storeId}. Total rows: ${all.length}`);
      } else {
        console.log(
          `[DISPATCH-OK]: Active carriers for store ${storeId}:`,
          active.length,
          active.map((a: any) => `${a.carrierName}/${a.connectionName}(id:${a.id}, active:${a.isActive})`)
        );
      }

      // Return safe subset — never expose raw API key to frontend
      res.json(active.map((a: any) => ({
        id:             a.id,
        carrierName:    a.carrierName,
        connectionName: a.connectionName,
        isDefault:      a.isDefault,
        isActive:       a.isActive,
        assignmentRule: a.assignmentRule,
      })));
    } catch (err: any) {
      console.error(`[DISPATCH-ERROR]: Exception in /api/shipping/active-accounts — ${err.message}`);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/carrier-accounts", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const { carrierName, connectionName, apiKey: rawApiKey, apiSecret: rawApiSecret, apiUrl, storeName, carrierStoreName, networkId, storeId: linkedStoreId, assignmentRule, isDefault, magasinId, deliveryFee } = req.body;
      if (!carrierName || !rawApiKey) {
        return res.status(400).json({ message: "carrierName et apiKey sont obligatoires" });
      }
      // Strip control chars / newlines from token before persisting
      const cleanKey = (s: string | undefined | null) =>
        (s || "").replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
      const apiKey    = cleanKey(rawApiKey);
      const apiSecret = cleanKey(rawApiSecret) || null;

      const { randomUUID } = await import("crypto");
      // 32 hex chars from randomBytes = 128 bits of entropy. Combined with
      // the carrier+store prefix, the full token is ~40+ chars and unguessable.
      const { randomBytes: _rb } = await import("crypto");
      const webhookToken = `${carrierName}-${storeId}-${_rb(16).toString("hex")}`;

      // Auto-number the connection if no name given
      const existing = await storage.getCarrierAccounts(storeId, carrierName);
      const name = connectionName || `Connection ${existing.length + 1}`;

      const acct = await storage.createCarrierAccount({
        storeId,
        carrierName,
        connectionName: name,
        apiKey,
        apiSecret,
        apiUrl: apiUrl || null,
        webhookToken,
        storeName:        storeName        || null,
        carrierStoreName: carrierStoreName || null,
        isDefault: isDefault ? 1 : (existing.length === 0 ? 1 : 0),
        isActive: 1,
        assignmentRule: assignmentRule || "default",
        settings: {
          ...(networkId !== undefined ? { networkId: Number(networkId) } : {}),
          ...(carrierName.toLowerCase() === 'ameex' && rawApiSecret ? { apiId: rawApiSecret } : {}),
        },
        magasinId: magasinId ? Number(magasinId) : null,
        deliveryFee: deliveryFee !== undefined ? Math.round(Number(deliveryFee)) : 0,
      } as any);

      // Log creation (non-blocking — failure won't affect the response)
      storage.createIntegrationLog({
        storeId, integrationId: null, provider: carrierName,
        action: 'carrier_account_created', status: 'success',
        message: `Compte transporteur "${name}" créé pour ${carrierName}`,
      }).catch(e => console.error('[LOG-ERROR] createIntegrationLog:', e));

      res.json(acct);

      // Fire-and-forget: pull live status for every existing order shipped via this
      // carrier so historical (pre-integration) orders catch up automatically.
      queueMicrotask(async () => {
        try {
          const r = await syncCarrierOrdersInternal(storeId, carrierName);
          console.log(`[AUTO-SYNC] Triggered after creating ${carrierName} account for storeId=${storeId} → checked=${r.synced} updated=${r.updated} errors=${r.errors.length}`);
        } catch (e: any) {
          console.warn(`[AUTO-SYNC] Failed for storeId=${storeId} provider=${carrierName}: ${e?.message}`);
        }
      });

      // Background: sync Ameex cities right after account creation
      if (carrierName.toLowerCase() === 'ameex' && acct.apiKey) {
        (async () => {
          try {
            const axiosLib = (await import('axios')).default;
            const resp = await axiosLib.get('https://app.ameex.ma/api/v1/cities', {
              headers: { 'Authorization': `Bearer ${acct.apiKey}`, 'Accept': 'application/json' },
              timeout: 15000,
              validateStatus: () => true,
            });
            if (resp.status === 200 && resp.data) {
              const cityData = Array.isArray(resp.data) ? resp.data : (resp.data.data || resp.data.cities || []);
              const cityNames: string[] = cityData.map((c: any) => c.name || c.ville || c.label || c).filter(Boolean);
              if (cityNames.length > 0) {
                await storage.upsertCarrierCities(storeId, 'ameex', acct.id, cityNames);
                console.log(`[AMEEX-CITIES-BG] Synced ${cityNames.length} cities for new account #${acct.id}`);
              }
            } else {
              console.log(`[AMEEX-CITIES-BG] HTTP ${resp.status} — skipping city sync`);
            }
          } catch (e: any) {
            console.error('[AMEEX-CITIES-BG] Error during background city sync:', e?.message);
          }
        })();
      }
    } catch (error: any) {
      console.error('[DB-ERROR] POST /api/carrier-accounts:', error?.message || error);
      console.error('[DB-ERROR] Code:', error?.code);
      console.error('[DB-ERROR] Detail:', error?.detail);
      console.error('[DB-ERROR] Stack:', error?.stack);
      res.status(500).json({
        message: error?.message || 'Erreur serveur lors de la création du compte transporteur',
        pgCode: error?.code,
        pgDetail: error?.detail,
        hint: 'Consultez les logs Railway pour le détail complet.',
      });
    }
  });

  app.patch("/api/carrier-accounts/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const acct = await storage.getCarrierAccount(id);
      if (!acct || acct.storeId !== storeId) return res.status(404).json({ message: "Compte introuvable" });

      const { connectionName, apiKey: rawPatchKey, apiSecret: rawPatchSecret, apiUrl, storeName, carrierStoreName, networkId, assignmentRule, isDefault, isActive, assignmentData, deliveryFee: patchDeliveryFee } = req.body;
      const cleanKey = (s: string | undefined | null) =>
        (s || "").replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
      const tokenUpdated = !!(rawPatchKey && rawPatchKey !== "");
      const updated = await storage.updateCarrierAccount(id, {
        ...(connectionName    !== undefined && { connectionName }),
        ...(tokenUpdated                    && { apiKey: cleanKey(rawPatchKey) }),
        ...(rawPatchSecret    !== undefined && { apiSecret: cleanKey(rawPatchSecret) || null }),
        ...(apiUrl            !== undefined && { apiUrl }),
        ...(storeName         !== undefined && { storeName }),
        ...(carrierStoreName  !== undefined && { carrierStoreName: carrierStoreName || null }),
        ...(assignmentRule    !== undefined && { assignmentRule }),
        ...(isDefault         !== undefined && { isDefault: isDefault ? 1 : 0 }),
        ...(isActive          !== undefined && { isActive: isActive ? 1 : 0 }),
        ...(assignmentData      !== undefined && { assignmentData }),
        ...(patchDeliveryFee    !== undefined && { deliveryFee: Math.round(Number(patchDeliveryFee)) }),
        // Write networkId under BOTH the legacy key (networkId) and the canonical key (digylogNetworkId)
        // so that pickFields in getAccountForShipping always finds it regardless of which key was written first.
        ...(networkId !== undefined && {
          settings: {
            ...(acct.settings as any || {}),
            networkId:        Number(networkId),
            digylogNetworkId: Number(networkId),
          },
        }),
      });
      if (tokenUpdated) {
        console.log(`[CARRIER-UPDATE] Token updated for account #${id} (store ${storeId}) — new length: ${cleanKey(rawPatchKey).length}`);
      } else {
        console.log(`[CARRIER-UPDATE] Account #${id} updated (no token change) — fields: ${Object.keys(req.body).join(', ')}`);
      }
      res.json({ ...updated, tokenUpdated });
    } catch (error: any) {
      console.error('[DB-ERROR] PATCH /api/carrier-accounts:', error?.message || error);
      res.status(500).json({ message: error?.message || 'Erreur serveur lors de la mise à jour du compte' });
    }
  });

  app.delete("/api/carrier-accounts/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const acct = await storage.getCarrierAccount(id);
      if (!acct || acct.storeId !== storeId) return res.status(404).json({ message: "Compte introuvable" });
      await storage.deleteCarrierAccount(id);
      res.json({ message: "Supprimé" });
    } catch (error: any) {
      console.error('[DB-ERROR] DELETE /api/carrier-accounts:', error?.message || error);
      res.status(500).json({ message: error?.message || 'Erreur serveur lors de la suppression du compte' });
    }
  });

  // ── Digylog: fetch available stores for the given token ──────────────────
  app.get("/api/carrier-accounts/digylog/stores", requireAuth, async (req, res) => {
    const { token, apiUrl, accountId } = req.query as { token?: string; apiUrl?: string; accountId?: string };

    // Allow passing accountId instead of raw token (secure: backend looks up the key)
    let resolvedToken = token;
    let resolvedApiUrl = apiUrl;
    if (accountId && !resolvedToken) {
      const storeId = req.user!.storeId!;
      const acct = await storage.getCarrierAccount(Number(accountId));
      if (!acct || acct.storeId !== storeId) {
        return res.status(404).json({ message: "Compte introuvable" });
      }
      resolvedToken = acct.apiKey;
      if (!resolvedApiUrl && acct.apiUrl) resolvedApiUrl = acct.apiUrl;
    }

    if (!resolvedToken) return res.status(400).json({ message: "token requis" });

    const sanitize = (s: string) => s.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
    const cleanToken = sanitize(resolvedToken);

    // Determine base URL (custom override or official Digylog endpoint root)
    const rawBase = (resolvedApiUrl || "https://api.digylog.com/api/v2/seller").replace(/\/+$/, "");
    // Swap any known bad domains
    const baseUrl = rawBase.replace(/api\.digylog\.ma/i, "api.digylog.com")
                           .replace(/app\.digylog\.com/i, "api.digylog.com");
    const storesUrl = `${baseUrl}/stores`;

    try {
      const axiosLib = (await import("axios")).default;
      const resp = await axiosLib.get(storesUrl, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: "application/json",
          Referer: "https://apiseller.digylog.com",
          Origin: "https://apiseller.digylog.com",
        },
        timeout: 15_000,
        validateStatus: () => true,
      });

      if (resp.status !== 200) {
        console.error(`[Digylog/stores] HTTP ${resp.status}:`, JSON.stringify(resp.data).slice(0, 200));
        return res.status(resp.status).json({ message: `Digylog a répondu avec HTTP ${resp.status}`, raw: resp.data });
      }

      // Digylog returns either an array or { data: [...] }
      const raw = resp.data;
      const list: Array<{ id: number | string; name: string }> =
        Array.isArray(raw) ? raw :
        Array.isArray(raw?.data) ? raw.data :
        Array.isArray(raw?.stores) ? raw.stores : [];

      const stores = list.map((s: any) => ({ id: s.id, name: s.name || s.store_name || String(s.id) }));
      console.log(`[Digylog/stores] Fetched ${stores.length} stores for token …${cleanToken.slice(-6)}`);
      res.json({ stores });
    } catch (err: any) {
      console.error("[Digylog/stores] Network error:", err?.message);
      res.status(502).json({ message: "Impossible de contacter Digylog. Vérifiez votre token et réessayez." });
    }
  });

  // ── Digylog: fetch available networks (pickup hubs) ─────────────────────────
  app.get("/api/carrier-accounts/digylog/networks", requireAuth, async (req, res) => {
    const { token, apiUrl, accountId } = req.query as { token?: string; apiUrl?: string; accountId?: string };

    let resolvedToken = token;
    let resolvedApiUrl = apiUrl;
    if (accountId && !resolvedToken) {
      const storeId = req.user!.storeId!;
      const acct = await storage.getCarrierAccount(Number(accountId));
      if (!acct || acct.storeId !== storeId) {
        return res.status(404).json({ message: "Compte introuvable" });
      }
      resolvedToken = acct.apiKey;
      if (!resolvedApiUrl && acct.apiUrl) resolvedApiUrl = acct.apiUrl;
    }

    if (!resolvedToken) return res.status(400).json({ message: "token requis" });

    const cleanToken = resolvedToken.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
    const rawBase = (resolvedApiUrl || "https://api.digylog.com/api/v2/seller").replace(/\/+$/, "");
    const baseUrl = rawBase.replace(/api\.digylog\.ma/i, "api.digylog.com")
                           .replace(/app\.digylog\.com/i, "api.digylog.com");

    try {
      const axiosLib = (await import("axios")).default;
      const resp = await axiosLib.get(`${baseUrl}/networks`, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: "application/json",
          Referer: "https://apiseller.digylog.com",
          Origin: "https://apiseller.digylog.com",
        },
        timeout: 15_000,
        validateStatus: () => true,
      });

      if (resp.status !== 200) {
        console.error(`[Digylog/networks] HTTP ${resp.status}:`, JSON.stringify(resp.data).slice(0, 200));
        return res.status(resp.status).json({ message: `Digylog a répondu avec HTTP ${resp.status}`, raw: resp.data });
      }

      const raw = resp.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      const networks = list.map((n: any) => ({ id: n.id, name: n.name || String(n.id) }));
      console.log(`[Digylog/networks] Fetched ${networks.length} networks for token …${cleanToken.slice(-6)}`);
      res.json({ networks });
    } catch (err: any) {
      console.error("[Digylog/networks] Network error:", err?.message);
      res.status(502).json({ message: "Impossible de contacter Digylog. Vérifiez votre token et réessayez." });
    }
  });

  // ── Digylog convenience endpoints (uses the active account's stored token) ──

  app.get("/api/digylog/networks", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const accounts = await storage.getCarrierAccounts(storeId, "digylog");
    const active = accounts.find((a: any) => a.isActive === 1);
    if (!active?.apiKey) return res.status(400).json({ message: "Compte Digylog non configuré" });
    const token = active.apiKey.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
    const axiosLib = (await import("axios")).default;
    try {
      const resp = await axiosLib.get("https://api.digylog.com/api/v2/seller/networks", {
        headers: { Authorization: `Bearer ${token}`, Referer: "https://apiseller.digylog.com", Accept: "application/json" },
        timeout: 10_000,
        validateStatus: () => true,
      });
      if (resp.status !== 200) return res.status(resp.status).json({ message: `Digylog HTTP ${resp.status}`, raw: resp.data });
      const list = Array.isArray(resp.data) ? resp.data : (resp.data?.data || []);
      res.json(list.map((n: any) => ({ id: n.id, name: n.name })));
    } catch (e: any) {
      res.status(502).json({ message: "Impossible de contacter Digylog" });
    }
  });

  app.get("/api/digylog/stores", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const accounts = await storage.getCarrierAccounts(storeId, "digylog");
    const active = accounts.find((a: any) => a.isActive === 1);
    if (!active?.apiKey) return res.status(400).json({ message: "Compte Digylog non configuré" });
    const token = active.apiKey.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
    const axiosLib = (await import("axios")).default;
    try {
      const resp = await axiosLib.get("https://api.digylog.com/api/v2/seller/stores", {
        headers: { Authorization: `Bearer ${token}`, Referer: "https://apiseller.digylog.com", Accept: "application/json" },
        timeout: 10_000,
        validateStatus: () => true,
      });
      if (resp.status !== 200) return res.status(resp.status).json({ message: `Digylog HTTP ${resp.status}`, raw: resp.data });
      const list = Array.isArray(resp.data) ? resp.data : (resp.data?.data || []);
      res.json(list.map((s: any) => ({ id: s.id, name: s.name || s.store_name })));
    } catch (e: any) {
      res.status(502).json({ message: "Impossible de contacter Digylog" });
    }
  });

  app.patch("/api/digylog/preferences", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const { digylogStoreName, digylogNetworkId } = req.body;
    if (!digylogStoreName || !digylogNetworkId) {
      return res.status(400).json({ message: "digylogStoreName et digylogNetworkId sont requis" });
    }
    const accounts = await storage.getCarrierAccounts(storeId, "digylog");
    const active = accounts.find((a: any) => a.isActive === 1);
    if (!active) return res.status(404).json({ message: "Compte Digylog introuvable" });
    const newSettings = {
      ...((active.settings as object) || {}),
      digylogStoreName,
      digylogNetworkId: Number(digylogNetworkId),
    };
    await storage.updateCarrierAccount(active.id, { settings: newSettings });
    console.log(`[DIGYLOG-PREFS] store="${digylogStoreName}" networkId=${digylogNetworkId} saved for storeId=${storeId}`);
    res.json({ success: true });
  });

  // ── Sync carrier cities from live API → carrier_cities table ────────────────
  app.post("/api/carrier-accounts/:id/sync-cities", requireAuth, async (req, res) => {
    try {
      const accountId = Number(req.params.id);
      const storeId   = req.user!.storeId!;

      const acct = await storage.getCarrierAccount(accountId);
      if (!acct || acct.storeId !== storeId) return res.status(404).json({ message: "Compte introuvable" });

      const sanitize = (s: string) => s.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
      const apiKey = sanitize(acct.apiKey);
      if (!apiKey) return res.status(400).json({ message: "Token API manquant sur ce compte" });

      // Build cities URL — carrier-specific
      const rawBase = (acct.apiUrl || "").replace(/\/orders\s*$/i, "").replace(/\/+$/, "");
      const carrierKey = (acct.carrierName || "").toLowerCase();

      let citiesUrl: string;
      if (carrierKey === "ameex") {
        citiesUrl = "https://api.ameex.app/customer/Delivery/Cities/Action/Type/Get";
      } else if (carrierKey === "digylog") {
        const base = (rawBase || "https://api.digylog.com/api/v2/seller")
          .replace(/api\.digylog\.ma/i, "api.digylog.com")
          .replace(/app\.digylog\.com/i, "api.digylog.com");
        citiesUrl = `${base}/cities`;
      } else {
        return res.status(422).json({ message: `Synchronisation des villes non supportée pour ${acct.carrierName}` });
      }

      console.log(`[CitiesSync] Fetching cities for account #${accountId} (${acct.carrierName}) from ${citiesUrl}`);

      const reqHeaders: any = { Accept: "application/json" };
      if (carrierKey === "ameex") {
        // Ameex uses C-Api-Key / C-Api-Id header pair — strip any HTML wrapping
        reqHeaders["C-Api-Key"] = stripHtml(acct.apiKey);
        reqHeaders["C-Api-Id"]  = stripHtml((acct as any).apiSecret || (acct as any).storeName || "");
      } else {
        reqHeaders["Authorization"] = `Bearer ${apiKey}`;
        reqHeaders["Referer"] = "https://apiseller.digylog.com";
        reqHeaders["Origin"]  = "https://apiseller.digylog.com";
      }

      const axiosLib = (await import("axios")).default;

      if (carrierKey === "ameex") {
        console.log(`[AMEEX-CITIES-REQ] URL: ${citiesUrl}`);
        console.log(`[AMEEX-CITIES-REQ] Headers: ${JSON.stringify(reqHeaders)}`);
        console.log(`[AMEEX-CITIES-REQ] Raw apiKey from DB: "${acct.apiKey?.slice(0, 50)}"`);
      }

      const resp = await axiosLib.get(citiesUrl, {
        headers: reqHeaders,
        timeout: 20_000,
        httpsAgent: new (await import("https")).default.Agent({ rejectUnauthorized: false }),
        validateStatus: () => true,
      });

      if (carrierKey === "ameex") {
        console.log(`[AMEEX-CITIES-RESP] Status: ${resp.status}`);
        console.log(`[AMEEX-CITIES-RESP] Data: ${JSON.stringify(resp.data).slice(0, 500)}`);
        console.log(`[AMEEX-CITIES-DEBUG] HTTP ${resp.status}`);
        console.log(`[AMEEX-CITIES-DEBUG] Response: ${JSON.stringify(resp.data).slice(0, 1000)}`);

        const AMEEX_CITIES_ENDPOINTS = [
          "https://api.ameex.app/customer/Delivery/Cities/Action/Type/Get",
          "https://api.ameex.app/customer/Cities/Action/Type/Get",
          "https://api.ameex.app/customer/Delivery/Cities",
          "https://c.ameex.app/api/v1/cities",
        ];
        for (const url of AMEEX_CITIES_ENDPOINTS) {
          try {
            const r = await axiosLib.get(url, { headers: reqHeaders, timeout: 10000, validateStatus: () => true });
            console.log(`[AMEEX-CITIES] ${url} → HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
            if (r.status === 200 && r.data) break;
          } catch (e: any) {
            console.log(`[AMEEX-CITIES] ${url} → Error: ${e.message}`);
          }
        }
      }

      if (resp.status !== 200) {
        console.error(`[CitiesSync] HTTP ${resp.status}:`, JSON.stringify(resp.data).slice(0, 300));
        return res.status(resp.status).json({
          message: `L'API ${acct.carrierName} a répondu avec HTTP ${resp.status}`,
          raw: resp.data,
        });
      }

      // Parse city names — carrier-specific response shapes
      let cities: string[] = [];

      // Ameex city ID entries (id → name) — saved separately for city ID resolution at ship time
      let ameexCityEntries: { externalId: string; name: string; nameNorm: string }[] = [];

      if (carrierKey === "ameex") {
        // Ameex returns: {"login":"success","api":{"cities":{"1":{"name":"Marrakech",...},"2":...}}}
        const citiesObj = resp.data?.api?.cities || resp.data?.cities || {};
        const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        // Capture both names (for carrier_cities) AND id→name pairs (for ameex_cities)
        ameexCityEntries = Object.entries(citiesObj)
          .map(([id, c]: any) => ({
            externalId: String(id),
            name:       (c.name || c.ville || "").trim(),
            nameNorm:   normName((c.name || c.ville || "").trim()),
          }))
          .filter(e => e.name);
        cities = ameexCityEntries.map(e => e.name).sort();
      } else {
        // Other carriers: array or wrapped array
        const raw = resp.data;
        const cityList: any[] =
          Array.isArray(raw)               ? raw :
          Array.isArray(raw?.data)         ? raw.data :
          Array.isArray(raw?.cities)       ? raw.cities :
          Array.isArray(raw?.data?.cities) ? raw.data.cities : [];
        cities = cityList
          .map((c: any) => (typeof c === "string" ? c : (c?.name || c?.city_name || c?.label || "")).trim())
          .filter(Boolean)
          .sort();
      }

      if (!cities.length) {
        return res.status(422).json({ message: `Aucune ville reçue de ${acct.carrierName}. Vérifiez votre token et réessayez.` });
      }

      await storage.upsertCarrierCities(storeId, acct.carrierName, accountId, cities);

      // For Ameex: also save id→name mapping so city names can be resolved to numeric IDs at ship time
      if (carrierKey === "ameex" && ameexCityEntries.length > 0) {
        await storage.upsertAmeexCities(storeId, ameexCityEntries);
        console.log(`[AMEEX-CITIES-SYNC]: Saved ${ameexCityEntries.length} city ID mappings to ameex_cities`);
      }

      console.log(`[CITY-SYNC]: Received ${cities.length} cities from ${acct.carrierName} API (storeId=${storeId})`);
      console.log(`[CITY-SYNC]: Sample cities — ${cities.slice(0, 5).join(", ")}`);
      res.json({ count: cities.length, cities, syncedAt: new Date().toISOString() });
    } catch (err: any) {
      console.error("[CitiesSync] Error:", err?.message);
      res.status(502).json({ message: `Impossible de contacter ${(acct as any)?.carrierName || "le transporteur"}: ${err?.message || "erreur réseau"}` });
    }
  });

  // ── Shared carrier webhook processor ────────────────────────────────────────
  // Maps Digylog/carrier raw status strings to internal system statuses,
  // captures driver info into the follow-up journal, updates commentStatus,
  // and broadcasts real-time events to the store's connected clients.
  async function processCarrierWebhook(
    storeId: number,
    carrierName: string,
    body: Record<string, any>,
  ): Promise<{ tracked: boolean; orderId?: number; newStatus?: string; matchedBy?: string }> {
    const rawPayload = JSON.stringify(body);

    console.log(`[WEBHOOK-INCOMING]: Received from ${carrierName} (store ${storeId}) — keys: ${Object.keys(body).join(', ')}`);
    console.log(`[WEBHOOK-INCOMING]: Full payload: ${rawPayload}`);

    // ── Extract all possible identifiers from the payload ─────────────────
    // Carriers differ: some send tracking IDs, some send our order reference
    const trackingNumber = (
      body.CODE           ||  // Ameex webhook field (uppercase)
      body.code           ||  // Ameex webhook field (lowercase)
      body.traking        ||  // Digylog field (typo in their API)
      body.tracking_number || body.barcode   || body.code_suivi ||
      body.track_number   || body.colis_id  || body.tracking   ||
      body.colis          || body.id        || ""
    ).toString().trim();

    const orderNumber = (
      body.order_number || body.reference || body.num       ||
      body.ref          || body.order_id  || body.numero_commande || ""
    ).toString().trim();

    // ── Extract raw status — cover every field name carriers use ──────────
    // Digylog and other Moroccan carriers vary widely: status, etat, libelle,
    // label, last_event, statut_libelle, description, etc.
    // If none of the known fields are present, scan ALL body string values
    // as a last resort — so we NEVER miss the carrier text.
    const rawText = (
      body.STATUT_S_NAME    ||  // Ameex: sub-status name (most specific)
      body.STATUT_NAME      ||  // Ameex: main status name
      body.status           ||  // Digylog sends status as text here
      body.last_event       ||
      body.etat_libelle     ||
      body.statut_libelle   ||
      body.libelle          ||
      body.label            ||
      body.last_status      ||
      body.current_status   ||
      body.event_label      ||
      body.event            ||
      body.etat             ||
      body.STATUT           ||  // Ameex: status code (fallback if no name fields)
      body.statut           ||
      body.description      ||
      body.data?.status     ||
      body.data?.etat       ||
      body.data?.last_event ||
      body.data?.libelle    ||
      // Last-resort: first string value in body that looks like a status phrase
      // (not the tracking number, not a URL, not a short code)
      Object.values(body).find((v): v is string =>
        typeof v === 'string' &&
        v.length > 3 &&
        !v.startsWith('http') &&
        v !== trackingNumber &&
        v !== orderNumber
      ) ||
      ""
    ).trim();

    // rawStatus is normalised (lowercased + trimmed) for fuzzy matching only
    const rawStatus = rawText.toLowerCase().trim();

    console.log(`[WEBHOOK-MATCH]: Looking for tracking="${trackingNumber}" or order="${orderNumber}" — status="${rawText}"`);

    if (!trackingNumber && !orderNumber) {
      console.warn(`[WEBHOOK-RESULT]: No identifier found in payload — cannot match any order`);
      return { tracked: false };
    }

    // ── Double-match: tracking number first, order number as fallback ─────
    let order: Awaited<ReturnType<typeof storage.getOrderByTrackingNumber>> = undefined;
    let matchedBy = "";

    if (trackingNumber) {
      order = await storage.getOrderByTrackingNumber(storeId, trackingNumber);
      if (order) matchedBy = `tracking_number="${trackingNumber}"`;
    }

    if (!order && orderNumber) {
      order = await storage.getOrderByNumber(storeId, orderNumber);
      if (order) matchedBy = `order_number="${orderNumber}"`;
    }

    // ── Cross-store fallback: URL may have wrong storeId ─────────────────
    // If no order was found in the specified store, search ALL stores.
    // Digylog may be using a webhook URL that was configured with the wrong storeId.
    //
    // SECURITY (P0-7): For carriers that authenticate via webhook token
    // (Ameex), we DISABLE this cross-store fallback. With auth in place,
    // a valid token for store A must NEVER mutate orders in store B —
    // even if a tracking number happens to collide. Tenant isolation is
    // strictly enforced for tokened carriers.
    const TOKENED_CARRIERS_FOR_FALLBACK = new Set(["ameex"]);
    if (!order && trackingNumber && !TOKENED_CARRIERS_FOR_FALLBACK.has(carrierName.toLowerCase())) {
      console.warn(`[WEBHOOK-FLEXIBLE]: Not found in store ${storeId} — trying cross-store search for tracking="${trackingNumber}"`);
      const crossOrder = await storage.getOrderByTrackingNumberAnyStore(trackingNumber);
      if (crossOrder) {
        console.warn(`[WEBHOOK-FLEXIBLE]: Found in store ${(crossOrder as any).storeId} — URL storeId=${storeId} was wrong`);
        order = crossOrder;
        matchedBy = `tracking_number="${trackingNumber}" (cross-store, URL had storeId=${storeId})`;
      }
    } else if (!order && trackingNumber && TOKENED_CARRIERS_FOR_FALLBACK.has(carrierName.toLowerCase())) {
      console.warn(`[WEBHOOK-SEC] ${carrierName} store=${storeId}: order not found, cross-store fallback DISABLED for tokened carrier (tenant isolation)`);
    }

    if (!order) {
      console.warn(`[WEBHOOK-RESULT]: Not Found — tracking="${trackingNumber}" order="${orderNumber}" — attempting auto-create from carrier API`);

      // ── Auto-create fallback ──────────────────────────────────────────────
      // Pull full order details from the carrier so historical orders (shipped
      // before the webhook was wired up) materialize in the platform.
      let details: Awaited<ReturnType<typeof import("./services/carrier-service").fetchOrderDetails>> = null;
      let carrierAccount: any = null;
      try {
        if (trackingNumber) {
          const accounts = await storage.getCarrierAccounts(storeId, carrierName);
          carrierAccount = accounts[0];
          if (carrierAccount) {
            const { fetchOrderDetails } = await import("./services/carrier-service");
            details = await fetchOrderDetails(carrierName, trackingNumber, carrierAccount);
          }
        }
      } catch (e: any) {
        console.warn(`[WEBHOOK-AUTO-CREATE] Failed to fetch details: ${e?.message}`);
      }

      if (details && details.customerPhone && trackingNumber) {
        // Resolve magasin with tenant-isolation validation (rejects accounts
        // pointing at a magasin outside the store's owner scope).
        const magasinId = await resolveSafeMagasinId(storeId, (carrierAccount as any)?.magasinId);

        order = await storage.createOrderFromCarrier({
          storeId,
          magasinId,
          provider:        carrierName,
          trackingNumber:  trackingNumber!,
          customerName:    details.customerName    || 'Client (importé)',
          customerPhone:   details.customerPhone,
          customerAddress: details.customerAddress,
          customerCity:    details.customerCity,
          totalPrice:      details.totalPrice,
          shippingCost:    details.shippingCost,
          status:          details.status || 'Attente De Ramassage',
          rawStatus:       details.rawStatus || rawText,
        });
        matchedBy = `auto_created_from_${carrierName}_api`;

        await storage.createIntegrationLog({
          storeId, integrationId: null, provider: carrierName,
          action: 'webhook_auto_created', status: 'success',
          message: `✓ Commande créée automatiquement depuis ${carrierName} — tracking: "${trackingNumber}" — client: "${details.customerName || 'Client (importé)'}"`,
          payload: rawPayload.slice(0, 1000),
        });
        console.log(`[WEBHOOK-AUTO-CREATE]: Created order #${order.id} from ${carrierName} for tracking="${trackingNumber}"`);
        // Fall through — the rest of processCarrierWebhook now operates on the freshly-created order.
      } else {
        // Still nothing — log as orphan.
        await storage.createIntegrationLog({
          storeId, integrationId: null, provider: carrierName,
          action: 'webhook_no_match', status: 'fail',
          message: `⚠️ Commande introuvable et impossible à créer — tracking: "${trackingNumber}" | ref: "${orderNumber}" | statut: "${rawText}"`,
          payload: rawPayload.slice(0, 1000),
        });
        return { tracked: false };
      }
    }

    console.log(`[WEBHOOK-RESULT]: Order found — id=${order.id} orderNumber=${(order as any).orderNumber} (matched by ${matchedBy})`);
    console.log(`[WEBHOOK-RAW]: Received status "${rawText}" for Order ${order.id}`);

    // ── Backfill trackNumber + shipping provider on first webhook ─────────
    // If the order was created without a tracking number (e.g. manually) and the
    // carrier is now reporting one, persist it so the UI can show it everywhere.
    if (!(order as any).trackNumber && trackingNumber) {
      await storage.updateOrder(order.id, {
        trackNumber: trackingNumber,
        shippingProvider: carrierName,
        status: 'Attente De Ramassage',
      } as any);
      console.log(`[WEBHOOK-TRACK] Order #${(order as any).orderNumber} → trackNumber saved: ${trackingNumber}`);
    }

    // ── Always save the exact carrier text into commentStatus ─────────────
    // Mirror whatever the carrier says — displayed verbatim in the Suivi tab.
    // Write unconditionally: even an empty string clears a stale value.
    await storage.updateOrder(order.id, { commentStatus: rawText });

    // ── Map raw carrier text → internal status ────────────────────────────
    // Mapping rules (case-insensitive):
    //   DELIVERED   → "delivered"     : livr, distribu
    //   REFUSED     → "refused"       : refus, retour, annul
    //   UNREACHABLE → "Injoignable"   : injoignable, unreachable, pas de réponse
    //   IN_TRANSIT  → "in_progress"   : réception, network, ramassé, ramass, enlev,
    //                                   voyage, transit, en cours, pickup, expédi,
    //                                   distribution, prép, enregistr
    //   DEFAULT     → "in_progress"   : anything else — commentStatus shows the real text
    let newStatus: string = "in_progress"; // safe default — keeps order in Suivi

    // ── Digylog exact status → internal status (checked first, case-insensitive) ──
    const DIGYLOG_EXACT_MAP: Record<string, string> = {
      "En cours de réception au network": "En cours de réception au network",
      "Arrivé au hub":                    "Arrivé au hub",
      "En cours de livraison":            "En cours de livraison",  // in progress, NOT delivered
      "Sorti pour livraison":             "Sorti pour livraison",   // in progress, NOT delivered
      "Confirmé par livreur":             "in_progress",            // livreur confirmed pickup only — NOT delivered
      "Confirmé par livreur *":           "in_progress",
      "Rappel en cours":                  "in_progress",
      "Rappel en cours *":               "in_progress",
      "Confirmé Reporté":                "in_progress",
      "Confirme Reporte":                "in_progress",
      "Reporté":                         "in_progress",
      "Pris en charge":                   "Pris en charge",
      "Collecté":                         "Collecté",
      "Chargé":                           "Chargé",
      "En attente de ramassage":          "En attente de ramassage",
      "Non Reçu":                         "Non Reçu",
      "Tentative échouée":                "Tentative échouée",
      "Retour en cours":                  "Retour en cours",
      "Retourné à l'expéditeur":          "Retourné à l'expéditeur",
      "Livré":                            "delivered",
      "Livré *":                          "delivered",
      "Livrée":                           "delivered",
      "Livrée *":                         "delivered",
      "Livraison effectuée":              "delivered",
      "Remis au client":                  "delivered",
      "Remis au client *":                "delivered",
    };
    const exactKey = Object.keys(DIGYLOG_EXACT_MAP).find(
      k => k.toLowerCase() === rawStatus
    );
    if (exactKey) {
      newStatus = DIGYLOG_EXACT_MAP[exactKey];
    } else if (rawStatus === "livré" || rawStatus === "livre" || rawStatus === "livrée" || rawStatus === "livrée *" || rawStatus === "livré *" || rawStatus === "livraison effectuée" || rawStatus === "remis au client" || rawStatus === "remis au client *" || rawStatus === "delivered" || rawStatus.includes("distribu")) {
      newStatus = "delivered";
    } else if (rawStatus.includes("livr") || rawStatus.includes("cours de livr")) {
      newStatus = "in_progress"; // "en cours de livraison", "sorti en livraison" etc = still in transit
    } else if (
      rawStatus.includes("refus") || rawStatus.includes("retour") ||
      rawStatus.includes("annul") || rawStatus === "refused"
    ) {
      newStatus = "refused";
    } else if (
      rawStatus.includes("injoignable") || rawStatus.includes("unreachable") ||
      rawStatus.includes("pas de réponse")
    ) {
      newStatus = "Injoignable";
    } else if (
      rawStatus.includes("réception")   || rawStatus.includes("reception")   ||
      rawStatus.includes("network")     || rawStatus.includes("ramassé")     ||
      rawStatus.includes("ramass")      || rawStatus.includes("voyage")      ||
      rawStatus.includes("transit")     || rawStatus.includes("en cours")    ||
      rawStatus.includes("enlev")       || rawStatus.includes("pickup")      ||
      rawStatus.includes("expédi")      || rawStatus.includes("expedie")     ||
      rawStatus.includes("distribution")|| rawStatus.includes("prép")        ||
      rawStatus.includes("enregistr")
    ) {
      newStatus = "in_progress";
    }
    // Anything else also falls through to "in_progress" (the default above).
    // The commentStatus column carries the real display text shown in the Suivi tab.

    // ── Ameex status code override (takes priority over text fuzzy match) ──
    const AMEEX_WEBHOOK_STATUS_MAP: Record<string, string> = {
      'DELIVERED':   'delivered',
      'IN_PROGRESS': 'in_progress',
      'CANCELLED':   'refused',
      'RETURNED':    'retourné',
      'PICKUP':      'Attente De Ramassage',
      'NO_ANSWER':   'Injoignable',
    };
    const ameexCode = (body.STATUT || '').toString().toUpperCase();
    if (ameexCode && AMEEX_WEBHOOK_STATUS_MAP[ameexCode]) {
      newStatus = AMEEX_WEBHOOK_STATUS_MAP[ameexCode];
    }

    await storage.updateOrderStatus(order.id, newStatus);

    // Auto-set shippingCost when order is delivered
    if (newStatus === 'delivered') {
      try {
        const carrierAccts = await storage.getCarrierAccounts((order as any).storeId);
        const acct = carrierAccts.find((a: any) =>
          a.carrierName.toLowerCase() === carrierName.toLowerCase() && a.isActive === 1
        ) || carrierAccts[0];
        if (acct) {
          // Try real per-city cost from Digylog API first
          const cost = await getDigylogDeliveryCost(
            (order as any).trackNumber || '',
            acct.apiKey,
            acct.settings?.digylogNetworkId || (acct as any).digylogNetworkId || 1,
            acct.apiUrl || undefined
          );
          if (cost && cost > 0) {
            await storage.updateOrder(order.id, { shippingCost: cost });
            console.log(`[DeliveryFee] Order #${(order as any).orderNumber} delivered — shippingCost=${cost} (per-city)`);
          } else {
            // Fallback to static deliveryFee from account
            const fee = (acct as any)?.deliveryFee || 0;
            if (fee > 0) {
              await storage.updateOrder(order.id, { shippingCost: fee });
              console.log(`[DeliveryFee] Order #${(order as any).orderNumber} delivered — shippingCost=${fee} (static fee)`);
            }
          }
        }
      } catch (e) {
        console.error('[DeliveryFee] Error:', e);
      }
    }

    console.log(`[WEBHOOK-RAW]: Internal status → ${newStatus} (commentStatus="${rawText}")`);

    // ── Capture driver info into follow-up journal + persist on order ─────
    const driverName  = body.livreur_name || body.driver_name  || body.livreur || body.courier_name  || "";
    let driverPhone = body.livreur_tel  || body.driver_phone || body.courier_phone || body.livreur_phone || "";

    // Digylog & Ameex send driver phone inside COMMENT field:
    // "Livreur Casa3 | Téléphone: 0628802315"
    if (!driverPhone) {
      const commentText = body.COMMENT || body.comment || body.note || "";
      const phoneMatch = String(commentText).match(/[Tt]él[ée]phone[e]?[:\s]+([0-9]{8,10})/);
      if (phoneMatch) {
        driverPhone = phoneMatch[1].trim();
        console.log(`[DRIVER-WEBHOOK] Extracted phone from COMMENT: "${driverPhone}"`);
      }
    }
    // Also extract driver name from COMMENT: "Livreur Casa3 | Téléphone: ..."
    let resolvedDriverName = driverName;
    if (!resolvedDriverName) {
      const commentText = body.COMMENT || body.comment || body.note || "";
      const nameMatch = String(commentText).match(/[Ll]ivreur\s+([^|]+)/);
      if (nameMatch) {
        resolvedDriverName = nameMatch[1].trim();
        console.log(`[DRIVER-WEBHOOK] Extracted name from COMMENT: "${resolvedDriverName}"`);
      }
    }

    if (resolvedDriverName || driverPhone) {
      const parts: string[] = [];
      if (resolvedDriverName)  parts.push(resolvedDriverName);
      if (driverPhone) parts.push(driverPhone);
      await storage.createOrderFollowUpLog({
        orderId: order.id, agentId: null, agentName: carrierName,
        note: `🚴 Livreur: ${parts.join(" — ")} (mis à jour par ${carrierName})`,
      });
      // Persist directly on the order so the UI can show it everywhere
      await storage.updateOrder(order.id, {
        driverName:  resolvedDriverName  || undefined,
        driverPhone: driverPhone || undefined,
      } as any);
      console.log(`[DRIVER] Order #${(order as any).orderNumber} → livreur: ${resolvedDriverName} ${driverPhone}`);
    }

    // ── Extract driverPhone + motif from Digylog webhook payload ──────────
    {
      const wDriverPhone = body.driverPhone || body.driver_phone || body.livreur_tel || '';
      const motif = body.motif || body.motif_status || '';

      console.log(`[DRIVER-WEBHOOK] tracking=${trackingNumber} driverPhone=${wDriverPhone} motif=${motif}`);

      // Build comment with motif + driverPhone
      const commentParts: string[] = [];
      if (rawText) commentParts.push(rawText);
      if (motif) commentParts.push(`Motif: ${motif}`);
      if (wDriverPhone) commentParts.push(`📞 Livreur: ${wDriverPhone}`);
      const fullComment = commentParts.join(' | ');

      // Save to order
      if (wDriverPhone) {
        await storage.updateOrder(order.id, { driverPhone: wDriverPhone } as any);
      }
      await storage.updateOrder(order.id, { commentStatus: fullComment } as any);
    }

    // ── Log the status update in the follow-up journal ────────────────────
    await storage.createOrderFollowUpLog({
      orderId: order.id, agentId: null, agentName: carrierName,
      note: `📦 Statut transporteur: "${rawText}"${newStatus ? ` → interne: ${newStatus}` : " (non mappé)"}`,
    });

    // ── Dedicated integration_log for every successful webhook update ─────
    // Visible in the Journal tab so users can audit every carrier sync.
    await storage.createIntegrationLog({
      storeId,
      integrationId: null,
      provider: carrierName,
      action: 'status_update',
      status: 'success',
      message: `✅ Commande #${(order as any).orderNumber || order.id} → "${rawText}" (statut interne: ${newStatus}) [${matchedBy}]`,
      payload: JSON.stringify({ orderId: order.id, rawText, newStatus, matchedBy }),
    });

    // ── Broadcast real-time update to the store (SSE → frontend refresh) ──
    console.log(`[WEBHOOK-SUCCESS]: Updated Order ID ${order.id} (${(order as any).orderNumber}) → status="${newStatus}" commentStatus="${rawText}" — matched by: ${matchedBy}`);
    broadcastToStore((order as any).storeId ?? storeId, "order_updated", {
      orderId: order.id,
      status: newStatus,
      commentStatus: rawText,
    });

    return { tracked: true, orderId: order.id, newStatus: newStatus || undefined, matchedBy };
  }

  // ── Permanent webhook URL: /api/webhooks/carrier/:storeId/:carrierName ─────
  // This URL never changes — based on storeId (permanent) + carrier name.
  // Use this in your carrier's webhook settings instead of the token-based URL.
  // Accept all HTTP methods — Digylog uses PUT, others use POST:
  app.all("/api/webhooks/carrier/:storeId/:carrierName", async (req, res) => {
    // ── STEP 0: Log every hit immediately — even before validation ────────
    console.log('--- INCOMING WEBHOOK DATA ---');
    console.log(JSON.stringify(req.body, null, 2));
    console.log(`[DEBUG-WEBHOOK]: Params — storeId=${req.params.storeId} carrier=${req.params.carrierName}`);

    const storeId     = Number(req.params.storeId);
    const carrierName = req.params.carrierName.toLowerCase();

    // ── Webhook auth (P0-7) ─────────────────────────────────────────────────
    // For carriers that support a webhook token (Ameex), require it to be
    // passed via X-Webhook-Token header OR ?token=… query param, and verify
    // it against the store's active carrier_account.webhookToken row. This
    // closes the route-shadowing gap where unauthenticated POSTs to this
    // generic URL would otherwise reach processCarrierWebhook.
    //
    // Other carriers (Digylog, etc.) currently don't expose a webhook
    // secret at the carrier side, so we skip the header check for them
    // and rely on the existing storeId+carrier-account validation below.
    // TODO: extend this check to all carriers once each one supports a
    // configurable webhook token at the carrier side.
    const TOKENED_CARRIERS = new Set(["ameex"]);
    if (TOKENED_CARRIERS.has(carrierName)) {
      const headerToken = (req.header("x-webhook-token") || "").trim();
      const queryToken  = (typeof req.query.token === "string" ? req.query.token : "").trim();
      const provided    = headerToken || queryToken;
      if (!provided || provided.length < 18) {
        console.warn(`[CARRIER-WEBHOOK-SEC] ${carrierName} store=${storeId} missing/short token — rejected`);
        return res.status(401).json({ message: "Webhook token required" });
      }
      try {
        const [validAcct] = await db
          .select()
          .from(carrierAccounts)
          .where(and(
            eq(carrierAccounts.storeId, storeId),
            eq(carrierAccounts.carrierName, carrierName),
            eq(carrierAccounts.webhookToken, provided),
            eq(carrierAccounts.isActive, 1),
          ));
        if (!validAcct) {
          console.warn(`[CARRIER-WEBHOOK-SEC] ${carrierName} store=${storeId} invalid token — rejected`);
          return res.status(401).json({ message: "Invalid webhook token" });
        }
      } catch (lookupErr) {
        console.error("[CARRIER-WEBHOOK-SEC] token lookup failed:", lookupErr);
        return res.status(500).json({ message: "Webhook auth error" });
      }
    }

    // Ping log — written even if the rest fails, so it appears in the Logs tab
    if (storeId && !isNaN(storeId)) {
      storage.createIntegrationLog({
        storeId, integrationId: null, provider: carrierName || 'carrier',
        action: 'webhook_ping', status: 'success',
        message: `📡 Ping reçu sur l'URL permanente — carrier: ${carrierName}`,
        payload: JSON.stringify(req.body).slice(0, 500),
      }).catch(e => console.error("[Webhook:ping-log]", e));
    }

    try {
      if (!storeId || isNaN(storeId)) return res.status(400).json({ message: "storeId invalide" });

      const { db } = await import("./db");
      const { carrierAccounts: tbl } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const rows = await db.select().from(tbl).where(
        and(eq(tbl.storeId, storeId), eq(tbl.isActive, 1))
      );
      const account = rows.find(r => r.carrierName.toLowerCase() === carrierName)
        || rows.find(r => r.isDefault === 1)
        || rows[0];

      if (!account) {
        console.warn(`[DEBUG-WEBHOOK]: No carrier account found for storeId=${storeId} carrier=${carrierName}`);
        await storage.createIntegrationLog({
          storeId, integrationId: null, provider: carrierName,
          action: 'webhook_ping', status: 'fail',
          message: `⚠️ Aucun compte transporteur actif trouvé pour ce magasin (carrier: ${carrierName})`,
          payload: JSON.stringify(req.body).slice(0, 1000),
        });
        return res.status(404).json({ message: "Aucun compte transporteur trouvé pour ce magasin" });
      }

      const body = req.body;
      const rawStatus = (body.status || body.etat || body.statut || body.etat_libelle || "").trim();

      let result: { tracked: boolean; orderId?: number; newStatus?: string; matchedBy?: string };
      try {
        result = await processCarrierWebhook(storeId, account.carrierName, body);
      } catch (procErr: any) {
        console.error("[DEBUG-WEBHOOK]: processCarrierWebhook threw:", procErr);
        await storage.createIntegrationLog({
          storeId, integrationId: null, provider: account.carrierName,
          action: 'webhook_received', status: 'fail',
          message: `❌ Erreur traitement webhook — ${procErr?.message || procErr}`,
          payload: JSON.stringify(body).slice(0, 1000),
        });
        return res.status(500).json({ message: "Erreur traitement webhook", error: procErr?.message });
      }

      await storage.createIntegrationLog({
        storeId, integrationId: null, provider: account.carrierName,
        action: 'webhook_received', status: result.tracked ? 'success' : 'fail',
        message: result.tracked
          ? `✅ Commande #${result.orderId} mise à jour via ${result.matchedBy} — statut: "${rawStatus}" → ${result.newStatus || 'commentStatus uniquement'}`
          : `⚠️ Webhook reçu mais aucune commande trouvée — statut: "${rawStatus}"`,
        payload: JSON.stringify(body).slice(0, 1000),
      });

      res.json({ received: true, tracked: result.tracked });
    } catch (err: any) {
      console.error("[Webhook:carrier:permanent]", err);
      res.status(500).json({ message: "Erreur webhook" });
    }
  });

  // Webhook endpoint keyed to the unique webhookToken per account
  app.post("/api/webhook/carrier/:token", async (req, res) => {
    // ── STEP 0: Log every hit immediately — even before validation ────────
    console.log(`[DEBUG-WEBHOOK]: Incoming payload from carrier (token URL):`, req.body);
    console.log(`[DEBUG-WEBHOOK]: Token param = ${req.params.token}`);

    try {
      const token = req.params.token;
      const { db } = await import("./db");
      const { carrierAccounts: tbl } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [account] = await db.select().from(tbl).where(eq(tbl.webhookToken, token));

      if (!account) {
        console.warn(`[DEBUG-WEBHOOK]: Token not found: ${token}`);
        return res.status(404).json({ message: "Webhook token invalide" });
      }

      // Ping log — written immediately after account is identified
      await storage.createIntegrationLog({
        storeId: account.storeId, integrationId: null, provider: account.carrierName,
        action: 'webhook_ping', status: 'success',
        message: `📡 Ping reçu via token — carrier: ${account.carrierName}`,
        payload: JSON.stringify(req.body).slice(0, 1000),
      });

      const body = req.body;
      const rawStatus = (body.status || body.etat || body.statut || body.etat_libelle || "").trim();

      let result: { tracked: boolean; orderId?: number; newStatus?: string; matchedBy?: string };
      try {
        result = await processCarrierWebhook(account.storeId, account.carrierName, body);
      } catch (procErr: any) {
        console.error("[DEBUG-WEBHOOK]: processCarrierWebhook threw:", procErr);
        await storage.createIntegrationLog({
          storeId: account.storeId, integrationId: null, provider: account.carrierName,
          action: 'webhook_received', status: 'fail',
          message: `❌ Erreur traitement webhook — ${procErr?.message || procErr}`,
          payload: JSON.stringify(body).slice(0, 1000),
        });
        return res.status(500).json({ message: "Erreur traitement webhook", error: procErr?.message });
      }

      await storage.createIntegrationLog({
        storeId: account.storeId, integrationId: null, provider: account.carrierName,
        action: 'webhook_received', status: result.tracked ? 'success' : 'fail',
        message: result.tracked
          ? `✅ Commande #${result.orderId} mise à jour via ${result.matchedBy} — statut: "${rawStatus}" → ${result.newStatus || 'commentStatus uniquement'}`
          : `⚠️ Webhook reçu mais aucune commande trouvée — statut: "${rawStatus}"`,
        payload: JSON.stringify(body).slice(0, 1000),
      });

      res.json({ received: true, tracked: result.tracked });
    } catch (err: any) {
      console.error("[Webhook:carrier]", err);
      res.status(500).json({ message: "Erreur webhook" });
    }
  });

  // ============================================================
  // INTEGRATION LOGS
  // ============================================================
  app.get("/api/integration-logs", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    res.json(await storage.getIntegrationLogs(storeId, limit));
  });

  // ============================================================
  // UNIFIED WEBHOOK ENDPOINT
  // ============================================================
  app.post("/api/integrations/webhook/:provider", async (req, res) => {
    const provider = req.params.provider;
    const storeId = req.query.store_id ? Number(req.query.store_id) : null;

    if (!storeId) {
      return res.status(400).json({ message: "store_id query param required" });
    }

    try {
      const store = await storage.getStore(storeId);
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }

      const integration = await storage.getIntegrationByProvider(storeId, provider);
      if (integration) {
        const creds = JSON.parse(integration.credentials || '{}');

        const rawBody = (req as any).rawBody as Buffer | undefined;
        if (provider === 'shopify' && creds.webhookSecret) {
          const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string | undefined;
          if (hmacHeader && rawBody) {
            const computed = createHmac('sha256', creds.webhookSecret)
              .update(rawBody)
              .digest('base64');
            if (computed !== hmacHeader) {
              await storage.createIntegrationLog({
                storeId, integrationId: integration.id, provider,
                action: 'webhook_received', status: 'fail',
                message: 'Signature HMAC invalide',
              });
              return res.status(401).json({ message: "Invalid HMAC signature" });
            }
          }
        }

        if (provider === 'youcan' && creds.webhookSecret) {
          const signatureHeader = req.headers['x-youcan-signature'] as string | undefined;
          if (signatureHeader && rawBody) {
            const computed = createHmac('sha256', creds.webhookSecret)
              .update(rawBody)
              .digest('hex');
            if (computed !== signatureHeader) {
              await storage.createIntegrationLog({
                storeId, integrationId: integration.id, provider,
                action: 'webhook_received', status: 'fail',
                message: 'Signature YouCan invalide',
              });
              return res.status(401).json({ message: "Invalid YouCan signature" });
            }
          }
        }
      }

      const payload = req.body;
      if (!payload || (!payload.id && !payload.ref)) {
        await storage.createIntegrationLog({
          storeId, integrationId: integration?.id || null, provider,
          action: 'webhook_received', status: 'fail',
          message: 'Payload invalide — pas d\'id ou ref',
          payload: JSON.stringify(payload).slice(0, 2000),
        });
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      const parsed = parseWebhookOrder(provider, payload);

      const existingOrder = await storage.getOrderByNumber(storeId, parsed.orderNumber);
      if (existingOrder) {
        await storage.createIntegrationLog({
          storeId, integrationId: integration?.id || null, provider,
          action: 'webhook_received', status: 'success',
          message: `Commande ${parsed.orderNumber} déjà importée, ignorée`,
        });
        return res.json({ success: true, orderId: existingOrder.id, duplicate: true });
      }

      const storeProducts = await storage.getProductsByStore(storeId);
      let productCost = 0;
      const orderItemsToCreate: { productId: number | null; quantity: number; price: number; rawProductName: string; sku: string; variantInfo: string }[] = [];

      for (const item of parsed.lineItems) {
        const matchedProduct = storeProducts.find(
          p => (item.sku && p.sku === item.sku) || p.name === item.title
        );
        orderItemsToCreate.push({
          productId: matchedProduct?.id ?? null,
          quantity: item.quantity,
          price: item.price,
          rawProductName: item.title,
          sku: item.sku || '',
          variantInfo: (item as any).variantInfo || '',
        });
        if (matchedProduct) productCost += matchedProduct.costPrice * item.quantity;
      }

      const paywallCheck = await storage.checkPaywall(storeId);
      if (paywallCheck.isBlocked) {
        await storage.createIntegrationLog({
          storeId, integrationId: integration?.id || null, provider,
          action: 'order_synced', status: 'fail',
          message: paywallCheck.reason === 'expired'
            ? `Abonnement expiré. Commande ${parsed.orderNumber} refusée.`
            : `Limite de commandes atteinte (${paywallCheck.current}/${paywallCheck.limit}). Commande ${parsed.orderNumber} refusée.`,
        });
        return res.status(402).json({ message: paywallCheck.reason === 'expired' ? "Subscription expired" : "Order limit reached" });
      }

      const rawProductName = parsed.lineItems.length > 0
        ? parsed.lineItems.map((li: any) => {
            const v = (li.variantInfo || '').trim();
            return v ? `${li.title} - ${v}` : li.title;
          }).filter(Boolean).join(' + ')
        : null;
      const variantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const rawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;

      const mediaBuyer = parsed.buyerCode ? await storage.getMediaBuyerByCode(storeId, parsed.buyerCode) : null;
      console.log(`[Attribution] Order=${parsed.orderNumber} UTM="${parsed.utmSource}" → Code=${parsed.buyerCode || 'none'} Platform=${parsed.trafficPlatform || 'none'} → Buyer=${mediaBuyer ? mediaBuyer.username + ' (#' + mediaBuyer.id + ')' : 'NOT FOUND'}`);

      const webhookMagasinId = integration?.magasinId ?? null;
      const order = await storage.createOrder({
        storeId,
        magasinId: webhookMagasinId,
        orderNumber: parsed.orderNumber,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity,
        status: 'nouveau',
        totalPrice: parsed.totalPrice,
        productCost,
        shippingCost: 0,
        adSpend: 0,
        source: provider,
        comment: parsed.comment,
        rawProductName,
        variantDetails,
        rawQuantity,
        utmSource: parsed.utmSource || null,
        utmCampaign: parsed.utmCampaign || null,
        trafficPlatform: parsed.trafficPlatform || null,
        mediaBuyerId: mediaBuyer?.id || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })) as any);

      const firstProductId = orderItemsToCreate.find(i => i.productId)?.productId ?? undefined;
      const nextAgentId = await storage.getNextAgent(storeId, webhookMagasinId, firstProductId, parsed.customerCity);
      if (nextAgentId) {
        await storage.assignOrder(order.id, nextAgentId);
      }

      await storage.incrementMonthlyOrders(storeId);

      await storage.createIntegrationLog({
        storeId, integrationId: integration?.id || null, provider,
        action: 'order_synced', status: 'success',
        message: `Commande ${parsed.orderNumber} importée${nextAgentId ? ` (assignée à agent #${nextAgentId})` : ''} (${parsed.lineItems.length} articles, ${orderItemsToCreate.length} matchés)`,
      });

      // Real-time: push new order to all connected store clients
      emitNewOrder(storeId, { id: order.id, orderNumber: parsed.orderNumber, customerName: parsed.customerName, status: 'nouveau', source: provider });
      broadcastToStore(storeId, "new_order", { id: order.id, orderNumber: parsed.orderNumber });
      pushOrderToSheet(storeId, {
        action: "order.created",
        orderNumber: parsed.orderNumber || "",
        customerName: parsed.customerName || "",
        customerPhone: parsed.customerPhone || "",
        customerAddress: parsed.customerAddress || "",
        customerCity: parsed.customerCity || "",
        productName: (order as any).rawProductName || "",
        totalPrice: order.totalPrice || 0,
        quantity: 1,
        note: order.comment || null,
        status: order.status || "nouveau",
        utmSource: (order as any).utmSource || null,
        utmCampaign: (order as any).utmCampaign || null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "N/A",
      }).catch(() => {});

      res.json({ success: true, orderId: order.id, assignedTo: nextAgentId });
    } catch (err: any) {
      console.error(`Webhook error (${provider}):`, err);
      await storage.createIntegrationLog({
        storeId: storeId!, integrationId: null, provider,
        action: 'webhook_received', status: 'fail',
        message: err.message || 'Erreur interne webhook',
        payload: JSON.stringify(req.body).slice(0, 2000),
      });
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Universal webhook via token URL: POST /api/webhooks/:provider/order/:webhookKey
  app.post("/api/webhooks/:provider/order/:webhookKey", async (req, res) => {
    const provider = req.params.provider;
    const webhookKey = req.params.webhookKey;
    const magasinId = req.query.magasin_id ? Number(req.query.magasin_id) : undefined;
    // ── Webhook key sanity check ──────────────────────────────────────────
    // Reject obviously-short keys before doing any DB lookup. New keys are
    // 64 chars; the legacy minimum is 12 chars. Anything shorter is junk.
    if (!webhookKey || webhookKey.length < 12) {
      console.warn(`[WEBHOOK-SEC] ${provider} webhook with short/missing key — rejected`);
      return res.status(401).json({ message: "Invalid webhook key" });
    }
    try {
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) {
        console.warn(`[WEBHOOK-SEC] ${provider} unknown webhook key: ${webhookKey.slice(0, 8)}…`);
        return res.status(404).json({ message: "Invalid webhook key" });
      }
      const storeId = store.id;

      const payload = req.body;
      const parsed = parseWebhookOrder(provider, payload);
      if (!parsed.orderNumber) {
        await storage.createIntegrationLog({ storeId, integrationId: null, provider, action: 'webhook_received', status: 'fail', message: 'Payload invalide — numéro de commande manquant', payload: JSON.stringify(payload).slice(0, 2000) });
        return res.status(400).json({ message: "Invalid payload" });
      }

      const existingOrder = await storage.getOrderByNumber(storeId, parsed.orderNumber);
      if (existingOrder) {
        return res.json({ success: true, orderId: existingOrder.id, duplicate: true });
      }

      const webhookPaywall = await storage.checkPaywall(storeId);
      if (webhookPaywall.isBlocked) return res.status(402).json({ message: webhookPaywall.reason === 'expired' ? "Subscription expired" : "Order limit reached" });

      const storeProducts = await storage.getProductsByStore(storeId);
      let productCost = 0;
      // FIX (upsells): persist EVERY line item, including unmatched upsells.
      const orderItemsToCreate: { productId: number | null; quantity: number; price: number; rawProductName: string; sku: string; variantInfo: string }[] = [];
      for (const item of parsed.lineItems) {
        const matched = storeProducts.find(p => (item.sku && p.sku === item.sku) || p.name === item.title);
        orderItemsToCreate.push({
          productId: matched?.id ?? null,
          quantity: item.quantity,
          price: item.price,
          rawProductName: item.title,
          sku: item.sku || '',
          variantInfo: (item as any).variantInfo || '',
        });
        if (matched) productCost += matched.costPrice * item.quantity;
      }
      console.log(`[TOKEN-WEBHOOK ${provider}] orderItemsToCreate.length=${orderItemsToCreate.length} — matched=${orderItemsToCreate.filter(i => i.productId).length}/${parsed.lineItems.length}`);

      const rawProductName = parsed.lineItems.length > 0
        ? parsed.lineItems.map((li: any) => {
            const v = (li.variantInfo || '').trim();
            return v ? `${li.title} - ${v}` : li.title;
          }).filter(Boolean).join(' + ')
        : null;
      const variantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const rawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;

      const mediaBuyerToken = parsed.buyerCode ? await storage.getMediaBuyerByCode(storeId, parsed.buyerCode) : null;
      console.log(`[Attribution] Order=${parsed.orderNumber} UTM="${parsed.utmSource}" → Code=${parsed.buyerCode || 'none'} Platform=${parsed.trafficPlatform || 'none'} → Buyer=${mediaBuyerToken ? mediaBuyerToken.username + ' (#' + mediaBuyerToken.id + ')' : 'NOT FOUND'}`);

      console.log("━━━ NEW WEBHOOK ARRIVED ━━━");
      console.log(`[Webhook] Provider: ${provider} | Order: ${parsed.orderNumber} | Store: ${storeId}`);
      console.log(`[Webhook] Customer: ${parsed.customerName} | Phone: ${parsed.customerPhone}`);
      console.log(`[Webhook] Product: ${parsed.lineItems.map((li: any) => li.title).join(', ') || 'N/A'} | City: ${parsed.customerCity}`);

      // ── Auto-match city against active carrier's city list ────────────────
      let resolvedCity = parsed.customerCity || "";
      try {
        const shippingIntegrations = await storage.getIntegrationsByStore(storeId, "shipping");
        const activeCarrier = shippingIntegrations.find(i => i.isActive === 1) || shippingIntegrations[0];
        if (activeCarrier && resolvedCity) {
          const carrierCreds = JSON.parse(activeCarrier.credentials || "{}");
          const cityList: string[] = Array.isArray(carrierCreds.cityList) && carrierCreds.cityList.length > 0
            ? carrierCreds.cityList
            : getDefaultCitiesForProvider(activeCarrier.provider);
          const matched = autoMatchCity(resolvedCity, cityList);
          if (matched && matched !== resolvedCity) {
            console.log(`[CityMatch] "${resolvedCity}" → "${matched}" (carrier: ${activeCarrier.provider})`);
            resolvedCity = matched;
          } else if (!matched) {
            console.warn(`[CityMatch] No match found for "${resolvedCity}" in ${activeCarrier.provider} city list`);
          }
        }
      } catch (cityErr: any) {
        console.warn("[CityMatch] Auto-match skipped:", cityErr.message);
      }

      const tokenMagasinId = magasinId ?? null;
      const order = await storage.createOrder({
        storeId, magasinId: tokenMagasinId,
        orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: resolvedCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: provider, comment: parsed.comment,
        rawProductName, variantDetails, rawQuantity,
        utmSource: parsed.utmSource || null, utmCampaign: parsed.utmCampaign || null,
        trafficPlatform: parsed.trafficPlatform || null,
        mediaBuyerId: mediaBuyerToken?.id || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
      const nextAgentId = await storage.getNextAgent(storeId, tokenMagasinId, firstProductId, resolvedCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);

      await storage.incrementMonthlyOrders(storeId);

      const integration = await storage.getIntegrationByProvider(storeId, provider, magasinId);
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider, action: 'order_synced', status: 'success', message: `Commande ${parsed.orderNumber} importée via token webhook` });

      // ── Real-time push — Socket.io + SSE ─────────────────────────────────────
      emitNewOrder(storeId, { id: order.id, orderNumber: parsed.orderNumber, customerName: parsed.customerName, status: 'nouveau', source: provider });
      broadcastToStore(storeId, "new_order", { id: order.id, orderNumber: parsed.orderNumber });
      pushOrderToSheet(storeId, {
        action: "order.created",
        orderNumber: parsed.orderNumber || "",
        customerName: parsed.customerName || "",
        customerPhone: parsed.customerPhone || "",
        customerAddress: parsed.customerAddress || "",
        customerCity: parsed.customerCity || "",
        productName: (order as any).rawProductName || "",
        totalPrice: order.totalPrice || 0,
        quantity: 1,
        note: order.comment || null,
        status: order.status || "nouveau",
        utmSource: (order as any).utmSource || null,
        utmCampaign: (order as any).utmCampaign || null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "N/A",
      }).catch(() => {});
      console.log(`[WEBHOOK SUCCESS]: Order #${parsed.orderNumber} saved for Store ID: ${storeId} (orderId: ${order.id})`);

      res.json({ success: true, orderId: order.id });

      // ── Fire-and-forget: AI WhatsApp confirmation ──────────────
      console.log(`[Webhook] Order ${order.id} created → checking AI settings for store ${storeId}...`);
      console.log(`[Webhook] Attempting WhatsApp AI trigger for: ${parsed.customerPhone}`);
      const { getBaileysInstance } = await import("./baileys-service");
      const waState = getBaileysInstance(storeId).getStatus();
      console.log(`[WhatsApp:${storeId}] Socket status: ${waState.state} | Phone: ${waState.phone || 'N/A'}`);
      if (waState.state !== "connected") {
        console.warn(`[WhatsApp:${storeId}] ⚠️ Not connected (state=${waState.state}) — AI message will be queued`);
      }
      if (getWaAutoSettings(storeId).aiConfirmation) {
        triggerAIForNewOrder(storeId, order.id, parsed.customerPhone, parsed.customerName, firstProductId)
          .catch(err => console.error(`[AI] Trigger failed for order ${order.id}:`, err.message));
      } else {
        console.log('[WA] AI confirmation disabled — skipping auto-send');
      }
    } catch (err: any) {
      console.error(`Token webhook error (${provider}):`, err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Google Sheets webhook
  app.post("/api/webhooks/gsheets/:webhookKey", async (req, res) => {
    const webhookKey = req.params.webhookKey;
    if (!webhookKey || webhookKey.length < 12) {
      console.warn("[WEBHOOK-SEC] gsheets webhook with short/missing key — rejected");
      return res.status(401).json({ message: "Invalid webhook key" });
    }
    try {
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) {
        console.warn(`[WEBHOOK-SEC] gsheets unknown webhook key: ${webhookKey.slice(0, 8)}…`);
        return res.status(404).json({ message: "Invalid webhook key" });
      }
      const storeId = store.id;
      const data = req.body;
      const customerName = data.name || data.customer_name || data['Nom'] || '';
      const customerPhone = data.phone || data.telephone || data['Téléphone'] || '';
      const customerCity = data.city || data.ville || data['Ville'] || '';
      const customerAddress = data.address || data.adresse || data['Adresse'] || '';
      const productName = data.product || data.produit || data['Produit'] || '';
      const totalPrice = Math.round(parseFloat(String(data.price || data.prix || data['Prix'] || '0').replace(',', '.')) * 100) || 0;
      const orderNumber = data.ref || data.order_id || `GS-${Date.now()}`;
      if (!customerName && !customerPhone) return res.status(400).json({ message: "Missing customer data" });
      const existingOrder = await storage.getOrderByNumber(storeId, orderNumber);
      if (existingOrder) return res.json({ success: true, orderId: existingOrder.id, duplicate: true });
      const gsheetsPaywall = await storage.checkPaywall(storeId);
      if (gsheetsPaywall.isBlocked) return res.status(402).json({ message: gsheetsPaywall.reason === 'expired' ? "Subscription expired" : "Order limit reached" });
      const storeProducts = await storage.getProductsByStore(storeId);
      const matched = storeProducts.find(p => p.name === productName || p.sku === productName);
      const orderItems = matched ? [{ productId: matched.id, quantity: 1, price: totalPrice, orderId: 0 }] : [];
      console.log("━━━ NEW WEBHOOK ARRIVED (GSheets) ━━━");
      console.log(`[Webhook] Customer: ${customerName} | Phone: ${customerPhone} | Product: ${productName}`);
      const integration = await storage.getIntegrationByProvider(storeId, 'gsheets');
      const gsheetsMagasinId = integration?.magasinId ?? null;
      const order = await storage.createOrder({
        storeId, magasinId: gsheetsMagasinId,
        orderNumber, customerName, customerPhone, customerAddress, customerCity,
        status: 'nouveau', totalPrice, productCost: matched ? matched.costPrice : 0,
        shippingCost: 0, adSpend: 0, source: 'gsheets', comment: null,
      } as any, orderItems);
      const nextAgentId = await storage.getNextAgent(storeId, gsheetsMagasinId, matched?.id, customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
      await storage.incrementMonthlyOrders(storeId);
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider: 'gsheets', action: 'order_synced', status: 'success', message: `Commande Google Sheets ${orderNumber} importée` });
      // Real-time push
      emitNewOrder(storeId, { id: order.id, orderNumber, customerName, status: 'nouveau', source: 'gsheets' });
      broadcastToStore(storeId, "new_order", { id: order.id, orderNumber });
      pushOrderToSheet(storeId, {
        action: "order.created",
        orderNumber: orderNumber || "",
        customerName: customerName || "",
        customerPhone: customerPhone || "",
        customerAddress: customerAddress || "",
        customerCity: customerCity || "",
        productName: (order as any).rawProductName || "",
        totalPrice: order.totalPrice || 0,
        quantity: 1,
        note: order.comment || null,
        status: "nouveau",
        utmSource: null,
        utmCampaign: null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "N/A",
      }).catch(() => {});
      res.json({ success: true, orderId: order.id });
      // ── Fire-and-forget: AI WhatsApp confirmation ──────────────
      if (getWaAutoSettings(storeId).aiConfirmation) {
        triggerAIForNewOrder(storeId, order.id, customerPhone, customerName, matched?.id)
          .catch(err => console.error(`[AI] GSheets trigger failed for order ${order.id}:`, err.message));
      } else {
        console.log('[WA] AI confirmation disabled — skipping auto-send');
      }
    } catch (err: any) {
      console.error('GSheets webhook error:', err);
      res.status(500).json({ message: 'Processing failed' });
    }
  });

  // ── Google Sheets: API-key based webhook (new plug-and-play script) ──
  app.post("/api/integrations/google-sheets/webhook", async (req, res) => {
    const apiKey = (req.headers["x-api-key"] || req.body?.apiKey || "").toString().trim();
    if (!apiKey) return res.status(401).json({ success: false, message: "Missing X-Api-Key header" });
    // Reject obviously-short keys before any DB lookup (same threshold
    // as the other webhook routes — see P0-7 in replit.md).
    if (apiKey.length < 12) {
      console.warn("[WEBHOOK-SEC] gsheets API-key webhook with short key — rejected");
      return res.status(401).json({ success: false, message: "Invalid API key" });
    }
    try {
      const store = await storage.getStoreByWebhookKey(apiKey);
      if (!store) {
        console.warn(`[WEBHOOK-SEC] gsheets API-key unknown: ${apiKey.slice(0, 8)}…`);
        return res.status(403).json({ success: false, message: "Invalid API key" });
      }
      const storeId = store.id;
      const data = req.body || {};

      // Test ping from Google Apps Script — confirm credentials work without creating a fake order.
      if (data.test === true) {
        return res.json({ success: true, test: true, message: 'Connection OK', storeName: store.name || `Store ${storeId}` });
      }

      const customerName    = (data.name    || data.nom    || data.customer_name  || data.fullname || "").toString().trim();
      const customerPhone   = (data.phone   || data.telephone || data.customer_phone || "").toString().trim();
      const customerCity    = (data.city    || data.ville   || "").toString().trim();
      const customerAddress = (data.address || data.adresse || "").toString().trim();
      // Use explicit product field, then fall back to tab name (e.g. "cofer", "hachoir")
      const productName     = (data.product || data.produit || data.tab_name || "").toString().trim();
      const quantity        = parseInt(data.quantity || "1") || 1;
      const rawPrice        = parseFloat(String(data.price || data.prix || "0").replace(",", ".")) || 0;
      const totalPrice      = Math.round(rawPrice * 100);
      const orderNumber     = (data.ref || `GS-${Date.now()}`).toString();

      // Optional enrichment fields sent by the smart-detection script
      const gsNote         = (data.note || data.comment || data.commentaire || "").toString().trim() || null;
      const gsOfferName    = (data.offer || data.offre || "").toString().trim() || null;
      const gsUtmSource    = (data.utm_source || data.utmSource || "").toString().trim() || null;
      const gsUtmCampaign  = (data.utm_campaign || data.utmCampaign || "").toString().trim() || null;
      const gsProductId    = (data.product_id || data.productId || "").toString().trim() || null;

      if (!customerName && !customerPhone) {
        return res.status(400).json({ success: false, message: "Missing customer name or phone" });
      }
      const existingOrder = await storage.getOrderByNumber(storeId, orderNumber);
      if (existingOrder) return res.json({ success: true, orderId: existingOrder.id, duplicate: true });
      const paywall = await storage.checkPaywall(storeId);
      if (paywall.isBlocked) return res.status(402).json({ success: false, message: paywall.reason === "expired" ? "Subscription expired" : "Order limit reached" });
      const storeProducts = await storage.getProductsByStore(storeId);
      const matched = storeProducts.find(p => p.name === productName || p.sku === productName);
      const orderItems = matched ? [{ productId: matched.id, quantity, price: matched.sellingPrice || totalPrice, orderId: 0 }] : [];
      const integration = await storage.getIntegrationByProvider(storeId, "gsheets");
      const gsheetsApiMagasinId = integration?.magasinId ?? null;
      // Build comment: note + offer prefix
      const orderComment = gsOfferName
        ? (gsNote ? `[Offre: ${gsOfferName}] ${gsNote}` : `[Offre: ${gsOfferName}]`)
        : (gsNote || null);

      const order = await storage.createOrder({
        storeId, magasinId: gsheetsApiMagasinId,
        orderNumber, customerName, customerPhone, customerAddress, customerCity,
        status: "nouveau", totalPrice, productCost: matched ? matched.costPrice : 0,
        shippingCost: 0, adSpend: 0, source: "gsheets",
        comment: orderComment,
        utmSource: gsUtmSource,
        utmCampaign: gsUtmCampaign,
        ...(gsProductId ? { ameexProductId: gsProductId } : {}),
      } as any, orderItems);
      const nextAgentId = await storage.getNextAgent(storeId, gsheetsApiMagasinId, matched?.id, customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
      await storage.incrementMonthlyOrders(storeId);
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider: "gsheets", action: "order_synced", status: "success", message: `Commande Google Sheets ${orderNumber} importée (API key)` });
      console.log(`[GSheets-API] New order #${orderNumber} for store ${storeId} — ${customerName} / ${customerPhone}`);
      res.json({ success: true, orderId: order.id });
      if (getWaAutoSettings(storeId).aiConfirmation) {
        triggerAIForNewOrder(storeId, order.id, customerPhone, customerName, matched?.id)
          .catch(err => console.error(`[AI] GSheets-API trigger failed for order ${order.id}:`, err.message));
      } else {
        console.log('[WA] AI confirmation disabled — skipping auto-send');
      }
    } catch (err: any) {
      console.error("[GSheets-API] Webhook error:", err);
      res.status(500).json({ success: false, message: "Processing failed" });
    }
  });

  // ─── Google Sheets OAuth flow ──────────────────────────────────────────────

  app.get("/api/integrations/google-sheets/oauth/start", requireAuth, (req, res) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) return res.redirect("/integrations?gsheets_error=not_configured");
    const storeId = req.user!.storeId!;
    const state = `${storeId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (req.session as any).gsheetsOauthState = state;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/integrations/google-sheets/oauth/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/integrations/google-sheets/oauth/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/integrations?gsheets_error=${error}`);
    const sessionState = (req.session as any).gsheetsOauthState;
    if (!state || state !== sessionState) return res.redirect("/integrations?gsheets_error=invalid_state");
    delete (req.session as any).gsheetsOauthState;
    const storeId = parseInt((state as string).split("-")[0]);
    if (isNaN(storeId)) return res.redirect("/integrations?gsheets_error=invalid_state");
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/integrations/google-sheets/oauth/callback`;
    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
          redirect_uri: redirectUri, grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenResp.json() as any;
      if (!tokens.access_token) {
        console.error("[GSHEETS-OAUTH] Token exchange failed:", tokens);
        return res.redirect("/integrations?gsheets_error=token_exchange_failed");
      }
      const oauthData: any = {
        oauthAccessToken:  encrypt(tokens.access_token),
        oauthExpiresAt:    new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        isActive: 1,
      };
      if (tokens.refresh_token) oauthData.oauthRefreshToken = encrypt(tokens.refresh_token);
      const existing = await db.select().from(storeIntegrations)
        .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
        .limit(1);
      if (existing.length > 0) {
        await db.update(storeIntegrations).set(oauthData).where(eq(storeIntegrations.id, existing[0].id));
      } else {
        const webhookKey = await storage.getOrGenerateWebhookKey(storeId);
        await db.insert(storeIntegrations).values({
          storeId, provider: "gsheets", type: "webhook", credentials: "{}", webhookKey, ...oauthData,
        });
      }
      res.redirect("/integrations?gsheets=connected");
    } catch (err: any) {
      console.error("[GSHEETS-OAUTH] Error:", err.message);
      res.redirect("/integrations?gsheets_error=server_error");
    }
  });

  app.get("/api/integrations/google-sheets/status", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const rows = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
      .limit(1);
    const row = rows[0];
    const gsheetUrl = row?.gsheetUrl ?? null;
    const connected = !!(gsheetUrl && row?.status !== "inactive");
    res.json({
      connected,
      oauthConnected:  !!(row?.oauthAccessToken),
      sheetUrl:        gsheetUrl,
      tabs:            row?.gsheetTabs ?? [],
      syncState:       row?.gsheetSyncState ?? {},
      lastSyncAt:      row?.lastSyncAt,
      spreadsheetId:   row?.spreadsheetId,
      spreadsheetName: row?.spreadsheetName,
      syncTabs:        row?.syncTabs || "all",
      magasinId:       row?.magasinId ?? null,
      columnMapping:   (row as any)?.gsheetColumnMapping ?? null,
      webhookUrl:      (row as any)?.gsheetWebhookUrl ?? null,
    });
  });

  app.get("/api/integrations/gsheets/apps-script", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const apiKey  = await storage.getOrGenerateWebhookKey(storeId);
    const apiUrl  = `${req.protocol}://${req.get("host")}/api/integrations/google-sheets/webhook`;

    const script = `// ════════════════════════════════════════════════════════════════
//  TajerGrow Apps Script — Elementor → Google Sheet + Platform
//  Coller ce code COMPLET dans Apps Script puis Deploy
// ════════════════════════════════════════════════════════════════

// ⚙️ CONFIGURATION
var API_URL = '${apiUrl}';
var API_KEY = '${apiKey}';

var DEBOUNCE_SECONDS    = 30;
var STATUS_COLUMN_LABEL = 'TajerGrow Status';
var DEFAULT_SHEET_NAME  = 'Commandes';

// Synonymes de colonnes — 12 champs reconnus
var COLUMN_ALIASES = {
  name: [
    'nom', 'nom client', 'nom du client', 'nom complet', 'client',
    'fullname', 'full name', 'name', 'customer', 'customer name',
    'destinataire', 'recipient', 'الاسم', 'اسم العميل'
  ],
  phone: [
    'téléphone', 'telephone', 'tel', 'mobile', 'gsm', 'whatsapp',
    'phone', 'numéro', 'numero', 'numéro de téléphone', 'tele',
    'رقم الهاتف', 'هاتف'
  ],
  address: ['adresse', 'address', 'rue', 'street', 'العنوان', 'votre adresse'],
  city:    ['ville', 'city', 'town', 'localité', 'المدينة', 'votre ville'],
  product: ['produit', 'product', 'article', 'item', 'المنتج', 'nom du produit'],
  price:   ['prix', 'price', 'montant', 'amount', 'total', 'tarif', 'السعر'],
  quantity:['quantité', 'quantity', 'qty', 'qté', 'nombre', 'الكمية'],
  note:    ['note', 'notes', 'commentaire', 'comment', 'message', 'remarque', 'ملاحظة'],
  utm_source:   ['utm_source', 'source', 'origine', 'utm source'],
  utm_campaign: ['utm_campaign', 'campaign', 'campagne', 'utm campaign'],
  product_id:   ['product_id', 'productid', 'sku', 'reference', 'ameex_product_id'],
  offer:        ['offre', 'offer', 'pack', 'formule', 'option'],
};

var COLUMN_ORDER = [
  'name', 'phone', 'address', 'city', 'product', 'price', 'quantity',
  'note', 'submission_date', 'source_url',
  'utm_campaign', 'utm_source', 'product_id', 'platform_status'
];

var COLUMN_LABELS = {
  name: 'Nom', phone: 'Téléphone', address: 'Adresse', city: 'Ville',
  product: 'Produit', price: 'Prix (DH)', quantity: 'Quantité', note: 'Note',
  submission_date: 'Date', source_url: 'Source URL',
  utm_campaign: 'UTM Campaign', utm_source: 'UTM Source',
  product_id: 'Product ID', platform_status: 'TajerGrow Status',
};

function doGet(e) {
  return HtmlService.createHtmlOutput('✅ TajerGrow webhook actif.');
}

function doPost(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var unwrapped = {};
    for (var key in params) {
      var match = key.match(/^form_fields\\[([^\\]]+)\\]$/);
      unwrapped[match ? match[1] : key] = params[key];
    }
    var normalized = normalizeFields(unwrapped);
    normalized.submission_date = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' });
    normalized.source_url = params.source_url || params.referrer || params.page_url || 'N/A';

    var formName = params.form_name || params.formName || DEFAULT_SHEET_NAME;
    var sheet    = getOrCreateSheet(formName);
    ensureHeaders(sheet);
    normalized.platform_status = '⏳ En cours...';
    var row = COLUMN_ORDER.map(function(k) { return normalized[k] || ''; });
    sheet.appendRow(row);
    var newRowIndex  = sheet.getLastRow();
    var statusColIdx = COLUMN_ORDER.indexOf('platform_status') + 1;

    var result = sendToTajerGrow(normalized, params);

    if (result.success) {
      sheet.getRange(newRowIndex, statusColIdx)
        .setValue('✅ Créée #' + (result.orderId || ''))
        .setBackground('#d4edda').setFontColor('#155724').setFontWeight('bold');
    } else {
      sheet.getRange(newRowIndex, statusColIdx)
        .setValue('❌ ' + (result.error || 'Erreur'))
        .setBackground('#f8d7da').setFontColor('#721c24').setFontWeight('bold');
    }
  } catch (err) {
    Logger.log('ERREUR: ' + err.toString());
  }
  return HtmlService.createHtmlOutput('Submission received successfully.');
}

function sendToTajerGrow(data, rawParams) {
  var payload = {
    name: data.name || '', phone: data.phone || '',
    address: data.address || '', city: data.city || '',
    product: data.product || '', price: data.price || '0',
    quantity: data.quantity || '1', note: data.note || '',
    offer: data.offer || '',
    utm_source: data.utm_source || rawParams.utm_source || '',
    utm_campaign: data.utm_campaign || rawParams.utm_campaign || '',
    product_id: data.product_id || '',
    ref: 'GS-' + new Date().getTime(),
  };
  try {
    var response = UrlFetchApp.fetch(API_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Api-Key': API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, followRedirects: true,
    });
    var code = response.getResponseCode();
    var text = response.getContentText();
    Logger.log('[PLATFORM] HTTP ' + code + ': ' + text);
    if (code === 200 || code === 201) {
      try {
        var json = JSON.parse(text);
        return json.success
          ? { success: true, orderId: json.orderId || '' }
          : { success: false, error: json.message || 'Erreur' };
      } catch (_) { return { success: true, orderId: '' }; }
    }
    if (code === 402) return { success: false, error: 'Limite atteinte' };
    if (code === 401) return { success: false, error: 'Clé invalide' };
    if (code === 400) return { success: false, error: 'Données manquantes' };
    return { success: false, error: 'HTTP ' + code };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function testConnection() {
  var response = UrlFetchApp.fetch(API_URL, {
    method: 'post', contentType: 'application/json',
    headers: { 'X-Api-Key': API_KEY },
    payload: JSON.stringify({ test: true }),
    muteHttpExceptions: true,
  });
  Logger.log('Test HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
}

function normalizeFields(rawParams) {
  var aliasMap = {};
  for (var field in COLUMN_ALIASES) {
    var aliases = COLUMN_ALIASES[field];
    for (var i = 0; i < aliases.length; i++) {
      aliasMap[nk(aliases[i])] = field;
    }
  }
  var result = {};
  for (var rawKey in rawParams) {
    var val = rawParams[rawKey];
    if (!val || String(val).trim() === '') continue;
    var canonical = aliasMap[nk(rawKey)];
    if (canonical && !result[canonical]) result[canonical] = String(val).trim();
  }
  return result;
}

function nk(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getOrCreateSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureHeaders(sheet) {
  var lastCol  = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var headers  = COLUMN_ORDER.map(function(k) { return COLUMN_LABELS[k]; });
  var same = headers.length === existing.length &&
    headers.every(function(h, i) { return h === existing[i]; });
  if (same) return;
  var r = sheet.getRange(1, 1, 1, headers.length);
  r.setValues([headers]).setFontWeight('bold')
   .setBackground('#1E1B4B').setFontColor('#C5A059');
  sheet.setFrozenRows(1);
  for (var c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
}`;

    res.json({ script, apiUrl, apiKey });
  });

  app.get("/api/integrations/google-sheets/debug", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const all = await db.select({
      id: storeIntegrations.id,
      status: storeIntegrations.status,
      gsheetUrl: (storeIntegrations as any).gsheetUrl,
      gsheetId: (storeIntegrations as any).gsheetId,
      webhookUrl: (storeIntegrations as any).gsheetWebhookUrl,
    }).from(storeIntegrations)
      .where(and(
        eq(storeIntegrations.storeId, storeId),
        eq(storeIntegrations.provider, "gsheets"),
      ));
    res.json(all);
  });

  app.get("/api/integrations/google-sheets/spreadsheets", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const rows = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
      .limit(1);
    const conn = rows[0];
    if (!conn?.oauthAccessToken) return res.status(400).json({ error: "not_connected" });
    try {
      const accessToken = await getValidAccessToken(conn);
      const driveResp = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await driveResp.json() as any;
      res.json({ spreadsheets: data.files || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/integrations/google-sheets/select", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const { spreadsheetId, spreadsheetName, syncTabs } = req.body;
    if (!spreadsheetId) return res.status(400).json({ error: "spreadsheetId required" });
    const rows = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
      .limit(1);
    const conn = rows[0];
    if (!conn?.oauthAccessToken) return res.status(400).json({ error: "not_connected" });
    try {
      const accessToken = await getValidAccessToken(conn);
      const metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const meta = await metaResp.json() as any;
      const initState: Record<string, number> = {};
      for (const s of (meta.sheets || [])) {
        initState[`tab_${s.properties.sheetId}`] = s.properties.gridProperties?.rowCount || 0;
      }
      await db.update(storeIntegrations).set({
        spreadsheetId, spreadsheetName: spreadsheetName || spreadsheetId,
        syncTabs: syncTabs || "all", lastSyncState: initState as any, lastSyncAt: null,
      }).where(eq(storeIntegrations.id, conn.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/integrations/google-sheets/disconnect", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    await db.update(storeIntegrations).set({
      oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null,
      spreadsheetId: null, spreadsheetName: null, syncTabs: null,
      lastSyncState: null, lastSyncAt: null,
    }).where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")));
    res.json({ ok: true });
  });

  // ── Google Sheets: public URL helpers ────────────────────────────────────

  function extractSheetId(url: string): string | null {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  async function fetchPublicSheetTabs(sheetId: string): Promise<Array<{ gid: string; title: string }>> {
    const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
    const resp = await fetch(htmlUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`Sheet not accessible — verify it's set to 'Anyone with the link can view'`);
    const html = await resp.text();

    const tabs: Array<{ gid: string; title: string }> = [];

    const re1 = /(?:name|title)["']?\s*:\s*["']([^"']+)["']\s*,\s*(?:sheetId|gid)["']?\s*:\s*["']?(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = re1.exec(html)) !== null) {
      if (!tabs.find(t => t.gid === match![2])) {
        tabs.push({ title: match[1], gid: match[2] });
      }
    }

    if (tabs.length === 0) {
      const linkRe = /<a[^>]+id=["']sheet-button-(\d+)["'][^>]*>([^<]+)<\/a>/g;
      while ((match = linkRe.exec(html)) !== null) {
        tabs.push({ gid: match[1], title: match[2].trim() });
      }
    }

    if (tabs.length === 0) tabs.push({ gid: "0", title: "Sheet1" });
    return tabs;
  }

  // POST /api/integrations/google-sheets/preview-url
  // Phase 1: validate URL, return tabs + a sample row from the first tab so the
  // frontend can build the column-mapping dropdowns with real data previews.
  app.post("/api/integrations/google-sheets/preview-url", requireAuth, async (req: any, res: any) => {
    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: "URL manquante" });

    const sheetId = extractSheetId(url);
    if (!sheetId) {
      return res.status(400).json({
        error: "URL invalide. Collez l'URL complète de votre Google Sheet (https://docs.google.com/spreadsheets/d/...).",
      });
    }

    let tabs: Array<{ gid: string; title: string }>;
    try {
      tabs = await fetchPublicSheetTabs(sheetId);
    } catch (err: any) {
      return res.status(400).json({
        error: "Impossible d'accéder au sheet. Vérifiez qu'il est partagé avec 'Tout le monde avec le lien' (Lecteur).",
      });
    }

    // Fetch first few rows of the first tab for sample data
    let sampleRow: string[] = [];
    let columnCount = 0;
    try {
      const previewUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tabs[0].gid}`;
      const r = await fetch(previewUrl);
      if (r.ok) {
        const text = await r.text();

        // Inline CSV parse (same logic as cron, avoids circular import)
        const parsePreviewCsv = (t: string): string[][] => {
          const rs: string[][] = [];
          let row: string[] = [], cell = '', inQ = false;
          for (let i = 0; i < t.length; i++) {
            const c = t[i];
            if (inQ) {
              if (c === '"' && t[i+1] === '"') { cell += '"'; i++; }
              else if (c === '"') inQ = false;
              else cell += c;
            } else {
              if (c === '"') inQ = true;
              else if (c === ',') { row.push(cell); cell = ''; }
              else if (c === '\r') { /* skip */ }
              else if (c === '\n') { row.push(cell); rs.push(row); row = []; cell = ''; }
              else cell += c;
            }
          }
          if (cell !== '' || row.length > 0) { row.push(cell); rs.push(row); }
          return rs;
        };

        const rows = parsePreviewCsv(text);

        // Scan first 20 rows; pick the one with the MOST non-empty cells
        // Handles: empty row 0, header-only row 0, sparse rows, etc.
        let bestRow: string[] = [];
        let bestFilledCount = 0;
        const scanLimit = Math.min(20, rows.length);
        for (let i = 0; i < scanLimit; i++) {
          const row = rows[i] || [];
          const filledCount = row.filter(c => c && c.toString().trim()).length;
          if (filledCount > bestFilledCount) { bestFilledCount = filledCount; bestRow = row; }
        }
        sampleRow = bestRow;

        // Column count = max columns across first 20 rows; minimum 10 so user
        // can still map columns beyond visible data range
        columnCount = Math.max(
          ...rows.slice(0, scanLimit).map(r => (r || []).length),
          bestRow.length,
          10,
        );

        // Also return first 3 non-empty rows for richer per-column fallback
        const allSampleRows = rows
          .slice(0, scanLimit)
          .filter(r => r.some(c => c && c.toString().trim()))
          .slice(0, 3);

        console.log(`[GSHEETS-PREVIEW] sheet=${sheetId} tab="${tabs[0].title}" rows=${rows.length} sample_cells=${bestFilledCount} cols=${columnCount}`);

        return res.json({ success: true, sheetId, tabs, sampleRow, sampleRows: allSampleRows, columnCount });
      }
    } catch (err: any) {
      console.error(`[GSHEETS-PREVIEW] Error fetching sample: ${err?.message}`);
    }

    res.json({ success: true, sheetId, tabs, sampleRow, sampleRows: [], columnCount: Math.max(columnCount, 10) });
  });

  // POST /api/integrations/google-sheets/sync-now
  app.post("/api/integrations/google-sheets/sync-now", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const [conn] = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
      .limit(1);
    if (!conn || !(conn as any).gsheetUrl || conn.status === "inactive") {
      return res.status(404).json({ error: "Aucune connexion Google Sheets active" });
    }
    console.log(`[GSHEETS-MANUAL-SYNC] User ${req.user!.id} triggered manual sync for connection ${conn.id}`);
    try {
      const { syncOnePublicSheet } = await import("./cron/sync-gsheets-public");
      await syncOnePublicSheet(conn as any);
      res.json({ success: true, message: "Sync terminée" });
    } catch (err: any) {
      console.error(`[GSHEETS-MANUAL-SYNC] Failed:`, err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/integrations/google-sheets/connect-url
  app.post("/api/integrations/google-sheets/connect-url", requireAuth, async (req, res) => {
    const { url, magasinId, columnMapping } = req.body as {
      url: string;
      magasinId?: number;
      columnMapping?: Record<string, number>;
    };
    if (!url) return res.status(400).json({ error: "URL manquante" });
    if (!magasinId || typeof magasinId !== "number") {
      return res.status(400).json({ error: "Veuillez sélectionner un magasin avant de connecter le sheet." });
    }
    if (!columnMapping || typeof columnMapping !== "object") {
      return res.status(400).json({ error: "Veuillez configurer le mapping des colonnes." });
    }
    if (columnMapping.name === undefined || columnMapping.phone === undefined) {
      return res.status(400).json({ error: "Les colonnes Nom et Téléphone sont obligatoires." });
    }

    console.log(`[GSHEETS-CONNECT] User ${(req as any).user!.id} connecting sheet to magasin ${magasinId}`);

    const sheetId = extractSheetId(url);
    if (!sheetId) {
      return res.status(400).json({
        error: "URL invalide. Collez l'URL complète de votre Google Sheet (commençant par https://docs.google.com/spreadsheets/d/...)",
      });
    }

    let tabs: Array<{ gid: string; title: string }>;
    try {
      tabs = await fetchPublicSheetTabs(sheetId);
    } catch (err: any) {
      return res.status(400).json({
        error: "Impossible d'accéder à votre Google Sheet. Vérifiez qu'il est bien partagé avec 'Tout le monde avec le lien' (Lecteur).",
        detail: err.message,
      });
    }

    const probeUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tabs[0].gid}`;
    const probeResp = await fetch(probeUrl);
    if (!probeResp.ok) {
      return res.status(400).json({
        error: "Le sheet n'est pas réellement public. Activez 'Tout le monde avec le lien — Lecteur' et réessayez.",
      });
    }

    const storeId = req.user!.storeId!;
    const existing = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")))
      .limit(1);

    const webhookUrlToSave = ((req.body as any).webhookUrl || (req.body as any).gsheetWebhookUrl || null) as string | null;

    if (existing.length > 0) {
      await db.update(storeIntegrations)
        .set({
          gsheetUrl: url,
          gsheetId: sheetId,
          gsheetTabs: tabs,
          gsheetSyncState: {},
          gsheetColumnMapping: columnMapping,
          gsheetWebhookUrl: webhookUrlToSave,
          magasinId: magasinId || null,
          status: "active",
          type: "store",
        } as any)
        .where(eq(storeIntegrations.id, existing[0].id));
    } else {
      await db.insert(storeIntegrations).values({
        storeId,
        magasinId: magasinId || null,
        provider: "gsheets",
        type: "store",
        credentials: "{}",
        gsheetUrl: url,
        gsheetId: sheetId,
        gsheetTabs: tabs,
        gsheetSyncState: {},
        gsheetColumnMapping: columnMapping,
        gsheetWebhookUrl: webhookUrlToSave,
        status: "active",
      } as any);
    }

    res.json({
      success: true,
      sheetId,
      tabsCount: tabs.length,
      tabs: tabs.map(t => t.title),
    });
  });

  // POST /api/integrations/google-sheets/disconnect  (URL-based)
  app.post("/api/integrations/google-sheets/disconnect", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    await db.update(storeIntegrations)
      .set({ status: "inactive", gsheetUrl: null, gsheetId: null, gsheetTabs: null, gsheetSyncState: null })
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "gsheets")));
    res.json({ success: true });
  });

  // Verify connection: check if integration has received recent logs
  app.post("/api/integrations/verify/:provider", requireAuth, async (req, res) => {
    const provider = req.params.provider;
    const storeId = req.user!.storeId!;
    const magasinId = req.query.magasin_id ? Number(req.query.magasin_id) : undefined;
    try {
      const logs = await storage.getIntegrationLogs(storeId, 50);
      const providerLogs = logs.filter(l => l.provider === provider);
      const successLog = providerLogs.find(l => l.status === 'success');
      const integration = await storage.getIntegrationByProvider(storeId, provider, magasinId);
      res.json({
        connected: !!integration,
        hasActivity: providerLogs.length > 0,
        lastSuccess: successLog ? successLog.createdAt : null,
        lastLog: providerLogs[0] || null,
        logsCount: providerLogs.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Shopify key-based webhook (multi-store routing by webhookKey) ──────────
  // NOTE: An early pre-flight logger in server/index.ts fires before this handler,
  // logging the raw body before any route logic runs (Railway-visible immediately).
  app.post("/api/webhooks/shopify/order/:webhookKey", async (req, res) => {
    const { webhookKey } = req.params;
    // Reject obviously-short keys before any DB lookup.
    if (!webhookKey || webhookKey.length < 12) {
      console.warn("[WEBHOOK-SEC] shopify webhook with short/missing key — rejected");
      return res.status(401).json({ message: "Invalid webhook key" });
    }
    // Normalise key — trim whitespace, lowercase for safe comparison
    const normKey = webhookKey.trim().toLowerCase();

    try {
      // ── 1. Key & integration lookup ──────────────────────────────────────────
      const integration = await storage.getIntegrationByWebhookKey(normKey);
      if (!integration || integration.provider !== "shopify") {
        console.warn(`[WEBHOOK-SEC] shopify unknown webhook key: ${normKey.slice(0, 8)}…`);
        return res.status(404).json({ message: "Webhook key not found" });
      }
      console.log(`[SHOPIFY WEBHOOK] ✓ Key matched — integrationId: ${integration.id} | storeId: ${integration.storeId} | isActive: ${integration.isActive}`);

      const storeId = integration.storeId;
      const store = await storage.getStore(storeId);
      if (!store) {
        console.error(`[WEBHOOK ERROR]: Store record missing — storeId: ${storeId}`);
        return res.status(404).json({ message: "Store not found" });
      }

      const payload = req.body;
      const topic = (req.headers["x-shopify-topic"] as string) || "";
      const isTestPing = !payload?.id || topic === "hmac-verification";

      // ── DIAGNOSTIC: log every line item Shopify sends ────────────────────
      // Critical for upsell apps (EasySell, ReConvert, OneClickUpsell) that
      // add line items via cart manipulation. If the count is wrong here,
      // it's an upstream issue (carrier app filtering); otherwise the issue
      // is in our processing.
      if (!isTestPing) {
        const lineItemsRaw = Array.isArray(payload?.line_items) ? payload.line_items : [];
        console.log(`[SHOPIFY-WEBHOOK] order #${payload.order_number || payload.id} → ${lineItemsRaw.length} line items received`);
        lineItemsRaw.forEach((item: any, i: number) => {
          console.log(`[SHOPIFY-WEBHOOK]   item ${i + 1}: title="${item.title}" qty=${item.quantity} price=${item.price} sku="${item.sku || 'none'}"`);
        });
        console.log(`[SHOPIFY-WEBHOOK] total_price=${payload.total_price} subtotal_price=${payload.subtotal_price}`);
      }

      // ── 2. Always log every hit in integration_logs ───────────────────────────
      try {
        await storage.createIntegrationLog({
          storeId, integrationId: integration.id, provider: "shopify",
          action: isTestPing ? "webhook_ping" : "order_received",
          status: "success",
          message: isTestPing
            ? `Ping Shopify reçu — topic: ${topic || "n/a"}`
            : `Commande reçue via webhook key — topic: ${topic || "orders/create"}`,
        });
      } catch (logErr: any) {
        console.warn(`[SHOPIFY WEBHOOK] Could not write integration log:`, logErr?.message);
      }

      // Inactive integration: acknowledge but don't process
      if (integration.isActive !== 1) {
        console.warn(`[SHOPIFY WEBHOOK] ⚠ Integration ${integration.id} inactive — hit logged, no order created`);
        return res.status(200).json({ received: true, note: "integration inactive" });
      }

      // Test ping (no real order payload): acknowledge and stop
      if (isTestPing) {
        console.log(`[SHOPIFY WEBHOOK] ✓ Test ping logged for integration ${integration.id}`);
        return res.status(200).json({ received: true, note: "test ping logged" });
      }

      // ── 3. Parse order with safe defaults ────────────────────────────────────
      const parsed = parseWebhookOrder("shopify", payload);
      if (!parsed.orderNumber || parsed.orderNumber === "undefined" || parsed.orderNumber === "null") {
        parsed.orderNumber = `SHP-${Date.now()}`;
      }
      if (!parsed.customerName) parsed.customerName = "Client Anonyme";
      console.log(`[SHOPIFY WEBHOOK] Parsed — order: #${parsed.orderNumber} | customer: "${parsed.customerName}" | phone: "${parsed.customerPhone}" | total: ${parsed.totalPrice} | items: ${parsed.lineItems.length}`);

      // ── 4. Duplicate guard ────────────────────────────────────────────────────
      const existingOrder = await storage.getOrderByNumber(storeId, parsed.orderNumber);
      if (existingOrder) {
        console.log(`[SHOPIFY WEBHOOK] Duplicate — order #${parsed.orderNumber} already exists (orderId: ${existingOrder.id})`);
        try { await storage.incrementIntegrationOrdersCount(integration.id); } catch (_) {}
        return res.json({ success: true, orderId: existingOrder.id, duplicate: true });
      }

      // ── 5. Paywall — warn only, NEVER block incoming webhook orders ───────────
      try {
        const paywallCheck = await storage.checkPaywall(storeId);
        if (paywallCheck.isBlocked) {
          console.warn(`[WEBHOOK WARNING]: Order created despite paywall block — store: ${storeId}, reason: ${paywallCheck.reason}, usage: ${paywallCheck.current}/${paywallCheck.limit}`);
        }
      } catch (pwErr: any) {
        console.warn(`[SHOPIFY WEBHOOK] Could not check paywall (non-fatal):`, pwErr?.message);
      }

      // ── 6. Product matching (case-insensitive) ────────────────────────────────
      // FIX (upsells): persist EVERY line item — including unmatched upsells
      // added by EasySell / ReConvert / OneClickUpsell, etc. Previously we
      // only pushed when a product matched, silently dropping upsell items.
      let storeProducts: any[] = [];
      try { storeProducts = await storage.getProductsByStore(storeId); } catch (_) {}
      let productCost = 0;
      const orderItemsToCreate: { productId: number | null; quantity: number; price: number; rawProductName: string; sku: string; variantInfo: string }[] = [];
      for (const item of parsed.lineItems) {
        const matched = storeProducts.find(p =>
          (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
          p.name.toLowerCase() === item.title.toLowerCase()
        );
        orderItemsToCreate.push({
          productId: matched?.id ?? null,
          quantity: item.quantity,
          price: item.price,
          rawProductName: item.title,
          sku: item.sku || '',
          variantInfo: (item as any).variantInfo || '',
        });
        if (matched) productCost += matched.costPrice * item.quantity;
      }
      console.log(`[SHOPIFY-WEBHOOK] orderItemsToCreate.length=${orderItemsToCreate.length} — matched=${orderItemsToCreate.filter(i => i.productId).length}/${parsed.lineItems.length}`);
      orderItemsToCreate.forEach((i, idx) => console.log(`[SHOPIFY-WEBHOOK]   to create ${idx}: ${i.rawProductName} qty=${i.quantity} price=${i.price} matched=${!!i.productId}`));

      // Build a joined display name from ALL line items (matches what the
      // generic webhook handler does — keeps the orders table column readable).
      const shopifyRawProductName = parsed.lineItems.length > 0
        ? parsed.lineItems.map((li: any) => {
            const v = (li.variantInfo || '').trim();
            return v ? `${li.title} - ${v}` : li.title;
          }).filter(Boolean).join(' + ')
        : null;
      const shopifyVariantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const shopifyRawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;
      console.log(`[SHOPIFY-WEBHOOK] storing totalPrice=${parsed.totalPrice} (= ${(parsed.totalPrice / 100).toFixed(2)} DH) — joined name="${shopifyRawProductName}"`);

      // ── 7. Agent assignment ───────────────────────────────────────────────────
      const shopifyMagasinId = integration.magasinId ?? null;
      let nextAgentId: number | null = null;
      try {
        const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
        nextAgentId = await storage.getNextAgent(storeId, shopifyMagasinId, firstProductId, parsed.customerCity || "");
      } catch (_) {}
      let mediaBuyer: any = null;
      try {
        if (parsed.buyerCode) mediaBuyer = await storage.getMediaBuyerByCode(storeId, parsed.buyerCode);
      } catch (_) {}

      // ── 8. Create order — isolated try/catch for clear DB error reporting ─────
      let order: any;
      try {
        order = await storage.createOrder({
          storeId,
          magasinId: shopifyMagasinId,
          orderNumber: parsed.orderNumber,
          customerName: parsed.customerName,
          customerPhone: parsed.customerPhone || "",
          customerAddress: parsed.customerAddress || "",
          customerCity: parsed.customerCity || "",
          status: "nouveau",
          totalPrice: parsed.totalPrice,
          productCost,
          shippingCost: 0,
          adSpend: 0,
          source: "shopify",
          comment: parsed.comment || null,
          rawProductName: shopifyRawProductName,
          variantDetails: shopifyVariantDetails,
          rawQuantity: shopifyRawQuantity,
          utmSource: parsed.utmSource || null,
          utmCampaign: parsed.utmCampaign || null,
          trafficPlatform: parsed.trafficPlatform || null,
          mediaBuyerId: mediaBuyer?.id || null,
        } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })) as any);
      } catch (dbErr: any) {
        console.error(`[DATABASE ERROR]: Failed to save webhook order: ${dbErr?.message || dbErr}`);
        return res.status(500).json({ message: "Failed to save order", detail: dbErr?.message });
      }

      // ── 9. Post-save updates — each wrapped independently ────────────────────
      if (nextAgentId) {
        try { await storage.assignOrder(order.id, nextAgentId); } catch (_) {}
      }
      try { await storage.incrementIntegrationOrdersCount(integration.id); } catch (_) {}
      try { await storage.incrementMonthlyOrders(storeId); } catch (_) {}
      try {
        await storage.createIntegrationLog({
          storeId, integrationId: integration.id, provider: "shopify",
          action: "order_saved", status: "success",
          message: `Commande #${parsed.orderNumber} enregistrée — client: ${parsed.customerName}`,
        });
      } catch (_) {}

      // ── 10. Real-time push — both SSE and Socket.io ───────────────────────────
      try {
        emitNewOrder(storeId, {
          id: order.id,
          orderNumber: parsed.orderNumber,
          customerName: parsed.customerName,
          status: "nouveau",
          source: "shopify",
        });
        broadcastToStore(storeId, "new_order", { id: order.id, orderNumber: parsed.orderNumber });
        pushOrderToSheet(storeId, {
          action: "order.created",
          orderNumber: parsed.orderNumber || "",
          customerName: parsed.customerName || "",
          customerPhone: parsed.customerPhone || "",
          customerAddress: parsed.customerAddress || "",
          customerCity: parsed.customerCity || "",
          productName: (order as any).rawProductName || "",
          totalPrice: order.totalPrice || 0,
          quantity: 1,
          note: order.comment || null,
          status: "nouveau",
          utmSource: (order as any).utmSource || null,
          utmCampaign: (order as any).utmCampaign || null,
          productId: null,
          magasin: null,
          createdAt: new Date().toLocaleString("fr-MA"),
          sourceUrl: "shopify",
        }).catch(() => {});
      } catch (rtErr: any) {
        console.warn(`[SHOPIFY WEBHOOK] Real-time push failed (non-fatal):`, rtErr?.message);
      }

      console.log(`[WEBHOOK SUCCESS]: Order #${parsed.orderNumber} saved for Store ID: ${storeId} (orderId: ${order.id})`);
      return res.json({ success: true, orderId: order.id });

    } catch (err: any) {
      console.error(`[SHOPIFY WEBHOOK] ✖ Unhandled error — key: "${normKey}":`, err?.message || err);
      return res.status(500).json({ message: "Webhook processing failed", detail: err?.message });
    }
  });

  // Keep legacy Shopify webhook for backward compatibility
  app.post(api.orders.shopifyWebhook.path, async (req, res) => {
    const storeId = req.query.store_id ? Number(req.query.store_id) : null;
    if (!storeId) return res.status(400).json({ message: "store_id query param required" });

    req.params = { provider: 'shopify' };
    req.url = `/api/integrations/webhook/shopify?store_id=${storeId}`;

    try {
      const store = await storage.getStore(storeId);
      if (!store) return res.status(404).json({ message: "Store not found" });

      const payload = req.body;
      if (!payload || !payload.id) return res.status(400).json({ message: "Invalid webhook payload" });

      const parsed = parseWebhookOrder('shopify', payload);
      const existingOrder = await storage.getOrderByNumber(storeId, parsed.orderNumber);
      if (existingOrder) return res.json({ success: true, orderId: existingOrder.id, duplicate: true });

      const storeProducts = await storage.getProductsByStore(storeId);
      let productCost = 0;
      // FIX (upsells): persist EVERY line item, including unmatched upsells.
      const orderItemsToCreate: { productId: number | null; quantity: number; price: number; rawProductName: string; sku: string; variantInfo: string }[] = [];

      for (const item of parsed.lineItems) {
        const matchedProduct = storeProducts.find(p => (item.sku && p.sku === item.sku) || p.name === item.title);
        orderItemsToCreate.push({
          productId: matchedProduct?.id ?? null,
          quantity: item.quantity,
          price: item.price,
          rawProductName: item.title,
          sku: item.sku || '',
          variantInfo: (item as any).variantInfo || '',
        });
        if (matchedProduct) productCost += matchedProduct.costPrice * item.quantity;
      }

      // Joined display name from ALL line items (handles upsells in legacy path).
      const legacyRawProductName = parsed.lineItems.length > 0
        ? parsed.lineItems.map((li: any) => {
            const v = (li.variantInfo || '').trim();
            return v ? `${li.title} - ${v}` : li.title;
          }).filter(Boolean).join(' + ')
        : null;
      const legacyVariantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const legacyRawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;

      const mediaBuyerShopify = parsed.buyerCode ? await storage.getMediaBuyerByCode(storeId, parsed.buyerCode) : null;
      console.log(`[Attribution] Order=${parsed.orderNumber} UTM="${parsed.utmSource}" → Code=${parsed.buyerCode || 'none'} Platform=${parsed.trafficPlatform || 'none'} → Buyer=${mediaBuyerShopify ? mediaBuyerShopify.username + ' (#' + mediaBuyerShopify.id + ')' : 'NOT FOUND'}`);

      const order = await storage.createOrder({
        storeId, orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: 'shopify', comment: parsed.comment,
        rawProductName: legacyRawProductName,
        variantDetails: legacyVariantDetails,
        rawQuantity: legacyRawQuantity,
        utmSource: parsed.utmSource || null, utmCampaign: parsed.utmCampaign || null,
        trafficPlatform: parsed.trafficPlatform || null,
        mediaBuyerId: mediaBuyerShopify?.id || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })) as any);

      emitNewOrder(storeId, { id: order.id, orderNumber: parsed.orderNumber, customerName: parsed.customerName, status: 'nouveau', source: 'shopify' });
      broadcastToStore(storeId, "new_order", { id: order.id, orderNumber: parsed.orderNumber });
      pushOrderToSheet(storeId, {
        action: "order.created",
        orderNumber: parsed.orderNumber || "",
        customerName: parsed.customerName || "",
        customerPhone: parsed.customerPhone || "",
        customerAddress: parsed.customerAddress || "",
        customerCity: parsed.customerCity || "",
        productName: (order as any).rawProductName || "",
        totalPrice: order.totalPrice || 0,
        quantity: 1,
        note: order.comment || null,
        status: "nouveau",
        utmSource: (order as any).utmSource || null,
        utmCampaign: (order as any).utmCampaign || null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "shopify",
      }).catch(() => {});

      res.json({ success: true, orderId: order.id });
    } catch (err) {
      console.error('Shopify webhook error:', err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // ============================================================
  // ENHANCED MANUAL ORDER CREATION (from new-order-add.tsx)
  // ============================================================
  app.post("/api/orders/manual", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const schema = z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().min(1),
        customerAddress: z.string().optional().default(''),
        customerCity: z.string().optional().default(''),
        status: z.string().optional().default('nouveau'),
        canOpen: z.number().optional().default(1),
        isStock: z.number().optional().default(0),
        replace: z.number().optional().default(0),
        agentId: z.number().nullable().optional(),
        comment: z.string().nullable().optional(),
        totalPrice: z.number().optional().default(0),
        items: z.array(z.object({
          productId: z.number().nullable().optional(),
          rawProductName: z.string().optional().default(''),
          sku: z.string().nullable().optional(),
          variantInfo: z.string().nullable().optional(),
          price: z.number().min(0),
          quantity: z.number().min(1),
        })).optional().default([]),
        magasinId: z.number().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: `Limite de commandes atteinte (${limitCheck.current}/${limitCheck.limit}).` });
      }

      // Validate magasinId belongs to this user's account (prevents cross-tenant spoofing)
      const requestedMagasinId = (data as any).magasinId ?? null;
      if (requestedMagasinId) {
        const ownedMagasins = await storage.getStoresByOwner(req.user!.id);
        if (!ownedMagasins.some(m => m.id === requestedMagasinId)) {
          return res.status(403).json({ message: "Magasin non autorisé" });
        }
      }

      const totalPriceCents = Math.round(data.totalPrice * 100);
      const rawProductName = data.items.map(i => i.rawProductName).filter(Boolean).join(' + ') || null;
      const orderNumber = `MAN-${Date.now()}`;

      // Compute real COGS from linked products
      let computedProductCost = 0;
      const storeProducts = await storage.getProductsByStore(storeId);
      for (const item of data.items.filter(i => i.rawProductName)) {
        if (item.productId) {
          const prod = (storeProducts as any[]).find((p: any) => p.id === item.productId);
          if (prod) computedProductCost += (prod.costPrice ?? 0) * item.quantity;
        } else {
          // Fallback: match by name
          const prod = (storeProducts as any[]).find((p: any) =>
            p.name.toLowerCase().trim() === (item.rawProductName || '').toLowerCase().trim()
          );
          if (prod) computedProductCost += (prod.costPrice ?? 0) * item.quantity;
        }
      }

      const manualMagasinId = (data as any).magasinId ?? null;
      const order = await storage.createOrder({
        storeId,
        magasinId: manualMagasinId,
        orderNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        customerCity: data.customerCity,
        status: data.status,
        totalPrice: totalPriceCents,
        productCost: computedProductCost,
        shippingCost: 0,
        adSpend: 0,
        source: 'manual',
        comment: data.comment || null,
        rawProductName,
        canOpen: data.canOpen,
        isStock: data.isStock,
        replace: data.replace,
      } as any, data.items.filter(i => i.rawProductName).map(i => ({
        orderId: 0,
        productId: i.productId ?? null,
        rawProductName: i.rawProductName,
        sku: i.sku || null,
        variantInfo: i.variantInfo || null,
        price: Math.round(i.price),
        quantity: i.quantity,
      })) as any);

      if (data.status === 'confirme') {
        await storage.updateOrderStatus(order.id, 'confirme');
      }

      const agentId = data.agentId || await storage.getNextAgent(storeId, manualMagasinId, undefined, data.customerCity);
      if (agentId) await storage.assignOrder(order.id, agentId);

      await storage.incrementMonthlyOrders(storeId);

      // Real-time push
      emitNewOrder(storeId, { id: order.id, orderNumber, customerName: data.customerName, status: data.status, source: 'manual' });
      broadcastToStore(storeId, "new_order", { id: order.id, orderNumber });
      pushOrderToSheet(storeId, {
        action: "order.created",
        orderNumber: orderNumber || "",
        customerName: data.customerName || "",
        customerPhone: data.customerPhone || "",
        customerAddress: data.customerAddress || "",
        customerCity: data.customerCity || "",
        productName: (order as any).rawProductName || "",
        totalPrice: order.totalPrice || 0,
        quantity: data.items?.[0]?.quantity || 1,
        note: data.comment || null,
        status: data.status || "nouveau",
        utmSource: (data as any).utmSource || null,
        utmCampaign: (data as any).utmCampaign || null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "manual",
      }).catch(() => {});

      res.status(201).json(order);

      // Fire-and-forget: AI confirmation trigger
      if (data.status !== 'confirme' && getWaAutoSettings(storeId).aiConfirmation) {
        const firstProductId = data.items[0]?.productId ?? null;
        triggerAIForNewOrder(storeId, order.id, data.customerPhone, data.customerName, firstProductId).catch(console.error);
      } else {
        console.log('[WA] AI confirmation disabled — skipping auto-send');
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // BULK IMPORT ORDERS FROM EXCEL/CSV
  // ============================================================
  app.post("/api/orders/import", requireAuth, requireActiveSubscription, async (req, res) => {
    const multer = (await import("multer")).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
    upload.single("file")(req as any, res as any, async (err) => {
      if (err) return res.status(400).json({ message: err.message });
      try {
        const file = (req as any).file;
        if (!file) return res.status(400).json({ message: "Aucun fichier reçu" });

        const mappingRaw = req.body.mapping;
        const mapping: Record<string, string> = typeof mappingRaw === "string" ? JSON.parse(mappingRaw) : mappingRaw;

        const XLSX = await import("xlsx");
        const wb = XLSX.read(file.buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const storeId = req.user!.storeId!;
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            const mapped: Record<string, string> = {};
            Object.entries(mapping).forEach(([col, field]) => {
              if (field && row[col] !== undefined && row[col] !== '') {
                mapped[field] = String(row[col]).trim();
              }
            });

            const customerName = mapped.customerName || '';
            const customerPhone = mapped.customerPhone || '';
            if (!customerName && !customerPhone) { skipped++; continue; }

            const totalPrice = mapped.totalPrice ? Math.round(parseFloat(mapped.totalPrice) * 100) : 0;
            const quantity = mapped.quantity ? parseInt(mapped.quantity) || 1 : 1;
            const orderNumber = `IMP-${Date.now()}-${i}`;

            const order = await storage.createOrder({
              storeId,
              orderNumber,
              customerName: customerName || 'Client importé',
              customerPhone: customerPhone || '',
              customerAddress: mapped.customerAddress || '',
              customerCity: mapped.customerCity || '',
              status: mapped.status || 'nouveau',
              totalPrice,
              productCost: 0,
              shippingCost: 0,
              adSpend: 0,
              source: 'import',
              comment: mapped.comment || null,
              rawProductName: mapped.rawProductName || null,
            } as any, mapped.rawProductName ? [{
              orderId: 0,
              productId: null,
              rawProductName: mapped.rawProductName,
              sku: mapped.sku || null,
              variantInfo: mapped.variantInfo || null,
              price: totalPrice,
              quantity,
            }] as any : []);

            if (mapped.status === 'confirme') {
              await storage.updateOrderStatus(order.id, 'confirme');
            }

            await storage.incrementMonthlyOrders(storeId);
            imported++;
          } catch (rowErr: any) {
            errors.push(`Ligne ${i + 2}: ${rowErr.message}`);
          }
        }

        res.json({ imported, skipped, errors });
      } catch (err: any) {
        res.status(500).json({ message: err.message || "Erreur d'importation" });
      }
    });
  });

  // ============================================================
  // MANUAL ORDER CREATION
  // ============================================================
  app.post("/api/orders", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const schema = z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().min(1),
        customerAddress: z.string().optional().default(''),
        customerCity: z.string().optional().default(''),
        items: z.array(z.object({
          productId: z.number(),
          quantity: z.number().min(1),
          price: z.number().min(0),
        })).min(1),
        shippingCost: z.number().optional().default(0),
        comment: z.string().optional().default(''),
        magasinId: z.number().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: `Limite de commandes atteinte (${limitCheck.current}/${limitCheck.limit}). Passez au plan Pro pour continuer.`,
        });
      }

      // Validate magasinId belongs to this user's account (prevents cross-tenant spoofing)
      const requestedMagasinId2 = (data as any).magasinId ?? null;
      if (requestedMagasinId2) {
        const ownedMagasins = await storage.getStoresByOwner(req.user!.id);
        if (!ownedMagasins.some(m => m.id === requestedMagasinId2)) {
          return res.status(403).json({ message: "Magasin non autorisé" });
        }
      }

      let totalPrice = data.shippingCost;
      let productCost = 0;
      const orderItemsToCreate: { productId: number; quantity: number; price: number; orderId: number }[] = [];

      for (const item of data.items) {
        const product = await storage.getProduct(item.productId);
        if (!product || product.storeId !== storeId) {
          return res.status(400).json({ message: `Produit #${item.productId} introuvable` });
        }
        totalPrice += item.price * item.quantity;
        productCost += product.costPrice * item.quantity;
        orderItemsToCreate.push({ ...item, orderId: 0 });
      }

      const orderNumber = `MAN-${Date.now()}`;
      const manualMagasinId2 = (data as any).magasinId ?? null;
      const order = await storage.createOrder({
        storeId,
        magasinId: manualMagasinId2,
        orderNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        customerCity: data.customerCity,
        status: 'nouveau',
        totalPrice,
        productCost,
        shippingCost: data.shippingCost,
        adSpend: 0,
        source: 'manual',
        comment: data.comment || null,
      } as any, orderItemsToCreate);

      const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
      const nextAgentId = await storage.getNextAgent(storeId, manualMagasinId2, firstProductId, data.customerCity);
      if (nextAgentId) {
        await storage.assignOrder(order.id, nextAgentId);
      }

      await storage.incrementMonthlyOrders(storeId);

      const finalOrder = await storage.getOrder(order.id);
      res.status(201).json(finalOrder || order);

      // Fire-and-forget: AI confirmation trigger
      if (getWaAutoSettings(storeId).aiConfirmation) {
        triggerAIForNewOrder(storeId, order.id, data.customerPhone, data.customerName, orderItemsToCreate[0]?.productId).catch(console.error);
      } else {
        console.log('[WA] AI confirmation disabled — skipping auto-send');
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // UPDATE ORDER FIELDS
  // ============================================================
  app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });
      if (order.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });

      const schema = z.object({
        status: z.string().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        customerAddress: z.string().optional(),
        customerCity: z.string().optional(),
        shippingCost: z.number().optional(),
        comment: z.string().nullable().optional(),
        canOpen: z.number().optional(),
        upSell: z.number().optional(),
        replace: z.number().optional(),
        isStock: z.number().optional(),
        replacementTrackNumber: z.string().nullable().optional(),
        rawProductName: z.string().nullable().optional(),
        commentStatus: z.string().nullable().optional(),
        commentOrder: z.string().nullable().optional(),
        totalPrice: z.number().optional(),
        // ── Confirmé Reporté: ISO date string (YYYY-MM-DD) or null to clear ──
        scheduledFor: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);

      // ── Validate scheduledFor when transitioning to confirme_reporte ───
      // Server-side rule mirrors the client modal: must be strictly after today
      // in Casablanca local time (>= tomorrow Casablanca). We parse YYYY-MM-DD
      // strictly and reject calendar-invalid dates such as "2026-02-31" which
      // `new Date()` would silently roll over.
      if (data.status === 'confirme_reporte') {
        if (!data.scheduledFor) {
          return res.status(400).json({ message: "Date programmée requise pour le statut Confirmé Reporté." });
        }
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.scheduledFor);
        if (!m) {
          return res.status(400).json({ message: "Date programmée invalide (format attendu YYYY-MM-DD)." });
        }
        const [, ys, ms, ds] = m;
        const y = Number(ys), mo = Number(ms), d = Number(ds);
        const probe = new Date(Date.UTC(y, mo - 1, d));
        if (
          probe.getUTCFullYear() !== y ||
          probe.getUTCMonth() !== mo - 1 ||
          probe.getUTCDate() !== d
        ) {
          return res.status(400).json({ message: "Date programmée invalide." });
        }
        // Compare YYYY-MM-DD strings against "tomorrow in Casablanca" — this
        // avoids any UTC vs Casablanca day-boundary skew and matches what
        // the client's <input type="date" min={tomorrow}> enforces.
        if (data.scheduledFor < casablancaTomorrow()) {
          return res.status(400).json({ message: "La date programmée doit être au minimum demain." });
        }
      }
      console.log(`[PATCH /api/orders/${orderId}] storeId=${req.user!.storeId} fields=${JSON.stringify({ status: data.status, comment: data.comment, commentStatus: data.commentStatus, commentOrder: data.commentOrder, customerName: data.customerName, customerCity: data.customerCity })}`);

      // Route status changes through updateOrderStatus for proper stock handling
      if (data.status && data.status !== order.status) {
        console.log(`[PATCH /api/orders/${orderId}] Updating status ${order.status} → ${data.status}`);
        await storage.updateOrderStatus(orderId, data.status, req.user!.id);

        if (data.status === 'delivered') {
          await storage.syncCustomerOnDelivery(order.storeId!, {
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerAddress: order.customerAddress,
            customerCity: order.customerCity,
            totalPrice: order.totalPrice ?? 0,
          });
        }

        // Auto-notify customer on WhatsApp when order is shipped (expédié)
        // Uses triggerShipmentNotification which handles: gender, DB logging, Live Chat broadcast, tracking
        if (data.status === 'expédié' && order.customerPhone && order.storeId) {
          try {
            const { triggerShipmentNotification } = await import("./ai-agent");
            const fullOrder = await storage.getOrder(orderId); // get latest (may have trackNumber just set)
            await triggerShipmentNotification(
              order.storeId,
              orderId,
              order.customerPhone,
              order.customerName || "",
              order.rawProductName || "منتجك",
              fullOrder?.trackNumber ?? null,
              fullOrder?.shippingProvider ?? null,
            );
          } catch (notifyErr: any) {
            console.warn(`[SHIPPED] ⚠️ Failed to auto-notify customer: ${notifyErr.message}`);
          }
        }
      }
      const { status: _s, ...fieldsWithoutStatus } = data;
      let updated: any;
      if (Object.keys(fieldsWithoutStatus).length > 0) {
        updated = await storage.updateOrder(orderId, fieldsWithoutStatus);
        console.log(`[PATCH /api/orders/${orderId}] saved comment=${updated?.comment ?? 'null'} commentStatus=${updated?.commentStatus ?? 'null'} commentOrder=${updated?.commentOrder ?? 'null'}`);
      } else {
        updated = await storage.getOrder(orderId);
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // Order item CRUD
  app.post("/api/orders/:id/items", requireAuth, async (req, res) => {
    const orderId = parseInt(req.params.id);
    try {
      // Verify the parent order belongs to the user's store
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });
      if (order.storeId !== req.user!.storeId && !req.user!.isSuperAdmin) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const item = await storage.addOrderItem({
        orderId,
        productId: req.body.productId || null,
        rawProductName: req.body.rawProductName || null,
        sku: req.body.sku || null,
        variantInfo: req.body.variantInfo || null,
        quantity: req.body.quantity || 1,
        price: req.body.price || 0,
      });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/order-items/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      // Verify the item's parent order belongs to the user's store
      const [itemRow] = await db.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, id));
      if (!itemRow) return res.status(404).json({ message: "Item non trouvé" });
      const order = await storage.getOrder(itemRow.orderId);
      if (!order || (order.storeId !== req.user!.storeId && !req.user!.isSuperAdmin)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const item = await storage.updateOrderItem(id, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/order-items/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      // Verify the item's parent order belongs to the user's store
      const [itemRow] = await db.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, id));
      if (!itemRow) return res.status(404).json({ message: "Item non trouvé" });
      const order = await storage.getOrder(itemRow.orderId);
      if (!order || (order.storeId !== req.user!.storeId && !req.user!.isSuperAdmin)) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      await storage.deleteOrderItem(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============================================================
  // PRODUCTS CRUD
  // ============================================================
  app.post("/api/products", requireAuth, async (req, res) => {
    try {
      const variantSchema = z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        costPrice: z.number().min(0).default(0),
        sellingPrice: z.number().min(0).default(0),
        stock: z.number().min(0).default(0),
        imageUrl: z.string().nullable().optional(),
      });
      const schema = z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        stock: z.number().min(0).default(0),
        costPrice: z.number().min(0).default(0),
        sellingPrice: z.number().min(0).default(0),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        hasVariants: z.number().optional().default(0),
        variants: z.array(variantSchema).optional(),
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;
      const { variants, ...productData } = data;
      
      if (variants && variants.length > 0) {
        const product = await storage.createProductWithVariants(
          { ...productData, storeId, hasVariants: 1, reference: productData.reference || null, description: productData.description || null, imageUrl: productData.imageUrl || null },
          variants.map(v => ({ ...v, productId: 0, storeId, imageUrl: v.imageUrl || null }))
        );
        res.status(201).json(product);
      } else {
        const product = await storage.createProduct({ ...productData, storeId, reference: productData.reference || null, description: productData.description || null, imageUrl: productData.imageUrl || null });
        res.status(201).json(product);
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/products/name-check", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const name = (req.query.name as string || "").trim().toLowerCase();
      if (!name) return res.json({ found: false });

      const matchingItems = await db
        .select({ orderId: orderItems.orderId })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orders.storeId, storeId),
          sql`LOWER(${orderItems.rawProductName}) LIKE ${'%' + name + '%'}`,
        ));

      if (matchingItems.length === 0) return res.json({ found: false });

      const orderIds = [...new Set(matchingItems.map(i => i.orderId))];

      const matchingOrders = await db
        .select({ status: orders.status })
        .from(orders)
        .where(inArray(orders.id, orderIds));

      const total     = matchingOrders.length;
      const confirmed = matchingOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return ['confirme','confirmé','expédié','delivered','livré','livrée','in_progress','attente de ramassage'].includes(s);
      }).length;
      const delivered = matchingOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'delivered' || s === 'livré' || s === 'livrée';
      }).length;
      const confirmRate  = total     > 0 ? Math.round(confirmed / total     * 100) : 0;
      const deliveryRate = confirmed > 0 ? Math.round(delivered / confirmed * 100) : 0;

      res.json({ found: true, total, confirmed, delivered, confirmRate, deliveryRate });
    } catch (err) {
      throw err;
    }
  });

  app.get("/api/products/inventory", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const stats = await storage.getInventoryStats(storeId);
    res.json(stats);
  });

  app.get("/api/stock-logs", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const logs = await storage.getStockLogs(storeId);
    res.json(logs);
  });

  app.get("/api/stock-logs/:productId", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const productId = Number(req.params.productId);
    const logs = await storage.getStockLogs(storeId, isNaN(productId) ? undefined : productId);
    res.json(logs);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products/profitability — per-product revenue, cost, and profit
  // computed directly from orders + order_items (no CSV needed).
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/products/profitability", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const storeId = user.storeId!;
      const { dateFrom, dateTo, dateRange } = req.query as Record<string, string>;

      const now = new Date();
      let cutoff: Date;
      let endDate: Date = new Date();

      if (dateFrom) {
        cutoff  = new Date(dateFrom + 'T00:00:00');
        endDate = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();
      } else if (dateRange === 'today') {
        cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'yesterday') {
        cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1); cutoff.setHours(0, 0, 0, 0);
        endDate = new Date(); endDate.setDate(endDate.getDate() - 1); endDate.setHours(23, 59, 59, 999);
      } else if (dateRange === '7days') {
        cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'lastmonth') {
        cutoff  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (dateRange === 'all') {
        cutoff = new Date('2020-01-01');
      } else {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const storeOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.storeId, storeId),
          gte(orders.createdAt, cutoff),
          lte(orders.createdAt, endDate),
        ));

      const orderIds = storeOrders.map(o => o.id);

      // ── Fetch ad spend from BOTH tables ──────────────────────────────────
      const cutoffDateStr  = cutoff.toISOString().slice(0, 10);
      const endDateStr     = endDate.toISOString().slice(0, 10);

      // 1. adSpendTracking (legacy) — amount in DH
      const legacyAdRows = await db.select({
        productId: adSpendTracking.productId,
        amount:    adSpendTracking.amount,
      }).from(adSpendTracking).where(and(
        eq(adSpendTracking.storeId, storeId),
        sql`${adSpendTracking.date} >= ${cutoffDateStr}`,
        sql`${adSpendTracking.date} <= ${endDateStr}`,
      ));

      // 2. adSpend (Publicités module) — amount in centimes → divide by 100
      const newAdEntries = await storage.getAdSpendEntries(storeId, {
        dateFrom: cutoffDateStr,
        dateTo:   endDateStr,
        allUsers: true,
      });

      // Combined for platform totals (all normalized to DH)
      const adSpendRows = [
        ...legacyAdRows.map((r: any) => ({ productId: r.productId, amountDH: Number(r.amount || 0) })),
        ...newAdEntries.map((r: any) => ({ productId: r.productId, amountDH: Number(r.amount || 0) / 100 })),
      ];

      // Build map: productId → total adSpend (DH)
      const productAdSpendMap: Record<number, number> = {};
      let globalAdSpend = 0;
      for (const row of adSpendRows) {
        if (row.productId) {
          productAdSpendMap[row.productId] = (productAdSpendMap[row.productId] || 0) + row.amountDH;
        } else {
          globalAdSpend += row.amountDH;
        }
      }

      // Fetch orderItems with product info (skip if no orders in range)
      const itemRows = orderIds.length > 0 ? await db
        .select({
          orderId:          orderItems.orderId,
          productId:        orderItems.productId,
          rawProductName:   orderItems.rawProductName,
          quantity:         orderItems.quantity,
          price:            orderItems.price,
          productName:      products.name,
          productCostPrice: products.costPrice,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds)) : [];

      const orderMap = new Map(storeOrders.map(o => [o.id, o]));

      type ProductStats = {
        id: number; name: string;
        totalOrders: number; confirmedOrders: number; deliveredOrders: number;
        refusedOrders: number; returnedOrders: number;
        revenue: number; productCost: number; shippingCost: number; adSpend: number;
        netProfit: number; margin: number; roi: number;
        confirmRate: number; deliveryRate: number;
      };

      const statsMap: Record<string, ProductStats> = {};
      const CONFIRMED_SET = new Set(["confirme","confirmé","expédié","attente de ramassage","in_progress","delivered","livré","livrée"]);
      const REFUSED_SET   = new Set(["refused","refusé"]);
      const RETURN_SET    = new Set(["retourné","retour en cours","retourné à l'expéditeur","tentative échouée","article retourné"]);

      for (const item of itemRows) {
        const order = orderMap.get(item.orderId);
        if (!order) continue;

        const name = (item.rawProductName || item.productName || 'Produit inconnu').trim();
        const pid  = item.productId || 0;
        const key  = `${pid}_${name}`;

        if (!statsMap[key]) {
          statsMap[key] = {
            id: pid, name,
            totalOrders: 0, confirmedOrders: 0, deliveredOrders: 0,
            refusedOrders: 0, returnedOrders: 0,
            revenue: 0, productCost: 0, shippingCost: 0, adSpend: 0,
            netProfit: 0, margin: 0, roi: 0, confirmRate: 0, deliveryRate: 0,
          };
        }

        const s = statsMap[key];
        const status = ((order as any).status || '').toLowerCase().trim();
        const isDelivered = status === 'delivered' || status === 'livré' || status === 'livrée';

        s.totalOrders++;
        if (CONFIRMED_SET.has(status)) s.confirmedOrders++;
        if (isDelivered)               s.deliveredOrders++;
        if (REFUSED_SET.has(status))   s.refusedOrders++;
        if (RETURN_SET.has(status))    s.returnedOrders++;

        if (isDelivered) {
          // All amounts stored in centimes — divide by 100 to get DH
          s.revenue      += Number((order as any).totalPrice  || 0) / 100;
          s.productCost  += (Number(item.productCostPrice ?? (order as any).productCost ?? 0) / 100) * Number(item.quantity || 1);
          s.shippingCost += Number((order as any).shippingCost || 0) / 100;
          // adSpend comes from adSpendTracking table, applied after aggregation
        }
      }

      const productResult = Object.values(statsMap).map(s => {
        // ONLY use spend explicitly tagged to this product — never split global spend
        const totalAdSpend = productAdSpendMap[s.id] || 0;

        const netProfit    = s.revenue - s.productCost - s.shippingCost - totalAdSpend;
        const margin       = s.revenue > 0 ? (netProfit / s.revenue) * 100 : 0;
        const roi          = s.productCost > 0 ? (netProfit / s.productCost) * 100 : 0;
        const confirmRate  = s.totalOrders > 0 ? (s.confirmedOrders  / s.totalOrders)   * 100 : 0;
        const deliveryRate = s.confirmedOrders > 0 ? (s.deliveredOrders / s.confirmedOrders) * 100 : 0;
        return { ...s, adSpend: totalAdSpend, netProfit, margin, roi, confirmRate, deliveryRate };
      }).sort((a, b) => b.netProfit - a.netProfit);

      // Global ad spend (not tagged to any product) shown separately in summary
      const globalAdSpendTotal = globalAdSpend;

      // ── Merge stock products that have no orders yet ─────────────────────
      // Fetch ALL products in the store so new/untested products appear with zeros
      const allStoreProducts = await db.select({
        id: products.id,
        name: products.name,
        costPrice: products.costPrice,
        stock: products.stock,
      }).from(products).where(eq(products.storeId, storeId));

      const existingProductIds = new Set(productResult.map((p: any) => p.id));
      for (const sp of allStoreProducts) {
        if (!existingProductIds.has(sp.id)) {
          productResult.push({
            id: sp.id, name: sp.name,
            totalOrders: 0, confirmedOrders: 0, deliveredOrders: 0,
            refusedOrders: 0, returnedOrders: 0,
            revenue: 0, productCost: 0, shippingCost: 0, adSpend: 0,
            netProfit: 0, margin: 0, roi: 0, confirmRate: 0, deliveryRate: 0,
            noData: true,
          } as any);
        }
      }

      // ── Per-platform aggregation ──────────────────────────────────
      type PlatStat = { platform: string; orders: number; delivered: number; revenue: number; adSpend: number; netProfit: number; roas: number; cpo: number };
      const platMap: Record<string, PlatStat> = {};
      for (const o of storeOrders) {
        const raw   = (o as any).trafficPlatform || (o as any).utmSource || "";
        const low   = raw.toLowerCase();
        const label = low.includes("facebook") || low.includes("fb") || low.includes("meta") ? "Facebook / Meta"
                    : low.includes("tiktok") || low.includes("tik") ? "TikTok"
                    : low.includes("google") ? "Google"
                    : low.includes("organic") || low.includes("organique") ? "Organique"
                    : raw || "Non défini";
        if (!platMap[label]) platMap[label] = { platform: label, orders: 0, delivered: 0, revenue: 0, adSpend: 0, netProfit: 0, roas: 0, cpo: 0 };
        const p = platMap[label];
        const isDel = ["delivered","livré","livrée"].includes(((o as any).status || "").toLowerCase());
        p.orders++;
        if (isDel) {
          p.delivered++;
          p.revenue += Number((o as any).totalPrice || 0) / 100;
        }
      }
      // Distribute total adSpend from adSpendTracking proportionally by revenue
      const totalAdSpendDH = adSpendRows.reduce((s: number, r: any) => s + r.amountDH, 0);
      const platformResult = Object.values(platMap).map(p => {
        // Platform view: distribute total spend proportionally (acceptable at platform level)
        const totalPlatRev = Object.values(platMap).reduce((s, x) => s + x.revenue, 0);
        const platAdSpend  = totalPlatRev > 0 ? totalAdSpendDH * (p.revenue / totalPlatRev) : 0;
        const netProfit    = p.revenue - platAdSpend;
        const roas         = platAdSpend > 0 ? p.revenue / platAdSpend : 0;
        const cpo          = p.orders   > 0 ? platAdSpend / p.orders  : 0;
        return { ...p, adSpend: platAdSpend, netProfit, roas, cpo };
      }).sort((a, b) => b.revenue - a.revenue);

      res.json({ products: productResult, platforms: platformResult, globalAdSpend: globalAdSpendTotal });
    } catch (err) {
      throw err;
    }
  });

  app.patch("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ message: "Produit non trouvé" });
      if (product.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
      const schema = z.object({
        name: z.string().optional(),
        sku: z.string().optional(),
        stock: z.number().optional(),
        costPrice: z.number().optional(),
        sellingPrice: z.number().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        descriptionDarija: z.string().nullable().optional(),
        aiFeatures: z.string().nullable().optional(), // stored as JSON string
      });
      const data = schema.parse(req.body);

      // If a manual stock edit slipped in via PATCH (legacy path — restock UI
      // should use POST /restock instead), record an 'adjustment' ledger row
      // for the delta so the audit trail is never silently broken.
      if (typeof data.stock === 'number' && data.stock !== product.stock) {
        const delta = data.stock - product.stock;
        await db.insert(stockMovements).values({
          storeId: product.storeId!,
          productId: product.id,
          type: 'adjustment',
          quantity: delta,
          userId: req.user!.id,
          reason: `Édition manuelle du stock (${product.stock} → ${data.stock})`,
        });
      }

      const updated = await storage.updateProduct(productId, data);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/products/:id", requireAuth, async (req, res) => {
    const productId = Number(req.params.id);
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ message: "Produit non trouvé" });
    if (product.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
    await storage.deleteProduct(productId);
    res.json({ message: "Supprimé" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/products/:id/restock
  // Add inventory to a product. Increments products.stock AND inserts a
  // 'restock' row in the ledger so the inventory page's "Reçu" column and
  // history modal both reflect the new shipment.
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/products/:id/restock", requireAuth, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ message: "Produit non trouvé" });
      if (product.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });

      const schema = z.object({
        quantity: z.number().int().positive("La quantité doit être > 0"),
        reason:   z.string().max(500).optional(),
      });
      const { quantity, reason } = schema.parse(req.body);

      await db.transaction(async (tx) => {
        await tx.update(products)
          .set({ stock: sql`${products.stock} + ${quantity}` })
          .where(eq(products.id, productId));
        await tx.insert(stockMovements).values({
          storeId: product.storeId!,
          productId,
          type: 'restock',
          quantity,
          userId: req.user!.id,
          reason: reason || 'Réapprovisionnement manuel',
        });
      });

      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products/:id/insights
  // Per-product analytics for the inventory side-sheet:
  //   - KPIs (recu / sortie / available / refusal counts)
  //   - Last 30 ledger movements
  //   - Top 5 cities (delivered orders only)
  //   - Top refusal reasons (status: refused / annule / no_response)
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/products/:id/insights", requireAuth, async (req, res) => {
    const productId = Number(req.params.id);
    const storeId = req.user!.storeId!;
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ message: "Produit non trouvé" });
    if (product.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });

    const variants = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    const totalStock = product.stock + variants.reduce((s, v) => s + v.stock, 0);

    // ── Last 30 ledger movements ────────────────────────────────────────
    const movements = await db.select({
        id:        stockMovements.id,
        type:      stockMovements.type,
        quantity:  stockMovements.quantity,
        reason:    stockMovements.reason,
        orderId:   stockMovements.orderId,
        createdAt: stockMovements.createdAt,
        userName:  users.name,
      })
      .from(stockMovements)
      .leftJoin(users, eq(stockMovements.userId, users.id))
      .where(and(eq(stockMovements.productId, productId), eq(stockMovements.storeId, storeId)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(30);

    // ── KPIs from the ledger ────────────────────────────────────────────
    const allLedger = await db.select({ type: stockMovements.type, qty: stockMovements.quantity })
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, productId), eq(stockMovements.storeId, storeId)));
    const recu     = allLedger.filter(m => m.type === 'restock').reduce((s, m) => s + m.qty, 0);
    const sortie   = -allLedger.filter(m => m.type === 'delivered').reduce((s, m) => s + m.qty, 0);
    const returned =  allLedger.filter(m => m.type === 'returned').reduce((s, m) => s + m.qty, 0);

    // ── Order-side stats (cities, refusal reasons, totals) ──────────────
    // Refusal/cancellation buckets — covers carrier returns, customer
    // cancellations and unreachable customers. The free-text "comment" field
    // is what the agent jots down when a delivery fails, so we use it as the
    // refusal reason (status itself is the fallback bucket).
    const REFUSED_STATUSES = new Set([
      'refused', 'retourné',
      'Annulé', 'Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)',
      'Injoignable', 'boite vocale',
    ]);

    const orderStats = await db.select({
        status: orders.status,
        city:   orders.customerCity,
        qty:    orderItems.quantity,
        comment: orders.comment,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orderItems.productId, productId), eq(orders.storeId, storeId)));

    const totalOrdered = orderStats.reduce((s, o) => s + o.qty, 0);
    const totalRefused = orderStats.filter(o => REFUSED_STATUSES.has(o.status))
                                    .reduce((s, o) => s + o.qty, 0);

    // Top 5 delivery cities (delivered orders only)
    const cityMap = new Map<string, number>();
    for (const o of orderStats) {
      if (o.status !== 'delivered' || !o.city) continue;
      const key = o.city.trim() || 'Inconnue';
      cityMap.set(key, (cityMap.get(key) || 0) + o.qty);
    }
    const topCities = Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([city, qty]) => ({ city, qty }));

    // Top refusal reasons — agent comment first, fall back to status bucket
    const refMap = new Map<string, number>();
    for (const o of orderStats) {
      if (!REFUSED_STATUSES.has(o.status)) continue;
      const noted = (o.comment || '').trim();
      const key = noted ? noted.slice(0, 80) : o.status;
      refMap.set(key, (refMap.get(key) || 0) + o.qty);
    }
    const topRefusalReasons = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, qty]) => ({ reason, qty }));

    res.json({
      product: {
        id: product.id, name: product.name, sku: product.sku, imageUrl: product.imageUrl,
        sellingPrice: product.sellingPrice, costPrice: product.costPrice,
      },
      kpis: {
        currentStock: totalStock,
        recu, sortie, returned,
        totalOrdered, totalRefused,
        refusalRate: totalOrdered > 0 ? Math.round(totalRefused / totalOrdered * 100) : 0,
      },
      movements,
      topCities,
      topRefusalReasons,
    });
  });

  // ============================================================
  // CUSTOMERS (CRM)
  // ============================================================
  app.get("/api/customers", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    res.json(await storage.getCustomersByStore(storeId));
  });

  app.get("/api/clients/stats", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const magasinId = req.query.magasinId ? parseInt(req.query.magasinId as string) : null;
    try {
      const clients = await storage.getClientsWithStats(storeId, { magasinId });
      res.json(clients);
    } catch (err: any) {
      console.error("[Clients/stats] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des clients" });
    }
  });

  app.get("/api/clients/loyal", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const magasinId = req.query.magasinId ? parseInt(req.query.magasinId as string) : null;
    try {
      const clients = await storage.getLoyalClientsWithDeliveries(storeId, { magasinId });
      res.json(clients);
    } catch (err: any) {
      console.error("[Clients/loyal] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement" });
    }
  });

  app.post("/api/customers/migrate", requireAdmin, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const count = await storage.migrateCustomersFromDeliveredOrders(storeId);
      res.json({ success: true, customersCreated: count, message: `Migration terminée : ${count} client(s) traité(s)` });
    } catch (err) {
      throw err;
    }
  });

  // ============================================================
  // SUBSCRIPTION / BILLING
  // ============================================================
  app.get("/api/subscription", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    let sub = await storage.getSubscription(storeId);
    if (!sub) {
      sub = await storage.createSubscription({
        storeId,
        plan: 'trial',
        monthlyLimit: 60,
        pricePerMonth: 0,
        currentMonthOrders: 0,
        isActive: 1,
      });
    }
    const limitCheck = await storage.checkOrderLimit(storeId);
    const paywallCheck = await storage.checkPaywall(storeId);
    const now = new Date();
    const daysUntilExpiry = sub.planExpiryDate
      ? Math.ceil((new Date(sub.planExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    res.json({ ...sub, ...limitCheck, daysUntilExpiry, isExpired: paywallCheck.isExpired, reason: paywallCheck.reason });
  });

  app.post("/api/subscription", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        plan: z.enum(['starter', 'pro']),
      });
      const { plan } = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const planConfig = plan === 'pro'
        ? { plan: 'pro' as const, monthlyLimit: 99999, pricePerMonth: 40000 }
        : { plan: 'starter' as const, monthlyLimit: 1500, pricePerMonth: 20000 };

      let sub = await storage.getSubscription(storeId);
      if (sub) {
        sub = (await storage.updateSubscription(sub.id, planConfig))!;
      } else {
        sub = await storage.createSubscription({ storeId, ...planConfig, currentMonthOrders: 0, isActive: 1 });
      }
      res.json(sub);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // AGENT PERFORMANCE & DELETE
  // ============================================================
  app.get("/api/agents/performance", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    // Optional filters from the Team page UI:
    //   ?magasinId=12  → only orders belonging to that magasin
    //   ?date=YYYY-MM-DD → action window (defaults to today on the server)
    const magasinIdRaw = req.query.magasinId as string | undefined;
    const magasinId = magasinIdRaw && magasinIdRaw !== 'all' ? Number(magasinIdRaw) : null;
    const date = (req.query.date as string | undefined) || undefined;
    res.json(await storage.getAgentPerformance(storeId, { magasinId, date }));
  });

  // Dashboard "Performance de l'Équipe" — assignment-based metrics in a date
  // window. Distinct from /api/agents/performance, which counts today's
  // actions and returns 0% on quiet days.
  app.get("/api/agents/performance-by-assignment", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const magasinIdRaw = req.query.magasinId as string | undefined;
    const magasinId = magasinIdRaw && magasinIdRaw !== 'all' ? Number(magasinIdRaw) : null;
    const dateFrom = (req.query.dateFrom as string | undefined) || null;
    const dateTo   = (req.query.dateTo   as string | undefined) || null;
    res.json(await storage.getAgentPerformanceByAssignment(storeId, { magasinId, dateFrom, dateTo }));
  });

  // ============================================================
  // MEDIA BUYER ENDPOINTS
  // ============================================================
  app.get("/api/media-buyer/stats", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    if (user.role !== 'media_buyer') return res.status(403).json({ message: "Accès réservé aux Media Buyers" });
    const platform = req.query.platform as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const city = req.query.city as string | undefined;
    const product = req.query.product as string | undefined;
    const campaign = req.query.campaign as string | undefined;
    const stats = await storage.getMediaBuyerStats(storeId, user.id, platform, dateFrom, dateTo, city, product, campaign);
    res.json(stats);
  });

  app.get("/api/media-buyer/orders", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    if (user.role !== 'media_buyer') return res.status(403).json({ message: "Accès réservé aux Media Buyers" });
    const buyerOrders = await storage.getOrdersByMediaBuyer(storeId, user.id);
    res.json(buyerOrders);
  });

  app.get("/api/media-buyers/summary", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!['owner', 'admin'].includes(user.role) && !user.isSuperAdmin) return res.status(403).json({ message: "Accès admin requis" });
    const storeId = user.storeId!;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    res.json(await storage.getMediaBuyersSummary(storeId, dateFrom, dateTo));
  });

  // ============================================================
  // UPDATE USER (PUT /api/users/:id)
  // ============================================================
  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const admin = req.user!;
      const agent = await storage.getUserById(userId);
      if (!agent) return res.status(404).json({ message: "Utilisateur non trouvé" });
      if (agent.storeId !== admin.storeId) return res.status(403).json({ message: "Accès refusé" });
      if (agent.role === 'owner' && admin.id !== userId) return res.status(400).json({ message: "Impossible de modifier un autre propriétaire" });

      const schema = z.object({
        username: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().nullable().optional(),
        paymentType: z.enum(["commission", "fixe"]).optional(),
        paymentAmount: z.number().min(0).optional(),
        distributionMethod: z.enum(["auto", "pourcentage", "produit", "region"]).optional(),
        isActive: z.number().int().min(0).max(1).optional(),
        roleInStore: z.enum(["confirmation", "suivi", "both"]).optional(),
        leadPercentage: z.number().min(0).max(100).optional(),
        allowedProductIds: z.array(z.number()).optional(),
        allowedRegions: z.array(z.string()).optional(),
        commissionRate: z.number().min(0).optional(),
        buyerCode: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);

      const userPayload: any = {};
      if (data.username !== undefined) userPayload.username = data.username;
      if (data.email !== undefined) userPayload.email = data.email;
      if (data.phone !== undefined) userPayload.phone = data.phone;
      if (data.paymentType !== undefined) userPayload.paymentType = data.paymentType;
      if (data.paymentAmount !== undefined) userPayload.paymentAmount = data.paymentAmount;
      // NOTE: distributionMethod is intentionally NOT copied to the user row.
      // It now lives on stores.distributionMethod (per-magasin). Any value sent
      // here from older clients is ignored — the magasins endpoint is the
      // single source of truth.
      if (data.isActive !== undefined) userPayload.isActive = data.isActive;
      if (data.buyerCode !== undefined) userPayload.buyerCode = data.buyerCode ? data.buyerCode.trim().toUpperCase() : null;

      if (Object.keys(userPayload).length > 0) {
        await storage.updateUser(userId, userPayload);
      }

      // Did anything that affects distribution change? Track for epoch bump below.
      // distributionMethod is intentionally OMITTED — it now lives on the
      // magasin row, not on the user. Stale clients that still send it will
      // be ignored upstream (no-op in userPayload) and we no longer trigger
      // a global account-wide reset from this endpoint.
      const distAffected =
        data.leadPercentage !== undefined ||
        data.roleInStore !== undefined ||
        data.allowedProductIds !== undefined ||
        data.allowedRegions !== undefined ||
        data.isActive !== undefined;

      if (agent.role === 'agent') {
        const settingsPayload: any = {};
        if (data.roleInStore !== undefined) settingsPayload.roleInStore = data.roleInStore;
        if (data.leadPercentage !== undefined) settingsPayload.leadPercentage = data.leadPercentage;
        if (data.allowedProductIds !== undefined) settingsPayload.allowedProductIds = JSON.stringify(data.allowedProductIds);
        if (data.allowedRegions !== undefined) settingsPayload.allowedRegions = JSON.stringify(data.allowedRegions);
        if (data.commissionRate !== undefined) settingsPayload.commissionRate = data.commissionRate;
        if (Object.keys(settingsPayload).length > 0) {
          await storage.upsertStoreAgentSetting(userId, admin.storeId!, null, settingsPayload);
        }
      }

      // Bump distribution_epoch on every magasin affected by this change so the
      // percentage engine doesn't poison fresh % targets with historical counts.
      // distributionMethod is no longer a per-user concept (now per-magasin),
      // so the only path here is agent-level rule changes.
      if (distAffected && agent.role === 'agent') {
        const n = await bumpAgentRelatedEpochs(admin.id, userId);
        console.log(`[DIST-EPOCH] agent ${userId} settings change → bumped ${n} magasin(s)`);
      }

      const updated = await storage.getUserById(userId);
      const { password: _, ...safeUser } = updated as any;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/agents/:id", requireAdmin, async (req, res) => {
    const agentId = Number(req.params.id);
    const agent = await storage.getUserById(agentId);
    if (!agent) return res.status(404).json({ message: "Agent non trouvé" });
    if (agent.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
    if (agent.role === 'owner') return res.status(400).json({ message: "Impossible de supprimer le propriétaire" });
    await storage.deleteUser(agentId);
    // Removing an agent changes the eligible pool — reset windows on affected magasins.
    const n = await bumpAgentRelatedEpochs(req.user!.id, agentId);
    console.log(`[DIST-EPOCH] agent ${agentId} deleted → bumped ${n} magasin(s)`);
    res.json({ message: "Supprimé" });
  });

  app.get("/api/agents/:id/products", requireAuth, async (req, res) => {
    const agentId = Number(req.params.id);
    const agent = await storage.getUserById(agentId);
    if (!agent || agent.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
    res.json(await storage.getAgentProducts(agentId));
  });

  app.put("/api/agents/:id/products", requireAdmin, async (req, res) => {
    const agentId = Number(req.params.id);
    const agent = await storage.getUserById(agentId);
    if (!agent || agent.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) return res.status(400).json({ message: "productIds doit être un tableau" });
    const result = await storage.setAgentProducts(agentId, req.user!.storeId!, productIds);
    res.json(result);
  });

  // ============================================================
  // AGENT STORE SETTINGS (role, lead %, allowed products)
  // ============================================================
  app.get("/api/agents/store-settings", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const settings = await storage.getStoreAgentSettings(storeId);
    res.json(settings);
  });

  app.put("/api/agents/:id/store-settings", requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const agent = await storage.getUserById(agentId);
      if (!agent || agent.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });
      const schema = z.object({
        roleInStore: z.enum(["confirmation", "suivi", "both"]).optional(),
        leadPercentage: z.number().min(0).max(100).optional(),
        allowedProductIds: z.array(z.number()).optional(),
        allowedRegions: z.array(z.string()).optional(),
        commissionRate: z.number().min(0).optional(),
      });
      const data = schema.parse(req.body);
      const payload: any = {};
      if (data.roleInStore !== undefined) payload.roleInStore = data.roleInStore;
      if (data.leadPercentage !== undefined) payload.leadPercentage = data.leadPercentage;
      if (data.allowedProductIds !== undefined) payload.allowedProductIds = JSON.stringify(data.allowedProductIds);
      if (data.allowedRegions !== undefined) payload.allowedRegions = JSON.stringify(data.allowedRegions);
      if (data.commissionRate !== undefined) payload.commissionRate = data.commissionRate;
      const result = await storage.upsertStoreAgentSetting(agentId, storeId, null, payload);
      // Any of role / lead% / allowed products / allowed regions affects distribution.
      const distChanged =
        data.roleInStore !== undefined ||
        data.leadPercentage !== undefined ||
        data.allowedProductIds !== undefined ||
        data.allowedRegions !== undefined;
      if (distChanged) {
        const n = await bumpAgentRelatedEpochs(req.user!.id, agentId);
        console.log(`[DIST-EPOCH] /store-settings change for agent ${agentId} → bumped ${n} magasin(s)`);
      }
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // PER-MAGASIN LEAD PERCENTAGES (one row per agent × magasin)
  // ============================================================
  // Returns the per-magasin percentages already configured for an agent.
  // Shape: [{ magasinId, leadPercentage }]
  app.get("/api/agents/:id/magasin-percentages", requireAuth, async (req, res) => {
    const agentId = Number(req.params.id);
    const storeId = req.user!.storeId!;
    const agent = await storage.getUserById(agentId);
    if (!agent || agent.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });
    const rows = await storage.getAgentMagasinSettings(agentId, storeId);
    const perMagasin = rows
      .filter((r: any) => r.magasinId != null)
      .map((r: any) => ({ magasinId: r.magasinId, leadPercentage: r.leadPercentage }));
    res.json(perMagasin);
  });

  // Bulk-write per-magasin percentages for one agent.
  // Body: { percentages: { [magasinId: number]: number } }
  // Each magasinId must be a magasin owned by the admin's account.
  app.put("/api/agents/:id/magasin-percentages", requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const agent = await storage.getUserById(agentId);
      if (!agent || agent.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });
      if (agent.role !== 'agent') return res.status(400).json({ message: "Cet utilisateur n'est pas un agent" });

      const schema = z.object({
        percentages: z.record(z.string(), z.number().min(0).max(100)),
      });
      const { percentages } = schema.parse(req.body);

      // Validate every magasin belongs to this account.
      const ownedMagasins = await storage.getStoresByOwner(req.user!.id);
      const ownedIds = new Set(ownedMagasins.map(m => m.id));
      const entries = Object.entries(percentages);
      for (const [magasinIdStr] of entries) {
        const mid = Number(magasinIdStr);
        if (!ownedIds.has(mid)) {
          return res.status(403).json({ message: `Magasin ${mid} non autorisé` });
        }
      }

      // Upsert one row per magasin.
      for (const [magasinIdStr, pct] of entries) {
        const mid = Number(magasinIdStr);
        await storage.upsertStoreAgentSetting(agentId, storeId, mid, { leadPercentage: pct });
      }

      // Bump distribution_epoch on every magasin we touched so the % engine
      // doesn't poison fresh % targets with historical counts.
      for (const [magasinIdStr] of entries) {
        await storage.bumpDistributionEpoch(Number(magasinIdStr));
      }
      console.log(`[DIST-EPOCH] /magasin-percentages agent=${agentId} → bumped ${entries.length} magasin(s)`);

      res.json({ ok: true, count: entries.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // AGENT DASHBOARD PERMISSIONS
  // ============================================================
  app.get("/api/agents/:id/permissions", requireAuth, async (req, res) => {
    const agentId = Number(req.params.id);
    const storeId = req.user!.storeId!;
    const agent = await storage.getUserById(agentId);
    if (!agent || agent.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });
    const permissions = await storage.getAgentPermissions(agentId);
    res.json(permissions);
  });

  app.patch("/api/agents/:id/permissions", requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const agent = await storage.getUserById(agentId);
      if (!agent || agent.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });
      if (agent.role !== 'agent') return res.status(400).json({ message: "Cet utilisateur n'est pas un agent" });
      const schema = z.object({
        show_store_orders: z.boolean().optional(),
        show_revenue: z.boolean().optional(),
        show_profit: z.boolean().optional(),
        show_charts: z.boolean().optional(),
        show_top_products: z.boolean().optional(),
        show_inventory: z.boolean().optional(),
        show_all_orders: z.boolean().optional(),
      });
      const permissions = schema.parse(req.body);
      await storage.updateAgentPermissions(agentId, permissions);
      res.json({ success: true, permissions });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // AGENT WALLET & COMMISSIONS SUMMARY
  // ============================================================
  app.get("/api/agents/wallet", requireAuth, async (req, res) => {
    const user = req.user!;
    const storeId = user.storeId!;
    const { dateFrom, dateTo, dateRange } = req.query as Record<string, string>;
    const wallet = await storage.getAgentWallet(user.id, storeId, { dateFrom, dateTo, dateRange });
    res.json(wallet);
  });

  /* GET /api/agents/my-stats — performance charts for the logged-in agent */
  app.get("/api/agents/my-stats", requireAuth, async (req: any, res: any) => {
    try {
      const user = req.user!;
      const storeId = user.storeId!;
      const agentId = user.id;

      // Filter params. `product` is filtered by NAME (legacy). `productId`
      // is the new numeric-ID filter that matches the unified dashboard
      // filter dropdown shape (so all 8 cards stay in lock-step).
      const { city, product, productId, dateRange, dateFrom, dateTo } =
        req.query as Record<string, string>;

      // Compute window from dateRange shortcut or custom range
      const now = new Date();
      let cutoff = new Date();
      let endDate: Date = new Date();

      if (dateFrom) {
        // Custom date range
        cutoff = new Date(dateFrom + 'T00:00:00');
        endDate = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();
      } else if (dateRange === 'today') {
        cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
        endDate = new Date(); endDate.setHours(23, 59, 59, 999);
      } else if (dateRange === 'yesterday') {
        cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1); cutoff.setHours(0, 0, 0, 0);
        endDate = new Date(); endDate.setDate(endDate.getDate() - 1); endDate.setHours(23, 59, 59, 999);
      } else if (dateRange === '7days') {
        cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'month') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === 'lastmonth') {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (dateRange === 'all') {
        cutoff = new Date('2020-01-01');
      } else {
        // default: ce mois
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const { orders: ordersTable } = await import("@shared/schema");
      const { and, gte, lte, eq: drEq } = await import("drizzle-orm");

      let agentOrders = await db
        .select()
        .from(ordersTable)
        .where(and(
          drEq(ordersTable.storeId, storeId),
          drEq(ordersTable.assignedToId, agentId),
          gte(ordersTable.createdAt, cutoff),
          lte(ordersTable.createdAt, endDate),
        ));

      // Build the unfiltered cities list (so dropdown stays populated after filtering)
      const allCities = [...new Set((agentOrders as any[]).map(o => o.customerCity).filter(Boolean))];

      // Apply city filter (case-insensitive contains)
      if (city && city !== 'all') {
        agentOrders = agentOrders.filter((o: any) =>
          (o.customerCity || '').toLowerCase().includes(city.toLowerCase())
        );
      }

      // Apply product filter (by ID first — matches unified dashboard filter
      // shape — then fall back to legacy name match if `product` was sent).
      if (productId && productId !== 'all') {
        const pid = Number(productId);
        if (!Number.isNaN(pid)) {
          agentOrders = agentOrders.filter((o: any) =>
            o.items?.some((i: any) => i.productId === pid)
          );
        }
      } else if (product && product !== 'all') {
        agentOrders = agentOrders.filter((o: any) => {
          const name =
            o.rawProductName ||
            o.items?.[0]?.rawProductName ||
            o.items?.[0]?.product?.name ||
            '';
          return name === product;
        });
      }

      // ── Daily counts (line chart) — respects the selected date range ──
      const dayMap = new Map<string, number>();
      const rangeStart = new Date(cutoff);
      const rangeEnd   = new Date(endDate);
      const diffMs   = rangeEnd.getTime() - rangeStart.getTime();
      const diffDays = Math.min(Math.ceil(diffMs / 86400000) + 1, 90);
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(rangeStart);
        d.setDate(d.getDate() + i);
        const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        dayMap.set(key, 0);
      }
      for (const o of agentOrders) {
        if (!o.createdAt) continue;
        const d = new Date(o.createdAt);
        const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + 1);
      }
      const daily = Array.from(dayMap.entries()).map(([date, orders]) => ({ date, orders }));

      // ── Status distribution ───────────────────────────────────────
      // confirme is CUMULATIVE: once confirmed, always counted regardless of
      // shipping stage. Mirrors the admin /api/stats/filtered (ADMIN_CONFIRMED set).
      // Sub-buckets (delivered, en_cours, refused) are disjoint SUBSETS of confirme.
      const AGENT_CONFIRMED = new Set([
        'confirme', 'confirme_reporte', 'confirmé', 'confirmed',
        'expédié', 'expedie', 'shipped',
        'attente de ramassage', 'attente ramassage',
        'in_progress', 'inprogress', 'en cours', 'transit',
        'delivered', 'livré', 'livrée',
        'refused', 'refusé', 'refusée', 'refusee',
        'retourné', 'retour recu', 'returned',
      ]);
      const AGENT_DELIVERED = new Set(['delivered', 'livré', 'livrée']);
      const AGENT_TRANSIT = new Set([
        'expédié', 'expedie', 'shipped',
        'attente de ramassage', 'attente ramassage',
        'in_progress', 'inprogress', 'en cours', 'transit',
      ]);
      const AGENT_REFUSED = new Set([
        'refused', 'refusé', 'refusée', 'refusee', 'retourné', 'returned',
      ]);
      const AGENT_CANCELLED_PREFIXES = ['annulé', 'annule'];
      const AGENT_CANCELLED_EXACT = new Set(['boite vocale', 'faux numéro', 'cancelled']);

      const buckets = { confirme: 0, delivered: 0, en_cours: 0, refused: 0, cancelled: 0 };
      for (const o of agentOrders) {
        const s = (o.status ?? '').toLowerCase().trim();
        // Cumulative confirmation — counted once per order regardless of stage
        if (AGENT_CONFIRMED.has(s)) buckets.confirme++;
        // Sub-breakdowns (mutually exclusive subsets of confirme)
        if (AGENT_DELIVERED.has(s)) buckets.delivered++;
        if (AGENT_TRANSIT.has(s))   buckets.en_cours++;
        if (AGENT_REFUSED.has(s))   buckets.refused++;
        // Cancelled = never reached confirmation
        if (AGENT_CANCELLED_PREFIXES.some(p => s.startsWith(p)) || AGENT_CANCELLED_EXACT.has(s)) {
          buckets.cancelled++;
        }
      }

      // Pie uses snapshot semantics (where orders ARE right now — no overlap).
      // "À expédier" = confirmed but not yet shipped (still in 'confirme' stage).
      const aExpedier = agentOrders.filter(o => {
        const s = (o.status ?? '').toLowerCase().trim();
        return s === 'confirme' || s === 'confirme_reporte' || s === 'confirmé' || s === 'confirmed';
      }).length;
      const byStatus = [
        { name: "À expédier", value: aExpedier,          color: "#0ea5e9" },
        { name: "En transit",  value: buckets.en_cours,   color: "#64748b" },
        { name: "Livrées",    value: buckets.delivered,  color: "#10b981" },
        { name: "Refusées",   value: buckets.refused,    color: "#f97316" },
        { name: "Annulées",   value: buckets.cancelled,  color: "#e11d48" },
      ].filter(b => b.value > 0);

      // ── Products breakdown (table) ────────────────────────────────
      const { orderItems: orderItemsTable, products: productsTable } = await import("@shared/schema");
      const agentOrderIds = (agentOrders as any[]).map(o => o.id);
      let itemRows: any[] = [];
      if (agentOrderIds.length > 0) {
        const { inArray: inArr } = await import("drizzle-orm");
        itemRows = await db
          .select({
            orderId: orderItemsTable.orderId,
            productId: orderItemsTable.productId,
            rawProductName: orderItemsTable.rawProductName,
            quantity: orderItemsTable.quantity,
            productName: productsTable.name,
          })
          .from(orderItemsTable)
          .leftJoin(productsTable, drEq(orderItemsTable.productId, productsTable.id))
          .where(inArr(orderItemsTable.orderId, agentOrderIds));
      }
      const orderToProduct: Record<number, { id: number; name: string }> = {};
      for (const row of itemRows) {
        if (!orderToProduct[row.orderId]) {
          orderToProduct[row.orderId] = {
            id: row.productId || 0,
            name: row.rawProductName || row.productName || 'Produit',
          };
        }
      }
      const productMap: Record<string, { id: number; name: string; total: number; confirmed: number; delivered: number }> = {};
      for (const o of agentOrders as any[]) {
        const pInfo = orderToProduct[o.id];
        const name = pInfo?.name || o.rawProductName || 'Produit';
        const pid  = pInfo?.id || 0;
        if (!productMap[name]) productMap[name] = { id: pid, name, total: 0, confirmed: 0, delivered: 0 };
        productMap[name].total++;
        const s = (o.status ?? '').toLowerCase().trim();
        if (AGENT_CONFIRMED.has(s)) {
          productMap[name].confirmed++;
        }
        if (s === 'delivered' || s === 'livré' || s === 'livrée') {
          productMap[name].delivered++;
        }
      }
      const products = Object.values(productMap).sort((a, b) => b.total - a.total);

      // ── KPI summary (filtered) ─────────────────────────────────────
      let nouveauCount = 0;
      let pasReponseCount = 0;
      for (const o of agentOrders) {
        const s = (o.status ?? '').toLowerCase().trim();
        if (s === 'nouveau' || s === 'new') nouveauCount++;
        if (s.startsWith('pas de réponse')) pasReponseCount++;
      }
      const total = agentOrders.length;
      const confirme = buckets.confirme;
      const delivered = buckets.delivered;
      const cancelled = buckets.cancelled;
      const refused = buckets.refused;
      const en_cours = buckets.en_cours;
      // confirme is now cumulative — rate = confirmed / total (no summing sub-buckets)
      const confirmRate = total > 0 ? Math.round((buckets.confirme / total) * 100) : 0;
      const totalShipped = en_cours + delivered + refused; // expédiés = en cours + livrés + retournés/refusés
      const deliverRate = totalShipped > 0 ? Math.round((delivered / totalShipped) * 100) : 0;

      res.json({
        daily,
        byStatus,
        totalOrders: total,
        cities: allCities,
        products,
        // KPI fields for agent dashboard cards
        total,
        confirme,
        delivered,
        cancelled,
        refused,
        en_cours,
        nouveau: nouveauCount,
        pasReponse: pasReponseCount,
        confirmRate,
        deliverRate,
        totalShipped,
      });
    } catch (err: any) {
      console.error("[/api/agents/my-stats]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/stats/commissions-summary", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    const { dateFrom, dateTo, month, agentId } = req.query as Record<string, string>;
    const summary = await storage.getCommissionsSummary(storeId, { dateFrom, dateTo, month, agentId });
    res.json(summary);
  });

  // ============================================================
  // ORDER FOLLOW-UP LOGS (Journal de Suivi)
  // ============================================================
  app.get("/api/orders/:id/followup-logs", requireAuth, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Commande non trouvée" });
    if (order.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
    const logs = await storage.getOrderFollowUpLogs(orderId);
    res.json(logs);
  });

  app.post("/api/orders/:id/followup-logs", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });
      if (order.storeId !== req.user!.storeId) return res.status(403).json({ message: "Accès refusé" });
      const schema = z.object({ note: z.string().min(1) });
      const { note } = schema.parse(req.body);
      const log = await storage.createOrderFollowUpLog({
        orderId,
        agentId: req.user!.id,
        agentName: req.user!.username,
        note,
      });
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ============================================================
  // DIGYLOG SHIPPING WEBHOOK — update order status from carrier
  // ============================================================
  app.post("/api/shipping/digylog/webhook", async (req, res) => {
    try {
      const storeId = req.query.store_id ? Number(req.query.store_id) : null;
      const { trackingNumber, status, message } = req.body || {};
      if (!trackingNumber || !status) {
        return res.status(400).json({ message: "trackingNumber and status required" });
      }
      // Map Digylog statuses to internal statuses
      const statusMap: Record<string, string> = {
        "livré": "delivered",
        "livrée": "delivered",
        "delivered": "delivered",
        "retourné": "retourné",
        "retournée": "retourné",
        "returned": "retourné",
        "en cours": "in_progress",
        "in_transit": "in_progress",
        "expédié": "in_progress",
        "shipped": "in_progress",
      };
      const internalStatus = statusMap[status.toLowerCase()] || status;

      // Find the order by tracking number
      if (storeId) {
        const ordersList = await storage.getOrdersByStore(storeId);
        const order = ordersList.find(o => o.trackNumber === trackingNumber);
        if (order) {
          await storage.updateOrderStatus(order.id, internalStatus);
          await storage.createOrderFollowUpLog({
            orderId: order.id,
            agentId: null,
            agentName: "Digylog",
            note: `Statut mis à jour automatiquement: ${status}${message ? ` — ${message}` : ''}`,
          });
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // DIGYLOG — STATUS TRACKING & SYNC
  // ══════════════════════════════════════════════════════════════════

  app.get("/api/shipping/digylog/track/:trackingNumber", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const { trackingNumber } = req.params;
      const accounts = await storage.getCarrierAccounts(storeId, "digylog");
      const account = accounts[0];
      if (!account) return res.status(400).json({ message: "Aucun compte Digylog configuré." });

      const { trackDigylogShipment } = await import("./services/carrier-service");
      const result = await trackDigylogShipment(trackingNumber, (account as any).apiKey, (account as any).apiUrl);

      if (result.error) return res.status(502).json({ message: result.error, rawResponse: result.rawResponse });
      res.json({ trackingNumber, rawStatus: result.rawStatus, mappedStatus: result.status, rawResponse: result.rawResponse });
    } catch (err) { throw err; }
  });

  app.post("/api/shipping/digylog/sync", requireAuth, requireActiveSubscription, async (req: any, res: any) => {
    // Guard: respond ONCE. Without this, an early return + a later res.json from the
    // sync loop both fire and Express throws ERR_HTTP_HEADERS_SENT. That used to
    // happen whenever Digylog API stalled long enough for the framework's 25s timeout
    // wrapper to also send a response.
    let responded = false;
    const safeJson = (status: number, body: any) => {
      if (responded || res.headersSent) return;
      responded = true;
      res.status(status).json(body);
    };

    try {
      const storeId = req.user!.storeId!;
      const accounts = await storage.getCarrierAccounts(storeId, "digylog");
      const account = accounts[0];
      if (!account) return safeJson(400, { message: "Aucun compte Digylog configuré." });

      const apiKey = (account as any).apiKey;
      const customUrl = (account as any).apiUrl || undefined;
      const { trackDigylogShipment } = await import("./services/carrier-service");

      const allOrders = await storage.getOrdersByStore(storeId);

      // Digylog tracking format: starts with S followed by 7+ alphanumeric chars (e.g. "SB9A3675N").
      // Used to recover orphan orders that have a Digylog-format tracking number but
      // no shippingProvider tag (created via webhook, CSV import, or a partial /shipping flow
      // that crashed before persisting the provider).
      const looksLikeDigylogTracking = (t: string): boolean => /^S[A-Z0-9]{6,}$/i.test(t);

      // Lenient match: include any order that
      //   (a) has a tracking number,
      //   (b) is not in a terminal state, AND
      //   (c) is either tagged as 'digylog', has no shippingProvider yet (and looks Digylog),
      //       or otherwise matches Digylog's format.
      const digylogOrders = allOrders.filter((o: any) => {
        if (!o.trackNumber) return false;
        if (["delivered", "refused", "Retour Recu"].includes(o.status || "")) return false;
        const provider = (o.shippingProvider || "").toLowerCase().trim();
        if (provider === "digylog") return true;
        if (provider === "" && looksLikeDigylogTracking(o.trackNumber)) return true;
        return false;
      });

      if (digylogOrders.length === 0) {
        return safeJson(200, { synced: 0, updated: 0, message: "Aucune commande Digylog à synchroniser." });
      }

      // Wall-clock budget: stop processing before the 25s framework timeout fires.
      // Worst-case Digylog tracking call is 15s + 200ms throttle, so 20s budget
      // guarantees we always emit a response. BATCH_SIZE is a hard cap on top.
      const BATCH_SIZE = 10;
      const BUDGET_MS = 20_000;
      const startedAt = Date.now();
      const batch = digylogOrders.slice(0, BATCH_SIZE);

      let updated = 0;
      let processed = 0;          // orders we actually attempted (for accurate `remaining`)
      let trackingErrors = 0;     // bad tracking / "No status found" — DO NOT trip apiDown
      const apiDownErrors: string[] = []; // explicit outage markers only
      const details: Array<{ orderId: number; trackingNumber: string; oldStatus: string; newStatus: string | null }> = [];

      // True iff the carrier-service signalled an explicit API outage (HTML/5xx response,
      // network failure). Bad-tracking errors like "No status found" are excluded so
      // a few unknown trackings don't poison the whole batch.
      const isOutageError = (msg: string | undefined | null, rawStatus?: string | null): boolean => {
        if (typeof rawStatus === 'string' && rawStatus.includes('<!DOCTYPE')) return true;
        if (!msg) return false;
        const m = msg.toLowerCase();
        return (
          m.includes('indisponible') ||
          m.includes('http 5') ||
          m.includes('econnrefused') ||
          m.includes('etimedout') ||
          m.includes('econnreset') ||
          m.includes('enotfound') ||
          m.includes('socket hang up')
        );
      };

      for (const order of batch) {
        // Stop before we blow past the framework timeout. Whatever was processed
        // is reported back, the rest goes into `remaining`.
        if (Date.now() - startedAt > BUDGET_MS) {
          console.warn(`[DIGYLOG-SYNC] budget exhausted after ${processed}/${batch.length} orders`);
          break;
        }
        processed++;

        try {
          const result = await trackDigylogShipment(order.trackNumber!, apiKey, customUrl);

          if (result.error || (typeof result.rawStatus === 'string' && result.rawStatus.includes('<!DOCTYPE'))) {
            if (isOutageError(result.error, result.rawStatus)) {
              apiDownErrors.push(`${order.trackNumber}: ${result.error || 'API HTML response'}`);
              if (apiDownErrors.length >= 3) {
                console.warn(`[DIGYLOG-SYNC] aborting batch — 3+ consecutive Digylog API outages`);
                break;
              }
            } else {
              // e.g. "No status found" for a tracking Digylog hasn't picked up yet.
              trackingErrors++;
            }
            continue;
          }

          // Persist deliveryCost if returned directly from tracking (and not yet set).
          if (result.deliveryCost && result.deliveryCost > 0 && !(order as any).shippingCost) {
            await storage.updateOrder(order.id, { shippingCost: result.deliveryCost });
          }

          // Persist livreur info from Digylog /infos.
          if (result.driverPhone || result.driverName) {
            await storage.updateOrder(order.id, {
              driverPhone: result.driverPhone || undefined,
              driverName:  result.driverName  || undefined,
            } as any);
          }

          if (result.status) {
            const statusChanged = result.status !== order.status;
            const providerEmpty = !(order as any).shippingProvider || String((order as any).shippingProvider).trim() === "";
            const updateData: any = {};

            // ALWAYS mirror the carrier's raw text into commentStatus so the Suivi tab
            // shows what Digylog actually said, even when the mapped status is unchanged.
            if (result.rawStatus && result.rawStatus !== (order as any).commentStatus) {
              updateData.commentStatus = result.rawStatus;
            }

            // Backfill shippingProvider on the first successful sync of an orphan order.
            // After this, the strict-match path picks it up too.
            if (providerEmpty) {
              updateData.shippingProvider = "digylog";
              console.log(`[DIGYLOG-SYNC] backfilled shippingProvider for order #${(order as any).orderNumber} (tracking=${order.trackNumber})`);
            }

            if (statusChanged) {
              await storage.updateOrderStatus(order.id, result.status);
              // Best-effort delivery cost lookup; never blocks the loop on its own errors.
              try {
                const networkId = (account as any).settings?.digylogNetworkId || (account as any).digylogNetworkId || 1;
                const cost = await getDigylogDeliveryCost(order.trackNumber!, apiKey, networkId, customUrl);
                if (cost && cost > 0) updateData.shippingCost = cost;
              } catch {}
            }

            if (Object.keys(updateData).length > 0) {
              await storage.updateOrder(order.id, updateData);
            }

            if (statusChanged) {
              await storage.createOrderFollowUpLog({
                orderId:   order.id,
                agentId:   null,
                agentName: "Digylog Sync",
                note:      `Statut synchronisé automatiquement: ${result.rawStatus} → ${result.status}`,
              });
              details.push({ orderId: order.id, trackingNumber: order.trackNumber!, oldStatus: order.status || "", newStatus: result.status });
              updated++;
            }
          }
        } catch (e: any) {
          // Thrown exception (vs returned error) — classify the same way.
          if (isOutageError(e?.message)) {
            apiDownErrors.push(`${order.trackNumber}: ${e?.message}`);
            if (apiDownErrors.length >= 3) {
              console.warn(`[DIGYLOG-SYNC] aborting batch — 3+ thrown outage errors`);
              break;
            }
          } else {
            trackingErrors++;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const apiDown = apiDownErrors.length >= 3;
      const remaining = digylogOrders.length - processed;
      console.log(`[DIGYLOG-SYNC] storeId=${storeId} processed=${processed}/${batch.length} updated=${updated} apiDownErrors=${apiDownErrors.length} trackingErrors=${trackingErrors} remaining=${remaining} apiDown=${apiDown}`);

      return safeJson(200, {
        synced: processed,
        updated,
        errored: apiDownErrors.length + trackingErrors,
        apiDownErrors: apiDownErrors.length,
        trackingErrors,
        remaining,
        apiDown,
        details,
        message: apiDown
          ? "L'API Digylog renvoie des erreurs 500. Réessayez dans quelques minutes."
          : remaining > 0
          ? `${processed} commande(s) traitée(s), ${updated} mise(s) à jour${trackingErrors > 0 ? `, ${trackingErrors} sans statut` : ''}. Encore ${remaining} en attente — recliquez pour continuer.`
          : `${updated} commande(s) mise(s) à jour${trackingErrors > 0 ? ` (${trackingErrors} sans statut)` : ''}. Toutes les commandes Digylog sont synchronisées.`,
      });
    } catch (err: any) {
      console.error('[DIGYLOG-SYNC] fatal', err?.message);
      return safeJson(500, { message: err?.message || 'Sync Digylog failed' });
    }
  });

  // One-time fix: revert orders wrongly marked as "delivered" due to bad status mapping
  app.post('/api/admin/fix-wrong-delivered', requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const orders = await storage.getOrdersByStore(storeId);
      const wrongStatuses = [
        'Confirmé par livreur', 'Confirmé par livreur *',
        'En cours de livraison', 'Sorti pour livraison',
        'Rappel en cours', 'Rappel en cours *',
      ];
      let fixed = 0;
      for (const order of orders) {
        if (order.status === 'delivered' && wrongStatuses.includes((order as any).commentStatus || '')) {
          await storage.updateOrderStatus(order.id, 'in_progress');
          fixed++;
          console.log(`[FIX-DELIVERED] Order #${(order as any).orderNumber} reverted from delivered → in_progress (commentStatus="${(order as any).commentStatus}")`);
        }
      }
      res.json({ fixed, message: `${fixed} commande(s) corrigée(s)` });
    } catch (err) { throw err; }
  });

  app.post('/api/admin/fix-shipping-cost', requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const { trackDigylogShipment } = await import('./services/carrier-service');
      const accounts = await storage.getCarrierAccounts(storeId, 'digylog');
      const account = accounts[0];
      if (!account) return res.status(400).json({ message: 'No Digylog account' });

      const allOrders = await storage.getOrdersByStore(storeId);
      const toFix = allOrders.filter((o: any) =>
        o.shippingProvider === 'digylog' &&
        o.trackNumber &&
        (!o.shippingCost || o.shippingCost === 0)
      );

      console.log(`[FIX-COST] Found ${toFix.length} orders with 0 shippingCost`);
      let fixed = 0;

      for (const order of toFix) {
        const result = await trackDigylogShipment(order.trackNumber!, (account as any).apiKey);
        const cost = result.deliveryCost;
        if (cost && cost > 0) {
          await storage.updateOrder(order.id, { shippingCost: cost });
          console.log(`[FIX-COST] #${(order as any).orderNumber} → shippingCost=${cost}`);
          fixed++;
        }
      }

      res.json({ checked: toFix.length, fixed, message: `${fixed} commandes corrigées` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // AMEEX — STATUS TRACKING & SYNC
  // ══════════════════════════════════════════════════════════════════

  /**
   * GET /api/shipping/ameex/track/:trackingNumber
   * Fetch live status for a single Ameex shipment.
   */
  app.get("/api/shipping/ameex/track/:trackingNumber", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const { trackingNumber } = req.params;

      const accounts = await storage.getCarrierAccounts(storeId, "ameex");
      const account = accounts[0];
      if (!account) {
        return res.status(400).json({ message: "Aucun compte Ameex configuré dans Intégrations → Sociétés de Livraison." });
      }

      const result = await trackAmeexShipment(
        trackingNumber,
        (account as any).apiKey,
        (account as any).apiUrl || undefined,
      );

      if (result.error) {
        return res.status(502).json({ message: result.error, rawResponse: result.rawResponse });
      }

      res.json({
        trackingNumber,
        rawStatus: result.rawStatus,
        mappedStatus: result.status,
        rawResponse: result.rawResponse,
      });
    } catch (err) {
      throw err;
    }
  });

  /**
   * POST /api/shipping/ameex/sync
   * Bulk-sync statuses for all orders currently shipped via Ameex.
   * Iterates over all orders with shipping_provider = 'ameex' and track_number set,
   * fetches their live status from Ameex, and updates the DB when status changed.
   */
  app.post("/api/shipping/ameex/sync", requireAuth, requireActiveSubscription, async (req, res) => {
    // Same single-response guard as the Digylog handler.
    let responded = false;
    const safeJson = (status: number, body: any) => {
      if (responded || res.headersSent) return;
      responded = true;
      res.status(status).json(body);
    };

    try {
      const storeId = req.user!.storeId!;

      const accounts = await storage.getCarrierAccounts(storeId, "ameex");
      const account = accounts[0];
      if (!account) {
        return safeJson(400, { message: "Aucun compte Ameex configuré dans Intégrations → Sociétés de Livraison." });
      }

      const apiKey    = (account as any).apiKey;
      const customUrl = (account as any).apiUrl || undefined;

      const allOrders = await storage.getOrdersByStore(storeId);

      // Lenient match for Ameex too: provider tagged as 'ameex' OR provider empty.
      // Excludes orphans whose tracking format clearly belongs to Digylog (S + 7+ chars)
      // so we don't waste tracking calls on cross-carrier pollution.
      const looksLikeDigylogTracking = (t: string): boolean => /^S[A-Z0-9]{6,}$/i.test(t);
      const ameexOrders = allOrders.filter((o: any) => {
        if (!o.trackNumber) return false;
        if (["delivered", "refused", "Retour Recu"].includes(o.status || "")) return false;
        const provider = (o.shippingProvider || "").toLowerCase().trim();
        if (provider === "ameex") return true;
        if (provider === "" && !looksLikeDigylogTracking(o.trackNumber)) return true;
        return false;
      });

      if (ameexOrders.length === 0) {
        return safeJson(200, { synced: 0, updated: 0, message: "Aucune commande Ameex à synchroniser." });
      }

      // Wall-clock budget. Ameex per-call timeout is 45s — much higher than Digylog —
      // so the budget is the real safety net here. BATCH_SIZE is a soft cap.
      const BATCH_SIZE = 10;
      const BUDGET_MS = 20_000;
      const startedAt = Date.now();
      const batch = ameexOrders.slice(0, BATCH_SIZE);

      let updated = 0;
      let processed = 0;
      let trackingErrors = 0;
      const apiDownErrors: string[] = [];
      const details: Array<{ orderId: number; trackingNumber: string; oldStatus: string; newStatus: string | null }> = [];

      // Same outage classifier as Digylog: only HTTP-5xx / network failures count as
      // "API down". A tracking number Ameex doesn't recognise is NOT outage.
      const isOutageError = (msg: string | undefined | null): boolean => {
        if (!msg) return false;
        const m = msg.toLowerCase();
        return (
          m.includes('indisponible') ||
          m.includes('http 5') ||
          m.includes('econnrefused') ||
          m.includes('etimedout') ||
          m.includes('econnreset') ||
          m.includes('enotfound') ||
          m.includes('socket hang up')
        );
      };

      for (const order of batch) {
        if (Date.now() - startedAt > BUDGET_MS) {
          console.warn(`[AMEEX-SYNC] budget exhausted after ${processed}/${batch.length} orders`);
          break;
        }
        processed++;

        try {
          const result = await trackAmeexShipment(order.trackNumber!, apiKey, customUrl);
          if (result.error) {
            if (isOutageError(result.error)) {
              apiDownErrors.push(`${order.trackNumber}: ${result.error}`);
              if (apiDownErrors.length >= 3) {
                console.warn(`[AMEEX-SYNC] aborting batch — 3+ consecutive Ameex API outages`);
                break;
              }
            } else {
              trackingErrors++;
            }
            continue;
          }
          if (result.status) {
            const statusChanged = result.status !== order.status;
            const providerEmpty = !(order as any).shippingProvider || String((order as any).shippingProvider).trim() === "";
            const updateData: any = {};

            if (result.rawStatus && result.rawStatus !== (order as any).commentStatus) {
              updateData.commentStatus = result.rawStatus;
            }
            if (providerEmpty) {
              updateData.shippingProvider = "ameex";
              console.log(`[AMEEX-SYNC] backfilled shippingProvider for order #${(order as any).orderNumber} (tracking=${order.trackNumber})`);
            }
            if (statusChanged) {
              await storage.updateOrderStatus(order.id, result.status);
            }
            if (Object.keys(updateData).length > 0) {
              await storage.updateOrder(order.id, updateData);
            }
            if (statusChanged) {
              await storage.createOrderFollowUpLog({
                orderId:   order.id,
                agentId:   null,
                agentName: "Ameex Sync",
                note:      `Statut synchronisé automatiquement: ${result.rawStatus} → ${result.status}`,
              });
              details.push({ orderId: order.id, trackingNumber: order.trackNumber!, oldStatus: order.status || "", newStatus: result.status });
              updated++;
            }
          }
        } catch (e: any) {
          if (isOutageError(e?.message)) {
            apiDownErrors.push(`${order.trackNumber}: ${e?.message}`);
            if (apiDownErrors.length >= 3) {
              console.warn(`[AMEEX-SYNC] aborting batch — 3+ thrown outage errors`);
              break;
            }
          } else {
            trackingErrors++;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const apiDown = apiDownErrors.length >= 3;
      const remaining = ameexOrders.length - processed;
      console.log(`[AMEEX-SYNC] storeId=${storeId} processed=${processed}/${batch.length} updated=${updated} apiDownErrors=${apiDownErrors.length} trackingErrors=${trackingErrors} remaining=${remaining} apiDown=${apiDown}`);

      return safeJson(200, {
        synced: processed,
        updated,
        errored: apiDownErrors.length + trackingErrors,
        apiDownErrors: apiDownErrors.length,
        trackingErrors,
        remaining,
        apiDown,
        details,
        message: apiDown
          ? "L'API Ameex renvoie des erreurs. Réessayez dans quelques minutes."
          : remaining > 0
          ? `${processed} commande(s) traitée(s), ${updated} mise(s) à jour${trackingErrors > 0 ? `, ${trackingErrors} sans statut` : ''}. Encore ${remaining} en attente — recliquez pour continuer.`
          : `${updated} commande(s) mise(s) à jour${trackingErrors > 0 ? ` (${trackingErrors} sans statut)` : ''}. Toutes les commandes Ameex sont synchronisées.`,
      });
    } catch (err: any) {
      console.error('[AMEEX-SYNC] fatal', err?.message);
      return safeJson(500, { message: err?.message || 'Sync Ameex failed' });
    }
  });

  // In-memory guard — prevents two carrier-sync loops for the same (store, provider)
  // from running at the same time (e.g. user clicks "Sync" while auto-sync is still working).
  const inFlightSyncs = new Set<string>();

  // Same pattern, separate set, for the historical-import endpoint.
  const inFlightImports = new Set<string>();

  /**
   * Resolve a safe magasinId for a webhook/import context. Returns null if the
   * candidate magasinId would cross tenant boundaries. Without this, a carrier
   * account configured (or tampered with) to point at someone else's magasin
   * would stamp orders with that magasin — a multi-tenant isolation breach.
   *
   * Falls back to: if the store owner has exactly one magasin, use that.
   */
  async function resolveSafeMagasinId(
    storeId: number,
    candidateMagasinId: number | null | undefined,
    fallbackOwnerId?: number,
  ): Promise<number | null> {
    try {
      if (candidateMagasinId) {
        const [parent, candidate] = await Promise.all([
          storage.getStore(storeId),
          storage.getStore(candidateMagasinId),
        ]);
        const parentOwner = (parent as any)?.ownerId;
        const candOwner   = (candidate as any)?.ownerId;
        if (parent && candidate && parentOwner && parentOwner === candOwner) {
          return candidateMagasinId;
        }
        console.warn(`[MAGASIN-ISOLATION] Rejected magasinId=${candidateMagasinId} for storeId=${storeId} — owner mismatch (parent=${parentOwner}, magasin=${candOwner})`);
      }

      // Fallback: single-magasin heuristic
      let ownerId = fallbackOwnerId;
      if (ownerId == null) {
        const ownerStore = await storage.getStore(storeId);
        ownerId = (ownerStore as any)?.ownerId;
      }
      if (ownerId) {
        const owned = await storage.getStoresByOwner(ownerId);
        const magasins = owned.filter((s: any) => s.id !== storeId);
        if (magasins.length === 1) return magasins[0].id;
      }
    } catch (e: any) {
      console.warn(`[resolveSafeMagasinId] failed: ${e?.message}`);
    }
    return null;
  }

  /**
   * Internal helper — pure function used by both:
   *   - the generic POST /api/shipping/:provider/sync route
   *   - the fire-and-forget auto-sync triggered when a carrier account is created
   *
   * Pulls live status from the carrier for every order in `storeId` that:
   *   - is shipped via `provider`
   *   - has a tracking number
   *   - is not in a terminal state (delivered / refused / Retour Recu)
   *
   * Throttled to ~5 req/s (200ms gap) to avoid hammering carrier APIs.
   * Returns `accountMissing: true` when the store has no account for this provider —
   * callers can map that to a 400 (HTTP) or just log (auto-sync).
   * Returns `skipped: true` when another sync for the same key is already running.
   */
  async function syncCarrierOrdersInternal(
    storeId: number,
    provider: string,
    options?: { magasinId?: number; since?: string }
  ): Promise<{
    synced: number;
    updated: number;
    details: Array<{ orderId: number; trackingNumber: string; oldStatus: string; newStatus: string | null }>;
    errors: Array<{ orderId: number; message: string }>;
    message?: string;
    accountMissing?: boolean;
    skipped?: boolean;
  }> {
    const p = (provider || '').toLowerCase();
    const lockKey = `${storeId}:${p}`;
    if (inFlightSyncs.has(lockKey)) {
      return { synced: 0, updated: 0, details: [], errors: [], skipped: true, message: `Une synchro ${p} est déjà en cours.` };
    }

    const accounts = await storage.getCarrierAccounts(storeId, p);
    const account = accounts[0];
    if (!account) {
      return { synced: 0, updated: 0, details: [], errors: [], accountMissing: true, message: `Aucun compte ${p} configuré.` };
    }

    inFlightSyncs.add(lockKey);
    try {
      return await runSyncLoop(p, storeId, account, options);
    } finally {
      inFlightSyncs.delete(lockKey);
    }
  }

  async function runSyncLoop(
    p: string,
    storeId: number,
    account: any,
    options?: { magasinId?: number; since?: string }
  ): Promise<{
    synced: number;
    updated: number;
    details: Array<{ orderId: number; trackingNumber: string; oldStatus: string; newStatus: string | null }>;
    errors: Array<{ orderId: number; message: string }>;
    message?: string;
  }> {

    const { trackByCarrier } = await import("./services/carrier-service");

    const allOrders = await storage.getOrdersByStore(storeId);
    let candidates = allOrders.filter((o: any) =>
      (o.shippingProvider || '').toLowerCase() === p &&
      o.trackNumber &&
      !['delivered', 'refused', 'Retour Recu'].includes(o.status || '')
    );
    if (options?.magasinId) {
      candidates = candidates.filter((o: any) => o.magasinId === Number(options.magasinId));
    }
    if (options?.since) {
      const sinceDate = new Date(options.since);
      candidates = candidates.filter((o: any) => o.createdAt && new Date(o.createdAt) >= sinceDate);
    }

    if (candidates.length === 0) {
      return { synced: 0, updated: 0, details: [], errors: [], message: `Aucune commande ${p} à synchroniser.` };
    }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let updated = 0;
    const errors: Array<{ orderId: number; message: string }> = [];
    const details: Array<{ orderId: number; trackingNumber: string; oldStatus: string; newStatus: string | null }> = [];

    for (const order of candidates) {
      try {
        const result = await trackByCarrier(p, order.trackNumber!, account);
        if (result.error) {
          errors.push({ orderId: order.id, message: result.error });
        } else if (result.status && result.status !== order.status) {
          await storage.updateOrderStatus(order.id, result.status);
          await storage.createOrderFollowUpLog({
            orderId:   order.id,
            agentId:   null,
            agentName: `${p} Sync`,
            note:      `Statut synchronisé: ${result.rawStatus ?? '—'} → ${result.status}`,
          });
          details.push({
            orderId: order.id,
            trackingNumber: order.trackNumber!,
            oldStatus: order.status || '',
            newStatus: result.status,
          });
          updated++;
        }
      } catch (e: any) {
        errors.push({ orderId: order.id, message: e?.message || 'Unknown error' });
      }
      await sleep(200);
    }

    console.log(`[CARRIER-SYNC] provider=${p} storeId=${storeId} checked=${candidates.length} updated=${updated} errors=${errors.length}`);
    return { synced: candidates.length, updated, details, errors };
  }

  /**
   * POST /api/shipping/:provider/sync
   * Generic, carrier-agnostic bulk-sync. Optional body: { since?: ISO, magasinId?: number }.
   * The legacy /api/shipping/ameex/sync and /api/shipping/digylog/sync routes still exist
   * for back-compat (the digylog one also persists driver info + delivery cost).
   */
  app.post("/api/shipping/:provider/sync", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const provider = String(req.params.provider || '').toLowerCase();
      const storeId = req.user!.storeId!;
      const { since, magasinId } = req.body || {};

      // Validate `since` early — silently filtering on an invalid date hides bugs.
      if (since !== undefined && since !== null && since !== '') {
        const d = new Date(since);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: `Paramètre "since" invalide (date attendue, reçu: ${since}).` });
        }
      }

      const result = await syncCarrierOrdersInternal(storeId, provider, { since, magasinId });
      if (result.accountMissing) {
        return res.status(400).json({ message: result.message });
      }
      // skipped (concurrent sync) and "no candidates" both return 200 — they're not errors.
      res.json(result);
    } catch (err: any) {
      console.error('[CARRIER-SYNC]', err?.message);
      res.status(500).json({ message: err?.message || 'Sync failed' });
    }
  });

  /**
   * POST /api/shipping/import-csv
   * Manual backfill via CSV — works around carriers (Digylog/Maystro) that
   * don't expose a "list all orders" endpoint. The merchant exports their
   * shipped orders from the carrier's dashboard, then uploads the CSV here.
   *
   * Accepts both `,` and `;` delimiters (Digylog French exports use `;`).
   * Required column: tracking. Everything else is best-effort.
   */
  const csvImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB is enough for ~30k rows
  });
  app.post("/api/shipping/import-csv", requireAuth, requireActiveSubscription, csvImportUpload.single('file'), async (req: any, res: any) => {
    try {
      const provider = String(req.body?.provider || 'digylog').toLowerCase();
      const storeId = req.user!.storeId!;
      if (!req.file) return res.status(400).json({ message: 'Fichier CSV manquant.' });

      const csvText = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
      const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      if (lines.length < 2) return res.status(400).json({ message: 'CSV vide ou sans données.' });

      // Detect delimiter from the header row.
      const firstLine = lines[0];
      const delim = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');

      // Tiny CSV parser that respects "quoted, fields, with, commas".
      const parseRow = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"' ) {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === delim && !inQ) {
            out.push(cur); cur = '';
          } else cur += ch;
        }
        out.push(cur);
        return out.map(s => s.trim());
      };

      const headers = parseRow(firstLine).map(h => h.toLowerCase().replace(/^"|"$/g, ''));
      const colIdx = (...names: string[]) => {
        for (const n of names) {
          const i = headers.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };
      const TRACK = colIdx('tracking','traking','code','tracking_number','trackingnumber','barcode','code_suivi');
      const NAME  = colIdx('name','nom','client','customer','customer_name','client_name');
      const PHONE = colIdx('phone','tel','telephone','téléphone','gsm','mobile','customer_phone');
      const ADDR  = colIdx('address','adresse','customer_address');
      const CITY  = colIdx('city','ville','customer_city');
      const PRICE = colIdx('price','prix','total','amount','cod');
      const STAT  = colIdx('status','statut','etat','état');
      const FRAIS = colIdx('deliverycost','delivery_cost','frais_livraison','frais','port','shipping_cost');

      if (TRACK < 0) {
        return res.status(400).json({
          message: `Colonne 'tracking' introuvable dans le CSV. Colonnes détectées: ${headers.join(', ')}`,
        });
      }

      const { mapDigylogStatus } = await import("./services/carrier-service");

      // Resolve magasin with tenant-isolation validation.
      const accounts = await storage.getCarrierAccounts(storeId, provider);
      const candidateMagasinId = accounts[0] ? (accounts[0] as any).magasinId : null;
      const magasinId = await resolveSafeMagasinId(storeId, candidateMagasinId, req.user!.id);

      const parseMoney = (val: string | undefined): number => {
        if (!val) return 0;
        const cleaned = val.replace(/[^\d.,-]/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : Math.round(n * 100);
      };

      let created = 0, skipped = 0, errors = 0;
      const errorDetails: Array<{ row: number; tracking: string; message: string }> = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const cells = parseRow(lines[i]);
          const tracking = (cells[TRACK] || '').replace(/^"|"$/g, '').trim();
          if (!tracking) { errors++; errorDetails.push({ row: i + 1, tracking: '', message: 'tracking vide' }); continue; }

          const existing = await storage.getOrderByTrackingNumber(storeId, tracking);
          if (existing) { skipped++; continue; }

          const rawStatus = STAT >= 0 ? (cells[STAT] || '') : '';
          await storage.createOrderFromCarrier({
            storeId,
            magasinId,
            provider,
            trackingNumber: tracking,
            customerName:    NAME  >= 0 ? (cells[NAME]  || 'Client (CSV)') : 'Client (CSV)',
            customerPhone:   PHONE >= 0 ? (cells[PHONE] || '') : '',
            customerAddress: ADDR  >= 0 ? (cells[ADDR]  || '') : '',
            customerCity:    CITY  >= 0 ? (cells[CITY]  || '') : '',
            totalPrice:      PRICE >= 0 ? parseMoney(cells[PRICE]) : 0,
            shippingCost:    FRAIS >= 0 ? parseMoney(cells[FRAIS]) : 0,
            status:          mapDigylogStatus(rawStatus),
            rawStatus,
          });
          created++;
        } catch (e: any) {
          errors++;
          errorDetails.push({ row: i + 1, tracking: '', message: e?.message || 'unknown' });
          console.warn(`[CSV-IMPORT] row ${i + 1} failed: ${e?.message}`);
        }
      }

      console.log(`[CSV-IMPORT] storeId=${storeId} provider=${provider} total=${lines.length - 1} created=${created} skipped=${skipped} errors=${errors}`);
      res.json({ created, skipped, errors, total: lines.length - 1, errorDetails: errorDetails.slice(0, 10) });
    } catch (err: any) {
      console.error('[CSV-IMPORT] fatal', err?.message);
      res.status(500).json({ message: err?.message || 'Import CSV failed' });
    }
  });

  /**
   * POST /api/shipping/:provider/import-historical
   * One-shot backfill — pulls the full order list from the carrier and creates any
   * orders that don't exist in the platform yet. Different from `/sync` which only
   * updates statuses on orders that already exist.
   *
   * Optional body: { since?: ISO date } — only import orders shipped after that date.
   */
  app.post("/api/shipping/:provider/import-historical", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const provider = String(req.params.provider || '').toLowerCase();
      const storeId = req.user!.storeId!;
      const { since } = req.body || {};

      if (since !== undefined && since !== null && since !== '') {
        const d = new Date(since);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: `Paramètre "since" invalide (date attendue, reçu: ${since}).` });
        }
      }

      // In-memory lock — prevents double-click / concurrent imports from
      // racing into duplicate inserts before the per-row idempotency check fires.
      const lockKey = `${storeId}:${provider}`;
      if (inFlightImports.has(lockKey)) {
        return res.status(409).json({ message: `Un import ${provider} est déjà en cours. Patientez quelques secondes.` });
      }

      const accounts = await storage.getCarrierAccounts(storeId, provider);
      const account = accounts[0];
      if (!account) {
        return res.status(400).json({ message: `Aucun compte ${provider} configuré.` });
      }

      inFlightImports.add(lockKey);
      try {
        const { listOrdersFromCarrier } = await import("./services/carrier-service");
        const carrierOrders = await listOrdersFromCarrier(provider, account, { since });
        if (!carrierOrders || carrierOrders.length === 0) {
          return res.json({ created: 0, skipped: 0, total: 0, message: `Aucune commande à importer depuis ${provider}.` });
        }

        // Resolve magasin with tenant-isolation validation (rejects accounts
        // pointing at a magasin outside the user's owner scope).
        const magasinId = await resolveSafeMagasinId(storeId, (account as any).magasinId, req.user!.id);

        let created = 0, skipped = 0;
        const errors: Array<{ trackingNumber: string; message: string }> = [];

        for (const co of carrierOrders) {
          try {
            // Pre-check kept for the counter; createOrderFromCarrier also
            // re-checks internally as a last-line idempotency guard.
            const existing = await storage.getOrderByTrackingNumber(storeId, co.trackingNumber);
            if (existing) { skipped++; continue; }

            await storage.createOrderFromCarrier({
              storeId,
              magasinId,
              provider,
              trackingNumber:  co.trackingNumber,
              customerName:    co.customerName,
              customerPhone:   co.customerPhone,
              customerAddress: co.customerAddress,
              customerCity:    co.customerCity,
              totalPrice:      co.totalPrice,
              shippingCost:    co.shippingCost,
              status:          co.status,
              rawStatus:       co.rawStatus,
            });
            created++;
          } catch (e: any) {
            errors.push({ trackingNumber: co.trackingNumber, message: e?.message || 'unknown' });
          }
        }

        console.log(`[IMPORT-HISTORICAL] provider=${provider} storeId=${storeId} total=${carrierOrders.length} created=${created} skipped=${skipped} errors=${errors.length}`);
        res.json({ created, skipped, total: carrierOrders.length, errors });
      } finally {
        inFlightImports.delete(lockKey);
      }
    } catch (err: any) {
      console.error('[IMPORT-HISTORICAL]', err?.message);
      res.status(500).json({ message: err?.message || 'Import failed' });
    }
  });

  /**
   * POST /api/webhooks/shipping/ameex/:token
   * Receive push notifications from Ameex when a shipment status changes.
   * :token is the webhookToken from the carrier_accounts row.
   */
  app.post("/api/webhooks/shipping/ameex/:token", async (req, res) => {
    try {
      const { token } = req.params;
      // ── Webhook authentication ──────────────────────────────────────────
      // Reject obviously-short/missing tokens, then validate against the
      // carrier_accounts.webhookToken column. Without this, anyone who
      // can guess a tracking number can flip an order's status.
      if (!token || token.length < 18) {
        console.warn("[AMEEX-WEBHOOK] short/missing token — rejected");
        return res.status(401).json({ message: "Invalid webhook token" });
      }
      const [carrierAccount] = await db
        .select()
        .from(carrierAccounts)
        .where(and(eq(carrierAccounts.webhookToken, token), eq(carrierAccounts.carrierName, "ameex")));
      if (!carrierAccount) {
        console.warn(`[AMEEX-WEBHOOK] unknown token: ${token.slice(0, 12)}…`);
        return res.status(401).json({ message: "Invalid webhook token" });
      }
      if (carrierAccount.isActive === 0) {
        console.warn(`[AMEEX-WEBHOOK] token belongs to inactive account #${carrierAccount.id}`);
        return res.status(401).json({ message: "Carrier account inactive" });
      }

      const body = req.body || {};

      const trackingNumber: string | undefined =
        body.tracking_number || body.tracking || body.barcode || body.code_suivi || body.colis;
      const rawStatus: string | undefined =
        body.statut || body.status || body.etat;
      // TJG-{orderNumber} reference we sent to Ameex on creation — allows
      // correlation before the real tracking number arrives.
      const externalRef: string | undefined =
        body.ref || body.reference || body.external_id || body.client_ref;

      if (!trackingNumber && !externalRef) {
        return res.status(400).json({ message: "tracking_number or ref required" });
      }

      // 1. Match by tracking number (scoped to this carrier account's store)
      let order = trackingNumber
        ? await storage.getOrderByTrackingNumber(carrierAccount.storeId, trackingNumber)
        : null;

      // 2. Fallback: match by AMEEX-PENDING-TJG-{orderNumber} placeholder stored
      //    when Ameex returned a success shape but no real tracking yet.
      if (!order && trackingNumber) {
        const m = trackingNumber.match(/^AMEEX-PENDING-TJG-(.+)$/);
        if (m) {
          order = await storage.getOrderByOrderNumberAnyStore(m[1]);
          if (order) console.log(`[AMEEX-WEBHOOK] Matched by placeholder tracking=${trackingNumber} → order #${order.orderNumber}`);
        }
      }

      // 3. Fallback: match by TJG-{orderNumber} external ref Ameex echoes back
      if (!order && externalRef) {
        const m = externalRef.match(/TJG-(.+)/);
        if (m) {
          order = await storage.getOrderByOrderNumberAnyStore(m[1]);
          if (order) console.log(`[AMEEX-WEBHOOK] Matched by ref=${externalRef} → order #${order.orderNumber}`);
        }
      }

      if (!order) {
        console.warn(`[AMEEX-WEBHOOK] Order not found — tracking=${trackingNumber} ref=${externalRef} store=${carrierAccount.storeId}`);
        return res.json({ success: true, matched: false });
      }

      // If we stored a placeholder, patch it with the real tracking number now
      if (trackingNumber && order.trackNumber?.startsWith('AMEEX-PENDING-')) {
        await storage.updateOrder(order.id, { trackNumber: trackingNumber } as any);
        console.log(`[AMEEX-WEBHOOK] Resolved placeholder → real tracking ${trackingNumber} for order #${order.orderNumber}`);
      }

      if (rawStatus) {
        const mappedStatus = mapAmeexStatus(rawStatus);
        if (mappedStatus && mappedStatus !== order.status) {
          await storage.updateOrderStatus(order.id, mappedStatus);
          await storage.createOrderFollowUpLog({
            orderId:   order.id,
            agentId:   null,
            agentName: "Ameex Webhook",
            note:      `Statut mis à jour via webhook: ${rawStatus} → ${mappedStatus}`,
          });
          console.log(`[AMEEX-WEBHOOK] Order #${order.id} status: ${order.status} → ${mappedStatus}`);
        }
      }

      res.json({ success: true, matched: true });
    } catch (err) {
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // NOTE (P0-7 cleanup): the previous duplicate route
  //   POST /api/webhooks/carrier/:storeId/ameex
  // has been REMOVED. POST/PUT/etc. requests to that URL are handled by
  // the generic, token-authenticated route registered earlier:
  //   app.all("/api/webhooks/carrier/:storeId/:carrierName")
  // Removing the duplicate prevents future regressions if route order
  // ever changes (a duplicate registered LATER would be shadowed by the
  // generic one and silently bypass auth).

  app.post("/api/magasins/:id/logo", requireAdmin, async (req, res) => {
    const storeId = Number(req.params.id);
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Magasin non trouvé" });
    if (store.ownerId !== req.user!.id && storeId !== req.user!.storeId) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    const { logoData } = req.body;
    if (!logoData || typeof logoData !== 'string') {
      return res.status(400).json({ message: "Logo data requis (base64)" });
    }
    const base64Data = logoData.includes(',') ? logoData.split(',')[1] : logoData;
    const binarySize = Math.ceil(base64Data.length * 3 / 4);
    if (binarySize > 500000) {
      return res.status(400).json({ message: "Image trop volumineuse (max 500KB)" });
    }
    const mimeMatch = logoData.match(/^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml));base64,/);
    if (!mimeMatch && logoData.startsWith('data:')) {
      return res.status(400).json({ message: "Format non supporté. Utilisez PNG, JPEG, WebP ou GIF." });
    }
    const updated = await storage.updateStore(storeId, { logoUrl: logoData });
    res.json(updated);
  });

  app.get("/api/magasins", requireAuth, async (req, res) => {
    res.json(await storage.getStoresByOwner(req.user!.id));
  });

  app.post("/api/magasins", requireAdmin, async (req, res) => {
    const { name, phone, website, facebook, instagram, logoUrl, canOpen, isStock, isRamassage, whatsappTemplate, agentIds, services, linkedCarriers, linkedPlatforms, distributionMethod } = req.body;
    if (!name) return res.status(400).json({ message: "Nom requis" });
    const allowedDistMethods = ['auto', 'pourcentage', 'produit', 'region'];
    const distM = allowedDistMethods.includes(distributionMethod) ? distributionMethod : 'auto';
    const newStore = await storage.createStore({
      name, ownerId: req.user!.id,
      phone: phone || null, website: website || null, facebook: facebook || null,
      instagram: instagram || null, logoUrl: logoUrl || null, canOpen: canOpen ?? 1,
      isStock: isStock ?? 0, isRamassage: isRamassage ?? 0, whatsappTemplate: whatsappTemplate || null,
      agentIds: agentIds || [], services: services || [],
      linkedCarriers: linkedCarriers || [], linkedPlatforms: linkedPlatforms || [],
      distributionMethod: distM,
    } as any);
    await storage.createSubscription({ storeId: newStore.id, plan: 'starter', monthlyLimit: 1500, pricePerMonth: 20000, currentMonthOrders: 0, isActive: 1 });
    res.json(newStore);
  });

  app.patch("/api/magasins/:id", requireAdmin, async (req, res) => {
    const storeId = Number(req.params.id);
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Magasin non trouvé" });
    if (store.ownerId !== req.user!.id && storeId !== req.user!.storeId) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    const allowedFields = [
      'name', 'phone', 'website', 'facebook', 'instagram', 'logoUrl',
      'canOpen', 'isStock', 'isRamassage', 'whatsappTemplate', 'packagingCost',
      'agentIds', 'services', 'linkedCarriers', 'linkedPlatforms',
      'distributionMethod',
    ];
    const allowedDistMethods = ['auto', 'pourcentage', 'produit', 'region'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }
    if (updateData.distributionMethod !== undefined && !allowedDistMethods.includes(updateData.distributionMethod)) {
      return res.status(400).json({ message: "Méthode de distribution invalide" });
    }
    const updated = await storage.updateStore(storeId, updateData);

    // If the eligible-agent pool, platform linking, OR the per-magasin
    // distribution method changed, bump the magasin's distribution_epoch so
    // fresh percentages aren't poisoned by historical orders.
    const distFieldsChanged = ['agentIds', 'linkedPlatforms', 'distributionMethod'].some(f => req.body[f] !== undefined);
    if (distFieldsChanged) {
      try {
        await storage.bumpDistributionEpoch(storeId);
        console.log(`[DIST-EPOCH] magasin ${storeId} agentIds/linkedPlatforms change → epoch bumped`);
      } catch (err) {
        console.warn('[DIST-EPOCH] bump failed (non-fatal):', err);
      }
    }

    res.json(updated);
  });

  // Manual reset of distribution counter (admin-only, scoped to one magasin).
  // Wipes the percentage count window AND the round-robin pointer.
  app.post("/api/magasins/:id/reset-distribution", requireAdmin, async (req, res) => {
    const magasinId = Number(req.params.id);
    const magasin = await storage.getStore(magasinId);
    if (!magasin) return res.status(404).json({ message: "Magasin non trouvé" });
    if (magasin.ownerId !== req.user!.id && magasinId !== req.user!.storeId) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    await storage.resetDistribution(magasinId);
    console.log(`[DIST-EPOCH] manual reset → magasin=${magasinId} by user=${req.user!.id}`);
    res.json({ success: true, distributionEpoch: new Date().toISOString() });
  });

  // "Reset all my magasins" — convenience for the Team page header button.
  app.post("/api/magasins/reset-distribution-all", requireAdmin, async (req, res) => {
    const owned = await storage.getStoresByOwner(req.user!.id);
    for (const m of owned) await storage.resetDistribution(m.id);
    console.log(`[DIST-EPOCH] manual reset-all → ${owned.length} magasin(s) by user=${req.user!.id}`);
    res.json({ success: true, count: owned.length, distributionEpoch: new Date().toISOString() });
  });

  // ── Live distribution-config inspector ────────────────────────────────────
  // GET /api/_debug/distribution/:magasinId
  // One-shot snapshot answering: "is this magasin actually configured for
  // pourcentage in the DB, and how many orders has each agent received since
  // the current epoch?" Useful when production behaviour disagrees with the UI.
  // Admin-only AND scoped to the caller's owned magasins (no cross-tenant peek).
  app.get("/api/_debug/distribution/:magasinId", requireAdmin, async (req, res) => {
    try {
      const magasinId = Number(req.params.magasinId);
      if (!Number.isFinite(magasinId) || magasinId <= 0) {
        return res.status(400).json({ message: "magasinId invalide" });
      }

      const [magasin] = await db.select().from(stores).where(eq(stores.id, magasinId)).limit(1);
      if (!magasin) return res.status(404).json({ message: "Magasin non trouvé" });

      // Tenant guard — the caller must own this magasin (or it must BE their store).
      if (magasin.ownerId !== req.user!.id && magasinId !== req.user!.storeId) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      // Per-agent settings keyed on this magasin (NOT the parent owner store).
      const settings = await db
        .select()
        .from(storeAgentSettings)
        .where(eq(storeAgentSettings.storeId, magasinId));

      // Order counts since the current distribution epoch (the window that
      // the percentage engine actually uses to compute "today's projected %").
      const sinceEpoch = magasin.distributionEpoch ?? new Date(0);
      const counts = await db
        .select({
          agentId: orders.assignedToId,
          count: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(and(eq(orders.magasinId, magasinId), gte(orders.createdAt, sinceEpoch)))
        .groupBy(orders.assignedToId);

      res.json({
        magasin: {
          id: magasin.id,
          name: magasin.name,
          ownerId: magasin.ownerId,
          distributionMethod: magasin.distributionMethod,
          distributionEpoch: magasin.distributionEpoch,
          agentIds: magasin.agentIds,
        },
        perAgentSettings: settings.map((s: any) => ({
          agentId: s.agentId,
          leadPercentage: s.leadPercentage,
          roleInStore: s.roleInStore,
          allowedProductIds: s.allowedProductIds,
          allowedRegions: s.allowedRegions,
        })),
        countsSinceEpoch: counts,
      });
    } catch (err) {
      console.error('[DIST-DEBUG]', err);
      res.status(500).json({ message: "Erreur interne", error: String(err) });
    }
  });

  app.delete("/api/magasins/:id", requireAdmin, async (req, res) => {
    const storeId = Number(req.params.id);
    if (storeId === req.user!.storeId) return res.status(400).json({ message: "Impossible de supprimer votre magasin actuel" });
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Magasin non trouvé" });
    if (store.ownerId !== req.user!.id) return res.status(403).json({ message: "Accès refusé" });
    await storage.deleteStore(storeId);
    res.json({ message: "Supprimé" });
  });

  // ============================================================
  // SUPER ADMIN ROUTES
  // ============================================================
  const requireSuperAdmin: typeof requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
    if (!req.user!.isSuperAdmin) return res.status(403).json({ message: "Accès refusé" });
    next();
  };

  app.get("/api/admin/stores", requireSuperAdmin, async (_req, res) => {
    res.json(await storage.getAllStores());
  });

  app.get("/api/admin/stats", requireSuperAdmin, async (_req, res) => {
    res.json(await storage.getGlobalStats());
  });

  app.patch("/api/admin/stores/:id/toggle", requireSuperAdmin, async (req, res) => {
    const storeId = Number(req.params.id);
    const { isActive } = z.object({ isActive: z.number() }).parse(req.body);
    await storage.toggleStoreActive(storeId, isActive);
    res.json({ message: "Mis à jour" });
  });

  app.patch("/api/admin/stores/:id/plan", requireSuperAdmin, async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      const { plan, monthlyLimit, pricePerMonth, planStartDate, planExpiryDate } = z.object({
        plan: z.string().min(1),
        monthlyLimit: z.number().int().min(0),
        pricePerMonth: z.number().int().min(0),
        planStartDate: z.string().optional().nullable(),
        planExpiryDate: z.string().optional().nullable(),
      }).parse(req.body);
      const startDate = planStartDate ? new Date(planStartDate) : null;
      const expiryDate = planExpiryDate ? new Date(planExpiryDate) : null;
      await storage.changePlan(storeId, plan, monthlyLimit, pricePerMonth, startDate, expiryDate);
      res.json({ message: "Plan mis à jour" });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  // Notification center — stores with expiring plans (≤5 days)
  app.get("/api/admin/notifications", requireSuperAdmin, async (_req, res) => {
    try {
      const allStores = await storage.getAllStores();
      const now = new Date();
      const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const expiring = allStores
        .filter(s => {
          const expiry = s.subscription?.planExpiryDate;
          if (!expiry) return false;
          const exp = new Date(expiry);
          return exp >= now && exp <= in5Days;
        })
        .map(s => ({
          storeId: s.id,
          storeName: s.name,
          ownerName: s.ownerName,
          ownerEmail: s.ownerEmail,
          ownerPhone: s.ownerPhone,
          plan: s.subscription?.plan,
          planExpiryDate: s.subscription?.planExpiryDate,
          daysLeft: Math.ceil((new Date(s.subscription!.planExpiryDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        }));
      res.json(expiring);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur" });
    }
  });

  app.post("/api/admin/stores/:id/reset-orders", requireSuperAdmin, async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      await storage.resetMonthlyOrders(storeId);
      res.json({ message: "Compteur réinitialisé" });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Erreur" });
    }
  });

  app.post("/api/admin/impersonate/:userId", requireSuperAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.userId);
      const targetUser = await storage.getUser(targetId);
      if (!targetUser) return res.status(404).json({ message: "Utilisateur introuvable" });
      if (targetUser.isSuperAdmin) return res.status(400).json({ message: "Impossible d'impersonner un Super Admin" });
      const originalId = req.user!.id;
      (req.session as any).originalSuperAdminId = originalId;
      req.logIn(targetUser, (err) => {
        if (err) return res.status(500).json({ message: "Erreur d'impersonation" });
        res.json({ message: `Connecté en tant que ${targetUser.username}`, username: targetUser.username });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur" });
    }
  });

  app.post("/api/admin/stop-impersonation", requireAuth, async (req, res) => {
    try {
      const originalId = (req.session as any).originalSuperAdminId;
      if (!originalId) return res.status(400).json({ message: "Pas en mode impersonation" });
      const superAdmin = await storage.getUser(originalId);
      if (!superAdmin) return res.status(404).json({ message: "Super Admin introuvable" });
      (req.session as any).originalSuperAdminId = undefined;
      req.logIn(superAdmin, (err) => {
        if (err) return res.status(500).json({ message: "Erreur de retour" });
        res.json({ message: "Retour au compte Super Admin" });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur" });
    }
  });

  /* ── Super Admin: List all owner users with verification status ── */
  app.get("/api/admin/users", requireSuperAdmin, async (_req, res) => {
    try {
      const allStores = await storage.getAllStores();
      const ownerRows = allStores.map((s: any) => ({
        id: s.ownerId,
        username: s.ownerName,
        email: s.ownerEmail,
        storeId: s.id,
        storeName: s.name,
        isEmailVerified: s.isEmailVerified ?? 0,
        isActive: s.ownerIsActive ?? 1,
        createdAt: s.ownerCreatedAt,
      })).filter((r: any) => r.id);
      res.json(ownerRows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* ── Super Admin: Manually verify a user's email ────────────────── */
  app.post("/api/admin/users/:id/verify", requireSuperAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const updated = await storage.updateUser(userId, { isEmailVerified: 1 });
      if (!updated) return res.status(404).json({ message: "Utilisateur introuvable" });
      res.json({ success: true, message: "Email vérifié manuellement" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============================================================
  // SEND TO DELIVERY (SHIPPING)
  // ============================================================
  app.post("/api/orders/:id/ship", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { provider } = z.object({ provider: z.string().min(1) }).parse(req.body);
      const storeId = req.user!.storeId!;

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });
      if (order.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });

      // ── Re-ship guard ───────────────────────────────────────────────────
      // Block already-shipped orders so the user can't accidentally create
      // duplicate tracking numbers in the carrier system. Same eligibility
      // rule as bulkShipOrders: status='confirme' AND no track number.
      if (order.status !== 'confirme') {
        return res.status(400).json({
          message: `Commande #${order.orderNumber} a le statut "${order.status}" — seules les commandes "Confirmé" peuvent être expédiées.`,
        });
      }
      if (order.trackNumber) {
        return res.status(400).json({
          message: `Commande #${order.orderNumber} a déjà été expédiée (suivi: ${order.trackNumber}). Réexpédition interdite pour éviter les doublons.`,
        });
      }

      // Smart dispatch: carrier accounts first, then legacy storeIntegrations
      const rawOrderCityForDispatch = (order.customerCity || '').trim();
      const creds = await storage.getAccountForShipping(storeId, provider, rawOrderCityForDispatch);
      console.log(`[CREDS-DEBUG] provider=${provider} carrierStoreName="${(creds as any)?.carrierStoreName}" keys=${JSON.stringify(Object.keys(creds || {}))}`);
      if (!creds) {
        return res.status(400).json({ message: `Transporteur ${provider} non connecté. Ajoutez un compte dans Intégrations → Sociétés de Livraison.` });
      }

      // Resolve product name: rawProductName on order → first item name → fallback
      const productName =
        (order as any).rawProductName ||
        (order.items && order.items.length > 0
          ? ((order.items[0] as any).rawProductName || order.items[0].product?.name || 'Produit')
          : 'Produit');

      // ── Auto-match city against carrier's city list ─────────────
      const carrierCityList: string[] = getDefaultCitiesForProvider(provider);
      const rawOrderCity = (order.customerCity || '').trim();
      const matchedCity = autoMatchCity(rawOrderCity, carrierCityList) || rawOrderCity;
      if (matchedCity !== rawOrderCity) {
        console.log(`[Ship] City auto-corrected: "${rawOrderCity}" → "${matchedCity}" for carrier ${provider}`);
      }

      // ── Calculate total quantity — items first, rawQuantity as fallback ──
      const orderQuantity: number = (() => {
        const items = order.items as any[] | undefined;
        if (Array.isArray(items) && items.length > 0) {
          const sum = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);
          if (sum > 0) return sum;
        }
        const raw = Number((order as any).rawQuantity);
        return raw > 0 ? raw : 1;
      })();
      console.log(`[SHIPPING-QTY] order=${orderId} items=${JSON.stringify((order.items as any[])?.map((i: any) => ({ p: i.rawProductName, q: i.quantity })))} → qty=${orderQuantity}`);

      // ── Call carrier API ──────────────────────────────────────────
      console.log(`[DIGYLOG-FINAL] order=${orderId} store="${(creds as any).digylogStoreName || (creds as any).carrierStoreName}" network=${(creds as any).digylogNetworkId} qty=${orderQuantity}`);
      // For Ameex: resolve city name → numeric city ID (required by Ameex API)
      let singleAmeexCityId: string | undefined;
      if (provider.toLowerCase() === 'ameex') {
        const resolved = await storage.getAmeexCityId(storeId, matchedCity);
        if (!resolved) {
          return res.status(422).json({
            message: `Ameex: Ville "${matchedCity}" non reconnue. Synchronisez les villes dans Paramètres → Transporteurs, puis réessayez.`,
            carrierMessage: 'City not found in ameex_cities',
          });
        }
        singleAmeexCityId = resolved;
      }

      const shipResult = await shipOrderToCarrier(provider, creds, {
        customerName:     order.customerName,
        phone:            order.customerPhone,
        city:             matchedCity,
        address:          order.customerAddress || order.customerCity || '',
        totalPrice:       order.totalPrice,
        productName,
        quantity:         orderQuantity,
        canOpen:          order.canOpen === 1,
        orderNumber:      order.orderNumber || String(orderId),
        orderId,
        storeId,
        note:             (order as any).comment || "",
        carrierStoreName: (creds as any).carrierStoreName || "",
        digylogStoreName: (creds as any).digylogStoreName || (creds as any).carrierStoreName || "",
        digylogNetworkId: (creds as any).digylogNetworkId || 1,
        apiId:            (creds as any).apiSecret || (creds as any).settings?.apiId || '',
        apiSecret:        (creds as any).apiSecret || '',
        cityId:           singleAmeexCityId,
      });

      if (!shipResult.success) {
        // ── Carrier rejected — keep order status as 'confirme' ──────
        console.error(`[SHIPPING-LOG]: ❌ Order #${order.orderNumber} rejected by ${provider} (HTTP ${shipResult.httpStatus ?? '?'}): ${shipResult.error}`);
        await storage.createIntegrationLog({
          storeId, integrationId: null, provider,
          action: 'shipping_sent', status: 'fail',
          message: `❌ Commande #${order.orderNumber} refusée par ${provider} (HTTP ${shipResult.httpStatus ?? '?'}): ${shipResult.error}`,
        });
        return res.status(422).json({
          message:        shipResult.error || `Transporteur ${provider} a refusé la commande`,
          carrierMessage: shipResult.carrierMessage,
          httpStatus:     shipResult.httpStatus,
          rawResponse:    shipResult.rawResponse,
        });
      }

      // ── Success — update DB only after carrier confirms ───────────
      const { trackingNumber, labelUrl } = shipResult;

      // Hard guard: never save undefined/empty as the tracking number
      if (!trackingNumber) {
        console.error(`[SHIPPING-LOG]: ❌ Carrier returned success=true but trackingNumber is missing for order #${order.orderNumber}. Aborting DB save.`);
        await storage.createIntegrationLog({
          storeId, integrationId: null, provider,
          action: 'shipping_sent', status: 'fail',
          message: `❌ Commande #${order.orderNumber}: ${provider} a confirmé mais n'a pas retourné de numéro de suivi. La commande reste Confirmée.`,
        });
        return res.status(422).json({
          message: `${provider} n'a pas retourné de numéro de suivi. La commande reste Confirmée — vérifiez le portail ${provider}.`,
        });
      }

      console.log(`[SHIPPING-LOG]: ✅ Order #${order.orderNumber} dispatched via ${provider} — tracking: ${trackingNumber} (saved to track_number column)`);
      // Atomic single-update: same pattern as bulk-ship to avoid any chance
      // of partial state where the tracking number is saved but status
      // doesn't move (and vice versa).
      await storage.updateOrder(orderId, {
        trackNumber:      trackingNumber,
        labelLink:        labelUrl ?? null,
        shippingProvider: provider,
        carrierName:      provider,
        status:           'Attente De Ramassage',
      } as any);

      await storage.createIntegrationLog({
        storeId, integrationId: null, provider,
        action: 'shipping_sent', status: 'success',
        message: `✅ Commande #${order.orderNumber} envoyée via ${provider}. Tracking: ${trackingNumber}`,
      });

      res.json({ trackingNumber, labelLink: labelUrl, provider, success: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // RESET SHIPPING — admin only, clears carrier fields & reverts to confirme
  // ──────────────────────────────────────────────────────────────────
  app.post("/api/orders/:id/reset-shipping", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });

      const [updated] = await db
        .update(orders)
        .set({
          status:           'confirme',
          trackNumber:      null,
          labelUrl:         null,
          shippingProvider: null,
          carrierId:        null,
          carrierName:      null,
          driverName:       null,
          driverPhone:      null,
          shippingCost:     0,
          updatedAt:        new Date(),
          lastActionAt:     new Date(),
          lastActionBy:     req.user!.id,
        })
        .where(eq(orders.id, orderId))
        .returning();

      console.log(`[RESET-SHIPPING] Order #${orderId} (${order.orderNumber}) reset to confirme by user #${req.user!.id}`);
      res.json({ success: true, order: updated });
    } catch (err) {
      throw err;
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // CARRIER CITY MAPPING
  // ══════════════════════════════════════════════════════════════════

  /**
   * GET /api/carriers/cities?provider=digylog
   * Returns the city list for the given carrier (or all active shipping carriers).
   * Priority: stored cityList in credentials → default list for carrier → generic Moroccan list.
   */
  app.get("/api/carriers/cities", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const provider = (req.query.provider as string | undefined)?.toLowerCase().trim();

      // ── 1. Check DB-synced city cache (carrier_cities table) ─────────────
      // If the admin ran "Synchroniser les villes", this is the live list.
      if (provider) {
        const dbCities = await storage.getCarrierCities(storeId, provider);
        if (dbCities.length > 0) {
          return res.json({
            provider,
            cities: dbCities,
            isCarrierSpecific: true,
            source: "synced",
            count: dbCities.length,
          });
        }
      } else {
        // No provider given — try to find the default active carrier account
        const activeAccounts = await storage.getCarrierAccounts(storeId);
        const defaultAcct = activeAccounts.find(a => a.isActive === 1 && a.isDefault === 1)
          || activeAccounts.find(a => a.isActive === 1);
        if (defaultAcct) {
          const dbCities = await storage.getCarrierCities(storeId, defaultAcct.carrierName);
          if (dbCities.length > 0) {
            return res.json({
              provider: defaultAcct.carrierName,
              cities: dbCities,
              isCarrierSpecific: true,
              source: "synced",
              count: dbCities.length,
            });
          }
        }
      }

      // ── 1b. Try live Ameex cities if provider is ameex and no DB cache ──────
      if (provider === 'ameex') {
        try {
          const ameexAccts = await storage.getCarrierAccounts(storeId, 'ameex');
          const acct = ameexAccts[0];
          if (acct?.apiKey) {
            const axiosLib = (await import('axios')).default;
            const resp = await axiosLib.get(
              'https://app.ameex.ma/api/v1/cities',
              {
                headers: { 'Authorization': `Bearer ${acct.apiKey}`, 'Accept': 'application/json' },
                timeout: 10000,
                validateStatus: () => true,
              }
            );
            if (resp.status === 200 && resp.data) {
              const cityData = Array.isArray(resp.data) ? resp.data : (resp.data.data || resp.data.cities || []);
              const cityNames: string[] = cityData.map((c: any) => c.name || c.ville || c.label || c).filter(Boolean);
              if (cityNames.length > 0) {
                await storage.upsertCarrierCities(storeId, 'ameex', acct.id, cityNames);
                return res.json({ provider: 'ameex', cities: cityNames, isCarrierSpecific: true, source: 'live' });
              }
            }
            console.log(`[AMEEX-CITIES] HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 200)}`);
          }
        } catch (e: any) {
          console.error('[AMEEX-CITIES] Error:', e?.message);
        }
      }

      // ── 2. Fall back: legacy storeIntegrations credentials cityList ───────
      const integrations = await storage.getIntegrationsByStore(storeId, "shipping");

      if (!integrations.length) {
        // ── 3. Final fallback: static default list ───────────────────────────
        const staticCities = provider ? getDefaultCitiesForProvider(provider) : MOROCCAN_CITIES_DEFAULT;
        const isSpecific = provider ? staticCities !== MOROCCAN_CITIES_DEFAULT : false;
        return res.json({
          provider: provider || null,
          cities: staticCities,
          isCarrierSpecific: isSpecific,
          source: "default",
        });
      }

      const target = provider
        ? integrations.find(i => i.provider.toLowerCase() === provider)
        : integrations.find(i => i.isActive === 1) || integrations[0];

      if (!target) {
        const staticCities = provider ? getDefaultCitiesForProvider(provider) : MOROCCAN_CITIES_DEFAULT;
        return res.json({
          provider: provider || null,
          cities: staticCities,
          isCarrierSpecific: !!provider,
          source: "default",
        });
      }

      const creds = JSON.parse(target.credentials || "{}");
      const storedList: string[] | undefined = creds.cityList;
      const cities = Array.isArray(storedList) && storedList.length > 0
        ? storedList
        : getDefaultCitiesForProvider(target.provider);

      res.json({
        provider: target.provider,
        cities,
        isCarrierSpecific: true,
        source: Array.isArray(storedList) && storedList.length > 0 ? "stored" : "default",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * GET /api/carriers/cities/all
   * Returns all active shipping integrations with their city lists.
   * Priority per carrier: DB-synced carrier_cities → storeIntegrations credentials → static default.
   */
  app.get("/api/carriers/cities/all", requireAuth, async (req, res) => {
    try {
      const storeId  = req.user!.storeId!;
      const magasinId = req.query.magasin_id ? Number(req.query.magasin_id) : null;

      // ── 1. New system: carrier_accounts ──────────────────────────────────
      const accounts = await storage.getCarrierAccounts(storeId);
      if (accounts.length > 0) {
        // Filter by magasin: if magasinId given, include carriers with no magasin set (global)
        // OR carriers explicitly linked to that magasin.
        const filtered = magasinId
          ? accounts.filter(a => !(a as any).magasinId || (a as any).magasinId === magasinId)
          : accounts;

        const result = await Promise.all(
          filtered.map(async (acct) => {
            // Check DB-synced city cache first
            const dbCities = await storage.getCarrierCities(storeId, acct.carrierName);
            // If no cached cities, trigger background sync so next request has data
            if (dbCities.length === 0 && acct.apiKey) {
              (async () => {
                try {
                  const sanitize = (s: string) => s.replace(/[\r\n\t\x00-\x1F\x7F]/g, "").trim();
                  const apiKey = sanitize(acct.apiKey);
                  if (!apiKey) return;
                  const rawBase = (acct.apiUrl || "").replace(/\/orders\s*$/i, "").replace(/\/+$/, "");
                  const base = (rawBase || "https://api.digylog.com/api/v2/seller")
                    .replace(/api\.digylog\.ma/i, "api.digylog.com")
                    .replace(/app\.digylog\.com/i, "api.digylog.com");
                  const citiesUrl = `${base}/cities`;
                  const axiosLib = (await import("axios")).default;
                  const resp = await axiosLib.get(citiesUrl, {
                    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
                    timeout: 15_000,
                    validateStatus: () => true,
                  });
                  if (resp.status !== 200) return;
                  const raw = resp.data;
                  const cityList: any[] =
                    Array.isArray(raw) ? raw :
                    Array.isArray(raw?.data) ? raw.data :
                    Array.isArray(raw?.cities) ? raw.cities :
                    Array.isArray(raw?.data?.cities) ? raw.data.cities : [];
                  const cities: string[] = cityList
                    .map((c: any) => (typeof c === "string" ? c : (c?.name || c?.city_name || c?.label || "")).trim())
                    .filter(Boolean).sort();
                  if (cities.length > 0) {
                    await storage.upsertCarrierCities(storeId, acct.carrierName, acct.id, cities);
                    console.log(`[CitiesAutoSync] Synced ${cities.length} cities for ${acct.carrierName} account #${acct.id}`);
                  }
                } catch (e: any) {
                  console.warn(`[CitiesAutoSync] Failed for account #${acct.id}:`, e?.message);
                }
              })();
            }
            const cities = dbCities.length > 0
              ? dbCities
              : getDefaultCitiesForProvider(acct.carrierName);
            const logo = CARRIER_LOGOS_SERVER[acct.carrierName.toLowerCase()] ?? null;
            return {
              id: acct.id,
              provider: acct.carrierName,
              magasinId: (acct as any).magasinId ?? null,
              isActive: acct.isActive,
              cities,
              logo,
              deliveryFee: (acct as any).deliveryFee || 0,
              deliveryFeeDH: (((acct as any).deliveryFee || 0) / 100).toFixed(2),
              source: dbCities.length > 0 ? "synced" : "default",
              cityCount: cities.length,
            };
          })
        );
        return res.json(result);
      }

      // ── 2. Legacy system: storeIntegrations ───────────────────────────────
      const integrations = await storage.getIntegrationsByStore(storeId, "shipping");

      if (!integrations.length) {
        // ── 3. Absolute fallback: Moroccan city list as a single "default" entry
        return res.json([{
          id: null, provider: "default", isActive: 1,
          cities: MOROCCAN_CITIES_DEFAULT, logo: null, source: "default", cityCount: MOROCCAN_CITIES_DEFAULT.length,
        }]);
      }

      const result = integrations.map(i => {
        const creds = JSON.parse(i.credentials || "{}");
        const storedList: string[] | undefined = creds.cityList;
        const cities = Array.isArray(storedList) && storedList.length > 0
          ? storedList
          : getDefaultCitiesForProvider(i.provider);
        const logo = CARRIER_LOGOS_SERVER[i.provider.toLowerCase()] ?? null;
        return {
          id: i.id,
          provider: i.provider,
          isActive: i.isActive,
          cities,
          logo,
          source: Array.isArray(storedList) && storedList.length > 0 ? "stored" : "default",
          cityCount: cities.length,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * POST /api/carriers/refresh-cities
   * Attempt to fetch the city list from the carrier's API and cache it in credentials.
   * Falls back gracefully to the default list if the API call fails.
   */
  app.post("/api/carriers/refresh-cities", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const { provider } = z.object({ provider: z.string().min(1) }).parse(req.body);

      const integration = await storage.getIntegrationByProvider(storeId, provider);
      if (!integration || integration.type !== "shipping") {
        return res.status(404).json({ message: `Transporteur ${provider} non connecté` });
      }

      const creds = JSON.parse(integration.credentials || "{}");
      const apiKey = creds.apiKey || "";

      let fetchedCities: string[] | null = null;
      let fetchError: string | null = null;

      // ── Digylog / Eco-Track ──────────────────────────────────────────────
      if (provider.toLowerCase().includes("digylog") || provider.toLowerCase().includes("ecotrack")) {
        try {
          const DIGYLOG_ENDPOINTS = [
            "https://app.digylog.com/api/v1/cities",
            "https://api.digylog.com/api/v1/cities",
            "https://eco-track.ma/api/v2/cities",
            "https://production.eco-track.ma/api/v1/gouvernorats",
          ];
          for (const url of DIGYLOG_ENDPOINTS) {
            try {
              const r = await fetch(url, {
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                signal: AbortSignal.timeout(5000),
              });
              if (r.ok) {
                const data: any = await r.json();
                const cities: string[] = Array.isArray(data)
                  ? data.map((c: any) => c.name || c.ville || c.city || c).filter((c: any) => typeof c === "string")
                  : Array.isArray(data?.data)
                    ? data.data.map((c: any) => c.name || c.ville || c.city || c).filter((c: any) => typeof c === "string")
                    : [];
                if (cities.length > 5) { fetchedCities = cities.sort(); break; }
              }
            } catch { continue; }
          }
        } catch (e: any) {
          fetchError = e.message;
        }
      }

      // ── Cathedis ─────────────────────────────────────────────────────────
      if (!fetchedCities && provider.toLowerCase().includes("cathedis")) {
        try {
          const r = await fetch("https://api.cathedis.com/api/v1/cities", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const data: any = await r.json();
            fetchedCities = (Array.isArray(data) ? data : data?.cities || [])
              .map((c: any) => c.name || c.ville || c)
              .filter((c: any) => typeof c === "string")
              .sort();
          }
        } catch (e: any) { fetchError = e.message; }
      }

      const finalCities = fetchedCities && fetchedCities.length > 0
        ? fetchedCities
        : getDefaultCitiesForProvider(provider);

      await storage.updateIntegration(integration.id, {
        credentials: JSON.stringify({ ...creds, cityList: finalCities }),
      });

      res.json({
        provider,
        cities: finalCities,
        count: finalCities.length,
        source: fetchedCities ? "api" : "default",
        warning: fetchedCities ? null : `Impossible de récupérer depuis l'API (${fetchError || "erreur inconnue"}). Liste par défaut utilisée.`,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // PAYMENTS
  // ══════════════════════════════════════════════════════════════════

  /* ── PayPal helpers ───────────────────────────────────────────────── */
  const PAYPAL_BASE = process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  async function getPaypalToken(): Promise<string> {
    const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`PayPal auth failed: ${txt}`);
    }
    const data: any = await res.json();
    return data.access_token;
  }

  const PLAN_USD_STR: Record<string, string> = { starter: "19.99", pro: "39.99" };
  const PLAN_DH: Record<string, number>  = { starter: 20000, pro: 40000 };
  const PLAN_USD_CENT: Record<string, number> = { starter: 1999, pro: 3999 };
  const PLAN_LIMITS: Record<string, number>  = { starter: 1500, pro: 0 };

  // Create PayPal order
  app.post("/api/payments/paypal/create-order", requireAuth, async (req: any, res: any) => {
    try {
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
        return res.status(503).json({ message: "PayPal non configuré — ajoutez PAYPAL_CLIENT_ID et PAYPAL_SECRET dans les secrets." });
      }
      const { planId } = req.body;
      const amount = PLAN_USD_STR[planId] ?? "19.99";
      const token = await getPaypalToken();
      const order: any = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: amount }, description: `TajerGrow Plan ${planId}` }],
        }),
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json());
      if (!order.id) throw new Error(JSON.stringify(order));
      res.json({ orderID: order.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Capture PayPal order → instantly activate plan
  app.post("/api/payments/paypal/capture", requireAuth, async (req: any, res: any) => {
    try {
      const { orderID, planId } = req.body;
      if (!orderID || !planId) return res.status(400).json({ message: "orderID et planId requis" });

      const token = await getPaypalToken();
      const capture: any = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json());

      if (capture.status !== "COMPLETED") {
        return res.status(400).json({ message: `Paiement non complété: ${capture.status}` });
      }

      const storeId = req.user!.storeId!;
      const limit    = PLAN_LIMITS[planId]  ?? 1500;
      const priceDh  = PLAN_DH[planId]      ?? 20000;
      const priceUsd = PLAN_USD_CENT[planId] ?? 1999;
      const now = new Date();
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await storage.changePlan(storeId, planId, limit, priceDh, now, expiry);

      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
      await storage.createPayment({
        storeId, plan: planId, amountDh: priceDh, amountUsd: priceUsd,
        currency: "usd", method: "paypal", receiptUrl: null, status: "approved",
        ownerName: user?.username ?? null, ownerEmail: user?.email ?? null,
      });

      res.json({ success: true, plan: planId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* ── Polar.sh webhook ─────────────────────────────────────────────── */
  app.post("/api/webhooks/polar", async (req: any, res: any) => {
    try {
      const event = req.body ?? {};
      const eventType: string = event.type ?? "";
      if (!["subscription.created", "order.created", "subscription.active"].includes(eventType)) {
        return res.json({ received: true });
      }

      const customerEmail: string | undefined =
        event.data?.customer?.email ??
        event.data?.user?.email ??
        event.data?.billing_details?.email;

      if (!customerEmail) return res.json({ received: true });

      const [user] = await db.select().from(users).where(eq(users.email, customerEmail));
      if (!user?.storeId) return res.json({ received: true });

      const polarPlan: string = event.data?.product?.metadata?.plan ?? "starter";
      const planId = ["pro", "starter"].includes(polarPlan) ? polarPlan : "starter";
      const limit    = PLAN_LIMITS[planId]  ?? 1500;
      const priceDh  = PLAN_DH[planId]      ?? 20000;
      const priceUsd = PLAN_USD_CENT[planId] ?? 1999;
      const now = new Date();
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await storage.changePlan(user.storeId, planId, limit, priceDh, now, expiry);
      await storage.createPayment({
        storeId: user.storeId, plan: planId, amountDh: priceDh, amountUsd: priceUsd,
        currency: "usd", method: "polar", receiptUrl: null, status: "approved",
        ownerName: user.username ?? null, ownerEmail: user.email ?? null,
      });

      res.json({ received: true });
    } catch (err: any) {
      console.error("[Polar webhook]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // Upload receipt file
  app.post("/api/payments/receipt", requireAuth, receiptUpload.single("file"), (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // Upload product image — saved to uploads/products/
  app.post("/api/upload/product-image", requireAuth, productImageUpload.single("image"), (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni" });
    const url = `/uploads/products/${req.file.filename}`;
    const localPath = req.file.path;
    console.log(`[Upload] Product image saved: ${localPath} → URL: ${url}`);
    res.json({ url, localPath });
  });

  // Create a payment record (pending)
  app.post("/api/payments", requireAuth, async (req: any, res: any) => {
    try {
      const { plan, currency, method, receiptUrl } = req.body;
      if (!plan || !method) return res.status(400).json({ message: "Plan et méthode requis" });
      const storeId = req.user!.storeId;
      if (!storeId) return res.status(400).json({ message: "Aucun magasin associé" });

      const PLAN_PRICES: Record<string, { dh: number; usd: number }> = {
        starter: { dh: 20000, usd: 1999 },
        pro:     { dh: 40000, usd: 3999 },
        elite:   { dh: 70000, usd: 6999 },
      };
      const prices = PLAN_PRICES[plan] ?? PLAN_PRICES.starter;

      const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
      const payment = await storage.createPayment({
        storeId,
        plan,
        amountDh: prices.dh,
        amountUsd: prices.usd,
        currency: currency ?? "dh",
        method,
        receiptUrl: receiptUrl ?? null,
        status: "pending",
        ownerName: user?.username ?? null,
        ownerEmail: user?.email ?? null,
      });
      res.status(201).json(payment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get own payments (store owner)
  app.get("/api/payments", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId;
    if (!storeId) return res.json([]);
    res.json(await storage.getPaymentsByStore(storeId));
  });

  // Super admin: list all payments
  app.get("/api/admin/payments", requireAuth, async (req: any, res: any) => {
    if (!req.user?.isSuperAdmin) return res.status(403).json({ message: "Accès refusé" });
    res.json(await storage.getPayments());
  });

  // Super admin: approve payment
  app.patch("/api/admin/payments/:id/approve", requireAuth, async (req: any, res: any) => {
    if (!req.user?.isSuperAdmin) return res.status(403).json({ message: "Accès refusé" });
    await storage.approvePayment(Number(req.params.id));
    res.json({ success: true });
  });

  // Super admin: reject payment
  app.patch("/api/admin/payments/:id/reject", requireAuth, async (req: any, res: any) => {
    if (!req.user?.isSuperAdmin) return res.status(403).json({ message: "Accès refusé" });
    const { notes } = req.body;
    await storage.rejectPayment(Number(req.params.id), notes);
    res.json({ success: true });
  });

  // ══════════════════════════════════════════════════════════════════
  // AUTOMATION & AI MODULE
  // ══════════════════════════════════════════════════════════════════

  /* ── Clients for retargeting (with last product name) ─────────── */
  app.get("/api/automation/clients", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId;
    if (!storeId) return res.json([]);
    const status = (req.query.status as string) || "delivered";
    const rows = await db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerCity: orders.customerCity,
      status: orders.status,
      createdAt: orders.createdAt,
    }).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.status, status))).orderBy(desc(orders.createdAt)).limit(500);

    // Enrich with last product name from order_items
    const orderIds = rows.map(r => r.id);
    let productMap: Record<number, string> = {};
    if (orderIds.length > 0) {
      const { orderItems, products: productsTable } = await import("@shared/schema");
      const { inArray } = await import("drizzle-orm");
      const items = await db.select({
        orderId: orderItems.orderId,
        rawProductName: orderItems.rawProductName,
        productName: productsTable.name,
      })
      .from(orderItems)
      .leftJoin(productsTable, eq(orderItems.productId, productsTable.id))
      .where(inArray(orderItems.orderId, orderIds));
      for (const item of items) {
        if (item.orderId && !productMap[item.orderId]) {
          productMap[item.orderId] = item.productName || item.rawProductName || "";
        }
      }
    }
    res.json(rows.map(r => ({ ...r, lastProductName: productMap[r.id] || "" })));
  });

  /* ── Marketing campaigns ──────────────────────────────────────── */
  app.get("/api/automation/campaigns", requireAuth, async (req: any, res: any) => {
    res.json(await storage.getMarketingCampaigns(req.user!.storeId!));
  });

  app.post("/api/automation/campaigns", requireAuth, async (req: any, res: any) => {
    try {
      const { name, message, productLink, targetFilter, totalTargets } = req.body;
      const c = await storage.createMarketingCampaign({
        storeId: req.user!.storeId!, name, message, productLink: productLink || null,
        targetFilter: targetFilter || "delivered", status: "sent", totalTargets: totalTargets || 0, totalSent: totalTargets || 0,
      });
      res.status(201).json(c);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── Retargeting bulk send (uses Baileys, anti-ban queue) ────── */
  app.post("/api/automation/retargeting/send", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const { name, message, targetFilter, recipients, productLink, senderDeviceId, rotationEnabled, rotationDeviceIds } = req.body;
      // recipients: Array<{ id, phone, name, lastProduct }>
      if (!recipients?.length) return res.status(400).json({ message: "Aucun destinataire sélectionné." });
      if (!message?.trim())   return res.status(400).json({ message: "Message vide." });

      const finalMessage = productLink ? `${message}\n\n🔗 ${productLink}` : message;

      // Create the campaign record
      const campaign = await storage.createMarketingCampaign({
        storeId,
        name: name || `Campagne ${new Date().toLocaleDateString("fr-MA")}`,
        message: finalMessage,
        productLink: productLink || null,
        targetFilter: targetFilter || "delivered",
        status: "running",
        totalTargets: recipients.length,
        totalSent: 0,
        totalFailed: 0,
        senderDeviceId: senderDeviceId ? Number(senderDeviceId) : null,
        rotationEnabled: rotationEnabled ? 1 : 0,
      });

      // Start the background queue
      const { startCampaign } = await import("./campaign-engine");
      startCampaign(
        campaign.id,
        storeId,
        recipients.map((r: any) => ({ phone: r.phone, name: r.name || "", lastProduct: r.lastProduct || "" })),
        finalMessage,
        {
          senderDeviceId: senderDeviceId ? Number(senderDeviceId) : null,
          rotationEnabled: !!rotationEnabled,
          rotationDeviceIds: Array.isArray(rotationDeviceIds) ? rotationDeviceIds.map(Number) : [],
        },
      );

      res.json({ ok: true, campaignId: campaign.id, total: recipients.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* PATCH /api/automation/retargeting/:id/pause — toggle pause/resume */
  app.patch("/api/automation/retargeting/:id/pause", requireAuth, async (req: any, res: any) => {
    const { togglePause } = await import("./campaign-engine");
    const newStatus = togglePause(Number(req.params.id));
    if (!newStatus) return res.status(404).json({ message: "Campaign not running." });
    res.json({ ok: true, status: newStatus });
  });

  /* DELETE /api/automation/retargeting/:id — stop campaign */
  app.delete("/api/automation/retargeting/:id", requireAuth, async (req: any, res: any) => {
    const { stopCampaign } = await import("./campaign-engine");
    stopCampaign(Number(req.params.id));
    res.json({ ok: true });
  });

  /* GET /api/automation/retargeting/active — running campaigns for this store */
  app.get("/api/automation/retargeting/active", requireAuth, async (req: any, res: any) => {
    const { getActiveCampaignsForStore } = await import("./campaign-engine");
    const runs = getActiveCampaignsForStore(req.user!.storeId!);
    res.json(runs.map(r => ({ campaignId: r.campaignId, sent: r.sent, failed: r.failed, total: r.total, status: r.status, currentIndex: r.currentIndex })));
  });

  /* ── WhatsApp / Baileys session management ────────────────────── */

  /* GET /api/automation/whatsapp/status → { state, phone, qr } */
  app.get("/api/automation/whatsapp/status", requireAuth, async (req: any, res: any) => {
    const { getBaileysInstance } = await import("./baileys-service");
    const storeId: number = req.user!.storeId ?? 1;
    res.json(getBaileysInstance(storeId).getStatus());
  });

  /* POST /api/automation/whatsapp/connect → initiate Baileys connection */
  app.post("/api/automation/whatsapp/connect", requireAuth, async (req: any, res: any) => {
    try {
      const { getBaileysInstance } = await import("./baileys-service");
      const storeId: number = req.user!.storeId ?? 1;
      getBaileysInstance(storeId).start().catch(console.error);
      res.json({ ok: true, message: "Connexion en cours..." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* POST /api/automation/whatsapp/disconnect → logout + clear session */
  app.post("/api/automation/whatsapp/disconnect", requireAuth, async (req: any, res: any) => {
    try {
      const { getBaileysInstance } = await import("./baileys-service");
      const storeId: number = req.user!.storeId ?? 1;
      await getBaileysInstance(storeId).logout();
      res.json({ ok: true, message: "Déconnecté. Session effacée." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* POST /api/automation/whatsapp/reset → wipe session files + fresh QR */
  app.post("/api/automation/whatsapp/reset", requireAuth, async (req: any, res: any) => {
    try {
      const { getBaileysInstance } = await import("./baileys-service");
      const storeId: number = req.user!.storeId ?? 1;
      getBaileysInstance(storeId).resetAndRestart().catch(console.error);
      res.json({ ok: true, message: "Réinitialisation en cours — nouveau QR code bientôt disponible." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* POST /api/automation/whatsapp/test → send a test message to the owner's own number */
  app.post("/api/automation/whatsapp/test", requireAuth, async (req: any, res: any) => {
    try {
      const { getBaileysInstance } = await import("./baileys-service");
      const storeId: number = req.user!.storeId ?? 1;
      const instance = getBaileysInstance(storeId);
      const status = instance.getStatus();
      if (status.state !== "connected") {
        return res.status(400).json({ message: "WhatsApp n'est pas connecté." });
      }
      const testPhone = status.phone ?? "";
      if (!testPhone) {
        return res.status(400).json({ message: "Numéro de téléphone non disponible." });
      }
      const storeName = req.user?.username ?? "TajerGrow";
      const testMsg = `✅ *Test TajerGrow AI* — La connexion WhatsApp de votre boutique "${storeName}" est opérationnelle. Les confirmations automatiques sont actives. 🚀`;
      const { sendWhatsAppMessage } = await import("./whatsapp-service");
      const ok = await sendWhatsAppMessage(`+${testPhone}`, testMsg, storeId);
      if (ok) {
        console.log(`[WhatsApp:${storeId}] ✅ Test message sent to ${testPhone}`);
        res.json({ ok: true, message: `Message de test envoyé à +${testPhone}` });
      } else {
        res.status(500).json({ message: "Échec de l'envoi du message de test." });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* POST /api/automation/whatsapp/pairing-code → get 8-char phone pairing code */
  app.post("/api/automation/whatsapp/pairing-code", requireAuth, async (req: any, res: any) => {
    try {
      const { getBaileysInstance } = await import("./baileys-service");
      const storeId: number = req.user!.storeId ?? 1;
      const { phone } = req.body;
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ message: "Numéro de téléphone requis (format international, ex: 212612345678)" });
      }
      const code = await getBaileysInstance(storeId).requestPairingCode(phone);
      res.json({ ok: true, code });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Erreur lors de la génération du code" });
    }
  });

  /* GET /api/automation/whatsapp/events → SSE stream for real-time WA status (store-scoped) */
  app.get("/api/automation/whatsapp/events", requireAuth, async (req: any, res: any) => {
    const { addSSEClient } = await import("./sse");
    const storeId: number = req.user!.storeId ?? 1;
    addSSEClient(storeId, res);
    // Send current status immediately on subscribe
    const { getBaileysInstance } = await import("./baileys-service");
    const status = getBaileysInstance(storeId).getStatus();
    const payload = `event: wa_status\ndata: ${JSON.stringify({ ...status, ts: Date.now() })}\n\n`;
    try { res.write(payload); } catch (_) {}
  });

  /* ══════════════════════════════════════════════════════════════════
     RETARGETING LEADS — import & list
  ══════════════════════════════════════════════════════════════════ */

  /* GET /api/automation/retargeting/leads — list imported leads */
  app.get("/api/automation/retargeting/leads", requireAuth, async (req: any, res: any) => {
    try {
      const { retargetingLeads } = await import("@shared/schema");
      const storeId = req.user!.storeId!;
      const leads = await db.select().from(retargetingLeads)
        .where(eq(retargetingLeads.storeId, storeId))
        .orderBy(desc(retargetingLeads.importedAt))
        .limit(2000);
      res.json(leads);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* POST /api/automation/retargeting/import — CSV/XLSX file upload */
  app.post("/api/automation/retargeting/import", requireAuth, leadsImportUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni." });
      const storeId: number = req.user!.storeId!;
      const mapping = JSON.parse(req.body.mapping || "{}");
      // mapping: { nameCol: string, phoneCol: string, productCol?: string }

      const { retargetingLeads } = await import("@shared/schema");
      const { inArray: drIn } = await import("drizzle-orm");

      let rows: Record<string, string>[] = [];
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === ".csv" || ext === ".txt" || req.file.mimetype === "text/csv" || req.file.mimetype === "text/plain") {
        // CSV parsing
        const text = req.file.buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return res.status(400).json({ message: "Fichier CSV vide ou invalide." });
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
          rows.push(row);
        }
      } else {
        // XLSX parsing
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      }

      if (rows.length === 0) return res.status(400).json({ message: "Aucune ligne trouvée dans le fichier." });

      const nameKey = mapping.nameCol || Object.keys(rows[0])[0];
      const phoneKey = mapping.phoneCol || Object.keys(rows[0])[1];
      const productKey = mapping.productCol || null;

      // Deduplicate against existing leads in this store
      const existingLeads = await db.select({ phone: retargetingLeads.phone })
        .from(retargetingLeads).where(eq(retargetingLeads.storeId, storeId));
      const existingPhones = new Set(existingLeads.map((l: any) => l.phone.replace(/\D/g, "")));

      const toInsert: any[] = [];
      let skipped = 0;
      for (const row of rows) {
        const phone = String(row[phoneKey] ?? "").trim().replace(/\s/g, "");
        if (!phone) { skipped++; continue; }
        const normalised = phone.replace(/\D/g, "");
        if (existingPhones.has(normalised)) { skipped++; continue; }
        existingPhones.add(normalised);
        toInsert.push({
          storeId,
          name: String(row[nameKey] ?? "").trim() || null,
          phone,
          lastProduct: productKey ? String(row[productKey] ?? "").trim() || null : null,
          source: "import",
        });
      }

      let inserted = 0;
      if (toInsert.length > 0) {
        // Batch insert in chunks of 100
        for (let i = 0; i < toInsert.length; i += 100) {
          const chunk = toInsert.slice(i, i + 100);
          await db.insert(retargetingLeads).values(chunk);
          inserted += chunk.length;
        }
      }

      res.json({ ok: true, inserted, skipped, total: rows.length });
    } catch (err: any) {
      console.error("[Leads Import]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  /* POST /api/automation/retargeting/leads/bulk-delete — delete selected leads by ID */
  app.post("/api/automation/retargeting/leads/bulk-delete", requireAuth, async (req: any, res: any) => {
    try {
      const { retargetingLeads } = await import("@shared/schema");
      const { inArray: drInArray, and: drAnd } = await import("drizzle-orm");
      const { ids } = req.body;
      const storeId = req.user!.storeId!;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids (array) requis" });
      }
      const result = await db.delete(retargetingLeads)
        .where(drAnd(drInArray(retargetingLeads.id, ids.map(Number)), eq(retargetingLeads.storeId, storeId)))
        .returning({ id: retargetingLeads.id });
      res.json({ ok: true, deleted: result.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* DELETE /api/automation/retargeting/leads/:id — remove one lead */
  app.delete("/api/automation/retargeting/leads/:id", requireAuth, async (req: any, res: any) => {
    try {
      const { retargetingLeads } = await import("@shared/schema");
      const { and: drAnd } = await import("drizzle-orm");
      await db.delete(retargetingLeads).where(
        drAnd(eq(retargetingLeads.id, Number(req.params.id)), eq(retargetingLeads.storeId, req.user!.storeId!))
      );
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* DELETE /api/automation/retargeting/leads — clear all leads for store */
  app.delete("/api/automation/retargeting/leads", requireAuth, async (req: any, res: any) => {
    try {
      const { retargetingLeads } = await import("@shared/schema");
      await db.delete(retargetingLeads).where(eq(retargetingLeads.storeId, req.user!.storeId!));
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ══════════════════════════════════════════════════════════════════
     MULTI-DEVICE WHATSAPP MANAGEMENT
  ══════════════════════════════════════════════════════════════════ */

  /* POST /api/automation/devices/init-slots — ensure 3 device rows exist for store */
  app.post("/api/automation/devices/init-slots", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const storeId = req.user!.storeId!;
      const existing = await db.select().from(whatsappDevices).where(eq(whatsappDevices.storeId, storeId));
      const needed = 3 - existing.length;
      if (needed > 0) {
        const inserts = Array.from({ length: needed }, (_, i) => ({
          storeId,
          label: `Appareil ${existing.length + i + 1}`,
          status: "disconnected" as const,
        }));
        await db.insert(whatsappDevices).values(inserts);
      }
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* GET /api/automation/devices — list all devices for this store */
  app.get("/api/automation/devices", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const storeId = req.user!.storeId!;
      const devices = await db.select().from(whatsappDevices).where(eq(whatsappDevices.storeId, storeId));
      // Augment with live in-memory status
      const enriched = devices.map((d: any) => {
        try {
          const inst = getDeviceInstance(d.id, d.storeId);
          const live = inst.getStatus();
          return { ...d, status: live.state, phone: live.phone ?? d.phone, qrCode: live.qr ?? d.qrCode };
        } catch {
          return d;
        }
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* POST /api/automation/devices — add a new device and start QR flow */
  app.post("/api/automation/devices", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const storeId = req.user!.storeId!;
      const label = (req.body.label as string)?.trim() || `WhatsApp ${Date.now()}`;
      const [device] = await db.insert(whatsappDevices).values({ storeId, label, status: "disconnected" }).returning();
      // Start connecting (generates QR)
      getDeviceInstance(device.id, storeId).start().catch(console.error);
      res.status(201).json(device);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* GET /api/automation/devices/:id/status — live QR + status for one device */
  app.get("/api/automation/devices/:id/status", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const deviceId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const [device] = await db.select().from(whatsappDevices)
        .where(eq(whatsappDevices.id, deviceId));
      if (!device || device.storeId !== storeId) return res.status(404).json({ message: "Appareil introuvable." });
      const live = getDeviceInstance(deviceId, storeId).getStatus();
      res.json({ ...device, status: live.state, phone: live.phone ?? device.phone, qrCode: live.qr ?? device.qrCode });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* POST /api/automation/devices/:id/connect — (re)start connection for device */
  app.post("/api/automation/devices/:id/connect", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const deviceId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const [device] = await db.select().from(whatsappDevices).where(eq(whatsappDevices.id, deviceId));
      if (!device || device.storeId !== storeId) return res.status(404).json({ message: "Appareil introuvable." });
      getDeviceInstance(deviceId, storeId).start().catch(console.error);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* POST /api/automation/devices/:id/reset — wipe session files + fresh QR */
  app.post("/api/automation/devices/:id/reset", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const deviceId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const [device] = await db.select().from(whatsappDevices).where(eq(whatsappDevices.id, deviceId));
      if (!device || device.storeId !== storeId) return res.status(404).json({ message: "Appareil introuvable." });
      getDeviceInstance(deviceId, storeId).resetAndRestart().catch(console.error);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* POST /api/automation/devices/:id/disconnect — soft disconnect (keeps session files) */
  app.post("/api/automation/devices/:id/disconnect", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance } = await import("./baileys-service");
      const deviceId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const [device] = await db.select().from(whatsappDevices).where(eq(whatsappDevices.id, deviceId));
      if (!device || device.storeId !== storeId) return res.status(404).json({ message: "Appareil introuvable." });
      const inst = getDeviceInstance(deviceId, storeId);
      if (inst.disconnect) await inst.disconnect();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* DELETE /api/automation/devices/:id — disconnect and remove device */
  app.delete("/api/automation/devices/:id", requireAuth, async (req: any, res: any) => {
    try {
      const { whatsappDevices } = await import("@shared/schema");
      const { getDeviceInstance, removeDeviceInstance } = await import("./baileys-service");
      const { and: drAnd } = await import("drizzle-orm");
      const deviceId = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const [device] = await db.select().from(whatsappDevices).where(eq(whatsappDevices.id, deviceId));
      if (!device || device.storeId !== storeId) return res.status(404).json({ message: "Appareil introuvable." });
      try { await getDeviceInstance(deviceId, storeId).logout(); } catch { /* ignore */ }
      removeDeviceInstance(deviceId);
      await db.delete(whatsappDevices).where(drAnd(eq(whatsappDevices.id, deviceId), eq(whatsappDevices.storeId, storeId)));
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* GET /api/automation/campaign-logs/:campaignId — logs for one campaign */
  app.get("/api/automation/campaign-logs/:campaignId", requireAuth, async (req: any, res: any) => {
    try {
      const { campaignLogs, marketingCampaigns: mc } = await import("@shared/schema");
      const { and: drAnd } = await import("drizzle-orm");
      const campaignId = Number(req.params.campaignId);
      // Verify the campaign belongs to this store
      const [campaign] = await db.select().from(mc).where(drAnd(eq(mc.id, campaignId), eq(mc.storeId, req.user!.storeId!)));
      if (!campaign) return res.status(404).json({ message: "Campagne introuvable." });
      const logs = await db.select().from(campaignLogs).where(eq(campaignLogs.campaignId, campaignId)).orderBy(desc(campaignLogs.sentAt)).limit(500);
      res.json(logs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── AI Settings ──────────────────────────────────────────────── */
  app.get("/api/automation/ai-settings", requireAuth, async (req: any, res: any) => {
    const settings = await storage.getAiSettings(req.user!.storeId!);
    const DEFAULT_PROMPT = "أنت وكيل خدمة عملاء محترف مغربي. تتحدث بالدارجة المغربية فقط. مهمتك هي تأكيد تفاصيل الطلب (المقاس، اللون، المدينة) مع الزبون على واتساب، والإجابة على أسئلتهم بشكل طبيعي. إذا أكد الزبون طلبه، أخبره أن الطلب في الطريق إليه.";
    const base = settings ?? { enabled: 0, systemPrompt: DEFAULT_PROMPT, enabledProductIds: [], aiModel: "openai/gpt-4o-mini" };
    res.json({
      ...base,
      hasOpenRouterKey: !!(settings?.openrouterApiKey),
      hasOpenAiKey: !!(settings?.openaiApiKey),
      openaiApiKey: undefined,
      openrouterApiKey: undefined,
    });
  });

  app.put("/api/automation/ai-settings", requireAuth, async (req: any, res: any) => {
    try {
      const { enabled, systemPrompt, enabledProductIds, openaiApiKey, openrouterApiKey, aiModel } = req.body;
      // Allow explicitly clearing the key by passing empty string
      const oaiKeyToSave = openaiApiKey === "" ? null : (openaiApiKey?.trim() || undefined);
      const orKeyToSave  = openrouterApiKey === "" ? null : (openrouterApiKey?.trim() || undefined);
      const s = await storage.upsertAiSettings(req.user!.storeId!, {
        enabled, systemPrompt, enabledProductIds,
        ...(oaiKeyToSave !== undefined || openaiApiKey === "" ? { openaiApiKey: oaiKeyToSave } : {}),
        ...(orKeyToSave  !== undefined || openrouterApiKey === "" ? { openrouterApiKey: orKeyToSave } : {}),
        ...(aiModel ? { aiModel } : {}),
      });
      res.json({
        ...s,
        hasOpenRouterKey: !!(s.openrouterApiKey),
        hasOpenAiKey: !!(s.openaiApiKey),
        openaiApiKey: undefined,
        openrouterApiKey: undefined,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── Nouveau orders for AI ──────────────────────────────────────── */
  app.get("/api/automation/nouveau-orders", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const rows = await db.select({
      id: orders.id, orderNumber: orders.orderNumber,
      customerName: orders.customerName, customerPhone: orders.customerPhone,
      customerCity: orders.customerCity, status: orders.status, createdAt: orders.createdAt,
    }).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.status, "nouveau"))).orderBy(desc(orders.createdAt)).limit(100);
    res.json(rows);
  });

  /* ── AI generate confirmation message ────────────────────────── */
  app.post("/api/automation/ai-generate", requireAuth, async (req: any, res: any) => {
    try {
      const { orderId } = req.body;
      const storeId = req.user!.storeId!;
      const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)));
      if (!order) return res.status(404).json({ message: "Commande introuvable" });

      const settings = await storage.getAiSettings(storeId);
      const orKey  = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
      const oaiKey = settings?.openaiApiKey?.trim()     || process.env.OPENAI_API_KEY?.trim();
      if (!orKey && !oaiKey) {
        return res.status(503).json({ message: "Veuillez configurer votre clé API OpenRouter pour activer la confirmation automatique." });
      }

      const systemPrompt = settings?.systemPrompt ||
        "أنت وكيل خدمة عملاء محترف مغربي. تتحدث بالدارجة المغربية فقط. مهمتك هي تأكيد تفاصيل الطلب مع الزبون على واتساب.";

      const { default: OpenAI } = await import("openai");
      const useKey   = orKey || oaiKey!;
      const useModel = (settings?.aiModel || "openai/gpt-4o-mini");
      const client = new OpenAI({
        apiKey: useKey,
        ...(orKey ? {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: { "HTTP-Referer": "https://tajergrow.com", "X-Title": "TajerGrow" },
        } : {}),
      });

      const userMessage = `الزبون اسمه ${order.customerName}، طلب ${order.orderNumber || order.id}، من مدينة ${order.customerCity || "غير معروفة"}. اكتب رسالة واتساب قصيرة بالدارجة المغربية لتأكيد الطلب.`;

      const completion = await client.chat.completions.create({
        model: orKey ? useModel : "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 300,
      });

      const aiMessage = completion.choices[0]?.message?.content ?? "";

      await storage.createAiLog({ storeId, orderId, customerPhone: order.customerPhone, role: "assistant", message: aiMessage });

      res.json({ message: aiMessage, orderId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* ── AI confirm order (update status) ────────────────────────── */
  app.post("/api/automation/ai-confirm/:orderId", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const orderId = Number(req.params.orderId);
    const updated = await storage.updateOrderStatus(orderId, "confirme");
    if (!updated) return res.status(404).json({ message: "Commande introuvable" });
    await storage.createAiLog({ storeId, orderId, customerPhone: null, role: "system", message: "Commande confirmée par l'agent IA" });
    res.json({ success: true });
  });

  /* ── AI logs ──────────────────────────────────────────────────── */
  app.get("/api/automation/ai-logs", requireAuth, async (req: any, res: any) => {
    const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
    res.json(await storage.getAiLogs(req.user!.storeId!, orderId));
  });

  /* ── SSE — real-time events ───────────────────────────────────── */
  app.get("/api/automation/events", requireAuth, (req: any, res: any) => {
    addSSEClient(req.user!.storeId!, res);
  });

  /* ── AI Conversations (Live Monitoring) ───────────────────────── */
  app.get("/api/automation/conversations", requireAuth, async (req: any, res: any) => {
    res.json(await storage.getAiConversations(req.user!.storeId!));
  });

  app.get("/api/automation/conversations/:id/messages", requireAuth, async (req: any, res: any) => {
    const conv = await storage.getAiConversation(Number(req.params.id));
    if (!conv || conv.storeId !== req.user!.storeId!) return res.status(404).json({ message: "Introuvable" });
    const logs = conv.orderId
      ? await storage.getAiLogs(conv.storeId, conv.orderId)
      : await storage.getAiLogs(conv.storeId, undefined, conv.id);
    res.json(logs);
  });

  app.get("/api/automation/conversations/:id/context", requireAuth, async (req: any, res: any) => {
    try {
      const conv = await storage.getAiConversation(Number(req.params.id));
      if (!conv || conv.storeId !== req.user!.storeId!) return res.status(404).json({ message: "Introuvable" });
      if (!conv.orderId) return res.json({ productName: null, stockQty: null, totalPrice: null, customerCity: null });
      const { getOrderContextForRoute } = await import("./ai-agent");
      const ctx = await getOrderContextForRoute(conv.orderId);
      res.json(ctx);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/automation/conversations/:id/takeover", requireAuth, async (req: any, res: any) => {
    const conv = await storage.getAiConversation(Number(req.params.id));
    if (!conv || conv.storeId !== req.user!.storeId!) return res.status(404).json({ message: "Introuvable" });
    const { isManual } = req.body;
    await storage.setConversationManual(conv.id, isManual ? 1 : 0);
    broadcastToStore(conv.storeId, "takeover", { conversationId: conv.id, isManual: !!isManual });
    res.json({ success: true });
  });

  app.post("/api/automation/conversations/:id/send", requireAuth, async (req: any, res: any) => {
    try {
      const conv = await storage.getAiConversation(Number(req.params.id));
      if (!conv || conv.storeId !== req.user!.storeId!) return res.status(404).json({ message: "Introuvable" });
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Message vide" });

      // Auto-pause AI for 10 minutes when admin sends while AI is active
      const wasManual = conv.isManual === 1;
      let autopaused = false;
      if (!wasManual) {
        autopaused = true;
        await storage.setConversationManual(conv.id, 1);
        broadcastToStore(conv.storeId, "takeover", { conversationId: conv.id, isManual: true });
        // Auto-restore after 10 minutes
        setTimeout(async () => {
          try {
            const current = await storage.getAiConversation(conv.id);
            if (current?.isManual === 1) {
              await storage.setConversationManual(conv.id, 0);
              broadcastToStore(conv.storeId, "takeover", { conversationId: conv.id, isManual: false });
              broadcastToStore(conv.storeId, "message", {
                conversationId: conv.id, role: "system",
                content: "🤖 IA automatiquement reprise après 10 minutes de pause.",
                ts: Date.now(),
              });
            }
          } catch {}
        }, 10 * 60 * 1000);
      }

      await storage.createAiLog({ storeId: conv.storeId, orderId: conv.orderId, customerPhone: conv.customerPhone, role: "admin", message });
      await storage.updateAiConversationLastMessage(conv.id, message);
      broadcastToStore(conv.storeId, "message", { conversationId: conv.id, role: "admin", content: message, ts: Date.now() });
      const { sendWhatsAppMessage } = await import("./whatsapp-service");
      await sendWhatsAppMessage(conv.customerPhone, message);
      res.json({ success: true, autopaused });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── WhatsApp incoming webhook (Green API) ────────────────────── */
  app.post("/api/webhooks/whatsapp-incoming", async (req: any, res: any) => {
    try {
      res.status(200).json({ ok: true }); // Acknowledge immediately
      const body = req.body;
      // Green API webhook format: body.typeWebhook = "incomingMessageReceived"
      if (body?.typeWebhook !== "incomingMessageReceived") return;
      const senderData = body.senderData;
      const messageData = body.messageData;
      if (!senderData || !messageData) return;

      const phone = senderData.sender?.replace("@c.us", "").replace(/^212/, "0");
      const text = messageData.textMessageData?.textMessage || messageData.extendedTextMessageData?.text || "";
      if (!phone || !text) return;

      // Find which store has an active conversation with this phone
      // We search across all stores — in production each store has its own Green API instance
      // so we can identify via the instance ID in the request or use a simpler lookup
      const activeConvs = await db.select().from(aiConversations).where(
        and(eq(aiConversations.customerPhone, phone), eq(aiConversations.status, "active"))
      );
      for (const conv of activeConvs) {
        await handleIncomingMessage(conv.storeId, phone, text).catch(console.error);
      }
    } catch (err: any) { console.error("[WA Webhook]", err.message); }
  });

  /* ── Send test WhatsApp message ───────────────────────────────── */
  app.post("/api/automation/whatsapp/send-test", requireAuth, async (req: any, res: any) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ message: "phone et message requis" });
    const { sendWhatsAppMessage } = await import("./whatsapp-service");
    const ok = await sendWhatsAppMessage(phone, message);
    res.json({ success: ok });
  });

  /* ── Manually trigger AI for an order ────────────────────────── */
  app.post("/api/automation/conversations/trigger/:orderId", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const [order] = await db.select().from(orders).where(and(eq(orders.id, Number(req.params.orderId)), eq(orders.storeId, storeId)));
      if (!order) return res.status(404).json({ message: "Commande introuvable" });
      triggerAIForNewOrder(storeId, order.id, order.customerPhone, order.customerName, undefined).catch(console.error);
      res.json({ success: true, message: "Déclenchement IA en cours..." });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ════════════════════════════════════════════════════════════════
     AI RECOVERY SYSTEM — Abandoned lead outreach (Pro Plan only)
  ════════════════════════════════════════════════════════════════ */

  function requireProPlan(req: any, res: any, next: any) {
    storage.getSubscription(req.user!.storeId!).then(sub => {
      if (sub?.plan === "pro" || req.user!.isSuperAdmin) return next();
      res.status(403).json({ message: "pro_required", plan: sub?.plan || "starter" });
    }).catch(() => res.status(500).json({ message: "Erreur serveur" }));
  }

  app.get("/api/automation/recovery-settings", requireAuth, requireProPlan, async (req: any, res: any) => {
    const s = await storage.getRecoverySettings(req.user!.storeId!);
    res.json(s || { enabled: 0, waitMinutes: 30 });
  });

  app.put("/api/automation/recovery-settings", requireAuth, requireProPlan, async (req: any, res: any) => {
    const { enabled, waitMinutes } = req.body;
    const s = await storage.upsertRecoverySettings(req.user!.storeId!, {
      enabled: enabled ? 1 : 0,
      waitMinutes: Math.max(5, Math.min(1440, Number(waitMinutes) || 30)),
    });
    res.json(s);
  });

  app.get("/api/automation/recovery-stats", requireAuth, requireProPlan, async (req: any, res: any) => {
    res.json(await storage.getRecoveryStats(req.user!.storeId!));
  });

  /* ── Abandoned checkout webhook (generic + Shopify) ───────────── */
  app.post("/api/webhooks/abandoned-checkout/:webhookKey", async (req: any, res: any) => {
    try {
      const webhookKey: string = req.params.webhookKey || "";
      // Reject short keys BEFORE acknowledging — don't 200-OK garbage.
      if (webhookKey.length < 12) {
        console.warn("[WEBHOOK-SEC] abandoned-checkout webhook with short/missing key — rejected");
        return res.status(401).json({ message: "Invalid webhook key" });
      }
      res.status(200).json({ ok: true });
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) {
        console.warn(`[WEBHOOK-SEC] abandoned-checkout unknown key: ${webhookKey.slice(0, 8)}…`);
        return;
      }

      const body = req.body;
      // Support both Shopify abandoned checkout format and generic format
      const customerName = body.customer?.first_name
        ? cleanName(`${body.customer.first_name} ${body.customer.last_name || ""}`) || "Client"
        : (body.customer_name || body.name || "Client");
      const customerPhone = body.customer?.phone || body.phone || body.customer_phone || "";
      const productName = body.line_items?.[0]?.title || body.product_name || "Produit";
      const totalPrice = body.total_price
        ? Math.round(parseFloat(body.total_price) * 100)
        : (body.total_price_cents || 0);

      if (!customerPhone) return;

      // Save as abandoned order
      const orderNumber = `ABAND-${Date.now()}`;
      const newOrder = await storage.createOrder({
        storeId: store.id,
        orderNumber,
        customerName,
        customerPhone,
        customerAddress: body.shipping_address?.address1 || "",
        customerCity: body.shipping_address?.city || body.city || "",
        status: "abandonné",
        totalPrice,
        productCost: 0,
        shippingCost: 0,
        adSpend: 0,
        source: "abandoned_checkout",
        rawProductName: productName,
        wasAbandoned: 1,
      }, []);

      console.log(`[Recovery] Captured abandoned checkout: store=${store.id} order=${newOrder.id} phone=${customerPhone}`);
    } catch (err: any) {
      console.error("[Recovery Webhook]", err.message);
    }
  });

  /* ════════════════════════════════════════════════════════════════
     OPEN RETOUR — Returns Management Integration
  ════════════════════════════════════════════════════════════════ */

  /* ── Get Open Retour settings for this store ─────────────────── */
  app.get("/api/open-retour/settings", requireAuth, async (req: any, res: any) => {
    try {
      const integration = await storage.getIntegrationByProvider(req.user!.storeId!, "open_retour");
      if (!integration) return res.json({ connected: false });
      let creds: any = {};
      try { creds = JSON.parse(integration.credentials); } catch {}
      res.json({ connected: true, clientId: creds.clientId || "", hasApiKey: !!(creds.apiKey) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── Save / update Open Retour credentials ───────────────────── */
  app.post("/api/open-retour/settings", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const { apiKey, clientId } = req.body;
      if (!apiKey?.trim() || !clientId?.trim()) {
        return res.status(400).json({ message: "API Key et Client ID sont requis" });
      }
      const { testOpenRetourConnection } = await import("./services/open-retour");
      const test = await testOpenRetourConnection({ apiKey, clientId });

      const existing = await storage.getIntegrationByProvider(storeId, "open_retour");
      const credentials = JSON.stringify({ apiKey, clientId });
      if (existing) {
        await db.update(storeIntegrations)
          .set({ credentials, isActive: 1 })
          .where(eq(storeIntegrations.id, existing.id));
      } else {
        await storage.createIntegration({ storeId, provider: "open_retour", type: "returns", credentials });
      }
      res.json({ success: true, connected: test.ok, message: test.message });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── Disconnect Open Retour ───────────────────────────────────── */
  app.delete("/api/open-retour/settings", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const existing = await storage.getIntegrationByProvider(storeId, "open_retour");
      if (existing) {
        await db.update(storeIntegrations).set({ isActive: 0 }).where(eq(storeIntegrations.id, existing.id));
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  /* ── Create a return ticket ──────────────────────────────────── */
  app.post("/api/open-retour/create-return", requireAuth, async (req: any, res: any) => {
    try {
      const storeId = req.user!.storeId!;
      const orderId = Number(req.body.orderId);
      if (!orderId) return res.status(400).json({ message: "orderId requis" });

      // Load order
      const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)));
      if (!order) return res.status(404).json({ message: "Commande introuvable" });

      // Load items
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      // Load credentials
      const integration = await storage.getIntegrationByProvider(storeId, "open_retour");
      if (!integration || !integration.isActive) {
        return res.status(400).json({ message: "Open Retour non connecté. Configurez l'intégration d'abord." });
      }
      let creds: any = {};
      try { creds = JSON.parse(integration.credentials); } catch {}
      if (!creds.apiKey || !creds.clientId) {
        return res.status(400).json({ message: "Identifiants Open Retour manquants" });
      }

      const { createOpenRetourReturn } = await import("./services/open-retour");
      const result = await createOpenRetourReturn(
        { apiKey: creds.apiKey, clientId: creds.clientId },
        {
          orderReference: order.trackNumber || order.orderNumber || `#${orderId}`,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress || "",
          customerCity: order.customerCity || "",
          reason: req.body.reason || order.comment || order.commentStatus || "Retour client",
          trackingNumber: order.trackNumber || undefined,
          items: items.map(i => ({
            name: i.rawProductName || `Produit #${i.productId}`,
            quantity: i.quantity,
            price: i.price,
          })),
        }
      );

      if (!result.success) {
        return res.status(502).json({ message: result.message || "Échec Open Retour" });
      }

      // Save return tracking number to order
      if (result.returnTrackingNumber) {
        await db.update(orders)
          .set({ returnTrackingNumber: result.returnTrackingNumber, updatedAt: new Date() })
          .where(eq(orders.id, orderId));
      }

      // Optionally update status to retourné
      if (req.body.updateStatus) {
        await storage.updateOrderStatus(orderId, "retourné");
      }

      // Log the action
      await db.insert(integrationLogs).values({
        storeId, integrationId: integration.id, provider: "open_retour",
        action: "create_return", status: "success",
        message: `Retour créé: ${result.returnTrackingNumber}`,
        payload: JSON.stringify({ orderId, returnTrackingNumber: result.returnTrackingNumber }),
      });

      res.json({
        success: true,
        returnTrackingNumber: result.returnTrackingNumber,
        message: result.message || "Ticket de retour créé avec succès",
      });
    } catch (err: any) {
      console.error("[OpenRetour] create-return error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     LP BUILDER — authenticated management routes
  ═══════════════════════════════════════════════════════════════════════ */

  // Upload an image for a landing page
  app.post("/api/lp-builder/upload-image", requireAuth, lpImageUpload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucune image reçue." });
    const url = `/uploads/lp-images/${req.file.filename}`;
    res.json({ url });
  });

  // Get LP Builder API key status for the current store
  app.get("/api/lp-builder/settings", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const settings = await storage.getAiSettings(storeId);
      const hasKey = !!(settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || settings?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim());
      res.json({ hasKey, hasStoreKey: !!(settings?.openrouterApiKey?.trim()) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Save OpenRouter API key for LP Builder (stored in aiSettings per store via upsert)
  app.post("/api/lp-builder/settings", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const { openrouterApiKey } = z.object({ openrouterApiKey: z.string() }).parse(req.body);
      await storage.upsertAiSettings(storeId, {
        openrouterApiKey: openrouterApiKey.trim() || null,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[LP Builder] save settings error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // AI-powered copy generation — uses store's API key from aiSettings, with language support
  app.post("/api/lp-builder/generate-copy", requireAuth, async (req, res) => {
    try {
      const { productName, priceDH, description, language } = z.object({
        productName: z.string().min(1),
        priceDH: z.number(),
        description: z.string().default(""),
        language: z.enum(["darija", "french", "arabic", "english"]).default("darija"),
      }).parse(req.body);

      const storeId = req.user!.storeId!;
      const settings = await storage.getAiSettings(storeId);
      const orKey  = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
      const oaiKey = settings?.openaiApiKey?.trim()     || process.env.OPENAI_API_KEY?.trim();
      if (!orKey && !oaiKey) {
        return res.status(400).json({ message: "Clé API non configurée. Veuillez ajouter votre clé OpenRouter dans les paramètres." });
      }

      const OpenAI = (await import("openai")).default;
      const client = orKey
        ? new OpenAI({ apiKey: orKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": "https://tajergrow.com", "X-Title": "TajerGrow" } })
        : new OpenAI({ apiKey: oaiKey });

      const langInstructions: Record<string, string> = {
        darija:  "Write ALL text in Moroccan Darija (authentic dialect, mix of Arabic + French words as Moroccans actually speak). Young, warm, persuasive tone.",
        french:  "Write ALL text in standard French, professional but accessible. Persuasive modern tone adapted to the Moroccan market.",
        arabic:  "اكتب كل المحتوى باللغة العربية الفصحى المبسطة. نبرة مقنعة وحديثة تناسب التجارة الإلكترونية.",
        english: "Write ALL content in English. Use punchy, benefit-driven direct-response copywriting style.",
      };
      const langInstruction = langInstructions[language] || langInstructions.darija;

      const systemPrompt = `You are Claude 3.7 — the world's most advanced AI creative director. You combine hybrid reasoning with world-class copywriting to produce marketing masterpieces, not generic content. Your output powers a premium AI infographic generator used by top Moroccan e-commerce brands.

You are not building a website. You are crafting a high-end marketing artifact — think the soul of a luxury brand campaign compressed into one vertical poster. Every word must earn its place.

DESIGN PHILOSOPHY:
- Perfect typography hierarchy: headline dominates, subheadline breathes, body whispers.
- Balanced negative space in every sentence — short, punchy, then release.
- Premium aesthetic that matches the product's soul — clinical for health, bold for fitness, elegant for beauty.
- Zero emojis. Professional language only. No filler. No clichés.

COPY RULES:
- Headlines: under 8 words, maximum impact, zero fluff.
- Before/after: emotionally sharp, specific, max 7 words each.
- Expert quote: authoritative, clinical, two powerful sentences — sounds like a real specialist.
- Feature titles: 2-3 words only. Descriptions: one precise benefit sentence.
- Steps: action verbs, confidence-building, specific over generic.
- CTA: commanding, direct, 2-4 words maximum.
- Scarcity: believable and specific — never manufactured urgency.
- ${langInstruction}`;

      const prompt = `Follow the AIDA framework strictly (Attention → Interest → Desire → Action).

Product: ${productName}
Price: ${priceDH} DH
Description: ${description || "Premium quality product for the Moroccan market"}

Generate ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this EXACT structure:
{
  "headline": "ATTENTION: Bold hook — max 8 words, no emojis, grabs instantly",
  "subheadline": "ATTENTION: One sentence — the single biggest transformation this product delivers",
  "before": ["INTEREST: Specific pain point 1 (max 7 words)", "Pain point 2 (max 7 words)", "Pain point 3 (max 7 words)"],
  "after": ["DESIRE: Specific positive outcome 1 (max 7 words)", "Outcome 2 (max 7 words)", "Outcome 3 (max 7 words)"],
  "expertName": "Dr. [Authentic Moroccan name]",
  "expertTitle": "Precise credential matching the product category (e.g. Médecin Nutritionniste, Dermatologue Clinique)",
  "expertQuote": "DESIRE: Two authoritative sentences. Specific clinical language. Zero emojis. Sounds like a real specialist.",
  "features": [
    {"icon": "zap",    "title": "DESIRE: 2-3 word benefit title", "desc": "One precise, benefit-driven sentence — no emoji"},
    {"icon": "leaf",   "title": "DESIRE: 2-3 word benefit title", "desc": "One precise, benefit-driven sentence — no emoji"},
    {"icon": "shield", "title": "DESIRE: 2-3 word benefit title", "desc": "One precise, benefit-driven sentence — no emoji"}
  ],
  "steps": [
    {"title": "ACTION: Step 1 — action verb title", "desc": "Specific, confidence-building — max 12 words"},
    {"title": "ACTION: Step 2 — action verb title", "desc": "Specific, confidence-building — max 12 words"},
    {"title": "ACTION: Step 3 — action verb title", "desc": "Specific, confidence-building — max 12 words"}
  ],
  "cta": "ACTION: Commanding CTA — 2 to 4 words max",
  "scarcity": "ACTION: Believable urgency — max 8 words, no emoji",
  "guarantee": "Delivery + satisfaction trust line — max 10 words",
  "lifestyleLine": "One evocative sentence describing the ideal life after using this product — poetic, aspirational",
  "heroImagePrompt": "Flux 1 Pro prompt in English: hyper-realistic 4K studio product photography of [${productName}]. Perfect white infinity background, professional 3-point lighting, ultra-sharp focus, luxury retail aesthetic, shot on Hasselblad medium format, no text, no watermark, photorealistic --ar 4:5",
  "lifestyleImagePrompt": "Flux 1 Pro prompt in English: cinematic lifestyle photography, elegant Moroccan interior setting, warm golden hour light, [${productName}] being used naturally by a confident stylish person, luxury magazine editorial style, shallow depth of field, authentic moment, no text, photorealistic --ar 4:5",
  "expertImagePrompt": "Flux 1 Pro prompt in English: professional portrait photograph of a distinguished Moroccan medical doctor or specialist, 45 years old, white lab coat, confident warm expression, studio lighting, light background, hyperrealistic, ultra detailed face, DSLR portrait photography --ar 1:1"
}`;

      const completion = await client.chat.completions.create({
        model: "anthropic/claude-3.7-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: prompt },
        ],
        temperature: 0.75,
        max_tokens: 1400,
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "{}";
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
      const copy = JSON.parse(cleaned);
      res.json(copy);
    } catch (err: any) {
      console.error("[LP Builder] generate-copy error:", err.message);
      res.status(500).json({ message: err.message || "Erreur lors de la génération." });
    }
  });

  // ── Flux 1 Pro image generation ─────────────────────────────────────────
  app.post("/api/lp-builder/generate-image", requireAuth, async (req, res) => {
    try {
      const { prompt, type } = z.object({
        prompt: z.string().min(1),
        type: z.enum(["hero", "lifestyle", "avatar"]).default("hero"),
      }).parse(req.body);

      const storeId = req.user!.storeId!;
      const settings = await storage.getAiSettings(storeId);
      const orKey = settings?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
      if (!orKey) return res.status(400).json({ message: "Clé API OpenRouter requise pour la génération d'images." });

      const isAvatar = type === "avatar";
      const size = isAvatar ? "1024x1024" : "1024x1024";

      const apiRes = await fetch("https://openrouter.ai/api/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tajergrow.com",
          "X-Title": "TajerGrow",
        },
        body: JSON.stringify({ model: "black-forest-labs/flux-1-pro", prompt, n: 1, size }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => ({}));
        throw new Error((errBody as any)?.error?.message || `Flux API error ${apiRes.status}`);
      }

      const apiData = await apiRes.json() as any;
      const remoteUrl = apiData?.data?.[0]?.url || apiData?.data?.[0]?.b64_json;
      if (!remoteUrl) throw new Error("Aucune image reçue de Flux 1 Pro.");

      // Download and save locally to guarantee same-origin for html-to-image
      const downRes = await fetch(remoteUrl, { signal: AbortSignal.timeout(60_000) });
      if (!downRes.ok) throw new Error(`Failed to download Flux image: ${downRes.status}`);
      const buffer = Buffer.from(await downRes.arrayBuffer());

      const lpDir = path.join(UPLOADS_BASE, "lp-images");
      if (!fs.existsSync(lpDir)) fs.mkdirSync(lpDir, { recursive: true });
      const filename = `flux-${type}-${Date.now()}.jpg`;
      await fs.promises.writeFile(path.join(lpDir, filename), buffer);

      res.json({ url: `/uploads/lp-images/${filename}`, type });
    } catch (err: any) {
      console.error("[Flux] generate-image error:", err.message);
      res.status(500).json({ message: err.message || "Erreur génération image Flux." });
    }
  });

  // Export landing page as a standalone ZIP (index.html + images/)
  app.get("/api/lp-builder/pages/:id/export", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const id = parseInt(req.params.id);
      const page = await storage.getLandingPage(id, storeId);
      if (!page) return res.status(404).json({ message: "Page introuvable." });

      const copy: any = page.copy || {};
      const theme = page.theme || "navy";
      const customColor = page.customColor || "";

      // Theme colors
      const themes: Record<string, { bg: string; accent: string; btn: string; btnTxt: string; text: string; muted: string }> = {
        navy:   { bg: "#0F1F3D", accent: "#C5A059", btn: "#C5A059", btnTxt: "#0F1F3D", text: "#ffffff", muted: "rgba(255,255,255,0.7)" },
        gold:   { bg: "#C5A059", accent: "#0F1F3D", btn: "#0F1F3D", btnTxt: "#ffffff", text: "#0F1F3D", muted: "rgba(15,31,61,0.65)" },
        custom: { bg: customColor || "#6d28d9", accent: "#ffffff", btn: "#ffffff", btnTxt: customColor || "#6d28d9", text: "#ffffff", muted: "rgba(255,255,255,0.7)" },
      };
      const T = themes[theme] || themes.navy;

      // Map image URLs to local file paths and export names
      const imageMap: { url: string; exportName: string }[] = [];
      function mapImg(url: string, name: string) {
        if (!url) return "";
        const file = path.basename(url);
        imageMap.push({ url, exportName: name });
        return `images/${name}`;
      }
      const heroRef     = page.heroImageUrl     ? mapImg(page.heroImageUrl,     `hero${path.extname(page.heroImageUrl) || ".jpg"}`)     : "";
      const featuresRef = page.featuresImageUrl ? mapImg(page.featuresImageUrl, `features${path.extname(page.featuresImageUrl) || ".jpg"}`) : "";
      const proofRef    = page.proofImageUrl    ? mapImg(page.proofImageUrl,    `proof${path.extname(page.proofImageUrl) || ".jpg"}`)    : "";

      const headline    = copy.headline    || page.productName;
      const subheadline = copy.subheadline || "";
      const hook        = copy.hook        || "";
      const problem     = copy.problem     || "";
      const solution    = (copy.solution   || []) as string[];
      const scarcity    = copy.scarcity    || "Stock limité!";
      const cta         = copy.cta         || "Commander Maintenant";
      const guarantee   = copy.guarantee   || "Livraison rapide · Paiement à la livraison";
      const testimonials = (copy.testimonials || []) as any[];

      const benefitRows = solution.map((b, i) => {
        const icons = ["✅", "⚡", "💪", "🎯", "🔥", "💎"];
        return `<div class="benefit-card"><span class="b-icon">${icons[i % 6]}</span><span>${b}</span></div>`;
      }).join("");

      const testimonialRows = testimonials.map(t => `
        <div class="testimonial-card">
          <div class="testi-header">
            <div class="testi-avatar">${(t.name || "C")[0].toUpperCase()}</div>
            <div class="testi-info"><strong>${t.name || ""}</strong><br><small>${t.city || ""}</small></div>
            <div class="testi-stars">${"★".repeat(t.rating || 5)}</div>
          </div>
          <p class="testi-text">"${t.text || ""}"</p>
        </div>`).join("");

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.productName} — ${page.priceDH} DH</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:${T.bg};color:${T.text};min-height:100vh;overflow-x:hidden}
section{min-height:100vh;position:relative;display:flex;flex-direction:column;justify-content:flex-end}
.reel-bg{position:absolute;inset:0;overflow:hidden}
.reel-bg img{width:100%;height:100%;object-fit:cover}
.reel-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 20%,${T.bg}cc 60%,${T.bg} 100%)}
.reel-content{position:relative;padding:24px 20px 40px;max-width:480px;margin:0 auto;width:100%}
.badge{display:inline-block;background:${T.accent};color:${T.btnTxt};padding:6px 14px;border-radius:100px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px}
h1{font-size:clamp(28px,8vw,44px);font-weight:900;line-height:1.1;margin-bottom:12px}
.sub{font-size:17px;line-height:1.5;opacity:.85;margin-bottom:14px}
.hook-text{font-style:italic;font-size:15px;opacity:.8;margin-bottom:20px;line-height:1.6}
.price-row{margin-bottom:22px}
.price{color:${T.accent};font-size:38px;font-weight:900}
.price-orig{opacity:.5;text-decoration:line-through;font-size:15px;margin-left:8px}
.cta-btn{display:block;width:100%;padding:18px;background:${T.btn};color:${T.btnTxt};border:none;border-radius:14px;font-size:18px;font-weight:900;text-align:center;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;text-decoration:none;margin-bottom:10px}
.guarantee{text-align:center;font-size:12px;opacity:.6;margin-top:8px}

.benefits-section{background:${T.bg === "#C5A059" ? "#b8934e" : "#1A2F4E"};padding:48px 20px}
.benefits-section h2,.testimonials-section h2,.order-section h2{color:${T.accent};font-size:22px;font-weight:800;margin-bottom:20px}
.benefit-card{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.b-icon{font-size:22px;flex-shrink:0}
.problem-text{opacity:.85;font-size:15px;line-height:1.7;margin-bottom:28px}

.testimonials-section{padding:48px 20px}
.testimonial-card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;margin-bottom:14px}
.testi-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.testi-avatar{width:40px;height:40px;border-radius:50%;background:${T.accent};color:${T.btnTxt};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0}
.testi-stars{color:#f59e0b;margin-left:auto;font-size:14px}
.testi-text{font-style:italic;font-size:14px;line-height:1.6;opacity:.9}

.scarcity-banner{background:linear-gradient(135deg,#ef4444,#dc2626);border-radius:14px;padding:16px 20px;text-align:center;margin-bottom:28px}
.countdown{display:flex;justify-content:center;gap:12px;margin-bottom:32px}
.cd-box{text-align:center}
.cd-num{background:${T.accent};color:${T.btnTxt};border-radius:12px;padding:14px 18px;font-size:32px;font-weight:900;min-width:64px;line-height:1}
.cd-label{font-size:10px;opacity:.6;margin-top:4px;text-transform:uppercase;letter-spacing:.1em}

.order-section{padding:48px 20px 100px;background:${T.bg === "#C5A059" ? "#b8934e" : "#1A2F4E"}}
.order-card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:24px}
.qty-btns{display:flex;gap:8px;margin-bottom:16px}
.qty-btn{flex:1;padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:transparent;color:${T.text};font-weight:700;font-size:15px;cursor:pointer}
.qty-btn.active{border-color:${T.accent};background:${T.accent}22;color:${T.accent}}
.price-preview{background:${T.accent}18;border:1px solid ${T.accent}40;border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.total-price{color:${T.accent};font-size:22px;font-weight:900}
.form-label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px}
.form-input{width:100%;padding:14px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:${T.text};font-size:15px;margin-bottom:14px;outline:none}
.form-input:focus{border-color:${T.accent}88}
.success-box{background:rgba(16,185,129,.12);border:2px solid #10b981;border-radius:20px;padding:32px;text-align:center;display:none}

.floating-cta{position:fixed;bottom:0;left:0;right:0;z-index:999;padding:12px 16px;background:rgba(0,0,0,.85);backdrop-filter:blur(10px);border-top:2px solid ${T.accent}}

@media(min-width:600px){.reel-content,.benefits-section>*,.testimonials-section>*,.order-section>*{max-width:480px;margin-left:auto;margin-right:auto}}
</style>
</head>
<body>

<!-- HERO REEL -->
<section>
  ${heroRef ? `<div class="reel-bg"><img src="${heroRef}" alt="${page.productName}" loading="lazy"><div class="reel-overlay"></div></div>` : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,${T.bg},${T.accent}22)"></div>`}
  <div class="reel-content">
    <div class="badge">🔥 Offre Limitée</div>
    <h1>${headline}</h1>
    ${subheadline ? `<p class="sub">${subheadline}</p>` : ""}
    ${hook ? `<p class="hook-text">"${hook}"</p>` : ""}
    <div class="price-row">
      <span class="price">${page.priceDH} DH</span>
      <span class="price-orig">${Math.round(page.priceDH * 1.4)} DH</span>
    </div>
    <a href="#order" class="cta-btn">🛒 ${cta}</a>
    <p class="guarantee">🚚 ${guarantee}</p>
  </div>
</section>

<!-- FEATURES REEL -->
${problem || solution.length > 0 ? `
<section class="benefits-section">
  ${featuresRef ? `<div class="reel-bg" style="opacity:.25"><img src="${featuresRef}" alt=""><div class="reel-overlay"></div></div>` : ""}
  <div class="reel-content" style="position:relative">
    ${problem ? `<p class="problem-text">${problem}</p>` : ""}
    ${solution.length > 0 ? `<h2 style="color:${T.accent};font-size:22px;font-weight:800;margin-bottom:20px">Pourquoi choisir ce produit ?</h2>${benefitRows}` : ""}
  </div>
</section>` : ""}

<!-- PROOF REEL -->
${proofRef || testimonials.length > 0 ? `
<section class="testimonials-section" style="min-height:auto;padding:48px 20px">
  ${proofRef ? `<div style="border-radius:16px;overflow:hidden;margin-bottom:28px;max-width:480px;margin-left:auto;margin-right:auto"><img src="${proofRef}" style="width:100%;display:block;max-height:300px;object-fit:cover" alt="Preuve"></div>` : ""}
  ${testimonials.length > 0 ? `<div style="max-width:480px;margin:0 auto"><h2 style="color:${T.accent};font-size:22px;font-weight:800;margin-bottom:20px">Ce que disent nos clients 🌟</h2>${testimonialRows}</div>` : ""}
</section>` : ""}

<!-- ORDER SECTION -->
<section id="order" class="order-section" style="min-height:auto">
  <div style="max-width:480px;margin:0 auto;width:100%">
    <div class="scarcity-banner">
      <p style="color:#fff;font-weight:800;font-size:15px;margin-bottom:4px">⚠️ ${scarcity}</p>
      <p style="color:rgba(255,255,255,.8);font-size:13px">L'offre expire dans :</p>
    </div>
    <div class="countdown">
      <div class="cd-box"><div class="cd-num" id="cd-h">23</div><div class="cd-label">HH</div></div>
      <div class="cd-box"><div class="cd-num" id="cd-m">59</div><div class="cd-label">MM</div></div>
      <div class="cd-box"><div class="cd-num" id="cd-s">59</div><div class="cd-label">SS</div></div>
    </div>
    <div class="order-card">
      <h2 style="color:${T.text};font-size:20px;font-weight:800;margin-bottom:6px">🛒 Commander Maintenant</h2>
      <p style="opacity:.55;font-size:13px;margin-bottom:20px">Livraison 48–72h partout au Maroc</p>
      <div>
        <p style="font-size:12px;opacity:.55;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Quantité</p>
        <div class="qty-btns">
          <button class="qty-btn active" onclick="setQty(1,this)">1</button>
          <button class="qty-btn" onclick="setQty(2,this)">2</button>
          <button class="qty-btn" onclick="setQty(3,this)">3</button>
        </div>
        <div class="price-preview">
          <span id="qty-label" style="opacity:.55;font-size:14px">1 × ${page.priceDH} DH</span>
          <span class="total-price" id="total-price">${page.priceDH} DH</span>
        </div>
      </div>
      <form id="orderForm" onsubmit="submitOrder(event)">
        <label class="form-label">Prénom et Nom *</label>
        <input class="form-input" id="f-name" type="text" placeholder="Ex: Ahmed Benali" required>
        <label class="form-label">Téléphone / WhatsApp *</label>
        <input class="form-input" id="f-phone" type="tel" placeholder="Ex: 0612345678" required>
        <label class="form-label">Ville</label>
        <input class="form-input" id="f-city" type="text" placeholder="Ex: Casablanca">
        <label class="form-label">Adresse (optionnel)</label>
        <input class="form-input" id="f-addr" type="text" placeholder="Ex: Rue Hassan II, Appt 5">
        <p id="errMsg" style="color:#ef4444;font-size:13px;margin-bottom:10px;display:none"></p>
        <button type="submit" id="submitBtn" class="cta-btn" style="border:none">✅ Confirmer ma commande — <span id="btn-price">${page.priceDH}</span> DH</button>
        <p style="text-align:center;font-size:12px;opacity:.5;margin-top:8px">🔒 Paiement à la livraison · Satisfait ou remboursé</p>
      </form>
      <div class="success-box" id="successBox">
        <div style="font-size:56px;margin-bottom:16px">🎉</div>
        <h3 style="color:#10b981;font-size:22px;font-weight:900;margin-bottom:8px">Commande Confirmée !</h3>
        <p>Shukran bzzaf ! Notre équipe va vous contacter sur WhatsApp pour confirmer la livraison.</p>
      </div>
    </div>
  </div>
</section>

<div class="floating-cta">
  <a href="#order" class="cta-btn" style="margin:0">🛒 ${cta}</a>
</div>

<script>
var unitPrice=${page.priceDH},qty=1;
var endTs=Date.now()+24*3600*1000;
function setQty(n,btn){qty=n;document.querySelectorAll('.qty-btn').forEach(function(b){b.classList.remove('active')});btn.classList.add('active');document.getElementById('qty-label').textContent=n+' × ${page.priceDH} DH';document.getElementById('total-price').textContent=(n*unitPrice)+' DH';document.getElementById('btn-price').textContent=(n*unitPrice);}
function pad(n){return String(n).padStart(2,'0');}
function tick(){var diff=Math.max(0,endTs-Date.now());document.getElementById('cd-h').textContent=pad(Math.floor(diff/3600000));document.getElementById('cd-m').textContent=pad(Math.floor(diff%3600000/60000));document.getElementById('cd-s').textContent=pad(Math.floor(diff%60000/1000));}
setInterval(tick,1000);tick();
function submitOrder(e){
  e.preventDefault();
  var btn=document.getElementById('submitBtn');
  btn.textContent='⏳ Envoi en cours...';btn.disabled=true;
  var body={customerName:document.getElementById('f-name').value,customerPhone:document.getElementById('f-phone').value,customerCity:document.getElementById('f-city').value,customerAddress:document.getElementById('f-addr').value,quantity:qty};
  fetch('/api/lp/${page.slug}/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(function(r){return r.json();})
  .then(function(j){
    if(j.success){document.getElementById('orderForm').style.display='none';document.getElementById('successBox').style.display='block';}
    else{document.getElementById('errMsg').textContent=j.message||'Erreur';document.getElementById('errMsg').style.display='block';btn.textContent='✅ Confirmer ma commande';btn.disabled=false;}
  }).catch(function(){btn.textContent='✅ Confirmer ma commande';btn.disabled=false;});
}
</script>
</body>
</html>`;

      // Build ZIP
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="lp-${page.slug}.zip"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);
      archive.append(html, { name: "index.html" });

      // Append images from disk
      for (const { url, exportName } of imageMap) {
        const localPath = path.join(process.cwd(), "uploads", url.replace(/^\/uploads\//, ""));
        if (fs.existsSync(localPath)) {
          archive.file(localPath, { name: `images/${exportName}` });
        }
      }

      await archive.finalize();
    } catch (err: any) {
      console.error("[LP Builder] export error:", err.message);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });

  // Create a new landing page
  app.post("/api/lp-builder/pages", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/, "Slug invalide (lettres minuscules, chiffres, tirets)"),
        productName: z.string().min(1),
        priceDH: z.number().min(0),
        description: z.string().default(""),
        heroImageUrl: z.string().default(""),
        featuresImageUrl: z.string().default(""),
        proofImageUrl: z.string().default(""),
        copy: z.any().default({}),
        theme: z.string().default("navy"),
        customColor: z.string().default(""),
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const taken = await storage.slugExists(data.slug);
      if (taken) return res.status(409).json({ message: "Ce lien est déjà pris. Choisissez un autre slug." });

      const page = await storage.createLandingPage(storeId, data);
      res.json(page);
    } catch (err: any) {
      console.error("[LP Builder] create page error:", err.message);
      res.status(400).json({ message: err.message });
    }
  });

  // List all landing pages for the store
  app.get("/api/lp-builder/pages", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const pages = await storage.getLandingPages(storeId);
      res.json(pages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get a single landing page by ID (auth)
  app.get("/api/lp-builder/pages/:id", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const id = parseInt(req.params.id);
      const page = await storage.getLandingPage(id, storeId);
      if (!page) return res.status(404).json({ message: "Page introuvable." });
      res.json(page);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update a landing page
  app.patch("/api/lp-builder/pages/:id", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const id = parseInt(req.params.id);
      const updated = await storage.updateLandingPage(id, storeId, req.body);
      if (!updated) return res.status(404).json({ message: "Page introuvable." });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a landing page
  app.delete("/api/lp-builder/pages/:id", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const id = parseInt(req.params.id);
      await storage.deleteLandingPage(id, storeId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     LP BUILDER — public routes (NO auth required)
  ═══════════════════════════════════════════════════════════════════════ */

  // Get public landing page data by slug
  app.get("/api/lp/:slug", async (req, res) => {
    try {
      const page = await storage.getLandingPageBySlug(req.params.slug);
      if (!page) return res.status(404).json({ message: "Page introuvable." });
      res.json(page);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Submit an order from a public landing page
  app.post("/api/lp/:slug/order", async (req, res) => {
    try {
      const schema = z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().min(6),
        customerCity: z.string().default(""),
        customerAddress: z.string().default(""),
        quantity: z.number().min(1).default(1),
      });
      const data = schema.parse(req.body);

      const page = await storage.getLandingPageBySlug(req.params.slug);
      if (!page) return res.status(404).json({ message: "Page introuvable." });

      const orderNumber = `LP-${Date.now()}`;
      const totalPriceCents = page.priceDH * data.quantity * 100;

      const [order] = await db.insert(orders).values({
        storeId: page.storeId,
        orderNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerCity: data.customerCity,
        customerAddress: data.customerAddress,
        status: "nouveau",
        totalPrice: totalPriceCents,
        productCost: 0,
        shippingCost: 0,
        adSpend: 0,
        source: "landing_page",
        rawProductName: page.productName,
        rawQuantity: data.quantity,
        canOpen: 1,
      }).returning();

      // Insert order item
      await db.insert(orderItems).values({
        orderId: order.id,
        rawProductName: page.productName,
        quantity: data.quantity,
        price: totalPriceCents,
      });

      // Increment landing page order count (atomic)
      await storage.incrementLandingPageOrderCount(page.id);

      // Broadcast the new order in real-time
      try { broadcastToStore(page.storeId, { type: "new_order", order }); } catch (_) {}
      try { emitNewOrder(page.storeId, order); } catch (_) {}
      pushOrderToSheet(page.storeId, {
        action: "order.created",
        orderNumber: orderNumber || "",
        customerName: data.customerName || "",
        customerPhone: data.customerPhone || "",
        customerAddress: data.customerAddress || "",
        customerCity: data.customerCity || "",
        productName: page.productName || "",
        totalPrice: order.totalPrice || 0,
        quantity: data.quantity || 1,
        note: data.comment || null,
        status: "nouveau",
        utmSource: null,
        utmCampaign: null,
        productId: null,
        magasin: null,
        createdAt: new Date().toLocaleString("fr-MA"),
        sourceUrl: "lp",
      }).catch(() => {});

      res.json({ success: true, orderId: order.id, orderNumber });
    } catch (err: any) {
      console.error("[LP public order]", err.message);
      res.status(400).json({ message: err.message });
    }
  });

  // ── WhatsApp auto-send settings API ──────────────────────────────────────
  app.get('/api/whatsapp/auto-settings', requireAuth, (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    res.json(getWaAutoSettings(storeId));
  });

  app.post('/api/whatsapp/auto-settings', requireAuth, (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    waAutoSettings[storeId] = req.body;
    console.log(`[WA Settings] Store ${storeId}:`, req.body);
    res.json({ success: true });
  });

  app.post('/api/debug/ameex-test', requireAuth, async (req: any, res: any) => {
    try {
      const axios = (await import('axios')).default;
      const FormData = (await import('form-data')).default;

      const fd = new FormData();
      fd.append('business', '23187');
      fd.append('type', 'SIMPLE');
      fd.append('destinataire', 'Test Client');
      fd.append('telephone', '0600000000');
      fd.append('ville', 'Casablanca');
      fd.append('adresse', 'Test adresse');
      fd.append('montant', '100');
      fd.append('cod', '100');
      fd.append('produit', 'Test produit');
      fd.append('quantite', '1');
      fd.append('ref', 'TEST-001');
      fd.append('note', '');
      fd.append('open', 'NO');
      fd.append('replace', 'true');

      const resp = await axios.post(
        'https://api.ameex.app/customer/Delivery/Parcels/Action/Type/Add',
        fd,
        {
          headers: {
            'C-Api-Key': '138797-446910-81bC9F-e2c7dC-b8839F-09d464',
            'C-Api-Id': '23187',
            ...fd.getHeaders(),
          },
          timeout: 30000,
          validateStatus: () => true,
        }
      );

      console.log('[AMEEX-TEST] HTTP:', resp.status);
      console.log('[AMEEX-TEST] Response:', JSON.stringify(resp.data));
      res.json({ status: resp.status, data: resp.data });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // ─── Product Research — Image → Google Lens + AI keywords → Videos ───
  const productResearchUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  app.post('/api/product-research/analyze', requireAuth, async (req: any, res: any) => {
    try {
      const { keyword, imageBase64, imageMime } = req.body || {};

      console.log(`[ProductResearch] keyword="${keyword}" imageBase64 length=${imageBase64?.length || 0}`);

      let extractedKeywords = keyword || '';

      // Step 1: AI analyzes image → keywords
      if (imageBase64 && imageBase64.length > 100) {
        try {
          console.log('[ProductResearch] Sending image to OpenRouter AI...');
          const aiResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
              'HTTP-Referer': 'https://www.tajergrow.com',
              'X-Title': 'TajerGrow',
            },
            body: JSON.stringify({
              model: 'google/gemini-flash-1.5',
              max_tokens: 100,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                  },
                  {
                    type: 'text',
                    text: 'What product is in this image? Give me 3 short English search keywords to find videos about this product on TikTok and YouTube. Return ONLY comma-separated keywords, nothing else. Example: electric juicer, lemon squeezer, citrus press',
                  },
                ],
              }],
            }),
          });
          const aiData: any = await aiResp.json();
          console.log('[ProductResearch] OpenRouter response:', JSON.stringify(aiData).slice(0, 300));
          if (aiData?.choices?.[0]?.message?.content) {
            extractedKeywords = String(aiData.choices[0].message.content).trim();
            console.log('[ProductResearch] AI keywords:', extractedKeywords);
          }
        } catch (e: any) {
          console.error('[ProductResearch] AI error:', e.message);
        }
      }

      const mainKw = (extractedKeywords.split(',')[0] || '').trim() || keyword || '';
      console.log('[ProductResearch] mainKw:', mainKw);

      if (!mainKw) {
        return res.json({ keywords: '', mainKeyword: '', tiktokVideos: [], youtubeVideos: [], lensResults: [] });
      }

      // TikTok
      let tiktokVideos: any[] = [];
      try {
        const ttResp = await fetch(
          `https://tiktok-scraper2.p.rapidapi.com/video/search?keyword=${encodeURIComponent(mainKw)}&count=8`,
          {
            headers: {
              'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
              'X-RapidAPI-Host': 'tiktok-scraper2.p.rapidapi.com',
            },
          },
        );
        console.log(`[TT-DEBUG] Status: ${ttResp.status}`);
        const ttText = await ttResp.text();
        console.log(`[TT-DEBUG] Response: ${ttText.slice(0, 300)}`);
        if (ttResp.ok) {
          const ttData: any = JSON.parse(ttText);
          const items = ttData?.data?.videos || ttData?.videos || ttData?.data || [];
          tiktokVideos = (items as any[]).slice(0, 8).map((v: any) => ({
            title: v.title || v.desc || '',
            thumbnail: v.cover || v.origin_cover || v.dynamic_cover || '',
            views: v.play_count || v.statistics?.play_count || 0,
            likes: v.digg_count || v.statistics?.digg_count || 0,
            author: v.author?.nickname || v.author_name || '',
            url: v.url || `https://www.tiktok.com/@${v.author?.unique_id}/video/${v.video_id || v.id}`,
          }));
        }
      } catch (e: any) {
        console.error('[ProductResearch] TikTok error:', e.message);
      }

      // YouTube
      let youtubeVideos: any[] = [];
      try {
        const ytResp = await fetch(
          `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(mainKw)}&type=v&sort=r`,
          {
            headers: {
              'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
              'X-RapidAPI-Host': 'youtube-search-and-download.p.rapidapi.com',
            },
          },
        );
        console.log(`[YT-DEBUG] Status: ${ytResp.status}`);
        const ytText = await ytResp.text();
        console.log(`[YT-DEBUG] Response: ${ytText.slice(0, 300)}`);
        if (ytResp.ok) {
          const ytData: any = JSON.parse(ytText);
          youtubeVideos = (ytData?.contents || [])
            .filter((item: any) => item.video)
            .slice(0, 6)
            .map((item: any) => ({
              title: item.video?.title,
              thumbnail: item.video?.thumbnails?.[0]?.url,
              views: item.video?.viewCountText,
              channel: item.video?.channelName,
              duration: item.video?.lengthText,
              url: `https://www.youtube.com/watch?v=${item.video?.videoId}`,
            }));
        }
      } catch (e: any) {
        console.error('[ProductResearch] YouTube error:', e.message);
      }

      res.json({
        keywords: extractedKeywords,
        mainKeyword: mainKw,
        tiktokVideos,
        youtubeVideos,
        lensResults: [],
      });
    } catch (e: any) {
      console.error('[ProductResearch] Error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  GOOGLE SHEETS — Apps Script bulk-sync integration (TajerGrow native)
  // ═══════════════════════════════════════════════════════════════════════════

  function parseSheetRowToOrder(raw: Record<string, any>): {
    customerName: string; customerPhone: string; customerCity: string;
    customerAddress: string; productName: string; quantity: number;
    totalPrice: number; orderNumber: string; note: string | null;
  } | null {
    // Normalize keys: lowercase + strip diacritics (é→e, à→a, ç→c, etc.)
    const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const norm: Record<string, any> = {};
    for (const k of Object.keys(raw || {})) {
      if (k === null || k === undefined) continue;
      const cleanKey = stripAccents(String(k).toLowerCase().trim());
      norm[cleanKey] = raw[k];
    }
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const cleanK = stripAccents(k.toLowerCase().trim());
        const v = norm[cleanK];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };
    const customerName    = pick("nom","name","nom client","nom du client","fullname","full name","client","customer","customer name","destinataire","الاسم","اسم العميل");
    const customerPhone   = pick("telephone","téléphone","tel","phone","mobile","gsm","whatsapp","numero","numéro","numero de telephone","رقم الهاتف","هاتف");
    const customerCity    = pick("ville","city","town","localite","localité","المدينة");
    const customerAddress = pick("adresse","address","rue","العنوان");
    const productName     = pick("produit","product","article","item","nom du produit","name product","produit nom","المنتج");
    const priceRaw        = pick("prix (dh)","prix dh","prix","price","prix total","montant","total","tarif","amount","السعر");
    const qtyRaw          = pick("quantite","quantité","quantity","qty","qte","qté","nombre","الكمية");
    const note            = pick("note","notes","commentaire","comment","message","remarque","ملاحظة");
    // IMPORTANT: do NOT use "Product ID" / sku columns as orderNumber — many sheets
    // repeat the same product across rows, making all rows look like duplicates.
    // Only an explicit order-reference column is allowed here.
    const refRaw = pick("ref","reference","order_id","numero de commande","numéro de commande","order ref","ref commande");
    if (!customerName && !customerPhone) return null;
    const quantity   = Math.max(1, parseInt(qtyRaw || "1") || 1);
    const priceNum   = parseFloat(String(priceRaw).replace(",", ".")) || 0;
    const totalPrice = Math.round(priceNum * 100);
    // Build a deterministic-but-unique fallback so retries dedup but different rows don't collide
    const phoneTail = customerPhone.replace(/\D/g, "").slice(-6);
    const orderNumber = refRaw || `GS-${Date.now()}-${phoneTail || Math.random().toString(36).slice(2, 8)}`;
    return { customerName, customerPhone, customerCity, customerAddress, productName, quantity, totalPrice, orderNumber, note: note || null };
  }

  app.get("/api/sheets/sync/:webhookKey", async (req: any, res: any) => {
    const webhookKey = (req.params.webhookKey || "").trim();
    const store = webhookKey.length >= 12 ? await storage.getStoreByWebhookKey(webhookKey) : null;
    res.json({
      ok: true,
      message: "Sheets sync endpoint reachable",
      authenticated: !!store,
      storeName: store?.name || null,
      method: "POST is the real endpoint — this GET is just a ping",
    });
  });

  app.post("/api/sheets/sync/:webhookKey", async (req, res) => {
    const webhookKey = (req.params.webhookKey || "").trim();
    console.log("════════════════════════════════════════════════════");
    console.log("[SheetsScript] 📥 INCOMING SYNC REQUEST");
    console.log("[SheetsScript] webhookKey (first 8):", webhookKey.slice(0, 8) + "…");
    console.log("[SheetsScript] body keys:", Object.keys(req.body || {}));
    console.log("[SheetsScript] sheetId:", (req.body as any)?.sheetId);
    console.log("[SheetsScript] fileName:", (req.body as any)?.fileName);
    console.log("[SheetsScript] newOrders count:", Array.isArray((req.body as any)?.newOrders) ? (req.body as any).newOrders.length : "NOT_ARRAY");
    if (Array.isArray((req.body as any)?.newOrders) && (req.body as any).newOrders.length > 0) {
      console.log("[SheetsScript] FIRST ROW SAMPLE:", JSON.stringify((req.body as any).newOrders[0]).slice(0, 500));
    }
    console.log("════════════════════════════════════════════════════");
    if (!webhookKey || webhookKey.length < 12) {
      console.warn("[SheetsScript] ❌ REJECTED: invalid webhook key");
      return res.status(401).json({ success: false, message: "Invalid webhook key" });
    }
    try {
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) return res.status(403).json({ success: false, message: "Invalid webhook key" });
      const storeId = store.id;
      const body = req.body || {};
      const newOrders: any[] = Array.isArray(body.newOrders) ? body.newOrders : [];

      try {
        const incomingSheetId = body.sheetId || null;
        const allForStore = await db.select().from(storeIntegrations)
          .where(and(
            eq(storeIntegrations.storeId, storeId),
            eq(storeIntegrations.provider, "gsheets_script")
          ));
        const existing = incomingSheetId
          ? allForStore.find(r => r.spreadsheetId === incomingSheetId)
          : allForStore[0];
        if (existing) {
          await db.update(storeIntegrations)
            .set({
              lastSyncAt: new Date(), status: "active", isActive: 1,
              spreadsheetName: body.fileName || existing.spreadsheetName,
              spreadsheetId: incomingSheetId || existing.spreadsheetId,
            } as any)
            .where(eq(storeIntegrations.id, existing.id));
        } else {
          await db.insert(storeIntegrations).values({
            storeId, provider: "gsheets_script", type: "webhook",
            credentials: "{}", webhookKey, status: "active", isActive: 1,
            lastSyncAt: new Date(),
            spreadsheetId: incomingSheetId,
            spreadsheetName: body.fileName || null,
            ordersCount: 0,
          } as any);
        }
      } catch (e: any) { console.warn("[SheetsScript] Integration upsert failed:", e.message); }

      // Block sync if this specific sheet was disabled in the UI
      try {
        const conditions: any[] = [
          eq(storeIntegrations.storeId, storeId),
          eq(storeIntegrations.provider, "gsheets_script"),
        ];
        if (body.sheetId) conditions.push(eq(storeIntegrations.spreadsheetId, body.sheetId));
        const [currentInt] = await db.select().from(storeIntegrations).where(and(...conditions));
        if (currentInt && currentInt.isActive === 0) {
          console.log(`[SheetsScript] Sheet ${body.sheetId} is disabled for store ${storeId} — skipping`);
          return res.json({ success: true, created: 0, skipped: newOrders.length, message: "Sheet is disabled" });
        }
      } catch (_e) {}

      if (newOrders.length === 0) {
        return res.json({ success: true, message: "Connection registered", created: 0 });
      }

      const paywall = await storage.checkPaywall(storeId);
      if (paywall.isBlocked) {
        return res.status(402).json({ success: false, message: paywall.reason === "expired" ? "Subscription expired" : "Order limit reached" });
      }

      const allIntegrations = await db.select().from(storeIntegrations)
        .where(and(
          eq(storeIntegrations.storeId, storeId),
          eq(storeIntegrations.provider, "gsheets_script")
        ));
      const integration = (body.sheetId
        ? allIntegrations.find(r => r.spreadsheetId === body.sheetId)
        : null) || allIntegrations[0];
      const magasinId = integration?.magasinId ?? null;
      const storeProducts = await storage.getProductsByStore(storeId);
      let created = 0, skipped = 0;
      const errors: string[] = [];

      for (const rawRow of newOrders) {
        if (!rawRow || typeof rawRow !== "object") { skipped++; continue; }
        const parsed = parseSheetRowToOrder(rawRow);
        if (!parsed) {
          console.warn("[SheetsScript] ⚠️ Row skipped — no parseable customer:", JSON.stringify(rawRow).slice(0, 300));
          skipped++;
          continue;
        }
        console.log(`[SheetsScript] ✅ Parsed: name="${parsed.customerName}" phone="${parsed.customerPhone}" product="${parsed.productName}" qty=${parsed.quantity} price=${parsed.totalPrice}`);
        try {
          const dup = await storage.getOrderByNumber(storeId, parsed.orderNumber);
          if (dup) {
            console.log(`[SheetsScript] ⚠️ DUPLICATE skipped: orderNumber="${parsed.orderNumber}" already exists as order #${dup.id}`);
            skipped++;
            continue;
          }
          // ─── Product resolution with full logging ─────────────────────
          console.log(`[SheetsScript] 🔍 Resolving product: "${parsed.productName}" qty=${parsed.quantity} totalPrice=${parsed.totalPrice}`);

          const productNameLower = (parsed.productName || "").toLowerCase().trim();
          let matched: any = undefined;

          if (productNameLower) {
            matched = storeProducts.find((p: any) =>
              (p.name && p.name.toLowerCase().trim() === productNameLower) ||
              (p.sku && p.sku.toLowerCase().trim() === productNameLower)
            );
            if (matched) {
              console.log(`[SheetsScript] ✅ Matched existing product id=${matched.id} name="${matched.name}"`);
            } else {
              console.log(`[SheetsScript] ⚠️ No existing product matches "${parsed.productName}" — will auto-create`);
            }
          }

          // AUTO-CREATE if no match and we have a product name
          if (!matched && productNameLower) {
            try {
              // Auto-generate a unique SKU from the product name + timestamp (sku is NOT NULL in schema)
              const slugifiedName = parsed.productName
                .toUpperCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 20) || "PRODUCT";
              const autoSku = `${slugifiedName}-${Date.now().toString(36).toUpperCase()}`;

              const newProductData = {
                storeId,
                name: parsed.productName,
                sku: autoSku,
                costPrice: 0,
                sellingPrice: parsed.totalPrice > 0 ? parsed.totalPrice : 0,
                stock: 0,
              };
              console.log(`[SheetsScript] 🆕 Creating product:`, JSON.stringify(newProductData));
              const newProduct = await storage.createProduct(newProductData as any);
              if (newProduct && newProduct.id) {
                matched = newProduct;
                storeProducts.push(newProduct);
                console.log(`[SheetsScript] ✅ Auto-created product id=${newProduct.id} name="${parsed.productName}"`);
              } else {
                console.error(`[SheetsScript] ❌ createProduct returned no id`);
              }
            } catch (createErr: any) {
              console.error(`[SheetsScript] ❌ Auto-create FAILED for "${parsed.productName}":`, createErr.message);
              console.error(createErr.stack);
            }
          }

          // Compute per-unit price
          const lineUnitPrice = parsed.totalPrice > 0
            ? Math.round(parsed.totalPrice / Math.max(1, parsed.quantity))
            : (matched?.sellingPrice || 0);

          // Always attach orderItems if we resolved a product
          const orderItems = matched
            ? [{ productId: matched.id, quantity: parsed.quantity, price: lineUnitPrice, orderId: 0 }]
            : [];

          console.log(`[SheetsScript] 📦 orderItems prepared: ${orderItems.length} line(s)`, orderItems.length > 0 ? JSON.stringify(orderItems[0]) : "(empty — no product)");

          const finalComment = parsed.note || null;

          const order = await storage.createOrder({
            storeId, magasinId,
            orderNumber: parsed.orderNumber,
            customerName: parsed.customerName,
            customerPhone: parsed.customerPhone,
            customerAddress: parsed.customerAddress,
            customerCity: parsed.customerCity,
            status: "nouveau",
            totalPrice: parsed.totalPrice,
            productCost: matched ? (matched.costPrice || 0) * parsed.quantity : 0,
            shippingCost: 0,
            adSpend: 0,
            source: "gsheets_script",
            comment: finalComment,
          } as any, orderItems);
          const nextAgentId = await storage.getNextAgent(storeId, magasinId, matched?.id, parsed.customerCity);
          if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
          await storage.incrementMonthlyOrders(storeId);
          emitNewOrder(storeId, { id: order.id, orderNumber: parsed.orderNumber, customerName: parsed.customerName, status: "nouveau", source: "gsheets_script" });
          pushOrderToSheet(storeId, {
            action: "order.created",
            orderNumber: parsed.orderNumber,
            customerName: parsed.customerName,
            customerPhone: parsed.customerPhone,
            customerAddress: parsed.customerAddress,
            customerCity: parsed.customerCity,
            productName: parsed.productName,
            totalPrice: parsed.totalPrice,
            quantity: parsed.quantity,
            note: parsed.note,
            status: "nouveau",
            utmSource: null, utmCampaign: null, productId: null, magasin: null,
            createdAt: new Date().toLocaleString("fr-MA"),
            sourceUrl: "gsheets_script",
          }).catch(() => {});
          if (getWaAutoSettings(storeId).aiConfirmation) {
            triggerAIForNewOrder(storeId, order.id, parsed.customerPhone, parsed.customerName, matched?.id)
              .catch(err => console.error(`[AI] SheetsScript trigger failed for order ${order.id}:`, err.message));
          }
          created++;
        } catch (rowErr: any) {
          console.error("[SheetsScript] Row error:", rowErr.message);
          errors.push(`${parsed.orderNumber}: ${rowErr.message}`);
          skipped++;
        }
      }

      if (integration?.id && created > 0) {
        try {
          await db.update(storeIntegrations)
            .set({ ordersCount: (integration.ordersCount || 0) + created } as any)
            .where(eq(storeIntegrations.id, integration.id));
        } catch (e: any) { console.warn("[SheetsScript] ordersCount update failed:", e.message); }
      }

      await storage.createIntegrationLog({
        storeId, integrationId: integration?.id || null,
        provider: "gsheets_script", action: "bulk_sync",
        status: created > 0 ? "success" : "warning",
        message: `${created} commande(s) créée(s), ${skipped} ignorée(s)`,
      });

      console.log(`[SheetsScript] ✅ DONE: store=${storeId} created=${created} skipped=${skipped} errors=${errors.length}`);
      return res.json({
        success: true,
        created,
        skipped,
        errors: errors.slice(0, 10),
        message: created > 0
          ? `${created} nouvelle(s) commande(s) importée(s)`
          : (skipped > 0 ? `${skipped} ligne(s) ignorée(s) (doublons)` : "Aucune ligne à traiter"),
      });
    } catch (err: any) {
      console.error("[SheetsScript] Sync error:", err);
      res.status(500).json({ success: false, message: "Processing failed" });
    }
  });

  app.get("/api/sheets/script", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const apiKey = await storage.getOrGenerateWebhookKey(storeId);
    const apiUrl = `${req.protocol}://${req.get("host")}/api/sheets/sync/${apiKey}`;
    const script = `// TajerGrow — Google Sheets Auto-Sync v4 (Time-Driven)
// Copier ce code, le coller dans Extensions → Apps Script, puis exécuter setup()
//
// COMMENT ÇA MARCHE :
//   - setup() s'exécute une seule fois et installe un trigger toutes les minutes
//   - Toutes les 60 secondes, syncNewRows() scanne le sheet, envoie les nouvelles
//     lignes à la plateforme, puis marque la colonne "TajerGrow Status".
//   - Les lignes EXISTANTES au moment du setup() sont marquées comme déjà
//     synchronisées et NE seront PAS importées.

var API_URL = '${apiUrl}';
var STATUS_COLUMN_NAME = 'TajerGrow Status';

function setup() {
  removeOldTriggers();
  registerConnection();
  markExistingRowsAsSynced();
  installTimeTrigger();
  Logger.log('✅ Setup terminé. La synchronisation démarrera dans 1 minute.');
}

function removeOldTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'syncNewRows' || fn === 'onEditHandler') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function installTimeTrigger() {
  ScriptApp.newTrigger('syncNewRows')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('Trigger installé : syncNewRows toutes les 1 minute.');
}

function registerConnection() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const active = sheet.getActiveSheet();
  const response = sendToAPI({
    sheetId: sheet.getId(),
    sheetName: active.getName(),
    fileName: sheet.getName(),
    headers: [],
    newOrders: []
  });
  Logger.log('Register response: ' + response);
}

function markExistingRowsAsSynced() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const properties = PropertiesService.getDocumentProperties();
  for (var r = 2; r <= lastRow; r++) {
    properties.setProperty('row_' + r, new Date().toISOString());
  }
  Logger.log('Marqué ' + (lastRow - 1) + ' ligne(s) existante(s) comme déjà synchronisée(s).');
}

function getStatusColumnIndex(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return -1;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === STATUS_COLUMN_NAME) return i + 1;
  }
  return -1;
}

function writeRowStatus(sheet, row, text, isError) {
  const col = getStatusColumnIndex(sheet);
  if (col < 1) return;
  try {
    const cell = sheet.getRange(row, col);
    cell.setValue(text);
    cell.setFontColor(isError ? '#d93025' : '#0f9d58');
    cell.setFontWeight('bold');
  } catch (e) { Logger.log('writeRowStatus error: ' + e); }
}

// ★ MAIN SYNC FUNCTION — runs every 1 minute ★
function syncNewRows() {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) {
      Logger.log('Une autre synchronisation est déjà en cours, on attend le prochain tick.');
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2 || lastCol < 1) {
      Logger.log('Sheet vide — rien à synchroniser.');
      return;
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const properties = PropertiesService.getDocumentProperties();

    const newOrders = [];
    const newOrderRows = [];

    for (var i = 0; i < allValues.length; i++) {
      const rowNum = i + 2;
      const rowData = allValues[i];
      if (rowData.every(function(c) { return !c || c.toString().trim() === ''; })) continue;
      if (properties.getProperty('row_' + rowNum)) continue;
      const obj = {};
      for (var h = 0; h < headers.length; h++) {
        obj[headers[h]] = (rowData[h] !== null && rowData[h] !== '') ? rowData[h] : null;
      }
      newOrders.push(obj);
      newOrderRows.push(rowNum);
    }

    if (newOrders.length === 0) {
      Logger.log('Aucune nouvelle ligne à synchroniser.');
      return;
    }

    Logger.log('Envoi de ' + newOrders.length + ' nouvelle(s) ligne(s)...');

    const responseText = sendToAPI({
      sheetId: ss.getId(),
      sheetName: sheet.getName(),
      fileName: ss.getName(),
      headers: headers,
      newOrders: newOrders
    });

    var success = false;
    var createdCount = 0;
    var apiMessage = '';
    try {
      const parsed = JSON.parse(responseText);
      success = parsed.success === true;
      createdCount = parsed.created || 0;
      apiMessage = parsed.message || '';
    } catch (parseErr) {
      Logger.log('Réponse non-JSON: ' + responseText);
      apiMessage = 'Réponse invalide';
    }

    for (var j = 0; j < newOrderRows.length; j++) {
      const r = newOrderRows[j];
      if (success && createdCount > 0) {
        properties.setProperty('row_' + r, new Date().toISOString());
        writeRowStatus(sheet, r, '✅ Synchronisée', false);
      } else if (success && createdCount === 0) {
        // Backend accepted but skipped (duplicate or empty) — mark so user sees it was NOT created
        properties.setProperty('row_' + r, new Date().toISOString());
        writeRowStatus(sheet, r, '⚠️ Doublon (non créée)', true);
      } else {
        writeRowStatus(sheet, r, '❌ ' + apiMessage, true);
      }
    }

    Logger.log('Sync terminée : ' + createdCount + ' commande(s) créée(s) sur ' + newOrders.length + ' envoyée(s).');
  } catch (err) {
    Logger.log('Erreur syncNewRows: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Optional: clears all synced markers and re-imports everything (use with caution!)
function forceImportAll() {
  const properties = PropertiesService.getDocumentProperties();
  const props = properties.getProperties();
  for (var k in props) {
    if (k.indexOf('row_') === 0) properties.deleteProperty(k);
  }
  syncNewRows();
}

function sendToAPI(data) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(API_URL, options);
    const text = response.getContentText();
    const code = response.getResponseCode();
    Logger.log('API ' + code + ': ' + text);
    return text;
  } catch (e) {
    Logger.log('Erreur API: ' + e.message);
    return '{"success":false,"message":"' + e.message + '"}';
  }
}
`;
    res.type("text/plain").send(script);
  });

  app.get("/api/sheets/list", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    try {
      const rows = await db.select().from(storeIntegrations)
        .where(and(
          eq(storeIntegrations.storeId, storeId),
          eq(storeIntegrations.provider, "gsheets_script")
        ))
        .orderBy(desc(storeIntegrations.createdAt));
      const sheets = rows.map(r => ({
        id: r.id,
        spreadsheetId: r.spreadsheetId,
        spreadsheetName: r.spreadsheetName || "Google Sheet",
        ordersCount: (r as any).ordersCount || 0,
        isActive: r.isActive === 1,
        status: r.status,
        lastSyncAt: r.lastSyncAt,
        createdAt: r.createdAt,
      }));
      res.json({ count: sheets.length, sheets });
    } catch (err: any) {
      console.error("[SheetsScript] List error:", err);
      res.status(500).json({ count: 0, sheets: [] });
    }
  });

  app.post("/api/sheets/:id/toggle", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    try {
      const [row] = await db.select().from(storeIntegrations)
        .where(and(
          eq(storeIntegrations.id, id),
          eq(storeIntegrations.storeId, storeId),
          eq(storeIntegrations.provider, "gsheets_script")
        ));
      if (!row) return res.status(404).json({ success: false, message: "Sheet not found" });
      const newActive = row.isActive === 1 ? 0 : 1;
      await db.update(storeIntegrations)
        .set({ isActive: newActive, status: newActive ? "active" : "inactive" } as any)
        .where(eq(storeIntegrations.id, id));
      res.json({ success: true, isActive: newActive === 1 });
    } catch (err: any) {
      console.error("[SheetsScript] Toggle error:", err);
      res.status(500).json({ success: false, message: "Toggle failed" });
    }
  });

  app.delete("/api/sheets/:id", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
    try {
      const [row] = await db.select().from(storeIntegrations)
        .where(and(
          eq(storeIntegrations.id, id),
          eq(storeIntegrations.storeId, storeId),
          eq(storeIntegrations.provider, "gsheets_script")
        ));
      if (!row) return res.status(404).json({ success: false, message: "Sheet not found" });
      // Nullify FK references in integration_logs before deleting
      await db.update(integrationLogs)
        .set({ integrationId: null } as any)
        .where(eq(integrationLogs.integrationId, id));
      await db.delete(storeIntegrations).where(eq(storeIntegrations.id, id));
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SheetsScript] Delete error:", err);
      res.status(500).json({ success: false, message: "Delete failed" });
    }
  });

  app.post("/api/sheets/verify", requireAuth, async (req: any, res: any) => {
    const storeId = req.user!.storeId!;
    try {
      const integration = await storage.getIntegrationByProvider(storeId, "gsheets_script");
      if (!integration || !integration.lastSyncAt) {
        return res.json({ connected: false, message: "Aucune connexion détectée. Avez-vous exécuté setup() dans Apps Script ?" });
      }
      const lastSync = new Date(integration.lastSyncAt);
      return res.json({
        connected: true,
        lastSyncAt: lastSync.toISOString(),
        spreadsheetName: integration.spreadsheetName || null,
        message: `Connexion active. Dernière synchronisation : ${lastSync.toLocaleString("fr-FR")}`,
      });
    } catch (err: any) {
      console.error("[SheetsScript] Verify error:", err);
      res.status(500).json({ connected: false, message: "Erreur serveur" });
    }
  });

  return httpServer;
}

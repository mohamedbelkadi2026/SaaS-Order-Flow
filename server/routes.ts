import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireAuth, requireAdmin, requireActiveSubscription, hashPassword, comparePasswords } from "./auth";
import { db } from "./db";
import { users, orders, orderItems, storeIntegrations, integrationLogs, aiConversations } from "@shared/schema";
import { eq, and, gte, lt, count, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { addSSEClient, broadcastToStore } from "./sse";
import { triggerAIForNewOrder, handleIncomingMessage } from "./ai-agent";
import { shipOrderToCarrier } from "./services/carrier-service";

import fs from "fs";

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
  return MOROCCAN_CITIES_DEFAULT;
}

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
    const rawName = payload.customer
      ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
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
    const CONFIRMED_STATUSES = new Set(['confirme', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné']);

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
    res.json({ totalOrders, nouveau, confirme: cumConfirmed, inProgress, cancelled, delivered, refused, injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale, revenue, profit, confirmationRate });
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
    const allOrders = await storage.getOrdersByStore(storeId);
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
    const { city, productId, source, dateFrom, dateTo, shippingProvider, utmSource, utmCampaign } = req.query as Record<string, string>;
    let { agentId } = req.query as Record<string, string>;

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
      allOrders = allOrders.filter(o => o.items?.some((i: any) => i.productId === pid));
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
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) <= to);
    }

    let totalOrders = allOrders.length;
    // CONFIRMED = all statuses an order passes through after agent confirmation
    // (cumulative: once confirmed, always counted as confirmed regardless of shipping stage)
    const ADMIN_CONFIRMED = new Set(['confirme', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné']);
    let nouveau = 0, confirme = 0, inProgress = 0, delivered = 0, refused = 0;
    let injoignable = 0, annuleFake = 0, annuleFauxNumero = 0, annuleDouble = 0, boiteVocale = 0;
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

    allOrders.forEach(o => {
      if (o.status === 'nouveau') nouveau++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'refused') refused++;
      else if (o.status === 'Injoignable') injoignable++;
      else if (o.status === 'Annulé (fake)') annuleFake++;
      else if (o.status === 'Annulé (faux numéro)') annuleFauxNumero++;
      else if (o.status === 'Annulé (double)') annuleDouble++;
      else if (o.status === 'boite vocale') boiteVocale++;

      // confirme = ALL confirmed statuses: 'confirme' + 'expédié' + 'delivered'
      if (ADMIN_CONFIRMED.has(o.status)) confirme++;
      // delivered = only truly delivered
      if (o.status === 'delivered') delivered++;

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

    const cancelled = annuleFake + annuleFauxNumero + annuleDouble;
    // confirmationRate = (confirme + expédié + delivered) / total
    const confirmationRate = totalOrders > 0 ? Math.round(confirme / totalOrders * 100) : 0;
    // deliveryRate = delivered / confirmed (not divided by total)
    const deliveryRate = confirme > 0 ? Math.round(delivered / confirme * 100) : 0;

    const dailyMap: Record<string, number> = {};
    const now = new Date();
    const startDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const endDate = dateTo ? new Date(dateTo + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dailyMap[cursor.toISOString().slice(0, 10)] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    allOrders.forEach(o => {
      if (o.createdAt) {
        const day = new Date(o.createdAt).toISOString().slice(0, 10);
        if (dailyMap[day] !== undefined) dailyMap[day]++;
      }
    });
    const daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

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
      const displayName = (v && v !== 'Default Title' && v !== 'null' && v !== '-') ? `${rawName} - ${v}` : rawName;
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
      if (o.status === 'in_progress') rawProductMap[key].inProgress++;
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
      if (dateFrom && e.date < dateFrom) return;
      if (dateTo && e.date > dateTo) return;
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

    res.json({
      totalOrders, nouveau, confirme, inProgress, cancelled, delivered, refused,
      injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale,
      confirmationRate, deliveryRate,
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
      const schema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      });
      const { currentPassword, newPassword } = schema.parse(req.body);
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

    if (user.role === 'agent') {
      const ordersList = await storage.getOrdersByAgent(user.id);
      if (status === 'annule_group') {
        res.json(ordersList.filter(o => o.status?.startsWith('Annulé')));
      } else if (status === 'suivi_group') {
        res.json(ordersList.filter(o => ['in_progress', 'expédié', 'retourné', 'Attente De Ramassage'].includes(o.status)));
      } else {
        res.json(status ? ordersList.filter(o => o.status === status) : ordersList);
      }
    } else {
      if (status === 'annule_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(ordersList.filter(o => o.status?.startsWith('Annulé')));
      } else if (status === 'suivi_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(ordersList.filter(o => ['in_progress', 'expédié', 'retourné', 'Attente De Ramassage'].includes(o.status)));
      } else {
        const ordersList = await storage.getOrdersByStore(user.storeId!, status || undefined);
        res.json(ordersList);
      }
    }
  });

  app.get("/api/orders/filtered", requireAuth, async (req, res) => {
    const user = req.user!;
    const filters = {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      city: req.query.city as string | undefined,
      source: req.query.source as string | undefined,
      utmSource: req.query.utmSource as string | undefined,
      utmCampaign: req.query.utmCampaign as string | undefined,
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
    const filters = {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      city: req.query.city as string | undefined,
      source: req.query.source as string | undefined,
      utmSource: req.query.utmSource as string | undefined,
      utmCampaign: req.query.utmCampaign as string | undefined,
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
    try {
      const user = req.user!;
      if (user.role === 'agent') {
        return res.status(403).json({ message: "Les agents ne peuvent pas expédier en masse" });
      }

      const { orderIds, provider } = req.body;
      if (!Array.isArray(orderIds) || orderIds.length === 0 || !provider) {
        return res.status(400).json({ message: "orderIds (tableau) et provider sont obligatoires" });
      }

      const storeId = user.storeId!;

      // Smart dispatch: try carrier accounts first, fall back to legacy storeIntegrations
      const defaultCreds = await storage.getAccountForShipping(storeId, provider);
      if (!defaultCreds) {
        return res.status(400).json({ message: `Transporteur ${provider} non connecté. Ajoutez un compte dans Intégrations → Sociétés de Livraison.` });
      }

      const eligible = await storage.bulkShipOrders(orderIds, storeId);
      if (eligible.length === 0) {
        return res.status(400).json({ message: "Aucune commande éligible (statut 'confirme' requis)" });
      }

      type ShipResult = { orderId: number; orderNumber?: string; trackingNumber?: string; labelLink?: string; status: 'shipped' | 'failed'; error?: string };
      const results: ShipResult[] = [];
      const total = eligible.length;
      let done = 0;
      let shippedCount = 0;
      let failedCount  = 0;

      // ── Helpers ─────────────────────────────────────────────────
      const getProductName = (order: any) =>
        order.rawProductName ||
        (order.items?.length > 0
          ? (order.items[0].rawProductName || order.items[0].product?.name || 'Produit')
          : 'Produit');

      // Pre-load all active carrier accounts for smart city-based dispatch
      const allCarrierAccounts = await storage.getCarrierAccounts(storeId, provider);
      const activeAccounts = allCarrierAccounts.filter((a: any) => a.isActive === 1);

      // Resolve credentials per-order (city routing or default)
      const getCredsForOrder = (city: string): Record<string, string> => {
        // 1. Try city-specific account
        const cityAcct = activeAccounts.find((a: any) => {
          if (a.assignmentRule !== 'city') return false;
          try {
            const cities: string[] = JSON.parse(a.assignmentData || '[]');
            return cities.some((c: string) => c.toLowerCase() === city.toLowerCase());
          } catch { return false; }
        });
        if (cityAcct) return { apiKey: cityAcct.apiKey, apiSecret: cityAcct.apiSecret || '', apiUrl: cityAcct.apiUrl || '' };
        // 2. Default account
        const def = activeAccounts.find((a: any) => a.isDefault === 1) || activeAccounts[0];
        if (def) return { apiKey: def.apiKey, apiSecret: def.apiSecret || '', apiUrl: def.apiUrl || '' };
        // 3. Fall back to the pre-validated defaultCreds
        return defaultCreds as Record<string, string>;
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

      // ── Batch processing (5 simultaneous, no sequential blocking) ─
      const BATCH_SIZE = 5;
      for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        const batch = eligible.slice(i, i + BATCH_SIZE);

        // Fire all requests in this batch simultaneously
        const settled = await Promise.allSettled(
          batch.map(order => {
            const resolvedCity = getResolvedCity(order);
            const orderCreds = getCredsForOrder(resolvedCity);
            return shipOrderToCarrier(provider, orderCreds, {
              customerName: order.customerName,
              phone:        order.customerPhone,
              city:         resolvedCity,
              address:      (order as any).customerAddress || (order as any).customerCity || '',
              totalPrice:   order.totalPrice,
              productName:  getProductName(order),
              canOpen:      (order as any).canOpen === 1,
              orderNumber:  (order as any).orderNumber || String(order.id),
              orderId:      order.id,
              storeId,
            });
          })
        );

        // ── Classify results ───────────────────────────────────────
        const dbUpdates: Promise<unknown>[] = [];
        const logUpdates: Promise<unknown>[] = [];

        settled.forEach((outcome, idx) => {
          const order = batch[idx];
          const ref   = (order as any).orderNumber || order.id;

          if (outcome.status === 'fulfilled' && outcome.value.success) {
            const { trackingNumber, labelUrl } = outcome.value;
            // Queue DB writes — run them in parallel after classifying
            dbUpdates.push(
              storage.updateOrderShipping(order.id, trackingNumber!, labelUrl!, provider),
              storage.updateOrderStatus(order.id, 'Attente De Ramassage'),
            );
            logUpdates.push(storage.createIntegrationLog({
              storeId, integrationId: integration.id, provider,
              action: 'shipping_sent', status: 'success',
              message: `✅ Commande #${ref} envoyée. Tracking: ${trackingNumber}`,
            }));
            results.push({ orderId: order.id, orderNumber: (order as any).orderNumber, trackingNumber, labelLink: labelUrl, status: 'shipped' });
            shippedCount++;
          } else {
            const errMsg =
              outcome.status === 'rejected'
                ? String(outcome.reason?.message || outcome.reason || 'Erreur inconnue')
                : (outcome.value?.error || 'Erreur inconnue');
            const httpCode = outcome.status === 'fulfilled' ? (outcome.value?.httpStatus ?? '?') : '?';
            logUpdates.push(storage.createIntegrationLog({
              storeId, integrationId: integration.id, provider,
              action: 'shipping_sent', status: 'fail',
              message: `❌ Commande #${ref} refusée (HTTP ${httpCode}): ${errMsg}`,
            }));
            results.push({ orderId: order.id, orderNumber: (order as any).orderNumber, status: 'failed', error: errMsg });
            failedCount++;
          }
        });

        // ── Flush DB writes in parallel before moving to next batch ─
        await Promise.all([...dbUpdates, ...logUpdates]);
        done += batch.length;

        // ── Broadcast progress via SSE ─────────────────────────────
        broadcastProgress();
      }

      // Final broadcast — ensures frontend always receives 100%
      broadcastToStore(storeId, 'shipping_progress', { done: total, total, shipped: shippedCount, failed: failedCount, complete: true });

      res.json({ shipped: shippedCount, failed: failedCount, total: results.length, results });
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
      const previousStatus = order.status;
      const updated = await storage.updateOrderStatus(orderId, status);
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
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) return res.status(400).json({ message: "Cet email est déjà utilisé" });
      const userRole = data.role || "agent";
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        username: data.username, email: data.email, phone: data.phone || null,
        password: hashedPassword, role: userRole, storeId,
        paymentType: data.paymentType || "commission",
        paymentAmount: data.paymentAmount || 0,
        distributionMethod: data.distributionMethod || "auto",
        isActive: data.isActive ?? 1,
        buyerCode: (userRole === 'media_buyer' && data.buyerCode) ? data.buyerCode.trim().toUpperCase() : null,
      } as any);

      // Save store-specific agent settings (role, distribution rules) — agents only
      if (userRole === 'agent') {
        const settingsPayload: any = {
          roleInStore: (req.body.roleInStore as string) || "confirmation",
        };
        const distMethod = data.distributionMethod || "auto";
        if (distMethod === "pourcentage") {
          settingsPayload.leadPercentage = req.body.leadPercentage || 100;
        }
        if (distMethod === "produit" && Array.isArray(req.body.allowedProductIds)) {
          settingsPayload.allowedProductIds = JSON.stringify(req.body.allowedProductIds);
        }
        if (distMethod === "region" && Array.isArray(req.body.allowedRegions)) {
          settingsPayload.allowedRegions = JSON.stringify(req.body.allowedRegions);
        }
        if (typeof req.body.commissionRate === 'number') {
          settingsPayload.commissionRate = req.body.commissionRate;
        }
        await storage.upsertStoreAgentSetting(user.id, storeId, settingsPayload);
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
    const { productId, source, dateFrom, dateTo, tab, userId } = req.query as Record<string, string>;
    const opts: any = { source, dateFrom, dateTo };
    if (tab === 'source') opts.productId = null;
    else if (productId && productId !== 'all') opts.productId = Number(productId);
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
    const { source, date, amount, productId, productSellingPrice } = req.body;
    if (!source || !date || amount === undefined) return res.status(400).json({ message: "Champs requis manquants" });
    const amountCents = Math.round(Number(amount) * 100);
    const pspCents = productSellingPrice ? Math.round(Number(productSellingPrice) * 100) : null;
    const entry = await storage.createAdSpendEntry({
      storeId,
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
    res.json(await storage.getAdminProfitSummary(storeId, dateFrom, dateTo, productId, mediaBuyerIdFilter));
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
    res.json(await storage.getMediaBuyerProfit(storeId, mediaBuyerId, dateFrom, dateTo));
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
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const existing = await storage.getIntegrationByProvider(storeId, data.provider);
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
      });
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
      });
      const data = schema.parse(req.body);
      const updateData: any = {};
      if (data.credentials) updateData.credentials = JSON.stringify(data.credentials);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const updated = await storage.updateIntegration(id, updateData);
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
  // CARRIER ACCOUNTS (Multi-account per carrier)
  // ============================================================

  app.get("/api/carrier-accounts", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const provider = req.query.provider as string | undefined;
    const accounts = await storage.getCarrierAccounts(storeId, provider);
    // Mask apiKey in list view — return first 8 + stars
    const masked = accounts.map(a => ({
      ...a,
      apiKeyMasked: a.apiKey.slice(0, 8) + "•".repeat(Math.max(0, a.apiKey.length - 8)),
    }));
    res.json(masked);
  });

  app.post("/api/carrier-accounts", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const { carrierName, connectionName, apiKey, apiSecret, apiUrl, storeName, storeId: linkedStoreId, assignmentRule, isDefault } = req.body;
      if (!carrierName || !apiKey) {
        return res.status(400).json({ message: "carrierName et apiKey sont obligatoires" });
      }
      const { randomUUID } = await import("crypto");
      const webhookToken = `${carrierName}-${storeId}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

      // Auto-number the connection if no name given
      const existing = await storage.getCarrierAccounts(storeId, carrierName);
      const name = connectionName || `Connection ${existing.length + 1}`;

      const acct = await storage.createCarrierAccount({
        storeId,
        carrierName,
        connectionName: name,
        apiKey,
        apiSecret: apiSecret || null,
        apiUrl: apiUrl || null,
        webhookToken,
        storeName: storeName || null,
        isDefault: isDefault ? 1 : (existing.length === 0 ? 1 : 0),
        isActive: 1,
        assignmentRule: assignmentRule || "default",
      });

      // Log creation (non-blocking — failure won't affect the response)
      storage.createIntegrationLog({
        storeId, integrationId: null, provider: carrierName,
        action: 'carrier_account_created', status: 'success',
        message: `Compte transporteur "${name}" créé pour ${carrierName}`,
      }).catch(e => console.error('[LOG-ERROR] createIntegrationLog:', e));

      res.json(acct);
    } catch (error: any) {
      console.error('[DB-ERROR] POST /api/carrier-accounts:', error?.message || error);
      console.error('[DB-ERROR] Stack:', error?.stack);
      res.status(500).json({
        message: error?.message?.includes('relation') || error?.message?.includes('does not exist')
          ? 'Table carrier_accounts introuvable — contactez le support'
          : error?.message || 'Erreur serveur lors de la création du compte transporteur',
      });
    }
  });

  app.patch("/api/carrier-accounts/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const storeId = req.user!.storeId!;
      const acct = await storage.getCarrierAccount(id);
      if (!acct || acct.storeId !== storeId) return res.status(404).json({ message: "Compte introuvable" });

      const { connectionName, apiKey, apiSecret, apiUrl, storeName, assignmentRule, isDefault, isActive, assignmentData } = req.body;
      const updated = await storage.updateCarrierAccount(id, {
        ...(connectionName !== undefined && { connectionName }),
        ...(apiKey !== undefined && apiKey !== "" && { apiKey }),
        ...(apiSecret !== undefined && { apiSecret }),
        ...(apiUrl !== undefined && { apiUrl }),
        ...(storeName !== undefined && { storeName }),
        ...(assignmentRule !== undefined && { assignmentRule }),
        ...(isDefault !== undefined && { isDefault: isDefault ? 1 : 0 }),
        ...(isActive !== undefined && { isActive: isActive ? 1 : 0 }),
        ...(assignmentData !== undefined && { assignmentData }),
      });
      res.json(updated);
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

  // Webhook endpoint keyed to the unique webhookToken per account
  app.post("/api/webhook/carrier/:token", async (req, res) => {
    try {
      const token = req.params.token;
      // Find the account by webhook token
      const allStores = await storage.getAllActiveIntegrationsByProvider("*").catch(() => []);
      // We can't easily look up by token without a query — use a DB call
      const { db } = await import("./db");
      const { carrierAccounts: tbl } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [account] = await db.select().from(tbl).where(eq(tbl.webhookToken, token));

      if (!account) {
        return res.status(404).json({ message: "Webhook token invalide" });
      }

      const body = req.body;
      const trackingNumber = body.tracking_number || body.barcode || body.code_suivi || body.id;
      const rawStatus      = (body.status || body.etat || body.statut || "").toLowerCase();

      let newStatus: string | null = null;
      if (rawStatus.includes("livr")) newStatus = "Livré";
      else if (rawStatus.includes("retour")) newStatus = "Retour";
      else if (rawStatus.includes("ramassage") || rawStatus.includes("enlev")) newStatus = "Attente De Ramassage";

      if (trackingNumber && newStatus) {
        const order = await storage.getOrderByTrackingNumber(account.storeId, trackingNumber);
        if (order) {
          await storage.updateOrderStatus(order.id, newStatus);
          console.log(`[Webhook:${account.carrierName}] #${order.id} → ${newStatus}`);
        }
      }

      await storage.createIntegrationLog({
        storeId: account.storeId, integrationId: null, provider: account.carrierName,
        action: 'webhook_received', status: 'success',
        message: `Webhook reçu — tracking: ${trackingNumber || '?'} statut: ${rawStatus}`,
        payload: JSON.stringify(body).slice(0, 500),
      });

      res.json({ received: true });
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

      const order = await storage.createOrder({
        storeId,
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
      const nextAgentId = await storage.getNextAgent(storeId, firstProductId, parsed.customerCity);
      if (nextAgentId) {
        await storage.assignOrder(order.id, nextAgentId);
      }

      await storage.incrementMonthlyOrders(storeId);

      await storage.createIntegrationLog({
        storeId, integrationId: integration?.id || null, provider,
        action: 'order_synced', status: 'success',
        message: `Commande ${parsed.orderNumber} importée${nextAgentId ? ` (assignée à agent #${nextAgentId})` : ''} (${parsed.lineItems.length} articles, ${orderItemsToCreate.length} matchés)`,
      });

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
    try {
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) return res.status(404).json({ message: "Invalid webhook key" });
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
      const orderItemsToCreate: { productId: number; quantity: number; price: number }[] = [];
      for (const item of parsed.lineItems) {
        const matched = storeProducts.find(p => (item.sku && p.sku === item.sku) || p.name === item.title);
        if (matched) {
          orderItemsToCreate.push({ productId: matched.id, quantity: item.quantity, price: item.price });
          productCost += matched.costPrice * item.quantity;
        }
      }

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

      const order = await storage.createOrder({
        storeId, orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: resolvedCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: provider, comment: parsed.comment,
        rawProductName, variantDetails, rawQuantity,
        utmSource: parsed.utmSource || null, utmCampaign: parsed.utmCampaign || null,
        trafficPlatform: parsed.trafficPlatform || null,
        mediaBuyerId: mediaBuyerToken?.id || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
      const nextAgentId = await storage.getNextAgent(storeId, firstProductId, resolvedCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);

      await storage.incrementMonthlyOrders(storeId);

      const integration = await storage.getIntegrationByProvider(storeId, provider);
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider, action: 'order_synced', status: 'success', message: `Commande ${parsed.orderNumber} importée via token webhook` });

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
      triggerAIForNewOrder(storeId, order.id, parsed.customerPhone, parsed.customerName, firstProductId)
        .catch(err => console.error(`[AI] Trigger failed for order ${order.id}:`, err.message));
    } catch (err: any) {
      console.error(`Token webhook error (${provider}):`, err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Google Sheets webhook
  app.post("/api/webhooks/gsheets/:webhookKey", async (req, res) => {
    const webhookKey = req.params.webhookKey;
    try {
      const store = await storage.getStoreByWebhookKey(webhookKey);
      if (!store) return res.status(404).json({ message: "Invalid webhook key" });
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
      const order = await storage.createOrder({
        storeId, orderNumber, customerName, customerPhone, customerAddress, customerCity,
        status: 'nouveau', totalPrice, productCost: matched ? matched.costPrice : 0,
        shippingCost: 0, adSpend: 0, source: 'gsheets', comment: null,
      }, orderItems);
      const nextAgentId = await storage.getNextAgent(storeId, matched?.id, customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
      await storage.incrementMonthlyOrders(storeId);
      const integration = await storage.getIntegrationByProvider(storeId, 'gsheets');
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider: 'gsheets', action: 'order_synced', status: 'success', message: `Commande Google Sheets ${orderNumber} importée` });
      res.json({ success: true, orderId: order.id });
      // ── Fire-and-forget: AI WhatsApp confirmation ──────────────
      console.log(`[Webhook] Attempting WhatsApp AI trigger for GSheets order: ${customerPhone}`);
      triggerAIForNewOrder(storeId, order.id, customerPhone, customerName, matched?.id)
        .catch(err => console.error(`[AI] GSheets trigger failed for order ${order.id}:`, err.message));
    } catch (err: any) {
      console.error('GSheets webhook error:', err);
      res.status(500).json({ message: 'Processing failed' });
    }
  });

  // ── Google Sheets: API-key based webhook (new plug-and-play script) ──
  app.post("/api/integrations/google-sheets/webhook", async (req, res) => {
    const apiKey = (req.headers["x-api-key"] || req.body?.apiKey || "").toString().trim();
    if (!apiKey) return res.status(401).json({ success: false, message: "Missing X-Api-Key header" });
    try {
      const store = await storage.getStoreByWebhookKey(apiKey);
      if (!store) return res.status(403).json({ success: false, message: "Invalid API key" });
      const storeId = store.id;
      const data = req.body || {};
      const customerName    = (data.name    || data.nom    || data.customer_name   || "").toString().trim();
      const customerPhone   = (data.phone   || data.telephone || data.customer_phone || "").toString().trim();
      const customerCity    = (data.city    || data.ville   || "").toString().trim();
      const customerAddress = (data.address || data.adresse || "").toString().trim();
      const productName     = (data.product || data.produit || "").toString().trim();
      const quantity        = parseInt(data.quantity || "1") || 1;
      const rawPrice        = parseFloat(String(data.price || data.prix || "0").replace(",", ".")) || 0;
      const totalPrice      = Math.round(rawPrice * 100);
      const orderNumber     = (data.ref || `GS-${Date.now()}`).toString();
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
      const order = await storage.createOrder({
        storeId, orderNumber, customerName, customerPhone, customerAddress, customerCity,
        status: "nouveau", totalPrice, productCost: matched ? matched.costPrice : 0,
        shippingCost: 0, adSpend: 0, source: "gsheets", comment: null,
      }, orderItems);
      const nextAgentId = await storage.getNextAgent(storeId, matched?.id, customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
      await storage.incrementMonthlyOrders(storeId);
      const integration = await storage.getIntegrationByProvider(storeId, "gsheets");
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider: "gsheets", action: "order_synced", status: "success", message: `Commande Google Sheets ${orderNumber} importée (API key)` });
      console.log(`[GSheets-API] New order #${orderNumber} for store ${storeId} — ${customerName} / ${customerPhone}`);
      res.json({ success: true, orderId: order.id });
      triggerAIForNewOrder(storeId, order.id, customerPhone, customerName, matched?.id)
        .catch(err => console.error(`[AI] GSheets-API trigger failed for order ${order.id}:`, err.message));
    } catch (err: any) {
      console.error("[GSheets-API] Webhook error:", err);
      res.status(500).json({ success: false, message: "Processing failed" });
    }
  });

  // Verify connection: check if integration has received recent logs
  app.post("/api/integrations/verify/:provider", requireAuth, async (req, res) => {
    const provider = req.params.provider;
    const storeId = req.user!.storeId!;
    try {
      const logs = await storage.getIntegrationLogs(storeId, 50);
      const providerLogs = logs.filter(l => l.provider === provider);
      const successLog = providerLogs.find(l => l.status === 'success');
      const integration = await storage.getIntegrationByProvider(storeId, provider);
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
      const orderItemsToCreate: { productId: number; quantity: number; price: number }[] = [];

      for (const item of parsed.lineItems) {
        const matchedProduct = storeProducts.find(p => (item.sku && p.sku === item.sku) || p.name === item.title);
        if (matchedProduct) {
          orderItemsToCreate.push({ productId: matchedProduct.id, quantity: item.quantity, price: item.price });
          productCost += matchedProduct.costPrice * item.quantity;
        }
      }

      const mediaBuyerShopify = parsed.buyerCode ? await storage.getMediaBuyerByCode(storeId, parsed.buyerCode) : null;
      console.log(`[Attribution] Order=${parsed.orderNumber} UTM="${parsed.utmSource}" → Code=${parsed.buyerCode || 'none'} Platform=${parsed.trafficPlatform || 'none'} → Buyer=${mediaBuyerShopify ? mediaBuyerShopify.username + ' (#' + mediaBuyerShopify.id + ')' : 'NOT FOUND'}`);

      const order = await storage.createOrder({
        storeId, orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: 'shopify', comment: parsed.comment,
        utmSource: parsed.utmSource || null, utmCampaign: parsed.utmCampaign || null,
        trafficPlatform: parsed.trafficPlatform || null,
        mediaBuyerId: mediaBuyerShopify?.id || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

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
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: `Limite de commandes atteinte (${limitCheck.current}/${limitCheck.limit}).` });
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

      const order = await storage.createOrder({
        storeId,
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

      const agentId = data.agentId || await storage.getNextAgent(storeId, undefined, data.customerCity);
      if (agentId) await storage.assignOrder(order.id, agentId);

      await storage.incrementMonthlyOrders(storeId);

      res.status(201).json(order);

      // Fire-and-forget: AI confirmation trigger
      if (data.status !== 'confirme') {
        const firstProductId = data.items[0]?.productId ?? null;
        triggerAIForNewOrder(storeId, order.id, data.customerPhone, data.customerName, firstProductId).catch(console.error);
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
      });
      const data = schema.parse(req.body);
      const storeId = req.user!.storeId!;

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: `Limite de commandes atteinte (${limitCheck.current}/${limitCheck.limit}). Passez au plan Pro pour continuer.`,
        });
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
      const order = await storage.createOrder({
        storeId,
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
      }, orderItemsToCreate);

      const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
      const nextAgentId = await storage.getNextAgent(storeId, firstProductId, data.customerCity);
      if (nextAgentId) {
        await storage.assignOrder(order.id, nextAgentId);
      }

      await storage.incrementMonthlyOrders(storeId);

      const finalOrder = await storage.getOrder(order.id);
      res.status(201).json(finalOrder || order);

      // Fire-and-forget: AI confirmation trigger
      triggerAIForNewOrder(storeId, order.id, data.customerPhone, data.customerName, orderItemsToCreate[0]?.productId).catch(console.error);
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
      });
      const data = schema.parse(req.body);
      console.log(`[PATCH /api/orders/${orderId}] storeId=${req.user!.storeId} fields=${JSON.stringify({ status: data.status, comment: data.comment, commentStatus: data.commentStatus, commentOrder: data.commentOrder, customerName: data.customerName, customerCity: data.customerCity })}`);

      // Route status changes through updateOrderStatus for proper stock handling
      if (data.status && data.status !== order.status) {
        console.log(`[PATCH /api/orders/${orderId}] Updating status ${order.status} → ${data.status}`);
        await storage.updateOrderStatus(orderId, data.status);

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

  // ============================================================
  // CUSTOMERS (CRM)
  // ============================================================
  app.get("/api/customers", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    res.json(await storage.getCustomersByStore(storeId));
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
    res.json(await storage.getAgentPerformance(storeId));
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
      if (data.distributionMethod !== undefined) userPayload.distributionMethod = data.distributionMethod;
      if (data.isActive !== undefined) userPayload.isActive = data.isActive;
      if (data.buyerCode !== undefined) userPayload.buyerCode = data.buyerCode ? data.buyerCode.trim().toUpperCase() : null;

      if (Object.keys(userPayload).length > 0) {
        await storage.updateUser(userId, userPayload);
      }

      if (agent.role === 'agent') {
        const settingsPayload: any = {};
        if (data.roleInStore !== undefined) settingsPayload.roleInStore = data.roleInStore;
        if (data.leadPercentage !== undefined) settingsPayload.leadPercentage = data.leadPercentage;
        if (data.allowedProductIds !== undefined) settingsPayload.allowedProductIds = JSON.stringify(data.allowedProductIds);
        if (data.allowedRegions !== undefined) settingsPayload.allowedRegions = JSON.stringify(data.allowedRegions);
        if (data.commissionRate !== undefined) settingsPayload.commissionRate = data.commissionRate;
        if (Object.keys(settingsPayload).length > 0) {
          await storage.upsertStoreAgentSetting(userId, admin.storeId!, settingsPayload);
        }
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
      const result = await storage.upsertStoreAgentSetting(agentId, storeId, payload);
      res.json(result);
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
    const wallet = await storage.getAgentWallet(user.id, storeId);
    res.json(wallet);
  });

  app.get("/api/stats/commissions-summary", requireAdmin, async (req, res) => {
    const storeId = req.user!.storeId!;
    const summary = await storage.getCommissionsSummary(storeId);
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
    const { name, phone, website, facebook, instagram, logoUrl, canOpen, isStock, isRamassage, whatsappTemplate } = req.body;
    if (!name) return res.status(400).json({ message: "Nom requis" });
    const newStore = await storage.createStore({
      name, ownerId: req.user!.id,
      phone: phone || null, website: website || null, facebook: facebook || null,
      instagram: instagram || null, logoUrl: logoUrl || null, canOpen: canOpen ?? 1,
      isStock: isStock ?? 0, isRamassage: isRamassage ?? 0, whatsappTemplate: whatsappTemplate || null,
    });
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
    const allowedFields = ['name', 'phone', 'website', 'facebook', 'instagram', 'logoUrl', 'canOpen', 'isStock', 'isRamassage', 'whatsappTemplate', 'packagingCost'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }
    const updated = await storage.updateStore(storeId, updateData);
    res.json(updated);
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

      // Smart dispatch: carrier accounts first, then legacy storeIntegrations
      const rawOrderCityForDispatch = (order.customerCity || '').trim();
      const creds = await storage.getAccountForShipping(storeId, provider, rawOrderCityForDispatch);
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

      // ── Call carrier API ──────────────────────────────────────────
      const shipResult = await shipOrderToCarrier(provider, creds, {
        customerName: order.customerName,
        phone:        order.customerPhone,
        city:         matchedCity,
        address:      order.customerAddress || order.customerCity || '',
        totalPrice:   order.totalPrice,
        productName,
        canOpen:      order.canOpen === 1,
        orderNumber:  order.orderNumber || String(orderId),
        orderId,
        storeId,
      });

      if (!shipResult.success) {
        // ── Carrier rejected — keep order status as 'confirme' ──────
        await storage.createIntegrationLog({
          storeId, integrationId: integration.id, provider,
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
      await storage.updateOrderShipping(orderId, trackingNumber!, labelUrl!, provider);
      await storage.updateOrderStatus(orderId, 'Attente De Ramassage');

      await storage.createIntegrationLog({
        storeId, integrationId: integration.id, provider,
        action: 'shipping_sent', status: 'success',
        message: `✅ Commande #${order.orderNumber} envoyée via ${provider}. Tracking: ${trackingNumber}`,
      });

      res.json({ trackingNumber, labelLink: labelUrl, provider, success: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
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
      const provider = req.query.provider as string | undefined;

      const integrations = await storage.getIntegrationsByStore(storeId, "shipping");

      if (!integrations.length) {
        return res.json({
          provider: null,
          cities: MOROCCAN_CITIES_DEFAULT,
          isCarrierSpecific: false,
          source: "generic",
        });
      }

      const target = provider
        ? integrations.find(i => i.provider.toLowerCase() === provider.toLowerCase())
        : integrations.find(i => i.isActive === 1) || integrations[0];

      if (!target) {
        return res.json({
          provider: provider || null,
          cities: MOROCCAN_CITIES_DEFAULT,
          isCarrierSpecific: false,
          source: "generic",
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
   */
  app.get("/api/carriers/cities/all", requireAuth, async (req, res) => {
    try {
      const storeId = req.user!.storeId!;
      const integrations = await storage.getIntegrationsByStore(storeId, "shipping");

      const result = integrations.map(i => {
        const creds = JSON.parse(i.credentials || "{}");
        const storedList: string[] | undefined = creds.cityList;
        return {
          id: i.id,
          provider: i.provider,
          isActive: i.isActive,
          cities: Array.isArray(storedList) && storedList.length > 0
            ? storedList
            : getDefaultCitiesForProvider(i.provider),
          source: Array.isArray(storedList) && storedList.length > 0 ? "stored" : "default",
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
      res.status(200).json({ ok: true });
      const store = await storage.getStoreByWebhookKey(req.params.webhookKey);
      if (!store) return;

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

  return httpServer;
}

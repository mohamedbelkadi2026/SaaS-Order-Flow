/**
 * Shared profitability computation — single source of truth.
 * Both GET /api/products/profitability and GET /api/stats/filtered
 * call computeProfitability() so the PROFIT NET figure is identical.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  orders, orderItems, products, adSpendTracking,
} from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { splitVariant } from "./variants";
import { isDeliveredStatus } from "@shared/order-status-sets";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProductProfitRow = {
  id: number;
  name: string;
  totalOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  refusedOrders: number;
  returnedOrders: number;
  totalUnits: number;
  deliveredUnits: number;
  revenue: number;
  productCost: number;
  shippingCost: number;
  packagingCost: number;
  confirmationCost: number;
  adSpend: number;
  netProfit: number;
  margin: number;
  roi: number;
  confirmRate: number;
  deliveryRate: number;
  noData?: boolean;
};

export type PlatformProfitRow = {
  platform: string;
  orders: number;
  delivered: number;
  revenue: number;
  adSpend: number;
  netProfit: number;
  roas: number;
  cpo: number;
};

export type ProfitTotals = {
  totalOrders: number;
  deliveredOrders: number;
  revenue: number;
  productCost: number;
  shippingCost: number;
  packagingCost: number;
  confirmationCost: number;
  adSpend: number;
  globalAdSpend: number;
  netProfit: number;
};

export type ProfitabilityResult = {
  products: ProductProfitRow[];
  platforms: PlatformProfitRow[];
  totals: ProfitTotals;
  globalAdSpend: number;
};

// ── Date range resolver ────────────────────────────────────────────────────────

export function resolveDateRange(opts: {
  dateFrom?: string;
  dateTo?: string;
  dateRange?: string;
}): { cutoff: Date; endDate: Date } {
  const now = new Date();
  let cutoff: Date;
  let endDate: Date = new Date();

  if (opts.dateFrom) {
    cutoff  = new Date(opts.dateFrom + 'T00:00:00');
    endDate = opts.dateTo ? new Date(opts.dateTo + 'T23:59:59') : new Date();
  } else if (opts.dateRange === 'today') {
    cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  } else if (opts.dateRange === 'yesterday') {
    cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1); cutoff.setHours(0, 0, 0, 0);
    endDate = new Date(); endDate.setDate(endDate.getDate() - 1); endDate.setHours(23, 59, 59, 999);
  } else if (opts.dateRange === '7days') {
    cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0, 0, 0, 0);
  } else if (opts.dateRange === 'lastmonth') {
    cutoff  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (opts.dateRange === 'all') {
    cutoff = new Date('2020-01-01');
  } else {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { cutoff, endDate };
}

// ── Normaliser (strips Arabic diacritics, punctuation, extra spaces) ───────────

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();

// ── Core computation ───────────────────────────────────────────────────────────

export async function computeProfitability(
  storeId: number,
  opts: { dateFrom?: string; dateTo?: string; dateRange?: string },
): Promise<ProfitabilityResult> {

  const { cutoff, endDate } = resolveDateRange(opts);
  const cutoffDateStr = cutoff.toISOString().slice(0, 10);
  const endDateStr    = endDate.toISOString().slice(0, 10);

  // ── Orders in range ──────────────────────────────────────────────────────────
  const storeOrders = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      gte(orders.createdAt, cutoff),
      lte(orders.createdAt, endDate),
    ));

  const orderIds = storeOrders.map(o => o.id);

  // ── Ad spend ─────────────────────────────────────────────────────────────────
  const legacyAdRows = await db.select({
    productId: adSpendTracking.productId,
    amount:    adSpendTracking.amount,
  }).from(adSpendTracking).where(and(
    eq(adSpendTracking.storeId, storeId),
    sql`${adSpendTracking.date} >= ${cutoffDateStr}`,
    sql`${adSpendTracking.date} <= ${endDateStr}`,
  ));

  const newAdEntries = await storage.getAdSpendEntries(storeId, {
    dateFrom: cutoffDateStr,
    dateTo:   endDateStr,
    allUsers: true,
  });

  const adSpendRows = [
    ...legacyAdRows.map((r: any) => ({ productId: r.productId, amountDH: Number(r.amount || 0) })),
    ...newAdEntries.map((r: any) => ({ productId: r.productId, amountDH: Number(r.amount || 0) / 100 })),
  ];

  const productAdSpendMap: Record<number, number> = {};
  let globalAdSpend = 0;
  for (const row of adSpendRows) {
    if (row.productId) {
      productAdSpendMap[row.productId] = (productAdSpendMap[row.productId] || 0) + row.amountDH;
    } else {
      globalAdSpend += row.amountDH;
    }
  }

  // ── Order items ──────────────────────────────────────────────────────────────
  const itemRows = orderIds.length > 0 ? await db
    .select({
      orderId:          orderItems.orderId,
      productId:        orderItems.productId,
      rawProductName:   orderItems.rawProductName,
      quantity:         orderItems.quantity,
      price:            orderItems.price,
      productName:      products.name,
      productCostPrice: products.costPrice,
      productSettings:  products.settings,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, orderIds)) : [];

  const orderMap = new Map(storeOrders.map(o => [o.id, o]));

  // ── Agent commission rates ────────────────────────────────────────────────────
  const agentSettings = await storage.getStoreAgentSettings(storeId);
  const agentRateMap = new Map<number, number>(
    agentSettings.map((s: any) => [s.agentId, Number(s.commissionRate ?? 0)])
  );

  // ── Catalog maps ─────────────────────────────────────────────────────────────
  const storeProductsList = await db.select({
    id: products.id, name: products.name,
    costPrice: products.costPrice, stock: products.stock,
    settings: products.settings,
  }).from(products).where(eq(products.storeId, storeId));

  const displayById  = new Map<number, string>();
  const costByName   = new Map<string, number>();
  const idByName     = new Map<string, number>();
  const settingsById = new Map<number, any>();
  for (const p of storeProductsList) {
    displayById.set(p.id, p.name);
    settingsById.set(p.id, p.settings);
    const nk = norm(p.name);
    costByName.set(nk, Number(p.costPrice || 0));
    if (!idByName.has(nk)) idByName.set(nk, p.id);
  }

  // ── Status sets ───────────────────────────────────────────────────────────────
  const CONFIRMED_SET = new Set(["confirme","confirmé","expédié","attente de ramassage","in_progress","delivered","livré","livrée"]);
  const REFUSED_SET   = new Set(["refused","refusé"]);
  const RETURN_SET    = new Set(["retourné","retour en cours","retourné à l'expéditeur","tentative échouée","article retourné"]);

  // ── statsMap keyed by normalised product NAME ─────────────────────────────────
  const statsMap: Record<string, ProductProfitRow> = {};
  const countedOrderForProduct     = new Set<string>();
  const countedOrderStatForProduct = new Set<string>();

  const makeEmptyRow = (display: string, pid: number): ProductProfitRow => ({
    id: pid, name: display,
    totalOrders: 0, confirmedOrders: 0, deliveredOrders: 0,
    refusedOrders: 0, returnedOrders: 0,
    totalUnits: 0, deliveredUnits: 0,
    revenue: 0, productCost: 0, shippingCost: 0, packagingCost: 0, confirmationCost: 0, adSpend: 0,
    netProfit: 0, margin: 0, roi: 0, confirmRate: 0, deliveryRate: 0,
  });

  for (const item of itemRows) {
    const order = orderMap.get(item.orderId);
    if (!order) continue;

    const pid = item.productId || 0;
    let display = (pid > 0 ? displayById.get(pid) : undefined)
      || item.rawProductName
      || item.productName
      || 'Produit inconnu';

    // Roll unlinked "Parent - Size" items up to the parent product bucket
    let resolvedPid = pid;
    if (pid === 0 && display !== 'Produit inconnu') {
      const { base } = splitVariant(display);
      if (base !== display) {
        const parentId = idByName.get(norm(base));
        if (parentId) {
          resolvedPid = parentId;
          display = displayById.get(parentId) || base;
        }
      }
    }

    const key = norm(display);

    if (!statsMap[key]) {
      const canonicalId = resolvedPid > 0 ? resolvedPid : (idByName.get(key) || 0);
      statsMap[key] = makeEmptyRow(display, canonicalId);
    } else if (resolvedPid > 0 && statsMap[key].id === 0) {
      statsMap[key].id = resolvedPid;
    }

    const s = statsMap[key];
    const status = ((order as any).status || '').toLowerCase().trim();
    const isDelivered = isDeliveredStatus(status);

    const statGuardKey = `stat_${key}_${item.orderId}`;
    if (!countedOrderStatForProduct.has(statGuardKey)) {
      countedOrderStatForProduct.add(statGuardKey);
      s.totalOrders++;
      if (CONFIRMED_SET.has(status)) s.confirmedOrders++;
      if (isDelivered)               s.deliveredOrders++;
      if (REFUSED_SET.has(status))   s.refusedOrders++;
      if (RETURN_SET.has(status))    s.returnedOrders++;
    }

    s.totalUnits += Number(item.quantity || 1);
    if (isDelivered) {
      s.deliveredUnits += Number(item.quantity || 1);
      const unitCostCents = item.productCostPrice
        ?? costByName.get(key)
        ?? costByName.get(norm(item.rawProductName || ''))
        ?? (order as any).productCost
        ?? 0;
      s.productCost += (Number(unitCostCents) / 100) * Number(item.quantity || 1);

      const guardKey = `${key}_${item.orderId}`;
      if (!countedOrderForProduct.has(guardKey)) {
        countedOrderForProduct.add(guardKey);
        s.revenue      += Number((order as any).totalPrice   || 0) / 100;
        s.shippingCost += Number((order as any).shippingCost || 0) / 100;
        const prodSettings = (resolvedPid > 0 ? settingsById.get(resolvedPid) : undefined)
          || (pid > 0 ? settingsById.get(pid) : undefined)
          || (item.productSettings as any);
        const emballageDH = Number(prodSettings?.profitDefaults?.coutEmballage || 0);
        s.packagingCost   += emballageDH;
        const confDH  = Number(prodSettings?.profitDefaults?.coutConfirmation || 0);
        const agentDH = agentRateMap.get((order as any).assignedToId) ?? 0;
        s.confirmationCost += confDH + agentDH;
      }
    }
  }

  // ── Attach ad spend by name bucket ───────────────────────────────────────────
  for (const [pidStr, amountDH] of Object.entries(productAdSpendMap)) {
    const pid = Number(pidStr);
    const display = displayById.get(pid) || '';
    const key = norm(display);
    if (!key) continue;
    if (!statsMap[key]) statsMap[key] = makeEmptyRow(display, pid);
    statsMap[key].adSpend = (statsMap[key].adSpend || 0) + Number(amountDH);
  }

  // ── Finalise per-product rows ─────────────────────────────────────────────────
  const productResult: ProductProfitRow[] = Object.values(statsMap).map(s => {
    const netProfit    = s.revenue - s.productCost - s.shippingCost - s.packagingCost - s.confirmationCost - s.adSpend;
    const margin       = s.revenue > 0 ? (netProfit / s.revenue) * 100 : 0;
    const roi          = s.productCost > 0 ? (netProfit / s.productCost) * 100 : 0;
    const confirmRate  = s.totalOrders > 0 ? (s.confirmedOrders  / s.totalOrders)   * 100 : 0;
    const deliveryRate = s.confirmedOrders > 0 ? (s.deliveredOrders / s.confirmedOrders) * 100 : 0;
    return { ...s, netProfit, margin, roi, confirmRate, deliveryRate };
  }).sort((a, b) => b.netProfit - a.netProfit);

  // ── Merge catalog products with no orders ─────────────────────────────────────
  const existingNormNames = new Set(Object.values(statsMap).map(s => norm(s.name)));
  for (const sp of storeProductsList) {
    if (existingNormNames.has(norm(sp.name))) continue;
    const tagged = productAdSpendMap[sp.id] || 0;
    productResult.push({
      id: sp.id, name: sp.name,
      totalOrders: 0, confirmedOrders: 0, deliveredOrders: 0,
      refusedOrders: 0, returnedOrders: 0,
      revenue: 0, productCost: 0, shippingCost: 0, packagingCost: 0, confirmationCost: 0,
      totalUnits: 0, deliveredUnits: 0,
      adSpend: tagged,
      netProfit: -tagged,
      margin: 0, roi: 0, confirmRate: 0, deliveryRate: 0,
      noData: tagged === 0,
    });
  }

  // ── Final safety: collapse same-name rows ─────────────────────────────────────
  const finalMap = new Map<string, any>();
  for (const row of productResult) {
    const k = norm(row.name);
    if (!finalMap.has(k)) {
      finalMap.set(k, { ...row });
    } else {
      const existing = finalMap.get(k)!;
      for (const field of [
        'totalOrders','confirmedOrders','deliveredOrders','refusedOrders','returnedOrders',
        'totalUnits','deliveredUnits','revenue','productCost','shippingCost',
        'packagingCost','confirmationCost','adSpend',
      ] as const) {
        existing[field] = (existing[field] || 0) + (row[field] || 0);
      }
      existing.netProfit    = existing.revenue - existing.productCost - existing.shippingCost - existing.packagingCost - existing.confirmationCost - existing.adSpend;
      existing.margin       = existing.revenue > 0 ? (existing.netProfit / existing.revenue) * 100 : 0;
      existing.roi          = existing.productCost > 0 ? (existing.netProfit / existing.productCost) * 100 : 0;
      existing.confirmRate  = existing.totalOrders > 0 ? (existing.confirmedOrders / existing.totalOrders) * 100 : 0;
      existing.deliveryRate = existing.confirmedOrders > 0 ? (existing.deliveredOrders / existing.confirmedOrders) * 100 : 0;
      if (existing.id === 0 && row.id > 0) existing.id = row.id;
    }
  }
  const dedupedProducts: ProductProfitRow[] = Array.from(finalMap.values())
    .sort((a, b) => b.netProfit - a.netProfit);

  // ── Platform aggregation ─────────────────────────────────────────────────────
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
    const isDel = isDeliveredStatus((o as any).status);
    p.orders++;
    if (isDel) {
      p.delivered++;
      p.revenue += Number((o as any).totalPrice || 0) / 100;
    }
  }
  const totalAdSpendDH = adSpendRows.reduce((s: number, r: any) => s + r.amountDH, 0);
  const platforms: PlatformProfitRow[] = Object.values(platMap).map(p => {
    const totalPlatRev = Object.values(platMap).reduce((s, x) => s + x.revenue, 0);
    const platAdSpend  = totalPlatRev > 0 ? totalAdSpendDH * (p.revenue / totalPlatRev) : 0;
    const netProfit    = p.revenue - platAdSpend;
    const roas         = platAdSpend > 0 ? p.revenue / platAdSpend : 0;
    const cpo          = p.orders   > 0 ? platAdSpend / p.orders  : 0;
    return { ...p, adSpend: platAdSpend, netProfit, roas, cpo };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Grand totals (sum of all per-product rows) ────────────────────────────────
  const totals: ProfitTotals = dedupedProducts.reduce(
    (acc, row) => ({
      totalOrders:       acc.totalOrders       + row.totalOrders,
      deliveredOrders:   acc.deliveredOrders   + row.deliveredOrders,
      revenue:           acc.revenue           + row.revenue,
      productCost:       acc.productCost       + row.productCost,
      shippingCost:      acc.shippingCost      + row.shippingCost,
      packagingCost:     acc.packagingCost     + row.packagingCost,
      confirmationCost:  acc.confirmationCost  + row.confirmationCost,
      adSpend:           acc.adSpend           + row.adSpend,
      globalAdSpend:     acc.globalAdSpend,
      netProfit:         acc.netProfit         + row.netProfit,
    }),
    { totalOrders: 0, deliveredOrders: 0, revenue: 0, productCost: 0, shippingCost: 0, packagingCost: 0, confirmationCost: 0, adSpend: 0, globalAdSpend, netProfit: 0 }
  );
  // Override order counts from storeOrders directly so totals match the
  // dashboard (per-product rows only count orders that have orderItems rows).
  totals.totalOrders     = storeOrders.length;
  totals.deliveredOrders = storeOrders.filter(o => isDeliveredStatus((o as any).status)).length;

  return { products: dedupedProducts, platforms, totals, globalAdSpend };
}

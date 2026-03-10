import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireAuth, requireAdmin, hashPassword } from "./auth";

/**
 * Replaces WhatsApp template variables with actual order data.
 * Returns the formatted message and a wa.me deep link.
 */
function formatWhatsAppMessage(order: any, template: string): { message: string; link: string } {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });

  const message = template
    .replace(/\*?\{Nom_Client\}\*?/g, order.customerName || '')
    .replace(/\*?\{Ville_Client\}\*?/g, order.customerCity || '')
    .replace(/\*?\{Address_Client\}\*?/g, order.customerAddress || '')
    .replace(/\*?\{Phone_Client\}\*?/g, order.customerPhone || '')
    .replace(/\*?\{Date_Commande\}\*?/g, dateStr)
    .replace(/\*?\{Heure\}\*?/g, timeStr)
    .replace(/\*?\{Nom_Produit\}\*?/g, order.productName || (order.items?.[0]?.productName) || '')
    .replace(/\*?\{Transporteur\}\*?/g, order.shippingProvider || '')
    .replace(/\*?\{Date_Livraison\}\*?/g, order.expectedDelivery || '');

  const phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
  const intlPhone = phone.startsWith('0') ? '212' + phone.slice(1) : phone;
  const link = `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`;
  return { message, link };
}

function parseWebhookOrder(provider: string, payload: any) {
  if (provider === 'shopify') {
    const customerName = payload.customer
      ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
      : (payload.shipping_address?.name || 'Client Shopify');
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
      variantInfo: item.variant_title || (item.variant_id ? `variant_id: ${item.variant_id}` : ''),
      quantity: item.quantity || 1,
      price: Math.round(parseFloat(item.price || '0') * 100),
    }));
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.note || null };
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
      variantInfo: item.variant_title || '',
      quantity: item.quantity || 1,
      price: Math.round(parseFloat(item.price || '0') * 100),
    }));
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.note || null };
  }

  if (provider === 'woocommerce') {
    const billing = payload.billing || {};
    const shipping = payload.shipping || {};
    const customerName = `${billing.first_name || shipping.first_name || ''} ${billing.last_name || shipping.last_name || ''}`.trim() || 'Client WooCommerce';
    const customerPhone = billing.phone || '';
    const customerAddress = `${shipping.address_1 || billing.address_1 || ''} ${shipping.address_2 || billing.address_2 || ''}`.trim();
    const customerCity = shipping.city || billing.city || '';
    const totalPrice = Math.round(parseFloat(payload.total || '0') * 100);
    const orderNumber = String(payload.number || payload.id);
    const lineItems = (payload.line_items || []).map((item: any) => ({
      sku: item.sku || '',
      title: item.name || '',
      variantInfo: item.variation_id ? `variation_id: ${item.variation_id}` : '',
      quantity: item.quantity || 1,
      price: Math.round(parseFloat(item.price || '0') * 100),
    }));
    return { customerName, customerPhone, customerAddress, customerCity, totalPrice, orderNumber, lineItems, comment: payload.customer_note || null };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.stats.get.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const ordersList = await storage.getOrdersByStore(storeId);

    let totalOrders = ordersList.length;
    let nouveau = 0, confirme = 0, inProgress = 0, delivered = 0, refused = 0;
    let injoignable = 0, annuleFake = 0, annuleFauxNumero = 0, annuleDouble = 0, boiteVocale = 0;
    let revenue = 0, profit = 0;

    ordersList.forEach(o => {
      if (o.status === 'nouveau') nouveau++;
      else if (o.status === 'confirme') confirme++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'delivered') delivered++;
      else if (o.status === 'refused') refused++;
      else if (o.status === 'Injoignable') injoignable++;
      else if (o.status === 'Annulé (fake)') annuleFake++;
      else if (o.status === 'Annulé (faux numéro)') annuleFauxNumero++;
      else if (o.status === 'Annulé (double)') annuleDouble++;
      else if (o.status === 'boite vocale') boiteVocale++;

      if (['confirme', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
      }
      if (o.status === 'delivered') {
        profit += (o.totalPrice - o.productCost - 4000 - o.adSpend);
      }
    });

    const cancelled = annuleFake + annuleFauxNumero + annuleDouble;
    const confirmationRate = totalOrders > 0 ? Math.round((confirme + delivered) / totalOrders * 100) : 0;
    res.json({ totalOrders, nouveau, confirme, inProgress, cancelled, delivered, refused, injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale, revenue, profit, confirmationRate });
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

    res.json({
      cities,
      sources,
      shippingProviders,
      products: storeProducts.map(p => ({ id: p.id, name: p.name })),
      agents: storeAgents.map(a => ({ id: a.id, username: a.username })),
    });
  });

  app.get("/api/stats/filtered", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const { city, productId, agentId, source, dateFrom, dateTo, shippingProvider } = req.query as Record<string, string>;

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
    let nouveau = 0, confirme = 0, inProgress = 0, delivered = 0, refused = 0;
    let injoignable = 0, annuleFake = 0, annuleFauxNumero = 0, annuleDouble = 0, boiteVocale = 0;
    let revenue = 0, profit = 0, totalProductCost = 0, totalShipping = 0;

    allOrders.forEach(o => {
      if (o.status === 'nouveau') nouveau++;
      else if (o.status === 'confirme') confirme++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'delivered') delivered++;
      else if (o.status === 'refused') refused++;
      else if (o.status === 'Injoignable') injoignable++;
      else if (o.status === 'Annulé (fake)') annuleFake++;
      else if (o.status === 'Annulé (faux numéro)') annuleFauxNumero++;
      else if (o.status === 'Annulé (double)') annuleDouble++;
      else if (o.status === 'boite vocale') boiteVocale++;

      if (['confirme', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
      }
      if (o.status === 'delivered') {
        totalProductCost += o.productCost;
        totalShipping += 4000;
        profit += (o.totalPrice - o.productCost - 4000 - o.adSpend);
      }
    });

    const cancelled = annuleFake + annuleFauxNumero + annuleDouble;
    const confirmationRate = totalOrders > 0 ? Math.round((confirme + delivered) / totalOrders * 100) : 0;
    const deliveryRate = (confirme + delivered) > 0 ? Math.round(delivered / (confirme + delivered) * 100) : 0;

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

    const productMap: Record<number, { name: string; total: number; confirme: number; inProgress: number; delivered: number; revenue: number }> = {};
    allOrders.forEach(o => {
      if (o.items) {
        o.items.forEach((item: any) => {
          const pid = item.productId;
          if (!productMap[pid]) productMap[pid] = { name: item.product?.name || `Produit #${pid}`, total: 0, confirme: 0, inProgress: 0, delivered: 0, revenue: 0 };
          productMap[pid].total++;
          if (o.status === 'confirme') productMap[pid].confirme++;
          if (o.status === 'in_progress') productMap[pid].inProgress++;
          if (o.status === 'delivered') {
            productMap[pid].delivered++;
            productMap[pid].revenue += item.price * item.quantity;
          }
        });
      }
    });
    const productPerformance = Object.values(productMap).sort((a, b) => b.total - a.total);
    const topProducts = productPerformance.slice(0, 10);
    const maxRevenue = topProducts[0]?.revenue || 1;

    let adSpendTotal = 0;
    const adSpendEntries = await storage.getAdSpend(storeId);
    adSpendEntries.forEach(e => {
      if (productId && productId !== 'all') {
        if (e.productId !== Number(productId) && e.productId !== null) return;
      }
      if (dateFrom && e.date < dateFrom) return;
      if (dateTo && e.date > dateTo) return;
      adSpendTotal += e.amount;
    });

    const netProfit = revenue - totalProductCost - totalShipping - adSpendTotal;
    const roas = adSpendTotal > 0 ? revenue / adSpendTotal : 0;
    const roi = adSpendTotal > 0 ? (netProfit / adSpendTotal) * 100 : 0;

    res.json({
      totalOrders, nouveau, confirme, inProgress, cancelled, delivered, refused,
      injoignable, annuleFake, annuleFauxNumero, annuleDouble, boiteVocale,
      revenue, profit: netProfit, confirmationRate, deliveryRate,
      totalProductCost, totalShipping, adSpendTotal, roas, roi,
      daily,
      topProducts: topProducts.map(p => ({ ...p, share: Math.round((p.revenue / maxRevenue) * 100) })),
      productPerformance: productPerformance.map(p => ({
        ...p,
        confirmationRate: p.total > 0 ? Math.round((p.confirme / p.total) * 100) : 0,
        deliveryRate: p.confirme > 0 ? Math.round((p.delivered / p.confirme) * 100) : 0,
      })),
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

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    const user = req.user!;
    const status = req.query.status as string | undefined;

    if (user.role === 'agent') {
      const ordersList = await storage.getOrdersByAgent(user.id);
      if (status === 'annule_group') {
        res.json(ordersList.filter(o => o.status?.startsWith('Annulé')));
      } else if (status === 'suivi_group') {
        res.json(ordersList.filter(o => ['in_progress', 'expédié', 'retourné'].includes(o.status)));
      } else {
        res.json(status ? ordersList.filter(o => o.status === status) : ordersList);
      }
    } else {
      if (status === 'annule_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(ordersList.filter(o => o.status?.startsWith('Annulé')));
      } else if (status === 'suivi_group') {
        const ordersList = await storage.getOrdersByStore(user.storeId!);
        res.json(ordersList.filter(o => ['in_progress', 'expédié', 'retourné'].includes(o.status)));
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
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    };
    const agentOnly = user.role === 'agent' ? user.id : undefined;
    const result = await storage.getFilteredOrders(user.storeId!, filters, agentOnly);
    res.json(result);
  });

  app.get("/api/orders/all", requireAuth, async (req, res) => {
    const user = req.user!;
    const filters = {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      city: req.query.city as string | undefined,
      source: req.query.source as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    };
    const agentOnly = user.role === 'agent' ? user.id : undefined;
    const result = await storage.getFilteredOrders(user.storeId!, filters, agentOnly);
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

  app.post("/api/orders/bulk-ship", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === 'agent') {
        return res.status(403).json({ message: "Agents cannot bulk ship orders" });
      }
      const { orderIds, provider } = req.body;
      if (!Array.isArray(orderIds) || !provider) {
        return res.status(400).json({ message: "orderIds (array) and provider required" });
      }
      const integration = await storage.getIntegrationByProvider(user.storeId!, provider);
      if (!integration) {
        return res.status(400).json({ message: `No shipping integration found for ${provider}` });
      }
      const eligible = await storage.bulkShipOrders(orderIds, user.storeId!);
      if (eligible.length === 0) {
        return res.status(400).json({ message: "No eligible orders (must be 'confirme' status)" });
      }
      const results: any[] = [];
      for (const order of eligible) {
        const trackingNumber = `${provider.toUpperCase()}-${Date.now()}-${order.id}`;
        const labelLink = `/api/labels/${trackingNumber}.pdf`;
        await storage.updateOrderShipping(order.id, trackingNumber, labelLink, provider);
        await storage.updateOrderStatus(order.id, 'in_progress');
        results.push({ orderId: order.id, trackingNumber, labelLink, status: 'shipped' });
      }
      res.json({ shipped: results.length, results });
    } catch (err) {
      res.status(500).json({ message: "Bulk ship failed" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.storeId !== req.user!.storeId && req.user!.role !== 'owner') {
      return res.status(403).json({ message: "Access denied" });
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
      const updated = await storage.updateOrderStatus(orderId, status);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/orders/:id/assign", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
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
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        username: data.username, email: data.email, phone: data.phone || null,
        password: hashedPassword, role: "agent", storeId,
        paymentType: data.paymentType || "commission",
        paymentAmount: data.paymentAmount || 0,
        distributionMethod: data.distributionMethod || "auto",
        isActive: data.isActive ?? 1,
      });

      // Save store-specific agent settings (role, distribution rules)
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
      await storage.upsertStoreAgentSetting(user.id, storeId, settingsPayload);

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

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) {
        await storage.createIntegrationLog({
          storeId, integrationId: integration?.id || null, provider,
          action: 'order_synced', status: 'fail',
          message: `Limite de commandes atteinte (${limitCheck.current}/${limitCheck.limit}). Commande ${parsed.orderNumber} refusée.`,
        });
        return res.status(403).json({ message: "Order limit reached" });
      }

      const rawProductName = parsed.lineItems.length > 0
        ? parsed.lineItems.map((li: any) => li.title).filter(Boolean).join(' + ')
        : null;
      const variantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const rawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;

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
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })) as any);

      const firstProductId = orderItemsToCreate.find(i => i.productId)?.productId ?? undefined;
      const nextAgentId = await storage.getNextAgent(storeId, firstProductId, parsed.customerCity);
      if (nextAgentId) {
        await storage.assignOrder(order.id, nextAgentId);
      }

      const customer = await storage.getOrCreateCustomer(storeId, parsed.customerName, parsed.customerPhone, parsed.customerAddress, parsed.customerCity);
      await storage.updateCustomerStats(customer.id, parsed.totalPrice);
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

      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) return res.status(403).json({ message: "Order limit reached" });

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
        ? parsed.lineItems.map((li: any) => li.title).filter(Boolean).join(' + ')
        : null;
      const variantDetails = parsed.lineItems.map((li: any) => li.variantInfo).filter(Boolean).join(' | ') || null;
      const rawQuantity = parsed.lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 1), 0) || null;

      const order = await storage.createOrder({
        storeId, orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: provider, comment: parsed.comment,
        rawProductName, variantDetails, rawQuantity,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      const firstProductId = orderItemsToCreate.length > 0 ? orderItemsToCreate[0].productId : undefined;
      const nextAgentId = await storage.getNextAgent(storeId, firstProductId, parsed.customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);

      const customer = await storage.getOrCreateCustomer(storeId, parsed.customerName, parsed.customerPhone, parsed.customerAddress, parsed.customerCity);
      await storage.updateCustomerStats(customer.id, parsed.totalPrice);
      await storage.incrementMonthlyOrders(storeId);

      const integration = await storage.getIntegrationByProvider(storeId, provider);
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider, action: 'order_synced', status: 'success', message: `Commande ${parsed.orderNumber} importée via token webhook` });

      res.json({ success: true, orderId: order.id });
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
      const limitCheck = await storage.checkOrderLimit(storeId);
      if (!limitCheck.allowed) return res.status(403).json({ message: "Order limit reached" });
      const storeProducts = await storage.getProductsByStore(storeId);
      const matched = storeProducts.find(p => p.name === productName || p.sku === productName);
      const orderItems = matched ? [{ productId: matched.id, quantity: 1, price: totalPrice, orderId: 0 }] : [];
      const order = await storage.createOrder({
        storeId, orderNumber, customerName, customerPhone, customerAddress, customerCity,
        status: 'nouveau', totalPrice, productCost: matched ? matched.costPrice : 0,
        shippingCost: 0, adSpend: 0, source: 'gsheets', comment: null,
      }, orderItems);
      const nextAgentId = await storage.getNextAgent(storeId, matched?.id, customerCity);
      if (nextAgentId) await storage.assignOrder(order.id, nextAgentId);
      const customer = await storage.getOrCreateCustomer(storeId, customerName, customerPhone, customerAddress, customerCity);
      await storage.updateCustomerStats(customer.id, totalPrice);
      await storage.incrementMonthlyOrders(storeId);
      const integration = await storage.getIntegrationByProvider(storeId, 'gsheets');
      await storage.createIntegrationLog({ storeId, integrationId: integration?.id || null, provider: 'gsheets', action: 'order_synced', status: 'success', message: `Commande Google Sheets ${orderNumber} importée` });
      res.json({ success: true, orderId: order.id });
    } catch (err: any) {
      console.error('GSheets webhook error:', err);
      res.status(500).json({ message: 'Processing failed' });
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

      const order = await storage.createOrder({
        storeId, orderNumber: parsed.orderNumber, customerName: parsed.customerName,
        customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity, status: 'nouveau', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: 'shopify', comment: parsed.comment,
      }, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      res.json({ success: true, orderId: order.id });
    } catch (err) {
      console.error('Shopify webhook error:', err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // ============================================================
  // MANUAL ORDER CREATION
  // ============================================================
  app.post("/api/orders", requireAuth, async (req, res) => {
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

      const customer = await storage.getOrCreateCustomer(storeId, data.customerName, data.customerPhone, data.customerAddress, data.customerCity);
      await storage.updateCustomerStats(customer.id, totalPrice);
      await storage.incrementMonthlyOrders(storeId);

      const finalOrder = await storage.getOrder(order.id);
      res.status(201).json(finalOrder || order);
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
      console.log(`[PATCH /api/orders/${orderId}] status=${data.status ?? '(unchanged)'} storeId=${req.user!.storeId}`);

      // Route status changes through updateOrderStatus for proper stock handling
      if (data.status && data.status !== order.status) {
        console.log(`[PATCH /api/orders/${orderId}] Updating status ${order.status} → ${data.status}`);
        await storage.updateOrderStatus(orderId, data.status);
      }
      const { status: _s, ...fieldsWithoutStatus } = data;
      let updated: any;
      if (Object.keys(fieldsWithoutStatus).length > 0) {
        updated = await storage.updateOrder(orderId, fieldsWithoutStatus);
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
      const item = await storage.updateOrderItem(id, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/order-items/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
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
  app.get("/api/customers", requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    res.json(await storage.getCustomersByStore(storeId));
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
        plan: 'starter',
        monthlyLimit: 1500,
        pricePerMonth: 20000,
        currentMonthOrders: 0,
        isActive: 1,
      });
    }
    const limitCheck = await storage.checkOrderLimit(storeId);
    res.json({ ...sub, ...limitCheck });
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
      });
      const data = schema.parse(req.body);
      const payload: any = {};
      if (data.roleInStore !== undefined) payload.roleInStore = data.roleInStore;
      if (data.leadPercentage !== undefined) payload.leadPercentage = data.leadPercentage;
      if (data.allowedProductIds !== undefined) payload.allowedProductIds = JSON.stringify(data.allowedProductIds);
      if (data.allowedRegions !== undefined) payload.allowedRegions = JSON.stringify(data.allowedRegions);
      const result = await storage.upsertStoreAgentSetting(agentId, storeId, payload);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
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
    const allowedFields = ['name', 'phone', 'website', 'facebook', 'instagram', 'logoUrl', 'canOpen', 'isStock', 'isRamassage', 'whatsappTemplate'];
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

  // ============================================================
  // SEND TO DELIVERY (SHIPPING)
  // ============================================================
  app.post("/api/orders/:id/ship", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { provider } = z.object({ provider: z.string().min(1) }).parse(req.body);
      const storeId = req.user!.storeId!;

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Commande non trouvée" });
      if (order.storeId !== storeId) return res.status(403).json({ message: "Accès refusé" });

      const integration = await storage.getIntegrationByProvider(storeId, provider);
      if (!integration || integration.type !== 'shipping') {
        return res.status(400).json({ message: `Transporteur ${provider} non connecté` });
      }

      const creds = JSON.parse(integration.credentials || '{}');
      if (!creds.apiKey) {
        return res.status(400).json({ message: `Clé API manquante pour ${provider}` });
      }

      const trackingNumber = `${provider.toUpperCase()}-${Date.now()}-${orderId}`;
      const labelLink = `/api/labels/${trackingNumber}.pdf`;

      try {
        await storage.updateOrderShipping(orderId, trackingNumber, labelLink, provider);
        await storage.updateOrderStatus(orderId, 'in_progress');

        await storage.createIntegrationLog({
          storeId, integrationId: integration.id, provider,
          action: 'shipping_sent', status: 'success',
          message: `Commande #${order.orderNumber} envoyée via ${provider}. Tracking: ${trackingNumber}`,
        });

        res.json({ trackingNumber, labelLink, provider });
      } catch (apiErr: any) {
        await storage.createIntegrationLog({
          storeId, integrationId: integration.id, provider,
          action: 'shipping_sent', status: 'fail',
          message: `Erreur envoi commande #${order.orderNumber}: ${apiErr.message}`,
        });
        return res.status(500).json({ message: `Erreur d'envoi: ${apiErr.message}` });
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  return httpServer;
}

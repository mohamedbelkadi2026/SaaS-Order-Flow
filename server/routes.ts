import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireAuth, requireAdmin, hashPassword } from "./auth";

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
      sku: item.sku,
      title: item.title,
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
    let newOrders = 0, confirmed = 0, inProgress = 0, cancelled = 0, delivered = 0, refused = 0;
    let revenue = 0, profit = 0;

    ordersList.forEach(o => {
      if (o.status === 'new') newOrders++;
      else if (o.status === 'confirmed') confirmed++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'cancelled') cancelled++;
      else if (o.status === 'delivered') delivered++;
      else if (o.status === 'refused') refused++;

      if (['confirmed', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
        profit += (o.totalPrice - o.productCost - o.shippingCost - o.adSpend);
      }
    });

    const confirmationRate = totalOrders > 0 ? Math.round((confirmed + delivered) / totalOrders * 100) : 0;
    res.json({ totalOrders, newOrders, confirmed, inProgress, cancelled, delivered, refused, revenue, profit, confirmationRate });
  });

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    const user = req.user!;
    const status = req.query.status as string | undefined;

    if (user.role === 'agent') {
      const ordersList = await storage.getOrdersByAgent(user.id);
      res.json(status ? ordersList.filter(o => o.status === status) : ordersList);
    } else {
      const ordersList = await storage.getOrdersByStore(user.storeId!, status || undefined);
      res.json(ordersList);
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
      const orderItemsToCreate: { productId: number; quantity: number; price: number }[] = [];

      for (const item of parsed.lineItems) {
        const matchedProduct = storeProducts.find(
          p => (item.sku && p.sku === item.sku) || p.name === item.title
        );
        if (matchedProduct) {
          orderItemsToCreate.push({
            productId: matchedProduct.id,
            quantity: item.quantity,
            price: item.price,
          });
          productCost += matchedProduct.costPrice * item.quantity;
        }
      }

      const order = await storage.createOrder({
        storeId,
        orderNumber: parsed.orderNumber,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerAddress: parsed.customerAddress,
        customerCity: parsed.customerCity,
        status: 'new',
        totalPrice: parsed.totalPrice,
        productCost,
        shippingCost: 0,
        adSpend: 0,
        source: provider,
        comment: parsed.comment,
      }, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      await storage.createIntegrationLog({
        storeId, integrationId: integration?.id || null, provider,
        action: 'order_synced', status: 'success',
        message: `Commande ${parsed.orderNumber} importée (${parsed.lineItems.length} articles, ${orderItemsToCreate.length} matchés)`,
      });

      res.json({ success: true, orderId: order.id });
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
        customerCity: parsed.customerCity, status: 'new', totalPrice: parsed.totalPrice,
        productCost, shippingCost: 0, adSpend: 0, source: 'shopify', comment: parsed.comment,
      }, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      res.json({ success: true, orderId: order.id });
    } catch (err) {
      console.error('Shopify webhook error:', err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
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

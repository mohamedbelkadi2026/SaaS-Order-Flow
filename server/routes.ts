import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createHmac } from "crypto";
import { requireAuth, requireAdmin, hashPassword } from "./auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.stats.get.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const ordersList = await storage.getOrdersByStore(storeId);
    
    let totalOrders = ordersList.length;
    let newOrders = 0;
    let confirmed = 0;
    let inProgress = 0;
    let cancelled = 0;
    let delivered = 0;
    let refused = 0;
    let revenue = 0;
    let profit = 0;
    
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

    res.json({
      totalOrders,
      newOrders,
      confirmed,
      inProgress,
      cancelled,
      delivered,
      refused,
      revenue,
      profit,
      confirmationRate,
    });
  });

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    const user = req.user!;
    const status = req.query.status as string | undefined;
    
    if (user.role === 'agent') {
      const ordersList = await storage.getOrdersByAgent(user.id);
      if (status) {
        res.json(ordersList.filter(o => o.status === status));
      } else {
        res.json(ordersList);
      }
    } else {
      const ordersList = await storage.getOrdersByStore(user.storeId!, status || undefined);
      res.json(ordersList);
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.storeId !== req.user!.storeId && req.user!.role !== 'owner') {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(order);
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.storeId !== req.user!.storeId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { status } = api.orders.updateStatus.input.parse(req.body);
      const updated = await storage.updateOrderStatus(orderId, status);
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/orders/:id/assign", requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { agentId } = api.orders.assign.input.parse(req.body);
      const updated = await storage.assignOrder(orderId, agentId);
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });
  
  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const productsList = await storage.getProductsByStore(storeId);
    res.json(productsList);
  });

  app.get(api.agents.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const agentsList = await storage.getUsersByStore(storeId);
    const safeAgents = agentsList.map(({ password, ...rest }) => rest);
    res.json(safeAgents);
  });

  app.post(api.agents.create.path, requireAdmin, async (req, res) => {
    try {
      const data = api.agents.create.input.parse(req.body);
      const storeId = req.user!.storeId!;

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }

      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        phone: data.phone || null,
        password: hashedPassword,
        role: "agent",
        storeId,
        paymentType: data.paymentType || "commission",
        paymentAmount: data.paymentAmount || 0,
        distributionMethod: data.distributionMethod || "auto",
        isActive: data.isActive ?? 1,
      });

      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.adSpend.list.path, requireAuth, async (req, res) => {
    const storeId = req.user!.storeId!;
    const date = req.query.date as string | undefined;
    const entries = await storage.getAdSpend(storeId, date);
    res.json(entries);
  });

  app.post(api.adSpend.upsert.path, requireAuth, async (req, res) => {
    try {
      const data = api.adSpend.upsert.input.parse(req.body);
      const storeId = req.user!.storeId!;
      const entry = await storage.upsertAdSpend({
        storeId,
        productId: data.productId || null,
        date: data.date,
        amount: data.amount,
      });
      res.json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.orders.shopifyWebhook.path, async (req, res) => {
    try {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string | undefined;
      const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;

      if (shopifySecret && hmacHeader) {
        const rawBody = JSON.stringify(req.body);
        const computed = createHmac('sha256', shopifySecret)
          .update(rawBody, 'utf8')
          .digest('base64');
        if (computed !== hmacHeader) {
          return res.status(401).json({ message: "Invalid HMAC signature" });
        }
      }

      const payload = req.body;
      
      if (!payload || !payload.id) {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      const shopifyStoreId = req.query.store_id ? Number(req.query.store_id) : null;
      if (!shopifyStoreId) {
        return res.status(400).json({ message: "store_id query param required" });
      }

      const store = await storage.getStore(shopifyStoreId);
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }

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

      const order = await storage.createOrder({
        storeId: shopifyStoreId,
        orderNumber: String(payload.order_number || payload.id),
        customerName,
        customerPhone,
        customerAddress,
        customerCity,
        status: 'new',
        totalPrice,
        productCost: 0,
        shippingCost: 0,
        adSpend: 0,
        source: 'shopify',
        comment: payload.note || null,
      }, []);

      if (payload.line_items && Array.isArray(payload.line_items)) {
        const storeProducts = await storage.getProductsByStore(shopifyStoreId);

        for (const item of payload.line_items) {
          const matchedProduct = storeProducts.find(
            p => p.sku === item.sku || p.name === item.title
          );

          if (matchedProduct) {
            const { orderItems: oi } = await import("@shared/schema");
            const { db: database } = await import("./db");
            await database.insert(oi).values({
              orderId: order.id,
              productId: matchedProduct.id,
              quantity: item.quantity || 1,
              price: Math.round(parseFloat(item.price || '0') * 100),
            });
          }
        }
      }

      res.json({ success: true, orderId: order.id });
    } catch (err) {
      console.error('Shopify webhook error:', err);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  return httpServer;
}

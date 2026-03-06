import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertOrderSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed DB with mock data for testing
  seedDatabase();

  app.get(api.stats.get.path, async (req, res) => {
    const storeId = Number(req.params.storeId);
    const ordersList = await storage.getOrdersByStore(storeId);
    
    let totalOrders = ordersList.length;
    let confirmed = 0;
    let inProgress = 0;
    let cancelled = 0;
    let delivered = 0;
    let refused = 0;
    let revenue = 0;
    let profit = 0;
    
    ordersList.forEach(o => {
      if (o.status === 'confirmed') confirmed++;
      else if (o.status === 'in_progress') inProgress++;
      else if (o.status === 'cancelled') cancelled++;
      else if (o.status === 'delivered') delivered++;
      else if (o.status === 'refused') refused++;
      
      if (['confirmed', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
        profit += (o.totalPrice - o.productCost - o.shippingCost - o.adSpend);
      }
    });

    res.json({
      totalOrders,
      confirmed,
      inProgress,
      cancelled,
      delivered,
      refused,
      revenue,
      profit
    });
  });

  app.get(api.orders.list.path, async (req, res) => {
    const storeId = Number(req.params.storeId);
    const ordersList = await storage.getOrdersByStore(storeId);
    res.json(ordersList);
  });

  app.get(api.orders.get.path, async (req, res) => {
    const orderId = Number(req.params.id);
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.json(order);
  });

  app.patch(api.orders.updateStatus.path, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status } = api.orders.updateStatus.input.parse(req.body);
      const updated = await storage.updateOrderStatus(orderId, status);
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.orders.assign.path, async (req, res) => {
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
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });
  
  app.get(api.products.list.path, async (req, res) => {
    const storeId = Number(req.params.storeId);
    const productsList = await storage.getProductsByStore(storeId);
    res.json(productsList);
  });

  app.get(api.agents.list.path, async (req, res) => {
    const storeId = Number(req.params.storeId);
    const agentsList = await storage.getUsersByStore(storeId);
    res.json(agentsList);
  });

  // Mock Shopify webhook to create order
  app.post(api.orders.shopifyWebhook.path, async (req, res) => {
    // A simplified webhook handler for demo
    try {
      // In a real app, you would parse the shopify webhook payload here
      // This is just a stub for demonstrating the webhook integration
      console.log('Received shopify webhook:', req.body);
      res.json({ success: true });
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).json({ message: 'Webhook failed' });
    }
  });

  return httpServer;
}

async function seedDatabase() {
  try {
    const existingStores = await storage.getStore(1);
    if (!existingStores) {
      const store = await storage.createStore({ name: "Garean Demo Store" });
      const admin = await storage.createUser({ username: "Mohamed", role: "owner", storeId: store.id });
      const agent1 = await storage.createUser({ username: "khawla", role: "agent", storeId: store.id });
      const agent2 = await storage.createUser({ username: "fatima", role: "agent", storeId: store.id });

      const prod1 = await storage.createProduct({ storeId: store.id, name: "Smart Watch", sku: "SW-01", stock: 150, costPrice: 2000, reference: "ZOMAX حذاء" });
      const prod2 = await storage.createProduct({ storeId: store.id, name: "Wireless Earbuds", sku: "WE-02", stock: 300, costPrice: 1500, reference: "ماكينة تلميع" });
      
      await storage.createOrder({
        storeId: store.id,
        orderNumber: "3906",
        customerName: "Aziz Aziz",
        customerPhone: "+212606604135",
        customerCity: "Casablanca",
        customerAddress: "sidi massoud sidi",
        status: "new",
        totalPrice: 42900,
        productCost: 20000,
        shippingCost: 3000,
        adSpend: 5000,
        assignedToId: agent1.id,
        comment: "Test order",
        isStock: 0,
        upSell: 0,
        canOpen: 1,
        replace: 0
      }, [
        { productId: prod1.id, quantity: 1, price: 42900 }
      ]);

      await storage.createOrder({
        storeId: store.id,
        orderNumber: "3907",
        customerName: "Saad el habti",
        customerPhone: "+212682093205",
        customerCity: "Fez",
        customerAddress: "شفشاون",
        status: "new",
        totalPrice: 37900,
        productCost: 15000,
        shippingCost: 3000,
        adSpend: 4000,
        assignedToId: agent2.id,
        isStock: 0,
        upSell: 0,
        canOpen: 1,
        replace: 0
      }, [
        { productId: prod2.id, quantity: 1, price: 37900 }
      ]);
    }
  } catch (err) {
    console.error("Seed failed", err);
  }
}

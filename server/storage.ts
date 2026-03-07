import { db } from "./db";
import { 
  users, stores, products, orders, orderItems, adSpendTracking, storeIntegrations, integrationLogs,
  type User, type Store, type Product, type Order, type OrderItem, type OrderWithDetails,
  type InsertUser, type InsertStore, type InsertProduct, type InsertOrder, type InsertOrderItem,
  type AdSpendEntry, type InsertAdSpend,
  type StoreIntegration, type InsertIntegration, type IntegrationLog, type InsertIntegrationLog
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByStore(storeId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  
  getProductsByStore(storeId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductStock(id: number, stockDelta: number): Promise<Product | undefined>;
  
  getOrdersByStore(storeId: number, status?: string): Promise<OrderWithDetails[]>;
  getOrdersByAgent(agentId: number): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  assignOrder(id: number, agentId: number | null): Promise<Order | undefined>;

  getAdSpend(storeId: number, date?: string): Promise<AdSpendEntry[]>;
  upsertAdSpend(entry: InsertAdSpend): Promise<AdSpendEntry>;

  getIntegrationsByStore(storeId: number, type?: string): Promise<StoreIntegration[]>;
  getAllActiveIntegrationsByProvider(provider: string): Promise<StoreIntegration[]>;
  getIntegration(id: number): Promise<StoreIntegration | undefined>;
  getIntegrationByProvider(storeId: number, provider: string): Promise<StoreIntegration | undefined>;
  createIntegration(data: InsertIntegration): Promise<StoreIntegration>;
  updateIntegration(id: number, data: Partial<InsertIntegration>): Promise<StoreIntegration | undefined>;
  deleteIntegration(id: number): Promise<void>;

  getIntegrationLogs(storeId: number, limit?: number): Promise<IntegrationLog[]>;
  createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog>;

  updateOrderShipping(orderId: number, trackingNumber: string, labelLink: string | null, shippingProvider: string): Promise<Order | undefined>;
  getOrderByNumber(storeId: number, orderNumber: string): Promise<Order | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store;
  }

  async createStore(store: InsertStore): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsersByStore(storeId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.storeId, storeId));
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getProductsByStore(storeId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.storeId, storeId));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProductStock(id: number, stockDelta: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;
    
    const [updated] = await db.update(products)
      .set({ stock: product.stock + stockDelta })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async getOrdersByStore(storeId: number, status?: string): Promise<OrderWithDetails[]> {
    let query;
    if (status) {
      query = db.select().from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.status, status)))
        .orderBy(desc(orders.createdAt));
    } else {
      query = db.select().from(orders)
        .where(eq(orders.storeId, storeId))
        .orderBy(desc(orders.createdAt));
    }
    
    const allOrders = await query;
    return this.hydrateOrders(allOrders);
  }

  async getOrdersByAgent(agentId: number): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders)
      .where(eq(orders.assignedToId, agentId))
      .orderBy(desc(orders.createdAt));
    return this.hydrateOrders(allOrders);
  }

  private async hydrateOrders(allOrders: Order[]): Promise<OrderWithDetails[]> {
    const ordersWithDetails: OrderWithDetails[] = [];
    for (const order of allOrders) {
      const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const agent = order.assignedToId ? (await db.select().from(users).where(eq(users.id, order.assignedToId)))[0] : null;
      
      const itemsWithProducts = await Promise.all(orderItemsList.map(async (item) => {
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        return { ...item, product };
      }));
      
      ordersWithDetails.push({
        ...order,
        agent,
        items: itemsWithProducts
      });
    }
    return ordersWithDetails;
  }

  async getOrder(id: number): Promise<OrderWithDetails | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const agent = order.assignedToId ? (await db.select().from(users).where(eq(users.id, order.assignedToId)))[0] : null;
    
    const itemsWithProducts = await Promise.all(orderItemsList.map(async (item) => {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      return { ...item, product };
    }));
    
    return {
      ...order,
      agent,
      items: itemsWithProducts
    };
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    
    for (const item of items) {
      await db.insert(orderItems).values({ ...item, orderId: newOrder.id });
    }
    
    return newOrder;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, id));
    if (!currentOrder) return undefined;

    const [updated] = await db.update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
      
    if (status === 'confirmed' && currentOrder.status !== 'confirmed') {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        await this.updateProductStock(item.productId, -item.quantity);
      }
    }

    if (currentOrder.status === 'confirmed' && status !== 'confirmed') {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        await this.updateProductStock(item.productId, item.quantity);
      }
    }
      
    return updated;
  }

  async assignOrder(id: number, agentId: number | null): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({ assignedToId: agentId })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async getAdSpend(storeId: number, date?: string): Promise<AdSpendEntry[]> {
    if (date) {
      return await db.select().from(adSpendTracking)
        .where(and(eq(adSpendTracking.storeId, storeId), eq(adSpendTracking.date, date)));
    }
    return await db.select().from(adSpendTracking)
      .where(eq(adSpendTracking.storeId, storeId))
      .orderBy(desc(adSpendTracking.date));
  }

  async upsertAdSpend(entry: InsertAdSpend): Promise<AdSpendEntry> {
    const existing = await db.select().from(adSpendTracking)
      .where(and(
        eq(adSpendTracking.storeId, entry.storeId),
        eq(adSpendTracking.date, entry.date),
        entry.productId ? eq(adSpendTracking.productId, entry.productId) : sql`${adSpendTracking.productId} IS NULL`
      ));

    if (existing.length > 0) {
      const [updated] = await db.update(adSpendTracking)
        .set({ amount: entry.amount })
        .where(eq(adSpendTracking.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(adSpendTracking).values(entry).returning();
    return created;
  }

  async getIntegrationsByStore(storeId: number, type?: string): Promise<StoreIntegration[]> {
    if (type) {
      return await db.select().from(storeIntegrations)
        .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.type, type)))
        .orderBy(desc(storeIntegrations.createdAt));
    }
    return await db.select().from(storeIntegrations)
      .where(eq(storeIntegrations.storeId, storeId))
      .orderBy(desc(storeIntegrations.createdAt));
  }

  async getAllActiveIntegrationsByProvider(provider: string): Promise<StoreIntegration[]> {
    return await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.provider, provider), eq(storeIntegrations.isActive, 1)));
  }

  async getIntegration(id: number): Promise<StoreIntegration | undefined> {
    const [integration] = await db.select().from(storeIntegrations).where(eq(storeIntegrations.id, id));
    return integration;
  }

  async getIntegrationByProvider(storeId: number, provider: string): Promise<StoreIntegration | undefined> {
    const [integration] = await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, provider)));
    return integration;
  }

  async createIntegration(data: InsertIntegration): Promise<StoreIntegration> {
    const [created] = await db.insert(storeIntegrations).values(data).returning();
    return created;
  }

  async updateIntegration(id: number, data: Partial<InsertIntegration>): Promise<StoreIntegration | undefined> {
    const [updated] = await db.update(storeIntegrations)
      .set(data)
      .where(eq(storeIntegrations.id, id))
      .returning();
    return updated;
  }

  async deleteIntegration(id: number): Promise<void> {
    await db.update(integrationLogs)
      .set({ integrationId: null })
      .where(eq(integrationLogs.integrationId, id));
    await db.delete(storeIntegrations).where(eq(storeIntegrations.id, id));
  }

  async getIntegrationLogs(storeId: number, limit = 100): Promise<IntegrationLog[]> {
    return await db.select().from(integrationLogs)
      .where(eq(integrationLogs.storeId, storeId))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(limit);
  }

  async createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog> {
    const [created] = await db.insert(integrationLogs).values(data).returning();
    return created;
  }

  async updateOrderShipping(orderId: number, trackingNumber: string, labelLink: string | null, shippingProvider: string): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({ trackNumber: trackingNumber, labelLink, shippingProvider })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getOrderByNumber(storeId: number, orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.orderNumber, orderNumber)));
    return order;
  }
}

export const storage = new DatabaseStorage();

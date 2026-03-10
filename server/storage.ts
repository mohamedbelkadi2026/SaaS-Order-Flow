import { db } from "./db";
import { 
  users, stores, products, productVariants, orders, orderItems, adSpendTracking, storeIntegrations, integrationLogs,
  subscriptions, customers, agentProducts, storeAgentSettings, orderFollowUpLogs,
  type User, type Store, type Product, type ProductVariant, type ProductWithVariants, type Order, type OrderItem, type OrderWithDetails,
  type InsertUser, type InsertStore, type InsertProduct, type InsertProductVariant, type InsertOrder, type InsertOrderItem,
  type AdSpendEntry, type InsertAdSpend,
  type StoreIntegration, type InsertIntegration, type IntegrationLog, type InsertIntegrationLog,
  type Subscription, type InsertSubscription, type Customer, type InsertCustomer,
  type AgentProduct,
  type StoreAgentSetting, type InsertStoreAgentSetting,
  type OrderFollowUpLog, type InsertOrderFollowUpLog,
} from "@shared/schema";
import { eq, desc, and, sql, count, ne, like, gte, lte, inArray, or } from "drizzle-orm";

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
  getFilteredOrders(storeId: number, filters: {
    status?: string; agentId?: number; city?: string; source?: string;
    dateFrom?: string; dateTo?: string; search?: string; page?: number; limit?: number;
  }, agentOnly?: number): Promise<{ orders: OrderWithDetails[]; total: number }>;
  bulkAssignOrders(orderIds: number[], agentId: number, storeId: number): Promise<number>;
  bulkShipOrders(orderIds: number[], storeId: number): Promise<Order[]>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  assignOrder(id: number, agentId: number | null): Promise<Order | undefined>;

  getAdSpend(storeId: number, date?: string): Promise<AdSpendEntry[]>;
  upsertAdSpend(entry: InsertAdSpend): Promise<AdSpendEntry>;

  getOrGenerateWebhookKey(storeId: number): Promise<string>;
  getStoreByWebhookKey(key: string): Promise<Store | undefined>;

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
  updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  getProductsWithVariants(storeId: number): Promise<ProductWithVariants[]>;
  createProductWithVariants(product: InsertProduct, variants: InsertProductVariant[]): Promise<ProductWithVariants>;
  getVariantsByProduct(productId: number): Promise<ProductVariant[]>;
  getInventoryStats(storeId: number): Promise<any>;
  deleteUser(id: number): Promise<void>;

  getCustomersByStore(storeId: number): Promise<Customer[]>;
  getOrCreateCustomer(storeId: number, name: string, phone: string, address?: string | null, city?: string | null): Promise<Customer>;
  updateCustomerStats(customerId: number, orderTotal: number): Promise<void>;

  getSubscription(storeId: number): Promise<Subscription | undefined>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  incrementMonthlyOrders(storeId: number): Promise<void>;
  resetMonthlyOrders(storeId: number): Promise<void>;
  checkOrderLimit(storeId: number): Promise<{ allowed: boolean; current: number; limit: number; plan: string }>;

  getAgentPerformance(storeId: number): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]>;

  getAgentProducts(agentId: number): Promise<AgentProduct[]>;
  setAgentProducts(agentId: number, storeId: number, productIds: number[]): Promise<AgentProduct[]>;
  getNextAgent(storeId: number, productId?: number, customerCity?: string): Promise<number | null>;

  getStoreAgentSettings(storeId: number): Promise<StoreAgentSetting[]>;
  getAgentStoreSetting(agentId: number, storeId: number): Promise<StoreAgentSetting | undefined>;
  upsertStoreAgentSetting(agentId: number, storeId: number, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string }): Promise<StoreAgentSetting>;

  getOrderFollowUpLogs(orderId: number): Promise<OrderFollowUpLog[]>;
  createOrderFollowUpLog(data: InsertOrderFollowUpLog): Promise<OrderFollowUpLog>;

  getStoresByOwner(userId: number): Promise<Store[]>;
  updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined>;
  deleteStore(id: number): Promise<void>;

  getAllStores(): Promise<(Store & { ownerEmail?: string | null; subscription?: Subscription | null })[]>;
  getGlobalStats(): Promise<{ totalStores: number; activeStores: number; totalRevenue: number }>;
  toggleStoreActive(storeId: number, isActive: number): Promise<void>;
}

// Moroccan region to city keyword mapping for order assignment
const REGION_CITY_MAP: Record<string, string[]> = {
  tanger: ['tanger', 'tétouan', 'tetouan', 'al hoceima', 'hoceima', 'chefchaouen', 'larache', 'ouazzane', 'mdiq', 'fnideq'],
  oriental: ['oujda', 'nador', 'berkane', 'taourirt', 'jerada', 'guercif', 'figuig'],
  'fes-meknes': ['fès', 'fes', 'meknès', 'meknes', 'ifrane', 'taza', 'sefrou', 'boulemane', 'el hajeb'],
  rabat: ['rabat', 'salé', 'sale', 'kénitra', 'kenitra', 'skhirat', 'témara', 'temara', 'khémisset', 'khemisset'],
  'beni-mellal': ['beni mellal', 'khénifra', 'khenifra', 'azilal', 'khouribga', 'fquih ben salah', 'kasba tadla'],
  casablanca: ['casablanca', 'casa', 'settat', 'mohammedia', 'benslimane', 'el jadida', 'berrechid', 'mediouna', 'nouaceur'],
  marrakech: ['marrakech', 'marrakesh', 'safi', 'essaouira', 'chichaoua', 'al haouz', 'kelâa', 'kelaa', 'youssoufia'],
  draa: ['errachidia', 'ouarzazate', 'midelt', 'tinghir', 'zagora', 'draa'],
  souss: ['agadir', 'tiznit', 'taroudant', 'taroudante', 'chtouka', 'inezgane', 'ait melloul', 'tata'],
  guelmim: ['guelmim', 'tan-tan', 'tantan', 'sidi ifni', 'assa', 'zag'],
  laayoune: ['laâyoune', 'laayoune', 'boujdour', 'smara', 'tarfaya'],
  dakhla: ['dakhla', 'aousserd', 'oued dahab'],
};

export class DatabaseStorage implements IStorage {
  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store;
  }

  async createStore(store: InsertStore): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  async getOrGenerateWebhookKey(storeId: number): Promise<string> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error("Store not found");
    if (store.webhookKey) return store.webhookKey;
    const { randomBytes } = await import('crypto');
    const key = randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12).padEnd(12, '0');
    await db.update(stores).set({ webhookKey: key }).where(eq(stores.id, storeId));
    return key;
  }

  async getStoreByWebhookKey(key: string): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.webhookKey, key));
    return store;
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

  async getFilteredOrders(storeId: number, filters: {
    status?: string; agentId?: number; city?: string; source?: string;
    dateFrom?: string; dateTo?: string; search?: string; page?: number; limit?: number;
  }, agentOnly?: number): Promise<{ orders: OrderWithDetails[]; total: number }> {
    const conditions: any[] = [eq(orders.storeId, storeId)];

    if (agentOnly) {
      conditions.push(eq(orders.assignedToId, agentOnly));
    }

    if (filters.status) {
      if (filters.status === 'annule_group') {
        conditions.push(sql`${orders.status} LIKE 'Annulé%'`);
      } else if (filters.status === 'suivi_group') {
        conditions.push(inArray(orders.status, ['in_progress', 'expédié', 'retourné']));
      } else {
        conditions.push(eq(orders.status, filters.status));
      }
    }
    if (filters.agentId) {
      conditions.push(eq(orders.assignedToId, filters.agentId));
    }
    if (filters.city) {
      conditions.push(eq(orders.customerCity, filters.city));
    }
    if (filters.source) {
      conditions.push(eq(orders.source, filters.source));
    }
    if (filters.dateFrom) {
      conditions.push(gte(orders.createdAt, new Date(filters.dateFrom + 'T00:00:00')));
    }
    if (filters.dateTo) {
      conditions.push(lte(orders.createdAt, new Date(filters.dateTo + 'T23:59:59')));
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        like(orders.customerName, term),
        like(orders.customerPhone, term),
        like(orders.orderNumber, term),
        like(orders.customerCity, term)
      ));
    }

    const whereClause = and(...conditions);
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    const [{ value: total }] = await db.select({ value: count() }).from(orders).where(whereClause);

    const allOrders = await db.select().from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const hydrated = await this.hydrateOrders(allOrders);
    return { orders: hydrated, total };
  }

  async bulkAssignOrders(orderIds: number[], agentId: number, storeId: number): Promise<number> {
    if (orderIds.length === 0) return 0;
    const result = await db.update(orders)
      .set({ assignedToId: agentId })
      .where(and(inArray(orders.id, orderIds), eq(orders.storeId, storeId)))
      .returning();
    return result.length;
  }

  async bulkShipOrders(orderIds: number[], storeId: number): Promise<Order[]> {
    if (orderIds.length === 0) return [];
    const eligible = await db.select().from(orders)
      .where(and(
        inArray(orders.id, orderIds),
        eq(orders.storeId, storeId),
        eq(orders.status, 'confirme')
      ));
    return eligible;
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
      
    if (status === 'confirme' && currentOrder.status !== 'confirme') {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        await this.updateProductStock(item.productId, -item.quantity);
      }
    }

    if (currentOrder.status === 'confirme' && status !== 'confirme') {
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

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return updated;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(productVariants).where(eq(productVariants.productId, id));
    await db.delete(products).where(eq(products.id, id));
  }

  async getProductsWithVariants(storeId: number): Promise<ProductWithVariants[]> {
    const allProducts = await db.select().from(products)
      .where(eq(products.storeId, storeId))
      .orderBy(desc(products.createdAt));
    const result: ProductWithVariants[] = [];
    for (const p of allProducts) {
      const variants = await db.select().from(productVariants)
        .where(eq(productVariants.productId, p.id));
      result.push({ ...p, variants });
    }
    return result;
  }

  async createProductWithVariants(product: InsertProduct, variants: InsertProductVariant[]): Promise<ProductWithVariants> {
    const [newProduct] = await db.insert(products).values(product).returning();
    const createdVariants: ProductVariant[] = [];
    for (const v of variants) {
      const [nv] = await db.insert(productVariants).values({ ...v, productId: newProduct.id, storeId: newProduct.storeId }).returning();
      createdVariants.push(nv);
    }
    return { ...newProduct, variants: createdVariants };
  }

  async getVariantsByProduct(productId: number): Promise<ProductVariant[]> {
    return await db.select().from(productVariants).where(eq(productVariants.productId, productId));
  }

  async getInventoryStats(storeId: number): Promise<any> {
    const allProducts = await db.select().from(products).where(eq(products.storeId, storeId));
    const allVariants = await db.select().from(productVariants).where(eq(productVariants.storeId, storeId));
    
    const totalProducts = allProducts.length;
    const totalVariants = allVariants.length;
    const totalQuantity = allProducts.reduce((s, p) => s + p.stock, 0) + allVariants.reduce((s, v) => s + v.stock, 0);
    const getAggStock = (p: Product) => {
      const pvs = allVariants.filter(v => v.productId === p.id);
      return pvs.length > 0 ? pvs.reduce((s, v) => s + v.stock, 0) : p.stock;
    };
    const lowStock = allProducts.filter(p => { const s = getAggStock(p); return s > 0 && s < 10; }).length;
    const outOfStock = allProducts.filter(p => getAggStock(p) === 0).length;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newProducts = allProducts.filter(p => p.createdAt && new Date(p.createdAt) >= startOfMonth).length;

    const productStats = [];
    for (const p of allProducts) {
      const variants = allVariants.filter(v => v.productId === p.id);
      const totalStock = p.stock + variants.reduce((s, v) => s + v.stock, 0);
      
      const confirmedItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId),
          eq(orders.status, 'confirme')
        ));
      
      const deliveredItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId),
          eq(orders.status, 'delivered')
        ));

      const totalOrderItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId)
        ));

      const sortie = Number(confirmedItems[0]?.qty || 0) + Number(deliveredItems[0]?.qty || 0);
      const totalOrdered = Number(totalOrderItems[0]?.qty || 0);
      const available = totalStock;
      const initialStock = available + sortie;
      const confirmRate = totalOrdered > 0 ? Math.round(Number(confirmedItems[0]?.qty || 0) / totalOrdered * 100) : 0;
      const deliverRate = totalOrdered > 0 ? Math.round(Number(deliveredItems[0]?.qty || 0) / totalOrdered * 100) : 0;

      productStats.push({
        id: p.id,
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        description: p.description,
        reference: p.reference,
        hasVariants: p.hasVariants,
        baseStock: p.stock,
        stock: totalStock,
        variantCount: variants.length || 1,
        recu: initialStock,
        sortie,
        available,
        confirmRate,
        deliverRate,
        totalOrdered,
        totalConfirmed: Number(confirmedItems[0]?.qty || 0),
        totalDelivered: Number(deliveredItems[0]?.qty || 0),
        stockReel: available * p.costPrice,
        stockTotal: available * p.sellingPrice,
        storeName: '',
      });
    }

    return {
      totalProducts,
      totalVariants,
      totalQuantity,
      lowStock,
      outOfStock,
      newProducts,
      productStats,
    };
  }

  async deleteUser(id: number): Promise<void> {
    await db.update(orders).set({ assignedToId: null }).where(eq(orders.assignedToId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getCustomersByStore(storeId: number): Promise<Customer[]> {
    return await db.select().from(customers)
      .where(eq(customers.storeId, storeId))
      .orderBy(desc(customers.createdAt));
  }

  async getOrCreateCustomer(storeId: number, name: string, phone: string, address?: string | null, city?: string | null): Promise<Customer> {
    const [existing] = await db.select().from(customers)
      .where(and(eq(customers.storeId, storeId), eq(customers.phone, phone)));
    if (existing) return existing;

    const [created] = await db.insert(customers).values({
      storeId, name, phone, address: address || null, city: city || null,
      orderCount: 0, totalSpent: 0,
    }).returning();
    return created;
  }

  async updateCustomerStats(customerId: number, orderTotal: number): Promise<void> {
    await db.update(customers).set({
      orderCount: sql`${customers.orderCount} + 1`,
      totalSpent: sql`${customers.totalSpent} + ${orderTotal}`,
    }).where(eq(customers.id, customerId));
  }

  async getSubscription(storeId: number): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.storeId, storeId));
    return sub;
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [created] = await db.insert(subscriptions).values(data).returning();
    return created;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
    return updated;
  }

  async incrementMonthlyOrders(storeId: number): Promise<void> {
    await db.update(subscriptions).set({
      currentMonthOrders: sql`${subscriptions.currentMonthOrders} + 1`,
    }).where(eq(subscriptions.storeId, storeId));
  }

  async resetMonthlyOrders(storeId: number): Promise<void> {
    await db.update(subscriptions).set({
      currentMonthOrders: 0,
      billingCycleStart: new Date(),
    }).where(eq(subscriptions.storeId, storeId));
  }

  async checkOrderLimit(storeId: number): Promise<{ allowed: boolean; current: number; limit: number; plan: string }> {
    const sub = await this.getSubscription(storeId);
    if (!sub) {
      return { allowed: true, current: 0, limit: 1500, plan: 'starter' };
    }
    const now = new Date();
    const cycleStart = sub.billingCycleStart || sub.createdAt || now;
    const monthsSinceCycle = (now.getFullYear() - cycleStart.getFullYear()) * 12 + (now.getMonth() - cycleStart.getMonth());
    if (monthsSinceCycle >= 1) {
      await this.resetMonthlyOrders(storeId);
      return { allowed: true, current: 0, limit: sub.monthlyLimit, plan: sub.plan };
    }
    const allowed = sub.plan === 'pro' || sub.currentMonthOrders < sub.monthlyLimit;
    return { allowed, current: sub.currentMonthOrders, limit: sub.monthlyLimit, plan: sub.plan };
  }

  async getAgentPerformance(storeId: number): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]> {
    const result = await db.select({
      agentId: orders.assignedToId,
      total: count(),
      confirmed: sql<number>`count(*) filter (where ${orders.status} = 'confirme')`,
      delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)'))`,
    }).from(orders)
      .where(and(eq(orders.storeId, storeId), sql`${orders.assignedToId} IS NOT NULL`))
      .groupBy(orders.assignedToId);

    return result.map(r => ({
      agentId: r.agentId!,
      total: Number(r.total),
      confirmed: Number(r.confirmed),
      delivered: Number(r.delivered),
      cancelled: Number(r.cancelled),
    }));
  }

  async getAllStores(): Promise<(Store & { ownerEmail?: string | null; subscription?: Subscription | null })[]> {
    const allStores = await db.select().from(stores).orderBy(desc(stores.createdAt));
    const result = [];
    for (const store of allStores) {
      const [owner] = await db.select().from(users)
        .where(and(eq(users.storeId, store.id), eq(users.role, 'owner')));
      const [sub] = await db.select().from(subscriptions)
        .where(eq(subscriptions.storeId, store.id));
      result.push({
        ...store,
        ownerEmail: owner?.email || null,
        subscription: sub || null,
      });
    }
    return result;
  }

  async getGlobalStats(): Promise<{ totalStores: number; activeStores: number; totalRevenue: number }> {
    const [storeCount] = await db.select({ count: count() }).from(stores);
    const allSubs = await db.select().from(subscriptions).where(eq(subscriptions.isActive, 1));
    const totalRevenue = allSubs.reduce((sum, s) => sum + s.pricePerMonth, 0);
    return {
      totalStores: Number(storeCount.count),
      activeStores: allSubs.length,
      totalRevenue,
    };
  }

  async toggleStoreActive(storeId: number, isActive: number): Promise<void> {
    await db.update(users).set({ isActive }).where(eq(users.storeId, storeId));
  }

  async getAgentProducts(agentId: number): Promise<AgentProduct[]> {
    return await db.select().from(agentProducts).where(eq(agentProducts.agentId, agentId));
  }

  async setAgentProducts(agentId: number, storeId: number, productIds: number[]): Promise<AgentProduct[]> {
    await db.delete(agentProducts).where(eq(agentProducts.agentId, agentId));
    if (productIds.length === 0) return [];
    const values = productIds.map(pid => ({ agentId, productId: pid, storeId }));
    return await db.insert(agentProducts).values(values).returning();
  }

  async getNextAgent(storeId: number, productId?: number, customerCity?: string): Promise<number | null> {
    const storeAgents = await db.select().from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'agent'), eq(users.isActive, 1)));
    
    if (storeAgents.length === 0) return null;

    // Load per-store agent settings for role and lead percentage
    const settings = await db.select().from(storeAgentSettings)
      .where(eq(storeAgentSettings.storeId, storeId));
    const settingsMap = new Map(settings.map(s => [s.agentId, s]));

    // Filter agents to only those with a confirmation role (confirmation or both)
    let eligibleAgents = storeAgents.filter(a => {
      const setting = settingsMap.get(a.id);
      if (!setting) return true; // no settings = default to confirmation eligible
      return setting.roleInStore === 'confirmation' || setting.roleInStore === 'both';
    });

    if (eligibleAgents.length === 0) eligibleAgents = storeAgents;

    // Filter by allowed products if configured
    if (productId) {
      const productFilteredAgents = eligibleAgents.filter(a => {
        const setting = settingsMap.get(a.id);
        if (!setting) return true;
        try {
          const allowed: number[] = JSON.parse(setting.allowedProductIds || '[]');
          if (allowed.length === 0) return true; // empty = all products
          return allowed.includes(productId);
        } catch {
          return true;
        }
      });
      if (productFilteredAgents.length > 0) {
        eligibleAgents = productFilteredAgents;
      }
    }

    // Filter by allowed regions if customerCity is provided
    if (customerCity) {
      const regionFilteredAgents = eligibleAgents.filter(a => {
        const setting = settingsMap.get(a.id);
        if (!setting) return true;
        try {
          const allowedRegions: string[] = JSON.parse(setting.allowedRegions || '[]');
          if (allowedRegions.length === 0) return true; // empty = all regions
          // Check if the customerCity matches any of the agent's allowed regions using keyword matching
          const cityLower = customerCity.toLowerCase();
          return allowedRegions.some(region => {
            const regionKeywords = REGION_CITY_MAP[region] || [];
            return regionKeywords.some(kw => cityLower.includes(kw));
          });
        } catch {
          return true;
        }
      });
      if (regionFilteredAgents.length > 0) {
        eligibleAgents = regionFilteredAgents;
      }
    }

    // Determine distribution method for the store's agents
    // Prefer per-agent distributionMethod. If multiple agents: weighted random by leadPercentage.
    // Build weighted pool based on leadPercentage
    const pool: number[] = [];
    for (const agent of eligibleAgents) {
      const setting = settingsMap.get(agent.id);
      const pct = setting ? Math.max(1, setting.leadPercentage) : 100;
      // If the agent uses auto (round robin), give 1 ticket; else use their leadPercentage
      const method = agent.distributionMethod || 'auto';
      const tickets = method === 'pourcentage' ? pct : 1;
      for (let i = 0; i < tickets; i++) pool.push(agent.id);
    }

    if (pool.length === 0) return null;

    // Pick a random agent from the weighted pool
    const randomIndex = Math.floor(Math.random() * pool.length);
    const nextAgentId = pool[randomIndex];

    await db.update(stores).set({ lastAssignedAgentId: nextAgentId }).where(eq(stores.id, storeId));
    return nextAgentId;
  }

  async getStoreAgentSettings(storeId: number): Promise<StoreAgentSetting[]> {
    return await db.select().from(storeAgentSettings)
      .where(eq(storeAgentSettings.storeId, storeId));
  }

  async getAgentStoreSetting(agentId: number, storeId: number): Promise<StoreAgentSetting | undefined> {
    const [setting] = await db.select().from(storeAgentSettings)
      .where(and(eq(storeAgentSettings.agentId, agentId), eq(storeAgentSettings.storeId, storeId)));
    return setting;
  }

  async upsertStoreAgentSetting(agentId: number, storeId: number, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string }): Promise<StoreAgentSetting> {
    const existing = await this.getAgentStoreSetting(agentId, storeId);
    if (existing) {
      const [updated] = await db.update(storeAgentSettings)
        .set({ ...data })
        .where(and(eq(storeAgentSettings.agentId, agentId), eq(storeAgentSettings.storeId, storeId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(storeAgentSettings)
      .values({ agentId, storeId, ...data })
      .returning();
    return created;
  }

  async getOrderFollowUpLogs(orderId: number): Promise<OrderFollowUpLog[]> {
    return await db.select().from(orderFollowUpLogs)
      .where(eq(orderFollowUpLogs.orderId, orderId))
      .orderBy(desc(orderFollowUpLogs.createdAt));
  }

  async createOrderFollowUpLog(data: InsertOrderFollowUpLog): Promise<OrderFollowUpLog> {
    const [log] = await db.insert(orderFollowUpLogs).values(data).returning();
    return log;
  }

  async getStoresByOwner(userId: number): Promise<Store[]> {
    const user = await this.getUserById(userId);
    if (!user?.storeId) return [];
    const owned = await db.select().from(stores).where(eq(stores.ownerId, userId));
    if (owned.length > 0) return owned;
    return await db.select().from(stores).where(eq(stores.id, user.storeId));
  }

  async updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined> {
    const [updated] = await db.update(stores).set(data).where(eq(stores.id, id)).returning();
    return updated;
  }

  async deleteStore(id: number): Promise<void> {
    await db.delete(agentProducts).where(eq(agentProducts.storeId, id));
    await db.delete(orderItems).where(
      sql`${orderItems.orderId} IN (SELECT id FROM orders WHERE store_id = ${id})`
    );
    await db.delete(orders).where(eq(orders.storeId, id));
    await db.delete(products).where(eq(products.storeId, id));
    await db.delete(customers).where(eq(customers.storeId, id));
    await db.delete(adSpendTracking).where(eq(adSpendTracking.storeId, id));
    await db.delete(integrationLogs).where(eq(integrationLogs.storeId, id));
    await db.delete(storeIntegrations).where(eq(storeIntegrations.storeId, id));
    await db.delete(subscriptions).where(eq(subscriptions.storeId, id));
    await db.delete(users).where(eq(users.storeId, id));
    await db.delete(stores).where(eq(stores.id, id));
  }
}

export const storage = new DatabaseStorage();

import { db } from "./db";
import { 
  users, stores, products, productVariants, orders, orderItems, adSpendTracking, adSpend, storeIntegrations, integrationLogs,
  subscriptions, customers, agentProducts, storeAgentSettings, orderFollowUpLogs, stockLogs,
  type User, type Store, type Product, type ProductVariant, type ProductWithVariants, type Order, type OrderItem, type OrderWithDetails,
  type InsertUser, type InsertStore, type InsertProduct, type InsertProductVariant, type InsertOrder, type InsertOrderItem,
  type AdSpendEntry, type InsertAdSpend, type AdSpendNewEntry, type InsertAdSpendNew,
  type StoreIntegration, type InsertIntegration, type IntegrationLog, type InsertIntegrationLog,
  type Subscription, type InsertSubscription, type Customer, type InsertCustomer,
  type AgentProduct,
  type StoreAgentSetting, type InsertStoreAgentSetting,
  type OrderFollowUpLog, type InsertOrderFollowUpLog,
  type StockLog,
} from "@shared/schema";
import { eq, desc, and, sql, count, ne, like, gte, lte, inArray, or } from "drizzle-orm";

export interface IStorage {
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  
  getUserById(id: number): Promise<User | undefined>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByStore(storeId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  getMediaBuyerByCode(storeId: number, code: string): Promise<User | undefined>;
  getMediaBuyerStats(storeId: number, mediaBuyerId: number, platform?: string): Promise<any>;
  getMediaBuyersSummary(storeId: number): Promise<any[]>;
  getOrdersByMediaBuyer(storeId: number, mediaBuyerId: number): Promise<any[]>;
  
  getProductsByStore(storeId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductStock(id: number, stockDelta: number): Promise<Product | undefined>;
  
  getOrdersByStore(storeId: number, status?: string): Promise<OrderWithDetails[]>;
  getOrdersByAgent(agentId: number): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  getFilteredOrders(storeId: number, filters: {
    status?: string; agentId?: number; city?: string; source?: string;
    utmSource?: string; utmCampaign?: string;
    dateFrom?: string; dateTo?: string; dateType?: string; search?: string; page?: number; limit?: number;
  }, agentOnly?: number, mediaBuyerOnly?: number): Promise<{ orders: OrderWithDetails[]; total: number }>;
  bulkAssignOrders(orderIds: number[], agentId: number, storeId: number): Promise<number>;
  bulkShipOrders(orderIds: number[], storeId: number): Promise<Order[]>;
  deleteOrder(id: number, storeId: number): Promise<void>;
  bulkDeleteOrders(ids: number[], storeId: number): Promise<number>;
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
  updateUser(id: number, data: { username?: string; email?: string; phone?: string | null; paymentType?: string; paymentAmount?: number; distributionMethod?: string; isActive?: number; buyerCode?: string | null; password?: string }): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  getCustomersByStore(storeId: number): Promise<Customer[]>;
  getOrCreateCustomer(storeId: number, name: string, phone: string, address?: string | null, city?: string | null): Promise<Customer>;
  updateCustomerStats(customerId: number, orderTotal: number): Promise<void>;
  syncCustomerOnDelivery(storeId: number, order: { customerName: string; customerPhone: string; customerAddress?: string | null; customerCity?: string | null; totalPrice: number }): Promise<void>;
  migrateCustomersFromDeliveredOrders(storeId: number): Promise<number>;

  getSubscription(storeId: number): Promise<Subscription | undefined>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  incrementMonthlyOrders(storeId: number): Promise<void>;
  resetMonthlyOrders(storeId: number): Promise<void>;
  checkOrderLimit(storeId: number): Promise<{ allowed: boolean; current: number; limit: number; plan: string; isBlocked: boolean }>;

  getAgentPerformance(storeId: number): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]>;

  getAgentProducts(agentId: number): Promise<AgentProduct[]>;
  setAgentProducts(agentId: number, storeId: number, productIds: number[]): Promise<AgentProduct[]>;
  getNextAgent(storeId: number, productId?: number, customerCity?: string): Promise<number | null>;

  getStoreAgentSettings(storeId: number): Promise<StoreAgentSetting[]>;
  getAgentStoreSetting(agentId: number, storeId: number): Promise<StoreAgentSetting | undefined>;
  upsertStoreAgentSetting(agentId: number, storeId: number, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string }): Promise<StoreAgentSetting>;

  getOrderFollowUpLogs(orderId: number): Promise<OrderFollowUpLog[]>;
  createOrderFollowUpLog(data: InsertOrderFollowUpLog): Promise<OrderFollowUpLog>;

  addOrderItem(data: { orderId: number; productId?: number | null; rawProductName?: string; sku?: string; variantInfo?: string; quantity: number; price: number }): Promise<OrderItem>;
  updateOrderItem(id: number, data: { quantity?: number; price?: number; rawProductName?: string; sku?: string; variantInfo?: string }): Promise<OrderItem | undefined>;
  deleteOrderItem(id: number): Promise<void>;

  getAgentPermissions(agentId: number): Promise<Record<string, boolean>>;
  updateAgentPermissions(agentId: number, permissions: Record<string, boolean>): Promise<void>;
  getAgentWallet(agentId: number, storeId: number): Promise<{ totalEarned: number; deliveredThisMonth: number; deliveredTotal: number; commissionRate: number }>;
  getCommissionsSummary(storeId: number): Promise<{ agentId: number; agentName: string; commissionRate: number; deliveredTotal: number; totalOwed: number }[]>;

  getStoresByOwner(userId: number): Promise<Store[]>;
  updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined>;
  deleteStore(id: number): Promise<void>;

  createAdSpendEntry(data: InsertAdSpendNew & { userId?: number | null }): Promise<AdSpendNewEntry>;
  getAdSpendEntries(storeId: number, opts?: { productId?: number | null; source?: string; dateFrom?: string; dateTo?: string; userId?: number | null; allUsers?: boolean }): Promise<(AdSpendNewEntry & { productName?: string; userName?: string })[]>;
  deleteAdSpendNew(id: number, storeId: number, userId?: number): Promise<void>;
  getAdSpendNewTotal(storeId: number, dateFrom?: string, dateTo?: string): Promise<number>;

  getMediaBuyerAdSpend(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string): Promise<AdSpendEntry[]>;
  upsertMediaBuyerAdSpend(entry: InsertAdSpend & { mediaBuyerId: number }): Promise<AdSpendEntry>;
  deleteAdSpendEntry(id: number, storeId: number): Promise<void>;
  getAdminAdSpendList(storeId: number, dateFrom?: string, dateTo?: string): Promise<any[]>;
  getAdminProfitSummary(storeId: number, dateFrom?: string, dateTo?: string): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number;
    byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
    byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
    ordersCount: number;
  }>;
  getMediaBuyerProfit(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads: number;
  }>;
  getTeamProfitSummary(storeId: number, dateFrom?: string, dateTo?: string): Promise<{
    rows: { userId: number; userName: string; role: string; totalLeads: number; deliveredCount: number; revenue: number; productCost: number; shippingCost: number; packagingCost: number; agentCommissions: number; adSpend: number; totalCosts: number; netProfit: number; }[];
  }>;

  getAllStores(): Promise<any[]>;
  getGlobalStats(): Promise<{ totalStores: number; activeStores: number; totalRevenue: number; mrr: number; totalOrders: number; expiringCount: number }>;
  toggleStoreActive(storeId: number, isActive: number): Promise<void>;
  changePlan(storeId: number, plan: string, monthlyLimit: number, pricePerMonth: number, planStartDate?: Date | null, planExpiryDate?: Date | null): Promise<void>;
  resetMonthlyOrders(storeId: number): Promise<void>;
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

  async getUser(id: number): Promise<User | undefined> {
    return this.getUserById(id);
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
    utmSource?: string; utmCampaign?: string;
    dateFrom?: string; dateTo?: string; dateType?: string; search?: string; page?: number; limit?: number;
  }, agentOnly?: number, mediaBuyerOnly?: number): Promise<{ orders: OrderWithDetails[]; total: number }> {
    const conditions: any[] = [eq(orders.storeId, storeId)];

    if (agentOnly) {
      conditions.push(eq(orders.assignedToId, agentOnly));
    }

    // Media buyer scoping: show only orders attributed to this buyer (by ID or UTM pattern)
    if (mediaBuyerOnly) {
      const [buyer] = await db.select({ buyerCode: users.buyerCode }).from(users).where(eq(users.id, mediaBuyerOnly));
      const buyerCode = buyer?.buyerCode;
      conditions.push(
        buyerCode
          ? or(
              eq(orders.mediaBuyerId, mediaBuyerOnly),
              sql`${orders.utmSource} ILIKE ${buyerCode + '*%'}`,
              sql`upper(${orders.utmSource}) = upper(${buyerCode})`
            )
          : eq(orders.mediaBuyerId, mediaBuyerOnly)
      );
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
    if (filters.utmSource) {
      conditions.push(eq(orders.utmSource, filters.utmSource));
    }
    if (filters.utmCampaign) {
      conditions.push(eq(orders.utmCampaign, filters.utmCampaign));
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateCol = filters.dateType === 'updatedAt'
        ? orders.updatedAt
        : filters.dateType === 'pickupDate'
          ? orders.pickupDate
          : orders.createdAt;
      if (filters.dateFrom) {
        conditions.push(gte(dateCol, new Date(filters.dateFrom + 'T00:00:00')));
      }
      if (filters.dateTo) {
        conditions.push(lte(dateCol, new Date(filters.dateTo + 'T23:59:59')));
      }
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

  async deleteOrder(id: number, storeId: number): Promise<void> {
    // Verify the order belongs to this store for security
    const [order] = await db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
    if (!order) throw new Error('Order not found or access denied');
    // Delete order items first (cascade)
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    // Delete the order
    await db.delete(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
  }

  async bulkDeleteOrders(ids: number[], storeId: number): Promise<number> {
    if (ids.length === 0) return 0;
    // Verify all orders belong to this store
    const owned = await db.select({ id: orders.id }).from(orders)
      .where(and(inArray(orders.id, ids), eq(orders.storeId, storeId)));
    const ownedIds = owned.map(o => o.id);
    if (ownedIds.length === 0) return 0;
    // Delete order items for all these orders
    await db.delete(orderItems).where(inArray(orderItems.orderId, ownedIds));
    // Delete the orders
    const deleted = await db.delete(orders)
      .where(and(inArray(orders.id, ownedIds), eq(orders.storeId, storeId)))
      .returning({ id: orders.id });
    return deleted.length;
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    
    for (const item of items) {
      await db.insert(orderItems).values({ ...item, orderId: newOrder.id });
    }
    
    return newOrder;
  }

  // Return statuses that restore stock when transitioning FROM delivered
  private readonly RETURN_STATUSES = new Set(['retourné', 'refused', 'Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)', 'Annulé']);

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      const [currentOrder] = await tx.select().from(orders).where(eq(orders.id, id));
      if (!currentOrder) return undefined;

      const prevStatus = currentOrder.status;

      const [updated] = await tx.update(orders)
        .set({ status, updatedAt: new Date() })
        .where(eq(orders.id, id))
        .returning();

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

      // ── RULE 1: First-time delivery → subtract stock ────────────────────
      // Only triggers when transitioning INTO delivered from a non-delivered status
      if (status === 'delivered' && prevStatus !== 'delivered') {
        for (const item of items) {
          if (!item.productId) continue;
          const qty = Number(item.quantity);
          await tx.update(products)
            .set({ stock: sql`GREATEST(0, ${products.stock} - ${qty})` })
            .where(eq(products.id, item.productId));
          await tx.insert(stockLogs).values({
            storeId: currentOrder.storeId!,
            productId: item.productId,
            orderId: id,
            changeAmount: -qty,
            reason: `Commande #${id} livrée`,
          });
        }
      }

      // ── RULE 2: Return/cancel from delivered → restore stock ────────────
      // Only triggers when was delivered AND now switching to a return status
      if (prevStatus === 'delivered' && this.RETURN_STATUSES.has(status)) {
        for (const item of items) {
          if (!item.productId) continue;
          const qty = Number(item.quantity);
          await tx.update(products)
            .set({ stock: sql`${products.stock} + ${qty}` })
            .where(eq(products.id, item.productId));
          await tx.insert(stockLogs).values({
            storeId: currentOrder.storeId!,
            productId: item.productId,
            orderId: id,
            changeAmount: qty,
            reason: `Retour commande #${id} → ${status}`,
          });
        }
      }

      return updated;
    });
  }

  async getStockLogs(storeId: number, productId?: number): Promise<StockLog[]> {
    const conds: any[] = [eq(stockLogs.storeId, storeId)];
    if (productId) conds.push(eq(stockLogs.productId, productId));
    return await db.select().from(stockLogs).where(and(...conds)).orderBy(desc(stockLogs.createdAt));
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
    const [updated] = await db.update(orders).set({ ...data, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
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

      // sortie = only delivered quantities (stock deducted on delivery, not on confirme)
      const sortie = Number(deliveredItems[0]?.qty || 0);
      const totalOrdered = Number(totalOrderItems[0]?.qty || 0);
      const available = totalStock; // live stock = initial minus all deliveries plus all returns
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

  async updateUser(id: number, data: { username?: string; email?: string; phone?: string | null; paymentType?: string; paymentAmount?: number; distributionMethod?: string; isActive?: number; buyerCode?: string | null; password?: string }): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getMediaBuyerByCode(storeId: number, code: string): Promise<User | undefined> {
    const [buyer] = await db.select().from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'media_buyer'), eq(users.buyerCode, code)));
    return buyer;
  }

  async getMediaBuyerStats(storeId: number, mediaBuyerId: number, platform?: string, dateFrom?: string, dateTo?: string, city?: string, product?: string, campaign?: string): Promise<any> {
    // Get buyer's code for UTM fallback matching
    const [buyer] = await db.select({ buyerCode: users.buyerCode }).from(users).where(eq(users.id, mediaBuyerId));
    const buyerCode = buyer?.buyerCode;

    // Fetch by mediaBuyerId OR by UTM source pattern (CODE*%) for backward compatibility
    let allOrders = await db.select().from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        buyerCode
          ? or(eq(orders.mediaBuyerId, mediaBuyerId), sql`${orders.utmSource} ILIKE ${buyerCode + '*%'}`)
          : eq(orders.mediaBuyerId, mediaBuyerId)
      ));
    if (platform && platform !== 'all') {
      allOrders = allOrders.filter(o => (o as any).trafficPlatform === platform);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      allOrders = allOrders.filter(o => o.createdAt && new Date(o.createdAt) <= to);
    }
    if (city && city !== 'all') {
      allOrders = allOrders.filter(o => (o.customerCity || '').toLowerCase() === city.toLowerCase());
    }
    if (campaign && campaign !== 'all') {
      allOrders = allOrders.filter(o => (o.utmCampaign || '').toLowerCase() === campaign.toLowerCase());
    }
    // Collect all unique campaigns before product filter (for dropdown population)
    const campaigns = [...new Set(allOrders.map(o => o.utmCampaign).filter(Boolean))].sort() as string[];
    const CONFIRMED_STATUSES = ['confirme', 'in_progress', 'expédié', 'retourné', 'delivered'];
    const DELIVERED_STATUS = 'delivered';
    const CANCELLED_STATUSES = ['refused', 'Injoignable', 'boite vocale'];
    const platforms = [...new Set(allOrders.map(o => (o as any).trafficPlatform).filter(Boolean))].sort();

    // Fetch all order items for the current order set
    const orderIds = allOrders.map(o => o.id);
    let allItems: any[] = [];
    if (orderIds.length > 0) {
      allItems = await db.select({
        orderId: orderItems.orderId,
        rawProductName: orderItems.rawProductName,
        orderStatus: orders.status,
      }).from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(inArray(orderItems.orderId, orderIds));
    }

    // Apply product filter — narrow orders to those containing the selected product
    if (product && product !== 'all' && allItems.length > 0) {
      const matchingOrderIds = new Set(
        allItems
          .filter(i => (i.rawProductName || '').toLowerCase() === product.toLowerCase())
          .map(i => i.orderId)
      );
      allOrders = allOrders.filter(o => matchingOrderIds.has(o.id));
    }

    // Compute stats over the fully-filtered order set
    const total = allOrders.length;
    const confirmed = allOrders.filter(o => CONFIRMED_STATUSES.includes(o.status)).length;
    const inProgress = allOrders.filter(o => o.status === 'in_progress').length;
    const delivered = allOrders.filter(o => o.status === DELIVERED_STATUS).length;
    const cancelled = allOrders.filter(o => CANCELLED_STATUSES.includes(o.status) || o.status.startsWith('Annulé')).length;
    const revenue = allOrders.filter(o => o.status === DELIVERED_STATUS).reduce((s, o) => s + o.totalPrice, 0);
    const confirmRate = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const dailyMap: Record<string, { total: number; confirmed: number; delivered: number }> = {};
    for (const o of allOrders) {
      if (!o.createdAt) continue;
      const d = new Date(o.createdAt);
      const day = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      if (!dailyMap[day]) dailyMap[day] = { total: 0, confirmed: 0, delivered: 0 };
      dailyMap[day].total++;
      if (CONFIRMED_STATUSES.includes(o.status)) dailyMap[day].confirmed++;
      if (o.status === DELIVERED_STATUS) dailyMap[day].delivered++;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db2, mb, yb] = b.split('/').map(Number);
        return new Date(ya, ma-1, da).getTime() - new Date(yb, mb-1, db2).getTime();
      })
      .map(([date, d]) => ({ date, ...d }));

    const cityMap: Record<string, { total: number; confirmed: number; delivered: number }> = {};
    for (const o of allOrders) {
      const c = o.customerCity || 'Inconnue';
      if (!cityMap[c]) cityMap[c] = { total: 0, confirmed: 0, delivered: 0 };
      cityMap[c].total++;
      if (CONFIRMED_STATUSES.includes(o.status)) cityMap[c].confirmed++;
      if (o.status === DELIVERED_STATUS) cityMap[c].delivered++;
    }
    const cities = Object.entries(cityMap)
      .map(([name, d]) => ({
        name,
        ...d,
        confirmRate: d.total > 0 ? Math.round((d.confirmed / d.total) * 100) : 0,
        deliveryRate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const filteredOrderIds = new Set(allOrders.map(o => o.id));
    const filteredItems = allItems.filter(i => filteredOrderIds.has(i.orderId));
    const productMap: Record<string, { total: number; confirmed: number; inProgress: number; delivered: number }> = {};
    for (const item of filteredItems) {
      const name = item.rawProductName || 'Inconnu';
      if (!productMap[name]) productMap[name] = { total: 0, confirmed: 0, inProgress: 0, delivered: 0 };
      productMap[name].total++;
      if (CONFIRMED_STATUSES.includes(item.orderStatus)) productMap[name].confirmed++;
      if (item.orderStatus === 'in_progress') productMap[name].inProgress++;
      if (item.orderStatus === DELIVERED_STATUS) productMap[name].delivered++;
    }
    const products = Object.entries(productMap)
      .map(([name, d]) => ({
        name,
        ...d,
        confirmRate: d.total > 0 ? Math.round((d.confirmed / d.total) * 100) : 0,
        deliveryRate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { total, confirmed, inProgress, delivered, cancelled, revenue, confirmRate, deliveryRate, platforms, daily, products, cities, campaigns };
  }

  async getMediaBuyersSummary(storeId: number): Promise<any[]> {
    const buyers = await db.select().from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'media_buyer')));
    const result = await Promise.all(buyers.map(async (buyer) => {
      const stats = await this.getMediaBuyerStats(storeId, buyer.id);
      // Use UTM fallback so orders attributed only by UTM string are included
      const buyerCode = buyer.buyerCode;
      const buyerOrders = await db.select().from(orders)
        .where(and(
          eq(orders.storeId, storeId),
          buyerCode
            ? or(eq(orders.mediaBuyerId, buyer.id), sql`${orders.utmSource} ILIKE ${buyerCode + '*%'}`)
            : eq(orders.mediaBuyerId, buyer.id)
        ));
      const CONF_STATUSES = ['confirme', 'in_progress', 'expédié', 'retourné', 'delivered'];
      const platformMap: Record<string, { total: number; confirmed: number; delivered: number; revenue: number }> = {};
      for (const o of buyerOrders) {
        const plt = (o as any).trafficPlatform || 'Organique';
        if (!platformMap[plt]) platformMap[plt] = { total: 0, confirmed: 0, delivered: 0, revenue: 0 };
        platformMap[plt].total++;
        if (CONF_STATUSES.includes(o.status)) platformMap[plt].confirmed++;
        if (o.status === 'delivered') { platformMap[plt].delivered++; platformMap[plt].revenue += o.totalPrice; }
      }
      const platformBreakdown = Object.entries(platformMap).map(([platform, s]) => ({
        platform,
        ...s,
        confirmRate: s.total > 0 ? Math.round((s.confirmed / s.total) * 100) : 0,
      }));
      return { id: buyer.id, username: buyer.username, email: buyer.email, buyerCode: buyer.buyerCode, ...stats, platformBreakdown };
    }));
    return result;
  }

  async getOrdersByMediaBuyer(storeId: number, mediaBuyerId: number): Promise<any[]> {
    const [buyer] = await db.select({ buyerCode: users.buyerCode }).from(users).where(eq(users.id, mediaBuyerId));
    const buyerCode = buyer?.buyerCode;
    return await db.select().from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        buyerCode
          ? or(eq(orders.mediaBuyerId, mediaBuyerId), sql`${orders.utmSource} ILIKE ${buyerCode + '*%'}`)
          : eq(orders.mediaBuyerId, mediaBuyerId)
      ))
      .orderBy(desc(orders.createdAt));
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

  async syncCustomerOnDelivery(storeId: number, order: { customerName: string; customerPhone: string; customerAddress?: string | null; customerCity?: string | null; totalPrice: number }): Promise<void> {
    if (!order.customerPhone) return;
    const customer = await this.getOrCreateCustomer(
      storeId,
      order.customerName,
      order.customerPhone,
      order.customerAddress,
      order.customerCity
    );
    await this.updateCustomerStats(customer.id, order.totalPrice);
  }

  async migrateCustomersFromDeliveredOrders(storeId: number): Promise<number> {
    await db.delete(customers).where(eq(customers.storeId, storeId));
    const deliveredOrders = await db.select().from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.status, 'delivered')));
    for (const order of deliveredOrders) {
      if (!order.customerPhone) continue;
      const customer = await this.getOrCreateCustomer(
        storeId,
        order.customerName,
        order.customerPhone,
        order.customerAddress,
        order.customerCity
      );
      await this.updateCustomerStats(customer.id, order.totalPrice ?? 0);
    }
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(customers).where(eq(customers.storeId, storeId));
    return Number(result?.count ?? 0);
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
    const sub = await this.getSubscription(storeId);
    if (sub && sub.plan === 'trial' && sub.currentMonthOrders >= 60) {
      await db.update(subscriptions).set({ isBlocked: 1 }).where(eq(subscriptions.storeId, storeId));
    }
  }

  async resetMonthlyOrders(storeId: number): Promise<void> {
    await db.update(subscriptions).set({
      currentMonthOrders: 0,
      billingCycleStart: new Date(),
      isBlocked: 0,
    }).where(eq(subscriptions.storeId, storeId));
  }

  async checkOrderLimit(storeId: number): Promise<{ allowed: boolean; current: number; limit: number; plan: string; isBlocked: boolean }> {
    const sub = await this.getSubscription(storeId);
    if (!sub) {
      return { allowed: true, current: 0, limit: 60, plan: 'trial', isBlocked: false };
    }

    const isTrial = sub.plan === 'trial';
    const trialLimit = 60;
    const effectiveLimit = isTrial ? trialLimit : sub.monthlyLimit;

    const now = new Date();
    const cycleStart = sub.billingCycleStart || sub.createdAt || now;
    const monthsSinceCycle = (now.getFullYear() - cycleStart.getFullYear()) * 12 + (now.getMonth() - cycleStart.getMonth());

    if (!isTrial && monthsSinceCycle >= 1) {
      await this.resetMonthlyOrders(storeId);
      return { allowed: true, current: 0, limit: effectiveLimit, plan: sub.plan, isBlocked: false };
    }

    const isBlocked = sub.isBlocked === 1;
    if (isBlocked) {
      return { allowed: false, current: sub.currentMonthOrders, limit: effectiveLimit, plan: sub.plan, isBlocked: true };
    }

    const allowed = sub.plan === 'pro' || sub.currentMonthOrders < effectiveLimit;
    return { allowed, current: sub.currentMonthOrders, limit: effectiveLimit, plan: sub.plan, isBlocked: false };
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

  async getAllStores(): Promise<any[]> {
    // Optimized: 5 bulk queries instead of N×4 (safe at 1000+ stores)
    const allStores = await db.select().from(stores).orderBy(desc(stores.createdAt));
    if (allStores.length === 0) return [];

    const storeIds = allStores.map(s => s.id);

    // 1. All owners (role='owner') for these stores
    const allOwners = await db.select({
      storeId: users.storeId, id: users.id, email: users.email,
      phone: users.phone, createdAt: users.createdAt, username: users.username,
    }).from(users).where(and(
      sql`${users.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
      eq(users.role, 'owner'),
    ));
    const ownerMap = new Map(allOwners.map(u => [u.storeId!, u]));

    // 2. All subscriptions
    const allSubs = await db.select().from(subscriptions).where(
      sql`${subscriptions.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    );
    const subMap = new Map(allSubs.map(s => [s.storeId, s]));

    // 3. Team counts per store
    const teamCounts = await db.select({
      storeId: users.storeId, cnt: count(),
    }).from(users).where(
      sql`${users.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    ).groupBy(users.storeId);
    const teamCountMap = new Map(teamCounts.map(r => [r.storeId!, Number(r.cnt)]));

    // 4. Order counts per store
    const orderCounts = await db.select({
      storeId: orders.storeId, cnt: count(),
    }).from(orders).where(
      sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    ).groupBy(orders.storeId);
    const orderCountMap = new Map(orderCounts.map(r => [r.storeId, Number(r.cnt)]));

    // 5. Net profit per store (delivered orders only, simplified formula)
    const profitRows = await db.select({
      storeId: orders.storeId,
      revenue: sql<number>`COALESCE(SUM(${orders.totalPrice}), 0)`,
      costs: sql<number>`COALESCE(SUM(${orders.productCost}), 0) + COALESCE(SUM(${orders.shippingCost}), 0)`,
    }).from(orders).where(
      and(
        sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
        eq(orders.status, 'delivered'),
      )
    ).groupBy(orders.storeId);
    const profitMap = new Map(profitRows.map(r => [
      r.storeId,
      Number(r.revenue) - Number(r.costs),
    ]));

    return allStores.map(store => {
      const owner = ownerMap.get(store.id);
      const sub = subMap.get(store.id) ?? null;
      return {
        ...store,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.username ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCreatedAt: owner?.createdAt ?? null,
        ownerId: owner?.id ?? null,
        teamCount: teamCountMap.get(store.id) ?? 0,
        totalOrders: orderCountMap.get(store.id) ?? 0,
        totalNetProfit: profitMap.get(store.id) ?? 0,
        subscription: sub,
      };
    });
  }

  async getGlobalStats(): Promise<{ totalStores: number; activeStores: number; totalRevenue: number; mrr: number; totalOrders: number; expiringCount: number }> {
    const [storeCount] = await db.select({ count: count() }).from(stores);
    const allSubs = await db.select().from(subscriptions).where(eq(subscriptions.isActive, 1));
    const mrr = allSubs.reduce((sum, s) => sum + s.pricePerMonth, 0);
    const [orderCount] = await db.select({ count: count() }).from(orders);
    const now = new Date();
    const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const expiringCount = allSubs.filter(s => {
      if (!s.planExpiryDate) return false;
      const exp = new Date(s.planExpiryDate);
      return exp >= now && exp <= in5Days;
    }).length;
    return {
      totalStores: Number(storeCount.count),
      activeStores: allSubs.length,
      totalRevenue: mrr,
      mrr,
      totalOrders: Number(orderCount?.count ?? 0),
      expiringCount,
    };
  }

  async toggleStoreActive(storeId: number, isActive: number): Promise<void> {
    await db.update(users).set({ isActive }).where(eq(users.storeId, storeId));
    const sub = await this.getSubscription(storeId);
    if (sub) {
      await db.update(subscriptions).set({ isActive }).where(eq(subscriptions.storeId, storeId));
    }
  }

  async changePlan(storeId: number, plan: string, monthlyLimit: number, pricePerMonth: number, planStartDate?: Date | null, planExpiryDate?: Date | null): Promise<void> {
    const sub = await this.getSubscription(storeId);
    const updateData: Record<string, any> = { plan, monthlyLimit, pricePerMonth, isBlocked: 0 };
    if (planStartDate !== undefined) updateData.planStartDate = planStartDate;
    if (planExpiryDate !== undefined) updateData.planExpiryDate = planExpiryDate;
    if (sub) {
      await db.update(subscriptions).set(updateData).where(eq(subscriptions.storeId, storeId));
    } else {
      await db.insert(subscriptions).values({ storeId, plan, monthlyLimit, pricePerMonth, isActive: 1, currentMonthOrders: 0, isBlocked: 0, planStartDate: planStartDate ?? null, planExpiryDate: planExpiryDate ?? null });
    }
  }

  async resetMonthlyOrders(storeId: number): Promise<void> {
    await db.update(subscriptions).set({ currentMonthOrders: 0, billingCycleStart: new Date(), isBlocked: 0 }).where(eq(subscriptions.storeId, storeId));
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

  async upsertStoreAgentSetting(agentId: number, storeId: number, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string; commissionRate?: number }): Promise<StoreAgentSetting> {
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

  async addOrderItem(data: { orderId: number; productId?: number | null; rawProductName?: string; sku?: string; variantInfo?: string; quantity: number; price: number }): Promise<OrderItem> {
    const [item] = await db.insert(orderItems).values({
      orderId: data.orderId,
      productId: data.productId ?? null,
      rawProductName: data.rawProductName ?? null,
      sku: data.sku ?? null,
      variantInfo: data.variantInfo ?? null,
      quantity: data.quantity,
      price: data.price,
    } as any).returning();
    return item;
  }

  async updateOrderItem(id: number, data: { quantity?: number; price?: number; rawProductName?: string; sku?: string; variantInfo?: string }): Promise<OrderItem | undefined> {
    const [item] = await db.update(orderItems).set(data as any).where(eq(orderItems.id, id)).returning();
    return item;
  }

  async deleteOrderItem(id: number): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.id, id));
  }

  async getAgentPermissions(agentId: number): Promise<Record<string, boolean>> {
    const [user] = await db.select().from(users).where(eq(users.id, agentId));
    const defaults: Record<string, boolean> = {
      show_store_orders: false,
      show_revenue: false,
      show_profit: false,
      show_charts: false,
      show_top_products: false,
      show_inventory: false,
      show_all_orders: false,
    };
    if (!user) return defaults;
    const stored = user.dashboardPermissions as Record<string, boolean> | null;
    return stored ? { ...defaults, ...stored } : defaults;
  }

  async updateAgentPermissions(agentId: number, permissions: Record<string, boolean>): Promise<void> {
    await db.update(users).set({ dashboardPermissions: permissions }).where(eq(users.id, agentId));
  }

  async getAgentWallet(agentId: number, storeId: number): Promise<{ totalEarned: number; deliveredThisMonth: number; deliveredTotal: number; commissionRate: number }> {
    const setting = await this.getAgentStoreSetting(agentId, storeId);
    const rate = Number(setting?.commissionRate ?? 0);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalRow] = await db.select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.assignedToId, agentId), eq(orders.storeId, storeId), eq(orders.status, 'delivered')));
    const [monthRow] = await db.select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.assignedToId, agentId), eq(orders.storeId, storeId), eq(orders.status, 'delivered'), gte(orders.createdAt, startOfMonth)));
    const deliveredTotal = Number(totalRow?.count ?? 0);
    const deliveredThisMonth = Number(monthRow?.count ?? 0);
    return { totalEarned: Number(deliveredTotal) * Number(rate), deliveredThisMonth, deliveredTotal, commissionRate: rate };
  }

  async getCommissionsSummary(storeId: number): Promise<{ agentId: number; agentName: string; commissionRate: number; deliveredTotal: number; totalOwed: number }[]> {
    const agents = await db.select().from(users).where(and(eq(users.storeId, storeId), eq(users.role, 'agent')));
    const result = [];
    for (const agent of agents) {
      const setting = await this.getAgentStoreSetting(agent.id, storeId);
      const rate = Number(setting?.commissionRate ?? 0);
      const [row] = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(eq(orders.assignedToId, agent.id), eq(orders.storeId, storeId), eq(orders.status, 'delivered')));
      const deliveredTotal = Number(row?.count ?? 0);
      result.push({ agentId: agent.id, agentName: agent.username, commissionRate: rate, deliveredTotal, totalOwed: Number(deliveredTotal) * Number(rate) });
    }
    return result;
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

  async createAdSpendEntry(data: InsertAdSpendNew & { userId?: number | null }): Promise<AdSpendNewEntry> {
    const [created] = await db.insert(adSpend).values(data as any).returning();
    return created;
  }

  async getAdSpendEntries(storeId: number, opts?: { productId?: number | null; source?: string; dateFrom?: string; dateTo?: string; userId?: number | null; allUsers?: boolean }): Promise<(AdSpendNewEntry & { productName?: string; userName?: string })[]> {
    const conditions: any[] = [eq(adSpend.storeId, storeId)];
    if (opts?.source && opts.source !== 'all') conditions.push(eq(adSpend.source, opts.source));
    if (opts?.dateFrom) conditions.push(sql`${adSpend.date} >= ${opts.dateFrom}`);
    if (opts?.dateTo) conditions.push(sql`${adSpend.date} <= ${opts.dateTo}`);
    if (opts?.productId !== undefined) {
      if (opts.productId === null) conditions.push(sql`${adSpend.productId} IS NULL`);
      else conditions.push(eq(adSpend.productId, opts.productId));
    }
    // userId filter: if provided (non-null non-zero), restrict to that user's entries
    if (opts?.userId !== undefined && opts?.userId !== null && !opts?.allUsers) {
      conditions.push(eq(adSpend.userId as any, opts.userId));
    }
    const rows = await db.select({
      id: adSpend.id, storeId: adSpend.storeId, userId: (adSpend as any).userId,
      productId: adSpend.productId,
      source: adSpend.source, date: adSpend.date, amount: adSpend.amount,
      productSellingPrice: adSpend.productSellingPrice, createdAt: adSpend.createdAt,
      productName: products.name,
      userName: users.username,
    }).from(adSpend)
      .leftJoin(products, eq(adSpend.productId, products.id))
      .leftJoin(users, eq((adSpend as any).userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(adSpend.date));
    return rows as any[];
  }

  async deleteAdSpendNew(id: number, storeId: number, userId?: number): Promise<void> {
    // If userId is provided, only delete if ownership matches (for media buyers)
    if (userId !== undefined) {
      await db.delete(adSpend).where(and(eq(adSpend.id, id), eq(adSpend.storeId, storeId), eq((adSpend as any).userId, userId)));
    } else {
      await db.delete(adSpend).where(and(eq(adSpend.id, id), eq(adSpend.storeId, storeId)));
    }
  }

  async getAdSpendNewTotal(storeId: number, dateFrom?: string, dateTo?: string): Promise<number> {
    const conditions: any[] = [eq(adSpend.storeId, storeId)];
    if (dateFrom) conditions.push(sql`${adSpend.date} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${adSpend.date} <= ${dateTo}`);
    const rows = await db.select({ total: sql<number>`COALESCE(SUM(${adSpend.amount}), 0)` })
      .from(adSpend).where(and(...conditions));
    return Number(rows[0]?.total ?? 0);
  }

  async getMediaBuyerAdSpend(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string): Promise<AdSpendEntry[]> {
    const conditions = [
      eq(adSpendTracking.storeId, storeId),
      eq(adSpendTracking.mediaBuyerId, mediaBuyerId),
    ];
    if (dateFrom) conditions.push(sql`${adSpendTracking.date} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${adSpendTracking.date} <= ${dateTo}`);
    return await db.select().from(adSpendTracking)
      .where(and(...conditions))
      .orderBy(desc(adSpendTracking.date));
  }

  async upsertMediaBuyerAdSpend(entry: InsertAdSpend & { mediaBuyerId: number }): Promise<AdSpendEntry> {
    const existing = await db.select().from(adSpendTracking)
      .where(and(
        eq(adSpendTracking.storeId, entry.storeId),
        eq(adSpendTracking.mediaBuyerId, entry.mediaBuyerId),
        eq(adSpendTracking.date, entry.date),
        entry.productId ? eq(adSpendTracking.productId, entry.productId) : sql`${adSpendTracking.productId} IS NULL`,
        entry.source ? eq(adSpendTracking.source, entry.source) : sql`${adSpendTracking.source} IS NULL`
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(adSpendTracking)
        .set({ amount: entry.amount, notes: entry.notes ?? null, source: entry.source ?? null })
        .where(eq(adSpendTracking.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(adSpendTracking).values(entry).returning();
    return created;
  }

  async deleteAdSpendEntry(id: number, storeId: number): Promise<void> {
    await db.delete(adSpendTracking)
      .where(and(eq(adSpendTracking.id, id), eq(adSpendTracking.storeId, storeId)));
  }

  async getAdminAdSpendList(storeId: number, dateFrom?: string, dateTo?: string): Promise<any[]> {
    const conditions: any[] = [eq(adSpendTracking.storeId, storeId)];
    if (dateFrom) conditions.push(sql`${adSpendTracking.date} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${adSpendTracking.date} <= ${dateTo}`);
    const entries = await db.select().from(adSpendTracking)
      .where(and(...conditions))
      .orderBy(desc(adSpendTracking.date));
    const allUsers = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.storeId, storeId));
    const userMap = new Map(allUsers.map(u => [u.id, u.username]));
    const allProducts = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.storeId, storeId));
    const productMap = new Map(allProducts.map(p => [p.id, p.name]));
    return entries.map(e => ({
      ...e,
      buyerName: e.mediaBuyerId ? (userMap.get(e.mediaBuyerId) ?? `User ${e.mediaBuyerId}`) : 'Inconnu',
      productName: e.productId ? (productMap.get(e.productId) ?? `Produit ${e.productId}`) : null,
    }));
  }

  // COGS helper: computes buying cost from order_items × products.cost_price.
  // Falls back to orders.product_cost when no items are linked to a product.
  async computeOrdersCOGS(orderList: { id: number; productCost: number }[]): Promise<Map<number, number>> {
    if (orderList.length === 0) return new Map();
    const orderIds = orderList.map(o => o.id);
    const rows = await db
      .select({
        orderId: orderItems.orderId,
        cogs: sql<number>`COALESCE(SUM(${products.costPrice} * ${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds))
      .groupBy(orderItems.orderId);
    const fromItems = new Map(rows.map(r => [r.orderId!, Number(r.cogs)]));
    // For orders with no items linked to a product, fall back to the cached product_cost
    const result = new Map<number, number>();
    for (const o of orderList) {
      const itemCogs = fromItems.get(o.id) ?? 0;
      result.set(o.id, itemCogs > 0 ? itemCogs : (o.productCost ?? 0));
    }
    return result;
  }

  async getAdminProfitSummary(
    storeId: number,
    dateFrom?: string,
    dateTo?: string,
    productId?: number,
    mediaBuyerIdFilter?: number,
  ): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number;
    byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
    byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
    ordersCount: number;
  }> {
    const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const storePackaging = store[0]?.packagingCost ?? 0;

    // --- Delivered orders (COD: only status='delivered' counts) ---
    const orderConds: any[] = [eq(orders.storeId, storeId), eq(orders.status, 'delivered')];
    if (dateFrom) orderConds.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) orderConds.push(sql`${orders.createdAt} <= ${dateTo}::timestamp`);
    if (mediaBuyerIdFilter) orderConds.push(eq(orders.mediaBuyerId, mediaBuyerIdFilter));
    let deliveredOrders = await db.select().from(orders).where(and(...orderConds));

    // Product filter: keep only orders that have an item for the given product
    if (productId) {
      const matchingItems = await db
        .select({ orderId: orderItems.orderId })
        .from(orderItems)
        .where(eq(orderItems.productId, productId));
      const matchingOrderIds = new Set(matchingItems.map(i => i.orderId));
      deliveredOrders = deliveredOrders.filter(o => matchingOrderIds.has(o.id));
    }

    // --- COGS: use order_items × products.cost_price (ground truth), fallback to orders.product_cost ---
    const cogsMap = await this.computeOrdersCOGS(deliveredOrders.map(o => ({ id: o.id, productCost: o.productCost })));

    // --- Revenue & order costs (delivered only) --- strict Number() to prevent concatenation ---
    let revenue = 0, productCost = 0, shippingCost = 0, packagingCostTotal = 0;
    for (const o of deliveredOrders) {
      revenue += Number(o.totalPrice ?? 0);
      productCost += Number(cogsMap.get(o.id) ?? 0);
      shippingCost += Number(o.shippingCost ?? 0);
      packagingCostTotal += Number(storePackaging);
    }

    // --- Agent commissions (delivered orders only) ---
    const agentSettingsAll = await db.select().from(storeAgentSettings).where(eq(storeAgentSettings.storeId, storeId));
    const agentUsersAll = await db.select().from(users).where(eq(users.storeId, storeId));
    const agentMap = new Map<number, { commissionRate: number; name: string }>();
    for (const s of agentSettingsAll) {
      const u = agentUsersAll.find(u => u.id === s.agentId);
      agentMap.set(s.agentId, { commissionRate: Number(s.commissionRate ?? 0), name: u?.username ?? `Agent ${s.agentId}` });
    }
    let agentCommissions = 0;
    const agentCounts = new Map<number, number>();
    for (const o of deliveredOrders) {
      if (o.assignedToId) {
        const rate = Number(agentMap.get(o.assignedToId)?.commissionRate ?? 0);
        agentCommissions += rate * 100; // DH → cents
        agentCounts.set(o.assignedToId, (agentCounts.get(o.assignedToId) ?? 0) + 1);
      }
    }

    // --- Ad Spend: filter by productId when a product filter is active (product-specific ad spend isolation) ---
    // Legacy adSpendTracking table
    const legacyConds: any[] = [eq(adSpendTracking.storeId, storeId)];
    if (dateFrom) legacyConds.push(sql`${adSpendTracking.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) legacyConds.push(sql`${adSpendTracking.date} <= ${dateTo.substring(0, 10)}`);
    if (mediaBuyerIdFilter) legacyConds.push(eq(adSpendTracking.mediaBuyerId, mediaBuyerIdFilter));
    // When a product is selected, only include legacy ad spend explicitly tagged for that product
    if (productId) legacyConds.push(eq(adSpendTracking.productId, productId));
    const legacyAdSpend = await db.select({ amount: adSpendTracking.amount, mediaBuyerId: adSpendTracking.mediaBuyerId }).from(adSpendTracking).where(and(...legacyConds));
    // Legacy adSpendTracking amounts are stored in DH → multiply by 100 to convert to centimes
    const legacyTotal = legacyAdSpend.reduce((s, e) => s + Math.round(Number(e.amount ?? 0) * 100), 0);

    // New adSpend (Publicités) table
    const newAdConds: any[] = [eq(adSpend.storeId, storeId)];
    if (dateFrom) newAdConds.push(sql`${adSpend.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) newAdConds.push(sql`${adSpend.date} <= ${dateTo.substring(0, 10)}`);
    if (mediaBuyerIdFilter) newAdConds.push(eq((adSpend as any).userId, mediaBuyerIdFilter));
    // When a product is selected, only include ad spend entries for that product
    if (productId) newAdConds.push(eq(adSpend.productId, productId));
    const newAdEntries = await db.select({ amount: adSpend.amount, mediaBuyerId: (adSpend as any).userId }).from(adSpend).where(and(...newAdConds));
    const newAdTotal = newAdEntries.reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const totalAdSpend = legacyTotal + newAdTotal;

    // --- Final net profit (COD formula) ---
    const netProfit = revenue - productCost - shippingCost - packagingCostTotal - agentCommissions - totalAdSpend;

    // --- byBuyer breakdown — 3-tier attribution so admin fallback orders appear ---
    // Build attribution map for delivered orders only
    const ownerForByBuyer = agentUsersAll.find(u => u.role === 'owner') ?? agentUsersAll.find(u => u.role === 'admin') ?? null;
    const byBuyerAttrMap = this.buildAttributionMap(deliveredOrders, agentUsersAll, ownerForByBuyer?.id ?? null);

    const buyerOrderMap = new Map<number, { revenue: number; orderProfit: number; name: string }>();
    for (const o of deliveredOrders) {
      const attributedId = byBuyerAttrMap.get(o.id);
      if (attributedId === undefined) continue;
      const u = agentUsersAll.find(u => u.id === attributedId);
      const existing = buyerOrderMap.get(attributedId) ?? { revenue: 0, orderProfit: 0, name: u?.username ?? `User ${attributedId}` };
      const agentComm = o.assignedToId ? Number(agentMap.get(o.assignedToId)?.commissionRate ?? 0) * 100 : 0;
      const realCogs = Number(cogsMap.get(o.id) ?? 0);
      existing.revenue += Number(o.totalPrice ?? 0);
      existing.orderProfit += Number(o.totalPrice ?? 0) - realCogs - Number(o.shippingCost ?? 0) - Number(storePackaging) - agentComm;
      buyerOrderMap.set(attributedId, existing);
    }
    const buyerAdSpendMap = new Map<number, number>();
    for (const e of legacyAdSpend as any[]) {
      // Legacy amounts in DH → centimes
      if (e.mediaBuyerId) buyerAdSpendMap.set(e.mediaBuyerId, Number(buyerAdSpendMap.get(e.mediaBuyerId) ?? 0) + Math.round(Number(e.amount ?? 0) * 100));
    }
    for (const e of newAdEntries) {
      // New table amounts already in centimes
      if (e.mediaBuyerId) buyerAdSpendMap.set(e.mediaBuyerId, Number(buyerAdSpendMap.get(e.mediaBuyerId) ?? 0) + Number(e.amount ?? 0));
    }
    const allBuyerIds = new Set(Array.from(buyerOrderMap.keys()).concat(Array.from(buyerAdSpendMap.keys())));
    const byBuyer = Array.from(allBuyerIds).map(bid => {
      const bo = buyerOrderMap.get(bid);
      const bSpend = Number(buyerAdSpendMap.get(bid) ?? 0);
      const bRevenue = Number(bo?.revenue ?? 0);
      const bOrderProfit = Number(bo?.orderProfit ?? 0);
      const u = agentUsersAll.find(u => u.id === bid);
      return { buyerId: bid, buyerName: u?.username ?? bo?.name ?? `User ${bid}`, adSpend: bSpend, revenue: bRevenue, netProfit: bOrderProfit - bSpend };
    });

    const byAgent = Array.from(agentCounts.entries()).map(([agentId, count]) => {
      const info = agentMap.get(agentId);
      const rate = Number(info?.commissionRate ?? 0);
      return { agentId, agentName: info?.name ?? `Agent ${agentId}`, commissionRate: rate, deliveredCount: count, totalCommission: Number(count) * rate };
    });

    return { revenue, productCost, shippingCost, packagingCost: packagingCostTotal, agentCommissions, adSpend: totalAdSpend, netProfit, byBuyer, byAgent, ordersCount: deliveredOrders.length };
  }

  async getMediaBuyerProfit(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads: number;
  }> {
    const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const storePackaging = Number(store[0]?.packagingCost ?? 0);

    // All leads (total orders attributed to this buyer)
    const allLeadConditions: any[] = [eq(orders.storeId, storeId), eq(orders.mediaBuyerId, mediaBuyerId)];
    if (dateFrom) allLeadConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) allLeadConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp + interval '1 day' - interval '1 second'`);
    const allLeads = await db.select({ id: orders.id }).from(orders).where(and(...allLeadConditions));

    // Delivered orders only — strict filter
    const orderConditions: any[] = [eq(orders.storeId, storeId), eq(orders.status, 'delivered'), eq(orders.mediaBuyerId, mediaBuyerId)];
    if (dateFrom) orderConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) orderConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp + interval '1 day' - interval '1 second'`);
    const buyerOrders = await db.select().from(orders).where(and(...orderConditions));

    // Agent commission rates lookup
    const agentSettingsAll = await db.select().from(storeAgentSettings).where(eq(storeAgentSettings.storeId, storeId));
    const agentRateMap = new Map(agentSettingsAll.map(s => [s.agentId, Number(s.commissionRate ?? 0)]));

    // COGS via SQL JOIN (order_items × products.cost_price, fallback to orders.product_cost)
    const buyerCogsMap = await this.computeOrdersCOGS(buyerOrders.map(o => ({ id: o.id, productCost: Number(o.productCost ?? 0) })));

    // All financial aggregations use Number() and COALESCE to prevent string concat
    let revenue = 0, productCost = 0, shippingCost = 0, agentCommissions = 0;
    for (const o of buyerOrders) {
      revenue       += Number(o.totalPrice ?? 0);
      productCost   += Number(buyerCogsMap.get(o.id) ?? 0);
      shippingCost  += Number(o.shippingCost ?? 0);
      if (o.assignedToId) {
        // commissionRate stored in DH → multiply by 100 to get centimes
        agentCommissions += Math.round(Number(agentRateMap.get(o.assignedToId) ?? 0) * 100);
      }
    }
    const packagingCostTotal = buyerOrders.length * storePackaging;

    // Legacy adSpendTracking (by mediaBuyerId) — amounts stored in DH → multiply by 100
    const adSpendConditions: any[] = [eq(adSpendTracking.storeId, storeId), eq(adSpendTracking.mediaBuyerId, mediaBuyerId)];
    if (dateFrom) adSpendConditions.push(sql`${adSpendTracking.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) adSpendConditions.push(sql`${adSpendTracking.date} <= ${dateTo.substring(0, 10)}`);
    const legacyEntries = await db.select({ amount: adSpendTracking.amount }).from(adSpendTracking).where(and(...adSpendConditions));
    const legacyAdSpend = legacyEntries.reduce((s, e) => s + Math.round(Number(e.amount ?? 0) * 100), 0);

    // New adSpend table (by userId = mediaBuyerId) — amounts already in centimes
    const newAdSpendConditions: any[] = [eq(adSpend.storeId, storeId), eq((adSpend as any).userId, mediaBuyerId)];
    if (dateFrom) newAdSpendConditions.push(sql`${adSpend.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) newAdSpendConditions.push(sql`${adSpend.date} <= ${dateTo.substring(0, 10)}`);
    const newEntries = await db.select({ amount: adSpend.amount }).from(adSpend).where(and(...newAdSpendConditions));
    const newAdSpendTotal = newEntries.reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const totalAdSpend = legacyAdSpend + newAdSpendTotal;
    // COD Net Profit Formula: Revenue - Sourcing - Shipping - Packaging - AgentCommissions - AdSpend
    const netProfit = revenue - productCost - shippingCost - packagingCostTotal - agentCommissions - totalAdSpend;
    const roi = totalAdSpend > 0 ? (netProfit / totalAdSpend) * 100 : 0;

    return { revenue, productCost, shippingCost, packagingCost: packagingCostTotal, agentCommissions, adSpend: totalAdSpend, netProfit, roi, deliveredCount: buyerOrders.length, totalLeads: allLeads.length };
  }

  // ─── 3-Tier Attribution Engine ────────────────────────────────────────
  // Priority: mediaBuyerId → UTM buyerCode match → owner/admin fallback
  private buildAttributionMap(
    allOrders: any[],
    allUsers: any[],
    fallbackUserId: number | null,
  ): Map<number, number> {
    // Build buyerCode → userId lookup (media buyers only)
    const codeToUser = new Map<string, number>();
    for (const u of allUsers) {
      if (u.buyerCode) codeToUser.set(u.buyerCode.toLowerCase().trim(), u.id);
    }

    const map = new Map<number, number>();
    for (const o of allOrders) {
      // Tier 1: explicit media_buyer_id
      if (o.mediaBuyerId) { map.set(o.id, o.mediaBuyerId); continue; }

      // Tier 2: UTM source starts with a buyer code (format: "CODE*Platform" or "CODE")
      if (o.utmSource) {
        const utmLower = (o.utmSource as string).toLowerCase().trim();
        let matched = false;
        for (const [code, uid] of codeToUser) {
          if (utmLower === code || utmLower.startsWith(code + '*') || utmLower.startsWith(code + '-')) {
            map.set(o.id, uid);
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }

      // Tier 3: fallback to owner/admin
      if (fallbackUserId !== null) map.set(o.id, fallbackUserId);
    }
    return map;
  }

  // Normalize status: treat 'delivered' (and French variants) all as delivered
  private isDeliveredStatus(status: string): boolean {
    const s = (status ?? '').toLowerCase().trim();
    return s === 'delivered' || s === 'livré' || s === 'livre' || s === 'livrée' || s === 'livree';
  }

  async getTeamProfitSummary(storeId: number, dateFrom?: string, dateTo?: string): Promise<{
    rows: {
      userId: number; userName: string; role: string;
      totalLeads: number; deliveredCount: number;
      revenue: number; productCost: number; shippingCost: number; packagingCost: number;
      agentCommissions: number; adSpend: number; totalCosts: number; netProfit: number;
    }[];
  }> {
    const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const storePackaging = Number(store[0]?.packagingCost ?? 0);

    const allUsers = await db.select().from(users).where(and(eq(users.storeId, storeId), sql`${users.role} IN ('owner','admin','media_buyer')`));
    const agentSettingsAll = await db.select().from(storeAgentSettings).where(eq(storeAgentSettings.storeId, storeId));

    const orderConditions: any[] = [eq(orders.storeId, storeId)];
    if (dateFrom) orderConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) orderConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp`);
    const allOrders = await db.select().from(orders).where(and(...orderConditions));

    // Real COGS: order_items × products.cost_price (fallback: orders.product_cost)
    const allDelivered = allOrders.filter(o => this.isDeliveredStatus(o.status));
    const teamCogsMap = await this.computeOrdersCOGS(allDelivered.map(o => ({ id: o.id, productCost: Number(o.productCost) })));

    // Ad spend tables
    const adDateConds: any[] = [eq(adSpend.storeId, storeId)];
    if (dateFrom) adDateConds.push(sql`${adSpend.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) adDateConds.push(sql`${adSpend.date} <= ${dateTo.substring(0, 10)}`);
    const allNewAdSpend = await db.select({ userId: (adSpend as any).userId, amount: adSpend.amount }).from(adSpend).where(and(...adDateConds));

    const legDateConds: any[] = [eq(adSpendTracking.storeId, storeId)];
    if (dateFrom) legDateConds.push(sql`${adSpendTracking.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) legDateConds.push(sql`${adSpendTracking.date} <= ${dateTo.substring(0, 10)}`);
    const allLegacyAdSpend = await db.select().from(adSpendTracking).where(and(...legDateConds));

    // Determine fallback user (owner first, then first admin)
    const ownerUser = allUsers.find(u => u.role === 'owner') ?? allUsers.find(u => u.role === 'admin') ?? null;
    const fallbackUserId = ownerUser?.id ?? null;

    // Build 3-tier attribution map: orderId → responsible userId
    const attributionMap = this.buildAttributionMap(allOrders, allUsers, fallbackUserId);

    const rows = allUsers.map(u => {
      const userOrders = allOrders.filter(o => attributionMap.get(o.id) === u.id);
      const deliveredOrders = userOrders.filter(o => this.isDeliveredStatus(o.status));

      let revenue = 0, productCost = 0, shippingCost = 0, agentCommissions = 0;
      for (const o of deliveredOrders) {
        revenue += Number(o.totalPrice ?? 0);
        productCost += Number(teamCogsMap.get(o.id) ?? 0);
        shippingCost += Number(o.shippingCost ?? 0);
        if (o.assignedToId) {
          const s = agentSettingsAll.find(s => s.agentId === o.assignedToId);
          agentCommissions += Number(s?.commissionRate ?? 0) * 100;
        }
      }
      const packagingCost = deliveredOrders.length * storePackaging;
      const newAdSpendTotal = allNewAdSpend.filter(e => e.userId === u.id).reduce((s, e) => s + Number(e.amount ?? 0), 0);
      // Legacy adSpend amounts in DH → multiply by 100 to convert to centimes
      const legacyAdSpendTotal = allLegacyAdSpend.filter(e => e.mediaBuyerId === u.id).reduce((s, e) => s + Math.round(Number(e.amount ?? 0) * 100), 0);
      const totalAdSpend = newAdSpendTotal + legacyAdSpendTotal;
      const totalCosts = productCost + shippingCost + packagingCost + agentCommissions + totalAdSpend;
      const netProfit = revenue - totalCosts;
      return { userId: u.id, userName: u.username, role: u.role, totalLeads: userOrders.length, deliveredCount: deliveredOrders.length, revenue, productCost, shippingCost, packagingCost, agentCommissions, adSpend: totalAdSpend, totalCosts, netProfit };
    });

    // Show rows where the user has any activity (orders or ad spend)
    return { rows: rows.filter(r => r.totalLeads > 0 || r.adSpend > 0 || r.deliveredCount > 0) };
  }
}

export const storage = new DatabaseStorage();

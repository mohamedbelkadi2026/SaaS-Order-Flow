import { db } from "./db";
import { 
  users, stores, products, productVariants, orders, orderItems, adSpendTracking, adSpend, storeIntegrations, integrationLogs,
  subscriptions, customers, agentProducts, storeAgentSettings, orderFollowUpLogs, stockLogs, stockMovements, payments, emailVerificationCodes,
  carrierAccounts, carrierCities, ameexCities, expressCoursierCities, ozonExpressCities,
  type User, type Store, type Product, type ProductVariant, type ProductWithVariants, type Order, type OrderItem, type OrderWithDetails,
  type InsertUser, type InsertStore, type InsertProduct, type InsertProductVariant, type InsertOrder, type InsertOrderItem,
  type AdSpendEntry, type InsertAdSpend, type AdSpendNewEntry, type InsertAdSpendNew,
  type CarrierAccount, type InsertCarrierAccount,
  type StoreIntegration, type InsertIntegration, type IntegrationLog, type InsertIntegrationLog,
  type Subscription, type InsertSubscription, type Customer, type InsertCustomer,
  type AgentProduct,
  type StoreAgentSetting, type InsertStoreAgentSetting,
  type OrderFollowUpLog, type InsertOrderFollowUpLog,
  type StockLog,
  type Payment, type InsertPayment,
} from "@shared/schema";
import { eq, desc, and, sql, count, ne, like, gte, lte, lt, inArray, or, isNull } from "drizzle-orm";
import { alias as aliasedTable } from "drizzle-orm/pg-core";

export interface IStorage {
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;

  /* ── Email verification ───────────────────────────────────── */
  createVerificationCode(userId: number, code: string, expiresAt: Date): Promise<void>;
  getVerificationCode(userId: number): Promise<{ code: string; expiresAt: Date } | null>;
  deleteVerificationCode(userId: number): Promise<void>;

  getUserById(id: number): Promise<User | undefined>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByStore(storeId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  getMediaBuyerByCode(storeId: number, code: string): Promise<User | undefined>;
  getMediaBuyerStats(storeId: number, mediaBuyerId: number, platform?: string): Promise<any>;
  getMediaBuyersSummary(storeId: number, dateFrom?: string, dateTo?: string): Promise<any[]>;
  getOrdersByMediaBuyer(storeId: number, mediaBuyerId: number): Promise<any[]>;
  
  getProductsByStore(storeId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  getOrCreateProductByName(storeId: number, opts: { name: string; sku?: string | null; sellingPrice?: number }): Promise<Product>;
  updateProductStock(id: number, stockDelta: number): Promise<Product | undefined>;
  
  getOrdersByStore(storeId: number, status?: string): Promise<OrderWithDetails[]>;
  getOrdersSince(storeId: number, since: Date): Promise<Order[]>;
  getOrdersByAgent(agentId: number): Promise<OrderWithDetails[]>;
  getOrdersByPhone(storeId: number, phone: string): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  getFilteredOrders(storeId: number, filters: {
    status?: string; agentId?: number; city?: string; source?: string;
    utmSource?: string; utmCampaign?: string; magasinId?: number;
    productId?: number;
    dateFrom?: string; dateTo?: string; dateType?: string; search?: string; page?: number; limit?: number;
  }, agentOnly?: number, mediaBuyerOnly?: number): Promise<{ orders: OrderWithDetails[]; total: number }>;
  bulkAssignOrders(orderIds: number[], agentId: number, storeId: number): Promise<number>;
  bulkShipOrders(orderIds: number[], storeId: number): Promise<Order[]>;
  getOrdersByIds(orderIds: number[], storeId: number): Promise<Order[]>;
  deleteOrder(id: number, storeId: number): Promise<void>;
  bulkDeleteOrders(ids: number[], storeId: number): Promise<number>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: number, status: string, actorId?: number | null): Promise<Order | undefined>;
  assignOrder(id: number, agentId: number | null): Promise<Order | undefined>;

  getAdSpend(storeId: number, date?: string): Promise<AdSpendEntry[]>;
  upsertAdSpend(entry: InsertAdSpend): Promise<AdSpendEntry>;

  getOrGenerateWebhookKey(storeId: number): Promise<string>;
  getStoreByWebhookKey(key: string): Promise<Store | undefined>;

  // ── Carrier Accounts (multi-account) ─────────────────────────────
  getCarrierAccounts(storeId: number, carrierName?: string): Promise<CarrierAccount[]>;
  getCarrierAccount(id: number): Promise<CarrierAccount | undefined>;
  createCarrierAccount(data: InsertCarrierAccount): Promise<CarrierAccount>;
  updateCarrierAccount(id: number, data: Partial<InsertCarrierAccount>): Promise<CarrierAccount | undefined>;
  deleteCarrierAccount(id: number): Promise<void>;
  getCarrierCities(storeId: number, carrierName: string): Promise<string[]>;
  upsertCarrierCities(storeId: number, carrierName: string, accountId: number | null, cities: string[]): Promise<void>;
  upsertAmeexCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void>;
  getAmeexCityId(storeId: number, cityName: string): Promise<string | null>;
  upsertExpressCoursierCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void>;
  resolveExpressCoursierCityId(storeId: number, cityName: string): Promise<string | null>;
  upsertOzonExpressCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void>;
  resolveOzonExpressCityId(storeId: number, cityName: string): Promise<string | null>;
  getAccountForShipping(storeId: number, provider: string, city?: string): Promise<{
    id?: number;
    settings?: Record<string, any>;
    apiKey: string;
    apiSecret?: string;
    apiUrl?: string;
    carrierStoreName?: string;
    digylogStoreName?: string;
    digylogNetworkId?: number;
  } | null>;

  getIntegrationsByStore(storeId: number, type?: string): Promise<StoreIntegration[]>;
  getAllActiveIntegrationsByProvider(provider: string): Promise<StoreIntegration[]>;
  getIntegration(id: number): Promise<StoreIntegration | undefined>;
  getIntegrationByProvider(storeId: number, provider: string, magasinId?: number): Promise<StoreIntegration | undefined>;
  getIntegrationByWebhookKey(webhookKey: string): Promise<StoreIntegration | undefined>;
  getIntegrationsByProvider(provider: string, storeIds: number[]): Promise<StoreIntegration[]>;
  incrementIntegrationOrdersCount(id: number): Promise<void>;
  createIntegration(data: InsertIntegration): Promise<StoreIntegration>;
  updateIntegration(id: number, data: Partial<InsertIntegration>): Promise<StoreIntegration | undefined>;
  deleteIntegration(id: number): Promise<void>;

  getIntegrationLogs(storeId: number, limit?: number): Promise<IntegrationLog[]>;
  createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog>;

  updateOrderShipping(orderId: number, trackingNumber: string, labelLink: string | null, shippingProvider: string): Promise<Order | undefined>;
  getOrderByNumber(storeId: number, orderNumber: string): Promise<Order | undefined>;
  getOrderByTrackingNumber(storeId: number, trackingNumber: string): Promise<Order | undefined>;
  getOrderByTrackingNumberAnyStore(trackingNumber: string): Promise<Order | undefined>;
  getOrderByOrderNumberAnyStore(orderNumber: string): Promise<Order | undefined>;
  getOrdersForFeeBackfill(storeId: number, provider: string): Promise<Order[]>;
  updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  archiveProduct(id: number): Promise<void>;
  getProductUsage(storeId: number, productId: number): Promise<{ ordersCount: number; deliveredCount: number; inStockOrders: number; totalRevenue: number }>;
  bulkDeleteProducts(storeId: number, productIds: number[], force: boolean): Promise<{ deleted: number; archived: number; skipped: number; errors: any[] }>;
  getProductsWithoutOrders(storeId: number): Promise<any[]>;
  getDuplicateProducts(storeId: number): Promise<any[]>;
  getArchivedProducts(storeId: number): Promise<any[]>;
  getProductsWithVariants(storeId: number): Promise<ProductWithVariants[]>;
  createProductWithVariants(product: InsertProduct, variants: InsertProductVariant[]): Promise<ProductWithVariants>;
  getVariantsByProduct(productId: number): Promise<ProductVariant[]>;
  getInventoryStats(storeId: number): Promise<any>;
  updateUser(id: number, data: { username?: string; email?: string; phone?: string | null; paymentType?: string; paymentAmount?: number; distributionMethod?: string; isActive?: number; isEmailVerified?: number; buyerCode?: string | null; password?: string }): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  getCustomersByStore(storeId: number): Promise<Customer[]>;
  getClientsWithStats(storeId: number, options?: { magasinId?: number | null }): Promise<any[]>;
  getLoyalClientsWithDeliveries(storeId: number, options?: { magasinId?: number | null }): Promise<any[]>;
  getLoyalClients(storeId: number, options?: { magasinId?: number | null }): Promise<any[]>;
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
  checkPaywall(storeId: number): Promise<{ isExpired: boolean; isLimitReached: boolean; isBlocked: boolean; reason: 'expired' | 'limit' | null; current: number; limit: number; plan: string }>;

  getAgentPerformance(storeId: number, options?: { magasinId?: number | null; date?: string }): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]>;
  // Like getAgentPerformance but groups by `assigned_to_id` over a date range
  // of `created_at`. Powers the Dashboard's "Performance de l'Équipe" panel
  // where the question is "out of all orders ASSIGNED to this agent in the
  // window, how many are confirmed/delivered?" — not "what did they touch today".
  getAgentPerformanceByAssignment(storeId: number, options?: { magasinId?: number | null; dateFrom?: string | null; dateTo?: string | null }): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]>;

  getAgentProducts(agentId: number): Promise<AgentProduct[]>;
  setAgentProducts(agentId: number, storeId: number, productIds: number[]): Promise<AgentProduct[]>;
  getNextAgent(storeId: number, magasinId: number | null, productId?: number, customerCity?: string): Promise<number | null>;

  getStoreAgentSettings(storeId: number, magasinId?: number | null): Promise<StoreAgentSetting[]>;
  getAgentStoreSetting(agentId: number, storeId: number, magasinId?: number | null): Promise<StoreAgentSetting | undefined>;
  upsertStoreAgentSetting(agentId: number, storeId: number, magasinId: number | null, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string; commissionRate?: number }): Promise<StoreAgentSetting>;
  getAgentMagasinSettings(agentId: number, storeId: number): Promise<StoreAgentSetting[]>;

  getOrderFollowUpLogs(orderId: number): Promise<OrderFollowUpLog[]>;
  createOrderFollowUpLog(data: InsertOrderFollowUpLog): Promise<OrderFollowUpLog>;

  addOrderItem(data: { orderId: number; productId?: number | null; rawProductName?: string; sku?: string; variantInfo?: string; quantity: number; price: number }): Promise<OrderItem>;
  updateOrderItem(id: number, data: { quantity?: number; price?: number; rawProductName?: string; sku?: string; variantInfo?: string }): Promise<OrderItem | undefined>;
  deleteOrderItem(id: number): Promise<void>;

  getAgentPermissions(agentId: number): Promise<Record<string, boolean>>;
  updateAgentPermissions(agentId: number, permissions: Record<string, boolean>): Promise<void>;
  getAgentWallet(agentId: number, storeId: number, opts?: { dateFrom?: string; dateTo?: string; dateRange?: string }): Promise<{ totalEarned: number; deliveredThisMonth: number; deliveredTotal: number; commissionRate: number; periodLabel: string }>;
  getCommissionsSummary(storeId: number): Promise<{ agentId: number; agentName: string; commissionRate: number; deliveredTotal: number; totalOwed: number }[]>;

  getStoresByOwner(userId: number): Promise<Store[]>;
  updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined>;
  deleteStore(id: number): Promise<void>;
  bumpDistributionEpoch(magasinId: number): Promise<void>;
  resetDistribution(magasinId: number): Promise<void>;

  createAdSpendEntry(data: InsertAdSpendNew & { userId?: number | null }): Promise<AdSpendNewEntry>;
  getAdSpendEntries(storeId: number, opts?: { productId?: number | null; source?: string; dateFrom?: string; dateTo?: string; userId?: number | null; allUsers?: boolean; magasinId?: number | null }): Promise<(AdSpendNewEntry & { productName?: string; userName?: string; magasinName?: string | null })[]>;
  deleteAdSpendNew(id: number, storeId: number, userId?: number): Promise<void>;
  getAdSpendNewTotal(storeId: number, dateFrom?: string, dateTo?: string): Promise<number>;

  getMediaBuyerAdSpend(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string): Promise<AdSpendEntry[]>;
  upsertMediaBuyerAdSpend(entry: InsertAdSpend & { mediaBuyerId: number }): Promise<AdSpendEntry>;
  deleteAdSpendEntry(id: number, storeId: number): Promise<void>;
  getAdminAdSpendList(storeId: number, dateFrom?: string, dateTo?: string): Promise<any[]>;
  getAdminProfitSummary(storeId: number, dateFrom?: string, dateTo?: string, productId?: number, mediaBuyerIdFilter?: number, magasinId?: number): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number;
    byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
    byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
    ordersCount: number;
  }>;
  getMediaBuyerProfit(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string, magasinId?: number): Promise<{
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

  createPayment(data: InsertPayment): Promise<Payment>;
  getPayments(): Promise<Payment[]>;
  getPaymentsByStore(storeId: number): Promise<Payment[]>;
  approvePayment(id: number): Promise<void>;
  rejectPayment(id: number, notes?: string): Promise<void>;

  // AI Conversations
  getAiConversations(storeId: number): Promise<import("@shared/schema").AiConversation[]>;
  getAiConversation(id: number): Promise<import("@shared/schema").AiConversation | undefined>;
  getActiveAiConversationByPhone(storeId: number, phone: string): Promise<import("@shared/schema").AiConversation | undefined>;
  getActiveAiConversationByJid(jid: string): Promise<import("@shared/schema").AiConversation | null>;
  updateConversationJid(id: number, jid: string): Promise<void>;
  createAiConversation(data: import("@shared/schema").InsertAiConversation): Promise<import("@shared/schema").AiConversation>;
  updateAiConversationStatus(id: number, status: string): Promise<void>;
  updateConversationConfirmedAt(id: number, ts: Date): Promise<void>;
  updateAiConversationLastMessage(id: number, message: string): Promise<void>;
  setConversationManual(id: number, isManual: number): Promise<void>;

  // Automation
  getMarketingCampaigns(storeId: number): Promise<import("@shared/schema").MarketingCampaign[]>;
  createMarketingCampaign(data: import("@shared/schema").InsertMarketingCampaign): Promise<import("@shared/schema").MarketingCampaign>;
  updateCampaignSent(id: number, totalSent: number, status: string): Promise<void>;
  updateCampaignProgress(id: number, totalSent: number, totalFailed: number, status: string): Promise<void>;
  getAiLogs(storeId: number, orderId?: number, convId?: number): Promise<import("@shared/schema").AiLog[]>;
  createAiLog(data: import("@shared/schema").InsertAiLog): Promise<import("@shared/schema").AiLog>;
  // Lead management
  getConnectedStoreIds(): Promise<number[]>;
  phoneHasOrdersInStore(storeId: number, phone: string): Promise<boolean>;
  updateLeadFields(convId: number, data: { leadStage?: string; leadName?: string; leadCity?: string; leadAddress?: string; leadProductId?: number | null; leadProductName?: string; leadPrice?: number; leadQuantity?: number; createdOrderId?: number }): Promise<void>;
  createOrderFromLead(data: { storeId: number; customerName: string; customerPhone: string; customerCity: string; customerAddress: string; productId: number | null; productName: string; price: number; quantity?: number }): Promise<import("@shared/schema").Order>;
  createOrderFromCarrier(params: { storeId: number; magasinId?: number | null; provider: string; trackingNumber: string; customerName: string; customerPhone: string; customerAddress?: string; customerCity?: string; totalPrice?: number; shippingCost?: number; status?: string; rawStatus?: string; }): Promise<import("@shared/schema").Order>;
  getWhatsappSession(storeId: number): Promise<import("@shared/schema").WhatsappSession | undefined>;
  upsertWhatsappSession(storeId: number, data: { status?: string; phone?: string | null; qrCode?: string | null }): Promise<import("@shared/schema").WhatsappSession>;
  getAiSettings(storeId: number): Promise<import("@shared/schema").AiSetting | undefined>;
  upsertAiSettings(storeId: number, data: { enabled?: number; systemPrompt?: string | null; enabledProductIds?: number[]; openaiApiKey?: string | null; openrouterApiKey?: string | null; aiModel?: string | null }): Promise<import("@shared/schema").AiSetting>;
  updateConversationNeedsAttention(id: number, val: number): Promise<void>;
  updateConversationStep(id: number, step: number, data?: { city?: string; variant?: string }): Promise<void>;

  // Recovery
  getRecoverySettings(storeId: number): Promise<import("@shared/schema").RecoverySetting | undefined>;
  upsertRecoverySettings(storeId: number, data: { enabled?: number; waitMinutes?: number }): Promise<import("@shared/schema").RecoverySetting>;
  getAbandonedLeadsForRecovery(storeId: number, waitMinutes: number): Promise<any[]>;
  getRecoveryStats(storeId: number): Promise<{ total: number; recovered: number; revenueRecovered: number }>;
  getAllStoresWithRecoveryEnabled(): Promise<import("@shared/schema").RecoverySetting[]>;

  // ── Landing Pages ──────────────────────────────────────────────────────────
  getLandingPages(storeId: number): Promise<import("@shared/schema").LandingPage[]>;
  getLandingPage(id: number, storeId: number): Promise<import("@shared/schema").LandingPage | undefined>;
  getLandingPageBySlug(slug: string): Promise<import("@shared/schema").LandingPage | undefined>;
  slugExists(slug: string, excludeId?: number): Promise<boolean>;
  createLandingPage(storeId: number, data: {
    slug: string; productName: string; priceDH: number; description?: string;
    heroImageUrl?: string; featuresImageUrl?: string; proofImageUrl?: string;
    copy?: any; theme?: string; customColor?: string;
  }): Promise<import("@shared/schema").LandingPage>;
  updateLandingPage(id: number, storeId: number, data: Partial<{
    slug: string; productName: string; priceDH: number; description: string;
    heroImageUrl: string; featuresImageUrl: string; proofImageUrl: string;
    copy: any; theme: string; customColor: string; isActive: number;
  }>): Promise<import("@shared/schema").LandingPage | undefined>;
  deleteLandingPage(id: number, storeId: number): Promise<void>;
  incrementLandingPageOrderCount(id: number): Promise<void>;
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
    // 32 bytes = 64-char hex = 256 bits of entropy. Unguessable.
    // Older stores keep their existing shorter keys until they regenerate.
    const { randomBytes } = await import('crypto');
    const key = randomBytes(32).toString('hex');
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

  /* ── Email verification ───────────────────────────────────── */
  async createVerificationCode(userId: number, code: string, expiresAt: Date): Promise<void> {
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
    await db.insert(emailVerificationCodes).values({ userId, code, expiresAt });
  }

  async getVerificationCode(userId: number): Promise<{ code: string; expiresAt: Date } | null> {
    const [row] = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
    if (!row) return null;
    return { code: row.code, expiresAt: row.expiresAt };
  }

  async deleteVerificationCode(userId: number): Promise<void> {
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
  }

  async getProductsByStore(storeId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.storeId, storeId));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    console.log("[Storage.createProduct] inserting:", JSON.stringify(product));
    try {
      const [newProduct] = await db.insert(products).values(product).returning();
      console.log(`[Storage.createProduct] SUCCESS: id=${newProduct.id} name="${newProduct.name}"`);
      return newProduct;
    } catch (err: any) {
      console.error(`[Storage.createProduct] FAILED:`, err.message, err);
      throw err;
    }
  }

  // Find an existing product by case-insensitive name within a store, or create
  // a new one. Used by historical bulk import where rows carry only product names.
  async getOrCreateProductByName(
    storeId: number,
    opts: { name: string; sku?: string | null; sellingPrice?: number },
  ): Promise<Product> {
    const name = (opts.name || "").trim();
    if (!name) throw new Error("Nom du produit requis");

    const [existing] = await db.select().from(products).where(
      and(
        eq(products.storeId, storeId),
        sql`lower(${products.name}) = lower(${name})`,
      ),
    );
    if (existing) return existing;

    const sku = (opts.sku && String(opts.sku).trim())
      ? String(opts.sku).trim()
      : `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [created] = await db.insert(products).values({
      storeId,
      name,
      sku,
      stock: 0,
      costPrice: 0,
      sellingPrice: Math.max(0, Math.round(opts.sellingPrice || 0)),
    }).returning();
    return created;
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

  // Lightweight fetch of recent orders for duplicate detection during import.
  async getOrdersSince(storeId: number, since: Date): Promise<Order[]> {
    return await db.select().from(orders).where(
      and(eq(orders.storeId, storeId), gte(orders.createdAt, since)),
    );
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
    const hydrated = await this.hydrateOrders(allOrders);

    // Compute phone duplicate map from in-memory list (O(n), no extra query)
    const phoneMap = new Map<string, { count: number; dates: string[] }>();
    for (const o of allOrders) {
      if (!o.customerPhone) continue;
      if (!phoneMap.has(o.customerPhone)) phoneMap.set(o.customerPhone, { count: 0, dates: [] });
      const entry = phoneMap.get(o.customerPhone)!;
      entry.count++;
      if (o.createdAt) entry.dates.push(o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt));
    }
    for (const o of hydrated) {
      const info = phoneMap.get(o.customerPhone ?? "") ?? { count: 1, dates: [] };
      (o as any).duplicateCount = info.count;
      (o as any).duplicateOrderDates = info.dates;
    }
    return hydrated;
  }

  async getOrdersByAgent(agentId: number): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders)
      .where(eq(orders.assignedToId, agentId))
      .orderBy(desc(orders.createdAt));
    return this.hydrateOrders(allOrders);
  }

  async getOrdersByPhone(storeId: number, phone: string): Promise<OrderWithDetails[]> {
    // Normalize: strip leading zeros / country code variants so we match broadly
    const normalized = phone.replace(/^\+?212/, '0').replace(/^00212/, '0');
    const allOrders = await db.select().from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        or(
          eq(orders.customerPhone, phone),
          eq(orders.customerPhone, normalized),
          like(orders.customerPhone, `%${normalized.slice(-9)}`),
        ),
      ))
      .orderBy(desc(orders.createdAt));
    return this.hydrateOrders(allOrders);
  }

  private async hydrateOrders(allOrders: Order[]): Promise<OrderWithDetails[]> {
    if (allOrders.length === 0) return [];

    const orderIds   = allOrders.map(o => o.id);
    const agentIds   = Array.from(new Set(allOrders.map(o => o.assignedToId).filter((id): id is number => id != null)));
    const magasinIds = Array.from(new Set(allOrders.map(o => (o as any).magasinId).filter((id): id is number => id != null)));

    // ── 4 batched queries instead of N×3 individual queries ──────────────
    const [allItems, allAgents, allMagasins] = await Promise.all([
      db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
      agentIds.length > 0
        ? db.select().from(users).where(inArray(users.id, agentIds))
        : Promise.resolve([]),
      magasinIds.length > 0
        ? db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, magasinIds))
        : Promise.resolve([]),
    ]);

    // Fetch all products referenced by items in one query
    const productIds = Array.from(new Set(allItems.map(i => i.productId).filter((id): id is number => id != null)));
    const allProducts = productIds.length > 0
      ? await db.select().from(products).where(inArray(products.id, productIds))
      : [];

    // Build lookup maps
    const itemsByOrder  = new Map<number, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }
    const agentById   = new Map(allAgents.map(a => [a.id, a]));
    const productById = new Map(allProducts.map(p => [p.id, p]));
    const magasinById = new Map(allMagasins.map(m => [m.id, m]));

    // Assemble results
    return allOrders.map(order => {
      const orderItemsList = itemsByOrder.get(order.id) || [];
      const itemsWithProducts = orderItemsList.map(item => ({
        ...item,
        product: item.productId ? productById.get(item.productId) : undefined,
      }));
      const mid = (order as any).magasinId as number | null | undefined;
      return {
        ...order,
        agent:   order.assignedToId ? agentById.get(order.assignedToId) ?? null : null,
        magasin: (mid && magasinById.get(mid)) || null,
        items:   itemsWithProducts,
      } as OrderWithDetails;
    });
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
    utmSource?: string; utmCampaign?: string; magasinId?: number;
    productId?: number;
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
      } else if (filters.status === 'pas_reponse_group') {
        // Matches "Pas de réponse 1" through "Pas de réponse 4"
        // and any future numbered variants without code changes.
        conditions.push(sql`${orders.status} LIKE 'Pas de réponse%'`);
      } else if (filters.status === 'suivi_group') {
        // Primary: any order that has been shipped (has a tracking number) and isn't in a terminal state.
        // This catches orders whose carrier sent a custom status not in our internal status list.
        // Secondary fallback: explicit list that also covers Moroccan carrier in-transit statuses.
        conditions.push(
          or(
            and(
              sql`${orders.trackNumber} IS NOT NULL`,
              sql`${orders.trackNumber} != ''`,
              sql`${orders.status} NOT IN ('nouveau', 'confirme', 'confirme_reporte', 'delivered', 'refused')`,
              sql`${orders.status} NOT LIKE 'Annulé%'`
            ),
            inArray(orders.status, [
              'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
              // Moroccan carrier in-transit statuses
              'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
              'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
              // Postponed delivery
              'Reporté',
            ])
          )
        );
      } else if (filters.status === 'refused') {
        // Expand the refused filter to include all carrier issue/refused statuses
        conditions.push(inArray(orders.status, [
          'refused',
          'Client intéressé', 'Remboursé', 'Adresse inconnue', 'Retour en route',
          'Incompatibilité avec les attentes', 'Article retourné', "Erreur d'expédition",
          'Pas de réponse + SMS', 'Boîte vocale', 'Pas réponse 1 (Suivi)',
          'Pas réponse 2 (Suivi)', 'Pas réponse 3 (Suivi)', 'Demande retour',
        ]));
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
    if (filters.magasinId) {
      conditions.push(eq(orders.magasinId, filters.magasinId));
    }
    if (filters.productId) {
      conditions.push(
        sql`${orders.id} IN (
          SELECT DISTINCT ${orderItems.orderId}
          FROM ${orderItems}
          WHERE ${orderItems.productId} = ${filters.productId}
        )`
      );
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
    await this.injectDuplicateCountsFromDB(storeId, hydrated);
    return { orders: hydrated, total };
  }

  /** Inject store-wide duplicate counts + dates for a page of orders (one batch query) */
  private async injectDuplicateCountsFromDB(storeId: number, orderList: any[]): Promise<void> {
    if (!orderList.length) return;
    const phones = [...new Set(orderList.map((o: any) => o.customerPhone).filter(Boolean))] as string[];
    if (!phones.length) return;

    const phoneOrders = await db
      .select({ phone: orders.customerPhone, id: orders.id, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.customerPhone, phones)))
      .orderBy(desc(orders.createdAt));

    const map = new Map<string, { count: number; dates: string[] }>();
    for (const row of phoneOrders) {
      if (!row.phone) continue;
      if (!map.has(row.phone)) map.set(row.phone, { count: 0, dates: [] });
      const e = map.get(row.phone)!;
      e.count++;
      if (row.createdAt) e.dates.push(row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt));
    }

    for (const o of orderList) {
      const info = map.get(o.customerPhone ?? "");
      o.duplicateCount = info?.count ?? 1;
      o.duplicateOrderDates = info?.dates ?? [];
    }
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
    // ── Eligibility for shipping ─────────────────────────────────────────
    // Only orders with status='confirme' AND no existing track number are
    // eligible. Previously this also accepted 'expédié' and 'Attente De
    // Ramassage', which let already-shipped orders be re-sent to the
    // carrier API → duplicate tracking numbers in the carrier system.
    // The track_number guard is defense-in-depth: even if a 'confirme'
    // row was wrongly left after a prior dispatch, we won't reship it.
    const eligible = await db.select().from(orders)
      .where(and(
        inArray(orders.id, orderIds),
        eq(orders.storeId, storeId),
        inArray(orders.status, [
          'confirme', 'expédié', 'Attente De Ramassage',
          'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
          'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
          'En cours de réception au network', 'Arrivé au hub', 'En cours de livraison',
          'Sorti pour livraison', 'Pris en charge', 'Collecté', 'Chargé',
          'Confirmé par livreur', 'Confirmé par livreur *',
        ]),
        sql`(${orders.trackNumber} IS NULL OR ${orders.trackNumber} = '')`,
      ));
    // Hydrate items so bulk-ship quantity sums items[].quantity correctly
    // (without this, order.items is undefined and qty falls back to rawQuantity=1).
    return this.hydrateOrders(eligible);
  }

  async getOrdersByIds(orderIds: number[], storeId: number): Promise<Order[]> {
    if (orderIds.length === 0) return [];
    return db.select().from(orders)
      .where(and(inArray(orders.id, orderIds), eq(orders.storeId, storeId)));
  }

  async deleteOrder(id: number, storeId: number): Promise<void> {
    // Verify the order belongs to this store for security
    const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders)
      .where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
    if (!order) throw new Error('Order not found or access denied');
    // Stock recovery: if confirmed, restore inventory before deleting and
    // log a ledger 'adjustment' row so the audit trail isn't broken by the
    // delete (we can't use 'returned' here because the order itself is gone
    // and we want the reason to make it clear it was a manual deletion).
    if (order.status === 'confirme') {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        if (item.productId) {
          await db.update(products).set({ stock: sql`stock + ${item.quantity}` }).where(eq(products.id, item.productId));
          await db.insert(stockMovements).values({
            storeId,
            productId: item.productId,
            type: 'adjustment',
            quantity: item.quantity,
            orderId: id,
            reason: `Stock restauré — commande #${id} (confirmée) supprimée`,
          });
        }
      }
    }
    // Delete dependent rows first to avoid FK constraint violations
    const { aiLogs, aiConversations } = await import("@shared/schema");
    await db.delete(aiLogs).where(eq(aiLogs.orderId, id));
    await db.update(aiConversations).set({ orderId: null }).where(eq(aiConversations.orderId as any, id));
    await db.delete(orderFollowUpLogs).where(eq(orderFollowUpLogs.orderId, id));
    await db.update(stockLogs).set({ orderId: null } as any).where(eq((stockLogs as any).orderId, id));
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    // Delete the order
    await db.delete(orders).where(and(eq(orders.id, id), eq(orders.storeId, storeId)));
  }

  async bulkDeleteOrders(ids: number[], storeId: number): Promise<number> {
    if (ids.length === 0) return 0;
    // Verify all orders belong to this store
    const owned = await db.select({ id: orders.id, status: orders.status }).from(orders)
      .where(and(inArray(orders.id, ids), eq(orders.storeId, storeId)));
    const ownedIds = owned.map(o => o.id);
    if (ownedIds.length === 0) return 0;
    // Stock recovery: restore inventory for any confirmed orders being deleted
    const confirmedIds = owned.filter(o => o.status === 'confirme').map(o => o.id);
    if (confirmedIds.length > 0) {
      const itemsToRestore = await db.select().from(orderItems)
        .where(inArray(orderItems.orderId, confirmedIds));
      for (const item of itemsToRestore) {
        if (item.productId) {
          await db.update(products).set({ stock: sql`stock + ${item.quantity}` }).where(eq(products.id, item.productId));
          // Mirror the same audit-trail logic as deleteOrder for each item.
          await db.insert(stockMovements).values({
            storeId,
            productId: item.productId,
            type: 'adjustment',
            quantity: item.quantity,
            orderId: item.orderId,
            reason: `Stock restauré — commande #${item.orderId} (confirmée) supprimée (lot)`,
          });
        }
      }
    }
    // Delete dependent rows first to avoid FK constraint violations
    const { aiLogs, aiConversations } = await import("@shared/schema");
    await db.delete(aiLogs).where(inArray(aiLogs.orderId, ownedIds));
    await db.update(aiConversations).set({ orderId: null }).where(inArray(aiConversations.orderId as any, ownedIds));
    await db.delete(orderFollowUpLogs).where(inArray(orderFollowUpLogs.orderId, ownedIds));
    await db.update(stockLogs).set({ orderId: null } as any).where(inArray((stockLogs as any).orderId, ownedIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, ownedIds));
    // Delete the orders
    const deleted = await db.delete(orders)
      .where(and(inArray(orders.id, ownedIds), eq(orders.storeId, storeId)))
      .returning({ id: orders.id });
    return deleted.length;
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    console.log(`[Storage.createOrder] storeId=${order.storeId} orderNumber="${(order as any).orderNumber}" orderItems.length=${items.length}`);
    if (items.length > 0) {
      console.log(`[Storage.createOrder] FIRST ITEM:`, JSON.stringify(items[0]));
    }
    const [newOrder] = await db.insert(orders).values(order).returning();
    
    if (items.length > 0) {
      const itemsToInsert = items.map(item => ({ ...item, orderId: newOrder.id }));
      console.log(`[Storage.createOrder] Inserting ${itemsToInsert.length} order_item(s):`, JSON.stringify(itemsToInsert));
      for (const item of itemsToInsert) {
        await db.insert(orderItems).values(item);
      }
      console.log(`[Storage.createOrder] order_items inserted ✅`);
    }
    
    return newOrder;
  }

  // Return statuses that restore stock when transitioning FROM delivered
  private readonly RETURN_STATUSES = new Set(['retourné', 'refused', 'Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)', 'Annulé']);

  // ── Stock-commitment statuses ──
  // Confirme + Confirmé Reporté both reserve inventory: confirme_reporte
  // is a future-dated confirmation, so we deduct stock on first transition
  // INTO either status. The cron-driven promotion confirme_reporte → confirme
  // is therefore a no-op for stock (stock was already deducted earlier).
  private readonly CONFIRMED_FOR_STOCK = new Set(['confirme', 'confirme_reporte']);

  async updateOrderStatus(id: number, status: string, actorId?: number | null): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      const [currentOrder] = await tx.select().from(orders).where(eq(orders.id, id));
      if (!currentOrder) return undefined;

      const prevStatus = currentOrder.status;

      // Stamp last_action_at / last_action_by ONLY when a human acted (actorId
      // is provided by the route handler). System-driven calls (webhooks,
      // sync jobs, auto-confirmation) omit actorId and don't bump the stamp.
      const setPayload: Record<string, any> = { status, updatedAt: new Date() };
      if (actorId != null) {
        setPayload.lastActionAt = new Date();
        setPayload.lastActionBy = actorId;
      }
      // When manually resetting to 'confirme', clear the carrier commentStatus
      // so the order no longer shows a stale carrier badge (e.g. "En cours de réception")
      if (status === 'confirme' && actorId != null) {
        setPayload.commentStatus = null;
      }

      // ── Carrier fields cleanup on status reversal ──────────────────────────
      // When a previously-shipped order is moved BACK to 'confirme' or 'nouveau',
      // clear all carrier-side fields so the order can be re-shipped cleanly.
      // Without this, bulk-ship's "trackNumber IS NULL" guard skips the order
      // because the old tracking number is still there.
      const wasShipped = ['expédié', 'Attente De Ramassage', 'in_progress', 'delivered', 'refused', 'retourné']
        .includes(prevStatus ?? '');
      const isReverting = (status === 'confirme' || status === 'nouveau') && wasShipped;
      if (isReverting) {
        setPayload.trackNumber      = null;
        setPayload.labelUrl         = null;
        setPayload.shippingProvider = null;
        setPayload.carrierId        = null;
        setPayload.carrierName      = null;
        setPayload.driverName       = null;
        setPayload.driverPhone      = null;
        setPayload.shippingCost     = 0;
        console.log(
          `[STATUS-REVERT] Order #${id}: ${prevStatus} → ${status} — cleared carrier fields ` +
          `(trackNumber, labelUrl, provider, carrier, driver, cost)`
        );
      }

      // Any transition AWAY from confirme_reporte (including the cron's
      // confirme_reporte → confirme promotion) clears the schedule so we
      // don't promote the same order twice.
      if (prevStatus === 'confirme_reporte' && status !== 'confirme_reporte') {
        setPayload.scheduledFor = null;
      }

      const [updated] = await tx.update(orders)
        .set(setPayload)
        .where(eq(orders.id, id))
        .returning();

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

      // ── RULE 0: First-time confirm → subtract stock ─────────────────────
      // Triggers when transitioning INTO 'confirme' or 'confirme_reporte'
      // from a status that is NEITHER. Promotion confirme_reporte→confirme
      // does NOT re-deduct (stock was already taken when entering reporte).
      if (this.CONFIRMED_FOR_STOCK.has(status) && !this.CONFIRMED_FOR_STOCK.has(prevStatus)) {
        const reason = status === 'confirme_reporte'
          ? `Commande #${id} confirmée (reportée)`
          : `Commande #${id} confirmée`;
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
            reason,
          });
        }
      }

      // ── RULE 1: First-time delivery ────────────────────────────────────
      // The ledger MUST log every transition into 'delivered', regardless of
      // what the prev status was — that's the whole point of "sortie" in the
      // insights view (units actually shipped to customers).
      // Physical stock subtraction is conditional: if the prev status was
      // already stock-deducting (RULE 0 ran on confirme), we skip the
      // subtraction but still write the ledger row so the audit trail is
      // accurate. The legacy stock_logs row only fires on the path that also
      // touches physical stock to preserve old behavior.
      if (status === 'delivered' && prevStatus !== 'delivered') {
        const skipStockDeduction = this.CONFIRMED_FOR_STOCK.has(prevStatus);
        for (const item of items) {
          if (!item.productId) continue;
          const qty = Number(item.quantity);
          if (!skipStockDeduction) {
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
          await tx.insert(stockMovements).values({
            storeId: currentOrder.storeId!,
            productId: item.productId,
            type: 'delivered',
            quantity: -qty,
            orderId: id,
            userId: actorId ?? null,
            reason: skipStockDeduction
              ? `Commande #${id} livrée (stock déjà déduit à la confirmation)`
              : `Commande #${id} livrée`,
          });
        }
      }

      // ── RULE 2: Return/cancel from delivered OR confirmed → restore stock ─
      // Triggers when prev was delivered/confirme/confirme_reporte AND now switching to a return status
      if ((prevStatus === 'delivered' || this.CONFIRMED_FOR_STOCK.has(prevStatus)) && this.RETURN_STATUSES.has(status)) {
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
          await tx.insert(stockMovements).values({
            storeId: currentOrder.storeId!,
            productId: item.productId,
            type: 'returned',
            quantity: qty,
            orderId: id,
            userId: actorId ?? null,
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

  // ── Carrier Accounts (multi-account) ─────────────────────────────

  async getCarrierAccounts(storeId: number, carrierName?: string): Promise<CarrierAccount[]> {
    if (carrierName) {
      return db.select().from(carrierAccounts)
        .where(and(eq(carrierAccounts.storeId, storeId), eq(carrierAccounts.carrierName, carrierName)))
        .orderBy(desc(carrierAccounts.isDefault), desc(carrierAccounts.createdAt));
    }
    return db.select().from(carrierAccounts)
      .where(eq(carrierAccounts.storeId, storeId))
      .orderBy(desc(carrierAccounts.isDefault), desc(carrierAccounts.createdAt));
  }

  async getCarrierAccount(id: number): Promise<CarrierAccount | undefined> {
    const [acct] = await db.select().from(carrierAccounts).where(eq(carrierAccounts.id, id));
    return acct;
  }

  async createCarrierAccount(data: InsertCarrierAccount): Promise<CarrierAccount> {
    // If new account is marked as default, unset any existing default for same carrier
    if (data.isDefault === 1) {
      await db.update(carrierAccounts)
        .set({ isDefault: 0 })
        .where(and(
          eq(carrierAccounts.storeId, data.storeId),
          eq(carrierAccounts.carrierName, data.carrierName),
        ));
    }
    console.log(`[SHIPPING]: Attempting to save to carrier_accounts — store: ${data.storeId}, carrier: ${data.carrierName}, connection: "${data.connectionName}", apiKey length: ${data.apiKey?.length ?? 0}`);
    const [created] = await db.insert(carrierAccounts).values(data).returning();
    console.log(`[SHIPPING]: carrier_accounts INSERT success — new id: ${created.id}`);
    return created;
  }

  async updateCarrierAccount(id: number, data: Partial<InsertCarrierAccount>): Promise<CarrierAccount | undefined> {
    // If setting as default, clear others first
    if (data.isDefault === 1) {
      const acct = await this.getCarrierAccount(id);
      if (acct) {
        await db.update(carrierAccounts)
          .set({ isDefault: 0 })
          .where(and(
            eq(carrierAccounts.storeId, acct.storeId),
            eq(carrierAccounts.carrierName, acct.carrierName),
          ));
      }
    }
    const [updated] = await db.update(carrierAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(carrierAccounts.id, id))
      .returning();
    return updated;
  }

  async deleteCarrierAccount(id: number): Promise<void> {
    await db.delete(carrierAccounts).where(eq(carrierAccounts.id, id));
  }

  // ── Carrier city cache ───────────────────────────────────────────────────

  async getCarrierCities(storeId: number, carrierName: string): Promise<string[]> {
    const rows = await db.select().from(carrierCities)
      .where(and(eq(carrierCities.storeId, storeId), eq(carrierCities.carrierName, carrierName.toLowerCase())))
      .limit(1);
    if (!rows.length) return [];
    const raw = rows[0].cities;
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  async upsertCarrierCities(storeId: number, carrierName: string, accountId: number | null, cities: string[]): Promise<void> {
    const name = carrierName.toLowerCase();
    const existing = await db.select({ id: carrierCities.id }).from(carrierCities)
      .where(and(eq(carrierCities.storeId, storeId), eq(carrierCities.carrierName, name)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(carrierCities)
        .set({ cities: cities as any, cityCount: cities.length, accountId, syncedAt: new Date() })
        .where(and(eq(carrierCities.storeId, storeId), eq(carrierCities.carrierName, name)));
    } else {
      await db.insert(carrierCities).values({
        storeId,
        carrierName: name,
        accountId,
        cities: cities as any,
        cityCount: cities.length,
        syncedAt: new Date(),
      });
    }
  }

  // ── Ameex city ID mapping (name → numeric ID) ────────────────────────────
  // Ameex's shipment API requires city as a numeric ID, not a name string.
  // This table is populated by "Synchroniser les villes" on the Ameex account.

  async upsertAmeexCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void> {
    if (!cities.length) return;
    // Replace all rows for this store with fresh data from the sync
    await db.delete(ameexCities).where(eq(ameexCities.storeId, storeId));
    await db.insert(ameexCities).values(
      cities.map(c => ({ storeId, externalId: c.externalId, name: c.name, nameNorm: c.nameNorm }))
    );
  }

  async getAmeexCityId(storeId: number, cityName: string): Promise<string | null> {
    const norm = (s: string) => s
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = norm(cityName);
    if (!key) return null;

    // 1. Exact normalized match
    const [exact] = await db.select().from(ameexCities)
      .where(and(eq(ameexCities.storeId, storeId), eq(ameexCities.nameNorm, key)))
      .limit(1);
    if (exact) return exact.externalId;

    // 2. Fuzzy: normalized name contains the key (handles trailing/leading words)
    const fuzzy = await db.select().from(ameexCities)
      .where(and(eq(ameexCities.storeId, storeId), like(ameexCities.nameNorm, `%${key}%`)))
      .limit(1);
    return fuzzy[0]?.externalId ?? null;
  }

  // ── Express Coursier city ID mapping (name → numeric ID) ─────────────────
  // EC's shipment API requires the 'city' field to be a numeric ID, not a name.
  // This table is populated by "Synchroniser les villes" on the EC account,
  // which fetches the official id→name map from the EC cities endpoint.

  async upsertExpressCoursierCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void> {
    if (!cities.length) return;
    // Replace all rows for this store with fresh data from the sync.
    // Wrapped in a transaction so a concurrent ship never observes zero rows
    // between the delete and the insert (which would wrongly fail-fast).
    await db.transaction(async (tx) => {
      await tx.delete(expressCoursierCities).where(eq(expressCoursierCities.storeId, storeId));
      await tx.insert(expressCoursierCities).values(
        cities.map(c => ({ storeId, externalId: c.externalId, name: c.name, nameNorm: c.nameNorm }))
      );
    });
  }

  async resolveExpressCoursierCityId(storeId: number, cityName: string): Promise<string | null> {
    const norm = (s: string) => (s || "")
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = norm(cityName);
    if (!key) return null;

    // 1. Exact normalized match against synced EC cities
    const [exact] = await db.select().from(expressCoursierCities)
      .where(and(eq(expressCoursierCities.storeId, storeId), eq(expressCoursierCities.nameNorm, key)))
      .limit(1);
    if (exact && /^\d+$/.test(exact.externalId)) return exact.externalId;

    // 2. Fuzzy: normalized name contains the key (handles trailing/leading words)
    const fuzzy = await db.select().from(expressCoursierCities)
      .where(and(eq(expressCoursierCities.storeId, storeId), like(expressCoursierCities.nameNorm, `%${key}%`)))
      .limit(1);
    if (fuzzy[0] && /^\d+$/.test(fuzzy[0].externalId)) return fuzzy[0].externalId;

    // 3. Not found → return null. The caller MUST fail fast — never send the
    //    city name, which EC rejects ("Ville invalide").
    return null;
  }

  // ── Ozon Express city ID mapping (name → numeric ID) ─────────────────────
  // Ozon Express's add-parcel API requires 'parcel-city' to be a numeric ID,
  // not a name. Populated by "Synchroniser les villes" on the Ozon account,
  // which fetches the official id→name map from GET /cities.

  async upsertOzonExpressCities(storeId: number, cities: { externalId: string; name: string; nameNorm: string }[]): Promise<void> {
    if (!cities.length) return;
    // Replace all rows for this store with fresh data — wrapped in a transaction
    // so a concurrent ship never observes zero rows between delete and insert.
    await db.transaction(async (tx) => {
      await tx.delete(ozonExpressCities).where(eq(ozonExpressCities.storeId, storeId));
      await tx.insert(ozonExpressCities).values(
        cities.map(c => ({ storeId, externalId: c.externalId, name: c.name, nameNorm: c.nameNorm }))
      );
    });
  }

  async resolveOzonExpressCityId(storeId: number, cityName: string): Promise<string | null> {
    const norm = (s: string) => (s || "")
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = norm(cityName);
    if (!key) return null;

    // 1. Exact normalized match against synced Ozon cities
    const [exact] = await db.select().from(ozonExpressCities)
      .where(and(eq(ozonExpressCities.storeId, storeId), eq(ozonExpressCities.nameNorm, key)))
      .limit(1);
    if (exact && /^\d+$/.test(exact.externalId)) return exact.externalId;

    // 2. Fuzzy: normalized name contains the key (handles trailing/leading words)
    const fuzzy = await db.select().from(ozonExpressCities)
      .where(and(eq(ozonExpressCities.storeId, storeId), like(ozonExpressCities.nameNorm, `%${key}%`)))
      .limit(1);
    if (fuzzy[0] && /^\d+$/.test(fuzzy[0].externalId)) return fuzzy[0].externalId;

    // 3. Not found → return null. The caller MUST fail fast — never send the
    //    city name, which Ozon Express rejects.
    return null;
  }

  /**
   * Smart dispatch: find the best carrier account for an order.
   * Priority:
   *   1. Active account with assignmentRule = 'city' that covers the order's city
   *   2. Active account with assignmentRule = 'default' (or isDefault = 1)
   *   3. Fall back to legacy storeIntegrations entry
   */
  async getAccountForShipping(
    storeId: number,
    provider: string,
    city?: string,
  ): Promise<{ apiKey: string; apiSecret?: string; apiUrl?: string; carrierStoreName?: string; digylogStoreName?: string; digylogNetworkId?: number } | null> {
    const accounts = await this.getCarrierAccounts(storeId, provider);
    const active   = accounts.filter(a => a.isActive === 1);

    const pickFields = (a: typeof active[0]) => {
      const s = (a.settings as any) || {};
      // Debug: log exactly what's in settings so we can trace any disconnect
      console.log(`[DIGYLOG-SETTINGS] account #${a.id} settings=${JSON.stringify(s)} carrierStoreName="${a.carrierStoreName ?? ''}"`);
      // digylogNetworkId: prefer new key, fall back to old key written by ConnectModal
      const resolvedNetworkId = s.digylogNetworkId
        ? Number(s.digylogNetworkId)
        : s.networkId
          ? Number(s.networkId)
          : 1;
      // digylogStoreName: prefer settings key, fall back to DB column
      const resolvedDigylogStore = s.digylogStoreName ?? a.carrierStoreName ?? undefined;
      return {
        id:               a.id,
        settings:         s,
        apiKey:           a.apiKey,
        apiSecret:        a.apiSecret        ?? undefined,
        apiUrl:           a.apiUrl           ?? undefined,
        carrierStoreName: a.carrierStoreName  ?? s.digylogStoreName ?? undefined,
        digylogStoreName: resolvedDigylogStore,
        digylogNetworkId: resolvedNetworkId,
      };
    };

    // 1. Try city-based routing
    if (city && active.length > 0) {
      const cityAcct = active.find(a => {
        if (a.assignmentRule !== 'city') return false;
        try {
          const cities: string[] = JSON.parse(a.assignmentData || '[]');
          return cities.some(c => c.toLowerCase() === city.toLowerCase());
        } catch { return false; }
      });
      if (cityAcct) return pickFields(cityAcct);
    }

    // 2. Default account
    const defaultAcct = active.find(a => a.isDefault === 1) || active.find(a => a.assignmentRule === 'default') || active[0];
    if (defaultAcct) return pickFields(defaultAcct);

    // 3. Fallback to legacy storeIntegrations
    const legacy = await this.getIntegrationByProvider(storeId, provider);
    if (legacy) {
      try {
        const creds = JSON.parse(legacy.credentials || '{}');
        if (creds.apiKey) return creds;
      } catch {}
    }

    // 4. Env-var fallback — for Digylog/EcoTrack, use Railway variable if DB has no entry
    const providerNorm = provider.toLowerCase().replace(/[\s\-]/g, "");
    const isDigylogLike = providerNorm.includes("digylog") || providerNorm.includes("ecotrack");
    if (isDigylogLike && process.env.DIGYLOG_API_KEY) {
      console.log(`[CARRIER-KEY] Digylog key not found in DB for store ${storeId} — falling back to DIGYLOG_API_KEY env var.`);
      return { apiKey: process.env.DIGYLOG_API_KEY };
    }

    return null;
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

  async getIntegrationByProvider(storeId: number, provider: string, magasinId?: number): Promise<StoreIntegration | undefined> {
    const conditions: any[] = [eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, provider)];
    if (magasinId) conditions.push(eq(storeIntegrations.magasinId, magasinId));
    const [integration] = await db.select().from(storeIntegrations).where(and(...conditions));
    return integration;
  }

  async getIntegrationByWebhookKey(webhookKey: string): Promise<StoreIntegration | undefined> {
    // Normalize to lowercase on both sides for case-insensitive matching
    const normKey = webhookKey.trim().toLowerCase();
    const [integration] = await db.select().from(storeIntegrations)
      .where(sql`LOWER(${storeIntegrations.webhookKey}) = ${normKey}`);
    return integration;
  }

  async getIntegrationsByProvider(provider: string, storeIds: number[]): Promise<StoreIntegration[]> {
    if (!storeIds.length) return [];
    return await db.select().from(storeIntegrations)
      .where(and(eq(storeIntegrations.provider, provider), inArray(storeIntegrations.storeId, storeIds)))
      .orderBy(desc(storeIntegrations.createdAt));
  }

  async incrementIntegrationOrdersCount(id: number): Promise<void> {
    await db.update(storeIntegrations)
      .set({ ordersCount: sql`COALESCE(${storeIntegrations.ordersCount}, 0) + 1` })
      .where(eq(storeIntegrations.id, id));
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

  async clearIntegrationLogsByProvider(storeId: number, provider: string): Promise<void> {
    const p = (provider || "").toLowerCase().trim();
    await db.delete(integrationLogs).where(and(
      eq(integrationLogs.storeId, storeId),
      sql`lower(${integrationLogs.provider}) = ${p}`
    ));
  }

  async updateOrderShipping(orderId: number, trackingNumber: string, labelLink: string | null, shippingProvider: string): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({ trackNumber: trackingNumber, labelLink, shippingProvider, carrierName: shippingProvider })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getOrderByNumber(storeId: number, orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.orderNumber, orderNumber)));
    return order;
  }

  async getOrderByTrackingNumber(storeId: number, trackingNumber: string): Promise<Order | undefined> {
    // Case-insensitive match: Digylog may send 'saf014eat' when stored as 'SAF014EAT'
    const [order] = await db.select().from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        sql`lower(${orders.trackNumber}) = lower(${trackingNumber})`
      ));
    return order;
  }

  async getOrderByTrackingNumberAnyStore(trackingNumber: string): Promise<Order | undefined> {
    // Cross-store fallback: used when the webhook URL has the wrong storeId.
    // Searches ALL stores — case-insensitive on track_number.
    const [order] = await db.select().from(orders)
      .where(sql`lower(${orders.trackNumber}) = lower(${trackingNumber})`);
    return order;
  }

  async getOrderByOrderNumberAnyStore(orderNumber: string): Promise<Order | undefined> {
    // Cross-store lookup by orderNumber — used by the Ameex webhook to correlate
    // a TJG-{orderNumber} ref before the real tracking number arrives.
    const [order] = await db.select().from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return order;
  }

  async getOrdersForFeeBackfill(storeId: number, provider: string): Promise<Order[]> {
    return db.select().from(orders)
      .where(and(
        eq(orders.storeId, storeId),
        inArray(orders.status, ['delivered', 'Retour Recu', 'refused']),
        sql`${orders.trackNumber} IS NOT NULL AND ${orders.trackNumber} != ''`,
        or(isNull(orders.shippingCost), eq(orders.shippingCost, 0)),
        or(
          sql`lower(${orders.shippingProvider}) = lower(${provider})`,
          sql`lower(${orders.carrierName}) = lower(${provider})`,
        ),
      ))
      .limit(200);
  }

  async updateOrder(id: number, data: Partial<InsertOrder>, actorId?: number | null): Promise<Order | undefined> {
    // Stamp last_action_at / last_action_by ONLY for human-driven mutations
    // (route handler passes actorId = req.user.id). Webhooks / sync jobs /
    // auto-confirmation omit it so they don't pollute the daily action count.
    const setPayload: Record<string, any> = { ...data, updatedAt: new Date() };
    if (actorId != null) {
      setPayload.lastActionAt = new Date();
      setPayload.lastActionBy = actorId;
    }
    const [updated] = await db.update(orders).set(setPayload).where(eq(orders.id, id)).returning();
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

  async archiveProduct(id: number): Promise<void> {
    await db.update(products).set({ archivedAt: new Date() } as any).where(eq(products.id, id));
  }

  async getProductUsage(storeId: number, productId: number): Promise<{ ordersCount: number; deliveredCount: number; inStockOrders: number; totalRevenue: number }> {
    const items = await db.select({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(eq(orderItems.productId, productId));
    if (items.length === 0) return { ordersCount: 0, deliveredCount: 0, inStockOrders: 0, totalRevenue: 0 };
    const orderIds = Array.from(new Set(items.map(i => i.orderId)));
    const ordersList = await db.select().from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.id, orderIds)));
    const deliveredCount = ordersList.filter(o => /livr/i.test(String(o.status || ""))).length;
    const inStockOrders = ordersList.filter(o => !/livr|annul|retour/i.test(String(o.status || ""))).length;
    const totalRevenue = ordersList
      .filter(o => /livr/i.test(String(o.status || "")))
      .reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);
    return { ordersCount: ordersList.length, deliveredCount, inStockOrders, totalRevenue };
  }

  async bulkDeleteProducts(storeId: number, productIds: number[], force: boolean): Promise<{ deleted: number; archived: number; skipped: number; errors: any[] }> {
    const results = { deleted: 0, archived: 0, skipped: 0, errors: [] as any[] };
    for (const id of productIds) {
      try {
        const product = await this.getProduct(id);
        if (!product || product.storeId !== storeId) { results.skipped += 1; continue; }
        const usage = await this.getProductUsage(storeId, id);
        if (usage.ordersCount > 0) {
          if (force) { await this.archiveProduct(id); results.archived += 1; }
          else { results.skipped += 1; }
        } else {
          await this.deleteProduct(id); results.deleted += 1;
        }
      } catch (err: any) {
        results.errors.push({ id, message: err.message });
      }
    }
    return results;
  }

  async getProductsWithoutOrders(storeId: number): Promise<any[]> {
    const allProducts = await db.select().from(products)
      .where(and(eq(products.storeId, storeId), sql`${products.archivedAt} IS NULL`));
    if (allProducts.length === 0) return [];
    const productIds = allProducts.map(p => p.id);
    const usedItems = await db.selectDistinct({ productId: orderItems.productId })
      .from(orderItems)
      .where(and(inArray(orderItems.productId, productIds), sql`${orderItems.productId} IS NOT NULL`));
    const usedIds = new Set(usedItems.map(i => i.productId));
    return allProducts.filter(p => !usedIds.has(p.id));
  }

  async getDuplicateProducts(storeId: number): Promise<any[]> {
    const allProducts = await db.select().from(products)
      .where(and(eq(products.storeId, storeId), sql`${products.archivedAt} IS NULL`))
      .orderBy(desc(products.createdAt));
    const normName = (s: string) => (s || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    const groups: Record<string, typeof allProducts> = {};
    for (const p of allProducts) {
      const key = normName(p.name);
      (groups[key] ||= []).push(p);
    }
    const dupes: any[] = [];
    for (const items of Object.values(groups)) {
      if (items.length >= 2) {
        for (let i = 1; i < items.length; i++) {
          dupes.push({ ...items[i], duplicateGroup: normName(items[i].name), keepId: items[0].id });
        }
      }
    }
    return dupes;
  }

  async getArchivedProducts(storeId: number): Promise<any[]> {
    return await db.select().from(products)
      .where(and(eq(products.storeId, storeId), sql`${products.archivedAt} IS NOT NULL`))
      .orderBy(desc(products.archivedAt));
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

    // Pull every stock movement for this store's products in one query and
    // group by product. We use this ledger for "Reçu" (cumulative purchased)
    // so manual restocks no longer corrupt the lifetime number.
    const productIds = allProducts.map(p => p.id);
    const allMovements = productIds.length === 0
      ? []
      : await db.select().from(stockMovements)
          .where(and(
            eq(stockMovements.storeId, storeId),
            inArray(stockMovements.productId, productIds),
          ));
    const movementsByProduct = new Map<number, typeof allMovements>();
    for (const m of allMovements) {
      const list = movementsByProduct.get(m.productId);
      if (list) list.push(m); else movementsByProduct.set(m.productId, [m]);
    }

    const productStats = [];
    for (const p of allProducts) {
      const variants = allVariants.filter(v => v.productId === p.id);
      const totalStock = p.stock + variants.reduce((s, v) => s + v.stock, 0);
      
      // Cumulative: count all statuses reached after agent confirmation
      const INVENTORY_CONFIRMED = ['confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné'];
      const confirmedItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId),
          inArray(orders.status, INVENTORY_CONFIRMED)
        ));
      
      const deliveredItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId),
          eq(orders.status, 'delivered')
        ));

      const inTransitItems = await db.select({ qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orderItems.productId, p.id),
          eq(orders.storeId, storeId),
          inArray(orders.status, ['in_progress', 'expédié', 'Attente De Ramassage'])
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
      const inTransit = Number(inTransitItems[0]?.qty || 0);
      const totalOrdered = Number(totalOrderItems[0]?.qty || 0);
      const totalConfirmedQty = Number(confirmedItems[0]?.qty || 0);
      const available = totalStock; // live stock = initial minus all deliveries plus all returns

      // ── Reçu now comes from the stock_movements ledger ────────────────────
      // Sum of every 'restock' row (lifetime, never decreases). Going forward
      // every manual restock adds a row, so the cumulative number is correct
      // even when current_stock has been depleted to 0 and refilled multiple
      // times. The migration backfilled one row per product so day-1 values
      // match the old `available + sortie` formula.
      const productMovements = movementsByProduct.get(p.id) || [];
      const recu = productMovements
        .filter(m => m.type === 'restock')
        .reduce((s, m) => s + (m.quantity || 0), 0);
      const lastRestock = productMovements
        .filter(m => m.type === 'restock')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const confirmRate = totalOrdered > 0 ? Math.round(totalConfirmedQty / totalOrdered * 100) : 0;
      // deliverRate = Delivered / Confirmed (not total) — correct carrier-delivery formula
      const deliverRate = totalConfirmedQty > 0 ? Math.round(sortie / totalConfirmedQty * 100) : 0;

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
        settings: p.settings,
        descriptionDarija: p.descriptionDarija,
        aiFeatures: p.aiFeatures,
        stock: totalStock,
        variantCount: variants.length || 1,
        recu,
        sortie,
        inTransit,
        available,
        confirmRate,
        deliverRate,
        totalOrdered,
        totalConfirmed: totalConfirmedQty,
        totalDelivered: sortie,
        stockReel: available * p.costPrice,
        stockTotal: available * p.sellingPrice,
        storeName: '',
        lastRestockAt:  lastRestock?.createdAt ?? null,
        lastRestockQty: lastRestock?.quantity  ?? null,
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

  async updateUser(id: number, data: { username?: string; email?: string; phone?: string | null; paymentType?: string; paymentAmount?: number; distributionMethod?: string; isActive?: number; isEmailVerified?: number; buyerCode?: string | null; password?: string }): Promise<User | undefined> {
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
    // Cumulative confirmed statuses: once confirmed by agent, always counted as confirmed
    const CONFIRMED_STATUSES = ['confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné'];
    const DELIVERED_STATUS = 'delivered';
    const CANCELLED_STATUSES = ['refused', 'Injoignable', 'boite vocale'];
    const platforms = [...new Set(allOrders.map(o => (o as any).trafficPlatform).filter(Boolean))].sort();

    // Fetch all order items for the current order set.
    // We also select orders.rawProductName as a fallback because order_items.raw_product_name
    // is sometimes NULL (e.g. legacy Shopify webhook orders where the name was only stored at
    // the order level). COALESCE(item name, order name) ensures we always get a real string.
    const orderIds = allOrders.map(o => o.id);
    let allItems: any[] = [];
    if (orderIds.length > 0) {
      allItems = await db.select({
        orderId: orderItems.orderId,
        rawProductName: orderItems.rawProductName,
        variantInfo: orderItems.variantInfo,
        orderRawProductName: orders.rawProductName,
        orderStatus: orders.status,
      }).from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(inArray(orderItems.orderId, orderIds));
    }

    // Build an order-level name lookup for the orders that have NO items at all
    // (defensive: covers orders created before the order_items table was populated)
    const ordersWithItems = new Set(allItems.map((i: any) => i.orderId));
    const orderNameMap = new Map(allOrders.map(o => [o.id, (o as any).rawProductName as string | null]));
    for (const o of allOrders) {
      if (!ordersWithItems.has(o.id)) {
        allItems.push({
          orderId: o.id,
          rawProductName: null,
          orderRawProductName: orderNameMap.get(o.id) ?? null,
          orderStatus: o.status,
        });
      }
    }

    // Apply product filter — narrow orders to those containing the selected product.
    // Use COALESCE: item-level name first, then order-level name as fallback.
    if (product && product !== 'all' && allItems.length > 0) {
      const matchingOrderIds = new Set(
        allItems
          .filter(i => {
            const name = i.rawProductName || i.orderRawProductName || '';
            return name.toLowerCase() === product.toLowerCase();
          })
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
    // deliveryRate = delivered / confirmed (not divided by total)
    const deliveryRate = confirmed > 0 ? Math.round((delivered / confirmed) * 100) : 0;

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
        deliveryRate: d.confirmed > 0 ? Math.round((d.delivered / d.confirmed) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const filteredOrderIds = new Set(allOrders.map(o => o.id));
    const filteredItems = allItems.filter(i => filteredOrderIds.has(i.orderId));
    const productMap: Record<string, { total: number; confirmed: number; inProgress: number; delivered: number }> = {};
    for (const item of filteredItems) {
      // COALESCE: item-level name → order-level name → fallback label
      const name = item.rawProductName || item.orderRawProductName || 'Produit Sans Nom';
      const v = (item.variantInfo ?? '').trim();
      // Guard: don't append variant if rawProductName already contains it (handles
      // combined "Name - Variant" stored by new webhook/manual-order logic)
      const variantNotInName = v && !name.includes(v);
      const displayKey = (variantNotInName && v !== 'Default Title' && v !== 'null' && v !== '-') ? `${name} - ${v}` : name;
      if (!productMap[displayKey]) productMap[displayKey] = { total: 0, confirmed: 0, inProgress: 0, delivered: 0 };
      productMap[displayKey].total++;
      if (CONFIRMED_STATUSES.includes(item.orderStatus)) productMap[displayKey].confirmed++;
      if (['in_progress', 'expédié', 'Attente De Ramassage'].includes(item.orderStatus)) productMap[displayKey].inProgress++;
      if (item.orderStatus === DELIVERED_STATUS) productMap[displayKey].delivered++;
    }
    const products = Object.entries(productMap)
      .map(([name, d]) => ({
        name,
        ...d,
        confirmRate: d.total > 0 ? Math.round((d.confirmed / d.total) * 100) : 0,
        deliveryRate: d.confirmed > 0 ? Math.round((d.delivered / d.confirmed) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { total, confirmed, inProgress, delivered, cancelled, revenue, confirmRate, deliveryRate, platforms, daily, products, cities, campaigns };
  }

  async getMediaBuyersSummary(storeId: number, dateFrom?: string, dateTo?: string): Promise<any[]> {
    const buyers = await db.select().from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'media_buyer')));
    const result = await Promise.all(buyers.map(async (buyer) => {
      const stats = await this.getMediaBuyerStats(storeId, buyer.id, undefined, dateFrom, dateTo);
      const profit = await this.getMediaBuyerProfit(storeId, buyer.id, dateFrom, dateTo);
      const buyerCode = buyer.buyerCode;
      const dateConditions: any[] = [];
      if (dateFrom) dateConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
      if (dateTo) dateConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp + interval '1 day' - interval '1 second'`);
      const buyerOrders = await db.select().from(orders)
        .where(and(
          eq(orders.storeId, storeId),
          buyerCode
            ? or(eq(orders.mediaBuyerId, buyer.id), sql`${orders.utmSource} ILIKE ${buyerCode + '*%'}`)
            : eq(orders.mediaBuyerId, buyer.id),
          ...dateConditions,
        ));
      const CONF_STATUSES = ['confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné'];
      const platformMap: Record<string, { total: number; confirmed: number; delivered: number; revenue: number }> = {};
      for (const o of buyerOrders) {
        const plt = (o as any).trafficPlatform || 'Organique';
        if (!platformMap[plt]) platformMap[plt] = { total: 0, confirmed: 0, delivered: 0, revenue: 0 };
        platformMap[plt].total++;
        if (CONF_STATUSES.includes(o.status)) platformMap[plt].confirmed++;
        if (o.status === 'delivered') { platformMap[plt].delivered++; platformMap[plt].revenue += o.totalPrice; }
      }
      const platformBreakdown = Object.entries(platformMap).map(([platform, s]) => ({
        platform, ...s,
        confirmRate: s.total > 0 ? Math.round((s.confirmed / s.total) * 100) : 0,
      }));
      return {
        id: buyer.id, username: buyer.username, email: buyer.email, buyerCode: buyer.buyerCode,
        ...stats, platformBreakdown,
        adSpendTotal: profit.adSpend,
        netProfit: profit.netProfit,
        productCost: profit.productCost,
        shippingCost: profit.shippingCost,
        agentCommissions: profit.agentCommissions,
      };
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

  async getClientsWithStats(storeId: number, options?: { magasinId?: number | null }): Promise<any[]> {
    const conditions: any[] = [eq(orders.storeId, storeId)];
    if (options?.magasinId != null) {
      conditions.push(eq(orders.magasinId, options.magasinId));
    }

    const allOrders = await db
      .select({
        orderId: orders.id,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerCity: orders.customerCity,
        totalPrice: orders.totalPrice,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    const orderIds = allOrders.map(o => o.orderId);
    let itemsByOrder: Record<number, { productName: string; quantity: number }[]> = {};

    if (orderIds.length > 0) {
      const items = await db
        .select({
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          productName: products.name,
          rawProductName: orderItems.rawProductName,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

      for (const it of items) {
        if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
        itemsByOrder[it.orderId].push({
          productName: it.productName || (it as any).rawProductName || "Produit inconnu",
          quantity: it.quantity || 1,
        });
      }
    }

    const clientMap: Record<string, any> = {};

    for (const order of allOrders) {
      const key = (order.customerPhone || "").trim() || (order.customerName || "").trim().toLowerCase();
      if (!key) continue;

      if (!clientMap[key]) {
        clientMap[key] = {
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerCity: order.customerCity,
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: order.createdAt,
          firstOrderDate: order.createdAt,
          products: {},
        };
      }

      const c = clientMap[key];
      c.orderCount += 1;
      c.totalSpent += order.totalPrice || 0;

      if (order.createdAt && c.lastOrderDate && new Date(order.createdAt) > new Date(c.lastOrderDate)) {
        c.lastOrderDate = order.createdAt;
      }
      if (order.createdAt && c.firstOrderDate && new Date(order.createdAt) < new Date(c.firstOrderDate)) {
        c.firstOrderDate = order.createdAt;
      }

      const items = itemsByOrder[order.orderId] || [];
      for (const it of items) {
        c.products[it.productName] = (c.products[it.productName] || 0) + it.quantity;
      }
    }

    const result = Object.values(clientMap).map((c: any) => ({
      ...c,
      isRepeat: c.orderCount > 1,
      productsList: Object.entries(c.products).map(([name, qty]) => ({ name, quantity: qty })),
      productsSummary: Object.entries(c.products).map(([name, qty]) => `${name} ×${qty}`).join(", "),
    }));

    result.sort((a: any, b: any) => b.totalSpent - a.totalSpent);
    return result;
  }

  async getLoyalClientsWithDeliveries(storeId: number, options?: { magasinId?: number | null }): Promise<any[]> {
    const DELIVERED_STATUS = 'delivered';

    const conditions: any[] = [eq(orders.storeId, storeId), eq(orders.status, DELIVERED_STATUS)];
    if (options?.magasinId != null) {
      conditions.push(eq(orders.magasinId, options.magasinId));
    }

    const deliveredOrders = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerCity: orders.customerCity,
        totalPrice: orders.totalPrice,
        status: orders.status,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.updatedAt));

    if (deliveredOrders.length === 0) return [];

    const orderIds = deliveredOrders.map(o => o.orderId);
    const itemsByOrder: Record<number, { productName: string; quantity: number }[]> = {};

    const items = await db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        productName: products.name,
        rawProductName: orderItems.rawProductName,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    for (const it of items) {
      if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
      itemsByOrder[it.orderId].push({
        productName: it.productName || (it as any).rawProductName || "Produit",
        quantity: it.quantity || 1,
      });
    }

    const clientMap: Record<string, any> = {};

    for (const order of deliveredOrders) {
      const key = (order.customerPhone || "").trim() || (order.customerName || "").trim().toLowerCase();
      if (!key) continue;

      if (!clientMap[key]) {
        clientMap[key] = {
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerCity: order.customerCity,
          deliveredCount: 0,
          totalSpent: 0,
          firstDelivery: order.updatedAt || order.createdAt,
          lastDelivery: order.updatedAt || order.createdAt,
          products: {},
          deliveries: [],
        };
      }

      const c = clientMap[key];
      c.deliveredCount += 1;
      c.totalSpent += order.totalPrice || 0;

      const deliveryDate = order.updatedAt || order.createdAt;
      if (deliveryDate) {
        if (c.lastDelivery && new Date(deliveryDate) > new Date(c.lastDelivery)) c.lastDelivery = deliveryDate;
        if (c.firstDelivery && new Date(deliveryDate) < new Date(c.firstDelivery)) c.firstDelivery = deliveryDate;
      }

      const orderItemsList = itemsByOrder[order.orderId] || [];
      for (const it of orderItemsList) {
        c.products[it.productName] = (c.products[it.productName] || 0) + it.quantity;
      }

      c.deliveries.push({
        orderNumber: order.orderNumber,
        date: deliveryDate,
        total: order.totalPrice || 0,
        products: orderItemsList,
      });
    }

    const result = Object.values(clientMap).map((c: any) => {
      c.deliveries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return {
        ...c,
        isLoyal: c.deliveredCount > 1,
        productsList: Object.entries(c.products).map(([name, qty]) => ({ name, quantity: qty })),
        productsSummary: Object.entries(c.products).map(([name, qty]) => `${name} ×${qty}`).join(", "),
      };
    });

    result.sort((a: any, b: any) => {
      if (b.deliveredCount !== a.deliveredCount) return b.deliveredCount - a.deliveredCount;
      return b.totalSpent - a.totalSpent;
    });

    return result;
  }

  async getLoyalClients(storeId: number, options?: { magasinId?: number | null }): Promise<any[]> {
    const DELIVERED_STATUSES = ['delivered'];

    const conditions: any[] = [eq(orders.storeId, storeId)];
    if (options?.magasinId != null) {
      conditions.push(eq(orders.magasinId, options.magasinId));
    }

    const allOrders = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerCity: orders.customerCity,
        magasinId: orders.magasinId,
        totalPrice: orders.totalPrice,
        status: orders.status,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    if (allOrders.length === 0) return [];

    const orderIds = allOrders.map(o => o.orderId);
    const itemsByOrder: Record<number, { productName: string; sku: string | null; quantity: number }[]> = {};

    const items = await db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        productName: products.name,
        sku: products.sku,
        rawProductName: orderItems.rawProductName,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    for (const it of items) {
      if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
      itemsByOrder[it.orderId].push({
        productName: it.productName || (it as any).rawProductName || "Produit",
        sku: it.sku || null,
        quantity: it.quantity || 1,
      });
    }

    const isDelivered = (status: string) =>
      DELIVERED_STATUSES.some(s => (status || "").toLowerCase().trim() === s.toLowerCase().trim());

    const clientMap: Record<string, any> = {};

    for (const order of allOrders) {
      const key = (order.customerPhone || "").trim() || (order.customerName || "").trim().toLowerCase();
      if (!key) continue;

      if (!clientMap[key]) {
        clientMap[key] = {
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerCity: order.customerCity,
          deliveredCount: 0,
          totalOrders: 0,
          totalSpentDelivered: 0,
          lastDelivery: null,
          firstDelivery: null,
          orders: [],
        };
      }

      const c = clientMap[key];
      c.totalOrders += 1;
      const del = isDelivered(order.status);

      if (del) {
        c.deliveredCount += 1;
        c.totalSpentDelivered += order.totalPrice || 0;
        const d = order.updatedAt || order.createdAt;
        if (d) {
          if (!c.lastDelivery || new Date(d) > new Date(c.lastDelivery)) c.lastDelivery = d;
          if (!c.firstDelivery || new Date(d) < new Date(c.firstDelivery)) c.firstDelivery = d;
        }
      }

      c.orders.push({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        city: order.customerCity,
        phone: order.customerPhone,
        magasinId: order.magasinId,
        status: order.status,
        isDelivered: del,
        date: order.createdAt,
        deliveryDate: del ? (order.updatedAt || order.createdAt) : null,
        total: order.totalPrice || 0,
        products: itemsByOrder[order.orderId] || [],
      });
    }

    const loyal = Object.values(clientMap)
      .filter((c: any) => c.deliveredCount >= 2)
      .map((c: any) => {
        c.orders.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return c;
      });

    loyal.sort((a: any, b: any) => {
      if (b.deliveredCount !== a.deliveredCount) return b.deliveredCount - a.deliveredCount;
      return b.totalSpentDelivered - a.totalSpentDelivered;
    });

    return loyal;
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

  async checkPaywall(storeId: number): Promise<{ isExpired: boolean; isLimitReached: boolean; isBlocked: boolean; reason: 'expired' | 'limit' | null; current: number; limit: number; plan: string }> {
    const sub = await this.getSubscription(storeId);
    if (!sub) {
      return { isExpired: false, isLimitReached: false, isBlocked: false, reason: null, current: 0, limit: 60, plan: 'trial' };
    }
    const isTrial = sub.plan === 'trial';
    const effectiveLimit = isTrial ? 60 : sub.monthlyLimit;
    const now = new Date();

    const isExpired = !!sub.planExpiryDate && new Date(sub.planExpiryDate) < now;

    const isLimitReached = sub.isBlocked === 1 || (effectiveLimit > 0 && sub.currentMonthOrders >= effectiveLimit);

    const isBlocked = isExpired || isLimitReached;
    const reason: 'expired' | 'limit' | null = isExpired ? 'expired' : isLimitReached ? 'limit' : null;
    return { isExpired, isLimitReached, isBlocked, reason, current: sub.currentMonthOrders, limit: effectiveLimit, plan: sub.plan };
  }

  async getAgentPerformance(
    storeId: number,
    options?: { magasinId?: number | null; date?: string },
  ): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]> {
    // Count agent ACTIONS taken on a given day (default: today, store local time
    // assumed UTC for now). We group by `last_action_by` (the human who last
    // touched the order) — NOT `assigned_to_id` — so the column reflects real
    // work done that day, not the historical assignment pool.
    //
    // `magasinId` (optional) lets the Team page narrow stats to a single
    // magasin so an owner can see "today, agent X handled N orders in
    // magasin Y".
    const dateStr = options?.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const conditions = [
      eq(orders.storeId, storeId),
      sql`${orders.lastActionBy} IS NOT NULL`,
      sql`${orders.lastActionAt} >= ${dayStart}`,
      sql`${orders.lastActionAt} < ${dayEnd}`,
    ];
    if (options?.magasinId != null) {
      conditions.push(eq(orders.magasinId, options.magasinId));
    }

    const result = await db.select({
      agentId: orders.lastActionBy,
      total: count(),
      confirmed: sql<number>`count(*) filter (where ${orders.status} in ('confirme', 'confirme_reporte', 'expédié', 'delivered', 'refused', 'Attente De Ramassage', 'in_progress', 'retourné'))`,
      delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('Annulé (fake)', 'Annulé (faux numéro)', 'Annulé (double)'))`,
    }).from(orders)
      .where(and(...conditions))
      .groupBy(orders.lastActionBy);

    return result.map(r => ({
      agentId: r.agentId!,
      total: Number(r.total),
      confirmed: Number(r.confirmed),
      delivered: Number(r.delivered),
      cancelled: Number(r.cancelled),
    }));
  }

  async getAgentPerformanceByAssignment(
    storeId: number,
    options?: { magasinId?: number | null; dateFrom?: string | null; dateTo?: string | null },
  ): Promise<{ agentId: number; total: number; confirmed: number; delivered: number; cancelled: number }[]> {
    // Counts orders ASSIGNED to each agent in a created_at window.
    // Different question than getAgentPerformance (which counts today's actions):
    // here the denominator is the agent's full assignment pool in the date range,
    // so the Dashboard's confirmation rate doesn't read 0% just because nobody
    // touched anything today.
    const conditions: any[] = [
      eq(orders.storeId, storeId),
      sql`${orders.assignedToId} IS NOT NULL`,
    ];
    if (options?.magasinId != null) conditions.push(eq(orders.magasinId, options.magasinId));
    if (options?.dateFrom)          conditions.push(gte(orders.createdAt, new Date(`${options.dateFrom}T00:00:00.000Z`)));
    if (options?.dateTo)            conditions.push(lte(orders.createdAt, new Date(`${options.dateTo}T23:59:59.999Z`)));

    // 'confirmed' counts every order that progressed past confirmation:
    // confirme + every downstream carrier state that proves the agent's call
    // led to a real shipment (in_progress, expédié, Attente De Ramassage, delivered, refused/retourné).
    const rows = await db.select({
      agentId:   orders.assignedToId,
      total:     count(),
      confirmed: sql<number>`count(*) filter (where ${orders.status} in ('confirme','confirme_reporte','confirmé','expédié','in_progress','Attente De Ramassage','delivered','refused','retourné'))`,
      delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('Annulé (fake)','Annulé (faux numéro)','Annulé (double)'))`,
    })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.assignedToId);

    return rows.map(r => ({
      agentId:   r.agentId!,
      total:     Number(r.total),
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

    // 4. Order counts per store (all-time)
    const orderCounts = await db.select({
      storeId: orders.storeId, cnt: count(),
    }).from(orders).where(
      sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    ).groupBy(orders.storeId);
    const orderCountMap = new Map(orderCounts.map(r => [r.storeId, Number(r.cnt)]));

    // 4b. Current calendar-month orders per store
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthOrderCounts = await db.select({
      storeId: orders.storeId, cnt: count(),
    }).from(orders).where(
      and(
        sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
        sql`${orders.createdAt} >= ${monthStart}`,
        sql`${orders.createdAt} < ${monthEnd}`,
      )
    ).groupBy(orders.storeId);
    const monthOrderMap = new Map(monthOrderCounts.map(r => [r.storeId, Number(r.cnt)]));

    // 5a. Core profit components per store (delivered orders): revenue - productCost - shippingCost
    // packagingCost is a store-level setting (stores.packagingCost × deliveredCount), computed below
    const profitRows = await db.select({
      storeId:      orders.storeId,
      revenue:      sql<number>`COALESCE(SUM(${orders.totalPrice}::bigint), 0)`,
      productCost:  sql<number>`COALESCE(SUM(${orders.productCost}::bigint), 0)`,
      shipping:     sql<number>`COALESCE(SUM(${orders.shippingCost}::bigint), 0)`,
      deliveredCount: sql<number>`COALESCE(COUNT(*), 0)`,
    }).from(orders).where(
      and(
        sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
        eq(orders.status, 'delivered'),
      )
    ).groupBy(orders.storeId);

    // 5b. Agent commissions per store (commissionRate in DH × 100 = centimes, per delivered order with assigned agent)
    const commissionRows = await db.select({
      storeId: orders.storeId,
      totalCommissions: sql<number>`COALESCE(SUM(${storeAgentSettings.commissionRate}::bigint * 100), 0)`,
    }).from(orders)
      .innerJoin(storeAgentSettings, and(
        eq(storeAgentSettings.storeId, orders.storeId),
        eq(storeAgentSettings.agentId, orders.assignedToId),
      ))
      .where(and(
        sql`${orders.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
        eq(orders.status, 'delivered'),
      ))
      .groupBy(orders.storeId);
    const commissionMap = new Map(commissionRows.map(r => [r.storeId, Number(r.totalCommissions)]));

    // 5c. Legacy ad spend per store (amount stored in DH → × 100 to get centimes)
    const legacyAdRows = await db.select({
      storeId: adSpendTracking.storeId,
      total: sql<number>`COALESCE(SUM(${adSpendTracking.amount}::bigint * 100), 0)`,
    }).from(adSpendTracking).where(
      sql`${adSpendTracking.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    ).groupBy(adSpendTracking.storeId);
    const legacyAdMap = new Map(legacyAdRows.map(r => [r.storeId, Number(r.total)]));

    // 5d. New ad_spend table per store (amount already in centimes)
    const newAdRows = await db.select({
      storeId: adSpend.storeId,
      total: sql<number>`COALESCE(SUM(${adSpend.amount}), 0)`,
    }).from(adSpend).where(
      sql`${adSpend.storeId} = ANY(ARRAY[${sql.raw(storeIds.join(','))}]::int[])`,
    ).groupBy(adSpend.storeId);
    const newAdMap = new Map(newAdRows.map(r => [r.storeId, Number(r.total)]));

    // Build a quick lookup: storeId → packagingCost (centimes per delivered order)
    const storePackagingMap = new Map(allStores.map(s => [s.id, Number(s.packagingCost ?? 0)]));

    const profitMap = new Map(profitRows.map(r => {
      const deliveredCnt = Number(r.deliveredCount ?? 0);
      const packaging    = deliveredCnt * (storePackagingMap.get(r.storeId!) ?? 0);
      const base         = Number(r.revenue) - Number(r.productCost) - Number(r.shipping) - packaging;
      const agentComm    = commissionMap.get(r.storeId!) ?? 0;
      const legacyAd     = legacyAdMap.get(r.storeId!)  ?? 0;
      const newAd        = newAdMap.get(r.storeId!)      ?? 0;
      return [r.storeId, base - agentComm - legacyAd - newAd];
    }));

    return allStores.map(store => {
      const owner = ownerMap.get(store.id);
      const sub = subMap.get(store.id) ?? null;
      return {
        ...store,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.username ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCreatedAt: owner?.createdAt ?? null,
        ownerIsActive: owner?.isActive ?? 1,
        isEmailVerified: owner?.isEmailVerified ?? 0,
        ownerId: owner?.id ?? null,
        teamCount: teamCountMap.get(store.id) ?? 0,
        totalOrders: orderCountMap.get(store.id) ?? 0,
        monthlyOrders: monthOrderMap.get(store.id) ?? 0,
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
    await db.update(users).set({ isActive }).where(and(eq(users.storeId, storeId), eq(users.isSuperAdmin, 0)));
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

  async getNextAgent(storeId: number, magasinId: number | null, productId?: number, customerCity?: string): Promise<number | null> {
    // 1. Load all agents of the SaaS account
    const accountAgents = await db.select().from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'agent'), eq(users.isActive, 1)));

    if (accountAgents.length === 0) return null;

    // 2. CRITICAL: filter to only agents linked to THIS magasin (per stores.agentIds).
    //    If the magasin has no agents linked (empty array), fall through to all
    //    account agents — preserves legacy behavior for unconfigured magasins.
    let storeAgents = accountAgents;
    if (magasinId) {
      const [magasinRow] = await db.select().from(stores)
        .where(eq(stores.id, magasinId)).limit(1);
      const linkedAgentIds: number[] = Array.isArray(magasinRow?.agentIds)
        ? (magasinRow!.agentIds as any[]).map(Number)
        : [];
      if (linkedAgentIds.length > 0) {
        storeAgents = accountAgents.filter(a => linkedAgentIds.includes(a.id));
      }
    }
    if (storeAgents.length === 0) return null;

    // 3. Load per-store agent settings for role and lead percentage.
    //
    // The table now has TWO row types per agent:
    //   - magasin_id IS NULL  → account-wide default (role, allowed products/regions,
    //     commission, fallback %).
    //   - magasin_id = <X>    → per-magasin override (currently leadPercentage only).
    //
    // For role/products/regions filters we want the account-wide default. For
    // leadPercentage in the % engine we want the magasin-specific row, falling
    // back to the default when no magasin row exists.
    const allSettings = await db.select().from(storeAgentSettings)
      .where(eq(storeAgentSettings.storeId, storeId));
    const defaultSettings = allSettings.filter(s => s.magasinId == null);
    const settingsMap = new Map(defaultSettings.map(s => [s.agentId, s]));
    // Map (agentId → leadPercentage) preferring the per-magasin row, then the default.
    const pctMap = new Map<number, number>();
    if (magasinId) {
      for (const s of allSettings) {
        if (s.magasinId === magasinId && s.leadPercentage !== null && s.leadPercentage !== undefined) {
          pctMap.set(s.agentId, Number(s.leadPercentage));
        }
      }
    }
    for (const s of defaultSettings) {
      if (!pctMap.has(s.agentId) && s.leadPercentage !== null && s.leadPercentage !== undefined) {
        pctMap.set(s.agentId, Number(s.leadPercentage));
      }
    }

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

    // ── Resolve distribution method ────────────────────────────────────────
    // Prefer the per-MAGASIN setting (stores.distributionMethod for the
    // specific magasin handling this order). Fallback chain:
    //   1. magasin.distributionMethod (when magasinId is supplied)
    //   2. parent store.distributionMethod (no magasin context)
    //   3. owner.distributionMethod (LEGACY — pre-multi-magasin accounts)
    //   4. 'auto'
    let distMethod: string = 'auto';
    if (magasinId) {
      const [magasinRow] = await db
        .select({ distributionMethod: stores.distributionMethod })
        .from(stores)
        .where(eq(stores.id, magasinId))
        .limit(1);
      if (magasinRow?.distributionMethod) distMethod = magasinRow.distributionMethod;
    } else {
      const [storeRow] = await db
        .select({ distributionMethod: stores.distributionMethod, ownerId: stores.ownerId })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (storeRow?.distributionMethod && storeRow.distributionMethod !== 'auto') {
        distMethod = storeRow.distributionMethod;
      } else if (storeRow?.ownerId) {
        const [owner] = await db
          .select({ distributionMethod: users.distributionMethod })
          .from(users)
          .where(eq(users.id, storeRow.ownerId))
          .limit(1);
        distMethod = owner?.distributionMethod || storeRow.distributionMethod || 'auto';
      }
    }

    // lastAssignedAgentId still lives on the parent store row (round-robin pointer).
    const [storeRow] = await db.select({ lastAssignedAgentId: stores.lastAssignedAgentId }).from(stores).where(eq(stores.id, storeId)).limit(1);
    const lastAgentId = storeRow?.lastAssignedAgentId || null;
    console.log(`[DIST] store=${storeId} magasin=${magasinId ?? 'none'} method=${distMethod} eligible=[${eligibleAgents.map(a => a.id).join(',')}]`);

    if (distMethod === 'auto' || !distMethod) {
      // PURE ROUND-ROBIN: next agent after lastAssignedAgent
      const agentIds = eligibleAgents.map(a => a.id);

      if (agentIds.length === 0) return null;
      if (agentIds.length === 1) {
        await db.update(stores).set({ lastAssignedAgentId: agentIds[0] }).where(eq(stores.id, storeId));
        return agentIds[0];
      }

      const lastIndex = lastAgentId ? agentIds.indexOf(lastAgentId) : -1;
      const nextIndex = (lastIndex + 1) % agentIds.length;
      const nextAgentId = agentIds[nextIndex];

      console.log(`[ROUND-ROBIN] agents=${agentIds} last=${lastAgentId} next=${nextAgentId}`);
      await db.update(stores).set({ lastAssignedAgentId: nextAgentId }).where(eq(stores.id, storeId));
      return nextAgentId;

    } else if (distMethod === 'pourcentage') {
      // PERCENTAGE-BASED DISTRIBUTION (works for any number of agents)
      // Reference window: count assignments made AFTER the magasin's distribution_epoch
      // (last time percentages / agent linking / dist method was changed). This ensures
      // changing percentages mid-day, adding new agents, or rebalancing does NOT make
      // historical orders distort the math. Falls back to today 00:00 when no epoch.
      let windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);

      if (magasinId) {
        const [magasinRow] = await db
          .select({ distributionEpoch: stores.distributionEpoch })
          .from(stores)
          .where(eq(stores.id, magasinId))
          .limit(1);
        if (magasinRow?.distributionEpoch) {
          windowStart = new Date(magasinRow.distributionEpoch);
        }
      } else {
        const [storeRow] = await db
          .select({ distributionEpoch: stores.distributionEpoch })
          .from(stores)
          .where(eq(stores.id, storeId))
          .limit(1);
        if (storeRow?.distributionEpoch) {
          windowStart = new Date(storeRow.distributionEpoch);
        }
      }

      console.log(`[DIST-%] window since=${windowStart.toISOString()} magasin=${magasinId ?? 'none'}`);

      const agentCounts = await Promise.all(
        eligibleAgents.map(async (agent) => {
          const conds: any[] = [
            eq(orders.storeId, storeId),
            eq(orders.assignedToId, agent.id),
            gte(orders.createdAt, windowStart),
          ];
          if (magasinId) conds.push(eq(orders.magasinId, magasinId));
          const [row] = await db
            .select({ count: sql<number>`count(*)` })
            .from(orders)
            .where(and(...conds));
          return { agentId: agent.id, count: Number(row?.count || 0) };
        })
      );

      const totalToday = agentCounts.reduce((s, a) => s + a.count, 0);
      const defaultPct = 100 / eligibleAgents.length;

      // Compute target % per agent. Only fall back to defaultPct when there is
      // NO setting row at all (neither a per-magasin override nor an account-
      // wide default). A setting row with leadPercentage=0 means the user
      // explicitly excluded that agent — respect it.
      const eligibleWithPct = eligibleAgents.map(a => {
        const explicit = pctMap.get(a.id);
        const pct = explicit !== undefined ? explicit : defaultPct;
        return { agentId: a.id, targetPct: pct };
      });

      // Normalize: if user-configured percentages don't sum to 100 (within 0.5),
      // scale them so the deficit math is meaningful.
      const sumPct = eligibleWithPct.reduce((s, a) => s + a.targetPct, 0);
      if (sumPct > 0 && Math.abs(sumPct - 100) > 0.5) {
        // Ratios don't sum to 100 — treat them as relative weights so the user
        // can write 70/15/15 or 5/2/2 and get the same effective distribution.
        console.log(`[DIST-%] Normalizing: sum=${sumPct.toFixed(1)} → scaling to 100`);
        eligibleWithPct.forEach(a => { a.targetPct = (a.targetPct / sumPct) * 100; });
      }

      // Pick the agent with the largest deficit (target − projected actual %)
      let selectedAgentId: number | null = null;
      let maxDeficit = -Infinity;

      for (const { agentId, targetPct } of eligibleWithPct) {
        if (targetPct <= 0) continue; // 0% = excluded, skip entirely
        const currentCount = agentCounts.find(a => a.agentId === agentId)?.count || 0;
        const projectedPct = ((currentCount + 1) / (totalToday + 1)) * 100;
        const deficit = targetPct - projectedPct;
        console.log(`[DIST-%] agent=${agentId} target=${targetPct.toFixed(1)}% today=${currentCount} projected=${projectedPct.toFixed(1)}% deficit=${deficit.toFixed(1)}`);

        if (deficit > maxDeficit) {
          maxDeficit = deficit;
          selectedAgentId = agentId;
        }
      }

      // Strict semantic: if every agent was explicitly excluded (0%), return null
      // rather than silently overriding the user's intent. Caller will leave the
      // order unassigned. The [DIST-%] log lines above make this visible.
      if (!selectedAgentId) {
        console.warn(`[DIST-%] All eligible agents have target=0% — order will remain unassigned`);
      }

      if (selectedAgentId) {
        await db.update(stores)
          .set({ lastAssignedAgentId: selectedAgentId })
          .where(eq(stores.id, storeId));
      }

      console.log(`[DIST-%] → Selected: ${selectedAgentId}`);
      return selectedAgentId;

    } else {
      // Fallback: first eligible agent
      return eligibleAgents[0]?.id || null;
    }
  }

  // When magasinId is undefined → returns ALL rows for the store (legacy behavior).
  // When magasinId is null      → returns ONLY the account-wide default rows (magasin_id IS NULL).
  // When magasinId is a number  → returns ONLY rows for that specific magasin.
  async getStoreAgentSettings(storeId: number, magasinId?: number | null): Promise<StoreAgentSetting[]> {
    const conds: any[] = [eq(storeAgentSettings.storeId, storeId)];
    if (magasinId === null) conds.push(isNull(storeAgentSettings.magasinId));
    else if (typeof magasinId === 'number') conds.push(eq(storeAgentSettings.magasinId, magasinId));
    return await db.select().from(storeAgentSettings).where(and(...conds));
  }

  async getAgentStoreSetting(agentId: number, storeId: number, magasinId?: number | null): Promise<StoreAgentSetting | undefined> {
    const conds: any[] = [
      eq(storeAgentSettings.agentId, agentId),
      eq(storeAgentSettings.storeId, storeId),
    ];
    if (magasinId === null || magasinId === undefined) conds.push(isNull(storeAgentSettings.magasinId));
    else conds.push(eq(storeAgentSettings.magasinId, magasinId));
    const [setting] = await db.select().from(storeAgentSettings).where(and(...conds));
    return setting;
  }

  async upsertStoreAgentSetting(agentId: number, storeId: number, magasinId: number | null, data: { roleInStore?: string; leadPercentage?: number; allowedProductIds?: string; allowedRegions?: string; commissionRate?: number }): Promise<StoreAgentSetting> {
    const existing = await this.getAgentStoreSetting(agentId, storeId, magasinId);
    if (existing) {
      const [updated] = await db.update(storeAgentSettings)
        .set({ ...data })
        .where(eq(storeAgentSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(storeAgentSettings)
      .values({ agentId, storeId, magasinId, ...data })
      .returning();
    return created;
  }

  // Returns all per-magasin rows for a single agent (used by Team page % grid).
  async getAgentMagasinSettings(agentId: number, storeId: number): Promise<StoreAgentSetting[]> {
    return await db.select().from(storeAgentSettings)
      .where(and(
        eq(storeAgentSettings.agentId, agentId),
        eq(storeAgentSettings.storeId, storeId),
      ));
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

  async getAgentWallet(agentId: number, storeId: number, opts?: { dateFrom?: string; dateTo?: string; dateRange?: string }): Promise<{ totalEarned: number; deliveredThisMonth: number; deliveredTotal: number; commissionRate: number; periodLabel: string }> {
    const setting = await this.getAgentStoreSetting(agentId, storeId);
    const rate = Number(setting?.commissionRate ?? 0);
    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date = new Date();
    let periodLabel = 'Ce mois';

    if (opts?.dateFrom) {
      periodStart = new Date(opts.dateFrom + 'T00:00:00');
      periodEnd   = opts.dateTo ? new Date(opts.dateTo + 'T23:59:59') : new Date();
      periodLabel = opts.dateFrom === opts.dateTo
        ? opts.dateFrom
        : `${opts.dateFrom} → ${opts.dateTo || "aujourd'hui"}`;
    } else if (opts?.dateRange === 'today') {
      periodStart = new Date(); periodStart.setHours(0, 0, 0, 0);
      periodLabel = "Aujourd'hui";
    } else if (opts?.dateRange === 'yesterday') {
      periodStart = new Date(); periodStart.setDate(periodStart.getDate() - 1); periodStart.setHours(0, 0, 0, 0);
      periodEnd   = new Date(); periodEnd.setDate(periodEnd.getDate() - 1); periodEnd.setHours(23, 59, 59, 999);
      periodLabel = 'Hier';
    } else if (opts?.dateRange === '7days') {
      periodStart = new Date(); periodStart.setDate(periodStart.getDate() - 6); periodStart.setHours(0, 0, 0, 0);
      periodLabel = '7 derniers jours';
    } else if (opts?.dateRange === 'lastmonth') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      periodLabel = 'Mois dernier';
    } else if (opts?.dateRange === 'all') {
      periodStart = new Date('2020-01-01');
      periodLabel = 'Tout le temps';
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodLabel = 'Ce mois';
    }

    const [totalRow] = await db.select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.assignedToId, agentId), eq(orders.storeId, storeId), eq(orders.status, 'delivered')));

    const [periodRow] = await db.select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(
        eq(orders.assignedToId, agentId),
        eq(orders.storeId, storeId),
        eq(orders.status, 'delivered'),
        gte(orders.createdAt, periodStart),
        lte(orders.createdAt, periodEnd),
      ));

    const deliveredTotal = Number(totalRow?.count ?? 0);
    const deliveredThisMonth = Number(periodRow?.count ?? 0);
    return {
      totalEarned: deliveredThisMonth * rate,
      deliveredThisMonth,
      deliveredTotal,
      commissionRate: rate,
      periodLabel,
    };
  }

  async getCommissionsSummary(storeId: number, opts?: { dateFrom?: string; dateTo?: string; month?: string; agentId?: string }): Promise<{ agentId: number; agentName: string; commissionRate: number; deliveredTotal: number; totalOwed: number }[]> {
    const agents = await db.select().from(users).where(and(eq(users.storeId, storeId), eq(users.role, 'agent')));
    const result = [];

    // Calculate date range
    const now = new Date();
    let cutoff: Date;
    let endDate: Date = new Date();

    if (opts?.dateFrom) {
      cutoff = new Date(opts.dateFrom + 'T00:00:00');
      endDate = opts?.dateTo ? new Date(opts.dateTo + 'T23:59:59') : new Date();
    } else if (opts?.month) {
      // Format: "2026-04" → first and last day of month
      const [year, mon] = opts.month.split('-').map(Number);
      cutoff = new Date(year, mon - 1, 1);
      endDate = new Date(year, mon, 0, 23, 59, 59);
    } else {
      // Default: current month
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date();
    }

    for (const agent of agents) {
      if (opts?.agentId && String(agent.id) !== opts.agentId) continue;

      const setting = await this.getAgentStoreSetting(agent.id, storeId);
      const rate = Number(setting?.commissionRate ?? 0);

      // Count deliveries in date range — using createdAt (order creation date)
      // Must match the agent's own my-stats and wallet endpoints which also
      // filter by createdAt so admin and agent see identical numbers.
      const allDelivered = await db.select()
        .from(orders)
        .where(and(
          eq(orders.assignedToId, agent.id),
          eq(orders.storeId, storeId),
          eq(orders.status, 'delivered'),
          gte(orders.createdAt, cutoff),
          lte(orders.createdAt, endDate),
        ));

      const deliveredTotal = allDelivered.length;
      result.push({
        agentId: agent.id,
        agentName: agent.username,
        commissionRate: rate,
        deliveredTotal,
        totalOwed: deliveredTotal * rate,
      });
    }
    return result;
  }

  async getStoresByOwner(userId: number): Promise<Store[]> {
    const user = await this.getUserById(userId);
    if (!user) return [];
    // Fetch all stores where ownerId = userId (multi-store owners)
    const ownedStores = await db.select().from(stores).where(eq(stores.ownerId, userId));
    const ownedIds = new Set(ownedStores.map(s => s.id));
    // Also always include the user's primary storeId (created at signup, may have had null ownerId)
    const extra = user.storeId && !ownedIds.has(user.storeId)
      ? await db.select().from(stores).where(eq(stores.id, user.storeId))
      : [];
    return [...ownedStores, ...extra];
  }

  async updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined> {
    const [updated] = await db.update(stores).set(data).where(eq(stores.id, id)).returning();
    return updated;
  }

  async bumpDistributionEpoch(magasinId: number): Promise<void> {
    await db.update(stores).set({ distributionEpoch: new Date() }).where(eq(stores.id, magasinId));
  }

  async resetDistribution(magasinId: number): Promise<void> {
    // Manual "réinitialiser la distribution" — wipes the percentage count window AND
    // the round-robin pointer, so the next order starts from a clean slate.
    await db.update(stores)
      .set({ distributionEpoch: new Date(), lastAssignedAgentId: null })
      .where(eq(stores.id, magasinId));
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

  async getAdSpendEntries(storeId: number, opts?: { productId?: number | null; source?: string; dateFrom?: string; dateTo?: string; userId?: number | null; allUsers?: boolean; magasinId?: number | null }): Promise<(AdSpendNewEntry & { productName?: string; userName?: string; magasinName?: string | null })[]> {
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
    // magasinId filter: numeric → exact match. Legacy NULL rows are excluded
    // when a specific magasin is picked (they show only under "Tous les magasins").
    if (opts?.magasinId !== undefined && opts?.magasinId !== null) {
      conditions.push(eq((adSpend as any).magasinId, opts.magasinId));
    }
    // Self-join stores to surface the magasin name for the table column.
    // Aliased so it doesn't collide with adSpend.storeId (also FK to stores).
    const magasinTable = aliasedTable(stores, 'magasin_join');
    const rows = await db.select({
      id: adSpend.id, storeId: adSpend.storeId, userId: (adSpend as any).userId,
      magasinId: (adSpend as any).magasinId,
      productId: adSpend.productId,
      source: adSpend.source, date: adSpend.date, amount: adSpend.amount,
      productSellingPrice: adSpend.productSellingPrice, createdAt: adSpend.createdAt,
      productName: products.name,
      userName: users.username,
      magasinName: magasinTable.name,
    }).from(adSpend)
      .leftJoin(products, eq(adSpend.productId, products.id))
      .leftJoin(users, eq((adSpend as any).userId, users.id))
      .leftJoin(magasinTable, eq((adSpend as any).magasinId, magasinTable.id))
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
    magasinId?: number,
  ): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number;
    byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
    byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
    ordersCount: number;
  }> {
    // --- Delivered orders (COD: only status='delivered' counts) ---
    const orderConds: any[] = [eq(orders.storeId, storeId), eq(orders.status, 'delivered')];
    if (dateFrom) orderConds.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) orderConds.push(sql`${orders.createdAt} <= ${dateTo}::timestamp`);
    if (mediaBuyerIdFilter) orderConds.push(eq(orders.mediaBuyerId, mediaBuyerIdFilter));
    if (magasinId) orderConds.push(eq(orders.magasinId, magasinId));
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

    // --- Per-product packaging cost map (DH/commande from settings.profitDefaults.coutEmballage) ---
    const storeProductsList = await db.select({ id: products.id, settings: products.settings }).from(products).where(eq(products.storeId, storeId));
    const emballageByProductId = new Map<number, number>();
    for (const p of storeProductsList) {
      const val = Number((p.settings as any)?.profitDefaults?.coutEmballage ?? 0);
      if (val > 0) emballageByProductId.set(p.id, val);
    }

    // --- Order items map for delivered orders (needed for per-order packaging) ---
    const deliveredOrderIds = deliveredOrders.map(o => o.id);
    const deliveredItems = deliveredOrderIds.length > 0
      ? await db.select({ orderId: orderItems.orderId, productId: orderItems.productId })
          .from(orderItems).where(inArray(orderItems.orderId, deliveredOrderIds))
      : [];
    const itemsByOrderId = new Map<number, { productId: number | null }[]>();
    for (const item of deliveredItems) {
      const arr = itemsByOrderId.get(item.orderId) ?? [];
      arr.push({ productId: item.productId });
      itemsByOrderId.set(item.orderId, arr);
    }

    // --- Revenue & order costs (delivered only) --- strict Number() to prevent concatenation ---
    let revenue = 0, productCost = 0, shippingCost = 0, packagingCostTotal = 0;
    for (const o of deliveredOrders) {
      revenue += Number(o.totalPrice ?? 0);
      productCost += Number(cogsMap.get(o.id) ?? 0);
      shippingCost += Number(o.shippingCost ?? 0);
      // Packaging: per order (not per quantity) — sum coutEmballage(DH) over items, convert to centimes
      const orderEmballageDH = (itemsByOrderId.get(o.id) ?? [])
        .reduce((sum, item) => sum + (emballageByProductId.get(item.productId ?? 0) ?? 0), 0);
      packagingCostTotal += Math.round(orderEmballageDH * 100);
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
    // When a magasin is selected, scope ad spend to that magasin (legacy NULL rows excluded)
    if (magasinId) legacyConds.push(eq((adSpendTracking as any).magasinId, magasinId));
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
    // When a magasin is selected, scope ad spend to that magasin (legacy NULL rows excluded)
    if (magasinId) newAdConds.push(eq((adSpend as any).magasinId, magasinId));
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
      const orderPkgDH = (itemsByOrderId.get(o.id) ?? [])
        .reduce((sum, item) => sum + (emballageByProductId.get(item.productId ?? 0) ?? 0), 0);
      existing.orderProfit += Number(o.totalPrice ?? 0) - realCogs - Number(o.shippingCost ?? 0) - Math.round(orderPkgDH * 100) - agentComm;
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

  async getMediaBuyerProfit(storeId: number, mediaBuyerId: number, dateFrom?: string, dateTo?: string, magasinId?: number): Promise<{
    revenue: number; productCost: number; shippingCost: number; packagingCost: number;
    agentCommissions: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads: number;
  }> {
    const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const storePackaging = Number(store[0]?.packagingCost ?? 0);

    // All leads (total orders attributed to this buyer)
    const allLeadConditions: any[] = [eq(orders.storeId, storeId), eq(orders.mediaBuyerId, mediaBuyerId)];
    if (dateFrom) allLeadConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) allLeadConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp + interval '1 day' - interval '1 second'`);
    if (magasinId) allLeadConditions.push(eq(orders.magasinId, magasinId));
    const allLeads = await db.select({ id: orders.id }).from(orders).where(and(...allLeadConditions));

    // Delivered orders only — strict filter
    const orderConditions: any[] = [eq(orders.storeId, storeId), eq(orders.status, 'delivered'), eq(orders.mediaBuyerId, mediaBuyerId)];
    if (dateFrom) orderConditions.push(sql`${orders.createdAt} >= ${dateFrom}::timestamp`);
    if (dateTo) orderConditions.push(sql`${orders.createdAt} <= ${dateTo}::timestamp + interval '1 day' - interval '1 second'`);
    if (magasinId) orderConditions.push(eq(orders.magasinId, magasinId));
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
    if (magasinId) adSpendConditions.push(eq((adSpendTracking as any).magasinId, magasinId));
    const legacyEntries = await db.select({ amount: adSpendTracking.amount }).from(adSpendTracking).where(and(...adSpendConditions));
    const legacyAdSpend = legacyEntries.reduce((s, e) => s + Math.round(Number(e.amount ?? 0) * 100), 0);

    // New adSpend table (by userId = mediaBuyerId) — amounts already in centimes
    const newAdSpendConditions: any[] = [eq(adSpend.storeId, storeId), eq((adSpend as any).userId, mediaBuyerId)];
    if (dateFrom) newAdSpendConditions.push(sql`${adSpend.date} >= ${dateFrom.substring(0, 10)}`);
    if (dateTo) newAdSpendConditions.push(sql`${adSpend.date} <= ${dateTo.substring(0, 10)}`);
    if (magasinId) newAdSpendConditions.push(eq((adSpend as any).magasinId, magasinId));
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

  // ── Payments ─────────────────────────────────────────────────────────────

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [p] = await db.insert(payments).values(data).returning();
    return p;
  }

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByStore(storeId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.storeId, storeId)).orderBy(desc(payments.createdAt));
  }

  async approvePayment(id: number): Promise<void> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    if (!payment) return;

    // Mark payment as approved
    await db.update(payments).set({ status: "approved" }).where(eq(payments.id, id));

    // Determine plan limits
    const planLimitMap: Record<string, number> = { starter: 1500, pro: 5000, elite: 0 };
    const planPriceMap: Record<string, number> = { starter: 20000, pro: 40000, elite: 70000 };
    const monthlyLimit = planLimitMap[payment.plan] ?? 1500;
    const pricePerMonth = planPriceMap[payment.plan] ?? 20000;

    // Extend/set plan expiry by 30 days from today (or from current expiry if not yet expired)
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, payment.storeId));
    const now = new Date();
    let baseDate = now;
    if (sub?.planExpiryDate) {
      const exp = new Date(sub.planExpiryDate);
      if (exp > now) baseDate = exp; // extend from current expiry
    }
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + 30);

    if (sub) {
      await db.update(subscriptions).set({
        plan: payment.plan,
        monthlyLimit,
        pricePerMonth,
        isActive: 1,
        isBlocked: 0,
        planStartDate: now.toISOString(),
        planExpiryDate: newExpiry.toISOString(),
      }).where(eq(subscriptions.storeId, payment.storeId));
    } else {
      await db.insert(subscriptions).values({
        storeId: payment.storeId,
        plan: payment.plan,
        monthlyLimit,
        pricePerMonth,
        isActive: 1,
        isBlocked: 0,
        billingCycleStart: now.toISOString(),
        planStartDate: now.toISOString(),
        planExpiryDate: newExpiry.toISOString(),
        currentMonthOrders: 0,
      });
    }
  }

  async rejectPayment(id: number, notes?: string): Promise<void> {
    await db.update(payments).set({ status: "rejected", notes: notes ?? null }).where(eq(payments.id, id));
  }

  // ── AI Conversations ──────────────────────────────────────────────────────
  async getAiConversations(storeId: number) {
    const { aiConversations } = await import("@shared/schema");
    return db.select().from(aiConversations).where(eq(aiConversations.storeId, storeId)).orderBy(desc(aiConversations.lastMessageAt));
  }

  async getAiConversation(id: number) {
    const { aiConversations } = await import("@shared/schema");
    const [row] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
    return row;
  }

  async getActiveAiConversationByPhone(storeId: number, phone: string) {
    const { aiConversations } = await import("@shared/schema");
    // Try all possible phone formats to avoid mismatch between stored formats
    const stripped = phone.replace(/^\+/, "");   // remove leading +
    const local    = stripped.startsWith("212") ? `0${stripped.slice(3)}` : stripped;  // 0XXXXXXXX
    const e164     = `+${stripped}`;             // +212XXXXXXXX
    const intl     = stripped;                   // 212XXXXXXXX
    const [row] = await db.select().from(aiConversations).where(
      and(
        eq(aiConversations.storeId, storeId),
        // Include "confirmed" so delivery companion keeps responding post-confirm
        or(
          eq(aiConversations.status, "active"),
          eq(aiConversations.status, "confirmed"),
        ),
        or(
          eq(aiConversations.customerPhone, intl),
          eq(aiConversations.customerPhone, e164),
          eq(aiConversations.customerPhone, local),
          eq(aiConversations.customerPhone, `+${local}`),
        )
      )
    ).orderBy(desc(aiConversations.id));
    return row;
  }

  async getActiveAiConversationByJid(jid: string) {
    const { aiConversations } = await import("@shared/schema");
    const [row] = await db.select().from(aiConversations).where(
      and(
        eq(aiConversations.whatsappJid, jid),
        or(
          eq(aiConversations.status, "active"),
          eq(aiConversations.status, "confirmed"),
        ),
      )
    ).orderBy(desc(aiConversations.id));
    return row ?? null;
  }

  async updateConversationJid(id: number, jid: string) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ whatsappJid: jid }).where(eq(aiConversations.id, id));
  }

  async createAiConversation(data: import("@shared/schema").InsertAiConversation) {
    const { aiConversations } = await import("@shared/schema");
    const [row] = await db.insert(aiConversations).values(data).returning();
    return row;
  }

  async updateAiConversationStatus(id: number, status: string) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ status }).where(eq(aiConversations.id, id));
  }

  async updateConversationConfirmedAt(id: number, ts: Date) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ confirmedAt: ts }).where(eq(aiConversations.id, id));
  }

  async updateConversationNeedsAttention(id: number, val: number) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ needsAttention: val }).where(eq(aiConversations.id, id));
  }

  async updateAiConversationLastMessage(id: number, message: string) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ lastMessage: message, lastMessageAt: new Date() }).where(eq(aiConversations.id, id));
  }

  async setConversationManual(id: number, isManual: number) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set({ isManual, status: isManual ? "manual" : "active" }).where(eq(aiConversations.id, id));
  }

  async updateConversationStep(id: number, step: number, data?: { city?: string; variant?: string }) {
    const { aiConversations } = await import("@shared/schema");
    const update: Record<string, unknown> = { conversationStep: step };
    if (data?.city)    update.collectedCity    = data.city;
    if (data?.variant) update.collectedVariant = data.variant;
    await db.update(aiConversations).set(update).where(eq(aiConversations.id, id));
  }

  // ── Automation ────────────────────────────────────────────────────────────
  async getMarketingCampaigns(storeId: number) {
    const { marketingCampaigns } = await import("@shared/schema");
    return db.select().from(marketingCampaigns).where(eq(marketingCampaigns.storeId, storeId)).orderBy(desc(marketingCampaigns.createdAt));
  }

  async createMarketingCampaign(data: import("@shared/schema").InsertMarketingCampaign) {
    const { marketingCampaigns } = await import("@shared/schema");
    const [row] = await db.insert(marketingCampaigns).values(data).returning();
    return row;
  }

  async updateCampaignSent(id: number, totalSent: number, status: string) {
    const { marketingCampaigns } = await import("@shared/schema");
    await db.update(marketingCampaigns).set({ totalSent, status }).where(eq(marketingCampaigns.id, id));
  }

  async updateCampaignProgress(id: number, totalSent: number, totalFailed: number, status: string) {
    const { marketingCampaigns } = await import("@shared/schema");
    await db.update(marketingCampaigns).set({ totalSent, totalFailed, status }).where(eq(marketingCampaigns.id, id));
  }

  async getAiLogs(storeId: number, orderId?: number, convId?: number) {
    const { aiLogs } = await import("@shared/schema");
    const { isNull } = await import("drizzle-orm");
    let conds;
    if (convId !== undefined) {
      // Lead conversation: filter by convId
      conds = and(eq(aiLogs.storeId, storeId), eq(aiLogs.convId, convId));
    } else if (orderId !== undefined) {
      conds = and(eq(aiLogs.storeId, storeId), eq(aiLogs.orderId, orderId));
    } else {
      conds = eq(aiLogs.storeId, storeId);
    }
    return db.select().from(aiLogs).where(conds).orderBy(aiLogs.createdAt);
  }

  async createAiLog(data: import("@shared/schema").InsertAiLog) {
    const { aiLogs } = await import("@shared/schema");
    const [row] = await db.insert(aiLogs).values(data).returning();
    return row;
  }

  // ── Lead Sales Mode methods ────────────────────────────────────
  async getConnectedStoreIds(): Promise<number[]> {
    const { whatsappSessions } = await import("@shared/schema");
    const rows = await db.select({ storeId: whatsappSessions.storeId })
      .from(whatsappSessions)
      .where(eq(whatsappSessions.status, "connected"));
    return rows.map(r => r.storeId);
  }

  async phoneHasOrdersInStore(storeId: number, phone: string): Promise<boolean> {
    const { inArray } = await import("drizzle-orm");
    const digits = phone.replace(/\D/g, "");
    const variants = [
      digits,
      `+${digits}`,
      digits.startsWith("212") ? `0${digits.slice(3)}` : `212${digits.startsWith("0") ? digits.slice(1) : digits}`,
    ];
    const result = await db.select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.customerPhone, variants)))
      .limit(1);
    return result.length > 0;
  }

  /** Count all orders for a phone in a store (store-wide, handles 0X/212X variants) */
  async getPhoneOrderCount(storeId: number, phone: string): Promise<number> {
    const digits = phone.replace(/\D/g, "");
    const variants = [
      digits,
      `+${digits}`,
      digits.startsWith("212") ? `0${digits.slice(3)}` : `212${digits.startsWith("0") ? digits.slice(1) : digits}`,
    ];
    const [row] = await db.select({ cnt: count() })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.customerPhone, variants)));
    return row?.cnt ?? 0;
  }

  async updateLeadFields(convId: number, data: { leadStage?: string; leadName?: string; leadCity?: string; leadAddress?: string; leadProductId?: number | null; leadProductName?: string; leadPrice?: number; leadQuantity?: number; createdOrderId?: number }) {
    const { aiConversations } = await import("@shared/schema");
    await db.update(aiConversations).set(data as any).where(eq(aiConversations.id, convId));
  }

  /**
   * Create a minimal order from carrier-side data. Used when a webhook arrives
   * for a tracking number we don't have in the DB yet (orders shipped before
   * the integration was wired up), or by the "Importer commandes historiques"
   * batch import. Goes through getNextAgent so multi-magasin distribution
   * percentages still apply.
   */
  async createOrderFromCarrier(params: {
    storeId: number;
    magasinId?: number | null;
    provider: string;
    trackingNumber: string;
    customerName: string;
    customerPhone: string;
    customerAddress?: string;
    customerCity?: string;
    totalPrice?: number;
    shippingCost?: number;
    status?: string;
    rawStatus?: string;
  }): Promise<import("@shared/schema").Order> {
    // Idempotency guard — if an order with this tracking already exists for the
    // store, return it instead of creating a duplicate. Defends against
    // double-clicked imports and webhooks that race with the import button.
    if (params.trackingNumber) {
      const existing = await this.getOrderByTrackingNumber(params.storeId, params.trackingNumber);
      if (existing) {
        console.log(`[createOrderFromCarrier] Order already exists for tracking="${params.trackingNumber}" (id=${existing.id}) — returning existing.`);
        return existing;
      }
    }

    const orderNumber = `EXT-${params.trackingNumber}`;
    let assignedToId: number | null = null;
    try {
      assignedToId = await this.getNextAgent(
        params.storeId,
        params.magasinId ?? null,
        undefined,
        params.customerCity,
      );
    } catch (e: any) {
      console.warn(`[createOrderFromCarrier] getNextAgent failed: ${e?.message}`);
    }

    const [created] = await db.insert(orders).values({
      storeId:          params.storeId,
      magasinId:        params.magasinId ?? null,
      orderNumber,
      customerName:     params.customerName  || 'Client (importé)',
      customerPhone:    params.customerPhone || '',
      customerAddress:  params.customerAddress || '',
      customerCity:     params.customerCity    || '',
      totalPrice:       params.totalPrice ?? 0,
      shippingCost:     params.shippingCost ?? 0,
      trackNumber:      params.trackingNumber,
      shippingProvider: params.provider,
      status:           params.status || 'Attente De Ramassage',
      commentStatus:    params.rawStatus || '',
      source:           `${params.provider}_webhook`,
      assignedToId:     assignedToId ?? undefined,
    } as any).returning();
    return created;
  }

  async createOrderFromLead(data: { storeId: number; customerName: string; customerPhone: string; customerCity: string; customerAddress: string; productId: number | null; productName: string; price: number; quantity?: number }): Promise<import("@shared/schema").Order> {
    const { orderItems: orderItemsTable } = await import("@shared/schema");
    const qty = Math.max(1, data.quantity ?? 1);
    const orderNumber = `LEAD-${Date.now()}`;
    const [order] = await db.insert(orders).values({
      storeId: data.storeId,
      orderNumber,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerCity: data.customerCity,
      customerAddress: data.customerAddress,
      totalPrice: data.price * qty,
      status: "confirme",
      source: "whatsapp",
      utmSource: "WA-Direct-Ad",
      rawProductName: data.productName,
      productCost: 0,
      shippingCost: 0,
      adSpend: 0,
    }).returning();
    // Decrement stock if product linked
    if (data.productId) {
      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: data.productId,
        quantity: qty,
        price: data.price,
        rawProductName: data.productName,
      });
      // Decrement stock by quantity
      await db.update(products).set({ stock: sql`${products.stock} - ${qty}` }).where(and(eq(products.id, data.productId), sql`${products.stock} > 0`));
    }
    // Increment monthly order counter
    try { await this.incrementMonthlyOrders(data.storeId); } catch {}
    return order;
  }

  async getWhatsappSession(storeId: number) {
    const { whatsappSessions } = await import("@shared/schema");
    const [row] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.storeId, storeId));
    return row;
  }

  async upsertWhatsappSession(storeId: number, data: { status?: string; phone?: string | null; qrCode?: string | null }) {
    const { whatsappSessions } = await import("@shared/schema");
    const existing = await this.getWhatsappSession(storeId);
    if (existing) {
      const [row] = await db.update(whatsappSessions).set({ ...data, updatedAt: new Date() }).where(eq(whatsappSessions.storeId, storeId)).returning();
      return row;
    }
    const [row] = await db.insert(whatsappSessions).values({ storeId, ...data }).returning();
    return row;
  }

  async getAiSettings(storeId: number) {
    const { aiSettings } = await import("@shared/schema");
    const [row] = await db.select().from(aiSettings).where(eq(aiSettings.storeId, storeId));
    return row;
  }

  async upsertAiSettings(storeId: number, data: { enabled?: number; systemPrompt?: string | null; enabledProductIds?: number[]; openaiApiKey?: string | null; openrouterApiKey?: string | null; aiModel?: string | null }) {
    const { aiSettings } = await import("@shared/schema");
    const existing = await this.getAiSettings(storeId);
    if (existing) {
      const [row] = await db.update(aiSettings).set({ ...data, updatedAt: new Date() }).where(eq(aiSettings.storeId, storeId)).returning();
      return row;
    }
    const [row] = await db.insert(aiSettings).values({ storeId, ...data }).returning();
    return row;
  }

  // ── Recovery Settings ──────────────────────────────────────────────────────
  async getRecoverySettings(storeId: number) {
    const { recoverySettings } = await import("@shared/schema");
    const [row] = await db.select().from(recoverySettings).where(eq(recoverySettings.storeId, storeId));
    return row;
  }

  async upsertRecoverySettings(storeId: number, data: { enabled?: number; waitMinutes?: number }) {
    const { recoverySettings } = await import("@shared/schema");
    const existing = await this.getRecoverySettings(storeId);
    if (existing) {
      const [row] = await db.update(recoverySettings).set({ ...data, updatedAt: new Date() }).where(eq(recoverySettings.storeId, storeId)).returning();
      return row;
    }
    const [row] = await db.insert(recoverySettings).values({ storeId, ...data }).returning();
    return row;
  }

  async getAbandonedLeadsForRecovery(storeId: number, waitMinutes: number) {
    const { orders, aiConversations } = await import("@shared/schema");
    const cutoff = new Date(Date.now() - waitMinutes * 60 * 1000);
    // Get abandoned orders older than waitMinutes with no active AI conversation
    const candidates = await db
      .select({ id: orders.id, storeId: orders.storeId, customerPhone: orders.customerPhone, customerName: orders.customerName, rawProductName: orders.rawProductName, totalPrice: orders.totalPrice, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.status, "abandonné"), eq(orders.wasAbandoned, 1), lte(orders.createdAt, cutoff)));
    
    // Filter out those that already have an AI conversation
    const result = [];
    for (const o of candidates) {
      const [conv] = await db.select({ id: aiConversations.id }).from(aiConversations)
        .where(and(eq(aiConversations.storeId, storeId), eq(aiConversations.customerPhone, o.customerPhone)));
      if (!conv) result.push(o);
    }
    return result;
  }

  async getRecoveryStats(storeId: number) {
    const { orders } = await import("@shared/schema");
    const allAbandoned = await db.select({ id: orders.id, status: orders.status, totalPrice: orders.totalPrice })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.wasAbandoned, 1)));
    
    const total = allAbandoned.length;
    const recovered = allAbandoned.filter(o => o.status === "confirme");
    const revenueRecovered = recovered.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    return { total, recovered: recovered.length, revenueRecovered };
  }

  async getAllStoresWithRecoveryEnabled() {
    const { recoverySettings } = await import("@shared/schema");
    return db.select().from(recoverySettings).where(eq(recoverySettings.enabled, 1));
  }

  // ── Landing Pages ─────────────────────────────────────────────────────────

  async getLandingPages(storeId: number) {
    const { landingPages } = await import("@shared/schema");
    return db.select().from(landingPages)
      .where(eq(landingPages.storeId, storeId))
      .orderBy(desc(landingPages.createdAt));
  }

  async getLandingPage(id: number, storeId: number) {
    const { landingPages } = await import("@shared/schema");
    const [row] = await db.select().from(landingPages)
      .where(and(eq(landingPages.id, id), eq(landingPages.storeId, storeId)));
    return row;
  }

  async getLandingPageBySlug(slug: string) {
    const { landingPages } = await import("@shared/schema");
    const [row] = await db.select().from(landingPages)
      .where(and(eq(landingPages.slug, slug), eq(landingPages.isActive, 1)));
    return row;
  }

  async slugExists(slug: string, excludeId?: number) {
    const { landingPages } = await import("@shared/schema");
    const rows = await db.select({ id: landingPages.id }).from(landingPages)
      .where(eq(landingPages.slug, slug));
    if (excludeId) return rows.some(r => r.id !== excludeId);
    return rows.length > 0;
  }

  async createLandingPage(storeId: number, data: {
    slug: string; productName: string; priceDH: number; description?: string;
    heroImageUrl?: string; featuresImageUrl?: string; proofImageUrl?: string;
    copy?: any; theme?: string; customColor?: string;
  }) {
    const { landingPages } = await import("@shared/schema");
    const [row] = await db.insert(landingPages).values({
      storeId,
      slug: data.slug,
      productName: data.productName,
      priceDH: Math.round(data.priceDH),
      description: data.description ?? "",
      heroImageUrl: data.heroImageUrl ?? "",
      featuresImageUrl: data.featuresImageUrl ?? "",
      proofImageUrl: data.proofImageUrl ?? "",
      copy: data.copy ?? {},
      theme: data.theme ?? "navy",
      customColor: data.customColor ?? "",
      isActive: 1,
      orderCount: 0,
    }).returning();
    return row;
  }

  async updateLandingPage(id: number, storeId: number, data: Partial<{
    slug: string; productName: string; priceDH: number; description: string;
    heroImageUrl: string; featuresImageUrl: string; proofImageUrl: string;
    copy: any; theme: string; customColor: string; isActive: number;
  }>) {
    const { landingPages } = await import("@shared/schema");
    const [row] = await db.update(landingPages)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(landingPages.id, id), eq(landingPages.storeId, storeId)))
      .returning();
    return row;
  }

  async deleteLandingPage(id: number, storeId: number) {
    const { landingPages } = await import("@shared/schema");
    await db.delete(landingPages)
      .where(and(eq(landingPages.id, id), eq(landingPages.storeId, storeId)));
  }

  async incrementLandingPageOrderCount(id: number) {
    // Use raw SQL increment to avoid race conditions
    await db.execute(
      sql`UPDATE landing_pages SET order_count = COALESCE(order_count, 0) + 1 WHERE id = ${id}`
    );
  }
}

export const storage = new DatabaseStorage();

import { pgTable, text, serial, integer, timestamp, date, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id"),
  lastAssignedAgentId: integer("last_assigned_agent_id"),
  phone: text("phone"),
  website: text("website"),
  facebook: text("facebook"),
  instagram: text("instagram"),
  otherSocial: text("other_social"),
  logoUrl: text("logo_url"),
  coverImageUrl: text("cover_image_url"),
  canOpen: integer("can_open").default(1),
  isStock: integer("is_stock").default(0),
  isRamassage: integer("is_ramassage").default(0),
  whatsappTemplate: text("whatsapp_template"),
  whatsappTemplateCustom: text("whatsapp_template_custom"),
  whatsappTemplateShipping: text("whatsapp_template_shipping"),
  whatsappDefaultEnabled: integer("whatsapp_default_enabled").default(1),
  whatsappCustomEnabled: integer("whatsapp_custom_enabled").default(0),
  whatsappShippingEnabled: integer("whatsapp_shipping_enabled").default(0),
  webhookKey: text("webhook_key"),
  packagingCost: integer("packaging_cost").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  // username is not unique - multiple stores can have same name
  email: text("email"),
  phone: text("phone"),
  password: text("password").notNull(),
  role: text("role").notNull(),
  storeId: integer("store_id").references(() => stores.id),
  paymentType: text("payment_type").default("commission"),
  paymentAmount: integer("payment_amount").default(0),
  distributionMethod: text("distribution_method").default("auto"),
  isSuperAdmin: integer("is_super_admin").default(0),
  isActive: integer("is_active").default(1),
  isEmailVerified: integer("is_email_verified").default(0),
  preferredLanguage: text("preferred_language").default("fr"),
  dashboardPermissions: jsonb("dashboard_permissions"),
  buyerCode: text("buyer_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  stock: integer("stock").notNull().default(0),
  costPrice: integer("cost_price").notNull().default(0),
  sellingPrice: integer("selling_price").notNull().default(0),
  description: text("description"),
  descriptionDarija: text("description_darija"), // Darija product pitch for AI
  aiFeatures: text("ai_features"),               // JSON array of feature strings
  imageUrl: text("image_url"),
  reference: text("reference"),
  hasVariants: integer("has_variants").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  costPrice: integer("cost_price").notNull().default(0),
  sellingPrice: integer("selling_price").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  imageUrl: text("image_url"),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  orderNumber: text("order_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  status: text("status").notNull().default('nouveau'),
  totalPrice: integer("total_price").notNull().default(0),
  productCost: integer("product_cost").notNull().default(0),
  shippingCost: integer("shipping_cost").notNull().default(0),
  adSpend: integer("ad_spend").notNull().default(0),
  assignedToId: integer("assigned_to_id").references(() => users.id),
  comment: text("comment"),
  trackNumber: text("track_number"),
  labelLink: text("label_link"),
  shippingProvider: text("shipping_provider"),
  replacementTrackNumber: text("replacement_track_number"),
  isStock: integer("is_stock").default(0),
  upSell: integer("up_sell").default(0),
  canOpen: integer("can_open").default(1),
  replace: integer("replace").default(0),
  source: text("source").default("manual"),
  utmSource: text("utm_source"),
  utmCampaign: text("utm_campaign"),
  trafficPlatform: text("traffic_platform"),
  mediaBuyerId: integer("media_buyer_id").references(() => users.id),
  rawProductName: text("raw_product_name"),
  variantDetails: text("variant_details"),
  rawQuantity: integer("raw_quantity"),
  commentStatus: text("comment_status"),
  commentOrder: text("comment_order"),
  returnTrackingNumber: text("return_tracking_number"),
  wasAbandoned: integer("was_abandoned").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  pickupDate: timestamp("pickup_date"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price").notNull().default(0),
  rawProductName: text("raw_product_name"),
  variantInfo: text("variant_info"),
  sku: text("sku"),
});

export const adSpendTracking = pgTable("ad_spend_tracking", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  mediaBuyerId: integer("media_buyer_id").references(() => users.id),
  productId: integer("product_id").references(() => products.id),
  date: text("date").notNull(),
  amount: integer("amount").notNull().default(0),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adSpend = pgTable("ad_spend", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  productId: integer("product_id").references(() => products.id),
  source: text("source").notNull(),
  date: text("date").notNull(),
  amount: integer("amount").notNull().default(0),
  productSellingPrice: integer("product_selling_price"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Multi-account carrier connections ──────────────────────────────────────
// Supports multiple API keys per carrier per store (by city, by product, etc.)
export const carrierAccounts = pgTable("carrier_accounts", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  carrierName: text("carrier_name").notNull(),         // e.g. "digylog"
  connectionName: text("connection_name").notNull().default("Connection 1"),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret"),                       // optional
  apiUrl: text("api_url"),                             // optional override
  webhookToken: text("webhook_token").notNull(),        // unique slug for webhook URL
  storeName: text("store_name"),                       // user's label (boutique name)
  isDefault: integer("is_default").default(0),
  isActive: integer("is_active").default(1),
  assignmentRule: text("assignment_rule").default("default"), // "default"|"city"|"product"
  assignmentData: text("assignment_data"),             // JSON array of cities or SKUs
  settings: jsonb("settings").default({}),             // flexible carrier-specific config
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const storeIntegrations = pgTable("store_integrations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  credentials: text("credentials").notNull().default('{}'),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const integrationLogs = pgTable("integration_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  integrationId: integer("integration_id").references(() => storeIntegrations.id),
  provider: text("provider").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  plan: text("plan").notNull().default('trial'),
  monthlyLimit: integer("monthly_limit").notNull().default(60),
  pricePerMonth: integer("price_per_month").notNull().default(0),
  currentMonthOrders: integer("current_month_orders").notNull().default(0),
  billingCycleStart: timestamp("billing_cycle_start").defaultNow(),
  planStartDate: timestamp("plan_start_date"),
  planExpiryDate: timestamp("plan_expiry_date"),
  isActive: integer("is_active").default(1),
  isBlocked: integer("is_blocked").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  email: text("email"),
  orderCount: integer("order_count").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentProducts = pgTable("agent_products", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
});

// New table: per-store agent configuration (role, lead %, allowed products)
export const storeAgentSettings = pgTable("store_agent_settings", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => users.id).notNull(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  // 'confirmation' | 'suivi' | 'both'
  roleInStore: text("role_in_store").notNull().default("confirmation"),
  // 0-100, used for weighted lead distribution
  leadPercentage: integer("lead_percentage").notNull().default(100),
  // JSON array of product IDs, e.g. '[1,2,3]'. Empty array means all products allowed.
  allowedProductIds: text("allowed_product_ids").notNull().default("[]"),
  // JSON array of Moroccan region values, e.g. '["casablanca","rabat"]'. Empty means all regions.
  allowedRegions: text("allowed_regions").notNull().default("[]"),
  // Commission en DH par commande livrée (statut 'delivered')
  commissionRate: integer("commission_rate").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// New table: follow-up log entries per order (Journal de Suivi)
export const orderFollowUpLogs = pgTable("order_follow_up_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  agentId: integer("agent_id").references(() => users.id),
  agentName: text("agent_name"),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  plan: text("plan").notNull(),
  amountDh: integer("amount_dh").notNull(),
  amountUsd: integer("amount_usd").notNull(),
  currency: text("currency").notNull().default("dh"),
  method: text("method").notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  ownerName: text("owner_name"),
  ownerEmail: text("owner_email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  store: one(stores, {
    fields: [subscriptions.storeId],
    references: [stores.id],
  }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  store: one(stores, {
    fields: [customers.storeId],
    references: [stores.id],
  }),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  products: many(products),
  orders: many(orders),
  customers: many(customers),
  subscriptions: many(subscriptions),
  agentSettings: many(storeAgentSettings),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  assignedOrders: many(orders),
  storeSettings: many(storeAgentSettings),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
  agent: one(users, {
    fields: [orders.assignedToId],
    references: [users.id],
  }),
  items: many(orderItems),
  followUpLogs: many(orderFollowUpLogs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const adSpendTrackingRelations = relations(adSpendTracking, ({ one }) => ({
  store: one(stores, {
    fields: [adSpendTracking.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [adSpendTracking.productId],
    references: [products.id],
  }),
}));

export const storeIntegrationsRelations = relations(storeIntegrations, ({ one, many }) => ({
  store: one(stores, {
    fields: [storeIntegrations.storeId],
    references: [stores.id],
  }),
  logs: many(integrationLogs),
}));

export const integrationLogsRelations = relations(integrationLogs, ({ one }) => ({
  store: one(stores, {
    fields: [integrationLogs.storeId],
    references: [stores.id],
  }),
  integration: one(storeIntegrations, {
    fields: [integrationLogs.integrationId],
    references: [storeIntegrations.id],
  }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [productVariants.storeId],
    references: [stores.id],
  }),
}));

export const agentProductsRelations = relations(agentProducts, ({ one }) => ({
  agent: one(users, {
    fields: [agentProducts.agentId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [agentProducts.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [agentProducts.storeId],
    references: [stores.id],
  }),
}));

export const storeAgentSettingsRelations = relations(storeAgentSettings, ({ one }) => ({
  agent: one(users, {
    fields: [storeAgentSettings.agentId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [storeAgentSettings.storeId],
    references: [stores.id],
  }),
}));

export const orderFollowUpLogsRelations = relations(orderFollowUpLogs, ({ one }) => ({
  order: one(orders, {
    fields: [orderFollowUpLogs.orderId],
    references: [orders.id],
  }),
  agent: one(users, {
    fields: [orderFollowUpLogs.agentId],
    references: [users.id],
  }),
}));

export const insertStoreSchema = createInsertSchema(stores).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertProductVariantSchema = createInsertSchema(productVariants).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertAdSpendSchema = createInsertSchema(adSpendTracking).omit({ id: true, createdAt: true });
export const insertAdSpendNewSchema = createInsertSchema(adSpend).omit({ id: true, createdAt: true });
export const insertCarrierAccountSchema = createInsertSchema(carrierAccounts).omit({ id: true, createdAt: true });
export const insertIntegrationSchema = createInsertSchema(storeIntegrations).omit({ id: true, createdAt: true });
export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({ id: true, createdAt: true });
export const insertAgentProductSchema = createInsertSchema(agentProducts).omit({ id: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertStoreAgentSettingsSchema = createInsertSchema(storeAgentSettings).omit({ id: true, createdAt: true });
export const insertOrderFollowUpLogSchema = createInsertSchema(orderFollowUpLogs).omit({ id: true, createdAt: true });

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type AdSpendEntry = typeof adSpendTracking.$inferSelect;
export type InsertAdSpend = z.infer<typeof insertAdSpendSchema>;
export type AdSpendNewEntry = typeof adSpend.$inferSelect;
export type InsertAdSpendNew = z.infer<typeof insertAdSpendNewSchema>;
export type CarrierAccount = typeof carrierAccounts.$inferSelect;
export type InsertCarrierAccount = z.infer<typeof insertCarrierAccountSchema>;
export type StoreIntegration = typeof storeIntegrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type IntegrationLog = typeof integrationLogs.$inferSelect;
export type InsertIntegrationLog = z.infer<typeof insertIntegrationLogSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type AgentProduct = typeof agentProducts.$inferSelect;
export type InsertAgentProduct = z.infer<typeof insertAgentProductSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type StoreAgentSetting = typeof storeAgentSettings.$inferSelect;
export type InsertStoreAgentSetting = z.infer<typeof insertStoreAgentSettingsSchema>;
export type OrderFollowUpLog = typeof orderFollowUpLogs.$inferSelect;
export type InsertOrderFollowUpLog = z.infer<typeof insertOrderFollowUpLogSchema>;

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ─── Stock Logs (Audit Trail) ──────────────────────────────────────────────
export const stockLogs = pgTable("stock_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  orderId: integer("order_id").references(() => orders.id),
  changeAmount: integer("change_amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStockLogSchema = createInsertSchema(stockLogs).omit({ id: true, createdAt: true });
export type StockLog = typeof stockLogs.$inferSelect;
export type InsertStockLog = z.infer<typeof insertStockLogSchema>;

export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};

export type OrderWithDetails = Order & {
  agent?: User | null;
  items: (OrderItem & { product: Product })[];
};

// ─── AI Conversations (live chat monitoring) ───────────────────────────────
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  orderId: integer("order_id").references(() => orders.id),
  customerPhone: text("customer_phone").notNull(),
  customerName: text("customer_name"),
  status: text("status").default("active"), // active | confirmed | cancelled | manual | closed
  isManual: integer("is_manual").default(0),
  needsAttention: integer("needs_attention").default(0), // 1 = admin attention required
  conversationStep: integer("conversation_step").default(1), // 1=city 2=variant 3=confirm
  collectedCity: text("collected_city"),    // city confirmed by customer
  collectedVariant: text("collected_variant"), // size/color confirmed by customer
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  // ── Facebook Ads Lead Sales Mode ─────────────────────────────
  isNewLead: integer("is_new_lead").default(0),          // 1 = from FB Ads, no prior order
  leadStage: text("lead_stage"),                          // AWAITING_NAME|AWAITING_CITY|AWAITING_ADDRESS|AWAITING_PRODUCT|AWAITING_CONFIRM|DONE
  leadName: text("lead_name"),
  leadCity: text("lead_city"),
  leadAddress: text("lead_address"),
  leadProductId: integer("lead_product_id"),
  leadProductName: text("lead_product_name"),
  leadPrice: integer("lead_price"),                       // centimes
  leadQuantity: integer("lead_quantity").default(1),
  createdOrderId: integer("created_order_id"),
  whatsappJid: text("whatsapp_jid"),  // Actual WhatsApp JID (e.g. 212632595440@s.whatsapp.net) for exact routing
  confirmedAt: timestamp("confirmed_at"),  // Set when order is confirmed — used for AI performance metrics
});
export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;

// ─── Marketing Campaigns ───────────────────────────────────────────────────
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  productLink: text("product_link"),
  targetFilter: text("target_filter").default("delivered"),
  status: text("status").default("draft"), // draft | running | paused | completed | stopped
  totalTargets: integer("total_targets").default(0),
  totalSent: integer("total_sent").default(0),
  totalFailed: integer("total_failed").default(0),
  senderDeviceId: integer("sender_device_id"),       // null = primary store session
  rotationEnabled: integer("rotation_enabled").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({ id: true, createdAt: true });
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

// ─── Retargeting Leads (imported from CSV/XLSX) ────────────────────────────
export const retargetingLeads = pgTable("retargeting_leads", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name"),
  phone: text("phone").notNull(),
  lastProduct: text("last_product"),
  source: text("source").default("import"),    // "import" | "manual"
  importedAt: timestamp("imported_at").defaultNow(),
});
export const insertRetargetingLeadSchema = createInsertSchema(retargetingLeads).omit({ id: true, importedAt: true });
export type RetargetingLead = typeof retargetingLeads.$inferSelect;
export type InsertRetargetingLead = z.infer<typeof insertRetargetingLeadSchema>;

// ─── WhatsApp Devices (multi-device per store) ─────────────────────────────
export const whatsappDevices = pgTable("whatsapp_devices", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  label: text("label").notNull().default("WhatsApp"),
  status: text("status").default("disconnected"), // connected | disconnected | qr | connecting
  phone: text("phone"),
  qrCode: text("qr_code"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertWhatsappDeviceSchema = createInsertSchema(whatsappDevices).omit({ id: true, updatedAt: true });
export type WhatsappDevice = typeof whatsappDevices.$inferSelect;
export type InsertWhatsappDevice = z.infer<typeof insertWhatsappDeviceSchema>;

// ─── Campaign Logs (per-message send tracking) ─────────────────────────────
export const campaignLogs = pgTable("campaign_logs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => marketingCampaigns.id).notNull(),
  deviceId: integer("device_id"),   // null = primary store session
  phone: text("phone").notNull(),
  status: text("status").notNull(), // "sent" | "failed"
  sentAt: timestamp("sent_at").defaultNow(),
});

// ─── AI Conversation Logs ──────────────────────────────────────────────────
export const aiLogs = pgTable("ai_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  orderId: integer("order_id").references(() => orders.id),
  convId: integer("conv_id"),  // FK to aiConversations.id — used for lead convs with no orderId
  customerPhone: text("customer_phone"),
  role: text("role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertAiLogSchema = createInsertSchema(aiLogs).omit({ id: true, createdAt: true });
export type AiLog = typeof aiLogs.$inferSelect;
export type InsertAiLog = z.infer<typeof insertAiLogSchema>;

// ─── WhatsApp Sessions ─────────────────────────────────────────────────────
export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull().unique(),
  status: text("status").default("disconnected"),
  phone: text("phone"),
  qrCode: text("qr_code"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type WhatsappSession = typeof whatsappSessions.$inferSelect;

// ─── AI Settings per Store ─────────────────────────────────────────────────
export const aiSettings = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull().unique(),
  enabled: integer("enabled").default(0),
  systemPrompt: text("system_prompt"),
  enabledProductIds: jsonb("enabled_product_ids").$type<number[]>().default([]),
  openaiApiKey: text("openai_api_key"),
  openrouterApiKey: text("openrouter_api_key"),
  aiModel: text("ai_model").default("openai/gpt-4o-mini"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type AiSetting = typeof aiSettings.$inferSelect;

// ─── AI Recovery Settings per Store ────────────────────────────────────────
export const recoverySettings = pgTable("recovery_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull().unique(),
  enabled: integer("enabled").default(0),
  waitMinutes: integer("wait_minutes").default(30),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertRecoverySettingsSchema = createInsertSchema(recoverySettings).omit({ id: true, updatedAt: true });
export type RecoverySetting = typeof recoverySettings.$inferSelect;
export type InsertRecoverySetting = z.infer<typeof insertRecoverySettingsSchema>;

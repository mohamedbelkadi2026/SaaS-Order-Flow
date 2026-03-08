import { pgTable, text, serial, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id"),
  lastAssignedAgentId: integer("last_assigned_agent_id"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price").notNull().default(0),
});

export const adSpendTracking = pgTable("ad_spend_tracking", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  date: text("date").notNull(),
  amount: integer("amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
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
  plan: text("plan").notNull().default('starter'),
  monthlyLimit: integer("monthly_limit").notNull().default(1500),
  pricePerMonth: integer("price_per_month").notNull().default(20000),
  currentMonthOrders: integer("current_month_orders").notNull().default(0),
  billingCycleStart: timestamp("billing_cycle_start").defaultNow(),
  isActive: integer("is_active").default(1),
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

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
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
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  assignedOrders: many(orders),
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

export const insertStoreSchema = createInsertSchema(stores).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertProductVariantSchema = createInsertSchema(productVariants).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertAdSpendSchema = createInsertSchema(adSpendTracking).omit({ id: true, createdAt: true });
export const insertIntegrationSchema = createInsertSchema(storeIntegrations).omit({ id: true, createdAt: true });
export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({ id: true, createdAt: true });
export const insertAgentProductSchema = createInsertSchema(agentProducts).omit({ id: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });

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

export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};

export type OrderWithDetails = Order & {
  agent?: User | null;
  items: (OrderItem & { product: Product })[];
};

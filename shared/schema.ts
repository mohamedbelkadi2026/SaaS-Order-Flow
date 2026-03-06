import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  role: text("role").notNull(), // 'owner' or 'agent'
  storeId: integer("store_id").references(() => stores.id),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  stock: integer("stock").notNull().default(0),
  costPrice: integer("cost_price").notNull().default(0), // in cents
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id).notNull(),
  orderNumber: text("order_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  status: text("status").notNull().default('new'), // new, confirmed, in_progress, cancelled, delivered, refused
  totalPrice: integer("total_price").notNull().default(0), // in cents
  productCost: integer("product_cost").notNull().default(0), // in cents
  shippingCost: integer("shipping_cost").notNull().default(0), // in cents
  adSpend: integer("ad_spend").notNull().default(0), // in cents
  assignedToId: integer("assigned_to_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price").notNull().default(0), // in cents
});

// Relations
export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  products: many(products),
  orders: many(orders),
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

// Schemas
export const insertStoreSchema = createInsertSchema(stores).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });

// Types
export type Store = typeof stores.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

export type OrderWithDetails = Order & {
  agent?: User | null;
  items: (OrderItem & { product: Product })[];
};

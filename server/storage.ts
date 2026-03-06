import { db } from "./db";
import { 
  users, stores, products, orders, orderItems,
  type User, type Store, type Product, type Order, type OrderItem, type OrderWithDetails,
  type InsertUser, type InsertStore, type InsertProduct, type InsertOrder, type InsertOrderItem
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Store
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  
  // Users/Agents
  getUsersByStore(storeId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  
  // Products
  getProductsByStore(storeId: number): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductStock(id: number, stockDelta: number): Promise<Product | undefined>;
  
  // Orders
  getOrdersByStore(storeId: number): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  assignOrder(id: number, agentId: number | null): Promise<Order | undefined>;
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

  async getOrdersByStore(storeId: number): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders).where(eq(orders.storeId, storeId)).orderBy(desc(orders.createdAt));
    
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
    const [updated] = await db.update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
      
    // If status is confirmed, reduce stock
    if (status === 'confirmed') {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      for (const item of items) {
        await this.updateProductStock(item.productId, -item.quantity);
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
}

export const storage = new DatabaseStorage();

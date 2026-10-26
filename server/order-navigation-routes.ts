import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { storage } from "./storage";
import { orders, type User } from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { casablancaTomorrow } from "./utils/casablanca-time";

// Navigation needs counts and eight labels, never products, order items or
// profitability. Aggregate the entire visible pool while bounding row output.
export async function readOrderNavigationSummary(
  database: typeof db,
  storeId: number,
  agentIds?: number | number[],
  tomorrow: string = casablancaTomorrow(),
) {
  const conditions = [eq(orders.storeId, storeId)];
  if (agentIds !== undefined) {
    const ids = Array.isArray(agentIds) ? agentIds : [agentIds];
    conditions.push(ids.length ? inArray(orders.assignedToId, ids) : sql`false`);
  }
  const where = and(...conditions);
  const started = Date.now();
  const [counts, recentOrders] = await Promise.all([
    database.select({
      nouveau: sql<number>`count(*) filter (where ${orders.status} = 'nouveau')`,
      rappel: sql<number>`count(*) filter (where ${orders.status} = 'rappel')`,
      confirmeReporteDueSoon: sql<number>`count(*) filter (where ${orders.status} = 'confirme_reporte' and ${orders.scheduledFor} <= ${tomorrow}::date)`,
    }).from(orders).where(where),
    database.select({ id: orders.id, customerName: orders.customerName,
      status: orders.status, createdAt: orders.createdAt,
    }).from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(8),
  ]);
  const queryMs = Date.now() - started;
  if (queryMs >= 1000) console.warn("[NAVIGATION-PERF]", { queryMs, rows: recentOrders.length });
  return {
    nouveau: Number(counts[0]?.nouveau ?? 0),
    rappel: Number(counts[0]?.rappel ?? 0),
    confirmeReporteDueSoon: Number(counts[0]?.confirmeReporteDueSoon ?? 0),
    recentOrders,
  };
}

export function registerOrderNavigationRoutes(app: Express, requireAuth: RequestHandler) {
  app.get("/api/orders/navigation-summary", requireAuth, async (req, res) => {
    const user = req.user! as User;
    if (!user.storeId || user.role === "media_buyer") return res.status(403).json({ message: "Accès refusé" });
    const agentIds = user.role === "agent" ? await storage.getVisibleAgentIds(user) : undefined;
    res.setHeader("Cache-Control", "no-store");
    res.json(await readOrderNavigationSummary(db, user.storeId, agentIds));
  });
}

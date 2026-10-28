import { db } from "./db";
import { aiSettings, orders, orderItems, aiConversations } from "@shared/schema";
import { and, eq, asc, sql } from "drizzle-orm";
import { triggerAIForNewOrder } from "./ai-agent";

// Catch every intake path, including imports and orders already in Nouveaux.
// Bounded per store to respect the existing WhatsApp send queue.
export async function runAiConfirmationBatch() {
  const settings = await db.select({ storeId: aiSettings.storeId, scopeMode: aiSettings.scopeMode,
    enabledProductIds: aiSettings.enabledProductIds }).from(aiSettings).where(and(eq(aiSettings.enabled, 1),
      sql`trim(coalesce(${aiSettings.greenApiInstanceId}, '')) <> ''`,
      sql`trim(coalesce(${aiSettings.greenApiApiToken}, '')) <> ''`,
      sql`(trim(coalesce(${aiSettings.openrouterApiKey}, '')) <> '' OR trim(coalesce(${aiSettings.openaiApiKey}, '')) <> '')`,
    ));
  for (const setting of settings) {
    const candidates = await db.select({ id: orders.id, customerPhone: orders.customerPhone,
      customerName: orders.customerName }).from(orders).where(and(
      eq(orders.storeId, setting.storeId), eq(orders.status, "nouveau"),
      sql`coalesce(${orders.customerPhone}, '') <> ''`,
      setting.scopeMode === "whatsapp_only" ? sql`lower(trim(coalesce(${orders.source}, ''))) = 'whatsapp'` :
        setting.scopeMode === "non_whatsapp" ? sql`lower(trim(coalesce(${orders.source}, ''))) <> 'whatsapp'` : undefined,
      setting.enabledProductIds?.length ? sql`EXISTS (
        SELECT 1 FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id}
          AND ${orderItems.productId} IN (${sql.join(setting.enabledProductIds.map(id => sql`${id}`), sql`, `)})
      )` : undefined,
      sql`NOT EXISTS (SELECT 1 FROM ${aiConversations} WHERE ${aiConversations.storeId} = ${orders.storeId}
        AND ${aiConversations.orderId} = ${orders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM ${aiConversations} WHERE ${aiConversations.storeId} = ${orders.storeId}
        AND ${aiConversations.status} = 'active'
        AND regexp_replace(regexp_replace(${aiConversations.customerPhone}, '[^0-9]', '', 'g'), '^0', '212') =
          regexp_replace(regexp_replace(${orders.customerPhone}, '[^0-9]', '', 'g'), '^0', '212'))`,
    )).orderBy(asc(orders.id)).limit(5);
    for (const order of candidates) {
      await triggerAIForNewOrder(setting.storeId, order.id, order.customerPhone, order.customerName);
    }
  }
}

export function startAiConfirmationJob(intervals: NodeJS.Timeout[]) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runAiConfirmationBatch(); }
    catch (err: any) { console.error("[AI confirmation] Pending-order batch failed:", err.message); }
    finally { running = false; }
  };
  intervals.push(setTimeout(() => void run(), 15_000));
  intervals.push(setInterval(() => void run(), 60_000));
}

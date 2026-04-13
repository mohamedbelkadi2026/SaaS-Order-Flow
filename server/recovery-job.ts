import { storage } from "./storage";
import { triggerRecoveryMessage } from "./ai-agent";
import { db } from "./db";
import { products, orderItems } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getWaAutoSettings } from "./routes";

const JOB_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

async function getProductStock(orderId: number): Promise<number | null> {
  try {
    const items = await db.select({ productId: orderItems.productId }).from(orderItems).where(eq(orderItems.orderId, orderId));
    if (!items.length || !items[0].productId) return null;
    const [p] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, items[0].productId));
    return p?.stock ?? null;
  } catch {
    return null;
  }
}

async function runRecoveryJob() {
  try {
    const allEnabled = await storage.getAllStoresWithRecoveryEnabled();
    if (!allEnabled.length) return;

    for (const settings of allEnabled) {
      const { storeId, waitMinutes } = settings;

      // Honour the per-store auto-settings toggle
      if (!getWaAutoSettings(storeId).recoveryMessages) {
        console.log(`[Recovery] Store ${storeId}: recovery messages disabled — skipping`);
        continue;
      }

      const leads = await storage.getAbandonedLeadsForRecovery(storeId, waitMinutes ?? 30);
      if (!leads.length) continue;

      console.log(`[Recovery] Store ${storeId}: ${leads.length} abandoned lead(s) eligible for recovery`);

      for (const lead of leads) {
        try {
          const stockQty = await getProductStock(lead.id);
          await triggerRecoveryMessage(
            lead.storeId,
            lead.id,
            lead.customerPhone,
            lead.customerName || "سيدي/لالة",
            lead.rawProductName || "المنتج",
            stockQty,
          );
          console.log(`[Recovery] Sent recovery message to ${lead.customerPhone} for order ${lead.id}`);
        } catch (e: any) {
          console.error(`[Recovery] Failed for order ${lead.id}:`, e.message);
        }
      }
    }
  } catch (e: any) {
    console.error("[Recovery] Job error:", e.message);
  }
}

export function startRecoveryJob(intervals?: NodeJS.Timeout[]) {
  console.log("[Recovery] Background job started (checks every 5 minutes)");
  const run = async () => {
    try {
      await runRecoveryJob();
    } catch (e: any) {
      console.error('[Recovery] Job error (continuing):', e.message);
    }
  };
  const timeoutId = setTimeout(() => {
    run();
    const intervalId = setInterval(run, JOB_INTERVAL_MS);
    if (intervals) intervals.push(intervalId);
  }, 60 * 1000);
  if (intervals) intervals.push(timeoutId as any);
}

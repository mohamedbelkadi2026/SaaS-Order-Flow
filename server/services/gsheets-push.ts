/**
 * Push order events to a Google Apps Script webhook (write direction).
 * Called after order creation and status changes.
 * Never throws — all errors are swallowed to avoid blocking the caller.
 */
import { db } from "../db";
import { storeIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function pushOrderToSheet(storeId: number, payload: {
  action: "order.created" | "order.updated";
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  productName: string;
  totalPrice: number;
  quantity: number;
  note: string | null;
  status: string;
  utmSource: string | null;
  utmCampaign: string | null;
  productId: number | null;
  magasin: string | null;
  createdAt: string;
  sourceUrl?: string;
}) {
  try {
    const [conn] = await db.select().from(storeIntegrations)
      .where(and(
        eq(storeIntegrations.storeId, storeId),
        eq(storeIntegrations.provider, "gsheets"),
        eq(storeIntegrations.status, "active"),
      ))
      .limit(1);

    const webhookUrl = (conn as any)?.gsheetWebhookUrl;
    if (!webhookUrl) return;

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(`[GSHEETS-PUSH] storeId=${storeId} HTTP ${resp.status}`);
    } else {
      console.log(`[GSHEETS-PUSH] storeId=${storeId} action=${payload.action} order=${payload.orderNumber} ✅`);
    }
  } catch (err: any) {
    console.warn(`[GSHEETS-PUSH] storeId=${storeId} error: ${err.message}`);
  }
}

import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { offerRequests, orderItems, orders } from "@shared/schema";

export const AUTO_CANCEL_REASON =
  "Automatically cancelled: no leads generated within 7 days of acceptance";

/**
 * Cancels accepted TajerDrop offer requests that did not produce a seller lead
 * within seven days. "Mon Stock" is derived from accepted requests, therefore
 * no separate deletion is needed when a request is cancelled.
 */
export async function expireInactiveTajerDropOfferRequests(now = new Date()): Promise<number> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pendingExpiry = await db
    .select()
    .from(offerRequests)
    .where(and(
      eq(offerRequests.status, "accepted"),
      gte(offerRequests.acceptedAt, new Date(0)),
    ));

  let expired = 0;
  for (const request of pendingExpiry) {
    if (!request.acceptedAt || request.acceptedAt > sevenDaysAgo) continue;

    const [lead] = await db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.storeId, request.sellerStoreId),
        eq(orderItems.productId, request.productId),
        gte(orders.createdAt, request.acceptedAt),
      ))
      .limit(1);

    if (lead) continue;

    const result = await db
      .update(offerRequests)
      .set({
        status: "automatically_cancelled",
        cancelReason: AUTO_CANCEL_REASON,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(offerRequests.id, request.id),
        eq(offerRequests.status, "accepted"),
      ))
      .returning({ id: offerRequests.id });
    if (result.length) expired++;
  }

  if (expired) {
    console.log(`[TAJERDROP-OFFER-EXPIRY] Automatically cancelled ${expired} inactive offer request(s).`);
  }
  return expired;
}
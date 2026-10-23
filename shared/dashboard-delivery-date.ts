import { isDeliveredStatus } from "./order-status-sets";
import { moroccoDayStart, moroccoDayEnd } from "./morocco-time";

export type DeliveredOrderDate = { status?: string | null; deliveredAt?: Date | string | null };

/** Delivered cohort, bounded by Moroccan calendar days, without guessing missing dates. */
export function filterOrdersByDeliveryDate<T extends DeliveredOrderDate>(orders: T[], dateFrom?: string, dateTo?: string): T[] {
  const from = dateFrom ? moroccoDayStart(dateFrom).getTime() : -Infinity;
  const to = dateTo ? moroccoDayEnd(dateTo).getTime() : Infinity;
  return orders.filter(order => {
    if (!isDeliveredStatus(order.status) || !order.deliveredAt) return false;
    const date = new Date(order.deliveredAt).getTime();
    return Number.isFinite(date) && date >= from && date <= to;
  });
}

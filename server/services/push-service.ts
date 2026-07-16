import webPush from "web-push";
import { storage } from "../storage";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || "mailto:admin@tajergrow.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[Push] VAPID keys not configured — web push disabled");
}

export const PUSH_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;

type EventType = "new_order" | "status_update";

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  orderId?: number;
  type?: string;
}

// Statuses that are "important" by default (not noisy carrier micro-updates)
const IMPORTANT_STATUSES = new Set([
  "confirme", "delivered", "livré", "refusé", "refused",
  "retourné", "returned", "annulé", "cancelled",
]);

function userPrefs(user: any) {
  return (user.notifSettings ?? {}) as {
    sound?: boolean;
    newOrder?: boolean;
    statusUpdate?: boolean;
    importantOnly?: boolean;
  };
}

/**
 * Returns the distinct userIds who should receive a push for this order event,
 * filtered by role + notification preferences. Never crosses store boundaries.
 */
export async function recipientsForOrder(
  order: { id: number; storeId: number; assignedToId?: number | null },
  eventType: EventType,
  newStatus?: string,
): Promise<number[]> {
  const allUsers = await storage.getUsersByStore(order.storeId);
  const recipients = new Set<number>();

  for (const user of allUsers) {
    const p = userPrefs(user);

    if (eventType === "new_order" && p.newOrder === false) continue;
    if (eventType === "status_update") {
      if (p.statusUpdate === false) continue;
      // importantOnly defaults to true (undefined = important only)
      const important = p.importantOnly !== false;
      if (important && newStatus && !IMPORTANT_STATUSES.has(newStatus)) continue;
    }

    const isAdmin = user.role === "owner" || user.role === "admin";
    if (isAdmin) {
      recipients.add(user.id);
    } else if (order.assignedToId && user.id === order.assignedToId) {
      recipients.add(user.id);
    }
  }

  return Array.from(recipients);
}

/** Send a push to all devices of a single user; prune stale subscriptions. */
export async function sendPushToUser(
  userId: number,
  _storeId: number,
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subs = await storage.getPushSubscriptionsByUser(userId);
  const dead: string[] = [];

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else console.error("[Push] send error:", err.message);
    }
  }

  if (dead.length) await storage.deletePushSubscriptionsByEndpoints(dead);
}

const sentNewOrders = new Set<number>(); // in-process dedup for new orders

/** Fire-and-forget: push for a newly created order. */
export function notifyNewOrder(order: {
  id: number; storeId: number; assignedToId?: number | null;
  customerName: string; customerCity?: string | null; totalPrice: number;
}): void {
  if (sentNewOrders.has(order.id)) return;
  sentNewOrders.add(order.id);
  setTimeout(() => sentNewOrders.delete(order.id), 60_000);

  recipientsForOrder(order, "new_order").then(async (ids) => {
    const price = ((order.totalPrice ?? 0) / 100).toFixed(0);
    const city  = order.customerCity ? ` · ${order.customerCity}` : "";
    const body  = `${order.customerName}${city} · ${price} MAD`;
    await Promise.all(ids.map((uid) =>
      sendPushToUser(uid, order.storeId, {
        title: "Nouvelle commande 🛍️",
        body,
        icon: "/android-chrome-192.png",
        orderId: order.id,
        type: "new_order",
      }),
    ));
  }).catch((e) => console.error("[Push] notifyNewOrder error:", e));
}

const STATUS_LABELS: Record<string, string> = {
  confirme: "Confirmé ✅", delivered: "Livré 📦", livré: "Livré 📦",
  refusé: "Refusé ❌", refused: "Refusé ❌", retourné: "Retourné 🔙",
  returned: "Retourné 🔙", annulé: "Annulé 🚫", cancelled: "Annulé 🚫",
  in_progress: "En transit 🚚", nouveau: "Nouveau 🆕", confirme_reporte: "Reporté 📅",
};

/** Fire-and-forget: push for a status change. */
export function notifyStatusUpdate(
  order: { id: number; storeId: number; assignedToId?: number | null; customerName: string },
  newStatus: string,
): void {
  recipientsForOrder(order, "status_update", newStatus).then(async (ids) => {
    const label = STATUS_LABELS[newStatus] || newStatus;
    await Promise.all(ids.map((uid) =>
      sendPushToUser(uid, order.storeId, {
        title: "Mise à jour commande",
        body: `${label} · ${order.customerName}`,
        icon: "/android-chrome-192.png",
        orderId: order.id,
        type: "status_update",
      }),
    ));
  }).catch((e) => console.error("[Push] notifyStatusUpdate error:", e));
}

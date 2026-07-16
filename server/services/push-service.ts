import webPush from "web-push";
import { storage } from "../storage";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || "mailto:admin@tajergrow.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[Push] VAPID keys loaded ✅ — public key starts:", VAPID_PUBLIC_KEY.slice(0, 12) + "…");
} else {
  console.error("[Push] ⚠️  VAPID keys NOT configured — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in env. Web push disabled.");
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

/** Send a push to all devices of a single user; prune stale subscriptions. Returns send results. */
export async function sendPushToUser(
  userId: number,
  _storeId: number,
  payload: PushPayload,
): Promise<{ ok: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(`[Push] VAPID not configured — skipping push to user ${userId}`);
    return { ok: 0, failed: 0 };
  }

  const subs = await storage.getPushSubscriptionsByUser(userId);
  console.log(`[Push] → user=${userId} type=${payload.type} subs=${subs.length}`);

  const dead: string[] = [];
  let ok = 0;
  let failed = 0;

  for (const sub of subs) {
    const shortEndpoint = "…" + sub.endpoint.slice(-30);
    try {
      const result = await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
      console.log(`[Push] ✅ sent to ${shortEndpoint} status=${(result as any).statusCode ?? 201}`);
      ok++;
    } catch (err: any) {
      console.error(`[Push] ❌ error for ${shortEndpoint}: statusCode=${err.statusCode} body=${err.body?.slice?.(0, 120) ?? err.message}`);
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else failed++;
    }
  }

  if (dead.length) {
    console.log(`[Push] pruning ${dead.length} stale subscription(s)`);
    await storage.deletePushSubscriptionsByEndpoints(dead);
  }

  return { ok, failed };
}

/** Send a test push to all subscriptions of a user. Returns detailed results for the API response. */
export async function sendTestPushToUser(userId: number): Promise<{
  subsFound: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { subsFound: 0, sent: 0, failed: 0, errors: ["VAPID keys not configured on server"] };
  }

  const subs = await storage.getPushSubscriptionsByUser(userId);
  console.log(`[Push/test] user=${userId} subs=${subs.length}`);

  const dead: string[] = [];
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const payload: PushPayload = {
    title: "TajerGrow — Test 🔔",
    body: "Vos notifications push fonctionnent correctement !",
    icon: "/android-chrome-192.png",
    type: "test",
  };

  for (const sub of subs) {
    const shortEndpoint = "…" + sub.endpoint.slice(-30);
    try {
      const result = await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 300 },
      );
      const code = (result as any).statusCode ?? 201;
      console.log(`[Push/test] ✅ ${shortEndpoint} status=${code}`);
      sent++;
    } catch (err: any) {
      const msg = `${shortEndpoint}: statusCode=${err.statusCode} ${err.body?.slice?.(0, 80) ?? err.message}`;
      console.error(`[Push/test] ❌ ${msg}`);
      errors.push(msg);
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else failed++;
    }
  }

  if (dead.length) {
    console.log(`[Push/test] pruning ${dead.length} stale subscription(s)`);
    await storage.deletePushSubscriptionsByEndpoints(dead);
  }

  return { subsFound: subs.length, sent, failed, errors };
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
    console.log(`[Push] notifyNewOrder order=${order.id} storeId=${order.storeId} recipients=${ids.length}`);
    if (!ids.length) return;
    const price = ((order.totalPrice ?? 0) / 100).toFixed(0);
    const city  = order.customerCity ? ` · ${order.customerCity}` : "";
    const body  = `${order.customerName}${city} · ${price} MAD`;
    const results = await Promise.all(ids.map((uid) =>
      sendPushToUser(uid, order.storeId, {
        title: "Nouvelle commande 🛍️",
        body,
        icon: "/android-chrome-192.png",
        orderId: order.id,
        type: "new_order",
      }),
    ));
    const totalOk = results.reduce((a, r) => a + r.ok, 0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    console.log(`[Push] notifyNewOrder order=${order.id} done — sent=${totalOk} failed=${totalFailed}`);
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
    console.log(`[Push] notifyStatusUpdate order=${order.id} status=${newStatus} recipients=${ids.length}`);
    if (!ids.length) return;
    const label = STATUS_LABELS[newStatus] || newStatus;
    const results = await Promise.all(ids.map((uid) =>
      sendPushToUser(uid, order.storeId, {
        title: "Mise à jour commande",
        body: `${label} · ${order.customerName}`,
        icon: "/android-chrome-192.png",
        orderId: order.id,
        type: "status_update",
      }),
    ));
    const totalOk = results.reduce((a, r) => a + r.ok, 0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    console.log(`[Push] notifyStatusUpdate order=${order.id} status=${newStatus} done — sent=${totalOk} failed=${totalFailed}`);
  }).catch((e) => console.error("[Push] notifyStatusUpdate error:", e));
}

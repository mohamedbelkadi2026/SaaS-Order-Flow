import webPush from "web-push";
import { storage } from "../storage";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || "";

// ── VAPID validation at startup ───────────────────────────────────────────────
function validateVapid() {
  const missing: string[] = [];
  if (!VAPID_PUBLIC_KEY)  missing.push("VAPID_PUBLIC_KEY");
  if (!VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
  if (!VAPID_SUBJECT)     missing.push("VAPID_SUBJECT");
  if (missing.length) {
    console.error(`[Push] ⚠️  VAPID env vars NOT set: ${missing.join(", ")} — web push disabled`);
    return false;
  }

  // subject must be mailto: or https://
  if (!/^mailto:.+@.+\..+$/.test(VAPID_SUBJECT) && !/^https:\/\/.+/.test(VAPID_SUBJECT)) {
    console.error(`[Push] ⚠️  VAPID_SUBJECT is malformed: "${VAPID_SUBJECT}" — must be "mailto:user@domain.com" or "https://…"`);
    return false;
  }

  const subjectDisplay = VAPID_SUBJECT.startsWith("mailto:")
    ? VAPID_SUBJECT.replace(/(?<=@).+/, "***")
    : VAPID_SUBJECT.replace(/(?<=https:\/\/).{4}.+/, "***");
  console.log(`[Push] VAPID keys loaded ✅`);
  console.log(`[Push]   PUBLIC_KEY : ${VAPID_PUBLIC_KEY.slice(0, 12)}… (${VAPID_PUBLIC_KEY.length} chars)`);
  console.log(`[Push]   SUBJECT    : ${subjectDisplay}`);
  return true;
}

const VAPID_VALID = validateVapid();

// Set global VAPID details (belt-and-suspenders; we also pass per-call below)
if (VAPID_VALID) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export const PUSH_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────
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

/** Build the common webPush options including explicit per-call vapidDetails. */
function buildSendOptions(ttl = 86400) {
  return {
    TTL: ttl,
    vapidDetails: {
      subject:    VAPID_SUBJECT,
      publicKey:  VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    },
  };
}

/** Send a push to all devices of a single user; prune stale subscriptions. */
export async function sendPushToUser(
  userId: number,
  _storeId: number,
  payload: PushPayload,
): Promise<{ ok: number; failed: number }> {
  if (!VAPID_VALID) {
    console.warn(`[Push] VAPID not configured — skipping push to user ${userId}`);
    return { ok: 0, failed: 0 };
  }

  const subs = await storage.getPushSubscriptionsByUser(userId);
  console.log(`[Push] → user=${userId} type=${payload.type} subs=${subs.length}`);

  const dead: string[] = [];
  let ok = 0;
  let failed = 0;

  for (const sub of subs) {
    const shortEndpoint = hostOf(sub.endpoint) + " …" + sub.endpoint.slice(-12);
    try {
      const result = await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        buildSendOptions(),
      );
      const code = (result as any).statusCode ?? 201;
      console.log(`[Push] ✅ sent to ${shortEndpoint} status=${code}`);
      ok++;
    } catch (err: any) {
      const body = (err.body ?? "").toString().slice(0, 200);
      console.error(`[Push] ❌ error for ${shortEndpoint}: statusCode=${err.statusCode} body=${body}`);
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

/** Extract the hostname from a push endpoint URL. */
function hostOf(endpoint: string): string {
  try { return new URL(endpoint).hostname; } catch { return "unknown"; }
}

export interface TestSubResult {
  host: string;
  endpointTail: string;
  statusCode: number | null;
  body: string | null;
  error: string | null;
}

/**
 * Send a test push to all subscriptions of a user.
 * Returns detailed per-subscription diagnostics.
 */
export async function sendTestPushToUser(userId: number): Promise<{
  subsFound: number;
  vapidPublicKeyPrefix: string;
  vapidSubject: string;
  results: TestSubResult[];
}> {
  const vapidPublicKeyPrefix = VAPID_PUBLIC_KEY ? VAPID_PUBLIC_KEY.slice(0, 12) + "…" : "(not set)";
  const vapidSubject = VAPID_SUBJECT || "(not set)";

  if (!VAPID_VALID) {
    return {
      subsFound: 0,
      vapidPublicKeyPrefix,
      vapidSubject,
      results: [{ host: "n/a", endpointTail: "", statusCode: null, body: null, error: "VAPID keys not configured on server" }],
    };
  }

  const subs = await storage.getPushSubscriptionsByUser(userId);
  console.log(`[Push/test] user=${userId} subsFound=${subs.length} VAPID_PUBLIC_KEY=${vapidPublicKeyPrefix}`);

  const results: TestSubResult[] = [];
  const dead: string[] = [];

  const payload: PushPayload = {
    title: "TajerGrow — Test 🔔",
    body:  "Vos notifications push fonctionnent correctement !",
    icon:  "/android-chrome-192.png",
    type:  "test",
  };

  for (const sub of subs) {
    const host = hostOf(sub.endpoint);
    const endpointTail = sub.endpoint.slice(-20);
    console.log(`[Push/test] sending to ${host} …${endpointTail}`);
    try {
      const result = await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        buildSendOptions(300),
      );
      const code = (result as any).statusCode ?? 201;
      const responseBody = ((result as any).body ?? "").toString().slice(0, 200);
      console.log(`[Push/test] ✅ ${host} statusCode=${code} body="${responseBody}"`);
      results.push({ host, endpointTail, statusCode: code, body: responseBody || null, error: null });
    } catch (err: any) {
      const code = err.statusCode ?? null;
      const body = (err.body ?? "").toString().slice(0, 300);
      console.error(`[Push/test] ❌ ${host} statusCode=${code} body="${body}" message="${err.message}"`);
      if (code === 404 || code === 410) dead.push(sub.endpoint);
      results.push({ host, endpointTail, statusCode: code, body: body || null, error: err.message ?? String(err) });
    }
  }

  if (dead.length) {
    console.log(`[Push/test] pruning ${dead.length} stale endpoint(s)`);
    await storage.deletePushSubscriptionsByEndpoints(dead);
  }

  return { subsFound: subs.length, vapidPublicKeyPrefix, vapidSubject, results };
}

const sentNewOrders = new Set<number>();

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
        icon:    "/android-chrome-192.png",
        orderId: order.id,
        type:    "new_order",
      }),
    ));
    const totalOk     = results.reduce((a, r) => a + r.ok,     0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    console.log(`[Push] notifyNewOrder order=${order.id} done — sent=${totalOk} failed=${totalFailed}`);
  }).catch((e) => console.error("[Push] notifyNewOrder error:", e));
}

const STATUS_LABELS: Record<string, string> = {
  confirme:        "Confirmé ✅",
  delivered:       "Livré 📦",  livré:    "Livré 📦",
  refusé:          "Refusé ❌",  refused:  "Refusé ❌",
  retourné:        "Retourné 🔙", returned: "Retourné 🔙",
  annulé:          "Annulé 🚫",  cancelled:"Annulé 🚫",
  in_progress:     "En transit 🚚",
  nouveau:         "Nouveau 🆕",
  confirme_reporte:"Reporté 📅",
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
        title:   "Mise à jour commande",
        body:    `${label} · ${order.customerName}`,
        icon:    "/android-chrome-192.png",
        orderId: order.id,
        type:    "status_update",
      }),
    ));
    const totalOk     = results.reduce((a, r) => a + r.ok,     0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    console.log(`[Push] notifyStatusUpdate order=${order.id} status=${newStatus} done — sent=${totalOk} failed=${totalFailed}`);
  }).catch((e) => console.error("[Push] notifyStatusUpdate error:", e));
}

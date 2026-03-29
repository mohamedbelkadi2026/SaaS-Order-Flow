/**
 * Campaign Engine — background worker for bulk WhatsApp retargeting
 *
 * Uses a recursive setTimeout with random 8–15s delay between messages
 * to mimic human behaviour and avoid WhatsApp rate-limits / bans.
 *
 * Each campaign is tracked in `activeCampaigns` (in-memory Map).
 * Progress is broadcast to the store's SSE channel as `campaign_progress`.
 * Each sent/failed message is logged to `campaign_logs`.
 */

import { db } from "./db";
import { marketingCampaigns, campaignLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { broadcastToStore } from "./sse";

export interface CampaignRecipient {
  phone: string;
  name: string;
  lastProduct: string;
}

export interface CampaignRun {
  campaignId: number;
  storeId: number;
  queue: CampaignRecipient[];
  message: string;
  sent: number;
  failed: number;
  total: number;
  status: "running" | "paused" | "stopped" | "completed";
  currentIndex: number;
  timeoutHandle: NodeJS.Timeout | null;
  senderDeviceId?: number | null;       // null/undefined = primary store session
  rotationEnabled?: boolean;
  rotationDeviceIds?: number[];         // populated when rotation is enabled
  rotationIndex?: number;               // current position in rotation
}

const activeCampaigns = new Map<number, CampaignRun>();

/* ── Personalise a message for one recipient ──────────────────── */
function personalise(template: string, recipient: CampaignRecipient): string {
  return template
    .replace(/\*?\{Nom_Client\}\*?/gi, recipient.name || "")
    .replace(/\*?\{nom\}\*?/gi, recipient.name || "")
    .replace(/\*?\{Dernier_Produit\}\*?/gi, recipient.lastProduct || "")
    .replace(/\*?\{produit\}\*?/gi, recipient.lastProduct || "");
}

/* ── Save progress to DB ─────────────────────────────────────── */
async function persistProgress(run: CampaignRun) {
  try {
    await db
      .update(marketingCampaigns)
      .set({ totalSent: run.sent, totalFailed: run.failed, status: run.status })
      .where(eq(marketingCampaigns.id, run.campaignId));
  } catch { /* non-fatal */ }
}

/* ── Broadcast current progress to store via SSE ─────────────── */
function broadcastProgress(run: CampaignRun) {
  broadcastToStore(run.storeId, "campaign_progress", {
    campaignId: run.campaignId,
    sent: run.sent,
    failed: run.failed,
    total: run.total,
    status: run.status,
    currentIndex: run.currentIndex,
    senderDeviceId: run.senderDeviceId ?? null,
  });
}

/* ── Log one message result to campaign_logs ─────────────────── */
async function logMessageResult(campaignId: number, deviceId: number | null | undefined, phone: string, status: "sent" | "failed") {
  try {
    await db.insert(campaignLogs).values({
      campaignId,
      deviceId: deviceId ?? null,
      phone,
      status,
    });
  } catch { /* non-fatal */ }
}

/* ── Send via specific device or primary session ─────────────── */
async function dispatchMessage(run: CampaignRun, phone: string, text: string): Promise<boolean> {
  // Rotation mode: pick next connected device
  if (run.rotationEnabled && run.rotationDeviceIds && run.rotationDeviceIds.length > 0) {
    const idx = (run.rotationIndex ?? 0) % run.rotationDeviceIds.length;
    run.rotationIndex = idx + 1;
    const deviceId = run.rotationDeviceIds[idx];
    try {
      const { getDeviceInstance } = await import("./baileys-service");
      const device = getDeviceInstance(deviceId, run.storeId);
      if (device.isConnected()) {
        return device.sendMessage(phone, text);
      }
    } catch { /* fall through to primary */ }
  }

  // Specific device selected
  if (run.senderDeviceId) {
    try {
      const { getDeviceInstance } = await import("./baileys-service");
      const device = getDeviceInstance(run.senderDeviceId, run.storeId);
      if (device.isConnected()) {
        return device.sendMessage(phone, text);
      }
    } catch { /* fall through to primary */ }
  }

  // Default: primary store session
  return sendWhatsAppMessage(phone, text, run.storeId);
}

/* ── Main recursive worker ────────────────────────────────────── */
async function processNext(campaignId: number) {
  const run = activeCampaigns.get(campaignId);
  if (!run) return;

  // Stopped or completed — persist final state and clean up
  if (run.status === "stopped" || run.currentIndex >= run.queue.length) {
    if (run.currentIndex >= run.queue.length) run.status = "completed";
    broadcastProgress(run);
    await persistProgress(run);
    activeCampaigns.delete(campaignId);
    return;
  }

  // Paused — wait 2s and check again
  if (run.status === "paused") {
    run.timeoutHandle = setTimeout(() => processNext(campaignId), 2000);
    return;
  }

  // Running — send the next message
  const recipient = run.queue[run.currentIndex];
  let succeeded = false;
  try {
    const text = personalise(run.message, recipient);
    succeeded = await dispatchMessage(run, recipient.phone, text);
    if (succeeded) {
      run.sent++;
      console.log(`[Campaign ${campaignId}] ✅ ${run.sent}/${run.total} → ${recipient.phone}`);
    } else {
      run.failed++;
      console.warn(`[Campaign ${campaignId}] ❌ failed → ${recipient.phone}`);
    }
  } catch (err: any) {
    run.failed++;
    console.warn(`[Campaign ${campaignId}] ❌ exception → ${recipient.phone}: ${err.message}`);
  }

  // Log to campaign_logs (fire-and-forget)
  const usedDeviceId = run.rotationEnabled && run.rotationDeviceIds?.length
    ? run.rotationDeviceIds[((run.rotationIndex ?? 1) - 1) % run.rotationDeviceIds.length]
    : (run.senderDeviceId ?? null);
  logMessageResult(campaignId, usedDeviceId, recipient.phone, succeeded ? "sent" : "failed").catch(() => {});

  run.currentIndex++;
  broadcastProgress(run);

  // Save every 5 messages to avoid too many DB writes
  if (run.currentIndex % 5 === 0) await persistProgress(run);

  // Random delay 8–15 seconds (anti-ban)
  const delay = 8000 + Math.floor(Math.random() * 7000);
  run.timeoutHandle = setTimeout(() => processNext(campaignId), delay);
}

/* ════════════════════════════════════════════════════════════════
   Public API
════════════════════════════════════════════════════════════════ */

/** Start a new campaign run. Returns the campaign run object. */
export function startCampaign(
  campaignId: number,
  storeId: number,
  recipients: CampaignRecipient[],
  message: string,
  opts?: { senderDeviceId?: number | null; rotationEnabled?: boolean; rotationDeviceIds?: number[] },
): CampaignRun {
  // Cancel any existing run for this campaign
  const existing = activeCampaigns.get(campaignId);
  if (existing?.timeoutHandle) clearTimeout(existing.timeoutHandle);

  const run: CampaignRun = {
    campaignId,
    storeId,
    queue: recipients,
    message,
    sent: 0,
    failed: 0,
    total: recipients.length,
    status: "running",
    currentIndex: 0,
    timeoutHandle: null,
    senderDeviceId: opts?.senderDeviceId ?? null,
    rotationEnabled: opts?.rotationEnabled ?? false,
    rotationDeviceIds: opts?.rotationDeviceIds ?? [],
    rotationIndex: 0,
  };

  activeCampaigns.set(campaignId, run);

  // First message fires immediately, subsequent ones after random delay
  processNext(campaignId).catch(console.error);

  return run;
}

/** Pause or resume a campaign. */
export function togglePause(campaignId: number): "paused" | "running" | null {
  const run = activeCampaigns.get(campaignId);
  if (!run) return null;
  run.status = run.status === "paused" ? "running" : "paused";
  broadcastProgress(run);
  if (run.status === "running") processNext(campaignId).catch(console.error);
  return run.status;
}

/** Stop a campaign entirely. */
export function stopCampaign(campaignId: number): boolean {
  const run = activeCampaigns.get(campaignId);
  if (!run) return false;
  run.status = "stopped";
  if (run.timeoutHandle) { clearTimeout(run.timeoutHandle); run.timeoutHandle = null; }
  broadcastProgress(run);
  persistProgress(run).catch(console.error);
  activeCampaigns.delete(campaignId);
  return true;
}

/** Get the current status of a running campaign. */
export function getCampaignStatus(campaignId: number): CampaignRun | null {
  return activeCampaigns.get(campaignId) ?? null;
}

/** Returns all active campaign IDs for a store. */
export function getActiveCampaignsForStore(storeId: number): CampaignRun[] {
  return [...activeCampaigns.values()].filter(r => r.storeId === storeId);
}

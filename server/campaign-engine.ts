/**
 * Campaign Engine — background worker for bulk WhatsApp retargeting
 *
 * Uses a recursive setTimeout with random 8–15s delay between messages
 * to mimic human behaviour and avoid WhatsApp rate-limits / bans.
 *
 * Each campaign is tracked in `activeCampaigns` (in-memory Map).
 * Progress is broadcast to the store's SSE channel as `campaign_progress`.
 */

import { db } from "./db";
import { marketingCampaigns } from "@shared/schema";
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
  });
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
  try {
    const text = personalise(run.message, recipient);
    await sendWhatsAppMessage(recipient.phone, text);
    run.sent++;
    console.log(`[Campaign ${campaignId}] ✅ ${run.sent}/${run.total} → ${recipient.phone}`);
  } catch (err: any) {
    run.failed++;
    console.warn(`[Campaign ${campaignId}] ❌ failed → ${recipient.phone}: ${err.message}`);
  }

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

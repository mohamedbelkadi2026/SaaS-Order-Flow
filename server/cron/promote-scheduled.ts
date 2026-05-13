import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Promote every order whose `status='confirme_reporte'` AND
 * `scheduled_for <= CURRENT_DATE` to `status='confirme'`.
 *
 * IMPLEMENTATION CHOICE — atomic SQL UPDATE (vs. per-row updateOrderStatus):
 * The transition `confirme_reporte → confirme` is, by design, a stock no-op
 * (both statuses are in `CONFIRMED_FOR_STOCK` in storage.ts; stock was already
 * deducted when the order entered `confirme_reporte`). Therefore we do NOT need
 * to route this through `storage.updateOrderStatus`, and using a single atomic
 * UPDATE eliminates a TOCTOU race where an agent flips an order to `Annulé`
 * between SELECT and per-row UPDATE.
 *
 * Side-effects performed inline by this UPDATE:
 *   - status        = 'confirme'
 *   - scheduled_for = NULL          (so re-runs are idempotent)
 *   - updated_at    = NOW()
 * NOT touched (intentional, matches updateOrderStatus behaviour for system
 * actions where `actorId == null`):
 *   - last_action_at / last_action_by  (this is a system action, not human)
 *
 * CURRENT_DATE in PostgreSQL uses the session timezone. Our DB session runs in
 * UTC, but since we only fire this cron at 06:00 Casablanca (UTC+1), CURRENT_DATE
 * in UTC at that moment equals "today" in Casablanca (06:00 CAS = 05:00 UTC of
 * the same calendar day), so semantics line up.
 *
 * Returns the count of orders promoted.
 */
export async function promoteScheduledOrders(): Promise<{ promoted: number }> {
  // AUTO-PROMOTION DISABLED — agents must confirm manually.
  // "Confirmé Reporté" orders must never be auto-promoted to "Confirmé" by a
  // scheduler. The scheduled_for date is now used only as a visual reminder for
  // agents in the order details modal. Status changes to 'confirme' require an
  // explicit manual action through the UI.
  console.log("[CRON-PROMOTE] Auto-promotion disabled — skipping (manual confirmation required).");
  return { promoted: 0 };
}

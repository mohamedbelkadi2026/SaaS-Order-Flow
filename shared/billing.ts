/**
 * Subscription billing window — single source of truth.
 *
 * A merchant's plan runs on THEIR anniversary, not the calendar month. Someone
 * who subscribed on the 25th has a period running 25th → 25th. The order quota
 * is counted inside that window and resets when the next one opens.
 *
 * This is deliberately separate from every "ce mois" filter in the app
 * (Dashboard, Rentabilité, Statistiques). Those are business analytics and stay
 * on calendar months. Only the subscription uses this.
 *
 * Pure functions, no DB, no I/O — so the server, the client and the super-admin
 * screen all compute the same dates from the same code.
 */

/** Last day of the month containing `year`/`month` (month is 0-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Build a date on the anniversary day of a given month, clamped to the end of
 * short months: anchor 31 lands on 28 (or 29) in February, 30 in April.
 * Anniversaries are taken at 00:00 local time.
 */
function anniversaryIn(year: number, month: number, anchorDay: number): Date {
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * The anchor day for a subscription: the day of the month it started on.
 * Falls back to the 1st when no start date is recorded.
 */
export function getAnchorDay(planStartDate: Date | string | null | undefined): number {
  if (!planStartDate) return 1;
  const d = new Date(planStartDate);
  return Number.isNaN(d.getTime()) ? 1 : d.getDate();
}

export interface BillingPeriod {
  /** Start of the current period, inclusive. */
  start: Date;
  /** Start of the next period — the end of this one, exclusive. */
  end: Date;
  /** Whole days from `now` until `end`. 0 on the last day. */
  daysLeft: number;
  /** Day of the month the plan is anchored on (1–31, unclamped). */
  anchorDay: number;
}

/**
 * The billing period containing `now`.
 *
 * The anchor never drifts: it is derived from the plan's start date every time
 * rather than being rewritten on each renewal, so a merchant who started on the
 * 25th is still on the 25th a year later.
 *
 * Before the plan starts (a future start date), returns the first period.
 */
export function getBillingPeriod(
  planStartDate: Date | string | null | undefined,
  now: Date = new Date(),
): BillingPeriod {
  const anchorDay = getAnchorDay(planStartDate);
  const start0 = planStartDate ? new Date(planStartDate) : new Date(now);

  // Period containing `now`: walk to the anniversary of the current month, then
  // step back one month if that anniversary is still ahead of us.
  let start = anniversaryIn(now.getFullYear(), now.getMonth(), anchorDay);
  if (start > now) {
    start = anniversaryIn(now.getFullYear(), now.getMonth() - 1, anchorDay);
  }

  // Never report a period that opens before the plan itself did.
  const planStart = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate(), 0, 0, 0, 0);
  if (!Number.isNaN(planStart.getTime()) && start < planStart) {
    start = planStart;
  }

  const end = anniversaryIn(start.getFullYear(), start.getMonth() + 1, anchorDay);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / msPerDay) - 1);

  return { start, end, daysLeft, anchorDay };
}

/** "25/08/2026 → 25/09/2026" for display. */
export function formatBillingPeriod(p: BillingPeriod, locale = 'fr-MA'): string {
  const f = (d: Date) => d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${f(p.start)} → ${f(p.end)}`;
}

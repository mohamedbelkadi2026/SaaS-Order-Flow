/**
 * Africa/Casablanca timezone helpers.
 *
 * We use Intl.DateTimeFormat (not hardcoded UTC offsets) because Morocco's
 * offset has historically shifted for Ramadan; relying on the IANA database
 * via Intl is robust against future schedule changes.
 */

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Casablanca",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

function parts(d: Date): { year: number; month: number; day: number; hour: number } {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return {
    year:  Number(p.year),
    month: Number(p.month),
    day:   Number(p.day),
    hour:  Number(p.hour),
  };
}

/** Returns YYYY-MM-DD for "today" in Africa/Casablanca. */
export function casablancaToday(now: Date = new Date()): string {
  const { year, month, day } = parts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns YYYY-MM-DD for "tomorrow" in Africa/Casablanca (calendar day +1). */
export function casablancaTomorrow(now: Date = new Date()): string {
  const { year, month, day } = parts(now);
  // Build a UTC date at noon (avoids DST edge cases) for the Casablanca calendar
  // day, advance by 1 day, then re-extract the calendar day.
  const baseUtc = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const next = parts(baseUtc);
  return `${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}`;
}

/** Returns the Casablanca local hour (0-23) for `now`. */
export function casablancaHour(now: Date = new Date()): number {
  return parts(now).hour;
}

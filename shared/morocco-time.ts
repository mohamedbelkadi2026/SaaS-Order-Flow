/**
 * Morocco's UTC offset, resolved per date rather than assumed.
 *
 * Morocco sits at UTC+1 most of the year but drops to UTC+0 for Ramadan and
 * returns afterwards, on dates that move every year. Hardcoding "+01:00" — as
 * the order endpoints did — made every timestamp read an hour late for the
 * whole of Ramadan, and pushed day boundaries onto the wrong day for orders
 * placed in the first hour after midnight.
 *
 * Asking Intl for the offset on the date in question follows the change
 * automatically, including future ones nobody has hardcoded yet.
 */
export const MOROCCO_TZ = 'Africa/Casablanca';

/** Offset in minutes at `when`, e.g. 60 for UTC+1, 0 for UTC+0. */
export function moroccoOffsetMinutes(when: Date = new Date()): number {
  // Format the instant in both zones and compare: the gap is the offset.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: MOROCCO_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(when).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - when.getTime()) / 60000);
}

/** "+01:00" or "+00:00" for the given date, ready to append to an ISO string. */
export function moroccoOffsetString(when: Date = new Date()): string {
  const mins = moroccoOffsetMinutes(when);
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * Start of a Moroccan calendar day, as an absolute instant.
 * `ymd` is "YYYY-MM-DD".
 */
export function moroccoDayStart(ymd: string): Date {
  // Resolve the offset on that day, not today's: a range spanning the Ramadan
  // change would otherwise use one offset for both ends.
  const probe = new Date(`${ymd}T12:00:00.000Z`);
  return new Date(`${ymd}T00:00:00.000${moroccoOffsetString(probe)}`);
}

/** End of a Moroccan calendar day, inclusive. */
export function moroccoDayEnd(ymd: string): Date {
  const probe = new Date(`${ymd}T12:00:00.000Z`);
  return new Date(`${ymd}T23:59:59.999${moroccoOffsetString(probe)}`);
}

/** Today's date in Morocco, as "YYYY-MM-DD". */
export function moroccoToday(when: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOROCCO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(when);
  return parts; // en-CA formats as YYYY-MM-DD
}

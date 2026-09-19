/**
 * Repair Nearya parcels saved with Nearya's internal ObjectId instead of the
 * real parcel code (EJD1789722545603 style).
 *
 * Those parcels exist at Nearya and carry our order number, but every status
 * lookup on an ObjectId returns "Colis itrouvable!", so they are frozen.
 * Re-shipping is not an option either — Nearya answers "Already exists".
 *
 * Input: anything copied out of Nearya's Colis screen, or exported from it.
 * Each line needs the parcel code and our order number, in any order and with
 * any separator — the Colis screen shows them one above the other, so a plain
 * copy-paste works:
 *
 *     EJD1789722545603,11301
 *     CFN1789589247342;11256
 *     AGA1789588231441  11252
 *     EJD1789588321606
 *     11255
 *
 * The last form is what a raw paste looks like: a code on one line and the
 * order number on the next. Those are paired automatically.
 *
 * Dry run by default:
 *   npx tsx scripts/repair-nearya-tracking.ts codes.csv
 *   npx tsx scripts/repair-nearya-tracking.ts codes.csv --apply
 */
import fs from 'fs';
import { db } from '../server/db';
import { orders } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const PARCEL_CODE = /\b([A-Z]{2,4}\d{10,16})\b/;
// Anything that isn't shaped like a real code is replaceable: Nearya's
// internal ObjectId, and the four-letter fragments ("ABKA") an earlier parser
// picked up. Testing for "is a real code" rather than listing the bad shapes
// covers whatever else may already be stored.
const IS_REAL_CODE = (v: string) => /^[A-Z]{2,4}\d{10,16}$/i.test(v);

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) {
    console.error('Usage: npx tsx scripts/repair-nearya-tracking.ts <file.csv> [--apply]');
    process.exit(1);
  }

  console.log(apply ? '⚠️  APPLY mode' : '🔍 DRY RUN — nothing will be written');

  const rawLines = fs.readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);

  // A raw paste puts the code and the order number on separate lines. Join a
  // code-only line with the next number-only line so copy-paste just works.
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const hasCode = PARCEL_CODE.test(line);
    const hasNumber = /\b\d{3,12}\b/.test(line.replace(line.match(PARCEL_CODE)?.[1] ?? '', ''));
    if (hasCode && !hasNumber && i + 1 < rawLines.length && /^\d{3,12}$/.test(rawLines[i + 1])) {
      lines.push(`${line} ${rawLines[i + 1]}`);
      i++;
    } else {
      lines.push(line);
    }
  }
  let repaired = 0, alreadyOk = 0, notFound = 0, unparsed = 0;

  for (const line of lines) {
    const codeMatch = line.match(PARCEL_CODE);
    // The order number is any other standalone number on the line.
    const orderMatch = line.replace(codeMatch?.[1] ?? '', '').match(/\b(\d{3,12})\b/);

    if (!codeMatch || !orderMatch) { unparsed++; continue; }
    const parcelCode  = codeMatch[1];
    const orderNumber = orderMatch[1];

    const rows = await db.select().from(orders).where(and(
      eq(orders.orderNumber, orderNumber),
      eq(orders.shippingProvider, 'nearya'),
    ));

    if (!rows.length) {
      console.log(`  ?  order ${orderNumber}: not found (or not shipped via Nearya)`);
      notFound++;
      continue;
    }

    for (const o of rows) {
      const current = (o as any).trackNumber || '';
      if (current === parcelCode) { alreadyOk++; continue; }
      // Never overwrite a value that already looks like a real parcel code, in
      // case the file is stale.
      if (current && IS_REAL_CODE(current)) {
        console.log(`  !  order ${orderNumber}: keeping existing code "${current}" (already valid)`);
        continue;
      }
      console.log(`  ✓  order ${orderNumber}: "${current || '(vide)'}" → ${parcelCode}`);
      repaired++;
      if (apply) {
        await db.update(orders).set({ trackNumber: parcelCode } as any).where(eq(orders.id, o.id));
      }
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`Repaired:    ${repaired}`);
  console.log(`Already ok:  ${alreadyOk}`);
  console.log(`Not found:   ${notFound}`);
  console.log(`Unparsed:    ${unparsed}`);
  if (!apply && repaired) console.log(`\nRe-run with --apply to write these ${repaired} change(s).`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Repair failed:', err);
  process.exit(1);
});

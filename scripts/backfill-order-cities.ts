/**
 * One-off backfill: recover the customer city on existing orders that arrived
 * without one.
 *
 * Uses exactly the same strict matching as the live path
 * (storage.guessCityFromAddress): whole-token only, against the city names
 * already synced from the carriers, and an address naming two different cities
 * is skipped rather than guessed at.
 *
 * Dry run by default — nothing is written unless --apply is passed:
 *
 *   npx tsx scripts/backfill-order-cities.ts            # report only
 *   npx tsx scripts/backfill-order-cities.ts --apply    # write
 *   npx tsx scripts/backfill-order-cities.ts --store 1  # limit to one store
 */
import { db } from '../server/db';
import { storage } from '../server/storage';
import { orders } from '@shared/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

async function main() {
  const apply = process.argv.includes('--apply');
  const storeArgIdx = process.argv.indexOf('--store');
  const storeFilter = storeArgIdx > -1 ? Number(process.argv[storeArgIdx + 1]) : null;

  console.log(apply ? '⚠️  APPLY mode — orders will be updated' : '🔍 DRY RUN — nothing will be written');
  if (storeFilter) console.log(`Limited to store ${storeFilter}`);

  const where = and(
    or(isNull(orders.customerCity), eq(orders.customerCity, '')),
    storeFilter ? eq(orders.storeId, storeFilter) : sql`true`,
  );

  const rows = await db.select({
    id: orders.id,
    storeId: orders.storeId,
    orderNumber: orders.orderNumber,
    customerAddress: orders.customerAddress,
  }).from(orders).where(where);

  console.log(`\n${rows.length} order(s) with no city.\n`);
  if (!rows.length) return;

  let recovered = 0, skipped = 0;
  const skippedSamples: string[] = [];

  for (const row of rows) {
    if (!row.storeId || !row.customerAddress) { skipped++; continue; }
    const guess = await storage.guessCityFromAddress(row.storeId, row.customerAddress);
    if (!guess) {
      skipped++;
      if (skippedSamples.length < 15) skippedSamples.push(`#${row.orderNumber}: "${row.customerAddress}"`);
      continue;
    }
    recovered++;
    console.log(`#${row.orderNumber}  "${row.customerAddress}"  →  ${guess}`);
    if (apply) {
      await db.update(orders).set({ customerCity: guess }).where(eq(orders.id, row.id));
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`Recovered: ${recovered}`);
  console.log(`Skipped:   ${skipped}  (no address, or no single city recognised)`);
  if (skippedSamples.length) {
    console.log(`\nA few that could not be matched — if these contain a city that is\nmissing from your carrier city lists, sync the carrier and re-run:`);
    for (const s of skippedSamples) console.log(`  ${s}`);
  }
  if (!apply && recovered) console.log(`\nRe-run with --apply to write these ${recovered} change(s).`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

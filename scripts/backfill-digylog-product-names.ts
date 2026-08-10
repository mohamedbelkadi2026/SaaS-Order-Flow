/**
 * One-time backfill: recover the PRODUIT name for existing broken Digylog orders.
 *
 * Context: carrier status webhooks (source = "digylog_webhook") were auto-created
 * without a product name (Digylog never returns one), so they show "-" in the
 * PRODUIT column. The product name lives on the customer's ORIGINAL order (e.g. the
 * Shopify order). This script finds each broken order and copies the product name
 * from a sibling order matched by phone within the SAME store.
 *
 * The UI resolves the product label as:
 *   order.rawProductName || items[0]?.rawProductName || items[0]?.product?.name || '-'
 * so writing `orders.rawProductName` is enough to fix the display.
 *
 * SAFETY: dry-run by DEFAULT — prints what it WOULD do and writes nothing.
 *   Preview:  node_modules/.bin/tsx scripts/backfill-digylog-product-names.ts
 *   Apply:    node_modules/.bin/tsx scripts/backfill-digylog-product-names.ts --apply
 *
 * Idempotent: re-running only touches orders that are still broken.
 */
import { and, eq, or, isNull } from "drizzle-orm";
import { db, pool } from "../server/db";
import { storage } from "../server/storage";
import { orders } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

/** Resolve a usable product name from an order + its items (mirrors the UI). */
function resolveProductName(o: {
  rawProductName?: string | null;
  items?: Array<{ rawProductName?: string | null; product?: { name?: string | null } | null }>;
}): string | null {
  const direct = (o.rawProductName || "").trim();
  if (direct) return direct;
  for (const it of o.items || []) {
    const itemName = (it.rawProductName || "").trim();
    if (itemName) return itemName;
    const prodName = (it.product?.name || "").trim();
    if (prodName) return prodName;
  }
  return null;
}

async function main() {
  console.log(`\n=== Digylog product-name backfill — ${APPLY ? "APPLY (writing changes)" : "DRY-RUN (no changes)"} ===\n`);

  // ── Step 1: candidate broken orders ──────────────────────────────────────
  // source = "digylog_webhook" AND rawProductName is null/empty.
  const candidates = await db.select().from(orders).where(
    and(
      eq(orders.source, "digylog_webhook"),
      or(isNull(orders.rawProductName), eq(orders.rawProductName, "")),
    ),
  );

  console.log(`Found ${candidates.length} digylog_webhook order(s) with no order-level product name.\n`);

  let fixable = 0;
  let applied = 0;
  let noDonor = 0;
  let ambiguous = 0;
  let alreadyHadName = 0;
  const previews: string[] = [];
  const reviewRows: string[] = [];

  for (const order of candidates) {
    // Skip if the order already resolves to a product name via its OWN items
    // (UI-equivalent resolver) — then it isn't actually showing "-".
    const self = await storage.getOrder(order.id);
    if (self && resolveProductName(self)) {
      alreadyHadName++;
      continue;
    }

    const phone = (order.customerPhone || "").trim();
    if (!phone) {
      noDonor++;
      reviewRows.push(`  ✗ order #${order.id} — no phone on order, cannot find donor`);
      continue;
    }

    // ── Step 2: find donors (same store, same phone, with a product name) ──
    // getOrdersByPhone normalizes phone variants and hydrates items+product,
    // returned most-recent-first.
    const siblings = await storage.getOrdersByPhone(order.storeId, phone);
    const donors = siblings
      .filter(s => s.id !== order.id)
      .filter(s => resolveProductName(s) != null);

    if (donors.length === 0) {
      noDonor++;
      reviewRows.push(`  ✗ order #${order.id} (phone ${phone}) — no sibling order with a product name`);
      continue;
    }

    // ── Confidence gate ───────────────────────────────────────────────────
    // Only write when the donor is UNAMBIGUOUS, to avoid copying the wrong
    // product onto a customer who has several different orders on one phone:
    //   1. exact tracking-number match (strongest link), OR
    //   2. every donor resolves to the SAME product name (one distinct value).
    // Otherwise: skip and flag for manual review.
    const myTrack = (order.trackNumber || "").trim();
    const trackMatch = myTrack
      ? donors.find(d => (d.trackNumber || "").trim() === myTrack)
      : undefined;
    const distinctNames = Array.from(
      new Set(donors.map(d => resolveProductName(d)!.toLowerCase().trim())),
    );

    let donor: typeof donors[number] | undefined;
    let confidence = "";
    if (trackMatch) {
      donor = trackMatch;
      confidence = "tracking_number";
    } else if (distinctNames.length === 1) {
      donor = donors.find(d => d.source === "shopify") || donors[0];
      confidence = "unique_name";
    } else {
      ambiguous++;
      const opts = Array.from(
        new Set(donors.map(d => `"${resolveProductName(d)}" (#${d.id}/${d.source})`)),
      );
      reviewRows.push(`  ? order #${order.id} (phone ${phone}) — AMBIGUOUS (${distinctNames.length} distinct names), skipped → ${opts.join(", ")}`);
      continue;
    }

    const name = resolveProductName(donor!)!;
    fixable++;
    previews.push(`  ✓ order #${order.id} (phone ${phone}) → "${name}"  [donor #${donor!.id} source=${donor!.source}, match=${confidence}]`);

    if (APPLY) {
      await db.update(orders).set({ rawProductName: name }).where(eq(orders.id, order.id));
      applied++;
    }
  }

  if (previews.length) {
    console.log("Confident matches:");
    console.log(previews.join("\n"));
  }
  if (reviewRows.length) {
    console.log("\nNeeds manual review (NOT written):");
    console.log(reviewRows.join("\n"));
  }
  if (!previews.length && !reviewRows.length) console.log("  (nothing to do)");

  console.log(`\n=== Summary ===`);
  console.log(`  Candidates scanned             : ${candidates.length}`);
  console.log(`  Already had a name (skipped)   : ${alreadyHadName}`);
  console.log(`  Confident (donor found)        : ${fixable}`);
  console.log(`  Ambiguous (manual review)      : ${ambiguous}`);
  console.log(`  No donor / no phone            : ${noDonor}`);
  if (APPLY) {
    console.log(`  Applied (rawProductName)       : ${applied}`);
  } else {
    console.log(`\n  DRY-RUN only — re-run with --apply to write these ${fixable} confident change(s).`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  try { await pool.end(); } catch {}
  process.exit(1);
});

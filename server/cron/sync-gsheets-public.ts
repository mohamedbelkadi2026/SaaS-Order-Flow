import { db } from "../db";
import { storeIntegrations, orders } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../storage";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

const DEFAULT_MAPPING: Record<string, number> = {
  name: 0, phone: 1, city: 2, address: 3,
  product: 4, price: 5, quantity: 6,
  note: 7,
  utmCampaign: 10, utmSource: 11, productId: 12,
};

export async function syncAllPublicSheets() {
  const conns = await db.select().from(storeIntegrations)
    .where(and(
      eq(storeIntegrations.provider, 'gsheets'),
      eq(storeIntegrations.status, 'active'),
      sql`gsheet_url IS NOT NULL`,
    ));

  console.log(`[GSHEETS-PUBLIC] Found ${conns.length} active connection(s)`);

  if (conns.length === 0) {
    console.log('[GSHEETS-PUBLIC] No active gsheets connections — skipping');
    return;
  }

  for (const conn of conns) {
    try {
      console.log(`[GSHEETS-PUBLIC] Processing connection id=${conn.id} store=${conn.storeId} magasin=${(conn as any).magasinId ?? 'NULL'} sheet=${(conn as any).gsheetId}`);
      await syncOnePublicSheet(conn as any);
    } catch (err: any) {
      console.error(`[GSHEETS-PUBLIC] Connection ${conn.id} FAILED:`, err.message, err.stack);
    }
  }
}

const HEADER_WORDS = [
  'nom', 'name', 'phone', 'telephone', 'tel', 'address',
  'adresse', 'city', 'ville', 'product', 'produit', 'price',
  'prix', 'fullname', 'note', 'comment', 'utm_source',
  'utm_campaign', 'campaign', 'source', 'sku',
];

export async function syncOnePublicSheet(conn: any) {
  const sheetId: string = conn.gsheetId;
  const tabs: Array<{ gid: string; title: string }> = conn.gsheetTabs || [];
  const state: Record<string, number> = conn.gsheetSyncState || {};
  const mapping: Record<string, number> = (conn.gsheetColumnMapping as Record<string, number>) || DEFAULT_MAPPING;

  console.log(`[GSHEETS-PUBLIC] sheet=${sheetId} tabs=${tabs.length} mapping=${JSON.stringify(mapping)}`);
  console.log(`[GSHEETS-PUBLIC] last_sync_state=${JSON.stringify(state)}`);

  for (const tab of tabs) {
    const lastRow: number = state[`tab_${tab.gid}`] || 0;
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}`;

    console.log(`[GSHEETS-PUBLIC] Fetching tab="${tab.title}" gid=${tab.gid} lastRow=${lastRow}`);

    let resp: Response;
    try {
      resp = await fetch(csvUrl);
    } catch (err: any) {
      console.warn(`[GSHEETS-PUBLIC] Tab "${tab.title}" fetch error:`, err.message);
      continue;
    }
    if (!resp.ok) {
      console.warn(`[GSHEETS-PUBLIC] Tab "${tab.title}" fetch failed: HTTP ${resp.status}`);
      continue;
    }

    const text = await resp.text();
    const rows = parseCsv(text);
    console.log(`[GSHEETS-PUBLIC] Tab "${tab.title}" parsed ${rows.length} total rows`);

    // Conservative header detection: require ≥2 exact matches AND no phone-shaped cell in row 0
    let dataStart = 0;
    if (rows.length > 0) {
      let headerMatches = 0;
      for (const cell of (rows[0] || [])) {
        const norm = String(cell).toLowerCase().trim();
        if (HEADER_WORDS.some(w => norm === w)) headerMatches++;
      }
      const row0HasPhoneShape = (rows[0] || []).some(
        c => /^\+?\d{8,}$/.test(String(c ?? '').trim())
      );
      if (headerMatches >= 2 && !row0HasPhoneShape) dataStart = 1;
      console.log(`[GSHEETS-PUBLIC] Tab "${tab.title}" header_matches=${headerMatches} has_phone_in_row0=${row0HasPhoneShape} dataStart=${dataStart}`);
    }

    const getCell = (row: string[], key: string): string => {
      const col = mapping[key];
      if (col === undefined || col === null) return '';
      return (row[col] || '').toString().trim();
    };

    const startIdx = Math.max(dataStart, lastRow);
    const newRows = rows.slice(startIdx);
    console.log(`[GSHEETS-PUBLIC] Tab "${tab.title}" newRows to process: ${newRows.length}`);

    let createdCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      const rowIndex = startIdx + i;

      const name  = getCell(row, 'name');
      const phone = getCell(row, 'phone');

      console.log(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: name="${name}" phone="${phone}"`);

      if (!name && !phone) {
        console.log(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: SKIP (empty name and phone)`);
        skippedCount++;
        continue;
      }
      if (!phone) {
        console.log(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: SKIP (no phone)`);
        skippedCount++;
        continue;
      }

      const ref = `GSP-${sheetId.slice(0, 6)}-${tab.gid}-R${rowIndex + 1}`;

      const existing = await db.select({ id: orders.id }).from(orders)
        .where(eq(orders.orderNumber, ref))
        .limit(1);
      if (existing.length > 0) {
        console.log(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: SKIP (already exists as order ${existing[0].id})`);
        skippedCount++;
        continue;
      }

      const totalPriceCents = Math.round(
        parseFloat((getCell(row, 'price') || '0').replace(',', '.')) * 100
      ) || 0;
      const product = getCell(row, 'product') || tab.title;
      const qty     = parseInt(getCell(row, 'quantity') || '1', 10) || 1;

      try {
        const order = await (storage as any).createOrder({
          storeId:         conn.storeId,
          magasinId:       conn.magasinId ?? null,
          orderNumber:     ref,
          customerName:    name,
          customerPhone:   phone,
          customerAddress: getCell(row, 'address'),
          customerCity:    getCell(row, 'city'),
          rawProductName:  product,
          status:          'nouveau',
          totalPrice:      totalPriceCents,
          productCost:     0,
          shippingCost:    0,
          adSpend:         0,
          source:          'gsheets',
          comment:         getCell(row, 'note') || null,
          utmSource:       getCell(row, 'utmSource') || null,
          utmCampaign:     getCell(row, 'utmCampaign') || null,
        }, [{
          rawProductName: product,
          quantity: qty,
          price: totalPriceCents,
        }]);
        createdCount++;
        console.log(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: ✅ Created order id=${order?.id} ref=${ref} magasin=${conn.magasinId ?? 'NULL'}`);
      } catch (err: any) {
        console.error(`[GSHEETS-PUBLIC]   Row ${rowIndex + 1}: ❌ FAILED to create order ref=${ref}: ${err.message}`);
      }
    }

    console.log(`[GSHEETS-PUBLIC] Tab "${tab.title}" summary: created=${createdCount} skipped=${skippedCount}`);

    // Mark all rows as seen AFTER processing — failed rows will retry (idempotency via ref)
    state[`tab_${tab.gid}`] = rows.length;
  }

  await db.update(storeIntegrations)
    .set({ gsheetSyncState: state, lastSyncAt: new Date() } as any)
    .where(eq(storeIntegrations.id, conn.id));

  console.log(`[GSHEETS-PUBLIC] Updated last_sync_state for connection ${conn.id}`);
}

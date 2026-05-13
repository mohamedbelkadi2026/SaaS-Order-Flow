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

  for (const conn of conns) {
    try {
      await syncOnePublicSheet(conn as any);
    } catch (err: any) {
      console.error(`[GSHEETS-PUBLIC] Store ${conn.storeId} error:`, err.message);
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

  for (const tab of tabs) {
    const lastRow: number = state[`tab_${tab.gid}`] || 0;

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}`;
    let resp: Response;
    try {
      resp = await fetch(csvUrl);
    } catch (err: any) {
      console.warn(`[GSHEETS-PUBLIC] Store ${conn.storeId} tab ${tab.title} fetch error:`, err.message);
      continue;
    }
    if (!resp.ok) {
      console.warn(`[GSHEETS-PUBLIC] Tab ${tab.title} fetch failed: ${resp.status}`);
      continue;
    }
    const text = await resp.text();
    const rows = parseCsv(text);

    // Conservative header detection: require ≥2 cells individually matching a
    // known header word AND no phone-number-shaped cell in row 0.
    // This prevents swallowing row 1 on headerless sheets where the first row
    // is actual data (e.g. "Achache aziz | 714585443 | Fez | ...").
    let dataStart = 0;
    if (rows.length > 0) {
      let headerMatches = 0;
      for (const cell of (rows[0] || [])) {
        const norm = String(cell).toLowerCase().trim();
        if (HEADER_WORDS.some(w => norm === w || norm.includes(w))) headerMatches++;
      }
      const row0HasPhoneShape = (rows[0] || []).some(
        c => /^\+?\d{8,}$/.test(String(c).trim())
      );
      if (headerMatches >= 2 && !row0HasPhoneShape) dataStart = 1;
    }

    // Use user-defined mapping if available, otherwise fall back to defaults
    const mapping: Record<string, number> = (conn.gsheetColumnMapping as Record<string, number>) || DEFAULT_MAPPING;
    const getCell = (row: string[], key: string): string => {
      const col = mapping[key];
      if (col === undefined || col === null) return '';
      return (row[col] || '').toString().trim();
    };

    const startIdx = Math.max(dataStart, lastRow);
    const newRows = rows.slice(startIdx);

    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      const rowIndex = startIdx + i;

      const name  = getCell(row, 'name');
      const phone = getCell(row, 'phone');
      if (!phone) continue;

      const ref = `GSP-${sheetId.slice(0, 6)}-${tab.gid}-R${rowIndex + 1}`;

      const existing = await db.select({ id: orders.id }).from(orders)
        .where(eq(orders.orderNumber, ref))
        .limit(1);
      if (existing.length > 0) continue;

      const totalPriceCents = Math.round(
        parseFloat((getCell(row, 'price') || '0').replace(',', '.')) * 100
      ) || 0;
      const product = getCell(row, 'product') || tab.title;
      const qty     = parseInt(getCell(row, 'quantity') || '1', 10) || 1;

      try {
        await (storage as any).createOrder({
          storeId:         conn.storeId,
          magasinId:       conn.magasinId || null,
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
        console.log(`[GSHEETS-PUBLIC] Created order ref=${ref} store=${conn.storeId} tab=${tab.title} row=${rowIndex + 1}`);
      } catch (err: any) {
        console.error(`[GSHEETS-PUBLIC] Order creation failed ref=${ref}:`, err.message);
      }
    }

    state[`tab_${tab.gid}`] = rows.length;
  }

  await db.update(storeIntegrations)
    .set({
      gsheetSyncState: state,
      lastSyncAt: new Date(),
    } as any)
    .where(eq(storeIntegrations.id, conn.id));
}

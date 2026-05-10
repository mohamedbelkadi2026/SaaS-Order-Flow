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

const POSITIONAL = {
  name: 0, phone: 1, city: 2, address: 3,
  product: 4, price: 5, quantity: 6,
  utmCampaign: 10, utmSource: 11,
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
      await syncOne(conn as any);
    } catch (err: any) {
      console.error(`[GSHEETS-PUBLIC] Store ${conn.storeId} error:`, err.message);
    }
  }
}

async function syncOne(conn: any) {
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

    let dataStart = 0;
    if (rows.length > 0) {
      const first = rows[0].map(c => c.toLowerCase().trim()).join(' ');
      if (/\b(nom|name|phone|telephone|tel|address|city|ville|product|price|prix|fullname)\b/.test(first)) {
        dataStart = 1;
      }
    }

    const startIdx = Math.max(dataStart, lastRow);
    const newRows = rows.slice(startIdx);

    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      const rowIndex = startIdx + i;

      const name  = (row[POSITIONAL.name]  || '').trim();
      const phone = (row[POSITIONAL.phone] || '').trim();
      if (!phone) continue;

      const ref = `GSP-${sheetId.slice(0, 6)}-${tab.gid}-R${rowIndex + 1}`;

      const existing = await db.select({ id: orders.id }).from(orders)
        .where(eq(orders.orderNumber, ref))
        .limit(1);
      if (existing.length > 0) continue;

      const totalPriceCents = Math.round(
        parseFloat(String(row[POSITIONAL.price] || '0').replace(',', '.')) * 100
      ) || 0;
      const product = (row[POSITIONAL.product] || '').trim() || tab.title;
      const qty     = parseInt(row[POSITIONAL.quantity] || '1', 10) || 1;

      try {
        await (storage as any).createOrder({
          storeId:         conn.storeId,
          magasinId:       conn.magasinId || null,
          orderNumber:     ref,
          customerName:    name,
          customerPhone:   phone,
          customerAddress: (row[POSITIONAL.address] || '').trim(),
          customerCity:    (row[POSITIONAL.city] || '').trim(),
          rawProductName:  product,
          status:          'nouveau',
          totalPrice:      totalPriceCents,
          productCost:     0,
          shippingCost:    0,
          adSpend:         0,
          source:          'gsheets',
          comment:         null,
          utmSource:       (row[POSITIONAL.utmSource] || '').trim() || null,
          utmCampaign:     (row[POSITIONAL.utmCampaign] || '').trim() || null,
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

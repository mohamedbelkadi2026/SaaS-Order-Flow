import { db } from "../db";
import { storeIntegrations } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto";
import { storage } from "../storage";

export async function syncAllGoogleSheets() {
  const connections = await db.select().from(storeIntegrations).where(
    and(
      eq(storeIntegrations.provider, "gsheets"),
      eq(storeIntegrations.isActive, 1),
      sql`${storeIntegrations.oauthAccessToken} IS NOT NULL`,
      sql`${storeIntegrations.spreadsheetId} IS NOT NULL`,
    )
  );

  if (connections.length === 0) return;
  console.log(`[GSHEETS-CRON] Polling ${connections.length} connection(s)`);

  for (const conn of connections) {
    try {
      await syncOneSpreadsheet(conn);
    } catch (err: any) {
      console.error(`[GSHEETS-CRON] Store ${conn.storeId} error:`, err.message);
    }
  }
}

export async function getValidAccessToken(conn: any): Promise<string> {
  const expiresAt = conn.oauthExpiresAt ? new Date(conn.oauthExpiresAt) : new Date(0);
  if (expiresAt.getTime() - Date.now() > 60_000) {
    return decrypt(conn.oauthAccessToken);
  }
  if (!conn.oauthRefreshToken) {
    throw new Error("No refresh token — user must re-authenticate");
  }
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decrypt(conn.oauthRefreshToken),
      client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type:    "refresh_token",
    }),
  });
  const tokens = await resp.json() as any;
  if (!tokens.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(tokens)}`);
  await db.update(storeIntegrations).set({
    oauthAccessToken: encrypt(tokens.access_token),
    oauthExpiresAt:   new Date(Date.now() + tokens.expires_in * 1000),
  }).where(eq(storeIntegrations.id, conn.id));
  return tokens.access_token;
}

async function syncOneSpreadsheet(conn: any) {
  const accessToken = await getValidAccessToken(conn);
  const storeId: number = conn.storeId;

  const metaResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaResp.json() as any;
  if (meta.error) throw new Error(`Sheets API: ${meta.error.message}`);

  const tabs: { title: string; gid: number }[] = (meta.sheets || []).map((s: any) => ({
    title: s.properties.title,
    gid:   s.properties.sheetId,
  }));

  const lastState: Record<string, number> = (conn.lastSyncState as any) || {};
  const storeProducts = await storage.getProducts(storeId);

  let newState = { ...lastState };
  let totalImported = 0;

  for (const tab of tabs) {
    if (conn.syncTabs && conn.syncTabs !== "all") {
      try {
        const allowed: number[] = JSON.parse(conn.syncTabs);
        if (!allowed.includes(tab.gid)) continue;
      } catch {}
    }

    const stateKey = `tab_${tab.gid}`;
    const lastRow = lastState[stateKey] || 0;

    const range = encodeURIComponent(`'${tab.title}'!A${lastRow + 1}:N`);
    const dataResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await dataResp.json() as any;
    if (data.error) {
      console.warn(`[GSHEETS-CRON] Tab "${tab.title}": ${data.error.message}`);
      continue;
    }

    const rows: string[][] = data.values || [];
    if (rows.length === 0) continue;

    let importedThisTab = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const absoluteRow = lastRow + 1 + i;

      const name     = (row[0] || "").toString().trim();
      const phone    = (row[1] || "").toString().trim();
      const city     = (row[2] || "").toString().trim();
      const address  = (row[3] || "").toString().trim();
      const product  = (row[4] || "").toString().trim() || tab.title;
      const rawPrice = parseFloat(String(row[5] || "0").replace(",", ".")) || 0;
      const qty      = parseInt(row[6] || "1") || 1;
      const utmCampaign = (row[10] || "").toString().trim();
      const utmSource   = (row[11] || "").toString().trim();
      const note        = (row[12] || "").toString().trim();
      const productId   = (row[13] || "").toString().trim();

      if (!name && !phone) continue;
      if (!phone) continue;

      const orderNumber = `GS-${conn.spreadsheetId.slice(0, 6)}-${tab.gid}-R${absoluteRow}`;
      const existing = await storage.getOrderByOrderNumber(storeId, orderNumber);
      if (existing) continue;

      const totalPrice = Math.round(rawPrice * 100);
      const matched = storeProducts.find(
        (p) => p.name?.toLowerCase() === product.toLowerCase() ||
               (p as any).sku?.toLowerCase() === product.toLowerCase()
      );

      const orderItems = [{
        productId:      matched ? matched.id : (null as any),
        rawProductName: product,
        quantity:       qty,
        price:          matched ? (matched.price ?? totalPrice) : totalPrice,
        orderId:        0,
      }];

      try {
        const order = await storage.createOrder({
          storeId,
          magasinId:       conn.magasinId ?? null,
          orderNumber,
          customerName:    name,
          customerPhone:   phone,
          customerCity:    city,
          customerAddress: address,
          rawProductName:  product,
          status:          "nouveau",
          totalPrice,
          productCost:     matched ? (matched.costPrice ?? 0) : 0,
          shippingCost:    0,
          adSpend:         0,
          source:          "gsheets",
          comment:         note || null,
          utmSource:       utmSource || null,
          utmCampaign:     utmCampaign || null,
          ...(productId ? { ameexProductId: productId } : {}),
        } as any, orderItems);

        await storage.assignOrderToNextAgent(storeId, order.id);
        importedThisTab++;
        totalImported++;
      } catch (err: any) {
        console.error(`[GSHEETS-CRON] Row ${absoluteRow} failed: ${err.message}`);
      }
    }

    newState[stateKey] = lastRow + rows.length;
    if (importedThisTab > 0) {
      console.log(`[GSHEETS-CRON] Store ${storeId} "${tab.title}": ${importedThisTab} order(s) imported`);
    }
  }

  await db.update(storeIntegrations).set({
    lastSyncState: newState as any,
    lastSyncAt:    new Date(),
  }).where(eq(storeIntegrations.id, conn.id));

  if (totalImported > 0) {
    console.log(`[GSHEETS-CRON] Store ${storeId}: ${totalImported} total order(s) this run`);
  }
}

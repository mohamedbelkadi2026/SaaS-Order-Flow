import { storage } from "../storage";
import { db } from "../db";
import { orderItems } from "@shared/schema";
import { eq } from "drizzle-orm";

const WC_POLL_INTERVAL = 10 * 60 * 1000;

async function syncWooCommerceStore(integration: any) {
  const storeId = integration.storeId;
  const creds = JSON.parse(integration.credentials || '{}');

  if (!creds.storeUrl || !creds.consumerKey || !creds.consumerSecret) {
    await storage.createIntegrationLog({
      storeId, integrationId: integration.id, provider: 'woocommerce',
      action: 'woocommerce_sync', status: 'fail',
      message: 'Identifiants WooCommerce incomplets (storeUrl, consumerKey, consumerSecret requis)',
    });
    return;
  }

  let baseUrl = creds.storeUrl.replace(/\/$/, '');
  if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
  // Fetch recently modified orders, including orders amended by post-checkout upsells.
  // WooCommerce REST does not guarantee a comma-separated status filter.
  const apiUrl = `${baseUrl}/wp-json/wc/v3/orders?per_page=100&orderby=modified&order=desc`;

  const authHeader = 'Basic ' + Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64');

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await storage.createIntegrationLog({
        storeId, integrationId: integration.id, provider: 'woocommerce',
        action: 'woocommerce_sync', status: 'fail',
        message: `Erreur API WooCommerce (${response.status}): ${errorText.slice(0, 500)}`,
      });
      return;
    }

    const wcOrders = await response.json();
    if (!Array.isArray(wcOrders)) {
      await storage.createIntegrationLog({
        storeId, integrationId: integration.id, provider: 'woocommerce',
        action: 'woocommerce_sync', status: 'fail',
        message: 'Réponse API WooCommerce invalide (pas un tableau)',
      });
      return;
    }

    const storeProducts = await storage.getProductsByStore(storeId);
    let imported = 0;
    let skipped = 0;
    let reconciled = 0;

    for (const wcOrder of wcOrders) {
      const orderNumber = String(wcOrder.number || wcOrder.id);
      const existing = await storage.getOrderByNumber(storeId, orderNumber);
      const wcStatus = String(wcOrder.status || "").toLowerCase();
      // This sync imports new open orders; existing WooCommerce orders may
      // still receive upsell/cross-sell products after their initial webhook.
      if (!existing && !["processing", "pending", "on-hold"].includes(wcStatus)) continue;
      if (existing && existing.source !== "woocommerce") { skipped++; continue; }

      const billing = wcOrder.billing || {};
      const shipping = wcOrder.shipping || {};
      const customerName = `${billing.first_name || shipping.first_name || ''} ${billing.last_name || shipping.last_name || ''}`.trim() || 'Client WooCommerce';
      const customerPhone = billing.phone || '';
      const customerAddress = `${shipping.address_1 || billing.address_1 || ''} ${shipping.address_2 || billing.address_2 || ''}`.trim();
      const customerCity = shipping.city || billing.city || '';
      const totalPrice = Math.round(parseFloat(wcOrder.total || '0') * 100);

      let productCost = 0;
      const orderItemsToCreate: { productId: number; quantity: number; price: number; rawProductName: string }[] = [];

      for (const item of (wcOrder.line_items || [])) {
        const matchedProduct = storeProducts.find(
          p => (item.sku && p.sku === item.sku) || p.name === item.name
        );
        if (matchedProduct) {
          const qty = item.quantity || 1;
          orderItemsToCreate.push({
            productId: matchedProduct.id,
            quantity: qty,
            price: Math.round(parseFloat(item.price || '0') * 100),
            rawProductName: item.name || matchedProduct.name,
          });
          productCost += matchedProduct.costPrice * qty;
        }
      }

      // Order-level product name (the UI reads order.rawProductName first), built
      // from the WooCommerce line item titles even when no local product matched.
      const wooProductName = (wcOrder.line_items || [])
        .map((li: any) => li.name).filter(Boolean).join(', ') || null;

      if (existing) {
        // Protect orders already shipped/confirmed/processed in TajerGrow:
        // only reconcile the original WooCommerce intake before fulfilment.
        // Also preserve manually edited items rather than replacing them.
        const editable = ["nouveau", "new"].includes(String(existing.status || "").toLowerCase());
        if (!editable) { skipped++; continue; }
        const actual = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
        const desired = (wcOrder.line_items || []).map((li: any) => ({
          name: String(li.name || "Produit"),
          sku: String(li.sku || ""),
          quantity: Math.max(1, Number(li.quantity) || 1),
          price: Math.round(Number(li.price || 0) * 100),
          productId: storeProducts.find(p => (li.sku && p.sku === li.sku) || p.name === li.name)?.id ?? null,
        }));
        // Count matching lines as a multiset; allows duplicate line items
        // while only inserting those added by the cross-sell.
        const available = [...actual];
        const missing: typeof desired = [];
        for (const item of desired) {
          const matchIndex = available.findIndex(row =>
            String(row.rawProductName || "") === item.name &&
            Number(row.quantity) === item.quantity &&
            Number(row.price) === item.price
          );
          if (matchIndex >= 0) available.splice(matchIndex, 1);
          else missing.push(item);
        }
        // A Woo line was removed/edited, or an agent changed an item: do not
        // silently overwrite or delete the existing TajerGrow lines.
        if (available.length) { skipped++; continue; }
        if (!missing.length) { skipped++; continue; }
        for (const item of missing) {
          await storage.addOrderItem({
            orderId: existing.id, productId: item.productId,
            rawProductName: item.name, sku: item.sku,
            quantity: item.quantity, price: item.price,
          });
        }
        await storage.updateOrder(existing.id, {
          totalPrice,
          rawProductName: wooProductName,
          rawQuantity: desired.reduce((sum: number, item: any) => sum + item.quantity, 0),
        } as any);
        reconciled++;
        console.log("[WOOCOMMERCE-CROSS-SELL]", {storeId, orderId:existing.id, addedItems:missing.length});
        continue;
      }

      await storage.createOrder({
        storeId,
        orderNumber,
        customerName,
        customerPhone,
        customerAddress,
        customerCity,
        rawProductName: wooProductName,
        status: 'nouveau',
        totalPrice,
        productCost,
        shippingCost: 0,
        adSpend: 0,
        source: 'woocommerce',
        comment: wcOrder.customer_note || null,
      } as any, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      imported++;
    }

    await storage.createIntegrationLog({
      storeId, integrationId: integration.id, provider: 'woocommerce',
      action: 'woocommerce_sync', status: 'success',
      message: `Sync WooCommerce: ${imported} importées, ${reconciled} mises à jour (cross-sell), ${skipped} ignorées`,
    });
  } catch (err: any) {
    await storage.createIntegrationLog({
      storeId, integrationId: integration.id, provider: 'woocommerce',
      action: 'woocommerce_sync', status: 'fail',
      message: `Erreur sync WooCommerce: ${err.message}`,
    });
  }
}

async function runWooCommerceSync() {
  try {
    const allIntegrations = await storage.getAllActiveIntegrationsByProvider('woocommerce');

    for (const integration of allIntegrations) {
      await syncWooCommerceStore(integration);
    }
  } catch (err) {
    console.error('WooCommerce sync job error:', err);
  }
}

export function startWooCommerceSync(intervals?: NodeJS.Timeout[]) {
  console.log(`[WooCommerce Sync] Starting polling job (every ${WC_POLL_INTERVAL / 1000}s)`);
  // A slow shop must not start a second full import while the first is still running.
  // This bounds concurrent API calls, product hydration and database writes.
  let running = false;
  const run = async () => {
    if (running) {
      console.warn('[WooCommerce Sync] Previous run still active; skipping overlapping tick');
      return;
    }
    running = true;
    try {
      await runWooCommerceSync();
    } catch (err) {
      console.error('[WooCommerce Sync] Job error (continuing):', err);
    } finally {
      running = false;
    }
  };
  run();
  const id = setInterval(run, WC_POLL_INTERVAL);
  if (intervals) intervals.push(id);
  return id;
}

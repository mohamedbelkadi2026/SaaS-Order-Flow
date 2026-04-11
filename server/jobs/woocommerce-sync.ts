import { storage } from "../storage";

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
  const apiUrl = `${baseUrl}/wp-json/wc/v3/orders?status=processing,pending&per_page=50`;

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

    for (const wcOrder of wcOrders) {
      const orderNumber = String(wcOrder.number || wcOrder.id);
      const existing = await storage.getOrderByNumber(storeId, orderNumber);
      if (existing) {
        skipped++;
        continue;
      }

      const billing = wcOrder.billing || {};
      const shipping = wcOrder.shipping || {};
      const customerName = `${billing.first_name || shipping.first_name || ''} ${billing.last_name || shipping.last_name || ''}`.trim() || 'Client WooCommerce';
      const customerPhone = billing.phone || '';
      const customerAddress = `${shipping.address_1 || billing.address_1 || ''} ${shipping.address_2 || billing.address_2 || ''}`.trim();
      const customerCity = shipping.city || billing.city || '';
      const totalPrice = Math.round(parseFloat(wcOrder.total || '0') * 100);

      let productCost = 0;
      const orderItemsToCreate: { productId: number; quantity: number; price: number }[] = [];

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
          });
          productCost += matchedProduct.costPrice * qty;
        }
      }

      await storage.createOrder({
        storeId,
        orderNumber,
        customerName,
        customerPhone,
        customerAddress,
        customerCity,
        status: 'nouveau',
        totalPrice,
        productCost,
        shippingCost: 0,
        adSpend: 0,
        source: 'woocommerce',
        comment: wcOrder.customer_note || null,
      }, orderItemsToCreate.map(i => ({ ...i, orderId: 0 })));

      imported++;
    }

    await storage.createIntegrationLog({
      storeId, integrationId: integration.id, provider: 'woocommerce',
      action: 'woocommerce_sync', status: 'success',
      message: `Sync WooCommerce: ${imported} importées, ${skipped} ignorées (déjà existantes)`,
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

export function startWooCommerceSync() {
  console.log(`[WooCommerce Sync] Starting polling job (every ${WC_POLL_INTERVAL / 1000}s)`);
  runWooCommerceSync();
  setInterval(runWooCommerceSync, WC_POLL_INTERVAL);
}

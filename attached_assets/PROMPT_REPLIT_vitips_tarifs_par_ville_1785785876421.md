FEATURE — Tarifs de livraison manuels pour Vitips Express : 35 DH partout,
20 DH pour Casablanca. Réutilise l'infrastructure `carrierCityPricing` déjà
en place (créée pour Express Coursier), qui est générique par transporteur
— pas de nouvelle table nécessaire.

────────────────────────────────────────────────────────────────────────────
ÉTAPE 1 — Fichier de données : server/seed-data/vitips-city-pricing.ts

```ts
// Tarifs Vitips Express — définis manuellement (pas de données historiques
// disponibles pour ce transporteur, contrairement à Express Coursier).
// Toute ville absente de la liste ci-dessous utilise le tarif par défaut.
export const VITIPS_DEFAULT_CITY_PRICE_DH = 35;

// Seule exception connue à ce jour : Casablanca.
export const VITIPS_CITY_PRICING_SEED: [string, number][] = [
  ["Casablanca", 20],
];
```

────────────────────────────────────────────────────────────────────────────
ÉTAPE 2 — server/routes.ts : endpoint d'import (à appeler une seule fois)

```ts
app.post("/api/carriers/vitipsexpress/import-city-pricing", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const storeId = req.user!.storeId!;
    const { VITIPS_CITY_PRICING_SEED } = await import("./seed-data/vitips-city-pricing");
    let count = 0;
    for (const [city, priceDh] of VITIPS_CITY_PRICING_SEED) {
      await storage.upsertCarrierCityPrice(storeId, "vitipsexpress", city, priceDh * 100, "manual");
      count++;
    }
    res.json({ message: `${count} tarif(s) de ville importé(s) pour Vitips Express`, count });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
```

────────────────────────────────────────────────────────────────────────────
ÉTAPE 3 — server/routes.ts : appliquer le tarif au moment de l'expédition

Trouver le bloc existant (~ligne 1947) :
```ts
// Per-city delivery cost for Express Coursier (replaces static deliveryFee)
if (provider.toLowerCase() === 'expresscoursier') {
  allDbUpdates.push(
    storage.getCarrierCityPrice(storeId, 'expresscoursier', (order as any).customerCity || '')
      .then(async (cityFee) => {
        const { EC_DEFAULT_CITY_PRICE_DH } = await import('./seed-data/ec-city-pricing');
        const price = cityFee ?? (EC_DEFAULT_CITY_PRICE_DH * 100);
        console.log(`[EC-COST] Order #${ref} city="${(order as any).customerCity}" → shippingCost=${price} (${cityFee != null ? 'per-city table' : 'default 35 DH fallback'})`);
        return storage.updateOrder(order.id, { shippingCost: price });
      })
      .catch(costErr => console.error('[EC-COST] Failed to fetch city price:', costErr))
  );
}
```

Ajouter juste après (bloc jumeau pour Vitips) :
```ts
// Per-city delivery cost for Vitips Express (same mechanism as Express Coursier)
if (provider.toLowerCase() === 'vitipsexpress') {
  allDbUpdates.push(
    storage.getCarrierCityPrice(storeId, 'vitipsexpress', (order as any).customerCity || '')
      .then(async (cityFee) => {
        const { VITIPS_DEFAULT_CITY_PRICE_DH } = await import('./seed-data/vitips-city-pricing');
        const price = cityFee ?? (VITIPS_DEFAULT_CITY_PRICE_DH * 100);
        console.log(`[VITIPS-COST] Order #${ref} city="${(order as any).customerCity}" → shippingCost=${price} (${cityFee != null ? 'per-city table' : 'default 35 DH fallback'})`);
        return storage.updateOrder(order.id, { shippingCost: price });
      })
      .catch(costErr => console.error('[VITIPS-COST] Failed to fetch city price:', costErr))
  );
}
```

────────────────────────────────────────────────────────────────────────────
ÉTAPE 4 — server/routes.ts : backfill pour les commandes Vitips déjà en base
(shippingCost à 0)

Ajouter, à côté de `/api/carriers/expresscoursier/backfill-shipping-cost` :
```ts
app.post("/api/carriers/vitipsexpress/backfill-shipping-cost", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const storeId = req.user!.storeId!;
    const { VITIPS_DEFAULT_CITY_PRICE_DH } = await import("./seed-data/vitips-city-pricing");
    const orders = await storage.getOrdersByStoreAndCarrier(storeId, "vitipsexpress");

    let updated = 0, skippedNoCity = 0, usedDefault = 0;
    for (const order of orders) {
      if ((order as any).shippingCost && (order as any).shippingCost > 0) continue;
      if (!(order as any).customerCity) { skippedNoCity++; continue; }

      const cityFee = await storage.getCarrierCityPrice(storeId, "vitipsexpress", (order as any).customerCity);
      const fee = cityFee ?? (VITIPS_DEFAULT_CITY_PRICE_DH * 100);
      if (!cityFee) usedDefault++;

      await storage.updateOrder(order.id, { shippingCost: fee });
      updated++;
    }

    console.log(`[VITIPS-BACKFILL] store=${storeId} total=${orders.length} updated=${updated} usedDefault=${usedDefault} skippedNoCity=${skippedNoCity}`);
    res.json({ message: `${updated} commandes mises à jour`, updated, usedDefault, skippedNoCity, total: orders.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
```

────────────────────────────────────────────────────────────────────────────
ÉTAPE 5 — server/routes.ts : le job générique "FIX-COST" (~ligne 9994) a déjà
une branche générique `else if (carrier) { ... }` pour tout transporteur
autre qu'Express Coursier/Digylog, MAIS elle n'applique un tarif QUE si une
ligne existe dans la table (`cityFee && cityFee > 0`) — elle n'a pas de
fallback par défaut, donc toutes les villes hors Casablanca resteraient à 0
dans ce job précis. Ajouter une branche dédiée Vitips, juste avant la
branche générique `else if (carrier)` :

```ts
} else if (carrier === 'vitipsexpress') {
  const { VITIPS_DEFAULT_CITY_PRICE_DH } = await import('./seed-data/vitips-city-pricing');
  const cityFee = await storage.getCarrierCityPrice(storeId, 'vitipsexpress', (order as any).customerCity || '');
  const price = cityFee ?? (VITIPS_DEFAULT_CITY_PRICE_DH * 100);
  await storage.updateOrder(order.id, { shippingCost: price });
  console.log(`[FIX-COST] #${(order as any).orderNumber} Vitips city="${(order as any).customerCity}" → shippingCost=${price} (${cityFee != null ? 'per-city table' : 'default 35 DH'})`);
  fixed++;
} else if (carrier) {
  // ... branche générique existante, inchangée ...
```

────────────────────────────────────────────────────────────────────────────
DÉPLOIEMENT
1. git add -A && git commit -m "Add manual per-city pricing for Vitips Express (35 DH default, 20 DH Casablanca)" && git push
2. Une fois déployé, appeler UNE FOIS :
   POST /api/carriers/vitipsexpress/import-city-pricing
3. Puis, pour corriger les commandes Vitips déjà en base à 0 :
   POST /api/carriers/vitipsexpress/backfill-shipping-cost

VÉRIFICATION
- Une nouvelle commande expédiée via Vitips Express vers Casablanca reçoit
  shippingCost = 2000 (20 DH) ; vers n'importe quelle autre ville,
  shippingCost = 3500 (35 DH).
- Après le backfill, les anciennes commandes Vitips à 0 DH sont corrigées
  avec les mêmes règles.
- Le Profit Analyzer reflète immédiatement le vrai coût Vitips par ville
  (aucune modification nécessaire côté profit.ts, qui lit déjà
  `order.shippingCost` directement).

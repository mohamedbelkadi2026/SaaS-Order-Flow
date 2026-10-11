import type { Express } from "express";
import { db } from "./db";
import { storeIntegrations } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { storage } from "./storage";
import { listMetaAdAccounts, normalizeAdAccountId, testMetaConnection, fetchMetaDailySpend } from "./services/meta-ads";

// Restore the endpoints used by MetaAdsCard; never expose a stored access token.
export function registerMetaAdsRoutes(app: Express) {
  const auth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.() || !req.user?.storeId) return res.status(401).json({ message: "Non authentifié" });
    if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "owner") return res.status(403).json({ message: "Accès administrateur requis" });
    next();
  };
  const find = async (storeId: number) => {
    const rows = await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId, storeId), eq(storeIntegrations.provider, "meta"), eq(storeIntegrations.type, "ads")));
    return rows[0];
  };
  app.get("/api/meta-ads/status", auth, async (req: any, res) => {
    try {
      const row = await find(req.user.storeId);
      let c: any = {};
      try { c = JSON.parse(row?.credentials || "{}"); } catch {}
      return res.json({ connected: !!row && row.isActive !== 0 && !!c.accessToken && !!c.adAccountId, adAccountId: c.adAccountId || null, adAccountIds: c.adAccountIds || (c.adAccountId ? [c.adAccountId] : []), accountName: c.accountName || null, currency: c.currency || null, lastSyncAt: row?.lastSyncAt || null, lastError: c.lastError || null, lastSyncRows: c.lastSyncRows ?? null, accountNames: c.accountNames || (c.adAccountId ? { [c.adAccountId]: c.accountName || c.adAccountId } : {}), magasinId: row?.magasinId || null });
    } catch (e) { console.error("[META-ROUTES] status failed", e); return res.status(500).json({ message: "Lecture Meta impossible" }); }
  });
  app.post("/api/meta-ads/accounts", auth, async (req: any, res) => {
    const token = String(req.body?.accessToken || "").trim();
    if (!token) return res.status(400).json({ message: "Token requis" });
    const result = await listMetaAdAccounts(token);
    return result.error ? res.status(400).json({ message: result.error }) : res.json({ accounts: result.accounts });
  });
  app.post("/api/meta-ads/connect", auth, async (req: any, res) => {
    const token = String(req.body?.accessToken || "").trim();
    const ids = [...new Set((Array.isArray(req.body?.adAccountIds) && req.body.adAccountIds.length ? req.body.adAccountIds : [req.body?.adAccountId]).filter((v: any) => typeof v === "string" && /^(act_)?[0-9]+$/.test(v.trim())).map((v: string) => normalizeAdAccountId(v)))];
    if (!token || !ids.length) return res.status(400).json({ message: "Token et identifiant publicitaire requis" });
    try {
      const tests = await Promise.all(ids.map(id => testMetaConnection(id, token)));
      const failure = tests.find(x => !x.ok);
      if (failure) return res.status(400).json({ message: failure.error || "Accès Meta refusé" });
      const storeId = req.user.storeId;
      const existing = await find(storeId);
      const magasinId = req.body?.magasinId ? Number(req.body.magasinId) : null;
      const credentials = JSON.stringify({ adAccountId: ids[0], adAccountIds: ids, accessToken: token, accountName: tests[0].accountName, currency: tests[0].currency, timezone: tests[0].timezone, accountNames: Object.fromEntries(ids.map((id, i) => [id, tests[i].accountName || id])) });
      if (existing) await db.update(storeIntegrations).set({ credentials, isActive: 1, ...(magasinId ? { magasinId } : {}) }).where(eq(storeIntegrations.id, existing.id));
      else await db.insert(storeIntegrations).values({ storeId, provider: "meta", type: "ads", credentials, isActive: 1, ...(magasinId ? { magasinId } : {}) });
      return res.json({ connected: true, accountName: tests[0].accountName, adAccountId: ids[0] });
    } catch (e) { console.error("[META-ROUTES] connect failed", e); return res.status(500).json({ message: "Enregistrement Meta impossible" }); }
  });
  // Disconnect only disables automatic imports. Preserve credentials, history and campaign mappings.
  app.post("/api/meta-ads/disconnect", auth, async (req: any, res) => {
    try {
      const row = await find(req.user.storeId);
      if (row) await db.update(storeIntegrations).set({ isActive: 0 }).where(eq(storeIntegrations.id, row.id));
      return res.json({ connected: false });
    } catch (e) { console.error("[META-ROUTES] disconnect failed", e); return res.status(500).json({ message: "Déconnexion impossible" }); }
  });

  app.post("/api/meta-ads/accounts/manage", auth, async (req: any, res) => {
    try {
      const row = await find(req.user.storeId);
      if (!row || row.isActive === 0) return res.status(400).json({ message: "Connectez Meta Ads d'abord" });
      const c = JSON.parse(row.credentials || "{}");
      const raw = String(req.body?.adAccountId || "").trim();
      if (!/^(act_)?[0-9]+$/.test(raw)) return res.status(400).json({ message: "Identifiant publicitaire invalide" });
      const id = normalizeAdAccountId(raw);
      const action = req.body?.action;
      let ids: string[] = [...new Set((c.adAccountIds || [c.adAccountId]).filter(Boolean).map((x: string) => normalizeAdAccountId(x))) ] as string[];
      if (action === "add") {
        const check = await testMetaConnection(id, c.accessToken);
        if (!check.ok) return res.status(400).json({ message: check.error || "Accès refusé" });
        if (!ids.includes(id)) ids.push(id);
        c.accountNames = { ...(c.accountNames || {}), [id]: check.accountName || id };
      } else if (action === "remove") {
        if (!ids.includes(id)) return res.status(404).json({ message: "Compte introuvable" });
        if (ids.length === 1) return res.status(400).json({ message: "Déconnectez Meta pour retirer le dernier compte" });
        ids = ids.filter(x => x !== id);
        if (c.accountNames) delete c.accountNames[id];
      } else return res.status(400).json({ message: "Action invalide" });
      c.adAccountIds = ids; c.adAccountId = ids[0];
      c.accountName = c.accountNames?.[ids[0]] || c.accountName;
      await db.update(storeIntegrations).set({ credentials: JSON.stringify(c) }).where(eq(storeIntegrations.id, row.id));
      return res.json({ adAccountIds: ids });
    } catch (e) { console.error("[META-ROUTES] manage failed", e); return res.status(500).json({ message: "Gestion des comptes impossible" }); }
  });

  app.post("/api/meta-ads/sync", auth, async (req: any, res) => {
    try {
      const row = await find(req.user.storeId);
      if (!row || row.isActive === 0) return res.status(400).json({ message: "Meta Ads non connecté" });
      const c = JSON.parse(row.credentials || "{}");
      if (!c.accessToken) return res.status(400).json({ message: "Token Meta manquant" });
      const today = new Date().toISOString().slice(0, 10);
      const since = String(req.body?.since || today.slice(0, 7) + "-01");
      const until = String(req.body?.until || today);
      const valid = (v: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
      if (!valid(since) || !valid(until) || since > until || (Date.parse(until) - Date.parse(since)) / 86400000 > 366)
        return res.status(400).json({ message: "Période invalide (maximum 366 jours)" });
      const ids: string[] = [...new Set((c.adAccountIds?.length ? c.adAccountIds : [c.adAccountId]).filter(Boolean))] as string[];
      if (!ids.length) return res.status(400).json({ message: "Aucun compte publicitaire" });
      let synced = 0;
      const errors: string[] = [];
      for (const id of ids) {
        const result = await fetchMetaDailySpend(id, c.accessToken, since, until);
        if (result.error) { errors.push(id + ": " + result.error); continue; }
        synced += await storage.upsertMetaAdSpend(req.user.storeId, result.rows, id);
      }
      c.lastSyncRows = synced;
      c.lastError = errors.length ? errors.join("; ").slice(0, 800) : null;
      await db.update(storeIntegrations).set({ credentials: JSON.stringify(c), lastSyncAt: new Date() }).where(eq(storeIntegrations.id, row.id));
      if (errors.length) return res.status(502).json({ message: "Import incomplet : " + c.lastError, synced, since, until });
      return res.json({ synced, since, until });
    } catch (e) { console.error("[META-ROUTES] sync failed", e); return res.status(500).json({ message: "Import Meta impossible" }); }
  });

  app.get("/api/meta-ads/spend", auth, async (req: any, res) => {
    try {
      const since = typeof req.query.since === "string" ? req.query.since : undefined;
      const until = typeof req.query.until === "string" ? req.query.until : undefined;
      return res.json(await storage.getMetaAdSpend(req.user.storeId, since, until));
    } catch (e) { console.error("[META-ROUTES] spend failed", e); return res.status(500).json({ message: "Lecture des dépenses impossible" }); }
  });

  app.get("/api/meta-ads/campaigns", auth, async (req: any, res) => {
    try {
      const since = typeof req.query.since === "string" ? req.query.since : undefined;
      const until = typeof req.query.until === "string" ? req.query.until : undefined;
      const row = await find(req.user.storeId);
      let c: any = {}; try { c = JSON.parse(row?.credentials || "{}"); } catch {}
      const rate = Number(c.usdToMadRate) > 0 ? Number(c.usdToMadRate) : 10;
      const campaigns = (await storage.getMetaCampaignsWithMapping(req.user.storeId, since, until)).map(x => ({
        ...x, amountMad: x.currency === "MAD" ? x.totalAmount : x.currency === "USD" ? Math.round(x.totalAmount * rate) : x.totalAmount,
      }));
      return res.json({ campaigns, rate, unmappedCount: campaigns.filter(c => !c.productId).length });
    } catch (e) { console.error("[META-ROUTES] campaigns failed", e); return res.status(500).json({ message: "Lecture des campagnes impossible" }); }
  });

  app.post("/api/meta-ads/campaigns/map", auth, async (req: any, res) => {
    try {
      const campaignId = String(req.body?.campaignId || "").trim();
      const campaignName = String(req.body?.campaignName || campaignId).trim();
      const productId = req.body?.productId == null ? null : Number(req.body.productId);
      if (!campaignId || (productId !== null && (!Number.isSafeInteger(productId) || productId <= 0))) return res.status(400).json({ message: "Campagne ou produit invalide" });
      await storage.setCampaignProductMapping(req.user.storeId, campaignId, campaignName, productId);
      return res.json({ ok: true });
    } catch (e) { console.error("[META-ROUTES] mapping failed", e); return res.status(500).json({ message: "Association impossible" }); }
  });

  app.post("/api/meta-ads/rate", auth, async (req: any, res) => {
    try {
      const rate = Number(req.body?.rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) return res.status(400).json({ message: "Taux invalide" });
      const row = await find(req.user.storeId);
      if (!row) return res.status(404).json({ message: "Connexion Meta introuvable" });
      const c = JSON.parse(row.credentials || "{}");
      c.usdToMadRate = rate;
      await db.update(storeIntegrations).set({ credentials: JSON.stringify(c) }).where(eq(storeIntegrations.id, row.id));
      return res.json({ rate });
    } catch (e) { console.error("[META-ROUTES] rate failed", e); return res.status(500).json({ message: "Enregistrement du taux impossible" }); }
  });

}

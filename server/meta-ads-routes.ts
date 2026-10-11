import type { Express } from "express";
import { db } from "./db";
import { storeIntegrations } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { listMetaAdAccounts, normalizeAdAccountId, testMetaConnection } from "./services/meta-ads";

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
      return res.json({ connected: !!row && row.isActive !== 0 && !!c.accessToken && !!c.adAccountId, adAccountId: c.adAccountId || null, adAccountIds: c.adAccountIds || (c.adAccountId ? [c.adAccountId] : []), accountName: c.accountName || null, currency: c.currency || null, lastSyncAt: row?.lastSyncAt || null, magasinId: row?.magasinId || null });
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
      const credentials = JSON.stringify({ adAccountId: ids[0], adAccountIds: ids, accessToken: token, accountName: tests[0].accountName, currency: tests[0].currency, timezone: tests[0].timezone });
      if (existing) await db.update(storeIntegrations).set({ credentials, isActive: 1, ...(magasinId ? { magasinId } : {}) }).where(eq(storeIntegrations.id, existing.id));
      else await db.insert(storeIntegrations).values({ storeId, provider: "meta", type: "ads", credentials, isActive: 1, ...(magasinId ? { magasinId } : {}) });
      return res.json({ connected: true, accountName: tests[0].accountName, adAccountId: ids[0] });
    } catch (e) { console.error("[META-ROUTES] connect failed", e); return res.status(500).json({ message: "Enregistrement Meta impossible" }); }
  });
}

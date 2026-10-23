import type { Express } from "express";
import { ExpressRelaisClient } from "./integrations/express-relais";
import { readExpressRelaisStatus, expressRelaisAccountMatches } from "./integrations/express-relais-status";

export function registerExpressRelaisRoutes(app: Express) {
  // Express Relais notifies this permanent URL when a parcel changes state.
  // Do NOT trust the unauthenticated webhook payload as proof of delivery:
  // independently query Express Relais using this store's own API credentials.
  app.post("/api/webhooks/carrier/:storeId/expressrelais", async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isSafeInteger(storeId) || storeId <= 0) return res.sendStatus(400);
    const body: any = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.sendStatus(400);
    const candidate = body.data?.parcel ?? body.data ?? body.parcel ?? body;
    const orderReference = String(
      candidate?.idParcelClient ?? candidate?.id_parcel_client ??
      candidate?.reference ?? candidate?.orderNumber ?? candidate?.order_id ?? ""
    ).trim();
    const trackingReference = String(candidate?.idParcelExpress ?? candidate?.trackingNumber ?? candidate?.tracking ?? "").trim();
    if ((!orderReference && !trackingReference) || orderReference.length > 100 || trackingReference.length > 100) {
      console.warn("[EXPRESS-RELAIS-WEBHOOK] Missing idParcelClient", {storeId, keys:Object.keys(candidate || {}).slice(0,15)});
      return res.status(202).json({received:true,matched:false});
    }
    try {
      const { db } = await import("./db");
      const { orders, carrierAccounts } = await import("@shared/schema");
      const { and, eq, or, sql } = await import("drizzle-orm");
      const { storage } = await import("./storage");
      const { broadcastToStore } = await import("./sse");
      const matches = await db.select().from(orders).where(and(
        eq(orders.storeId, storeId), or(
          orderReference ? eq(orders.orderNumber, orderReference) : undefined,
          trackingReference ? eq(orders.trackNumber, trackingReference) : undefined,
        ),
        sql`LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(${orders.shippingProvider}), ''), ${orders.carrierName}, ''), '[^a-zA-Z]', '', 'g')) = 'expressrelais'`
      )).limit(2);
      if (matches.length !== 1) return res.status(202).json({received:true,matched:false});
      const order = matches[0];
      const accounts = await db.select().from(carrierAccounts).where(and(
        eq(carrierAccounts.storeId, storeId),
        sql`LOWER(REGEXP_REPLACE(${carrierAccounts.carrierName}, '[^a-zA-Z]', '', 'g')) = 'expressrelais'`
      ));
      const eligibleAccounts = accounts.filter(a => a.isActive !== 0 && a.apiKey && a.apiSecret && expressRelaisAccountMatches(order,a));
      if (!eligibleAccounts.length) return res.status(202).json({received:true,verified:false});
      // Use the carrier's authenticated status lookup. Ignore unverified
      // incoming status values to prevent forged LIVRÉ/RETOUR events.
      const reference = String(order.orderNumber || order.id);
      let verified: ReturnType<typeof readExpressRelaisStatus> = null;
      let verifiedAccountId: number | null = null;
      let verificationFailed = false;
      for (const account of eligibleAccounts) {
        try {
          const client = new ExpressRelaisClient({login:account.apiKey,password:account.apiSecret!,environment:"prod"});
          verified = readExpressRelaisStatus(await client.getStatus(reference), reference);
          if (verified) { verifiedAccountId = account.id; break; }
        } catch { verificationFailed = true; }
      }
      if (!verified) return res.status(verificationFailed ? 502 : 202).json({received:true,verified:false});
      const { raw, status } = verified;
      if (order.carrierId == null && verifiedAccountId != null) await storage.updateOrder(order.id,{carrierId:verifiedAccountId});
      // Always keep the exact verified carrier label visible, including future
      // Express Relais status codes not yet mapped to a business bucket.
      // Do not manufacture a delivery/refusal/return for unknown codes.
      const rawChanged = raw !== order.commentStatus;
      const statusChanged = !!status && status !== order.status;
      if (statusChanged) await storage.updateOrderStatus(order.id,status);
      // Charge the agreed Express Relais tariff on confirmed deliveries only.
      // Protect previously configured/manual positive shipping fees.
      if (status === "delivered" && !(Number(order.shippingCost) > 0)) {
        const { orders: orderTable } = await import("@shared/schema");
        const { and, eq, sql } = await import("drizzle-orm");
        const city = String(order.customerCity || "").toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
        const fee = /^(casablanca|casa|dar beida|dar el beida)$/.test(city) ? 1800 : 2800;
        await db.update(orderTable).set({shippingCost:fee}).where(and(
          eq(orderTable.id,order.id), sql`COALESCE(${orderTable.shippingCost},0) <= 0`
        ));
        broadcastToStore(storeId,"order_updated",{orderId:order.id,status,shippingCost:fee});
      }
      if (rawChanged) await storage.updateOrder(order.id,{commentStatus:raw});
      if (statusChanged || rawChanged) {
        await storage.createOrderFollowUpLog({
          orderId:order.id,agentId:null,agentName:"Express Relais Webhook",
          note:`📦 Express Relais: ${raw}${status ? " → "+status : " (statut transporteur)"}`,
        });
        broadcastToStore(storeId,"order_updated",{
          orderId:order.id,status:status || order.status,commentStatus:raw,
        });
      }
      if (!status) console.info("[EXPRESS-RELAIS-WEBHOOK] Preserved unmapped verified status",{storeId,orderId:order.id,raw:raw.slice(0,100)});
      return res.json({received:true,verified:true,updated:statusChanged || rawChanged,mapped:!!status});
    } catch (error:any) {
      console.error("[EXPRESS-RELAIS-WEBHOOK] Failed", {storeId,error:String(error?.message || error).slice(0,160)});
      return res.status(502).json({received:false,message:"Carrier verification temporarily unavailable"});
    }
  });

  app.post("/api/shipping/expressrelais/test", async (req, res) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ ok: false, message: "Connexion requise" });
    const login = typeof req.body?.login === "string" ? req.body.login.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!login || !password) return res.status(400).json({ ok: false, message: "Login et mot de passe requis" });
    try {
      const client = new ExpressRelaisClient({ login, password, environment: "prod" });
      const info = await client.testConnection();
      return res.json({ ok: true, message: "Connexion Express Relais réussie", account: info });
    } catch (error: any) {
      const upstreamStatus = Number(error?.status) || null;
      const wafBlocked = String(error?.message || "").includes("EXPRESS_RELAIS_WAF_BLOCKED");
      const reason = wafBlocked ? "cloudflare_waf" : upstreamStatus === 401 ? "invalid_credentials" : upstreamStatus === 403 ? "access_denied" : "upstream_error";
      console.warn("[ExpressRelais-ConnectionTest]", { reason, upstreamStatus });
      const message = wafBlocked
        ? "Cloudflare bloque les requêtes sortantes de ce serveur. Vérifiez l'autorisation des IPs Railway auprès d'Express Relais."
        : upstreamStatus === 401 ? "Identifiants Express Relais refusés (HTTP 401)."
        : upstreamStatus === 403 ? "Accès Express Relais refusé (HTTP 403). Vérifiez les droits API et les IPs autorisées."
        : "Connexion Express Relais impossible. Consultez les logs du serveur.";
      return res.status(wafBlocked ? 502 : upstreamStatus === 401 ? 401 : upstreamStatus === 403 ? 403 : 502).json({ ok: false, reason, upstreamStatus, message });
    }
  });
}

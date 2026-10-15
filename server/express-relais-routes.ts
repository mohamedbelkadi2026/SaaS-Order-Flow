import type { Express } from "express";
import { ExpressRelaisClient } from "./integrations/express-relais";

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
    if (!orderReference || orderReference.length > 100) {
      console.warn("[EXPRESS-RELAIS-WEBHOOK] Missing idParcelClient", {storeId, keys:Object.keys(candidate || {}).slice(0,15)});
      return res.status(202).json({received:true,matched:false});
    }
    try {
      const { db } = await import("./db");
      const { orders, carrierAccounts } = await import("@shared/schema");
      const { and, eq, sql } = await import("drizzle-orm");
      const { storage } = await import("./storage");
      const { broadcastToStore } = await import("./sse");
      const matches = await db.select().from(orders).where(and(
        eq(orders.storeId, storeId), eq(orders.orderNumber, orderReference),
        sql`LOWER(REGEXP_REPLACE(COALESCE(${orders.shippingProvider}, ${orders.carrierName}, ''), '[^a-zA-Z]', '', 'g')) = 'expressrelais'`
      )).limit(2);
      if (matches.length !== 1) return res.status(202).json({received:true,matched:false});
      const order = matches[0];
      const accounts = await db.select().from(carrierAccounts).where(and(
        eq(carrierAccounts.storeId, storeId),
        sql`LOWER(REGEXP_REPLACE(${carrierAccounts.carrierName}, '[^a-zA-Z]', '', 'g')) = 'expressrelais'`
      ));
      const account = accounts.find(a => a.isActive !== 0 && a.apiKey && a.apiSecret &&
        (order.carrierId ? a.id === order.carrierId : true));
      if (!account) return res.status(202).json({received:true,verified:false});
      // Use the carrier's authenticated status lookup. Ignore unverified
      // incoming status values to prevent forged LIVRÉ/RETOUR events.
      const client = new ExpressRelaisClient({login:account.apiKey,password:account.apiSecret,environment:"prod"});
      const response: any = await client.getStatus(orderReference);
      const apiCode = response?.codeApi ?? response?.data?.codeApi;
      if (apiCode != null && !["0","200","5000"].includes(String(apiCode))) {
        console.warn("[EXPRESS-RELAIS-WEBHOOK] Verification API code", {storeId,orderId:order.id,apiCode:String(apiCode)});
        return res.status(202).json({received:true,verified:false});
      }
      const payload = response?.data?.parcel ?? response?.data?.colis ?? response?.data ?? response?.parcel ?? response;
      const verified = Array.isArray(payload)
        ? payload.find((item:any) => String(item?.idParcelClient ?? item?.reference ?? "") === orderReference)
        : payload;
      if (!verified || typeof verified !== "object") return res.status(202).json({received:true,verified:false});
      const raw = [verified.statusParcel,verified.statutColis,verified.deliveryStatus,verified.status,verified.statut,verified.etat]
        .find((value:unknown) => typeof value === "string" && !!value.trim()) as string | undefined;
      if (!raw) {
        console.info("[EXPRESS-RELAIS-WEBHOOK] Unknown response shape", {storeId,orderId:order.id,keys:Object.keys(verified).slice(0,15)});
        return res.status(202).json({received:true,verified:false});
      }
      const norm = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
      const status =
        /retour (recu|receptionne)|returned|retourne/.test(norm) ? "retourné" :
        /retour (ready|pret|en cours)|return (ready|pending)/.test(norm) ? "RETOUR READY" :
        /livre|delivered|distribue au client/.test(norm) ? "delivered" :
        /refuse|refused/.test(norm) ? "refused" :
        /annule par client|cancelled by customer/.test(norm) ? "Annulé par client" :
        /annule|cancelled/.test(norm) ? "Annulé" :
        /en cours de livraison|mise? en distribution|out for delivery/.test(norm) ? "Mis en distribution" :
        /ramasse|picked up|pris en charge/.test(norm) ? "Ramassé" :
        /attente ramassage|pending pickup/.test(norm) ? "Attente De Ramassage" : null;
      if (!status) {
        console.info("[EXPRESS-RELAIS-WEBHOOK] Unmapped verified status",{storeId,orderId:order.id,raw:raw.slice(0,100)});
        return res.status(202).json({received:true,verified:true,mapped:false});
      }
      if (status !== order.status) await storage.updateOrderStatus(order.id,status);
      if (raw !== order.commentStatus) await storage.updateOrder(order.id,{commentStatus:raw});
      if (status !== order.status || raw !== order.commentStatus) {
        await storage.createOrderFollowUpLog({
          orderId:order.id,agentId:null,agentName:"Express Relais Webhook",
          note:`📦 Express Relais: ${raw} → ${status}`,
        });
        broadcastToStore(storeId,"order_updated",{orderId:order.id,status,commentStatus:raw});
      }
      return res.json({received:true,verified:true,updated:status !== order.status || raw !== order.commentStatus});
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

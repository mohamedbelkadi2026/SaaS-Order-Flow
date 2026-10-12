import type { Express } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storeIntegrations } from "@shared/schema";
import { encrypt } from "./crypto";
import { storage } from "./storage";

const CLIENT_ID = () => process.env.LIGHTFUNNELS_CLIENT_ID || "";
const CLIENT_SECRET = () => process.env.LIGHTFUNNELS_CLIENT_SECRET || "";
const CALLBACK = () => process.env.LIGHTFUNNELS_REDIRECT_URI || "https://www.tajergrow.com/api/lightfunnels/callback";
const GQL = "https://services.lightfunnels.com/api/v2";
const TOKEN = "https://api.lightfunnels.com/api/v3/access_token";
const equal = (a:string,b:string) => {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
};
const sign = (text:string) => createHmac("sha256",process.env.SESSION_SECRET!).update(text).digest("base64url");
async function tokenGrant(data:Record<string,string>) {
  const resp=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...data,client_id:CLIENT_ID(),client_secret:CLIENT_SECRET()}),signal:AbortSignal.timeout(15000)});
  if(!resp.ok) throw new Error("OAuth HTTP "+resp.status);
  const json:any=await resp.json();
  if(!json.access_token || !json.refresh_token) throw new Error("Missing OAuth tokens");
  return json;
}
async function registerWebhook(accessToken:string,url:string) {
  const resp=await fetch(GQL,{method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify({query:"mutation ($node: WebhookInput!) { createWebhook(node:$node) { type url } }",variables:{node:{type:"order/confirmed",url,settings:{}}}}),signal:AbortSignal.timeout(15000)});
  if(!resp.ok) throw new Error("GraphQL HTTP "+resp.status);
  const result:any=await resp.json();
  if(result.errors?.length) throw new Error(String(result.errors[0].message));
  if(!result.data?.createWebhook) throw new Error("Webhook not registered");
}
// Store identity must be obtained from Lightfunnels itself, never guessed
// from the TajerGrow destination magasin or an untrusted webhook attribute.
async function listRemoteStores(accessToken:string):Promise<{id:string;name:string;domain:string}[]> {
  const response=await fetch(GQL,{
    method:"POST",
    headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({query:"query TajerGrowLightfunnelsStores { account { stores { id name defaultDomain } } }"}),
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok) throw new Error("Lightfunnels stores HTTP "+response.status);
  const data:any=await response.json();
  if(data.errors?.length) throw new Error("Lightfunnels stores: "+String(data.errors[0]?.message||"Query failed"));
  if(!Array.isArray(data.data?.account?.stores)) throw new Error("Lightfunnels returned no stores list");
  return data.data.account.stores
    .filter((row:any)=>typeof row?.id==="string"&&row.id)
    .map((row:any)=>({id:String(row.id),name:String(row.name||row.id),domain:String(row.defaultDomain||"")}));
}
async function currentAccessToken(entry:typeof storeIntegrations.$inferSelect):Promise<string> {
  const {decrypt}=await import("./crypto");
  if(entry.oauthAccessToken&&entry.oauthExpiresAt&&new Date(entry.oauthExpiresAt).getTime()>Date.now()+120000) return decrypt(entry.oauthAccessToken);
  if(!entry.oauthRefreshToken) throw new Error("Reconnectez Lightfunnels : session expirée");
  const tokens=await tokenGrant({grant_type:"refresh_token",refresh_token:decrypt(entry.oauthRefreshToken)});
  await db.update(storeIntegrations).set({
    oauthAccessToken:encrypt(tokens.access_token),oauthRefreshToken:encrypt(tokens.refresh_token),
    oauthExpiresAt:new Date(Date.now()+(Number(tokens.expires_in)||7200)*1000),
  }).where(eq(storeIntegrations.id,entry.id));
  return tokens.access_token;
}
function selectedRemoteStore(entry:typeof storeIntegrations.$inferSelect):string {
  try { const data=JSON.parse(entry.credentials||"{}");return typeof data.lightfunnelsStoreId==="string"?data.lightfunnelsStoreId:""; }
  catch {return "";}
}
export function registerLightfunnelsRoutes(app:Express) {
  app.get("/api/lightfunnels/status",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    const rows=await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId,req.user.storeId),eq(storeIntegrations.provider,"lightfunnels")));
    // Show all live boutiques, but only the newest unfinished OAuth attempt
    // per destination magasin. Old drafts remain in DB for audit and never
    // affect an active integration or existing orders.
    const visible=rows.filter(r=>r.isActive===1);
    const pending=rows.filter(r=>r.isActive!==1).sort((a,b)=>Number(b.id)-Number(a.id));
    const seenMagasins=new Set<string>();
    for(const row of pending) {
      const key=String(row.magasinId??"main");
      if(seenMagasins.has(key)) continue;
      seenMagasins.add(key);
      visible.push(row);
    }
    return res.json({configured:!!(CLIENT_ID()&&CLIENT_SECRET()&&process.env.SESSION_SECRET),connections:visible.map(r=>({
      id:r.id,magasinId:r.magasinId,
      state:r.isActive===1&&!!selectedRemoteStore(r)?"connected":r.oauthRefreshToken?"select_store":"reauthorize",
      connected:r.isActive===1&&!!r.oauthRefreshToken&&!!selectedRemoteStore(r),
      canSelectStore:!!r.oauthRefreshToken,
      remoteStoreId:selectedRemoteStore(r)||null,name:r.connectionName,
    }))});
  });
  app.post("/api/lightfunnels/connect",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    if(!CLIENT_ID()||!CLIENT_SECRET()||!process.env.SESSION_SECRET) return res.status(503).json({message:"Configurez LIGHTFUNNELS_CLIENT_ID et LIGHTFUNNELS_CLIENT_SECRET dans Railway."});
    const magasinId=req.body?.magasinId==null?null:Number(req.body.magasinId);
    if(magasinId!==null) {
      if(!Number.isInteger(magasinId)||magasinId<=0) return res.sendStatus(400);
      const magasin=await storage.getStore(magasinId);
      if(!magasin||magasin.ownerId!==req.user.id) return res.sendStatus(403);
    }
    const payload=Buffer.from(JSON.stringify({storeId:req.user.storeId,magasinId,ts:Date.now(),nonce:randomBytes(16).toString("hex")})).toString("base64url");
    const url=new URL("https://app.lightfunnels.com/admin/oauth");
    url.searchParams.set("client_id",CLIENT_ID());
    url.searchParams.set("redirect_uri",CALLBACK());
    url.searchParams.set("scope","orders,products,customers");
    url.searchParams.set("state",payload+"."+sign(payload));
    return res.json({url:url.toString()});
  });
  app.post("/api/lightfunnels/disconnect",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    const id=Number(req.body?.integrationId);
    if(!Number.isInteger(id)||id<=0) return res.sendStatus(400);
    const row=(await db.select().from(storeIntegrations).where(eq(storeIntegrations.id,id)))[0];
    if(!row||row.provider!=="lightfunnels"||row.storeId!==req.user.storeId) return res.sendStatus(404);
    await db.update(storeIntegrations).set({isActive:0,oauthAccessToken:null,oauthRefreshToken:null,oauthExpiresAt:null}).where(eq(storeIntegrations.id,id));
    return res.json({ok:true,message:"Lightfunnels déconnectée. Les commandes existantes sont conservées."});
  });
  app.get("/api/lightfunnels/callback",async(req:any,res)=>{
    const [payload,signature]=String(req.query.state||"").split(".");
    const code=typeof req.query.code==="string"?req.query.code:"";
    if(!process.env.SESSION_SECRET||!payload||!signature||!equal(sign(payload),signature)||!code) return res.status(400).send("OAuth state invalid");
    let state:any;
    try {state=JSON.parse(Buffer.from(payload,"base64url").toString());}catch{return res.sendStatus(400);}
    if(!Number.isInteger(state.storeId)||state.storeId<=0||!Number.isFinite(state.ts)||Date.now()-state.ts>600000||state.ts>Date.now()+30000) return res.sendStatus(400);
    try {
      const auth=await tokenGrant({grant_type:"authorization_code",code,redirect_uri:CALLBACK()});
      // Never overwrite an active boutique when a user starts another OAuth
      // connection. One Lightfunnels account can host many boutiques, and the
      // previous mapping must remain active until the new selection is complete.
      const values={oauthAccessToken:encrypt(auth.access_token),oauthRefreshToken:encrypt(auth.refresh_token),oauthExpiresAt:new Date(Date.now()+(Number(auth.expires_in)||7200)*1000),isActive:0,connectionName:"Lightfunnels — boutique à sélectionner"};
      const pendingRows=await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId,state.storeId),eq(storeIntegrations.provider,"lightfunnels")));
      // Reuse a prior unfinished attempt for the same destination instead
      // of adding a new "À reconnecter" row for every OAuth retry.
      // Never overwrite a connected boutique.
      const oldPending=pendingRows.filter(r=>r.isActive!==1&&(r.magasinId??null)===(state.magasinId??null)).sort((a,b)=>b.id-a.id)[0];
      if(oldPending) {
        await db.update(storeIntegrations).set({...values,credentials:"{}"}).where(eq(storeIntegrations.id,oldPending.id));
      } else {
        await db.insert(storeIntegrations).values({storeId:state.storeId,magasinId:state.magasinId??null,type:"store",provider:"lightfunnels",credentials:"{}",...values});
      }
      // OAuth authorizes an account, NOT a specific boutique. Keep the
      // integration inactive until the user explicitly selects a Lightfunnels
      // Store ID and we verify that the authorized account owns that store.
      // Do not register the account-wide webhook yet.
      return res.redirect("/integrations?lightfunnels=select_store");
    }catch(err:any){console.error("[LIGHTFUNNELS] OAuth/setup:",err?.message);return res.redirect("/integrations?lightfunnels=error");}
  });
  app.get("/api/lightfunnels/stores/:id",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0) return res.sendStatus(400);
    const entry=(await db.select().from(storeIntegrations).where(eq(storeIntegrations.id,id)))[0];
    if(!entry||entry.provider!=="lightfunnels"||entry.storeId!==req.user.storeId||!entry.oauthRefreshToken) return res.sendStatus(404);
    try {
      const stores=await listRemoteStores(await currentAccessToken(entry));
      return res.json({stores});
    } catch(err:any) { console.error("[LIGHTFUNNELS] list stores",err.message);return res.status(502).json({message:"Impossible de charger les boutiques Lightfunnels : "+err.message}); }
  });
  app.post("/api/lightfunnels/select-store",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    const id=Number(req.body?.integrationId);
    const remoteStoreId=typeof req.body?.remoteStoreId==="string"?req.body.remoteStoreId.trim():"";
    if(!Number.isInteger(id)||id<=0||!remoteStoreId||remoteStoreId.length>150) return res.sendStatus(400);
    const entry=(await db.select().from(storeIntegrations).where(eq(storeIntegrations.id,id)))[0];
    if(!entry||entry.provider!=="lightfunnels"||entry.storeId!==req.user.storeId||!entry.oauthRefreshToken) return res.sendStatus(404);
    // Do not silently change an already live mapping; reconnecting requires
    // deactivation and explicit confirmation.
    if(entry.isActive===1&&selectedRemoteStore(entry)&&selectedRemoteStore(entry)!==remoteStoreId)
      return res.status(409).json({message:"Déconnectez cette boutique avant de changer de store Lightfunnels."});
    try {
      const access=await currentAccessToken(entry);
      const remoteStores=await listRemoteStores(access);
      const remote=remoteStores.find(v=>v.id===remoteStoreId);
      if(!remote) return res.status(403).json({message:"Cette boutique n'appartient pas au compte Lightfunnels autorisé."});
      const others=await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId,entry.storeId),eq(storeIntegrations.provider,"lightfunnels")));
      if(others.some(o=>o.id!==entry.id&&o.isActive===1&&selectedRemoteStore(o)===remoteStoreId))
        return res.status(409).json({message:"Cette boutique Lightfunnels est déjà connectée à un autre magasin TajerGrow."});
      // Register the account-wide webhook only after remote-store validation.
      // The handler rejects all other store_id values before saving an order.
      if(entry.isActive!==1) await registerWebhook(access,"https://www.tajergrow.com/api/lightfunnels/webhook/"+entry.id);
      await db.update(storeIntegrations).set({
        credentials:JSON.stringify({lightfunnelsStoreId:remote.id,lightfunnelsStoreName:remote.name}),
        connectionName:"Lightfunnels — "+remote.name,
        isActive:1,
      }).where(eq(storeIntegrations.id,entry.id));
      return res.json({ok:true,storeName:remote.name});
    } catch(err:any) { console.error("[LIGHTFUNNELS] select store",err.message);return res.status(502).json({message:"Échec de connexion Lightfunnels : "+err.message}); }
  });
  app.post("/api/lightfunnels/webhook/:id",async(req:any,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0||!CLIENT_SECRET()) return res.sendStatus(404);
    const signature=String(req.headers["lightfunnels-hmac"]||"");
    const original=req.rawBody instanceof Buffer?req.rawBody:Buffer.from(JSON.stringify(req.body));
    const computed=createHmac("sha256",CLIENT_SECRET()).update(original).digest("base64");
    if(!equal(signature,computed)) return res.sendStatus(403);
    const entry=(await db.select().from(storeIntegrations).where(eq(storeIntegrations.id,id)))[0];
    if(!entry||entry.provider!=="lightfunnels"||entry.isActive!==1) return res.sendStatus(404);
    const o=req.body?.node;
    if(!o?.id||!o?.name) return res.sendStatus(400);
    // IMPORTANT: createWebhook is account-wide. An authenticated account may
    // contain multiple Lightfunnels boutiques. Refuse all events not belonging
    // to the explicitly selected remote store before any order/agent writes.
    const allowedStoreId=selectedRemoteStore(entry);
    const incomingStoreId=typeof o.store_id==="string"?o.store_id:"";
    if(!allowedStoreId||!incomingStoreId) {
      console.warn("[LIGHTFUNNELS] Webhook ignored: connection not scoped or missing store_id", {integrationId:id});
      return res.status(200).json({received:true,ignored:true,reason:"store_not_identified"});
    }
    if(incomingStoreId!==allowedStoreId) return res.status(200).json({received:true,ignored:true,reason:"other_lightfunnels_store"});
    const orderNumber="LF-"+String(o.id).slice(0,80);
    try {
      if(await storage.getOrderByNumber(entry.storeId,orderNumber)) return res.json({received:true,duplicate:true});
      if((await storage.checkPaywall(entry.storeId)).isBlocked) return res.sendStatus(429);
      const address=o.shipping_address||o.billing_address||{};
      const phone=String(o.phone||address.phone||o.billing_address?.phone||"");
      const city=String(address.city||"");
      const items=(Array.isArray(o.items)?o.items:[]).map((it:any)=>({
        productId:null,quantity:Math.max(1,Number(it.quantity)||1),price:Math.round((Number(it.price)||0)*100),
        rawProductName:String(it.title||"Produit"),sku:String(it.sku||""),
      }));
      const order=await storage.createOrder({
        storeId:entry.storeId,magasinId:entry.magasinId,orderNumber,
        customerName:String(o.customer?.full_name||[address.first_name,address.last_name].filter(Boolean).join(" ")||"Client"),
        customerPhone:phone,customerCity:city,customerAddress:[address.line1,address.line2].filter(Boolean).join(" "),
        totalPrice:Math.round((Number(o.total)||0)*100),productCost:0,shippingCost:0,adSpend:0,
        source:"lightfunnels",status:"nouveau",comment:String(o.notes||""),
        rawProductName:items.map((it:any)=>it.rawProductName).join(" + "),
        rawQuantity:items.reduce((n:number,it:any)=>n+it.quantity,0),
      } as any,items.map((it:any)=>({...it,orderId:0})));
      const nextAgent=await storage.getNextAgent(entry.storeId,entry.magasinId,undefined,city);
      if(nextAgent) await storage.assignOrder(order.id,nextAgent);
      await storage.incrementMonthlyOrders(entry.storeId);
      await storage.incrementIntegrationOrdersCount(entry.id);
      const {broadcastToStore}=await import("./sse");
      broadcastToStore(entry.storeId,"new_order",{id:order.id,orderNumber,source:"lightfunnels"});
      return res.json({received:true,orderId:order.id});
    }catch(err:any){
      if(err?.code==="23505")return res.json({received:true,duplicate:true});
      console.error("[LIGHTFUNNELS] webhook error:",err?.message);
      return res.status(500).json({message:"Import failed"});
    }
  });
}

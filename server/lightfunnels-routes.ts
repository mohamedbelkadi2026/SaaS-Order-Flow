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
export function registerLightfunnelsRoutes(app:Express) {
  app.get("/api/lightfunnels/status",async(req:any,res)=>{
    if(!req.isAuthenticated?.()) return res.sendStatus(401);
    const rows=await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId,req.user.storeId),eq(storeIntegrations.provider,"lightfunnels")));
    return res.json({configured:!!(CLIENT_ID()&&CLIENT_SECRET()&&process.env.SESSION_SECRET),connections:rows.map(r=>({id:r.id,magasinId:r.magasinId,connected:r.isActive===1&&!!r.oauthRefreshToken,name:r.connectionName}))});
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
      const entries=await db.select().from(storeIntegrations).where(and(eq(storeIntegrations.storeId,state.storeId),eq(storeIntegrations.provider,"lightfunnels")));
      const prev=entries.find(r=>(r.magasinId??null)===(state.magasinId??null));
      const values={oauthAccessToken:encrypt(auth.access_token),oauthRefreshToken:encrypt(auth.refresh_token),oauthExpiresAt:new Date(Date.now()+(Number(auth.expires_in)||7200)*1000),isActive:0,connectionName:"Lightfunnels"};
      const linked=prev
        ? (await db.update(storeIntegrations).set(values).where(eq(storeIntegrations.id,prev.id)).returning())[0]
        : (await db.insert(storeIntegrations).values({storeId:state.storeId,magasinId:state.magasinId??null,type:"store",provider:"lightfunnels",credentials:"{}",...values}).returning())[0];
      // Activate only after the hook is successfully registered.
      await registerWebhook(auth.access_token,"https://www.tajergrow.com/api/lightfunnels/webhook/"+linked.id);
      await db.update(storeIntegrations).set({isActive:1}).where(eq(storeIntegrations.id,linked.id));
      return res.redirect("/integrations?lightfunnels=connected");
    }catch(err:any){console.error("[LIGHTFUNNELS] OAuth/setup:",err?.message);return res.redirect("/integrations?lightfunnels=error");}
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

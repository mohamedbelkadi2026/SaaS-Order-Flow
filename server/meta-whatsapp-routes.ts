import type { Express } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requireAdmin } from './auth';
import { pool } from './db';
import { decrypt } from './crypto';
import { broadcastToStore } from './sse';
import { getMetaConnection, saveMetaConnection, sendMetaMessage, sendMetaFile, sendMetaOrderTemplate, flushMetaContent } from './meta-whatsapp-service';
import { validMetaSignature, metaGraph, metaPhone, metaIncomingText, nextMetaDeliveryStatus,
 metaInteractive, META_ORDER_TEMPLATE, META_ORDER_TEMPLATE_BODY, META_ORDER_BUTTONS, metaGraphVersion, MetaApiError } from './meta-whatsapp-core';

const id=z.string().regex(/^\d{5,25}$/);
const pilotAllowed=(store:number)=>String(process.env.META_WHATSAPP_PILOT_STORE_IDS || '').split(',').map(s=>Number(s.trim())).includes(store);
const ready=()=>!!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && (process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET));
function sameOrigin(req:any,res:any,next:any){
 const origin=req.headers.origin;
 const expected=new URL(process.env.PUBLIC_APP_URL || 'https://www.tajergrow.com').origin;
 const allowed=new Set([expected]);
 if(['tajergrow.com','www.tajergrow.com'].includes(new URL(expected).hostname)){allowed.add('https://tajergrow.com');allowed.add('https://www.tajergrow.com');}
 if(!allowed.has(origin) && !(process.env.NODE_ENV!=='production' && /^http:\/\/localhost(?::\d+)?$/.test(origin || '')))return res.status(403).json({message:'Origine non autorisée.'});
 next();
}
const safe=(fn:(req:any,res:any)=>Promise<any>)=>async(req:any,res:any)=>{
 try{await fn(req,res);}catch(error){
  const message=error instanceof z.ZodError?'Paramètres invalides.':error instanceof MetaApiError?error.message:
    error instanceof Error && /^(Ce numéro|Configurez|Identifiants|Connexion|Le modèle|La fenêtre|Ce compte|Autorisation|Configuration)/.test(error.message)?error.message:'Opération Meta impossible. Vérifiez la configuration et réessayez.';
  res.status(400).json({message});
 }
};
let workerStarted=false,workerBusy=false;
export function registerMetaWhatsappRoutes(app:Express){
 app.get('/api/automation/meta/status',requireAuth,requireAdmin,safe(async(req,res)=>{
  const store=req.user.storeId,c=await getMetaConnection(store);
  const messages=(await pool.query(`SELECT id,phone,kind,status,error_code,created_at,updated_at FROM meta_whatsapp_messages
    WHERE store_id=$1 ORDER BY id DESC LIMIT 30`,[store])).rows;
  const queue=(await pool.query(`SELECT state,count(*)::int AS count FROM meta_whatsapp_content_queue WHERE store_id=$1 GROUP BY state`,[store])).rows;
  res.json({configured:!!c,active:!!c?.active,displayPhone:c?.display_phone || '',wabaId:c?.waba_id || '',phoneNumberId:c?.phone_number_id || '',
   appReady:ready(),pilotAllowed:pilotAllowed(store),embeddedReady:ready() && process.env.META_EMBEDDED_SIGNUP_ENABLED==='true' && !!process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
   appId:process.env.META_APP_ID || '',graphVersion:metaGraphVersion(),
   webhookUrl:`${new URL(process.env.PUBLIC_APP_URL || 'https://www.tajergrow.com').origin}/api/meta/whatsapp/webhook`,messages,queue});
 }));
 app.post('/api/automation/meta/pilot-connect',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  if(!ready() || !pilotAllowed(req.user.storeId))return res.status(403).json({message:'Le pilote Meta doit être activé pour ce compte par TajerGrow.'});
  const input=z.object({wabaId:id,phoneNumberId:id,accessToken:z.string().trim().min(10).max(4096)}).parse(req.body);
  const result=await saveMetaConnection(req.user.storeId,input.wabaId,input.phoneNumberId,input.accessToken);
  res.json({connected:true,...result});
 }));
 app.post('/api/automation/meta/disconnect',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  // Retain the selected channel; disconnecting must never fall back to another number.
  await pool.query("UPDATE meta_whatsapp_connections SET active=false,token_cipher='',updated_at=now() WHERE store_id=$1",[req.user.storeId]);
  res.json({disconnected:true});
 }));
 app.post('/api/automation/meta/use-green',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  await pool.query("UPDATE meta_whatsapp_content_queue SET state='cancelled' WHERE store_id=$1 AND state='pending'",[req.user.storeId]);
  await pool.query('DELETE FROM meta_whatsapp_windows WHERE store_id=$1',[req.user.storeId]);
  await pool.query('DELETE FROM meta_whatsapp_connections WHERE store_id=$1',[req.user.storeId]);
  res.json({provider:'green'});
 }));
 app.post('/api/automation/meta/test',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  const input=z.object({phone:z.string().min(8).max(30),type:z.enum(['text','buttons','image','audio','video','template']),url:z.string().max(2048).optional(),consent:z.literal(true)}).parse(req.body);
  const phone=metaPhone(input.phone),store=req.user.storeId,outcome:{error?:string;uncertain?:boolean;messageId?:string}={};
  await pool.query(`INSERT INTO meta_whatsapp_consents(store_id,phone,source) VALUES($1,$2,'owner_test_consent') ON CONFLICT(store_id,phone) DO NOTHING`,[store,phone]);
  let accepted=false;
  if(input.type==='template')accepted=await sendMetaOrderTemplate(store,phone,['TajerGrow','اختبار',phone,'مدينة الاختبار','عنوان الاختبار','منتج تجريبي','1','199'],outcome);
  else if(input.type==='text')accepted=await sendMetaMessage(store,phone,{type:'text',text:{body:'السلام عليكم، هادي رسالة اختبار الربط الرسمي ديال TajerGrow.'}},outcome);
  else if(input.type==='buttons')accepted=await sendMetaMessage(store,phone,metaInteractive('هاد الأزرار للتجربة: تأكيد الطلب، تعديل المعلومات أو إلغاء الطلب.'),outcome);
  else if(input.url){
   const patterns={image:/\.(jpe?g|png)$/i,audio:/\.(mp3|m4a|aac|ogg|opus|amr)$/i,video:/\.mp4$/i};
   if(!patterns[input.type].test(new URL(input.url,process.env.PUBLIC_APP_URL || 'https://www.tajergrow.com').pathname))return res.status(400).json({message:'Le fichier ne correspond pas au type de test choisi.'});
   accepted=await sendMetaFile(store,phone,input.url,input.type==='audio'?'audio.mp3':input.type==='video'?'video.mp4':'image.jpg','اختبار TajerGrow');
  }
  if(!accepted)return res.status(400).json({message:outcome.error || 'لم يتم الإرسال. تحقق من نافذة 24 ساعة ومن صيغة الملف وحجمه.',uncertain:outcome.uncertain || false});
  res.json({accepted:true,messageId:outcome.messageId || null});
 }));
 app.post('/api/automation/meta/template',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  const c=await getMetaConnection(req.user.storeId);if(!c?.active)throw new Error('Connexion Meta absente.');
  const token=decrypt(c.token_cipher);
  const templates=await metaGraph(token,`${c.waba_id}/message_templates?name=${META_ORDER_TEMPLATE}&limit=100`);
  const existing=templates.data?.find((t:any)=>t.name===META_ORDER_TEMPLATE && t.language==='ar');
  if(existing)return res.json({status:existing.status,name:existing.name});
  const result=await metaGraph(token,`${c.waba_id}/message_templates`,{method:'POST',body:{name:META_ORDER_TEMPLATE,language:'ar',category:'UTILITY',
   components:[{type:'BODY',text:META_ORDER_TEMPLATE_BODY,example:{body_text:[['TajerGrow','محمد','0612345678','الدار البيضاء','شارع المثال','شاحن السيارة','1','199']]}},
    {type:'BUTTONS',buttons:META_ORDER_BUTTONS.map(b=>({type:'QUICK_REPLY',text:b.text}))}],
  }});
  res.json({status:result.status || 'PENDING',name:META_ORDER_TEMPLATE});
 }));
 app.post('/api/automation/meta/signup/start',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  if(!ready() || process.env.META_EMBEDDED_SIGNUP_ENABLED!=='true' || !process.env.META_EMBEDDED_SIGNUP_CONFIG_ID)return res.status(409).json({message:'Le raccordement public sera disponible après validation Meta et configuration de TajerGrow.'});
  const nonce=randomBytes(32).toString('hex');
  await pool.query('DELETE FROM meta_whatsapp_signup_states WHERE expires_at<now()');
  await pool.query(`INSERT INTO meta_whatsapp_signup_states VALUES($1,$2,$3,now()+interval '10 minutes')`,[nonce,req.user.storeId,req.user.id]);
  res.json({nonce,appId:process.env.META_APP_ID,configId:process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,graphVersion:metaGraphVersion()});
 }));
 app.post('/api/automation/meta/signup/complete',requireAuth,requireAdmin,sameOrigin,safe(async(req,res)=>{
  if(!ready() || process.env.META_EMBEDDED_SIGNUP_ENABLED!=='true')return res.sendStatus(409);
  const input=z.object({nonce:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(10).max(4096),wabaId:id,phoneNumberId:id,pin:z.string().regex(/^\d{6}$/)}).parse(req.body);
  const nonce=await pool.query(`DELETE FROM meta_whatsapp_signup_states WHERE nonce=$1 AND store_id=$2 AND user_id=$3 AND expires_at>now() RETURNING nonce`,[input.nonce,req.user.storeId,req.user.id]);
  if(nonce.rowCount!==1)throw new Error('Autorisation expirée. Recommencez le raccordement.');
  const exchanged=await metaGraph('',`oauth/access_token`,{method:'POST',encoded:new URLSearchParams({client_id:process.env.META_APP_ID!,client_secret:process.env.META_APP_SECRET!,code:input.code})});
  const token=exchanged.access_token;if(typeof token!=='string')throw new Error('Autorisation Meta invalide.');
  // Validate the code was issued to THIS app and the selected WABA was granted.
  const debug=await metaGraph(`${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,`debug_token?input_token=${encodeURIComponent(token)}`);
  const scopes=debug.data?.granular_scopes || [];
  if(!debug.data?.is_valid || String(debug.data.app_id)!==process.env.META_APP_ID ||
   !['whatsapp_business_management','whatsapp_business_messaging'].every(scope=>scopes.some((s:any)=>s.scope===scope && s.target_ids?.includes(input.wabaId))))throw new Error('Autorisation WhatsApp incomplète pour ce compte.');
  const phones=await metaGraph(token,`${input.wabaId}/phone_numbers?fields=id&limit=100`);
  if(!phones.data?.some((p:any)=>p.id===input.phoneNumberId))throw new Error('Ce numéro n’appartient pas au compte autorisé.');
  const registered=await metaGraph(token,`${input.phoneNumberId}/register`,{method:'POST',body:{messaging_product:'whatsapp',pin:input.pin}});
  if(registered?.success!==true)throw new Error('Configuration du numéro Meta non confirmée.');
  res.json({connected:true,...await saveMetaConnection(req.user.storeId,input.wabaId,input.phoneNumberId,token)});
 }));
 app.get('/api/meta/whatsapp/webhook',(req,res)=>{
  if(req.query['hub.mode']==='subscribe' && typeof req.query['hub.verify_token']==='string' &&
    !!process.env.META_WEBHOOK_VERIFY_TOKEN && req.query['hub.verify_token']===process.env.META_WEBHOOK_VERIFY_TOKEN && typeof req.query['hub.challenge']==='string')return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
 });
 app.post('/api/meta/whatsapp/webhook',async(req:any,res)=>{
  const raw=req.rawBody;
  if(!Buffer.isBuffer(raw) || !validMetaSignature(raw,req.headers['x-hub-signature-256'],process.env.META_APP_SECRET || ''))return res.sendStatus(403);
  if(req.body?.object!=='whatsapp_business_account')return res.sendStatus(400);
  try{
   for(const entry of req.body.entry || [])for(const change of entry.changes || []){
    const value=change.value,phoneId=String(value?.metadata?.phone_number_id || '');
    const c=(await pool.query(`SELECT * FROM meta_whatsapp_connections WHERE phone_number_id=$1 AND waba_id=$2 AND active=true`,[phoneId,String(entry.id)])).rows[0];
    if(!c)continue;
    for(const message of value.messages || []){
     if(typeof message.id!=='string' || !message.from)continue;
     const phone=metaPhone(message.from),body=metaIncomingText(message);
     const timestamp=Number(message.timestamp)*1000;
     if(!Number.isFinite(timestamp) || timestamp>Date.now()+60000 || timestamp< Date.now()-30*24*3600000)continue;
     await pool.query(`INSERT INTO meta_whatsapp_windows VALUES($1,$2,$3) ON CONFLICT(store_id,phone)
      DO UPDATE SET last_customer_message_at=greatest(meta_whatsapp_windows.last_customer_message_at,excluded.last_customer_message_at)`,[c.store_id,phone,new Date(Math.min(timestamp,Date.now()))]);
     if(body)await pool.query(`INSERT INTO meta_whatsapp_inbox(message_id,store_id,phone,body) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`,[message.id,c.store_id,phone,body.slice(0,10000)]);
    }
    for(const status of value.statuses || []){
     if(typeof status.id!=='string')continue;
     await pool.query(`INSERT INTO meta_whatsapp_status_events(store_id,message_id,status,error_code)
      VALUES($1,$2,$3,$4) ON CONFLICT(store_id,message_id,status) DO NOTHING`,[c.store_id,status.id,String(status.status),Number(status.errors?.[0]?.code)||null]);
    }
   }
   res.sendStatus(200);
   void processMetaJobs();
  }catch{res.sendStatus(500);}
 });
 if(!workerStarted){workerStarted=true;const timer=setInterval(()=>{void processMetaJobs();},5000);timer.unref();}
}
export async function processMetaJobs(){
 if(!ready() || workerBusy)return;workerBusy=true;
 try{
  const events=(await pool.query(`SELECT e.* FROM meta_whatsapp_status_events e JOIN meta_whatsapp_messages m
    ON m.store_id=e.store_id AND m.message_id=e.message_id WHERE e.processed=false ORDER BY e.id LIMIT 100`)).rows;
  for(const e of events){
   const client=await pool.connect();try{
    await client.query('BEGIN');
    const message=(await client.query('SELECT status FROM meta_whatsapp_messages WHERE store_id=$1 AND message_id=$2 FOR UPDATE',[e.store_id,e.message_id])).rows[0];
    const status=nextMetaDeliveryStatus(message.status,e.status);
    await client.query('UPDATE meta_whatsapp_messages SET status=$1,error_code=$2,updated_at=now() WHERE store_id=$3 AND message_id=$4',[status,status==='failed'?e.error_code:null,e.store_id,e.message_id]);
    await client.query('UPDATE meta_whatsapp_status_events SET processed=true WHERE id=$1',[e.id]);await client.query('COMMIT');
    broadcastToStore(e.store_id,'meta_message_status',{messageId:e.message_id,status});
   }catch{await client.query('ROLLBACK');}finally{client.release();}
  }
  const jobs=(await pool.query(`UPDATE meta_whatsapp_inbox SET state='processing',attempts=attempts+1,lease_until=now()+interval '10 minutes'
   WHERE message_id IN (SELECT message_id FROM meta_whatsapp_inbox WHERE state='pending' AND attempts<3 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows;
  for(const job of jobs){
   try{
    const c=await getMetaConnection(job.store_id);if(!c?.active){await pool.query("UPDATE meta_whatsapp_inbox SET state='paused' WHERE message_id=$1",[job.message_id]);continue;}
    if(job.body==='إلغاء الطلب')await pool.query("UPDATE meta_whatsapp_content_queue SET state='cancelled' WHERE store_id=$1 AND phone=$2 AND state='pending'",[job.store_id,job.phone]);
    else await flushMetaContent(job.store_id,job.phone);
    const {handleIncomingMessage}=await import('./ai-agent');
    await handleIncomingMessage(job.store_id,job.phone,job.body);
    await pool.query("UPDATE meta_whatsapp_inbox SET state='done',lease_until=NULL WHERE message_id=$1",[job.message_id]);
   }catch{
    // Unknown send outcomes must be reviewed rather than automatically duplicated.
    await pool.query("UPDATE meta_whatsapp_inbox SET state='failed',lease_until=NULL WHERE message_id=$1",[job.message_id]).catch(()=>{});
   }
  }
  const contentPhones=(await pool.query(`SELECT DISTINCT q.store_id,q.phone FROM meta_whatsapp_content_queue q
   JOIN meta_whatsapp_windows w ON w.store_id=q.store_id AND w.phone=q.phone
   JOIN meta_whatsapp_connections c ON c.store_id=q.store_id AND c.active=true
   WHERE q.state='pending' AND w.last_customer_message_at>now()-interval '24 hours' LIMIT 10`)).rows;
  for(const target of contentPhones)await flushMetaContent(target.store_id,target.phone);
  await pool.query("UPDATE meta_whatsapp_inbox SET state='uncertain' WHERE state='processing' AND lease_until<now()");
 }catch{ /* Optional provider: keep other integrations operational if not configured. */ }
 finally{workerBusy=false;}
}

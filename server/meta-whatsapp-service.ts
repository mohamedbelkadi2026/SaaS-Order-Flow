import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db';
import { encrypt, decrypt } from './crypto';
import { metaGraph, metaPhone, MetaApiError, metaTemplate, usableMetaOrderTemplate } from './meta-whatsapp-core';

export interface MetaConnection {store_id:number;waba_id:string;phone_number_id:string;display_phone:string;token_cipher:string;active:boolean;template_name:string;template_language:string;}
export interface MetaOutcome {error?:string;uncertain?:boolean;messageId?:string;}
export async function getMetaConnection(storeId:number):Promise<MetaConnection|null> {
 if (!Number.isSafeInteger(storeId) || storeId<=0) throw new Error('Magasin invalide.');
 try { return (await pool.query('SELECT * FROM meta_whatsapp_connections WHERE store_id=$1',[storeId])).rows[0] || null; }
 catch(error:any) { if(error?.code==='42P01')return null;throw error; }
}
export async function metaWindowOpen(storeId:number,phone:string) {
 const result=await pool.query(`SELECT 1 FROM meta_whatsapp_windows WHERE store_id=$1 AND phone=$2
 AND last_customer_message_at > now()-interval '24 hours'`,[storeId,metaPhone(phone)]);
 return result.rowCount===1;
}
export async function saveMetaConnection(storeId:number,waba:string,phoneId:string,token:string) {
 if (!process.env.ENCRYPTION_KEY && !process.env.SESSION_SECRET) throw new Error('Configurez ENCRYPTION_KEY avant de connecter Meta.');
 if (!/^\d{5,25}$/.test(waba) || !/^\d{5,25}$/.test(phoneId) || !token || token.length>4096) throw new Error('Identifiants Meta invalides.');
 const occupied=await pool.query('SELECT store_id FROM meta_whatsapp_connections WHERE phone_number_id=$1 AND store_id<>$2',[phoneId,storeId]);
 if(occupied.rowCount)throw new Error('Ce numéro est déjà lié à un autre compte TajerGrow.');
 if(process.env.META_APP_ID && process.env.META_APP_SECRET){
  const debug=await metaGraph(`${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,`debug_token?input_token=${encodeURIComponent(token)}`);
  if(!debug.data?.is_valid || String(debug.data.app_id)!==process.env.META_APP_ID)throw new Error('Autorisation Meta issue d’une autre application. Utilisez TajerGrow.');
 }
 // The token must actually grant access to the selected WABA and its phone.
 const phones=await metaGraph(token,`${waba}/phone_numbers?fields=id,display_phone_number&limit=100`);
 const phone=phones?.data?.find((item:any)=>item.id===phoneId);
 if (!phone) throw new Error('Ce numéro n’appartient pas au compte WhatsApp autorisé.');
 const subscribed=await metaGraph(token,`${waba}/subscribed_apps`,{method:'POST'});
 if(subscribed?.success!==true)throw new Error('Configuration des webhooks Meta non confirmée.');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1,$2)',[72391,storeId]);
  const previous=(await client.query('SELECT phone_number_id FROM meta_whatsapp_connections WHERE store_id=$1 FOR UPDATE',[storeId])).rows[0];
  if(!previous || previous.phone_number_id!==phoneId){
   // A service window belongs to the business number the customer contacted.
   await client.query('DELETE FROM meta_whatsapp_windows WHERE store_id=$1',[storeId]);
   await client.query("UPDATE meta_whatsapp_content_queue SET state='cancelled' WHERE store_id=$1 AND state='pending'",[storeId]);
   await client.query("UPDATE meta_whatsapp_inbox SET state='paused' WHERE store_id=$1 AND state='pending'",[storeId]);
  }
  await client.query(`INSERT INTO meta_whatsapp_connections(store_id,waba_id,phone_number_id,display_phone,token_cipher)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(store_id) DO UPDATE SET waba_id=excluded.waba_id,
   phone_number_id=excluded.phone_number_id,display_phone=excluded.display_phone,token_cipher=excluded.token_cipher,
   active=true,updated_at=now()`,[storeId,waba,phoneId,phone.display_phone_number || '',encrypt(token)]);
  await client.query('COMMIT');
 } catch(error) {await client.query('ROLLBACK');throw error;}
 finally {client.release();}
 return {displayPhone:phone.display_phone_number || ''};
}
export async function sendMetaMessage(storeId:number,phone:string,payload:Record<string,unknown>,outcome:MetaOutcome={}):Promise<boolean> {
 let rowId:number|undefined;
 try {
  const connection=await getMetaConnection(storeId);
  if (!connection?.active) throw new Error('Connexion WhatsApp officielle désactivée. Reconnectez ce magasin.');
  const recipient=metaPhone(phone);
  if (payload.type==='template' && !(await pool.query('SELECT 1 FROM meta_whatsapp_consents WHERE store_id=$1 AND phone=$2',[storeId,recipient])).rowCount) {
   outcome.error='Enregistrez l’accord du destinataire avant le premier message WhatsApp.';return false;
  }
  if (payload.type!=='template' && !await metaWindowOpen(storeId,recipient)) {
   outcome.error='La fenêtre WhatsApp de 24 h est fermée. Envoyez le modèle de confirmation approuvé.';return false;
  }
  rowId=(await pool.query(`INSERT INTO meta_whatsapp_messages(store_id,phone,kind) VALUES($1,$2,$3) RETURNING id`,[storeId,recipient,payload.type])).rows[0].id;
  const result=await metaGraph(decrypt(connection.token_cipher),`${connection.phone_number_id}/messages`,{
   method:'POST',body:{...payload,messaging_product:'whatsapp',recipient_type:'individual',to:recipient},
  });
  const id=result?.messages?.[0]?.id;
  if (typeof id!=='string' || !id) throw new MetaApiError(0,true);
  outcome.messageId=id;
  try { await pool.query(`UPDATE meta_whatsapp_messages SET message_id=$1,status='accepted',updated_at=now() WHERE id=$2 AND store_id=$3`,[id,rowId,storeId]); }
  catch { outcome.error='Meta a accepté le message, mais le journal local doit être vérifié.'; }
  return true;
 } catch(error) {
  outcome.error=error instanceof MetaApiError ? error.message : error instanceof Error && !/database|sql|constraint|column|relation|duplicate/i.test(error.message) ? error.message : 'Connexion Meta indisponible. Vérifiez les paramètres de ce magasin.';
  outcome.uncertain=error instanceof MetaApiError && error.uncertain;
  if(rowId)await pool.query(`UPDATE meta_whatsapp_messages SET status=$1,error_code=$2,updated_at=now() WHERE id=$3 AND store_id=$4`,[outcome.uncertain?'uncertain':'failed',error instanceof MetaApiError?error.code:0,rowId,storeId]).catch(()=>{});
  return false;
 }
}
export async function sendMetaOrderTemplate(storeId:number,phone:string,parameters:string[],outcome:MetaOutcome={}) {
 const c=await getMetaConnection(storeId);
 if(!c?.active){outcome.error='Connexion Meta absente ou désactivée.';return false;}
 // Check approval, language and expected shape before a business-initiated send.
 try {
  const templates=await metaGraph(decrypt(c.token_cipher),`${c.waba_id}/message_templates?name=${encodeURIComponent(c.template_name)}&limit=100`);
  const template=templates.data?.find((t:any)=>t.name===c.template_name && t.language===c.template_language && usableMetaOrderTemplate(t));
  if(!template){outcome.error='Le modèle de confirmation doit être approuvé par Meta avant le premier envoi.';return false;}
  return await sendMetaMessage(storeId,phone,metaTemplate(parameters,c.template_name,c.template_language),outcome);
 }catch(error){outcome.error=error instanceof MetaApiError?error.message:'Impossible de vérifier le modèle Meta.';return false;}
}
const MEDIA_TYPES:Record<string,[string,string]>={jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],png:['image','image/png'],mp3:['audio','audio/mpeg'],m4a:['audio','audio/mp4'],aac:['audio','audio/aac'],ogg:['audio','audio/ogg'],opus:['audio','audio/ogg'],amr:['audio','audio/amr'],mp4:['video','video/mp4'],pdf:['document','application/pdf']};
export async function sendMetaFile(storeId:number,phone:string,url:string,fileName:string,caption:string) {
 try{
  const c=await getMetaConnection(storeId);if(!c?.active || !await metaWindowOpen(storeId,phone))return false;
  const parsed=new URL(url,process.env.PUBLIC_APP_URL || 'https://www.tajergrow.com');
  const ext=parsed.pathname.split('.').pop()?.toLowerCase() || '';
  const media=MEDIA_TYPES[ext];if(!media)return false;
  const [kind,mime]=media;
  const local=parsed.pathname.match(/^\/uploads\/(whatsapp\/(\d+)\/|products\/)([a-zA-Z0-9_.-]+)$/);
  let resource:Record<string,string>;
  if(local){
   if(local[2] && Number(local[2])!==storeId)return false;
   const disk=path.join(process.env.DATA_DIR || process.cwd(),'uploads',local[1],local[3]);
   const size=(await stat(disk)).size;
   const max=kind==='image'?5*1024*1024:kind==='document'?100*1024*1024:16*1024*1024;
   if(size<=0 || size>max)return false;
   const form=new FormData();form.set('messaging_product','whatsapp');form.set('type',mime);
   form.set('file',new Blob([await readFile(disk)],{type:mime}),local[3]);
   const upload=await metaGraph(decrypt(c.token_cipher),`${c.phone_number_id}/media`,{method:'POST',form});
   if(!/^\d+$/.test(String(upload?.id || '')))return false;
   resource={id:String(upload.id)};
  }else{
   if(parsed.protocol!=='https:' || !/^https:\/\//i.test(url))return false;
   // Meta downloads remote HTTPS media; the application never fetches arbitrary URLs.
   resource={link:parsed.href};
  }
  return await sendMetaMessage(storeId,phone,{type:kind,[kind]:{...resource,
   ...(kind!=='audio' && caption?{caption:caption.slice(0,1024)}:{}),
   ...(kind==='document'?{filename:fileName}:{}),
  }});
 }catch{return false;}
}
export async function queueMetaContent(storeId:number,orderId:number,phone:string,kind:string,content:string) {
 const key=createHash('sha256').update(JSON.stringify([storeId,orderId,kind,content])).digest('hex');
 await pool.query(`INSERT INTO meta_whatsapp_content_queue(store_id,order_id,phone,kind,content,dedupe_key)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING`,[storeId,orderId,metaPhone(phone),kind,content,key]);
}
export async function flushMetaContent(storeId:number,phone:string) {
 const recipient=metaPhone(phone);if(!await metaWindowOpen(storeId,recipient))return;
 const jobs=(await pool.query(`UPDATE meta_whatsapp_content_queue SET state='sending' WHERE id IN
 (SELECT id FROM meta_whatsapp_content_queue WHERE store_id=$1 AND phone=$2 AND state='pending' ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *`,[storeId,recipient])).rows;
 for(const job of jobs){
  const ok=job.kind==='text'?await sendMetaMessage(storeId,recipient,{type:'text',text:{body:job.content}}):await sendMetaFile(storeId,recipient,job.content,job.kind==='audio'?'audio.mp3':job.kind==='video'?'video.mp4':'produit.jpg','');
  // Failures/uncertain sends are visible for manual diagnosis, never blindly resent.
  await pool.query('UPDATE meta_whatsapp_content_queue SET state=$1 WHERE id=$2 AND store_id=$3',[ok?'accepted':'failed',job.id,storeId]);
 }
}

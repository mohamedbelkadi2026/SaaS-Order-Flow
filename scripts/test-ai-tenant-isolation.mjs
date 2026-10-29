import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, integer, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>stripTypeScriptTypes(s,{mode:'transform'});
const clean=s=>strip(s.split('\n').filter(l=>!l.startsWith('import ')).join('\n')).replaceAll('export ','');
const aiSettings=pgTable('ai_settings',{storeId:integer('store_id').primaryKey(),enabled:integer('enabled'),enabledProductIds:jsonb('enabled_product_ids'),scopeMode:text('scope_mode'),systemPrompt:text('system_prompt'),aiModel:text('ai_model'),greenApiInstanceId:text('green_api_instance_id'),greenApiApiToken:text('green_api_api_token'),openrouterApiKey:text('openrouter_api_key'),openaiApiKey:text('openai_api_key'),updatedAt:timestamp('updated_at')});
const aiConversations=pgTable('ai_conversations',{id:serial('id').primaryKey(),storeId:integer('store_id'),orderId:integer('order_id'),customerPhone:text('customer_phone'),status:text('status')});
const env={OPENROUTER_API_KEY:'global-ai-secret',OPENAI_API_KEY:'global-openai-secret',GREENAPI_INSTANCE_ID:'71079999999',GREENAPI_API_TOKEN:'global-green-secret'};
const silent={log(){},warn(){},error(){}};
async function setup(){
 const pg=new PGlite();await pg.exec(`CREATE TABLE ai_settings(store_id int PRIMARY KEY,enabled int,enabled_product_ids jsonb,scope_mode text,system_prompt text,ai_model text,green_api_instance_id text,green_api_api_token text,openrouter_api_key text,openai_api_key text,updated_at timestamp);
 CREATE TABLE ai_conversations(id serial PRIMARY KEY,store_id int,order_id int,customer_phone text,status text);`);
 const db=drizzle(pg),sent=[],storage={getAiSettings:async id=>(await db.select().from(aiSettings).where(eq(aiSettings.storeId,id)))[0]};
 const tenant=vm.runInNewContext(clean(await read('server/green-api-tenant.ts'))+'\n({findGreenApiStore,getStoreGreenCredentials})',{db,aiSettings,eq,and,sql});
 const api=await import('data:text/javascript;base64,'+Buffer.from(strip(await read('server/green-api.ts'))).toString('base64'));
 const transport=vm.runInNewContext(clean(await read('server/whatsapp-service.ts'))+'\n({sendWhatsAppMessage,sendWhatsAppImage,sendWhatsAppFile,sendWhatsAppButtons,isGreenApiConfigured})',{
  getMetaConnection:async()=>null, getStoreGreenCredentials:tenant.getStoreGreenCredentials,greenApiUrl:api.greenApiUrl,process:{env},console:silent,setInterval(){},AbortSignal,Date,URL,
  fetch:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return Response.json({idMessage:'ok'});},
 });
 const source=await read('server/ai-agent.ts');
 const resolver=source.slice(source.indexOf('async function resolveAIClient('),source.indexOf('/**',source.indexOf('async function resolveAIClient(')));
 const gates=source.slice(source.indexOf('async function storeHasAIKey('),source.indexOf('/* ── Keyword banks'));
 const ai=vm.runInNewContext(strip(resolver+gates)+'\n({resolveAIClient,storeHasAIKey,storeCanAutoConfirm})',{
  storage,process:{env},isGreenApiConfigured:transport.isGreenApiConfigured,OPENROUTER_BASE:'https://openrouter.ai/api/v1',OPENROUTER_HEADERS:{},DEFAULT_MODEL:'test-model',OpenAI:class{constructor(options){this.options=options}},
 });
 const wrappedDb=new Proxy(db,{get(target,prop){if(prop==='transaction')return fn=>db.transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='execute')return async()=>[];return typeof t[k]==='function'?t[k].bind(t):t[k]}})));return typeof target[prop]==='function'?target[prop].bind(target):target[prop]}});
 const storageSource=await read('server/storage.ts'),a=storageSource.indexOf('  async upsertAiSettings('),b=storageSource.indexOf('  // ── Recovery Settings',a);
 storage.upsertAiSettings=vm.runInNewContext(strip('({'+storageSource.slice(a,b).replace('    const { aiSettings } = await import("@shared/schema");','')+'})'),{db:wrappedDb,aiSettings,eq,sql,Date}).upsertAiSettings;
 const put=async(id,data)=>storage.upsertAiSettings(id,data);
 const seed=async(id,extra={})=>put(id,{enabled:1,greenApiInstanceId:`71070000${id}`,greenApiApiToken:`green-${id}`,openrouterApiKey:`ai-${id}`, ...extra});
 return {pg,db,storage,tenant,transport,ai,sent,put,seed,source};
}

test('global credentials never satisfy a missing or partial store configuration',async()=>{
 const t=await setup();try{
  await t.put(91,{greenApiInstanceId:'71070000091'});
  await t.put(92,{greenApiApiToken:'token-only'});
  for(const id of [91,92,93,undefined,0]){
   assert.equal(await t.transport.isGreenApiConfigured(id),false);
   assert.equal(await t.transport.sendWhatsAppMessage('0661112233','test',id),false);
   assert.equal(await t.transport.sendWhatsAppImage('0661112233','https://example.test/x.png','',id),false);
   assert.equal(await t.transport.sendWhatsAppButtons('0661112233','test',[],id),false);
   assert.equal(await t.ai.storeCanAutoConfirm(id),false);
  }
  await assert.rejects(t.ai.resolveAIClient(93),/configurer/);
  assert.equal(t.sent.length,0);
 }finally{await t.pg.close();}
});

test('two stores use only their own Green API instance and token for text, media and buttons',async()=>{
 const t=await setup();try{
  await t.seed(91);await t.seed(92);
  for(const id of [91,92]){
   assert.equal(await t.transport.sendWhatsAppMessage('0661112233','text',id),true);
   assert.equal(await t.transport.sendWhatsAppFile('0661112233','https://example.test/x.mp4','video.mp4','',id),true);
   assert.equal(await t.transport.sendWhatsAppButtons('0661112233','buttons',[{id:'yes',text:'Oui'}],id),true);
   const own=t.sent.slice(-3);
   for(const request of own){assert.ok(request.url.includes(`waInstance71070000${id}/`));assert.ok(request.url.endsWith(`/green-${id}`));assert.ok(!request.url.includes('global'));}
   const ai=await t.ai.resolveAIClient(id);assert.equal(ai.client.options.apiKey,`ai-${id}`);
   assert.equal(await t.ai.storeCanAutoConfirm(id),true);
  }
 }finally{await t.pg.close();}
});

test('automation requires both store-owned connections; clearing one never borrows another account or server key',async()=>{
 const t=await setup();try{
  await t.seed(91);await t.seed(92);
  await t.put(92,{openrouterApiKey:null});assert.equal(await t.ai.storeCanAutoConfirm(92),false);
  await assert.rejects(t.ai.resolveAIClient(92),/configurer/);
  await t.put(92,{openrouterApiKey:'ai-92',greenApiApiToken:null});assert.equal(await t.ai.storeCanAutoConfirm(92),false);
  assert.equal(await t.transport.sendWhatsAppMessage('0661112233','test',92),false);
  assert.equal(await t.ai.storeCanAutoConfirm(91),true);assert.equal(t.sent.length,0);
 }finally{await t.pg.close();}
});

test('credential lookup failure stops sends without an environment fallback',async()=>{
 const source=clean(await read('server/whatsapp-service.ts'));let requests=0;
 const send=vm.runInNewContext(source+'\nsendWhatsAppMessage',{getMetaConnection:async()=>null, getStoreGreenCredentials:async()=>{throw new Error('database unavailable')},process:{env},console:silent,setInterval(){},fetch(){requests++;}});
 assert.equal(await send('0661112233','test',91),false);assert.equal(requests,0);
});

test('saving an instance already linked to another store is rejected; ambiguous legacy links cannot send',async()=>{
 const t=await setup();try{
  await t.seed(91);
  await assert.rejects(t.put(92,{greenApiInstanceId:'7107000091',greenApiApiToken:'other-token'}),error=>error.statusCode===409);
  assert.equal(await t.storage.getAiSettings(92),undefined);
  await t.db.insert(aiSettings).values({storeId:92,greenApiInstanceId:'7107000091',greenApiApiToken:'legacy-token'});
  assert.equal(await t.tenant.findGreenApiStore('7107000091'),0);
  assert.equal(await t.transport.sendWhatsAppMessage('0661112233','test',91),false);
  assert.equal(await t.transport.sendWhatsAppMessage('0661112233','test',92),false);
  assert.equal(t.sent.length,0);
 }finally{await t.pg.close();}
});

test('incoming same-phone messages route only by the unique linked Green API instance',async()=>{
 const t=await setup();try{
  await t.seed(91);await t.seed(92);
  await t.db.insert(aiConversations).values([{storeId:91,customerPhone:'0661112233',status:'active'},{storeId:92,customerPhone:'+212661112233',status:'active'}]);
  const received=[],routes=new Map(),app={post:(path,h)=>routes.set(path,h)};
  const register=vm.runInNewContext(clean(await read('server/whatsapp-incoming-routes.ts'))+'\nregisterWhatsappIncomingRoutes',{db:t.db,aiConversations,eq,and,sql,...t.tenant,getMetaConnection:async()=>null,handleIncomingMessage:async(...args)=>received.push(args),console:silent});register(app);
  const call=async(instanceId)=>routes.get('/api/webhooks/whatsapp-incoming')({body:{typeWebhook:'incomingMessageReceived',instanceData:instanceId===undefined?{}:{idInstance:instanceId},senderData:{sender:'212661112233@c.us'},messageData:{textMessageData:{textMessage:'واخا'}}}},{status(){return this},json(){return this}});
  await call('7107000091');await call('7107000092');await call(undefined);await call('71079999999');
  assert.deepEqual(JSON.parse(JSON.stringify(received)),[[91,'0661112233','واخا'],[92,'+212661112233','واخا']]);
  for (const [selectedId, expected] of [['confirm','تأكيد الطلب'],['edit','بغيت نعدل معلومات الطلب'],['cancel','إلغاء الطلب']]) {
   await routes.get('/api/webhooks/whatsapp-incoming')({body:{typeWebhook:'incomingMessageReceived',instanceData:{idInstance:'7107000091'},senderData:{sender:'212661112233@c.us'},messageData:{typeMessage:'templateButtonsReplyMessage',templateButtonReplyMessage:{selectedId,selectedDisplayText:'button'}}}},{status(){return this},json(){return this}});
   assert.deepEqual(JSON.parse(JSON.stringify(received.at(-1))),[91,'0661112233',expected]);
  }

 }finally{await t.pg.close();}
});

test('settings activation fails before save until this store supplies both credentials, even with global keys configured',async()=>{
 const t=await setup();try{
  const all=await read('server/routes.ts'),a=all.indexOf('  app.get("/api/automation/ai-settings"'),b=all.indexOf('  /* ── Nouveau orders for AI',a);
  const routes=new Map(),app={get:(p,auth,h)=>routes.set('get '+p,h),put:(p,auth,h)=>routes.set('put '+p,h)};
  vm.runInNewContext(strip(all.slice(a,b)),{app,storage:t.storage,getMetaConnection:async()=>null,requireAuth(){},process:{env}});
  const call=async(body)=>{let status=200,value;await routes.get('put /api/automation/ai-settings')({user:{storeId:91},body},{status(n){status=n;return this},json(v){value=v;return this}});return {status,value}};
  assert.equal((await call({enabled:1})).status,400);
  assert.equal(await t.storage.getAiSettings(91),undefined);
  await t.seed(91);assert.equal((await call({enabled:1})).status,200);
  const disconnected=await call({enabled:1,greenApiApiToken:''});
  assert.equal(disconnected.status,200);assert.equal(disconnected.value.enabled,0);
  assert.equal(disconnected.value.greenApiApiToken,undefined);
  assert.equal((await call({enabled:1})).status,400);
 }finally{await t.pg.close();}
});

test('conversation replies and test sends explicitly pass the authenticated store, and another store cannot send into the conversation',async()=>{
 const source=await read('server/routes.ts'),routes=new Map(),sent=[];
 const a=source.indexOf('  app.post("/api/automation/conversations/:id/send"'),b=source.indexOf('  /* ── WhatsApp incoming webhook',a);
 const c=source.indexOf('  app.post("/api/automation/whatsapp/send-test"'),d=source.indexOf('  /* ── Manually trigger AI',c);
 const code=(source.slice(a,b)+source.slice(c,d)).replaceAll('await import("./whatsapp-service")','({ sendWhatsAppMessage: sendTransport })');
 vm.runInNewContext(strip(code),{app:{post:(p,auth,h)=>routes.set(p,h)},requireAuth(){},storage:{getAiConversation:async()=>({id:1,storeId:92,customerPhone:'0661112233',isManual:1}),createAiLog:async()=>{},updateAiConversationLastMessage:async()=>{}},broadcastToStore(){},sendTransport:async(...args)=>{sent.push(args);return true},Date});
 const call=async(path,storeId,body)=>{let status=200;await routes.get(path)({user:{storeId},params:{id:1},body},{status(n){status=n;return this},json(){return this}});return status};
 assert.equal(await call('/api/automation/conversations/:id/send',91,{message:'test'}),404);
 await call('/api/automation/conversations/:id/send',92,{message:'test'});
 await call('/api/automation/whatsapp/send-test',91,{phone:'0661112233',message:'test'});
 assert.deepEqual(sent.map(args=>args[2]),[92,91]);
});

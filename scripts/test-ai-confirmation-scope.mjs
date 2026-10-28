import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, integer, text, jsonb } from 'drizzle-orm/pg-core';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const strip = s => stripTypeScriptTypes(s, { mode: 'transform' });
const asModule = s => import('data:text/javascript;base64,' + Buffer.from(strip(s)).toString('base64'));
const { aiSourceMatches, aiProductsMatch } = await asModule(await read('shared/ai-order-scope.ts'));
const orders = pgTable('orders', { id: serial('id').primaryKey(), storeId: integer('store_id'), status: text('status'), source: text('source'), customerPhone: text('customer_phone'), customerName: text('customer_name') });
const products = pgTable('products', { id: serial('id').primaryKey(), storeId: integer('store_id') });
const orderItems = pgTable('order_items', { id: serial('id').primaryKey(), orderId: integer('order_id'), productId: integer('product_id') });
const aiSettings = pgTable('ai_settings', { storeId: integer('store_id').primaryKey(), scopeMode: text('scope_mode'), enabled: integer('enabled'), enabledProductIds: jsonb('enabled_product_ids'), systemPrompt: text('system_prompt'), greenApiInstanceId:text('green_api_instance_id'), greenApiApiToken:text('green_api_api_token'), openrouterApiKey:text('openrouter_api_key'), openaiApiKey:text('openai_api_key') });
const aiConversations = pgTable('ai_conversations', { id: serial('id').primaryKey(), storeId: integer('store_id'), orderId: integer('order_id'), customerPhone: text('customer_phone'), customerName: text('customer_name'), status: text('status'), isManual: integer('is_manual'), conversationStep: integer('conversation_step') });
const source = await read('server/ai-agent.ts');
const triggerSource = source.slice(source.indexOf('async function reserveAiOutreach('), source.indexOf('/* ═════════', source.indexOf('export async function triggerAIForNewOrder(')));
const jobSource = (await read('server/ai-confirmation-job.ts')).split('\n').filter(l => !l.startsWith('import ')).join('\n');
async function setup() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id int,status text,source text,customer_phone text,customer_name text);
    CREATE TABLE products(id serial PRIMARY KEY,store_id int);
    CREATE TABLE order_items(id serial PRIMARY KEY,order_id int,product_id int);
    CREATE TABLE ai_settings(store_id int PRIMARY KEY,scope_mode text,enabled int,enabled_product_ids jsonb,system_prompt text,green_api_instance_id text,green_api_api_token text,openrouter_api_key text,openai_api_key text);
    CREATE TABLE ai_conversations(id serial PRIMARY KEY,store_id int,order_id int,customer_phone text,customer_name text,status text,is_manual int,conversation_step int);`);
  await pg.exec(await read('migrations/2026_10_28_ai_confirmation_candidates.sql'));
  const db = drizzle(pg), sent = [], logs = [], lockSql = [];
  const storage = {
    getAiSettings: async storeId => (await db.select().from(aiSettings).where(eq(aiSettings.storeId, storeId)))[0],
    createAiLog: async v => logs.push(v), updateAiConversationLastMessage: async () => {},
    getPhoneOrderCount: async () => 1,
  };
  // PGlite serializes transactions but has no advisory-lock extension. Keep
  // every actual reservation query; intercept only the PostgreSQL lock call.
  const triggerDb = new Proxy(db, { get(target, prop) {
    if (prop === 'transaction') return fn => db.transaction(tx => fn(new Proxy(tx, { get(t, k) {
      if (k === 'execute') return async q => { lockSql.push(q); return []; };
      return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
    } })));
    return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
  } });
  const ctx = { db: triggerDb, storage, orders, orderItems, aiConversations, eq, and, sql,
    aiSourceMatches, aiProductsMatch, console: { log(){}, warn(){}, error(e){ throw new Error(e); } },
    storeCanAutoConfirm: async () => true, getOrderContext: async () => ({ productName:'Test' }),
    getStoreName: async () => 'Test store', broadcastToStore(){}, queueWhatsApp: async (...args) => sent.push(args), Date };
  const trigger = vm.runInNewContext(strip(triggerSource.replace('export ', '') + '\ntriggerAIForNewOrder'), ctx);
  const batch = vm.runInNewContext(strip(jobSource.replaceAll('export ', '') + '\nrunAiConfirmationBatch'), { db, orders, orderItems, aiSettings, aiConversations, eq, and, asc, sql, triggerAIForNewOrder: trigger });
  let next = 0;
  return { pg, db, storage, sent, logs, trigger, batch, ctx, lockSql, triggerDb,
    setting: data => db.insert(aiSettings).values({ storeId:91, enabled:1, scopeMode:'all_sources', enabledProductIds:[], greenApiInstanceId:'71070000001',greenApiApiToken:'test-green',openrouterApiKey:'test-ai', ...data }).onConflictDoUpdate({ target:aiSettings.storeId, set:Object.keys(data).length ? data : {enabled:1} }),
    add: async (data = {}, ids = [10]) => {
      const [row] = await db.insert(orders).values({ storeId:91, status:'nouveau', source:'wordpress', customerPhone:`+21260000${String(++next).padStart(4,'0')}`, customerName:'Client', ...data }).returning();
      for (const id of ids) await db.insert(orderItems).values({ orderId:row.id, productId:id });
      return row;
    },
  };
}

test('source and product policies intersect, including unknown product IDs', () => {
  assert.equal(aiSourceMatches('whatsapp_only',' WhatsApp '), true);
  assert.equal(aiSourceMatches('whatsapp_only','shopify'), false);
  assert.equal(aiSourceMatches('non_whatsapp','whatsapp'), false);
  for (const source of ['wordpress','shopify','gsheets','manual','import']) assert.equal(aiSourceMatches('non_whatsapp',source), true);
  assert.equal(aiSourceMatches('invalid','wordpress'), false);
  assert.equal(aiProductsMatch([10],[null]), false);
  assert.equal(aiProductsMatch([10],[11,10]), true);
  assert.equal(aiProductsMatch([], [null]), true);
});

test('settings PUT and GET persist each source; partial saves retain product selection and reject invalid/foreign IDs', async () => {
  const t = await setup();
  try {
    await t.db.insert(products).values([{id:10,storeId:91},{id:11,storeId:92}]);
    // Use the production storage upsert too, with its dynamic schema import
    // substituted by the same actual table binding used by the test DB.
    const storageSource = await read('server/storage.ts');
    const a = storageSource.indexOf('  async upsertAiSettings('), b = storageSource.indexOf('  // ── Recovery Settings', a);
    const upsert = storageSource.slice(a,b).replace('    const { aiSettings } = await import("@shared/schema");','');
    t.storage.upsertAiSettings = vm.runInNewContext(strip('({' + upsert + '})'), { db:t.triggerDb, aiSettings, eq, sql, Date }).upsertAiSettings;
    const routes = new Map(), app = { get:(p,auth,h)=>routes.set('GET '+p,h), put:(p,auth,h)=>routes.set('PUT '+p,h) };
    const r = await read('server/routes.ts');
    const handlers = r.slice(r.indexOf('  app.get("/api/automation/ai-settings"'),r.indexOf('  /* ── Nouveau orders for AI'));
    vm.runInNewContext(strip(handlers), { app, requireAuth(){}, storage:t.storage, db:t.db, products, and, eq, inArray });
    const call = async (method, body={}) => { let status=200, value; const res={status(n){status=n;return this},json(v){value=JSON.parse(JSON.stringify(v));return this}}; await routes.get(method+' /api/automation/ai-settings')({user:{storeId:91},body},res); return {status,value}; };
    for (const scopeMode of ['whatsapp_only','all_sources','non_whatsapp']) {
      assert.equal((await call('PUT',{scopeMode,enabledProductIds:[10]})).status,200);
      assert.equal((await call('GET')).value.scopeMode,scopeMode);
    }
    await call('PUT',{scopeMode:'all_sources'});
    assert.deepEqual((await call('GET')).value.enabledProductIds,[10]);
    for (const body of [{scopeMode:'invalid'},{enabledProductIds:['10']},{enabledProductIds:[11]},{enabledProductIds:[null]},{enabledProductIds:[-1]}]) assert.equal((await call('PUT',body)).status,400);
    assert.equal((await call('GET')).value.scopeMode,'all_sources');
  } finally { await t.pg.close(); }
});

test('outreach uses persisted source, status and all items; caller product hints cannot bypass selection', async () => {
  const t = await setup(); try {
    await t.setting({scopeMode:'non_whatsapp',enabledProductIds:[10]});
    const allowed = await t.add({},[11,10]);
    const excluded = [await t.add({},[11]),await t.add({},[null]),await t.add({source:'whatsapp'}),await t.add({status:'confirme'}),await t.add({storeId:92})];
    for (const row of excluded) await t.trigger(91,row.id,row.customerPhone,row.customerName,10);
    assert.equal(t.sent.length,0);
    await t.trigger(91,allowed.id,'wrong-phone','Wrong name',11);
    assert.equal(t.sent.length,1);assert.equal(t.sent[0][1],allowed.customerPhone);
  } finally { await t.pg.close(); }
});

test('concurrent triggers reserve one conversation; completed/closed orders are never restarted', async () => {
  const t = await setup(); try {
    await t.setting({});const row = await t.add();
    await Promise.all(Array.from({length:4},()=>t.trigger(91,row.id,row.customerPhone,row.customerName)));
    assert.equal(t.sent.length,1);assert.ok(t.lockSql.length);
    assert.equal((await t.db.select().from(aiConversations)).length,1);
    await t.db.update(aiConversations).set({status:'closed'});
    await t.trigger(91,row.id,row.customerPhone,row.customerName);
    await t.batch();assert.equal(t.sent.length,1);
  } finally { await t.pg.close(); }
});

test('worker starts existing and incoming Nouveaux automatically, bounded to five per store and respecting source/product intersection', async () => {
  const t = await setup(); try {
    await t.setting({scopeMode:'whatsapp_only',enabledProductIds:[10]});
    for(let i=0;i<7;i++) await t.add({source:'whatsapp'});
    await t.add({source:'whatsapp'},[11]);await t.add({source:'whatsapp'},[null]);await t.add({source:'shopify'});
    await t.add({source:'whatsapp',storeId:92});
    await t.batch();assert.equal(t.sent.length,5);
    await t.batch();assert.equal(t.sent.length,7);
    await t.batch();assert.equal(t.sent.length,7);
    await t.add({source:'whatsapp'});await t.batch();assert.equal(t.sent.length,8);
    await t.setting({enabled:0});await t.add({source:'whatsapp'});await t.batch();assert.equal(t.sent.length,8);
  } finally { await t.pg.close(); }
});

test('active conversations are preserved across local/international phone formats; other eligible orders still progress', async () => {
  const t=await setup();try {
    await t.setting({});const first=await t.add({customerPhone:'0661112233'});
    await t.trigger(91,first.id,first.customerPhone,first.customerName);
    const next=await t.add({customerPhone:'+212661112233'});await t.add();
    await t.batch();assert.equal(t.sent.length,2);
    assert.equal((await t.db.select().from(aiConversations).where(eq(aiConversations.orderId,next.id))).length,0);
  }finally{await t.pg.close();}
});

test('excluded incoming replies stay visible in Live Chat and cannot confirm through an old active conversation', async () => {
  const t=await setup();try {
    const start=source.indexOf('export async function handleIncomingMessage(');
    const end=source.indexOf('\nexport ',start+1);
    const incomingSource=source.slice(start,end<0?undefined:end);
    const row=await t.add();const conv={id:50,storeId:91,orderId:row.id,isManual:0};
    t.storage.getActiveAiConversationByPhone=async()=>conv;
    let keyChecks=0;
    const handler=vm.runInNewContext(strip(incomingSource.replace('export ','')+'\nhandleIncomingMessage'), {...t.ctx, storeCanAutoConfirm:async()=>{keyChecks++;return false}});
    for(const setting of [{enabled:0},{enabled:1,scopeMode:'whatsapp_only'},{scopeMode:'all_sources',enabledProductIds:[11]}]) {
      await t.setting(setting);await handler(91,row.customerPhone,'واخا');
    }
    assert.equal(t.logs.filter(v=>v.role==='user').length,3);
    assert.equal(keyChecks,0);assert.equal(t.sent.length,0);
    assert.equal((await t.db.select().from(orders))[0].status,'nouveau');
  }finally{await t.pg.close();}
});

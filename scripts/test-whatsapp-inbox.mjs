// Run with Node 24: node --test scripts/test-whatsapp-inbox.mjs
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const asModule = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const api = asModule(stripTypeScriptTypes(await read('server/green-api.ts'), { mode: 'transform' }));
const { registerGreenApiRoutes } = await import(asModule(stripTypeScriptTypes(await read('server/green-api-routes.ts'), { mode:'transform' }).replace('"./green-api"', JSON.stringify(api))));
const { registerWhatsappContentRoutes } = await import(asModule(stripTypeScriptTypes(await read('server/whatsapp-content-routes.ts'), { mode:'transform' })));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const first = { id:1, storeId:91, name:'Produit A', sku:'SKU-A', sellingPrice:15900, whatsappPrice:null, whatsappImageUrl:'/uploads/legacy.png', archivedAt:null };
function setup() {
  const routes = new Map();
  const products = new Map([[1,{...first}], [2,{...first,id:2,archivedAt:new Date()}], [3,{...first,id:3,storeId:92}]]);
  const settings = new Map([[91,{greenApiInstanceId:'71070000001',greenApiApiToken:'store-a-token'}], [92,{greenApiInstanceId:'71070000002',greenApiApiToken:'store-b-token'}]]);
  const storage = {
    getProductsByStore: async id => [...products.values()].filter(p => p.storeId === id),
    getProduct: async id => products.get(id),
    updateProduct: async (id,data) => { products.set(id,{...products.get(id),...data}); return products.get(id); },
    getAiSettings: async id => settings.get(id),
  };
  const auth = () => {};
  const app = Object.fromEntries(['get','post','patch'].map(method => [method,(path,middleware,handler) => {
    assert.equal(middleware,auth); routes.set(method+' '+path,handler);
  }]));
  registerGreenApiRoutes(app,auth,storage);
  registerWhatsappContentRoutes(app,auth,storage);
  return { routes,products,settings };
}
async function call(ctx,route,{storeId=91,body={},query={},params={}}={}) {
  let code=200,bodyResult;
  const res={ set(){return this;},status(value){code=value;return this;},json(value){bodyResult=JSON.parse(JSON.stringify(value));return this;} };
  await ctx.routes.get(route)({user:{storeId},body,query,params},res);
  return {code,body:bodyResult};
}
test('product picker returns active products of the current store and legacy media', async () => {
  const ctx=setup();
  const response=await call(ctx,'get /api/whatsapp-content/products');
  assert.equal(response.code,200);
  assert.deepEqual(response.body.map(p=>p.id),[1]);
  assert.deepEqual(response.body[0].whatsappImageUrls,['/uploads/legacy.png']);
  assert.deepEqual((await call(ctx,'get /api/whatsapp-content/products',{storeId:92})).body.map(p=>p.id),[3]);
});
test('content save converts DH into cents and does not change stock or inventory price', async () => {
  const ctx=setup();
  const response=await call(ctx,'patch /api/whatsapp-content/products/:id',{params:{id:1},body:{whatsappPriceDh:49.99,whatsappDescription:'Infos WhatsApp',sellingPrice:1,stock:0,whatsappImageUrls:[]}});
  assert.equal(response.code,200);
  assert.equal(ctx.products.get(1).whatsappPrice,4999);
  assert.equal(ctx.products.get(1).sellingPrice,15900);
  assert.equal(ctx.products.get(1).stock,undefined);
  assert.equal(ctx.products.get(1).whatsappImageUrl,null);
});
test('content updates reject another store, archived products, invalid prices and unsafe URLs', async () => {
  const ctx=setup();
  for(const id of [2,3]) assert.equal((await call(ctx,'patch /api/whatsapp-content/products/:id',{params:{id},body:{whatsappDescription:'wrong'}})).code,404);
  for(const body of [{whatsappPriceDh:-1},{whatsappPriceDh:'49'},{whatsappImageUrls:['javascript:alert(1)']},{sellingPrice:0}]) {
    assert.equal((await call(ctx,'patch /api/whatsapp-content/products/:id',{params:{id:1},body})).code,400);
  }
});
test('inbox uses saved credentials only, keeps store caches separate and coalesces polling', async () => {
  const ctx=setup();let requests=0;
  globalThis.fetch=async url=>{ requests++; return Response.json([{id:'212600000001@c.us',name:url.includes('store-a-token')?'Store A':'Store B',unreadCount:2}]); };
  const inputs={body:{instanceId:'71070000002',apiToken:'store-b-token'}};
  const [a,b]=await Promise.all([call(ctx,'get /api/automation/whatsapp/chats',inputs),call(ctx,'get /api/automation/whatsapp/chats',inputs)]);
  assert.equal(requests,1);assert.equal(a.body.chats[0].name,'Store A');assert.deepEqual(a,b);
  assert.equal((await call(ctx,'get /api/automation/whatsapp/chats',{storeId:92})).body.chats[0].name,'Store B');
  assert.equal(requests,2);
});
test('history reads the selected chat, orders messages, and supports text, voice and images', async () => {
  const ctx=setup(),chatId='212600000001@c.us';
  globalThis.fetch=async (url,options)=>{
    assert.match(url,/getChatHistory\/store-a-token$/);assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{chatId,count:100});
    return Response.json([
      {chatId,idMessage:'image',timestamp:3,type:'outgoing',typeMessage:'imageMessage',downloadUrl:'https://media.example/image.png',caption:'Image'},
      {chatId,idMessage:'voice',timestamp:2,type:'incoming',typeMessage:'audioMessage',downloadUrl:'https://media.example/audio.ogg'},
      {chatId,idMessage:'text',timestamp:1,type:'incoming',textMessage:'Bonjour',typeMessage:'textMessage'},
      {chatId:'other@g.us',idMessage:'wrong',timestamp:4,textMessage:'wrong'},
    ]);
  };
  const response=await call(ctx,'get /api/automation/whatsapp/messages',{query:{chatId}});
  assert.deepEqual(response.body.messages.map(m=>m.id),['text','voice','image']);
  assert.equal(response.body.messages[1].type,'audioMessage');assert.equal(response.body.messages[2].outgoing,true);
});
test('deleted messages do not expose original text or media',async()=>{
  const ctx=setup(),chatId='212600000001@c.us';
  globalThis.fetch=async()=>Response.json([{chatId,idMessage:'gone',timestamp:1,isDeleted:true,textMessage:'deleted private text',downloadUrl:'https://media.example/old.png'}]);
  const response=await call(ctx,'get /api/automation/whatsapp/messages',{query:{chatId}});
  assert.equal(response.body.messages[0].text,'Message supprimé');assert.equal(response.body.messages[0].mediaUrl,null);
});
test('invalid chats and missing store credentials cannot fetch history or send messages', async()=>{
  const ctx=setup();let called=false;globalThis.fetch=async()=>{called=true;throw new Error();};
  for(const chatId of ['https://other.host','../store/92','1234@evil']) assert.equal((await call(ctx,'get /api/automation/whatsapp/messages',{query:{chatId}})).code,400);
  assert.equal((await call(ctx,'get /api/automation/whatsapp/chats',{storeId:93})).code,400);
  assert.equal(called,false);
});
test('manual send requires provider acknowledgement and invalidates selected history',async()=>{
  const ctx=setup(),chatId='212600000001@c.us';let historyCalls=0;
  globalThis.fetch=async(url,options)=>{
    if(url.includes('/sendMessage/')) {assert.deepEqual(JSON.parse(options.body),{chatId,message:'Bonjour'});return Response.json({idMessage:'sent-id'});}
    historyCalls++;return Response.json([]);
  };
  await call(ctx,'get /api/automation/whatsapp/messages',{query:{chatId}});
  assert.equal((await call(ctx,'post /api/automation/whatsapp/messages',{body:{chatId,message:' Bonjour '}})).body.ok,true);
  await call(ctx,'get /api/automation/whatsapp/messages',{query:{chatId}});
  assert.equal(historyCalls,2);
  globalThis.fetch=async()=>Response.json({});
  assert.equal((await call(ctx,'post /api/automation/whatsapp/messages',{body:{chatId,message:'Bonjour'}})).code,502);
});
test('synchronization changes only message reception settings and keeps existing webhook configuration',async()=>{
  const ctx=setup();
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/setSettings\/store-a-token$/);
    const body=JSON.parse(options.body);
    assert.deepEqual(body,{incomingWebhook:'yes',outgoingMessageWebhook:'yes',outgoingAPIMessageWebhook:'yes',outgoingWebhook:'yes'});
    assert.equal(body.webhookUrl,undefined);
    return Response.json({saveSettings:true});
  };
  assert.equal((await call(ctx,'post /api/automation/whatsapp/sync')).body.ok,true);
});
test('provider HTML and rate limits are surfaced as actionable errors without leaking tokens',async()=>{
  const ctx=setup();
  for(const fetcher of [async()=>new Response('<html>bad upstream'),async()=>Response.json({}, {status:429})]){
    globalThis.fetch=fetcher;
    const response=await call(ctx,'get /api/automation/whatsapp/chats');
    assert.ok(response.code>=400);assert.doesNotMatch(JSON.stringify(response.body),/store-a-token|<html>|Unexpected token/);
  }
});

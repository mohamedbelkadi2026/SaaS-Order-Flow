import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,integer,text} from 'drizzle-orm/pg-core';
import {and,eq,sql,gt,asc} from 'drizzle-orm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const adapter=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('server/integrations/livcash.ts'),{mode:'transform'})).toString('base64'));
const {LivcashClient,readLivcashTracking,mapLivcashStatus,livcashTrackingCode}=adapter;
const shipSource=await read('server/services/carrier-service.ts');
const start=shipSource.indexOf("  if (provider.toLowerCase().replace(/[\\s_-]+/g, '') === 'livcash')");
const end=shipSource.indexOf('  // ── Express Relais AIO',start);
const ship=vm.runInNewContext(stripTypeScriptTypes('(async function(provider,creds,input){'+shipSource.slice(start,end).replace("const { LivcashClient, livcashTrackingCode } = await import('../integrations/livcash');",'')+'})',{mode:'transform'}),{LivcashClient,livcashTrackingCode,sanitizePhone:p=>p.replace(/^\+212/,'0')});

test('documented multipart add and track use the fixed HTTPS endpoint, token and DH amount',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init,body:Object.fromEntries(init.body)});return Response.json({status:true,sku:'LC-ASSIGNED'});};
 try {
  const result=await ship('livcash',{apiKey:'secret',apiUrl:'https://untrusted.invalid'},{storeId:2,orderId:12,city:'Agadir',phone:'+212620302052',address:'Rue test',quantity:3,productName:'Manteau',totalPrice:29900,customerName:'Test'});
  assert.equal(result.success,true);assert.equal(result.trackingNumber,'LC-ASSIGNED');
  assert.deepEqual(calls[0].body,{token:'secret',action:'add',ville:'Agadir',phone:'0620302052',qty:'1',adresse:'Rue test',note:'Manteau × 3',price:'299.00',name:'Test',tracking:'TG2-12'});
  assert.equal(calls[0].url,adapter.LIVCASH_ENDPOINT);assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.headers['Content-Type'],undefined);
  await new LivcashClient('secret').track('LC-ASSIGNED');
  assert.deepEqual(calls[1].body,{token:'secret',action:'track',tracking:'LC-ASSIGNED'});
  assert.notEqual(livcashTrackingCode(2,12),livcashTrackingCode(3,12));
 }finally{globalThis.fetch=original;}
});
test('ambiguous creation, invalid JSON and documented failures are never retried or marked shipped',async()=>{
 const original=globalThis.fetch;
 try {for(const response of [()=>{throw Error('secret');},()=>new Response('<html>bad gateway</html>'),()=>Response.json({status:false,msg:'code de suivi déjà utilisé'}),()=>Response.json({status:'true',sku:'X'})]) {
  let calls=0;globalThis.fetch=async()=>{calls++;return response();};
  const result=await ship('livcash',{apiKey:'secret'},{storeId:2,orderId:12,city:'Agadir',phone:'0620302052',address:'Rue test',quantity:1,totalPrice:100,customerName:'Test'});
  assert.equal(result.success,false);assert.equal(result.permanent,true);assert.equal(calls,1);assert.ok(!result.error.includes('secret'));
 }
 let calls=0;globalThis.fetch=async()=>{calls++;};
 assert.equal((await ship('livcash',{apiKey:'secret'},{isStock:true})).success,false);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('tracking acknowledgements and unrelated parcels never manufacture a delivery',()=>{
 for(const response of [{status:true,sku:'A'},{status:false,statut:'Livré'},{status:true,data:{status:false,statut:'Livré'}},{status:'success'},{data:{tracking:'B',statut:'Livré'}},{data:[{statut:'Livré'}]},{data:[{tracking:'B',statut:'Livré'}]}])assert.equal(readLivcashTracking(response,'A'),null);
 for(const [raw,status] of Object.entries({'Livré':'delivered','Livrée':'delivered','Refusé':'refused','Retourné':'retourné','En cours de livraison':'transit','Reporté':'in_progress'})) {
  assert.equal(mapLivcashStatus(raw),status);assert.deepEqual(readLivcashTracking({status:true,data:{tracking:'A',statut:raw}},'A'),{raw,status});
 }
 assert.deepEqual(readLivcashTracking({statut:'Nouveau code inconnu'},'A'),{raw:'Nouveau code inconnu',status:null});
});

const orders=pgTable('orders',{id:integer('id'),storeId:integer('store_id'),shippingProvider:text('shipping_provider'),trackNumber:text('track_number'),status:text('status'),carrierId:integer('carrier_id'),commentStatus:text('comment_status')});
const carrierAccounts=pgTable('carrier_accounts',{id:integer('id'),storeId:integer('store_id'),carrierName:text('carrier_name'),isActive:integer('is_active'),apiKey:text('api_key')});
const jobSource=stripTypeScriptTypes(await read('server/jobs/livcash-sync.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replaceAll('export async function','async function').replaceAll('export function','function');
test('real SQL polling isolates stores and accounts, rotates 50-item pages and preserves unknown statuses',async()=>{
 const pg=new PGlite();await pg.exec(`CREATE TABLE carrier_accounts(id int primary key,store_id int,carrier_name text,is_active int,api_key text);CREATE TABLE orders(id int primary key,store_id int,shipping_provider text,track_number text,status text,carrier_id int,comment_status text);`);
 const migration=await read('migrations/2026_11_02_livcash_sync_cursor.sql');await pg.exec(migration);await pg.exec(migration);
 await pg.exec(`INSERT INTO carrier_accounts VALUES(1,1,'livcash',1,'s1'),(2,2,'livcash',1,'s2'),(3,2,'livcash',1,'s3'),(4,1,'sendit',1,'other');INSERT INTO orders SELECT i,1,'livcash','T'||i,'in_progress',NULL,NULL FROM generate_series(1,51) i;INSERT INTO orders VALUES(101,2,'livcash','other-store','in_progress',2,NULL),(102,1,'sendit','other-carrier','in_progress',NULL,NULL),(103,2,'livcash','ambiguous','in_progress',NULL,NULL),(104,2,'livcash','account3','in_progress',3,NULL),(105,1,'livcash','done','delivered',1,NULL);`);
 const db=drizzle(pg),calls=[],events=[];
 class FakeClient {constructor(token){this.token=token;}async track(tracking){calls.push({token:this.token,tracking});return {tracking,statut:tracking==='T1'?'Livré':tracking==='T2'?'Unknown phase':'En transit'};}}
 const storage={updateOrderStatus:async(id,status)=>db.update(orders).set({status}).where(eq(orders.id,id)),updateOrder:async(id,patch)=>db.update(orders).set(patch).where(eq(orders.id,id)),createOrderFollowUpLog:async()=>{}};
 const {syncLivcash}=vm.runInNewContext(jobSource+';({syncLivcash})',{db,orders,carrierAccounts,and,eq,sql,gt,asc,storage,broadcastToStore:(...args)=>events.push(args),LivcashClient:FakeClient,readLivcashTracking,console});
 await syncLivcash(1);assert.equal(calls.length,50);assert.ok(calls.every(c=>c.token==='s1'));
 assert.equal((await pg.query('SELECT status FROM orders WHERE id=1')).rows[0].status,'delivered');
 assert.equal((await pg.query('SELECT status,comment_status FROM orders WHERE id=2')).rows[0].status,'in_progress');
 assert.equal((await pg.query('SELECT comment_status FROM orders WHERE id=2')).rows[0].comment_status,'Unknown phase');
 await syncLivcash(1);assert.equal(calls.at(-1).tracking,'T51');
 calls.length=0;await syncLivcash(2);assert.equal(calls.length,2);assert.ok(!calls.some(c=>c.tracking==='ambiguous'));assert.deepEqual(calls.map(c=>c.token),['s2','s3']);
 calls.length=0;await syncLivcash(1);assert.equal(calls[0].tracking,'T2');assert.ok(!calls.some(c=>c.tracking==='done'));assert.ok(events.every(e=>e[0]===1||e[0]===2));await pg.close();
});

test('city import and manual sync require a session and enforce owning account',async()=>{
 const routes={};let saved;
 const storage={getCarrierAccount:async()=>({id:8,storeId:1,carrierName:'livcash'}),upsertCarrierCities:async(...args)=>{saved=args;}};
 const source=stripTypeScriptTypes(await read('server/livcash-routes.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replace('export function','function');
 vm.runInNewContext(source+';registerLivcashRoutes(app)',{app:{post:(path,handler)=>routes[path]=handler},storage,syncLivcash:async()=>({synced:0})});
 const handler=routes['/api/carriers/livcash/seed-cities/:accountId'];
 const res={code:200,status(n){this.code=n;return this;},sendStatus(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 await handler({isAuthenticated:()=>false},res);assert.equal(res.code,401);
 await handler({isAuthenticated:()=>true,user:{storeId:2},params:{accountId:'8'},body:['Agadir']},res);assert.equal(res.code,404);assert.equal(saved,undefined);
 res.code=200;await handler({isAuthenticated:()=>true,user:{storeId:1},params:{accountId:'8'},body:['Agadir',{name:'Casablanca'},'Agadir']},res);
 assert.equal(res.code,200);assert.equal(res.data.inserted,2);assert.deepEqual(Array.from(saved[3]),['Agadir','Casablanca']);
 await routes['/api/webhooks/carrier/:storeId/livcash']({},res);assert.equal(res.code,405);
});

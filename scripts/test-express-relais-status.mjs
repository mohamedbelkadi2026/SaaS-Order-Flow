// Node 24; install @electric-sql/pglite or set PGLITE_MODULE to its module entry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,serial,integer,text,timestamp} from 'drizzle-orm/pg-core';
import {eq,and,or,sql,asc,gt} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {mapExpressRelaisStatus,expressRelaisOrderStatusText}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('shared/express-relais-status.ts'),{mode:'transform'})).toString('base64'));
const {readExpressRelaisStatus,expressRelaisAccountMatches}=vm.runInNewContext(stripTypeScriptTypes(await read('server/integrations/express-relais-status.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replace(/^export \{.*\};\n/gm,'').replaceAll('export function','function')+';({readExpressRelaisStatus,expressRelaisAccountMatches})',{mapExpressRelaisStatus});

test('scheduled sync and webhooks share complete mappings for transport, agency and distribution',()=>{
  for(const [raw,expected] of Object.entries({PARCEL_IN_TRANSPORT:'En transport',PARCEL_IN_FINAL_AGENCY:'En agence finale',PARCEL_IN_DELIVERY:'Mis en distribution',PARCEL_IN_TRANSIT:'En transit',PARCEL_PICKEDUP:'Ramassé',PARCEL_DELIVERED:'delivered',PARCEL_RETURNED:'retourné',DELIVRED_TO_ADDRESS:'delivered',DELIVERED_TO_ADDRESS:'delivered',PARCEL_REFUSED:'refused',RESCHEDULED_DELIVERY_BY_RECIPIENT:'in_progress',SCHEDULED_DELIVERY:'in_progress',UNREACHABLE_RECIPIENT:'unreachable',PICKUP_ASSIGNED:'Attente De Ramassage',WRONG_ADDRESS:'in_progress',PARCEL_IN_RETURN_AGENCY:'RETOUR READY','Attente de ramassage':'Attente De Ramassage','Livré *':'delivered','Retour prêt':'RETOUR READY'})){
    assert.equal(mapExpressRelaisStatus(raw),expected,raw);
    assert.deepEqual({...readExpressRelaisStatus({data:{idParcelClient:'ORDER-1',statusParcel:raw}},'ORDER-1')},{raw,status:expected});
  }
});
test('negative delivery labels, lockers and unknown states never create a false customer delivery',()=>{
  for(const raw of ['Non livré','UNDELIVERED','Confirmé par livreur','FUTURE_UNKNOWN_STATE'])assert.equal(mapExpressRelaisStatus(raw),null);
  assert.equal(mapExpressRelaisStatus('DELIVERED_TO_LOCKER'),'En consigne');
  assert.equal(mapExpressRelaisStatus('PARCEL_RETRIEVED'),'delivered');
});
test('wrapped arrays and structured statuses are matched to the requested parcel only',()=>{
  assert.equal(readExpressRelaisStatus({data:{parcels:[{idParcelClient:'wrong',status:'delivered'},{idParcelClient:'ORDER-1',status:{code:'PARCEL_IN_TRANSPORT'}}]}},'ORDER-1').status,'En transport');
  assert.equal(readExpressRelaisStatus({data:[{idParcelClient:'wrong',status:'delivered'}],status:'delivered'},'ORDER-1'),null);
  assert.equal(readExpressRelaisStatus({data:[{status:'delivered'}]},'ORDER-1'),null);
  assert.equal(readExpressRelaisStatus({codeApi:999,data:{idParcelClient:'ORDER-1',status:'delivered'}},'ORDER-1'),null);
  assert.equal(readExpressRelaisStatus({data:{parcel:{idParcelClient:'ORDER-1',statusParcel:{label:'Livré'}}}},'ORDER-1').status,'delivered');
});
test('saved account identity takes precedence and legacy warehouse scopes are respected',()=>{
  assert.equal(expressRelaisAccountMatches({carrierId:2},{id:1}),false);
  assert.equal(expressRelaisAccountMatches({carrierId:2,magasinId:8},{id:2,magasinId:9}),true);
  assert.equal(expressRelaisAccountMatches({magasinId:8},{id:2,magasinId:9}),false);
  assert.equal(expressRelaisAccountMatches({magasinId:8},{id:2}),true);
  assert.equal(expressRelaisAccountMatches({carrierId:null,magasinId:null},{id:77,magasinId:119}),false);
  assert.equal(expressRelaisAccountMatches({carrierId:null,magasinId:null},{id:77,magasinId:119},true),true);
  assert.equal(expressRelaisAccountMatches({carrierId:78,magasinId:null},{id:77,magasinId:119},true),false);
  assert.equal(expressRelaisAccountMatches({magasinId:120},{id:77,magasinId:119},true),false);
});

test('actual poll worker visits more than 150 orders, resumes after restart, isolates accounts and accepts missing tracking numbers',async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(`CREATE TABLE carrier_accounts(id serial PRIMARY KEY,store_id integer,carrier_name text,is_active integer,api_key text,api_secret text,magasin_id integer);
      CREATE TABLE orders(id serial PRIMARY KEY,store_id integer,order_number text,track_number text,status text,comment_status text,shipping_provider text,carrier_name text,carrier_id integer,magasin_id integer,customer_city text,shipping_cost integer,created_at timestamp);
      INSERT INTO carrier_accounts VALUES(1,91,'expressrelais',1,'a','secret',NULL),(2,91,'expressrelais',1,'b','secret',NULL),
        (3,119,'expressrelais',1,'legacy','secret',119),
        (4,120,'expressrelais',1,'multi-a','secret',120),(5,120,'expressrelais',1,'multi-b','secret',121);
      INSERT INTO orders(id,store_id,order_number,track_number,status,shipping_provider,carrier_name,carrier_id,shipping_cost,created_at)
        SELECT id,91,'O-'||id,CASE WHEN id=10 THEN NULL ELSE 'T-'||id END,'Attente De Ramassage',CASE WHEN id=11 THEN '' ELSE 'expressrelais' END,'expressrelais',1,0,now() FROM generate_series(1,400) id;
      INSERT INTO orders VALUES(401,92,'other-store','T-401','Attente De Ramassage','', 'expressrelais','expressrelais',1,NULL,'Casablanca',0,now()),
        (402,91,'other-account','T-402','Attente De Ramassage','','expressrelais','expressrelais',2,NULL,'Casablanca',0,now()),
        (403,119,'legacy-shipped','legacy-shipped','Attente De Ramassage','','expressrelais','expressrelais',NULL,NULL,'Casablanca',0,now()),
        (404,120,'ambiguous-account','ambiguous-account','Attente De Ramassage','','expressrelais','expressrelais',NULL,NULL,'Casablanca',0,now()),
        (405,119,'different-magasin','different-magasin','Attente De Ramassage','','expressrelais','expressrelais',NULL,999,'Casablanca',0,now());`);
    const migration=await read('migrations/2026_10_23_express_relais_sync_cursor.sql');await pg.exec(migration);await pg.exec(migration);
    const carrierAccounts=pgTable('carrier_accounts',{id:serial('id'),storeId:integer('store_id'),carrierName:text('carrier_name'),isActive:integer('is_active'),apiKey:text('api_key'),apiSecret:text('api_secret'),magasinId:integer('magasin_id')});
    const orders=pgTable('orders',{id:serial('id'),storeId:integer('store_id'),orderNumber:text('order_number'),trackNumber:text('track_number'),status:text('status'),commentStatus:text('comment_status'),shippingProvider:text('shipping_provider'),carrierName:text('carrier_name'),carrierId:integer('carrier_id'),magasinId:integer('magasin_id'),customerCity:text('customer_city'),shippingCost:integer('shipping_cost'),createdAt:timestamp('created_at')});
    const db=drizzle(pg), calls=[],events=[];
    const storage={
      updateOrder:async(id,data)=>{await db.update(orders).set(data).where(eq(orders.id,id));},
      updateOrderStatus:async(id,status)=>{await db.update(orders).set({status}).where(eq(orders.id,id));},
      createOrderFollowUpLog:async()=>{},
    };
    class FakeClient{
      constructor(config){this.login=config.login;}
      async getStatus(reference){calls.push({reference,login:this.login});return {data:{idParcelClient:reference,statusParcel:FakeClient.raw || 'PARCEL_IN_TRANSPORT'}};}
    }
    const source=await read('server/index.ts');
    let worker=source.slice(source.indexOf('  async function runExpressRelaisSync('),source.indexOf('  if (runScheduledCarrierSync) {',source.indexOf('  async function runExpressRelaisSync(')));
    for(const [path,replacement] of Object.entries({'./db':'({db})','@shared/schema':'testSchema','drizzle-orm':'testDrizzle','./integrations/express-relais':'({ExpressRelaisClient:FakeClient})','./storage':'({storage})','./sse':'testSse'}))worker=worker.replaceAll(`await import("${path}")`,replacement);
    worker=stripTypeScriptTypes(worker,{mode:'transform'});
    const context={db,testSchema:{carrierAccounts,orders},testDrizzle:{eq,and,or,sql,asc,gt},FakeClient,storage,readExpressRelaisStatus,expressRelaisAccountMatches,testSse:{broadcastToStore:(...event)=>events.push(event)},setTimeout:callback=>{callback();return 0;},console:{info(){},warn(){},error(message,error){throw new Error(message+' '+error);}}};
    const makeWorker=()=>vm.runInNewContext('('+worker+')',context);
    await makeWorker()('first');
    assert.equal(calls.filter(c=>c.login==='a').length,150);
    assert.ok(calls.some(c=>c.reference==='O-10')); // Missing tracking must not prevent idParcelClient lookup.
    assert.ok(calls.some(c=>c.reference==='O-11')); // Empty provider falls back to carrierName.
    assert.equal(calls.some(c=>c.reference==='other-store'),false);
    assert.equal(calls.find(c=>c.reference==='other-account').login,'b');
    assert.equal(calls.find(c=>c.reference==='legacy-shipped').login,'legacy');
    assert.equal((await pg.query('SELECT carrier_id FROM orders WHERE id=403')).rows[0].carrier_id,3);
    assert.equal(calls.some(c=>c.reference==='ambiguous-account'),false);
    assert.equal(calls.some(c=>c.reference==='different-magasin'),false);
    await makeWorker()('restart');await makeWorker()('third');
    const covered=new Set(calls.filter(c=>c.login==='a').map(c=>c.reference));
    assert.equal(covered.size,400);
    assert.equal((await pg.query('SELECT last_order_id FROM express_relais_sync_cursors WHERE account_id=1')).rows[0].last_order_id,400);
    await makeWorker()('wrap');
    assert.equal(calls.filter(c=>c.login==='a').length,550);
    assert.ok(events.some(event=>event[2].status==='En transport'));
    assert.equal((await pg.query('SELECT status FROM orders WHERE id=401')).rows[0].status,'Attente De Ramassage');
    // Execute the real webhook handler with the same DB and authenticated API stub.
    let routeCode=stripTypeScriptTypes(await read('server/express-relais-routes.ts'),{mode:'transform'}).replace(/^import .+;\n/gm,'').replace('export function registerExpressRelaisRoutes','function registerExpressRelaisRoutes');
    for(const [path,replacement] of Object.entries({'./db':'testDbModule','@shared/schema':'testSchema','drizzle-orm':'testDrizzle','./storage':'testStorageModule','./sse':'testSse'}))routeCode=routeCode.replaceAll(`await import("${path}")`,replacement);
    const handlers=new Map();
    vm.runInNewContext(routeCode+';registerExpressRelaisRoutes(app);',{...context,testDbModule:{db},testStorageModule:{storage},ExpressRelaisClient:FakeClient,app:{post(path,handler){handlers.set(path,handler);}}});
    const webhook=handlers.get('/api/webhooks/carrier/:storeId/expressrelais');
    async function notify(body,storeId='91'){let code=200,result;const res={status(value){code=value;return this;},json(value){result=value;return this;},sendStatus(value){code=value;return this;}};await webhook({params:{storeId},body},res);return {code,result};}
    await notify({idParcelClient:'O-400',status:'delivered'});
    assert.equal((await pg.query('SELECT status FROM orders WHERE id=400')).rows[0].status,'En transport');
    FakeClient.raw='PARCEL_IN_DELIVERY';
    const notification=await notify({idParcelExpress:'T-400'});
    assert.equal(notification.code,200);assert.equal(notification.result.verified,true);
    assert.equal((await pg.query('SELECT status FROM orders WHERE id=400')).rows[0].status,'Mis en distribution');
    assert.equal(calls.at(-1).reference,'O-400');
    // Webhooks must also recover the original legacy state, independently of polling.
    await pg.exec('UPDATE orders SET carrier_id=NULL WHERE id=403');
    const legacyNotification=await notify({idParcelClient:'legacy-shipped'},'119');
    assert.equal(legacyNotification.result.verified,true);
    assert.equal((await pg.query('SELECT status,carrier_id FROM orders WHERE id=403')).rows[0].status,'Mis en distribution');
    assert.equal((await pg.query('SELECT carrier_id FROM orders WHERE id=403')).rows[0].carrier_id,3);
    const beforeAmbiguous=calls.length;
    const ambiguousNotification=await notify({idParcelClient:'ambiguous-account'},'120');
    assert.equal(ambiguousNotification.result.verified,false);
    assert.equal(calls.length,beforeAmbiguous);
  }finally{await pg.close();}
});

test('Express Relais labels are French and other carriers remain untouched',()=>{
 for(const [raw,label] of Object.entries({DELIVRED_TO_ADDRESS:'Livrée',DELIVERED_TO_ADDRESS:'Livrée',PARCEL_REFUSED:'Refusée',PARCEL_IN_DELIVERY:'Mis en distribution',RESCHEDULED_DELIVERY_BY_RECIPIENT:'Reporté',SCHEDULED_DELIVERY:'Programmé',UNREACHABLE_RECIPIENT:'Injoignable'})) {
 assert.equal(expressRelaisOrderStatusText({shippingProvider:'expressrelais',commentStatus:raw},raw),label);
 assert.equal(expressRelaisOrderStatusText({shippingProvider:'sendit',commentStatus:raw},raw),raw);
 }
 assert.equal(expressRelaisOrderStatusText({shippingProvider:'expressrelais',commentStatus:'PARCEL_REFUSED | Motif: test'},''),'Refusée | Motif: test');
 assert.equal(expressRelaisOrderStatusText({shippingProvider:'expressrelais',commentStatus:'UNKNOWN'},'UNKNOWN'),'UNKNOWN');
});

test('generic carrier webhook uses the Express Relais mapper without changing other carriers',async()=>{
 const source=await read('server/routes.ts');
 const a=source.indexOf("    if (carrierName.toLowerCase().replace(/[^a-z]/g, '') === 'expressrelais') {",source.indexOf('async function processCarrierWebhook'));
 const b=source.indexOf('    await storage.updateOrderStatus(order.id, newStatus);',a);
 assert.ok(a>0 && b>a);
 const run=vm.runInNewContext('(carrierName,rawText)=>{let newStatus="unchanged";const order={id:1},matchedBy="tracking";'+source.slice(a,b)+'return newStatus;}',{mapExpressRelaisStatus});
 assert.equal(run('expressrelais','DELIVRED_TO_ADDRESS'),'delivered');
 assert.equal(run('Express Relais','PARCEL_REFUSED'),'refused');
 assert.equal(run('expressrelais','PARCEL_IN_DELIVERY'),'Mis en distribution');
 assert.equal(run('sendit','DELIVRED_TO_ADDRESS'),'unchanged');
 assert.equal(run('expressrelais','UNKNOWN').tracked,true);
});

test('existing Express Relais orders move into their exact buckets without changing stock, fees or delivery dates',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id int,status text,comment_status text,shipping_provider text,carrier_name text,track_number text,shipping_cost int,updated_at timestamp,created_at timestamp,pickup_date timestamp);
 CREATE TABLE order_follow_up_logs(id serial PRIMARY KEY,order_id int,agent_id int,agent_name text,note text,created_at timestamp);
 INSERT INTO orders(id,store_id,status,comment_status,shipping_provider,track_number,shipping_cost,updated_at) VALUES
 (1,119,'Attente De Ramassage','DELIVRED_TO_ADDRESS','expressrelais','E1',1800,'2026-10-25'),
 (2,119,'PARCEL_REFUSED',NULL,'Express Relais','E2',2800,'2026-10-25'),
 (3,119,'Mis en distribution','RESCHEDULED_DELIVERY_BY_RECIPIENT','expressrelais','E3',0,'2026-10-25'),
 (4,119,'SCHEDULED_DELIVERY',NULL,'expressrelais','E4',0,'2026-10-25'),
 (5,119,'Attente De Ramassage','UNREACHABLE_RECIPIENT','expressrelais','E5',0,'2026-10-25'),
 (6,119,'Attente De Ramassage','PARCEL_IN_DELIVERY','expressrelais','E6',0,'2026-10-25'),
 (7,119,'refused','PARCEL_IN_RETURN_AGENCY','expressrelais','E7',0,'2026-10-25'),
 (8,119,'delivered','PICKUP_ASSIGNED','expressrelais','E8',1800,'2026-10-25'),
 (9,119,'Attente De Ramassage','DELIVRED_TO_ADDRESS','digylog','D9',0,'2026-10-25'),
 (10,119,'Attente De Ramassage','UNKNOWN','expressrelais','E10',0,'2026-10-25');`);
 await pg.exec(await read('migrations/2026_10_23_orders_delivery_date.sql'));
 await pg.exec("UPDATE orders SET status='in_progress' WHERE id=8; UPDATE orders SET status='delivered',delivered_at='2026-10-27' WHERE id=8");
 const repair=await read('migrations/2026_11_02_express_relais_status_buckets.sql');
 await pg.exec(repair);await pg.exec(repair);
 const rows=(await pg.query('SELECT * FROM orders ORDER BY id')).rows;
 assert.deepEqual(rows.map(r=>r.status),['delivered','refused','in_progress','in_progress','unreachable','Mis en distribution','RETOUR READY','delivered','Attente De Ramassage','Attente De Ramassage']);
 assert.equal(rows[0].delivered_at,null); // No invented delivery timestamp on a classification repair.
 assert.equal(rows[7].delivered_at.toISOString(),'2026-10-27T00:00:00.000Z');
 assert.equal(rows[0].shipping_cost,1800);assert.equal(rows[0].track_number,'E1');
 assert.equal(rows[0].updated_at.toISOString(),'2026-10-25T00:00:00.000Z');
 assert.equal(rows[1].comment_status,'PARCEL_REFUSED');
 assert.equal((await pg.query('SELECT count(*)::int n FROM order_follow_up_logs')).rows[0].n,7);
 // The normal date trigger is re-enabled after the correction.
 await pg.exec("UPDATE orders SET status='delivered' WHERE id=10");
 assert.ok((await pg.query('SELECT delivered_at FROM orders WHERE id=10')).rows[0].delivered_at);
 }finally{await pg.close();}
});

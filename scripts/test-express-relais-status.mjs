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
const {mapExpressRelaisStatus,readExpressRelaisStatus,expressRelaisAccountMatches}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('server/integrations/express-relais-status.ts'),{mode:'transform'})).toString('base64'));

test('scheduled sync and webhooks share complete mappings for transport, agency and distribution',()=>{
  for(const [raw,expected] of Object.entries({PARCEL_IN_TRANSPORT:'En transport',PARCEL_IN_FINAL_AGENCY:'En agence finale',PARCEL_IN_DELIVERY:'Mis en distribution',PARCEL_IN_TRANSIT:'En transit',PARCEL_PICKEDUP:'Ramassé',PARCEL_DELIVERED:'delivered',PARCEL_RETURNED:'retourné','Attente de ramassage':'Attente De Ramassage','Livré *':'delivered','Retour prêt':'RETOUR READY'})){
    assert.equal(mapExpressRelaisStatus(raw),expected,raw);
    assert.deepEqual(readExpressRelaisStatus({data:{idParcelClient:'ORDER-1',statusParcel:raw}},'ORDER-1'),{raw,status:expected});
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

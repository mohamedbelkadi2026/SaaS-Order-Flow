import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,integer,text} from 'drizzle-orm/pg-core';
import {eq,and,or,sql,inArray} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const load=async p=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read(p),{mode:'transform'})).toString('base64'));
const {SENDIT_STATUS_REPAIR_SQL}=await load('server/sendit-status-repair.ts');
const {isCarrierRefusal,CARRIER_REFUSAL_CODES}=await load('shared/carrier-refusal.ts');
const orders=pgTable('orders',{id:integer('id'),storeId:integer('store_id'),status:text('status'),commentStatus:text('comment_status'),shippingProvider:text('shipping_provider'),carrierName:text('carrier_name'),trackNumber:text('track_number')});
async function setup(){const pg=new PGlite();await pg.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id int,status text,comment_status text,shipping_provider text,carrier_name text,track_number text,created_at timestamp,updated_at timestamp,pickup_date timestamp);
CREATE TABLE order_follow_up_logs(id serial PRIMARY KEY,order_id int,agent_id int,agent_name text,note text,created_at timestamp);
INSERT INTO orders(id,store_id,status,comment_status,shipping_provider,track_number,updated_at) VALUES
(1,91,'delivered','DISTRIBUTED','sendit','DH3FCCDC62','2026-10-27'),
(2,91,'delivered','DELIVERED','sendit','S2','2026-10-27'),
(3,92,'delivered','DELIVERING','sendit','S3','2026-10-27'),
(4,91,'delivered','DISTRIBUTED','digylog','D4','2026-10-27'),
(5,91,'cancelled','CANCELED','sendit','S5','2026-10-27'),
(6,91,'Annulé (fake)',NULL,NULL,NULL,'2026-10-27'),
(7,91,'delivered','UNKNOWN','sendit','S7','2026-10-27'),
(8,91,'Annulé','Annulé','ozonexpress','O8','2026-10-27'),
(9,91,'Annulé (fake)','CANCELED','sendit','S9','2026-10-27');`);return pg;}
test('startup repair removes the false Sendit delivery, preserves real deliveries and audits once',async()=>{
 const pg=await setup();try{
 await pg.exec(await read('migrations/2026_10_23_orders_delivery_date.sql'));
 await pg.exec("UPDATE orders SET delivered_at='2026-10-27' WHERE id=1");
 await pg.exec(SENDIT_STATUS_REPAIR_SQL);
 const rows=(await pg.query('SELECT id,status,delivered_at,updated_at FROM orders ORDER BY id')).rows;
 assert.equal(rows[0].status,'transit');assert.equal(rows[0].delivered_at,null);
 assert.equal(rows[1].status,'delivered');assert.equal(rows[2].status,'transit');assert.equal(rows[3].status,'delivered');
 assert.equal(rows[4].status,'refused');assert.equal(rows[5].status,'Annulé (fake)');assert.equal(rows[6].status,'delivered');
 assert.equal(rows[0].updated_at.toISOString(),'2026-10-27T00:00:00.000Z');
 const before=(await pg.query('SELECT count(*)::int AS n FROM order_follow_up_logs')).rows[0].n;
 assert.equal(before,3);await pg.exec(SENDIT_STATUS_REPAIR_SQL);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM order_follow_up_logs')).rows[0].n,before);
 }finally{await pg.close();}
});
test('actual paginated filters put carrier cancellations in Refusées and preserve confirmation cancellations',async()=>{
 const pg=await setup();try{
 const source=await read('server/storage.ts'),a=source.indexOf('  async getFilteredOrders('),b=source.indexOf('    if (filters.agentId)',a);
 const method=source.slice(a,b)+"return await db.select({id:orders.id}).from(orders).where(and(...conditions));\n}})";
 const query=vm.runInNewContext(stripTypeScriptTypes('({'+method,{mode:'transform'}),{db:drizzle(pg),orders,eq,and,or,sql,inArray,CARRIER_REFUSAL_CODES}).getFilteredOrders;
 assert.deepEqual(Array.from(await query(91,{status:'refused'}),r=>r.id).sort((a,b)=>a-b),[5,8]);
 assert.deepEqual(Array.from(await query(91,{status:'annule_group'}),r=>r.id).sort((a,b)=>a-b),[6,9]);
 await pg.exec(SENDIT_STATUS_REPAIR_SQL);
 assert.deepEqual(Array.from(await query(91,{status:'delivered'}),r=>r.id).sort((a,b)=>a-b),[2,4,7]);
 const rows=(await pg.query('SELECT status,comment_status AS "commentStatus",track_number AS "trackNumber",shipping_provider AS "shippingProvider" FROM orders ORDER BY id')).rows;
 assert.equal(isCarrierRefusal(rows[4]),true);assert.equal(isCarrierRefusal(rows[7]),true);assert.equal(isCarrierRefusal(rows[8]),false);
 }finally{await pg.close();}
});

test('tracked Sendit pending parcels leave Confirmées; unshipped and other carrier orders stay untouched',async()=>{
 const pg=await setup();try{
 await pg.exec(`INSERT INTO orders(id,store_id,status,comment_status,shipping_provider,track_number) VALUES
 (10,91,'confirme','PENDING','sendit','S10'),
 (11,91,'confirme','PENDING','sendit',NULL),
 (12,91,'confirme','PENDING','ozonexpress','O12'),
 (13,91,'confirme','TO_PREPARE','sendit','S13'),
 (14,91,'confirme','NEW_DESTINATION','sendit','S14');`);
 await pg.exec(SENDIT_STATUS_REPAIR_SQL);
 const rows=(await pg.query('SELECT id,status,comment_status FROM orders WHERE id>=10 ORDER BY id')).rows;
 assert.deepEqual(rows.map(r=>r.status),['Attente De Ramassage','confirme','confirme','Attente De Ramassage','Attente De Ramassage']);
 assert.equal(rows[0].comment_status,'PENDING');
 await pg.exec(SENDIT_STATUS_REPAIR_SQL);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM order_follow_up_logs WHERE order_id>=10')).rows[0].n,3);
 }finally{await pg.close();}
});

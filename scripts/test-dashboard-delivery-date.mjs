// Node 24; install @electric-sql/pglite locally or set PGLITE_MODULE to its entry point.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const read = p => readFile(new URL('../' + p, import.meta.url),'utf8');
const moduleUrl = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const status = moduleUrl(stripTypeScriptTypes(await read('shared/order-status-sets.ts'),{mode:'transform'}));
const time = moduleUrl(stripTypeScriptTypes(await read('shared/morocco-time.ts'),{mode:'transform'}));
const {filterOrdersByDeliveryDate} = await import(moduleUrl(stripTypeScriptTypes(await read('shared/dashboard-delivery-date.ts'),{mode:'transform'})
  .replace('"./order-status-sets"',JSON.stringify(status)).replace('"./morocco-time"',JSON.stringify(time))));
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration=await read('migrations/2026_10_23_orders_delivery_date.sql');
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id integer,status text,created_at timestamp,updated_at timestamp,pickup_date timestamp);
    CREATE TABLE order_follow_up_logs(id serial PRIMARY KEY,order_id integer,note text,created_at timestamp);
    INSERT INTO orders(id,store_id,status,created_at,updated_at) VALUES
      (1,91,'delivered','2026-09-01','2026-10-23'),(2,91,'Livré','2026-09-01','2026-10-23'),
      (3,91,'delivered','2026-09-01','2026-10-23'),(4,92,'delivered','2026-09-01','2026-10-23');
    INSERT INTO order_follow_up_logs(order_id,note,created_at) VALUES
      (1,'Statut: "in_progress" → "delivered"','2026-10-02 10:00'),
      (1,'Statut: "delivered" → "Livré"','2026-10-03 10:00'),
      (2,'Statut: "in_progress" → "delivered"','2026-10-01 10:00'),
      (2,'Statut: "delivered" → "nouveau"','2026-10-02 10:00'),
      (2,'Statut: "in_progress" → "Livré"','2026-10-05 10:00'),
      (3,'Commentaire: client dit livraison demain','2026-10-06 10:00'),
      (4,'Statut: "in_progress" → "delivered"','2026-10-07 10:00');`);
  await db.exec(migration);
});
after(async()=>{await db?.close();});
test('migration recovers explicit delivery transitions and ignores updatedAt and later delivered aliases',async()=>{
  const {rows}=await db.query('SELECT id,delivered_at FROM orders ORDER BY id');
  assert.equal(rows[0].delivered_at.toISOString(),'2026-10-02T10:00:00.000Z');
  assert.equal(rows[1].delivered_at.toISOString(),'2026-10-05T10:00:00.000Z');
  assert.equal(rows[2].delivered_at,null);
});
test('all status writers are covered, and repeated syncs and unrelated edits cannot change the delivery day',async()=>{
  await db.exec("INSERT INTO orders(id,store_id,status) VALUES(5,91,'in_progress'); UPDATE orders SET status='delivered' WHERE id=5;");
  const first=(await db.query('SELECT delivered_at FROM orders WHERE id=5')).rows[0].delivered_at;
  assert.ok(first instanceof Date);
  await db.exec("UPDATE orders SET status='Livrée',updated_at='2026-12-31' WHERE id=5; UPDATE orders SET updated_at='2027-01-01' WHERE id=5;");
  assert.equal((await db.query('SELECT delivered_at FROM orders WHERE id=5')).rows[0].delivered_at.getTime(),first.getTime());
});
test('an old delivered order without evidence stays undated on a routine carrier refresh',async()=>{
  await db.exec("UPDATE orders SET status='Livrée' WHERE id=3;");
  assert.equal((await db.query('SELECT delivered_at FROM orders WHERE id=3')).rows[0].delivered_at,null);
});
test('importing an already delivered order does not invent a delivery date',async()=>{
  await db.exec("INSERT INTO orders(id,store_id,status,created_at) VALUES(7,91,'delivered','2026-09-01');");
  assert.equal((await db.query('SELECT delivered_at FROM orders WHERE id=7')).rows[0].delivered_at,null);
});
test('status reversal clears the timestamp and redelivery establishes a new date',async()=>{
  await db.exec("UPDATE orders SET status='retourné' WHERE id=5;");
  assert.equal((await db.query('SELECT delivered_at FROM orders WHERE id=5')).rows[0].delivered_at,null);
  await db.exec("UPDATE orders SET status='delivered' WHERE id=5;");
  assert.ok((await db.query('SELECT delivered_at FROM orders WHERE id=5')).rows[0].delivered_at instanceof Date);
});
test('inserts with a known delivery timestamp preserve it, and the migration is idempotent',async()=>{
  await db.exec("INSERT INTO orders(id,store_id,status,delivered_at) VALUES(6,91,'Livré au client','2026-10-06 08:00+00');");
  await db.exec(migration);
  assert.equal((await db.query('SELECT delivered_at FROM orders WHERE id=6')).rows[0].delivered_at.toISOString(),'2026-10-06T08:00:00.000Z');
});
test('October 1–7 counts delivery dates irrespective of creation and shipping dates',()=>{
  const orders=[
    {id:1,status:'delivered',createdAt:'2026-09-01',pickupDate:'2026-09-29',deliveredAt:'2026-10-01T12:00:00Z'},
    {id:2,status:'Livré au client',createdAt:'2026-08-01',deliveredAt:'2026-10-07T21:00:00Z'},
    {id:3,status:'delivered',createdAt:'2026-10-03',deliveredAt:'2026-10-08T12:00:00Z'},
    {id:4,status:'in_progress',deliveredAt:'2026-10-02T12:00:00Z'},
    {id:5,status:'delivered',updatedAt:'2026-10-03'},
  ];
  assert.deepEqual(filterOrdersByDeliveryDate(orders,'2026-10-01','2026-10-07').map(o=>o.id),[1,2]);
});
test('yesterday uses Moroccan midnight boundaries and handles Ramadan UTC offset',()=>{
  const dated=values=>values.map((deliveredAt,id)=>({id,status:'delivered',deliveredAt}));
  const october=dated(['2026-10-21T22:59:59Z','2026-10-21T23:00:00Z','2026-10-22T22:59:59.999Z','2026-10-22T23:00:00Z']);
  assert.deepEqual(filterOrdersByDeliveryDate(october,'2026-10-22','2026-10-22').map(o=>o.id),[1,2]);
  const ramadan=dated(['2026-03-04T23:59:59Z','2026-03-05T00:00:00Z','2026-03-05T23:59:59.999Z','2026-03-06T00:00:00Z']);
  assert.deepEqual(filterOrdersByDeliveryDate(ramadan,'2026-03-05','2026-03-05').map(o=>o.id),[1,2]);
});
test('invalid and missing timestamps never fall back to another order date',()=>{
  assert.deepEqual(filterOrdersByDeliveryDate([{status:'delivered',deliveredAt:'invalid'},{status:'delivered',deliveredAt:null},{status:'nouveau',deliveredAt:'2026-10-02'}]),[]);
});

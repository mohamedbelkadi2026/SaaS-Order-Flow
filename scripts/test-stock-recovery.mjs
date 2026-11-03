import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../migrations/2026_11_03_restore_trench_opening_stock.sql',import.meta.url),'utf8');
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`CREATE TABLE products(id int PRIMARY KEY,store_id int,name text,sku text,stock int,archived_at timestamp);
 CREATE TABLE product_variants(id int PRIMARY KEY,product_id int,store_id int,name text,sku text,stock int);
 CREATE TABLE stock_movements(id serial PRIMARY KEY,store_id int,product_id int,variant_id int,type text,quantity int,reason text,user_id int,order_id int,created_at timestamp DEFAULT now());
 CREATE TABLE stock_adjustment_purge_backups(id int,purge_run_id int,original_movement_id int,store_id int,product_id int,variant_id int,type text,quantity int,reason text,user_id int,original_created_at timestamp);
 INSERT INTO products VALUES(2374,106,'trench ref207','207',0,NULL),(9999,999,'another tenant','207',40,NULL);
 INSERT INTO product_variants VALUES(2666,2374,106,'noir','74750033102749',0),(2667,2374,106,'bordeau','74750058530717',0),(2668,2374,106,'beige','74757321394077',0),(2669,2374,106,'vert','74757346822045',0),(2670,2374,106,'camel','74711346002043',0),(2671,2374,106,'bleu marine','69711358002055',0),(2672,2374,106,'marron','74750007674781',0),(9999,9999,999,'noir','74750033102749',40);
 INSERT INTO stock_movements(id,store_id,product_id,variant_id,type,quantity) VALUES(17596,106,2374,2617,'shipped',-1),(17601,106,2374,2617,'shipped',-1),(17602,106,2374,NULL,'restock',1),(17759,106,2374,2666,'shipped',-1),(17760,106,2374,2672,'shipped',-1),(17776,106,2374,NULL,'shipped',-1),(17777,106,2374,NULL,'shipped',-1),(17857,106,2374,2668,'shipped',-1);
 SELECT setval(pg_get_serial_sequence('stock_movements','id'),17857);
 INSERT INTO stock_adjustment_purge_backups VALUES(351,6,17595,106,2374,NULL,'adjustment',150,'opening',123,'2026-11-01 20:04'),(359,6,17604,106,2374,NULL,'adjustment',-4,'recount',123,'2026-11-01 20:57'),(360,6,17605,106,2374,NULL,'adjustment',3,'recount',123,'2026-11-01 20:58');`);
 return pg;
}
test('restores proven opening quantities, preserves departures and recounts; retry and tenant safe',async()=>{
 const pg=await fixture(); try{
 await pg.exec(migration);
 assert.deepEqual((await pg.query('SELECT stock FROM product_variants WHERE product_id=2374 ORDER BY id')).rows.map(r=>r.stock),[1,21,9,14,33,35,32]);
 assert.equal((await pg.query('SELECT stock FROM products WHERE id=2374')).rows[0].stock,-2);
 assert.equal((await pg.query('SELECT sum(stock) AS total FROM (SELECT stock FROM products WHERE id=2374 UNION ALL SELECT stock FROM product_variants WHERE product_id=2374) t')).rows[0].total,143);
 assert.equal((await pg.query('SELECT sum(quantity) AS total FROM stock_movements WHERE product_id=2374')).rows[0].total,143);
 assert.equal((await pg.query("SELECT sum(quantity) AS total FROM stock_movements WHERE type='shipped'")).rows[0].total,-7);
 assert.equal((await pg.query('SELECT stock FROM products WHERE id=9999')).rows[0].stock,40);
 const before=(await pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n;
 await pg.exec(migration);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n,before);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_inventory_recovery_backups')).rows[0].n,1);
 } finally {await pg.close();}
});
for(const [name,mutation] of [
 ['new stock count', 'UPDATE product_variants SET stock=12 WHERE id=2672'],
 ['new movement', "INSERT INTO stock_movements(store_id,product_id,type,quantity) VALUES(106,2374,'restock',10)"],
 ['different owner','UPDATE products SET store_id=999 WHERE id=2374']
]) test(`skips restoration after ${name}`,async()=>{
 const pg=await fixture();try{await pg.exec(mutation);await pg.exec(migration);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_inventory_recovery_backups')).rows[0].n,0);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_movements WHERE variant_id=2617')).rows[0].n,2);
 }finally{await pg.close();}
});

test('actual inventory stats count orphaned physical departures and agree with restored quantities',async()=>{
 const [{drizzle},core,orm,{stripTypeScriptTypes},{default:vm}]=await Promise.all([
  import('drizzle-orm/pglite'),import('drizzle-orm/pg-core'),import('drizzle-orm'),import('node:module'),import('node:vm')]);
 const {pgTable,integer,text,timestamp}=core;
 const products=pgTable('products',{id:integer('id'),storeId:integer('store_id'),name:text('name'),sku:text('sku'),stock:integer('stock'),archivedAt:timestamp('archived_at')});
 const productVariants=pgTable('product_variants',{id:integer('id'),productId:integer('product_id'),storeId:integer('store_id'),stock:integer('stock')});
 const stockMovements=pgTable('stock_movements',{id:integer('id'),productId:integer('product_id'),storeId:integer('store_id'),type:text('type'),quantity:integer('quantity'),orderId:integer('order_id'),createdAt:timestamp('created_at')});
 const orders=pgTable('orders',{id:integer('id'),storeId:integer('store_id'),status:text('status')});
 const orderItems=pgTable('order_items',{productId:integer('product_id'),orderId:integer('order_id'),quantity:integer('quantity')});
 const source=await readFile(new URL('../server/storage.ts',import.meta.url),'utf8');
 const start=source.indexOf('  async getInventoryStats('),end=source.indexOf('  async updateUser(',start);
 const pg=await fixture();try{
 await pg.exec(`CREATE TABLE orders(id int,store_id int,status text);CREATE TABLE order_items(product_id int,order_id int,quantity int);`);
 await pg.exec(migration);
 const stats=vm.runInNewContext(stripTypeScriptTypes('({'+source.slice(start,end)+'})',{mode:'transform'}),{
  db:drizzle(pg),products,productVariants,stockMovements,orders,orderItems,
  ...orm,NOT_CONFIRMED_STATUSES_ARRAY:['nouveau'],isDeliveredStatus:status=>status==='Livré',console
 });
 const result=await stats.getInventoryStats(106);
 assert.equal(result.totalQuantity,143);assert.equal(result.productStats[0].stock,143);
 assert.equal(result.productStats[0].available,143);
 assert.equal(result.productStats[0].inTransit,7);
 }finally{await pg.close();}
});


test('follow-up preserves shipments arriving during deployment and still restores only once',async()=>{
 const pg=await fixture();try{
 await pg.exec("INSERT INTO stock_movements(store_id,product_id,variant_id,type,quantity,order_id,created_at) VALUES(106,2374,2672,'shipped',-1,55755,'2026-11-03 14:45:48')");
 await pg.exec(migration);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_inventory_recovery_backups')).rows[0].n,0);
 const followup=await readFile(new URL('../migrations/2026_11_03_restore_trench_opening_stock_after_shipment.sql',import.meta.url),'utf8');
 await pg.exec(followup);
 assert.equal((await pg.query('SELECT stock FROM product_variants WHERE id=2672')).rows[0].stock,31);
 assert.equal((await pg.query('SELECT sum(quantity) AS n FROM stock_movements WHERE product_id=2374')).rows[0].n,142);
 const n=(await pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n;
 await pg.exec(followup);await pg.exec(migration);
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n,n);
 }finally{await pg.close();}
});
for(const [label,extra] of [
 ['restock',"INSERT INTO stock_movements(store_id,product_id,type,quantity) VALUES(106,2374,'restock',10)"],
 ['manual adjustment',"INSERT INTO stock_movements(store_id,product_id,type,quantity) VALUES(106,2374,'adjustment',10)"],
 ['unknown variant',"INSERT INTO stock_movements(store_id,product_id,variant_id,type,quantity,order_id,created_at) VALUES(106,2374,9999,'shipped',-1,123,'2026-11-03 15:00')"]
]) test(`follow-up rejects ${label}`,async()=>{
 const pg=await fixture();try{
 await pg.exec(extra);
 await pg.exec(await readFile(new URL('../migrations/2026_11_03_restore_trench_opening_stock_after_shipment.sql',import.meta.url),'utf8'));
 assert.equal((await pg.query('SELECT count(*) AS n FROM stock_inventory_recovery_backups')).rows[0].n,0);
 }finally{await pg.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,integer,text,timestamp,serial} from 'drizzle-orm/pg-core';
import {eq,and,inArray,isNull,sql} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const products=pgTable('products',{id:integer('id'),storeId:integer('store_id'),name:text('name'),sku:text('sku'),stock:integer('stock'),archivedAt:timestamp('archived_at')});
const productVariants=pgTable('product_variants',{id:integer('id'),productId:integer('product_id'),name:text('name'),sku:text('sku'),stock:integer('stock')});
const orders=pgTable('orders',{id:serial('id'),storeId:integer('store_id'),orderNumber:text('order_number'),customerCity:text('customer_city')});
const orderItems=pgTable('order_items',{id:serial('id'),orderId:integer('order_id'),productId:integer('product_id'),sku:text('sku'),variantInfo:text('variant_info'),rawProductName:text('raw_product_name'),quantity:integer('quantity')});
const stockMovements=pgTable('stock_movements',{id:serial('id'),storeId:integer('store_id'),productId:integer('product_id'),variantId:integer('variant_id'),type:text('type'),quantity:integer('quantity'),reason:text('reason'),orderId:integer('order_id')});
const stockLogs=pgTable('stock_logs',{id:serial('id'),storeId:integer('store_id'),productId:integer('product_id'),orderId:integer('order_id'),changeAmount:integer('change_amount'),reason:text('reason')});
const source=await read('server/storage.ts');
async function setup(){
 const pg=new PGlite();
 await pg.exec(`CREATE TABLE products(id int PRIMARY KEY,store_id int,name text,sku text,stock int,archived_at timestamp);
 CREATE TABLE product_variants(id int PRIMARY KEY,product_id int,name text,sku text,stock int);
 CREATE TABLE orders(id serial PRIMARY KEY,store_id int,order_number text,customer_city text);
 CREATE TABLE order_items(id serial PRIMARY KEY,order_id int,product_id int,sku text,variant_info text,raw_product_name text,quantity int);
 CREATE TABLE stock_movements(id serial PRIMARY KEY,store_id int,product_id int,variant_id int,type text,quantity int,reason text,order_id int);
 CREATE TABLE stock_logs(id serial PRIMARY KEY,store_id int,product_id int,order_id int,change_amount int,reason text);
 INSERT INTO products VALUES(2374,106,'trench ref207','207',150,NULL),(9000,999,'other merchant','other',40,NULL),(9001,106,'archived','archived',20,now());
 INSERT INTO product_variants VALUES(2617,2374,'marron','74750007674781',35),(2618,2374,'noir','74750033102749',2),(9990,9000,'marron','74750007674781',40),(9991,9001,'archived','OLD',20);
 INSERT INTO orders(id,store_id,order_number,customer_city) VALUES(54963,106,'12793','settat');
 INSERT INTO order_items(id,order_id,product_id,sku,variant_info,raw_product_name,quantity) VALUES(53330,54963,NULL,'74750007674781','marron-بني / M','Manteau long oversize à capuche cy207',1);`);
 const db=drizzle(pg);
 const context={db,eq,and,inArray,isNull,sql,orders,orderItems,products,productVariants,stockMovements,stockLogs,console:{log(){},info(){},warn(){}}};
 let helper=stripTypeScriptTypes(await read('server/services/stock-sku-resolution.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replaceAll('export async function','async function');
 const helpers=vm.runInNewContext(helper+';({resolveStockSkuItems,linkStockSkuItems})',context);
 Object.assign(context,helpers);
 const extract=(start,end)=>vm.runInNewContext(stripTypeScriptTypes('({'+source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))+'})',{mode:'transform'}),context);
 return {pg,db,...helpers,
  decrement:extract('  async decrementStockForOrder(','  // Lightweight fetch of recent orders').decrementStockForOrder,
  create:extract('  async createOrder(order: InsertOrder','  // Return statuses that restore stock').createOrder};
}
test('actual shipment links the unique variant SKU despite a different title and decrements it only once',async()=>{
 const t=await setup();try{
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT product_id FROM order_items WHERE id=53330')).rows[0].product_id,2374);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2618')).rows[0].stock,2);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=9990')).rows[0].stock,40);
 const movement=(await t.pg.query('SELECT * FROM stock_movements')).rows[0];
 assert.equal(movement.product_id,2374);assert.equal(movement.variant_id,2617);assert.equal(movement.quantity,-1);assert.equal(movement.store_id,106);
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_movements')).rows[0].n,1);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 }finally{await t.pg.close();}
});
test('actual order intake links variant SKUs independently of imported names, including missing labels',async()=>{
 const t=await setup();try{
 const order=await t.create({storeId:106,orderNumber:'NEW',customerCity:'settat'},[{orderId:0,productId:null,sku:'74750007674781',rawProductName:'Different website title',quantity:1}]);
 const row=(await t.pg.query('SELECT * FROM order_items WHERE order_id=$1',[order.id])).rows[0];
 assert.equal(row.product_id,2374);assert.equal(row.variant_info,'marron');
 await t.decrement(order.id,106);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 }finally{await t.pg.close();}
});
test('ambiguous, unknown and archived SKUs remain unlinked; explicit product links and tenant boundaries are preserved',async()=>{
 const t=await setup();try{
 let items=await t.resolveStockSkuItems(t.db,106,[{productId:null,sku:'OLD'},{productId:null,sku:'UNKNOWN'},{productId:42,sku:'74750007674781'}]);
 assert.deepEqual(Array.from(items,i=>i.productId),[null,null,42]);
 items=await t.resolveStockSkuItems(t.db,123,[{productId:null,sku:'74750007674781'}]);assert.equal(items[0].productId,null);
 await t.linkStockSkuItems(t.db,54963,999,[(await t.pg.query('SELECT id,product_id AS "productId",sku FROM order_items WHERE id=53330')).rows[0]]);
 assert.equal((await t.pg.query('SELECT product_id FROM order_items WHERE id=53330')).rows[0].product_id,null);
 await t.pg.exec("INSERT INTO product_variants VALUES(2620,2374,'duplicate','74750007674781',10)");
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_movements')).rows[0].n,0);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,35);
 }finally{await t.pg.close();}
});
test('supplied SKU wins over the label and works without variantInfo; unknown SKU never consumes parent stock',async()=>{
 const t=await setup();try{
 await t.pg.exec("UPDATE order_items SET product_id=2374,variant_info='noir' WHERE id=53330");
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2618')).rows[0].stock,2);
 await t.pg.exec("DELETE FROM stock_movements; DELETE FROM stock_logs; UPDATE order_items SET sku='UNKNOWN',variant_info='marron' WHERE id=53330");
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT stock FROM products WHERE id=2374')).rows[0].stock,150);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_movements')).rows[0].n,0);
 }finally{await t.pg.close();}
});

test('verified missed shipment correction links and deducts once, and skips changed stock',async()=>{
 const t=await setup();try{
 await t.pg.exec("ALTER TABLE orders ADD COLUMN status text; ALTER TABLE orders ADD COLUMN track_number text; UPDATE orders SET status='Attente De Ramassage',track_number='STT1793563752575' WHERE id=54963");
 const repair=await read('migrations/2026_11_01_variant_stock_order_12793.sql');
 await t.pg.exec(repair);await t.pg.exec(repair);
 assert.equal((await t.pg.query('SELECT product_id FROM order_items WHERE id=53330')).rows[0].product_id,2374);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_movements')).rows[0].n,1);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_logs')).rows[0].n,1);
 // A subsequent dispatch retry also sees the correction's outbound ledger.
 await t.decrement(54963,106);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,34);
 await t.pg.exec('DELETE FROM stock_movements; DELETE FROM stock_logs; UPDATE product_variants SET stock=30 WHERE id=2617');
 await t.pg.exec(repair);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=2617')).rows[0].stock,30);
 assert.equal((await t.pg.query('SELECT count(*)::int n FROM stock_movements')).rows[0].n,0);
 }finally{await t.pg.close();}
});

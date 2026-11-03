import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,integer,text,serial} from 'drizzle-orm/pg-core';
import {and,eq} from 'drizzle-orm';
import {PGlite} from '@electric-sql/pglite';
const products=pgTable('products',{id:integer('id').primaryKey(),storeId:integer('store_id'),hasVariants:integer('has_variants')});
const productVariants=pgTable('product_variants',{id:serial('id').primaryKey(),productId:integer('product_id'),storeId:integer('store_id'),name:text('name'),sku:text('sku'),stock:integer('stock'),costPrice:integer('cost_price'),sellingPrice:integer('selling_price')});
const stockMovements=pgTable('stock_movements',{id:serial('id').primaryKey(),productId:integer('product_id'),storeId:integer('store_id'),variantId:integer('variant_id'),type:text('type'),quantity:integer('quantity'),userId:integer('user_id'),reason:text('reason')});
let code=stripTypeScriptTypes(await readFile(new URL('../server/services/save-stock-variants.ts',import.meta.url),'utf8'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replace('export async function','async function');
const save=vm.runInNewContext(code+';saveStockVariants',{products,productVariants,stockMovements,and,eq});
async function setup(){const pg=new PGlite();await pg.exec(`CREATE TABLE products(id int PRIMARY KEY,store_id int,has_variants int);
 CREATE TABLE product_variants(id serial PRIMARY KEY,product_id int,store_id int,name text,sku text,stock int,cost_price int,selling_price int);
 CREATE TABLE stock_movements(id serial PRIMARY KEY,product_id int,store_id int,variant_id int,type text,quantity int,user_id int,reason text);
 INSERT INTO products VALUES(1,106,1),(2,999,1);
 INSERT INTO product_variants VALUES(10,1,106,'marron','SKU1',32,0,0),(20,2,999,'marron','SKU1',99,0,0);
 SELECT setval(pg_get_serial_sequence('product_variants','id'),20);
 INSERT INTO stock_movements(product_id,store_id,variant_id,type,quantity) VALUES(1,106,10,'restock',35),(1,106,10,'shipped',-3);`);return{pg,db:drizzle(pg)};}
const variant={name:'marron',sku:'SKU1',stock:32,costPrice:0,sellingPrice:300};
test('editing variant price preserves ID, stock and shipment history; recount records one delta',async()=>{const t=await setup();try{
 await save(t.db,1,106,123,[variant]);
 assert.equal((await t.pg.query('SELECT id FROM product_variants WHERE product_id=1')).rows[0].id,10);
 assert.equal((await t.pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n,2);
 await save(t.db,1,106,123,[{...variant,stock:30}]);
 assert.equal((await t.pg.query('SELECT sum(quantity) AS n FROM stock_movements WHERE variant_id=10')).rows[0].n,30);
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=20')).rows[0].stock,99);
 await save(t.db,1,106,123,[{...variant,stock:30}]);
 assert.equal((await t.pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n,3);
 }finally{await t.pg.close();}});
test('changed SKU retains unique name identity; new variant logs initial stock',async()=>{const t=await setup();try{
 await save(t.db,1,106,123,[{...variant,sku:'NEW'},{name:'noir',sku:'SKU2',stock:2,costPrice:0,sellingPrice:300}]);
 assert.equal((await t.pg.query("SELECT id FROM product_variants WHERE sku='NEW'")).rows[0].id,10);
 assert.equal((await t.pg.query("SELECT sum(quantity) AS n FROM stock_movements WHERE type='restock'")).rows[0].n,37);
 }finally{await t.pg.close();}});
test('cross tenant and duplicate payloads roll back without touching quantities',async()=>{const t=await setup();try{
 await assert.rejects(save(t.db,1,999,123,[variant]));
 await assert.rejects(save(t.db,1,106,123,[variant,variant]));
 assert.equal((await t.pg.query('SELECT stock FROM product_variants WHERE id=10')).rows[0].stock,32);
 assert.equal((await t.pg.query('SELECT count(*) AS n FROM stock_movements')).rows[0].n,2);
 }finally{await t.pg.close();}});

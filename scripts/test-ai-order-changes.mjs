import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,serial,integer,text,jsonb,timestamp} from 'drizzle-orm/pg-core';
import {eq,and,sql} from 'drizzle-orm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const strip=s=>stripTypeScriptTypes(s,{mode:'transform'}).replace(/^import .*;\n/gm,'').replaceAll('export ','');
const guards=vm.runInNewContext(strip(await read('server/ai-order-guards.ts'))+';({explicitConfirmation,mediaRequest})');
const products=pgTable('products',{id:integer('id'),storeId:integer('store_id'),stock:integer('stock'),archivedAt:timestamp('archived_at'),description:text('description'),descriptionDarija:text('description_darija'),whatsappDescription:text('whatsapp_description'),sellingPrice:integer('selling_price'),whatsappPrice:integer('whatsapp_price')});
const productVariants=pgTable('product_variants',{id:integer('id'),productId:integer('product_id'),storeId:integer('store_id'),name:text('name'),sku:text('sku'),stock:integer('stock')});
const orders=pgTable('orders',{id:integer('id'),storeId:integer('store_id'),customerCity:text('customer_city'),customerAddress:text('customer_address'),status:text('status'),trackNumber:text('track_number'),source:text('source'),totalPrice:integer('total_price'),rawQuantity:integer('raw_quantity'),updatedAt:timestamp('updated_at'),waselexCityId:integer('waselex_city_id'),nearyaRegionId:text('nearya_region_id')});
const orderItems=pgTable('order_items',{id:serial('id').primaryKey(),orderId:integer('order_id'),productId:integer('product_id'),sku:text('sku'),variantInfo:text('variant_info'),rawProductName:text('raw_product_name'),quantity:integer('quantity'),price:integer('price')});
const aiConversations=pgTable('ai_conversations',{id:integer('id'),storeId:integer('store_id'),orderId:integer('order_id'),isManual:integer('is_manual'),orderChangeState:jsonb('order_change_state'),collectedCity:text('collected_city'),collectedAddress:text('collected_address'),status:text('status'),confirmedAt:timestamp('confirmed_at'),confirmButtonsSent:integer('confirm_buttons_sent'),needsAttention:integer('needs_attention')});
const stockMovements=pgTable('stock_movements',{id:integer('id'),storeId:integer('store_id'),orderId:integer('order_id'),type:text('type')});
const api=vm.runInNewContext(strip(await read('server/ai-order-changes.ts'))+';({requestedCity,requestedQuantity,quantityOffers,handleOrderChange,orderOfferContext})',{...guards,and,eq,sql,products,productVariants,orders,orderItems,aiConversations,stockMovements});
const cities=['Agadir','أكادير','Taroudant','تارودانت','Rabat','الرباط'];
test('natural city edits select the intended city and reject coverage/media questions',()=>{
 for(const message of ['صيفطها لتارودانت ماشي أكادير','sftoha lih taroudant machi agadir','بدل المدينة: Taroudant'])assert.equal(api.requestedCity(message,'Agadir',cities)?.toLowerCase().includes('taroudant') || api.requestedCity(message,'Agadir',cities)==='تارودانت',true,message);
 for(const message of ['واش كتوصلو لتارودانت؟','wach katwslou l ville Rabat','صيفط صورة لتارودانت','Agadir'])assert.equal(api.requestedCity(message,'Agadir',cities),null,message);
});
test('quantity requests in Darija/French are distinct from media, phone, price and uncertainty',()=>{
 for(const [message,q] of [['بغيت جوج',2],['خليها ثلاثة',3],['bghit 3',3],['je veux 2 pièces',2],['الكمية: 3',3]])assert.equal(api.requestedQuantity(message),q,message);
 for(const message of ['sft liya 2 photos','واش 3؟','الهاتف 0612345678','شحال جوج ب 199 درهم','2 ولا 3'])assert.equal(api.requestedQuantity(message),null,message);
});
test('only exact merchant numeric offers are priced; conflicts and product dimensions are ignored',()=>{
 const offers=api.quantityOffers('عرض جوج ب 299 درهم. 3 pièces à 499 DH. 2 pour 299 DH');
 assert.equal(offers.length,2);assert.equal(offers[0].total,29900);assert.equal(offers[1].total,49900);
 assert.equal(api.quantityOffers('2 pour 299 DH; 2 pour 399 DH').length,0);
 assert.equal(api.quantityOffers('الطول 3 متر. ضمان 2 سنوات. اختراع تخفيض 50%').length,0);
});
async function fixture(){const pg=new PGlite();await pg.exec(`
CREATE TABLE stores(id int PRIMARY KEY);INSERT INTO stores VALUES(37),(99);
CREATE TABLE products(id int PRIMARY KEY,store_id int,stock int,archived_at timestamp,description text,description_darija text,whatsapp_description text,selling_price int,whatsapp_price int);
CREATE TABLE product_variants(id int PRIMARY KEY,product_id int,store_id int,name text,sku text,stock int);
CREATE TABLE orders(id int PRIMARY KEY,store_id int,customer_city text,customer_address text,status text,track_number text,source text,total_price int,raw_quantity int,updated_at timestamp,waselex_city_id int,nearya_region_id text);
CREATE TABLE order_items(id serial PRIMARY KEY,order_id int,product_id int,sku text,variant_info text,raw_product_name text,quantity int,price int);
CREATE TABLE ai_conversations(id int PRIMARY KEY,store_id int,order_id int,is_manual int,order_change_state jsonb,collected_city text,collected_address text,status text,confirmed_at timestamp,confirm_buttons_sent int,needs_attention int);
CREATE TABLE stock_movements(id int PRIMARY KEY,store_id int,order_id int,type text);
INSERT INTO products VALUES(2271,37,100,NULL,'جوج ب 299 درهم. 3 pour 499 DH',NULL,NULL,19900,NULL);
INSERT INTO orders VALUES(56152,37,'Agadir','Hay Salam','nouveau',NULL,'shopify',21900,1,now(),123,'old-region');
INSERT INTO order_items(order_id,product_id,sku,variant_info,raw_product_name,quantity,price) VALUES(56152,2271,'P1',NULL,'wall machine',1,19900);
INSERT INTO ai_conversations VALUES(1,37,56152,0,NULL,'Agadir','Hay Salam','active',NULL,1,0);
`);await pg.exec(await read('migrations/2026_11_04_ai_order_changes.sql'));return{pg,db:drizzle(pg),lastReply:'',async say(m,last){const result=await api.handleOrderChange(this.db,37,1,m,cities,last ?? this.lastReply);if(result)this.lastReply=result.reply;return result;}};}
test('city proposal requires consent; persists city, clears stale address/carrier IDs and audits atomically',async()=>{const f=await fixture();try{
 const proposal=await f.say('صيفطها لتارودانت ماشي أكادير');assert.match(proposal.reply,/Agadir/);
 assert.equal((await f.pg.query('SELECT customer_city FROM orders')).rows[0].customer_city,'Agadir');
 const applied=await f.say('نعم');assert.equal(applied.changed,true);
 let row=(await f.pg.query('SELECT * FROM orders')).rows[0];assert.equal(row.customer_city,'تارودانت');assert.equal(row.customer_address,null);assert.equal(row.waselex_city_id,null);assert.equal(row.nearya_region_id,null);
 assert.match((await f.say('تأكيد الطلب')).reply,/العنوان/);assert.equal((await f.pg.query('SELECT status FROM orders')).rows[0].status,'nouveau');
 await f.say('العنوان: حي السلام زنقة 2 دار 5');
 row=(await f.pg.query('SELECT * FROM orders')).rows[0];assert.equal(row.customer_address,'حي السلام زنقة 2 دار 5');
 assert.equal(await f.say('نعم'),null);assert.equal((await f.pg.query('SELECT count(*) AS n FROM ai_order_change_audit')).rows[0].n,2);
 }finally{await f.pg.close();}});
test('approved quantity applies exact bundle price plus existing shipping, splits centimes and survives retry',async()=>{const f=await fixture();try{
 const proposal=await f.say('بغيت ثلاثة');assert.match(proposal.reply,/519.00/);assert.equal((await f.pg.query('SELECT raw_quantity FROM orders')).rows[0].raw_quantity,1);
 await f.say('oui');let row=(await f.pg.query('SELECT * FROM orders')).rows[0];assert.equal(row.raw_quantity,3);assert.equal(row.total_price,51900);
 const items=(await f.pg.query('SELECT * FROM order_items')).rows;assert.equal(items.reduce((n,i)=>n+i.quantity,0),3);assert.equal(items.reduce((n,i)=>n+i.quantity*i.price,0),49900);
 assert.equal(await f.say('oui'),null);assert.equal((await f.pg.query('SELECT count(*) AS n FROM ai_order_change_audit')).rows[0].n,1);
 assert.equal((await f.pg.query('SELECT stock FROM products')).rows[0].stock,100);
 // Returning to one uses the saved unit price, never the bundle average.
 assert.match((await f.say('بغيت واحد')).reply,/219.00/);await f.say('نعم');assert.equal((await f.pg.query('SELECT total_price FROM orders')).rows[0].total_price,21900);
 }finally{await f.pg.close();}});
for(const [name,mutation] of [['price changed',"UPDATE products SET description='2 pour 100 DH'"],['order shipped',"UPDATE orders SET track_number='TRACK',status='Attente De Ramassage'"],['order edited',"UPDATE orders SET total_price=25000"]])test(`stale proposal cannot apply after ${name}`,async()=>{const f=await fixture();try{
 await f.say('بغيت جوج');await f.pg.exec(mutation);await f.say('نعم');assert.equal((await f.pg.query('SELECT quantity FROM order_items')).rows[0].quantity,1);assert.equal((await f.pg.query('SELECT count(*) AS n FROM ai_order_change_audit')).rows[0].n,0);
 }finally{await f.pg.close();}});
test('decline cancels only the proposal; media/coverage cannot mutate fields; tenant mismatch cannot edit',async()=>{const f=await fixture();try{
 await f.say('بغيت جوج');await f.say('لا');assert.match((await f.say('نعم')).reply,/كتقصد/);
 assert.equal(await f.say('sft liya image'),null);assert.equal(await f.say('واش كتوصلو لتارودانت؟'),null);
 assert.equal(await api.handleOrderChange(f.db,99,1,'بغيت جوج',cities),null);
 assert.equal((await f.pg.query('SELECT status FROM orders')).rows[0].status,'nouveau');
 assert.equal((await f.pg.query('SELECT total_price FROM orders')).rows[0].total_price,21900);
 }finally{await f.pg.close();}});
test('insufficient stock and multiple distinct items require review without changing price or quantity',async()=>{const f=await fixture();try{
 await f.say('بغيت ثلاثة');await f.pg.exec('UPDATE products SET stock=1');await f.say('نعم');assert.equal((await f.pg.query('SELECT needs_attention FROM ai_conversations')).rows[0].needs_attention,1);
 await f.pg.exec("INSERT INTO order_items(order_id,product_id,sku,quantity,price) VALUES(56152,2271,'OTHER',1,10000)");
 const result=await f.say('بغيت جوج');assert.match(result.reply,/أكثر من منتج/);
 assert.equal((await f.pg.query('SELECT raw_quantity FROM orders')).rows[0].raw_quantity,1);
 }finally{await f.pg.close();}});

test('real inbound handler proposes first, persists consent before sending, and does not confirm stale order terms',async()=>{const f=await fixture();try{
 const source=await read('server/ai-agent.ts');const a=source.indexOf('export async function handleIncomingMessage('),b=source.indexOf('/* ═',a);
 const logs=[],sent=[];
 const context={...guards,handleOrderChange:api.handleOrderChange,db:f.db,orders,orderItems,eq,and,
  MOROCCAN_CITIES:cities,WASELEX_CITIES_SEED:[],FRIEND_ORDER_KEYWORDS:[],aiSourceMatches:()=>true,aiProductsMatch:()=>true,
  storage:{getActiveAiConversationByPhone:async()=>({...((await f.pg.query('SELECT * FROM ai_conversations WHERE id=1')).rows[0]),id:1,storeId:37,orderId:56152,isManual:0}),getAiSettings:async()=>({enabled:1}),getAiLogs:async()=>logs,createAiLog:async l=>logs.push(l),updateAiConversationLastMessage:async()=>{},updateOrderStatus(){throw Error('must not confirm old terms');}},
  storeCanAutoConfirm:async()=>true,broadcastToStore(){},console:{log(){},warn(){},error(...args){throw Error(args.join(' '));}},
  queueWhatsApp:async(_store,_phone,text)=>{sent.push(text);if(/تحفظ التعديل/.test(text))assert.equal((await f.pg.query('SELECT customer_city FROM orders')).rows[0].customer_city,'تارودانت');}
 };
 const handler=vm.runInNewContext(stripTypeScriptTypes(source.slice(a,b).replace('export ','')+';handleIncomingMessage',{mode:'transform'}),context);
 await handler(37,'212612345678','صيفطها لتارودانت ماشي أكادير');assert.equal(sent.length,1);assert.match(sent[0],/بنعم/);
 await handler(37,'212612345678','نعم');assert.equal(sent.length,2);assert.match(sent[1],/تحفظ التعديل/);
 assert.equal((await f.pg.query('SELECT status FROM orders')).rows[0].status,'nouveau');
 }finally{await f.pg.close();}});
test('audit failure rolls back all edited order lines and total; expired approval cannot mutate the order',async()=>{const f=await fixture();try{
 await f.say('بغيت ثلاثة');await f.pg.exec("CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON ai_order_change_audit FOR EACH ROW EXECUTE FUNCTION reject_audit();");
 await assert.rejects(f.say('نعم'));assert.equal((await f.pg.query('SELECT total_price FROM orders')).rows[0].total_price,21900);assert.equal((await f.pg.query('SELECT quantity FROM order_items')).rows[0].quantity,1);
 await f.pg.exec("UPDATE ai_conversations SET order_change_state=jsonb_set(order_change_state,'{pending,createdAt}','0')");
 assert.match((await f.say('نعم')).reply,/فات وقت/);assert.equal((await f.pg.query('SELECT raw_quantity FROM orders')).rows[0].raw_quantity,1);
 }finally{await f.pg.close();}});
test('combined city and quantity are one approved, audited change; offers use only this product and store',async()=>{const f=await fixture();try{
 const offers=await api.orderOfferContext(f.db,37,56152);assert.match(offers,/319.00/);assert.match(offers,/519.00/);
 assert.equal(await api.orderOfferContext(f.db,99,56152),'');
 await f.say('بدل المدينة لتارودانت وبغيت جوج');await f.say('نعم');
 const order=(await f.pg.query('SELECT * FROM orders')).rows[0];assert.equal(order.customer_city,'تارودانت');assert.equal(order.raw_quantity,2);assert.equal(order.total_price,31900);
 }finally{await f.pg.close();}});

test('customer price suggestions never authorize discounts; address numbers and media plurals are not quantities',async()=>{const f=await fixture();try{
 for(const message of ['بغيت جوج صور','بغيت العنوان زنقة 3','بغيت 3 متر','بغيت نعرف ثمن جوج'])assert.equal(api.requestedQuantity(message),null,message);
 const proposal=await f.say('بغيت جوج ب 1 درهم');assert.match(proposal.reply,/319.00/);await f.say('نعم');assert.equal((await f.pg.query('SELECT total_price FROM orders')).rows[0].total_price,31900);
 }finally{await f.pg.close();}});
test('existing manual discounts are not silently stacked with quantity offers',async()=>{const f=await fixture();try{
 await f.pg.exec('UPDATE orders SET total_price=15000');const reply=await f.say('بغيت جوج');assert.match(reply.reply,/تخفيض خاص/);
 assert.equal((await f.pg.query('SELECT total_price FROM orders')).rows[0].total_price,15000);
 assert.equal((await f.pg.query('SELECT order_change_state FROM ai_conversations')).rows[0].order_change_state?.pending,undefined);
 }finally{await f.pg.close();}});

test('consent after a different question only repeats the proposal; unknown cities cancel older proposals',async()=>{const f=await fixture();try{
 const proposal=await f.say('بغيت جوج');const repeat=await f.say('نعم','واش عندك شي سؤال على الضمان؟');assert.equal(repeat.reply,proposal.reply);
 assert.equal((await f.pg.query('SELECT raw_quantity FROM orders')).rows[0].raw_quantity,1);
 await f.say('بدل المدينة: مدينة ما معروفةش');
 assert.equal((await f.pg.query('SELECT order_change_state FROM ai_conversations')).rows[0].order_change_state.pending,undefined);
 }finally{await f.pg.close();}});

test('a bare yes to a product question cannot confirm the order; the explicit order button stays available',async()=>{const f=await fixture();try{
 const answer=await f.say('نعم','واش بغيتي نوريك الفيديو؟');assert.match(answer.reply,/كتقصد نأكدو/);
 assert.equal((await f.pg.query('SELECT status FROM orders')).rows[0].status,'nouveau');
 assert.equal(await f.say('تأكيد الطلب','واش بغيتي الفيديو؟'),null);
 assert.equal(await f.say('oui','واش نأكدو ليك الطلب؟'),null);
 }finally{await f.pg.close();}});

test('switching the conversation to a new order cannot reuse an older price or pending consent',async()=>{const f=await fixture();try{
 await f.say('بغيت ثلاثة');await f.say('نعم');
 await f.pg.exec("INSERT INTO orders(id,store_id,customer_city,customer_address,status,total_price,raw_quantity) VALUES(56153,37,'Rabat','Hay Riad','nouveau',31900,1); INSERT INTO order_items(order_id,product_id,sku,quantity,price) VALUES(56153,2271,'P1',1,29900); UPDATE ai_conversations SET order_id=56153;");
 const proposal=await f.say('بغيت واحد');assert.match(proposal.reply,/319.00/);
 assert.equal((await f.pg.query('SELECT total_price FROM orders WHERE id=56152')).rows[0].total_price,51900);
 }finally{await f.pg.close();}});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,serial,integer,text,timestamp,date} from 'drizzle-orm/pg-core';
import {eq,and,desc,inArray,sql} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const orders=pgTable('orders',{id:serial('id').primaryKey(),storeId:integer('store_id'),assignedToId:integer('assigned_to_id'),magasinId:integer('magasin_id'),status:text('status'),scheduledFor:date('scheduled_for'),customerName:text('customer_name'),createdAt:timestamp('created_at'),customerCity:text('customer_city'),source:text('source'),shippingProvider:text('shipping_provider'),utmSource:text('utm_source'),utmCampaign:text('utm_campaign')});
const products=pgTable('products',{id:serial('id'),storeId:integer('store_id'),name:text('name'),archivedAt:timestamp('archived_at')});
const users=pgTable('users',{id:serial('id'),storeId:integer('store_id'),username:text('username'),role:text('role')});
async function setup(){
 const pg=new PGlite();await pg.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id int,assigned_to_id int,magasin_id int,status text,scheduled_for date,customer_name text,created_at timestamp,customer_city text,source text,shipping_provider text,utm_source text,utm_campaign text);
 CREATE TABLE products(id serial,store_id int,name text,archived_at timestamp);CREATE TABLE users(id serial,store_id int,username text,role text);`);
 const db=drizzle(pg),handlers=new Map(),storage={getVisibleAgentIds:async user=>user.visibleIds ?? user.id};
 const context={db,storage,orders,products,users,eq,and,desc,inArray,sql,casablancaTomorrow:()=> '2026-10-27',console,Date};
 const code=stripTypeScriptTypes(await read('server/order-navigation-routes.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replaceAll('export ','');
 vm.runInNewContext(code+';registerOrderNavigationRoutes(app, requireAuth);', {...context,app:{get:(p,...args)=>handlers.set(p,args.at(-1))},requireAuth:()=>{}});
 const add=row=>db.insert(orders).values({storeId:91,assignedToId:7,status:'nouveau',createdAt:new Date('2026-10-26T12:00:00Z'),...row});
 async function request(user={id:7,role:'owner',storeId:91}){let status=200,data,headers={};await handlers.get('/api/orders/navigation-summary')({user},{setHeader(k,v){headers[k]=v;},status(v){status=v;return this;},json(v){data=v;return this;}});return {status,data,headers};}
 return {pg,db,context,handlers,add,request};
}
test('navigation counts the full pool, returns only eight tiny recent rows and keeps deterministic order',async()=>{
 const t=await setup();try{
 await t.db.insert(orders).values(Array.from({length:1000},(_,i)=>({storeId:91,assignedToId:7,customerName:'Client '+i,status:'nouveau',createdAt:new Date('2026-10-26T12:00:00Z')})));
 for(const scheduledFor of ['2026-10-25','2026-10-27','2026-10-28',null])await t.add({status:'confirme_reporte',scheduledFor});
 await t.add({status:'rappel'});await t.add({storeId:92});
 const {data,headers}=await t.request();assert.equal(data.nouveau,1000);assert.equal(data.rappel,1);assert.equal(data.confirmeReporteDueSoon,2);
 assert.equal(data.recentOrders.length,8);assert.equal(data.recentOrders[0].id,1005);
 assert.deepEqual(Object.keys(data.recentOrders[0]).sort(),['createdAt','customerName','id','status']);
 assert.ok(JSON.stringify(data).length<1600);assert.equal(headers['Cache-Control'],'no-store');
 }finally{await t.pg.close();}
});
test('navigation respects ordinary agents, team scope, empty teams, stores, and buyer access',async()=>{
 const t=await setup();try{
 await t.add({assignedToId:7});await t.add({assignedToId:8});await t.add({assignedToId:9});await t.add({storeId:92,assignedToId:7});
 assert.equal((await t.request({id:7,storeId:91,role:'agent'})).data.nouveau,1);
 assert.equal((await t.request({id:7,storeId:91,role:'agent',visibleIds:[7,8]})).data.nouveau,2);
 const empty=await t.request({id:7,storeId:91,role:'agent',visibleIds:[]});assert.equal(empty.data.nouveau,0);assert.equal(empty.data.recentOrders.length,0);
 assert.equal((await t.request({id:7,storeId:91,role:'media_buyer'})).status,403);
 assert.equal((await t.request({id:7,storeId:null,role:'owner'})).status,403);
 }finally{await t.pg.close();}
});
test('filter dropdowns preserve values and scoping without order hydration or product media',async()=>{
 const t=await setup();try{
 const source=await read('server/routes.ts'),a=source.indexOf('  app.get("/api/stats/filter-options",'),b=source.indexOf('  app.get("/api/stats/filtered",',a);
 vm.runInNewContext(stripTypeScriptTypes(source.slice(a,b),{mode:'transform'}),{...t.context,app:{get:(p,...args)=>t.handlers.set(p,args.at(-1))},requireAuth:()=>{}});
 await t.add({magasinId:10,customerCity:'Agadir',source:'youcan',shippingProvider:'nearya',utmSource:'fb',utmCampaign:'A'});
 await t.add({magasinId:11,customerCity:'Rabat',source:'woo'});await t.add({storeId:92,customerCity:'Hidden'});
 await t.db.insert(products).values([{storeId:91,name:'Active'},{storeId:91,name:'Archived',archivedAt:new Date()},{storeId:92,name:'Hidden'}]);
 await t.db.insert(users).values([{storeId:91,username:'Agent',role:'agent'},{storeId:91,username:'Owner',role:'owner'},{storeId:92,username:'Hidden',role:'agent'}]);
 let result;await t.handlers.get('/api/stats/filter-options')({user:{storeId:91},query:{magasinId:'10'}},{json(v){result=v;}});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{cities:['Agadir'],sources:['youcan'],shippingProviders:['nearya'],utmSources:['fb'],utmCampaigns:['A'],products:[{id:1,name:'Active'}],agents:[{id:1,username:'Agent'}]});
 }finally{await t.pg.close();}
});

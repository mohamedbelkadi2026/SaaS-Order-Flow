import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,integer,text,timestamp} from 'drizzle-orm/pg-core';
import {eq,and,sql,count,gte,lte,lt} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const load=async p=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read(p),{mode:'transform'})).toString('base64'));
const {teamPeriodRange,validTeamRange,isCalendarDate}=await load('shared/team-period.ts');
const time=await load('shared/morocco-time.ts'),statuses=await load('shared/order-status-sets.ts');
test('month presets handle year boundaries and leap years; custom dates remain inclusive',()=>{
 const c={from:'2026-09-03',to:'2026-10-12'};
 assert.deepEqual(teamPeriodRange('month','2026-10-28','2026-10-01',c),{from:'2026-10-01',to:'2026-10-28'});
 assert.deepEqual(teamPeriodRange('last_month','2026-01-02','2026-01-02',c),{from:'2025-12-01',to:'2025-12-31'});
 assert.deepEqual(teamPeriodRange('last_month','2024-03-01','2024-03-01',c),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(teamPeriodRange('custom','2026-10-28','2026-10-28',c),c);
 assert.equal(validTeamRange('2026-10-12','2026-10-01'),false);assert.equal(isCalendarDate('2026-02-30'),false);
});
test('both action table and creation-based cards honor the full date range, magasin and store',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE orders(id serial,store_id int,magasin_id int,assigned_to_id int,status text,created_at timestamp,updated_at timestamp,last_action_by int,last_action_at timestamp,track_number text,comment_status text)`);
 const orders=pgTable('orders',{storeId:integer('store_id'),magasinId:integer('magasin_id'),assignedToId:integer('assigned_to_id'),status:text('status'),createdAt:timestamp('created_at'),updatedAt:timestamp('updated_at'),lastActionBy:integer('last_action_by'),lastActionAt:timestamp('last_action_at'),trackNumber:text('track_number'),commentStatus:text('comment_status')});
 const db=drizzle(pg),source=await read('server/storage.ts');
 const context={Date,db,orders,eq,and,sql,count,gte,lte,lt,...statuses,...time,casablancaToday:()=> '2026-10-28'};
 const extract=(start,end)=>vm.runInNewContext(stripTypeScriptTypes('({'+source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))+'})',{mode:'transform'}),context);
 const actions=extract('  async getAgentPerformance(','  async getAgentComparisonByProduct(').getAgentPerformance;
 const cards=extract('  async getAgentPerformanceByAssignment(','  async getAllStores(').getAgentPerformanceByAssignment;
 const from=time.moroccoDayStart('2026-10-01'),to=time.moroccoDayEnd('2026-10-28');
 for(const [date,storeId,magasinId] of [[from,91,10],[to,91,10],[new Date(from.getTime()-1),91,10],[new Date(to.getTime()+1),91,10],[from,92,10],[from,91,11]])await db.insert(orders).values({storeId,magasinId,assignedToId:7,lastActionBy:7,status:'delivered',createdAt:date,lastActionAt:date,updatedAt:date});
 for(const method of [actions,cards]){
  const result=await method(91,{dateFrom:'2026-10-01',dateTo:'2026-10-28',magasinId:10});
  assert.equal(result.length,1);assert.equal(result[0].total,2);assert.equal(result[0].delivered,2);
 }
 const legacy=await actions(91,{date:'2026-10-01',magasinId:10});assert.equal(legacy[0].total,1);
 }finally{await pg.close();}
});
test('API rejects invalid ranges and forwards valid dates without changing magasin scope',async()=>{
 const src=await read('server/routes.ts'),a=src.indexOf('  app.get("/api/agents/performance",'),b=src.indexOf('  // Agent comparison by product',a),handlers=new Map();let received;
 vm.runInNewContext(stripTypeScriptTypes(src.slice(a,b),{mode:'transform'}),{app:{get:(p,...args)=>handlers.set(p,args.at(-1))},requireAuth:()=>{},isCalendarDate,validTeamRange,storage:{getAgentPerformance:async(store,opts)=>{received={store,opts};return [];},getAgentPerformanceByAssignment:async()=>[]}});
 const run=async query=>{let status=200;await handlers.get('/api/agents/performance')({user:{storeId:91},query},{status(v){status=v;return this;},json(){}});return status;};
 assert.equal(await run({dateFrom:'2026-10-01',dateTo:'2026-10-28',magasinId:'10'}),200);
 assert.equal(received.store,91);assert.equal(received.opts.magasinId,10);assert.equal(received.opts.dateTo,'2026-10-28');
 assert.equal(await run({dateFrom:'2026-10-28',dateTo:'2026-10-01'}),400);
 assert.equal(await run({dateFrom:'2026-02-30'}),400);
});

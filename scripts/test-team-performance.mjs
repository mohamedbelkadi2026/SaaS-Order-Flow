import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,serial,integer,text,timestamp} from 'drizzle-orm/pg-core';
import {eq,and,sql,count,gte,lte} from 'drizzle-orm';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const asModule=source=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));
const {moroccoDayStart,moroccoDayEnd}=await asModule(await read('shared/morocco-time.ts'));
const {SHIPPED_STATUS_SET}=await asModule(await read('shared/order-status-sets.ts'));
const orders=pgTable('orders',{id:serial('id').primaryKey(),storeId:integer('store_id'),magasinId:integer('magasin_id'),assignedToId:integer('assigned_to_id'),status:text('status'),trackNumber:text('track_number'),commentStatus:text('comment_status'),createdAt:timestamp('created_at'),updatedAt:timestamp('updated_at'),lastActionBy:integer('last_action_by'),lastActionAt:timestamp('last_action_at')});
async function setup(){
  const pg=new PGlite();await pg.exec(`CREATE TABLE orders(id serial PRIMARY KEY,store_id int,magasin_id int,assigned_to_id int,status text,track_number text,comment_status text,created_at timestamp,updated_at timestamp,last_action_by int,last_action_at timestamp)`);
  const db=drizzle(pg),source=await read('server/storage.ts');
  const a=source.indexOf('  async getAgentPerformanceByAssignment('),b=source.indexOf('  async getAllStores()',a);
  const method=vm.runInNewContext(stripTypeScriptTypes('({'+source.slice(a,b)+'})',{mode:'transform'}),{db,orders,eq,and,sql,count,gte,lte,moroccoDayStart,moroccoDayEnd,SHIPPED_STATUS_SET}).getAgentPerformanceByAssignment;
  const base={storeId:91,magasinId:10,assignedToId:7,createdAt:new Date('2026-10-26T10:00:00Z')};
  return {pg,db,base,stats:(options={dateFrom:'2026-10-26',dateTo:'2026-10-26'})=>method(91,options),add:row=>db.insert(orders).values({...base,...row})};
}
test('all cards use assigned orders, including untouched new orders and accented statuses',async()=>{
  const t=await setup();try{
    for(const status of ['nouveau','nouveau','confirme','Livrée','Rappel','Injoignable','Boîte vocale','Pas de réponse 3','Annulé par client','Annulé Double','retourné','En cours'])await t.add({status});
    const [r]=await t.stats();
    assert.deepEqual(JSON.parse(JSON.stringify(r)),{agentId:7,total:12,confirmed:3,delivered:1,cancelled:2,nouveaux:2,rappels:1,injoignables:1,boiteVocale:1,pasDeReponse:1,avgResponseMinutes:null});
  }finally{await t.pg.close();}
});
test('date and magasin filters use Morocco creation days, never latest action or another account',async()=>{
  const t=await setup();try{
    await t.add({status:'nouveau',createdAt:new Date('2026-10-25T23:00:00Z')});
    await t.add({status:'delivered',createdAt:new Date('2026-10-26T22:59:59.999Z'),lastActionBy:99,lastActionAt:new Date('2026-10-27T12:00:00Z')});
    await t.add({status:'nouveau',createdAt:new Date('2026-10-25T22:59:59.999Z')});
    await t.add({status:'nouveau',createdAt:new Date('2026-10-26T23:00:00Z')});
    await t.add({status:'nouveau',storeId:92});await t.add({status:'nouveau',assignedToId:null});
    await t.add({status:'nouveau',magasinId:11,assignedToId:8});
    const [r]=await t.stats({dateFrom:'2026-10-26',dateTo:'2026-10-26',magasinId:10});
    assert.equal(r.total,2);assert.equal(r.nouveaux,1);assert.equal(r.delivered,1);assert.equal(r.agentId,7);
    assert.equal((await t.stats()).length,2);
    await t.pg.exec('UPDATE orders SET assigned_to_id=8 WHERE assigned_to_id=7');
    assert.equal((await t.stats()).some(row=>row.agentId===7),false);
  }finally{await t.pg.close();}
});
test('new excludes tracking/carrier orders; last agent action timing ignores carrier updatedAt',async()=>{
  const t=await setup();try{
    await t.add({status:'nouveau',trackNumber:'TRACK'});
    await t.add({status:'nouveau',commentStatus:'En transit'});
    await t.add({status:'confirme',lastActionBy:7,lastActionAt:new Date('2026-10-26T10:05:00Z'),updatedAt:new Date('2026-11-01T00:00:00Z')});
    const [r]=await t.stats();assert.equal(r.total,3);assert.equal(r.nouveaux,0);assert.equal(r.avgResponseMinutes,5);
  }finally{await t.pg.close();}
});
test('SQL counts the entire pool, without pagination or duplicate joins',async()=>{
  const t=await setup();try{
    await t.db.insert(orders).values(Array.from({length:605},()=>({...t.base,status:'nouveau'})));
    const [r]=await t.stats();assert.equal(r.total,605);assert.equal(r.nouveaux,605);
  }finally{await t.pg.close();}
});
test('status changes refresh the same assigned cohort without inflating totals',async()=>{
  const t=await setup();try{
    await t.add({status:'nouveau'});
    for(const [status,expected] of [['nouveau',[1,0,0,0]],['confirme',[0,1,0,0]],['Livré au client',[0,1,1,0]],['Annulé (fake)',[0,0,0,1]]]){
      await t.pg.query('UPDATE orders SET status=$1',[status]);
      const [r]=await t.stats();assert.equal(r.total,1);
      assert.deepEqual([r.nouveaux,r.confirmed,r.delivered,r.cancelled],expected);
    }
  }finally{await t.pg.close();}
});

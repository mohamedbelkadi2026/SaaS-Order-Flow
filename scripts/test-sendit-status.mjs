import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {readSenditStatus,senditOrderStatusText,senditWebhookFields}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('shared/sendit-status.ts'),{mode:'transform'})).toString('base64'));
const source=await read('server/routes.ts');
test('Sendit codes, actual TOPICKUP spelling and French labels share lifecycle mappings',()=>{
 for(const [raw,label,status] of [['PENDING','En attente','confirme'],['TO_PREPARE','À préparer','confirme'],['TOPICKUP','Ramassage en cours','in_progress'],['TO_PICKUP','Ramassage en cours','in_progress'],['PICKED_UP','Ramassé','in_progress'],['WAREHOUSE','Entrepôt','in_progress'],['DISTRIBUTED','Distribué','transit'],['DELIVERING','En cours de livraison','transit'],['DELIVERED','Livré','delivered'],['RETURNED','Retourné','retourné'],['CANCELLED','Annulé','cancelled'],['POSTPONED','Reporté','confirme_reporte']]){
 assert.deepEqual(readSenditStatus(raw),{label,status});assert.equal(readSenditStatus(label).status,status);
 assert.equal(senditOrderStatusText({shippingProvider:'sendit',commentStatus:raw}),label);
 }
 assert.equal(readSenditStatus('Non livré'),null);assert.equal(readSenditStatus('delivery.status.update'),null);assert.equal(readSenditStatus({status:'DELIVERED'}),null);
});
test('existing Sendit rows display translated raw status without modifying other carriers or losing reasons',()=>{
 assert.equal(senditOrderStatusText({shippingProvider:'sendit',status:'delivered',commentStatus:'DISTRIBUTED | Motif: agence'}),'Distribué | Motif: agence');
 assert.equal(senditOrderStatusText({shippingProvider:'digylog',commentStatus:'DISTRIBUTED'}),'DISTRIBUTED');
 assert.equal(senditOrderStatusText({carrierName:'Sendit',commentStatus:'FUTURE_STATE'}),'FUTURE_STATE');
});
test('real webhook saves the raw stage, maps correctly, emits updates and ignores unrelated carrier orders',async()=>{
 const start=source.indexOf('  app.post("/api/webhooks/sendit/:storeId",'),end=source.indexOf('  // ─── YouCan OAuth webhook',start);
 let handler;const row={id:42,storeId:91,trackNumber:'S1',shippingProvider:'sendit',status:'Attente De Ramassage',commentStatus:null};const updates=[],events=[];
 const storage={getCarrierAccounts:async()=>[],getOrderByNumber:async()=>undefined,getOrderByTrackingNumber:async(store,tracking)=>store===91&&tracking==='S1'?row:undefined,updateOrder:async(id,data)=>{updates.push(data);Object.assign(row,data);},createIntegrationLog:async()=>{}};
 vm.runInNewContext(stripTypeScriptTypes(source.slice(start,end),{mode:'transform'}),{app:{post:(path,fn)=>{handler=fn;}},storage,senditWebhookFields,mapSenditStatus:raw=>readSenditStatus(raw)?.status??null,emitOrderUpdated:(...v)=>events.push(v),broadcastToStore:()=>{},notifyStatusUpdate:async()=>{},console:{log(){},warn(){},error(){}}});
 async function notify(raw){let code=200,result;await handler({params:{storeId:'91'},headers:{},body:{code:'S1',newStatus:raw}},{status(n){code=n;return this;},json(v){result=v;return this;}});assert.equal(code,200);return result;}
 await notify('DISTRIBUTED');assert.equal(row.status,'transit');assert.equal(row.commentStatus,'DISTRIBUTED');
 await notify('DELIVERING');assert.equal(row.status,'transit');assert.equal(row.commentStatus,'DELIVERING');
 await notify('DELIVERED');assert.equal(row.status,'delivered');
 await notify('FUTURE_STATE');assert.equal(row.status,'delivered');assert.equal(row.commentStatus,'FUTURE_STATE');assert.equal(events.length,4);
 row.shippingProvider='digylog';const before=updates.length;await notify('RETURNED');assert.equal(updates.length,before);
});
test('generic Sendit webhook overrides fuzzy distribution matching using the same exact mapper',()=>{
 const start=source.indexOf("    if (carrierName.toLowerCase() === 'sendit') {",source.indexOf('async function processCarrierWebhook'));
 const end=source.indexOf('    await storage.updateOrderStatus(order.id, newStatus);',start);
 const block=source.slice(start,end);
 const run=vm.runInNewContext('(rawText)=>{let newStatus="delivered";const carrierName="sendit",order={id:1},matchedBy="tracking";'+block+'return newStatus;}',{mapSenditStatus:raw=>readSenditStatus(raw)?.status??null});
 assert.equal(run('DISTRIBUTED'),'transit');assert.equal(run('DELIVERING'),'transit');assert.equal(run('DELIVERED'),'delivered');assert.equal(run('FUTURE').tracked,true);
});

test('real status fields are read from flat and nested Sendit payloads without treating an event as a stage',()=>{
 assert.deepEqual(senditWebhookFields({data:{code:'S1',status:'DELIVERING'}}),{code:'S1',reference:'',newStatus:'DELIVERING'});
 assert.deepEqual(senditWebhookFields({reference:'ORDER-1',status:'DELIVERED'}),{code:'',reference:'ORDER-1',newStatus:'DELIVERED'});
 assert.equal(senditWebhookFields({status:'delivery.status.update'}).newStatus,'');
});

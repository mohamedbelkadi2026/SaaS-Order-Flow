import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const guards=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('server/ai-order-guards.ts'),{mode:'transform'})).toString('base64'));
const {mediaRequest,explicitConfirmation,validatedDeliveryInfo,explicitProductSwitch}=guards;
const fields={name:null,city:null,address:null,phone:null};
const current={name:'khalid',city:'agadir',address:'douar aghechi',phone:'+212688959768'};
test('real Darija/French media requests bypass the model and cannot become delivery fields or confirmation',()=>{
 for(const [text,kind] of [['Sft liya tswira dyalo','image'],['Ou vidéo','video'],['sift liya audio','audio'],['صيفط ليا الصورة','image'],['note vocale','audio']]){
  assert.equal(mediaRequest(text),kind);assert.equal(explicitConfirmation(text),false);assert.equal(explicitProductSwitch(text),false);
  assert.deepEqual(validatedDeliveryInfo(text,{name:text,city:text,address:text,phone:text},current,['agadir']),fields);
 }
});
test('current-message provenance, known city and explicit edit protect saved site details',()=>{
 assert.deepEqual(validatedDeliveryInfo('شكرا',{name:'Ahmed',city:'Rabat',address:'Hay Riad',phone:'0612345678'},current,['Rabat']),fields);
 assert.equal(validatedDeliveryInfo('Rabat',{...fields,city:'Rabat'},current,['Rabat']).city,null);
 for(const text of ['wach katwslou l ville Rabat','واش كتوصلو لمدينة Rabat؟','quelle ville Rabat'])assert.equal(validatedDeliveryInfo(text,{...fields,city:'Rabat'},current,['Rabat']).city,null);
 assert.equal(validatedDeliveryInfo('المدينة Rabat',{...fields,city:'Rabat'},current,['Rabat']).city,null);
 assert.equal(validatedDeliveryInfo('المدينة: Rabat',{...fields,city:'Rabat'},current,['Rabat']).city,'Rabat');
 assert.equal(validatedDeliveryInfo('بدل المدينة ل Rabat',{...fields,city:'Rabat'},current,['Rabat']).city,'Rabat');
 assert.equal(validatedDeliveryInfo('المدينة: أي كلام',{...fields,city:'أي كلام'},current,['Rabat']).city,null);
 assert.equal(validatedDeliveryInfo('Rabat',{...fields,city:'Rabat'},fields,['Rabat']).city,'Rabat');
 assert.equal(validatedDeliveryInfo('الاسم: Ahmed',{...fields,name:'Ahmed'},current,[]).name,'Ahmed');
 assert.equal(validatedDeliveryInfo('الهاتف: 0612345678',{...fields,phone:'+212612345678'},current,[]).phone,'+212612345678');
 assert.equal(validatedDeliveryInfo('الهاتف: 0612345678',{...fields,phone:'+212699999999'},current,[]).phone,null);
 assert.equal(validatedDeliveryInfo('Hay Riad',{...fields,address:'Hay Riad'},fields,[],'شنو هو العنوان؟').address,'Hay Riad');
});
test('only an explicit customer confirmation authorizes confirmation; assistant claims and questions do not',()=>{
 for(const text of ['تأكيد الطلب','نعم','oui','je confirme','واخا'])assert.equal(explicitConfirmation(text),true,text);
 for(const text of ['واش الطلب تأكد؟','لا ما تأكدش','واش كاين؟','صيفط ليا فيديو','not confirmed','الكوموند ديالك تأكدات ✅'])assert.equal(explicitConfirmation(text),false,text);
});
test('production intent and model decision paths enforce the guard rather than trust generated success text',async()=>{
 const src=await read('server/ai-agent.ts'),a=src.indexOf('function detectIntent('),b=src.indexOf('function detectAttentionNeeded',a);
 const detectIntent=vm.runInNewContext(stripTypeScriptTypes(src.slice(a,b)+';detectIntent',{mode:'transform'}),{...guards,CATALOG_KEYWORDS:[],VIDEO_KEYWORDS:[],AUDIO_KEYWORDS:[],IMAGE_KEYWORDS:[],CANCEL_KEYWORDS:[]});
 assert.equal(detectIntent('Sft liya tswira dyalo'),'image');assert.equal(detectIntent('Ou vidéo'),'video');assert.equal(detectIntent('واش نأكد؟'),null);
 const start=src.indexOf('      // A generated reply can never authorize'),end=src.indexOf('      // ── Detect early whether',start);
 const decision={isConfirmed:true,isCancelled:false};
 const out=vm.runInNewContext(stripTypeScriptTypes(src.slice(start,end)+';({decision,aiReply})',{mode:'transform'}),{...guards,decision,customerMessage:'شنو المدة؟',intent:null,aiReply:'الكوموند ديالك تأكدات ✅'});
 assert.equal(out.decision.isConfirmed,false);assert.doesNotMatch(out.aiReply,/تأكدات/);
 assert.ok(!src.includes('stepData.city = customerMessage.trim()'));
});
test('scoped production city repair is idempotent and preserves subsequent manual corrections',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec(`CREATE TABLE orders(id int primary key,store_id int,customer_city text);CREATE TABLE ai_conversations(id int primary key,store_id int,order_id int,collected_city text);CREATE TABLE ai_logs(id serial primary key,store_id int,order_id int,role text,message text);INSERT INTO orders VALUES(56152,37,'Sft liya tswira dyalo'),(56153,37,'Sft liya tswira dyalo');INSERT INTO ai_conversations VALUES(152,37,56152,'Sft liya tswira dyalo');INSERT INTO ai_logs(store_id,order_id,role,message) VALUES(37,56152,'assistant','المدينة: agadir');`);
  const migration=await read('migrations/2026_11_03_ai_order_56152_city.sql');await pg.exec(migration);await pg.exec(migration);
  assert.equal((await pg.query('SELECT customer_city FROM orders WHERE id=56152')).rows[0].customer_city,'agadir');
  assert.equal((await pg.query('SELECT customer_city FROM orders WHERE id=56153')).rows[0].customer_city,'Sft liya tswira dyalo');
  assert.equal((await pg.query('SELECT collected_city FROM ai_conversations')).rows[0].collected_city,null);
  assert.equal((await pg.query('SELECT count(*) AS n FROM ai_order_city_repair_backups')).rows[0].n,1);
  await pg.exec("UPDATE orders SET customer_city='Rabat' WHERE id=56152");await pg.exec(migration);
  assert.equal((await pg.query('SELECT customer_city FROM orders WHERE id=56152')).rows[0].customer_city,'Rabat');
 }finally{await pg.close();}
});

test('the real inbound handler sends the current product media without LLM calls or delivery mutations',async()=>{
 const src=await read('server/ai-agent.ts');
 const ia=src.indexOf('function detectIntent('),ib=src.indexOf('function detectAttentionNeeded',ia);
 const a=src.indexOf('export async function handleIncomingMessage('),b=src.indexOf('/* ═',a);
 for(const [text,kind] of [['Sft liya tswira dyalo','image'],['Ou vidéo','file']]){
  const calls=[],logs=[];const orders={},orderItems={};
  const db={select:()=>({from:table=>({where:async()=>table===orders?[{source:'shopify',status:'nouveau'}]:[{productId:2271}]})}),update(){throw Error('unexpected mutation');}};
  const context={...guards,db,orders,orderItems,eq(){},and(){},aiSourceMatches:()=>true,aiProductsMatch:()=>true,FRIEND_ORDER_KEYWORDS:[],CATALOG_KEYWORDS:[],VIDEO_KEYWORDS:[],AUDIO_KEYWORDS:[],IMAGE_KEYWORDS:[],CANCEL_KEYWORDS:[],
   storage:{getActiveAiConversationByPhone:async()=>({id:152,storeId:37,orderId:56152,status:'active',customerName:'khalid'}),getAiSettings:async()=>({enabled:1}),createAiLog:async x=>logs.push(x),updateAiConversationLastMessage:async()=>{}},
   storeCanAutoConfirm:async()=>true,getOrderContext:async()=>({productName:'Wall sander',productImageUrls:['OWN_IMAGE'],productVideoUrls:['OWN_VIDEO'],productAudioUrls:[]}),
   sendWhatsAppImage:async(...args)=>{calls.push(['image',...args]);return true;},sendWhatsAppFile:async(...args)=>{calls.push(['file',...args]);return true;},
   detectGender:()=>null,getGenderAddress:()=>({friendly:'خويا'}),broadcastToStore(){},Date,console:{log(){},warn(){},error(...v){throw Error(v.join(' '));}},queueWhatsApp:async()=>{throw Error('unexpected text/LLM response');},
  };
  const handler=vm.runInNewContext(stripTypeScriptTypes(src.slice(ia,ib)+src.slice(a,b).replace('export ','')+';handleIncomingMessage',{mode:'transform'}),context);
  await handler(37,'212688959768',text);
  assert.equal(calls.length,1);assert.equal(calls[0][0],kind);assert.equal(calls[0][2],kind==='image'?'OWN_IMAGE':'OWN_VIDEO');
  assert.ok(logs.some(l=>l.role==='assistant'&&/^\[(IMAGE|VIDEO)\]/.test(l.message)));
 }
});

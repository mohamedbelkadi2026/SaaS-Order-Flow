import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {z} from 'zod';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const load=async p=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read(p),{mode:'transform'})).toString('base64'));
const core=await load('server/meta-whatsapp-core.ts');
const signup=await load('client/src/lib/meta-signup.ts');
const media=await load('server/meta-media.ts');
const {META_WHATSAPP_SCHEMA_SQL}=await load('server/meta-whatsapp-schema.ts');
const clean=source=>stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\n/gm,''),{mode:'transform'}).replace(/^export /gm,'');
test('signup joins OAuth and Coexistence events without requiring an omitted phone ID',()=>{
 const event={type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'999991'}};
 const result=signup.metaSignupResult(event);
 assert.equal(result.coexistence,true);assert.equal(result.phoneNumberId,undefined);
 for(const codeFirst of [true,false]){
  const attempt={nonce:'test',coexistence:false};
  Object.assign(attempt,codeFirst?{code:'oauth-code'}:result);
  assert.equal(signup.metaSignupReady(attempt),false);
  Object.assign(attempt,codeFirst?result:{code:'oauth-code'});
  assert.equal(signup.metaSignupReady(attempt),true);
  attempt.finishing=true;assert.equal(signup.metaSignupReady(attempt),false);
 }
 assert.equal(signup.metaSignupResult({...event,type:'untrusted'}),null);
 assert.equal(signup.metaSignupResult({...event,data:{waba_id:'invalid'}}),null);
 assert.equal(signup.metaSignupReady({code:'oauth-code',wabaId:'999991',coexistence:false}),false);
 const standard=signup.metaSignupResult({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'999991',phone_number_id:'111111'}});
 assert.equal(signup.metaSignupReady({...standard,code:'oauth-code'}),true);
});
test('signature, buttons, templates, phone normalization and delivery order',()=>{
 const raw=Buffer.from('{"object":"whatsapp_business_account"}'),secret='app-secret';
 const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(core.validMetaSignature(raw,signature,secret),true);
 assert.equal(core.validMetaSignature(Buffer.concat([raw,Buffer.from(' ')]),signature,secret),false);
 assert.equal(core.validMetaSignature(raw,'sha256=x',secret),false);
 assert.equal(core.validMetaSignature(raw,signature,''),false);
 assert.equal(core.metaPhone('06 12 34 56 78'),'212612345678');assert.throws(()=>core.metaPhone('123'));
 const buttons=core.metaInteractive('السلام عليكم');assert.equal(buttons.interactive.action.buttons.length,3);
 assert.equal(core.metaIncomingText({interactive:{button_reply:{id:'confirm'}}}),'تأكيد الطلب');
 assert.equal(core.metaIncomingText({button:{payload:'edit'}}),'تعديل المعلومات');
 assert.equal(core.metaIncomingText({button:{payload:'cancel'}}),'إلغاء الطلب');
 const template=core.metaTemplate(Array.from({length:8},(_,i)=>String(i)));
 assert.equal(template.template.components[0].parameters.length,8);assert.equal(template.template.components.length,4);
 assert.throws(()=>core.metaTemplate(['one']));
 assert.equal(core.nextMetaDeliveryStatus('read','sent'),'read');assert.equal(core.nextMetaDeliveryStatus('delivered','failed'),'delivered');
 assert.equal(core.nextMetaDeliveryStatus('failed','sent'),'failed');assert.equal(core.nextMetaDeliveryStatus('failed','delivered'),'delivered');
});

test('order template revisions preserve eight parameter meanings and reject unapproved or incompatible templates',()=>{
 const approved=text=>({status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text},{type:'BUTTONS',buttons:core.META_ORDER_BUTTONS.map(b=>({type:'QUICK_REPLY',text:b.text}))}]});
 for(const text of [core.META_ORDER_TEMPLATE_BODY,core.META_ORDER_TEMPLATE_BODY_LEGACY]){
  assert.deepEqual([...text.matchAll(/\{\{(\d+)\}\}/g)].map(m=>m[1]),['1','2','3','4','5','6','7','8']);
  const template=approved(text);assert.equal(core.usableMetaOrderTemplate(template),true);
  assert.equal(core.usableMetaOrderTemplate({...template,status:'REJECTED'}),false);
  assert.equal(core.usableMetaOrderTemplate({...template,category:'MARKETING'}),false);
 }
 assert.equal(core.usableMetaOrderTemplate(approved(core.META_ORDER_TEMPLATE_BODY.replace('{{6}}','{{7}}'))),false);
 const missing=approved(core.META_ORDER_TEMPLATE_BODY);missing.components[1].buttons.pop();
 assert.equal(core.usableMetaOrderTemplate(missing),false);
});

test('credential expiry is distinct from customer service windows and unknown is never permanent',()=>{
 const now=Date.parse('2026-11-05T12:00:00Z'), seconds=ms=>Math.floor(ms/1000);
 assert.equal(core.metaTokenMetadata({is_valid:true,expires_at:seconds(now-1000)},now).valid,false);
 assert.equal(core.metaTokenMetadata({is_valid:true,expires_at:0,data_access_expires_at:seconds(now-1000)},now).valid,false);
 assert.equal(core.metaTokenMetadata({is_valid:true,expires_at:0},now).expiresAt,null);
 assert.equal(core.metaTokenMetadata({is_valid:false,expires_at:seconds(now+100000)},now).valid,false);
 assert.equal(core.metaTokenMetadata({is_valid:true,expires_at:'never'},now).expiresAt,null);
 assert.equal(core.metaTokenMetadata({is_valid:true,expires_at:Infinity},now).expiresAt,null);
 assert.equal(core.metaConnectionHealth(null,now).state,'disconnected');
 assert.equal(core.metaConnectionHealth({active:true},now).state,'unknown');
 assert.equal(core.metaConnectionHealth({active:false,token_valid:true},now).state,'disconnected');
 assert.equal(core.metaConnectionHealth({active:true,token_valid:true},now).state,'verified');
 assert.equal(core.metaConnectionHealth({active:true,token_valid:false},now).state,'reconnect_required');
 assert.equal(core.metaConnectionHealth({active:true,token_valid:true,token_expires_at:new Date(now+86400000)},now).state,'expiring');
 assert.equal(core.metaConnectionHealth({active:true,token_valid:true,data_access_expires_at:new Date(now)},now).state,'reconnect_required');
 assert.equal(core.metaConnectionHealth({active:true,token_valid:true,token_expires_at:new Date(now+8*86400000)},now).state,'verified');
});

test('Cloud API isolation, 24-hour window, acknowledgement, failures, upload ownership and signed webhook dedupe',async()=>{
 const pg=new PGlite(),disk=await mkdtemp(path.join(tmpdir(),'meta-wa-'));
 try{
 await pg.exec('CREATE TABLE stores(id integer PRIMARY KEY);CREATE TABLE orders(id integer PRIMARY KEY);INSERT INTO stores VALUES(91),(92);INSERT INTO orders VALUES(1);');
 await pg.exec(META_WHATSAPP_SCHEMA_SQL);await pg.exec('CREATE TABLE ai_logs(id serial PRIMARY KEY,store_id int,order_id int,customer_phone text,role text,message text);');await pg.exec(META_WHATSAPP_SCHEMA_SQL);
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[],rowCount:0};const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows || r.rows.length};}};
 pool.connect=async()=>({...pool,release(){}});
 const requests=[];let rejected=false,grantedScopes=[],templateApproved=false,debugValid=true,debugExpiry=0;
 let phoneListOverride=null,coexistenceVerified=true;
 const graph=async(token,endpoint,options={})=>{
  requests.push({token,endpoint,options});
  if(rejected)throw new core.MetaApiError(190);
  if(endpoint.startsWith('debug_token'))return {data:{is_valid:debugValid,app_id:'123456',expires_at:debugExpiry,granular_scopes:grantedScopes}};
  if(endpoint.includes('/message_templates'))return {data:[{name:core.META_ORDER_TEMPLATE,language:'ar',status:templateApproved?'APPROVED':'PENDING',category:'UTILITY',components:[{type:'BODY',text:core.META_ORDER_TEMPLATE_BODY},{type:'BUTTONS',buttons:core.META_ORDER_BUTTONS.map(b=>({type:'QUICK_REPLY',text:b.text}))}]}]};
  if(endpoint==='oauth/access_token')return {access_token:'token-91'};
  if(endpoint==='111111?fields=is_on_biz_app,platform_type')return {is_on_biz_app:coexistenceVerified,platform_type:'CLOUD_API'};
  if(endpoint.endsWith('/register'))return {success:true};
  if(endpoint.includes('/phone_numbers'))return phoneListOverride || {data:[{id:token==='token-91'?'111111':'222222',display_phone_number:'+212600000000'}]};
  if(endpoint.endsWith('/subscribed_apps'))return {success:true};
  if(endpoint.endsWith('/media'))return {id:'333333'};
  return {messages:[{id:'wamid.'+requests.length}]};
 };
 const env={META_APP_ID:'123456',META_APP_SECRET:'secret',META_WEBHOOK_VERIFY_TOKEN:'verify',ENCRYPTION_KEY:'test-key',DATA_DIR:disk};
 const context={...core,...media,broadcastToStore(){},metaGraph:graph,pool,encrypt:x=>'encrypted:'+x,decrypt:x=>x.replace('encrypted:',''),process:{env,cwd:()=>disk},path,Date,URLSearchParams,
  readFile,stat:(await import('node:fs/promises')).stat,createHash,URL,FormData,Blob,Buffer,console};
 const service=vm.runInNewContext(clean(await read('server/meta-whatsapp-service.ts'))+'\n({getMetaConnection,saveMetaConnection,checkMetaConnection,sendMetaMessage,sendMetaOrderTemplate,sendMetaFile,queueMetaContent,flushMetaContent,metaTemplateSetup,prepareMetaOrderTemplate,refreshPendingMetaTemplates})',context);
 await service.saveMetaConnection(91,'999991','111111','token-91');await service.saveMetaConnection(92,'999992','222222','token-92');
 const sendsBeforeCheck=requests.filter(r=>r.endpoint.endsWith('/messages')).length;
 assert.equal((await service.checkMetaConnection(91)).state,'verified');
 debugValid=false;
 assert.equal((await service.checkMetaConnection(91)).state,'reconnect_required');
 assert.equal((await service.getMetaConnection(92)).token_valid,true); // tenant-local diagnostic
 rejected=true;
 await assert.rejects(()=>service.checkMetaConnection(92),/Réessayez sans remplacer/);
 assert.equal((await service.getMetaConnection(92)).token_valid,true); // a failing app-token call proves nothing about merchant auth
 rejected=false;debugValid=true;debugExpiry=Math.floor(Date.now()/1000)-1;
 await assert.rejects(()=>service.saveMetaConnection(91,'999991','111111','token-91'));
 assert.equal((await service.getMetaConnection(91)).token_valid,false); // failed save leaves saved credential untouched
 debugExpiry=Math.floor(Date.now()/1000)+86400;
 await service.saveMetaConnection(91,'999991','111111','token-91');
 assert.equal(core.metaConnectionHealth(await service.getMetaConnection(91)).state,'expiring');
 assert.equal((await service.getMetaConnection(91)).token_expires_at.getTime(),debugExpiry*1000);
 assert.equal(requests.filter(r=>r.endpoint.endsWith('/messages')).length,sendsBeforeCheck);
 debugExpiry=0;
 assert.equal((await service.getMetaConnection(91)).token_cipher,'encrypted:token-91');assert.equal(await service.getMetaConnection(93),null);
 await assert.rejects(()=>service.saveMetaConnection(92,'999991','111111','token-91'));
 const parameters=['Store','Test','212612345678','City','Address','Product','1','199'];
 const pending={};assert.equal(await service.sendMetaOrderTemplate(92,'0612345678',parameters,pending),false);assert.match(pending.error,/approuvé/);
 templateApproved=true;
 assert.equal(await service.sendMetaOrderTemplate(92,'0612345678',parameters),false); // approval alone is not consent
 await pool.query("INSERT INTO meta_whatsapp_consents(store_id,phone,source) VALUES(92,'212612345678','owner_test_consent')");
 assert.equal(await service.sendMetaOrderTemplate(92,'0612345678',parameters),true);
 assert.equal(requests.at(-1).options.body.type,'template');assert.equal(requests.at(-1).token,'token-92');
 const outcome={};assert.equal(await service.sendMetaMessage(91,'0612345678',{type:'text',text:{body:'hello'}},outcome),false);assert.match(outcome.error,/24 h/);
 await pool.query("INSERT INTO meta_whatsapp_windows VALUES(91,'212612345678',now())");
 const accepted={};assert.equal(await service.sendMetaMessage(91,'0612345678',{type:'text',text:{body:'hello'}},accepted),true);
 assert.ok(accepted.messageId);assert.equal((await pool.query('SELECT status FROM meta_whatsapp_messages')).rows[0].status,'accepted');
 assert.equal(requests.at(-1).token,'token-91');assert.equal(requests.at(-1).endpoint,'111111/messages');
 assert.equal(await service.sendMetaMessage(92,'0612345678',{type:'text',text:{body:'wrong-store'}}),false);
 await pool.query('UPDATE meta_whatsapp_connections SET active=false WHERE store_id=91');const before=requests.length;
 assert.equal(await service.sendMetaMessage(91,'0612345678',{type:'text',text:{body:'offline'}}),false);assert.equal(requests.length,before);
 await pool.query('UPDATE meta_whatsapp_connections SET active=true WHERE store_id=91');
 rejected=true;const failure={};assert.equal(await service.sendMetaMessage(91,'0612345678',{type:'text',text:{body:'expired'}},failure),false);assert.match(failure.error,/jeton/);rejected=false;
 assert.equal((await service.getMetaConnection(91)).token_valid,false);
 assert.equal((await service.getMetaConnection(92)).token_valid,true);
 await mkdir(path.join(disk,'uploads/whatsapp/91'),{recursive:true});await writeFile(path.join(disk,'uploads/whatsapp/91/test.jpg'),Buffer.from('image'));
 assert.equal(await service.sendMetaFile(91,'0612345678','/uploads/whatsapp/92/test.jpg','image.jpg',''),false);
 assert.equal(await service.sendMetaFile(91,'0612345678','/uploads/whatsapp/91/test.jpg','image.jpg',''),true);
 assert.ok(requests.some(r=>r.endpoint==='111111/media' && r.options.form instanceof FormData));
 await service.queueMetaContent(91,1,'0612345678','image','/uploads/whatsapp/91/test.jpg');await service.queueMetaContent(91,1,'0612345678','image','/uploads/whatsapp/91/test.jpg');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM meta_whatsapp_content_queue')).rows[0].n,1);
 await pool.query('DELETE FROM meta_whatsapp_windows WHERE store_id=91');
 const beforeFlush=requests.length;await service.flushMetaContent(91,'0612345678');
 assert.equal(requests.length,beforeFlush);
 assert.equal((await pool.query('SELECT state FROM meta_whatsapp_content_queue')).rows[0].state,'pending');
 await pool.query("INSERT INTO meta_whatsapp_windows VALUES(91,'212612345678',now())");
 await service.flushMetaContent(91,'0612345678');
 assert.equal((await pool.query('SELECT state FROM meta_whatsapp_content_queue')).rows[0].state,'accepted');
 assert.match((await pool.query('SELECT message FROM ai_logs')).rows[0].message,/^\[IMAGE\]/);
 const afterFlush=requests.length;await service.flushMetaContent(91,'0612345678');assert.equal(requests.length,afterFlush);

 // Mount real route code with a disabled worker, then exercise signed ingress.
 const mounted=new Map();const app={get:(url,...handlers)=>mounted.set('GET '+url,handlers.at(-1)),post:(url,...handlers)=>mounted.set('POST '+url,handlers.at(-1))};
 const routeContext={...context,...service,z,randomBytes,requireAuth(){},requireAdmin(){},broadcastToStore(){},setInterval:()=>({unref(){}})};
 const routes=vm.runInNewContext(clean(await read('server/meta-whatsapp-routes.ts'))+'\n({registerMetaWhatsappRoutes})',routeContext);routes.registerMetaWhatsappRoutes(app);
 // A test must target a different number, without adding consent or sending.
 const selfTest=mounted.get('POST /api/automation/meta/test');let selfStatus=200,selfBody;
 const selfBefore=requests.length;
 await selfTest({user:{storeId:91},body:{phone:'+212600000000',type:'template',consent:true}},{status(n){selfStatus=n;return this;},json(v){selfBody=v;return this;}});
 assert.equal(selfStatus,400);assert.match(selfBody.message,/autre numéro/);assert.equal(requests.length,selfBefore);
 env.META_EMBEDDED_SIGNUP_ENABLED='true';env.META_EMBEDDED_SIGNUP_CONFIG_ID='777777';
 const completion=mounted.get('POST /api/automation/meta/signup/complete');
 const nonce='a'.repeat(64);
 await pool.query("INSERT INTO meta_whatsapp_signup_states VALUES($1,91,10,now()+interval '10 minutes')",[nonce]);
 const complete=async(store,user,n=nonce,extra={})=>{let status=200,body;await completion({user:{storeId:store,id:user},body:{nonce:n,code:'valid-test-code',wabaId:'999991',phoneNumberId:'111111',pin:'123456',...extra}},{status(n){status=n;return this;},json(v){body=v;return this;},sendStatus(n){status=n;}});return {status,body};};
 assert.equal((await complete(92,10)).status,400);assert.equal((await complete(91,11)).status,400);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM meta_whatsapp_signup_states')).rows[0].n,1);
 assert.equal((await complete(91,10)).status,400); // no granted WABA scopes
 assert.equal(requests.filter(r=>r.endpoint==='111111/register').length,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM meta_whatsapp_signup_states')).rows[0].n,0);
 grantedScopes=['whatsapp_business_management','whatsapp_business_messaging'].map(scope=>({scope,target_ids:['999991']}));
 const nonce2='b'.repeat(64);await pool.query("INSERT INTO meta_whatsapp_signup_states VALUES($1,91,10,now()+interval '10 minutes')",[nonce2]);
 assert.equal((await complete(91,10,nonce2)).status,200);
 assert.equal((await complete(91,10,nonce2)).status,400); // nonce cannot be replayed
 assert.equal(requests.filter(r=>r.endpoint==='111111/register').length,1);
 env.META_EMBEDDED_SIGNUP_ENABLED='false';
 env.META_WHATSAPP_PILOT_STORE_IDS='92';
 env.META_EMBEDDED_SIGNUP_PILOT_STORE_IDS=' 91 ';
 const start=mounted.get('POST /api/automation/meta/signup/start');
 const startSignup=async(storeId)=>{
  let status=200,body;
  await start({user:{storeId,id:10}},{status(n){status=n;return this;},json(v){body=v;}});
  return {status,body};
 };
 assert.equal((await startSignup(92)).status,409);
 const pilotSignup=await startSignup(91);
 assert.equal(pilotSignup.status,200);
 assert.equal(pilotSignup.body.configId,'777777');
 assert.equal((await complete(92,10,pilotSignup.body.nonce)).status,409);
 assert.equal((await complete(91,10,pilotSignup.body.nonce)).status,200);
 const coexistenceSignup=await startSignup(91);
 const registrations=requests.filter(r=>r.endpoint==='111111/register').length;
 assert.equal((await complete(91,10,coexistenceSignup.body.nonce,{coexistence:true,pin:undefined})).status,200);
 assert.equal(requests.filter(r=>r.endpoint==='111111/register').length,registrations);

 // The real documented Coexistence event provides waba_id without a phone ID.
 const missingPhoneSignup=await startSignup(91);
 assert.equal((await complete(91,10,missingPhoneSignup.body.nonce,{coexistence:true,pin:undefined,phoneNumberId:undefined})).status,200);
 assert.equal((await service.getMetaConnection(91)).phone_number_id,'111111');
 assert.equal(requests.filter(r=>r.endpoint==='111111/register').length,registrations);
 const noId={coexistence:true,pin:undefined,phoneNumberId:undefined};
 for(const list of [{data:[]},{data:[{id:'111111'},{id:'222222'}]},{data:[{id:'111111'}],paging:{next:'next-page'}}]){
  phoneListOverride=list;const pending=await startSignup(91);
  assert.equal((await complete(91,10,pending.body.nonce,noId)).status,400);
  assert.equal((await service.getMetaConnection(91)).phone_number_id,'111111');
 }
 phoneListOverride=null;coexistenceVerified=false;
 const invalidCoexistence=await startSignup(91);
 assert.equal((await complete(91,10,invalidCoexistence.body.nonce,noId)).status,400);
 coexistenceVerified=true;
 const foreignPhone=await startSignup(91);
 assert.equal((await complete(91,10,foreignPhone.body.nonce,{...noId,phoneNumberId:'222222'})).status,400);
 assert.equal(requests.filter(r=>r.endpoint==='111111/register').length,registrations);

 delete env.META_EMBEDDED_SIGNUP_PILOT_STORE_IDS;
 assert.equal((await startSignup(91)).status,409);

 const handler=mounted.get('POST /api/meta/whatsapp/webhook');
 const deliver=async(body,valid=true)=>{const raw=Buffer.from(JSON.stringify(body));let code;await handler({rawBody:raw,headers:{'x-hub-signature-256':valid?'sha256='+createHmac('sha256','secret').update(raw).digest('hex'):'invalid'},body},{sendStatus(n){code=n;}});return code;};
 const event=(waba,number)=>({object:'whatsapp_business_account',entry:[{id:waba,changes:[{value:{metadata:{phone_number_id:number},messages:[{id:'inbound-1',from:'212612345678',timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{button_reply:{id:'confirm'}}}]}}]}]});
 // processMetaJobs is gated by ready(): omit app ID so ingress can be inspected before consumption.
 delete env.META_APP_ID;
 assert.equal(await deliver(event('999991','111111'),false),403);
 assert.equal(await deliver(event('999992','111111')),200);assert.equal((await pool.query('SELECT count(*)::int AS n FROM meta_whatsapp_inbox')).rows[0].n,0);
 assert.equal(await deliver(event('999991','111111')),200);assert.equal(await deliver(event('999991','111111')),200);
 const inbox=(await pool.query('SELECT * FROM meta_whatsapp_inbox')).rows;assert.equal(inbox.length,1);assert.equal(inbox[0].store_id,91);assert.equal(inbox[0].body,'تأكيد الطلب');
 const verification=mounted.get('GET /api/meta/whatsapp/webhook');let challenge;
 verification({query:{'hub.mode':'subscribe','hub.verify_token':'verify','hub.challenge':'123'}},{status:()=>({send:v=>challenge=v}),sendStatus(){}});assert.equal(challenge,'123');
 }finally{await pg.close();await rm(disk,{recursive:true,force:true});}
});

test('Graph transport sanitizes rejection and uncertain outcomes without retrying a POST',async()=>{
 const original=globalThis.fetch;let requests=0;
 try{
  globalThis.fetch=async()=>{requests++;return Response.json({error:{code:190,message:'private token detail'}},{status:400});};
  await assert.rejects(()=>core.metaGraph('secret','111111/messages',{method:'POST',body:{type:'text'}}),error=>error.code===190 && !error.uncertain && !error.message.includes('private'));
  assert.equal(requests,1);
  globalThis.fetch=async()=>{requests++;throw Error('socket failed secret');};
  await assert.rejects(()=>core.metaGraph('secret','111111/messages',{method:'POST',body:{type:'text'}}),error=>error.uncertain===true && !error.message.includes('secret'));
  assert.equal(requests,2);
  globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');return Response.json({access_token:'token'});};
  assert.equal((await core.metaGraph('','oauth/access_token',{method:'POST',encoded:new URLSearchParams({code:'test-code'})})).access_token,'token');
 }finally{globalThis.fetch=original;}
});

test('merchant setup submits once per WABA, tracks review in background and preserves a connection on setup failure',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE stores(id integer PRIMARY KEY);CREATE TABLE orders(id integer PRIMARY KEY);INSERT INTO stores VALUES(91),(92);');
  await pg.exec(META_WHATSAPP_SCHEMA_SQL);
  const pool={query:async(sql,args)=>{
   if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[],rowCount:0};
   const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};
  }};pool.connect=async()=>({...pool,release(){}});
  const templates=new Map(),requests=[];let failTemplates=false,incomplete=false;
  const approved=()=>({status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:core.META_ORDER_TEMPLATE_BODY},{type:'BUTTONS',buttons:core.META_ORDER_BUTTONS.map(b=>({type:'QUICK_REPLY',text:b.text}))}]});
  const graph=async(token,endpoint,options={})=>{
   requests.push({token,endpoint,options});
   if(endpoint.includes('/phone_numbers'))return {data:[{id:token==='token91'?'111111':'222222',display_phone_number:token==='token91'?'+212600000091':'+212600000092'}]};
   if(endpoint.endsWith('/subscribed_apps'))return {success:true};
   if(endpoint.includes('/message_templates')){
    if(failTemplates)throw new core.MetaApiError(100);
    const waba=endpoint.split('/')[0];
    if(options.method==='POST'){
     assert.equal(templates.has(waba),false,'must not create an existing template');
     assert.equal(options.body.category,'UTILITY');assert.equal(options.body.language,'ar');
     assert.equal(options.body.components[1].buttons.length,3);
     templates.set(waba,{...options.body,status:'PENDING'});return {id:'987654',status:'PENDING'};
    }
    return {data:templates.has(waba)?[templates.get(waba)]:[],...(incomplete?{paging:{next:'more'}}:{})};
   }
   throw Error('Unexpected Graph request '+endpoint);
  };
  const context={...core,pool,metaGraph:graph,encrypt:x=>'encrypted:'+x,decrypt:x=>x.replace('encrypted:',''),process:{env:{ENCRYPTION_KEY:'test'}},Date};
  const service=vm.runInNewContext(clean(await read('server/meta-whatsapp-service.ts'))+'\n({saveMetaConnection,getMetaConnection,metaTemplateSetup,prepareMetaOrderTemplate,refreshPendingMetaTemplates})',context);
  const a=await service.saveMetaConnection(91,'999991','111111','token91');
  assert.equal(a.template.status,'PENDING');assert.equal(a.template.ready,false);
  assert.equal((await service.getMetaConnection(91)).active,true);
  const posts=()=>requests.filter(r=>r.options.method==='POST'&&r.endpoint.endsWith('/message_templates'));
  assert.equal(posts().length,1);
  const beforeCache=requests.length;await service.prepareMetaOrderTemplate(91);await service.prepareMetaOrderTemplate(91,true);
  assert.equal(requests.length,beforeCache,'page polling and repeated clicks use the status cache');
  await service.saveMetaConnection(92,'999992','222222','token92');assert.equal(posts().length,2);
  assert.equal(posts()[1].token,'token92');
  templates.set('999991',{...templates.get('999991'),...approved()});
  await pool.query("UPDATE meta_whatsapp_connections SET template_checked_at=now()-interval '6 minutes' WHERE store_id=91");
  await service.refreshPendingMetaTemplates();
  assert.equal(service.metaTemplateSetup(await service.getMetaConnection(91)).ready,true,'approval is detected with the merchant page closed');
  assert.equal(service.metaTemplateSetup(await service.getMetaConnection(92)).ready,false,'other account remains pending');
  templates.set('999991',{...templates.get('999991'),status:'REJECTED'});
  await pool.query("UPDATE meta_whatsapp_connections SET template_checked_at=now()-interval '1 minute' WHERE store_id=91");
  assert.equal((await service.prepareMetaOrderTemplate(91,true)).status,'REJECTED');assert.equal(posts().length,2);
  templates.set('999991',{...templates.get('999991'),...approved(),category:'MARKETING'});
  await pool.query("UPDATE meta_whatsapp_connections SET template_checked_at=now()-interval '1 minute' WHERE store_id=91");
  assert.equal((await service.prepareMetaOrderTemplate(91,true)).status,'INCOMPATIBLE');
  failTemplates=true;
  const failed=await service.saveMetaConnection(91,'999993','111111','token91');
  assert.equal(failed.template.status,'ERROR');assert.equal((await service.getMetaConnection(91)).active,true);
  assert.equal((await service.getMetaConnection(91)).waba_id,'999993','new connection is retained even if template provisioning fails');
  failTemplates=false;incomplete=true;
  await pool.query("UPDATE meta_whatsapp_connections SET template_checked_at=now()-interval '1 minute' WHERE store_id=91");
  assert.equal((await service.prepareMetaOrderTemplate(91,true)).status,'ERROR');assert.equal(posts().length,2,'incomplete listing must not create a duplicate');
  await pool.query('UPDATE meta_whatsapp_connections SET active=false WHERE store_id=91');
  await assert.rejects(()=>service.prepareMetaOrderTemplate(91));
  assert.equal(requests.some(r=>r.endpoint.endsWith('/messages')||r.endpoint.endsWith('/register')),false,'setup neither messages customers nor registers the number');
 }finally{await pg.close();}
});

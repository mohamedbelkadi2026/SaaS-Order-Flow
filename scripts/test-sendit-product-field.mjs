import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=await readFile(new URL('../server/services/carrier-service.ts',import.meta.url),'utf8');
const start=source.indexOf('export async function createSenditParcel('),end=source.indexOf('export async function testSenditConnection(',start);
function setup(responses=[{status:200,data:{data:{code:'S-1',fee:35,label_url:'https://example.test/label'}}}]){
 const calls=[],logins=[];
 const fn=vm.runInNewContext(stripTypeScriptTypes(source.slice(start,end).replace('export async function','async function')+';createSenditParcel',{mode:'transform'}),{
 loginSendit:async(...args)=>{logins.push(args);return {token:'test-token'};},resolveSenditDistrict:async()=>123,
 sanitizePhone:p=>p,sanitizeArabicText:s=>s,SENDIT_API_BASE:'https://example.test/api/v1',SENDIT_DEFAULT_PICKUP_DISTRICT_ID:46,SSL_AGENT:{},invalidateSenditToken:()=>{},console:{log(){},warn(){}},
 axios:{post:async(url,payload,config)=>{calls.push({url,payload,config});return responses.shift();}},
 });
 return {fn,calls,logins};
}
const base={storeId:91,orderId:42,orderNumber:'ORDER-42',city:'Agadir',customerName:'Client',phone:'0600000000',address:'Adresse',totalPrice:19900,productName:'منظم الملابس | Pack 2',canOpen:true};
const account={id:5,apiKey:'test-public',apiSecret:'test-secret'};
test('product designation goes to products and the delivery note stays separate',async()=>{
 const {fn,calls}=setup();const result=await fn({...base,note:'Appeler avant livraison'},account);
 assert.equal(result.trackingNumber,'S-1');assert.equal(result.deliveryFee,3500);assert.equal(result.labelUrl,'https://example.test/label');
 const p=calls[0].payload;assert.equal(p.products,base.productName);assert.equal(p.comment,'Appeler avant livraison');
 assert.equal(p.amount,199);assert.equal(p.district_id,123);assert.equal(p.pickup_district_id,46);
 assert.equal(p.products_from_stock,0);assert.equal(p.allow_open,0);assert.equal(p.allow_try,1);assert.equal(p.option_exchange,0);
 assert.equal(p.reference,base.orderNumber);assert.equal(p.name,base.customerName);assert.equal(p.address,base.address);assert.equal(p.phone,base.phone);
});
test('without a note, product still populates products without creating a comment',async()=>{
 const {fn,calls}=setup();await fn(base,account);assert.equal(calls[0].payload.products,base.productName);assert.equal('comment' in calls[0].payload,false);
});
test('token retry reuses the corrected payload and existing pickup settings',async()=>{
 const {fn,calls,logins}=setup([{status:401,data:{}},{status:200,data:{data:{code:'S-2'}}}]);
 const result=await fn({...base,productName:'  T-shirt M x2 | Casquette x1  ',note:'Note'}, {...account,settings:{senditPickupDistrictId:99}});
 assert.equal(result.trackingNumber,'S-2');assert.equal(calls.length,2);assert.equal(logins.length,2);
 assert.equal(calls[0].payload,calls[1].payload);assert.equal(calls[1].payload.products,'T-shirt M x2 | Casquette x1');assert.equal(calls[1].payload.pickup_district_id,99);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=await readFile('client/src/App.tsx','utf8');
const a=source.indexOf('function useOrderStatusSSE()');
const b=source.indexOf('function ProtectedRoutes()',a);
const code=stripTypeScriptTypes(source.slice(a,b),{mode:'transform'});
function mount(user){
 const handlers=new Map();let connected=0,refresh=0,closed=0;
 vm.runInNewContext(code+'\nuseOrderStatusSSE()',{
  useAuth:()=>({user}),useEffect:fn=>fn(),queryClient:{setQueriesData(){}},
  scheduleOrderRefresh:()=>refresh++,
  EventSource:class{constructor(){connected++}addEventListener(name,fn){handlers.set(name,fn)}close(){closed++}},
 });
 return {handlers,get connected(){return connected},get refresh(){return refresh}};
}
test('agents without verified-email flags receive Sendit completion updates',()=>{
 const t=mount({id:42,role:'agent',isEmailVerified:0});
 assert.equal(t.connected,1);
 const send=d=>t.handlers.get('shipping_progress')({data:JSON.stringify(d)});
 send({provider:'sendit',complete:false});assert.equal(t.refresh,0);
 send({provider:'sendit',complete:true});assert.equal(t.refresh,1);
 send({provider:'ozon',complete:true});assert.equal(t.refresh,1);
 t.handlers.get('ORDER_STATUS_UPDATED')({data:JSON.stringify({orderId:123,status:'Attente De Ramassage'})});
 assert.equal(t.refresh,2);
});
test('unverified owners stay gated; verified admins and owners retain live updates',()=>{
 assert.equal(mount(null).connected,0);
 assert.equal(mount({role:'owner',isEmailVerified:0}).connected,0);
 for(const user of [{role:'owner',isEmailVerified:1},{role:'admin'},{role:'owner',isSuperAdmin:true}])assert.equal(mount(user).connected,1);
});
test('order queries bypass browser HTTP cache after dispatch while retaining React Query caching',async()=>{
 const hooks=await readFile('client/src/hooks/use-store-data.ts','utf8');
 for(const name of ['useFilteredOrders','useAllOrders']){
  const start=hooks.indexOf('export function '+name+'('),end=hooks.indexOf('\nexport function ',start+1);
  const code=stripTypeScriptTypes(hooks.slice(start,end).replace('export ',''),{mode:'transform'});
  let query,request;
  vm.runInNewContext(code+'\n'+name+'({status:"confirme"})',{
   URLSearchParams,useQuery:q=>{query=q},fetch:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({orders:[]})}},
  });
  await query.queryFn();assert.equal(request.options.cache,'no-store');assert.equal(request.options.credentials,'include');
 }
});

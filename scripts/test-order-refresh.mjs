import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(await readFile(new URL('../client/src/lib/order-refresh.ts',import.meta.url),'utf8'),{mode:'transform'});
const {scheduleOrderRefresh}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const drain=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fake(){let active=0,calls=[],resolvers=[];return {calls,resolvers,setActive:v=>active=v,isFetching:()=>active,invalidateQueries(filter,options){calls.push({filter,options});return new Promise(resolve=>resolvers.push(resolve));},finish(){active=0;resolvers.splice(0).forEach(r=>r());}};}
test('many realtime subscribers share one bounded batch and never cancel active reads',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const client=fake();
 for(let i=0;i<200;i++)scheduleOrderRefresh(client);
 assert.equal(client.calls.length,0);t.mock.timers.tick(500);assert.equal(client.calls.length,7);
 assert.ok(client.calls.every(c=>c.options.cancelRefetch===false&&c.filter.refetchType==='active'));
 client.finish();await drain();t.mock.timers.tick(500);assert.equal(client.calls.length,7);
});
test('changes during a request guarantee exactly one final fresh batch',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const client=fake();scheduleOrderRefresh(client);t.mock.timers.tick(500);
 for(let i=0;i<200;i++)scheduleOrderRefresh(client);
 t.mock.timers.tick(5000);assert.equal(client.calls.length,7);
 client.finish();await drain();t.mock.timers.tick(500);assert.equal(client.calls.length,14);
 client.finish();await drain();t.mock.timers.tick(5000);assert.equal(client.calls.length,14);
});
test('a request that predates an event is allowed to finish before a final reread',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const client=fake();client.setActive(1);
 scheduleOrderRefresh(client);t.mock.timers.tick(500);client.finish();await drain();
 t.mock.timers.tick(500);assert.equal(client.calls.length,14);client.finish();await drain();
});

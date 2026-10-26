import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pglite';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const time=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('shared/morocco-time.ts'),{mode:'transform'})).toString('base64'));
const src=stripTypeScriptTypes(await read('server/team-performance-routes.ts'),{mode:'transform'}).replace(/^import .*;\n/gm,'').replaceAll('export ','');
const readActivity=vm.runInNewContext(src+';readTeamActivity',{sql,...time});
test('current pool reconciles 13 new orders while confirmations count the actor and action day only',async()=>{
 const pg=new PGlite(),db=drizzle(pg);try{
 await pg.exec(`CREATE TABLE orders(id int,store_id int,magasin_id int,assigned_to_id int,status text);
 CREATE TABLE order_follow_up_logs(id serial,order_id int,agent_id int,note text,created_at timestamp);
 INSERT INTO orders SELECT i,91,10,CASE WHEN i<=5 THEN 7 ELSE NULL END,'nouveau' FROM generate_series(1,13) i;
 INSERT INTO orders VALUES(20,91,10,8,'delivered'),(21,91,11,8,'confirme'),(22,92,10,7,'confirme');`);
 const add=(order,actor,from,to,date)=>pg.query("INSERT INTO order_follow_up_logs(order_id,agent_id,note,created_at) VALUES($1,$2,$3,($4::timestamp AT TIME ZONE 'Africa/Casablanca') AT TIME ZONE 'UTC')",[order,actor,`Statut: "${from}" → "${to}"`,date]);
 await add(20,7,'rappel','confirme','2026-10-26 00:10');
 await add(20,8,'nouveau','confirme','2026-10-26 12:00');
 await add(20,7,'confirme','confirme_reporte','2026-10-26 12:30');
 await add(21,8,'nouveau','confirme','2026-10-26 14:00');
 await add(22,7,'nouveau','confirme','2026-10-26 14:00');
 await add(1,null,'nouveau','confirme','2026-10-26 14:00');
 await add(2,7,'nouveau','confirme','2026-10-27 00:00');
 const result=await readActivity(db,91,'2026-10-26',10);
 assert.equal(result.pool.reduce((n,r)=>n+r.nouveaux,0),13);
 assert.equal(result.pool.find(r=>r.agentId===null).nouveaux,8);
 assert.equal(result.pool.find(r=>r.agentId===7).nouveaux,5);
 assert.deepEqual(result.activity,[{agentId:7,confirmedToday:1}]);
 // Reassigning and later delivery edits cannot transfer the day's credit.
 await pg.exec("UPDATE orders SET assigned_to_id=8,status='retourné' WHERE id=20");
 assert.deepEqual((await readActivity(db,91,'2026-10-26',10)).activity,result.activity);
 assert.equal((await readActivity(db,91,'2026-10-26',null)).activity.length,2);
 assert.equal((await readActivity(db,91,'2026-10-26',10,[])).pool.length,0);
 assert.equal((await readActivity(db,91,'2026-10-26',10,[8])).activity.length,0);
 assert.equal((await readActivity(db,91,'2026-10-27',10)).activity[0].confirmedToday,1);
 }finally{await pg.close();}
});

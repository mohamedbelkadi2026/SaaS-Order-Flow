import {db} from '../db';
import {orders,carrierAccounts} from '@shared/schema';
import {and,eq,sql,gt,asc} from 'drizzle-orm';
import {storage} from '../storage';
import {broadcastToStore} from '../sse';
import {LivcashClient,readLivcashTracking} from '../integrations/livcash';

const runningAccounts=new Set<number>();
export function livcashAccountMatches(order:{carrierId:number|null},account:{id:number},soleAccount:boolean) {
  return order.carrierId===account.id || (order.carrierId==null && soleAccount);
}
/** Read-only carrier calls. Store/account boundaries apply to every lookup. */
export async function syncLivcash(storeId?:number) {
  const accounts=await db.select().from(carrierAccounts).where(and(
    eq(carrierAccounts.carrierName,'livcash'),storeId ? eq(carrierAccounts.storeId,storeId) : undefined,
  ));
  const active=accounts.filter(a=>a.isActive!==0 && a.apiKey?.trim());
  let synced=0,updated=0,failed=0,busy=0;
  for(const account of active) {
    if(runningAccounts.has(account.id)){busy++;continue;}
    runningAccounts.add(account.id);
    try {
      const sole=active.filter(a=>a.storeId===account.storeId).length===1;
      const cursorResult=await db.execute(sql`SELECT last_order_id FROM livcash_sync_cursors WHERE account_id=${account.id}`);
      const cursor=Number((cursorResult as any).rows?.[0]?.last_order_id || 0);
      const selectPage=(after:number)=>db.select().from(orders).where(and(
        eq(orders.storeId,account.storeId),eq(orders.shippingProvider,'livcash'),gt(orders.id,after),
        sql`NULLIF(TRIM(${orders.trackNumber}),'') IS NOT NULL`,
        sql`${orders.status} NOT IN ('delivered','retourné','returned')`,
        sole ? sql`(${orders.carrierId}=${account.id} OR ${orders.carrierId} IS NULL)` : eq(orders.carrierId,account.id),
      )).orderBy(asc(orders.id)).limit(50);
      let page=await selectPage(cursor);
      if(!page.length && cursor>0)page=await selectPage(0);
      const client=new LivcashClient(account.apiKey);
      let last=cursor;
      for(const order of page) {
        last=order.id;
        try {
          const state=readLivcashTracking(await client.track(order.trackNumber!),order.trackNumber!);
          synced++;
          if(!state){failed++;continue;}
          // Re-read after network IO: do not overwrite a reassigned order's status.
          const [current]=await db.select().from(orders).where(and(eq(orders.id,order.id),eq(orders.storeId,account.storeId)));
          if(!current || current.shippingProvider!=='livcash' || current.trackNumber!==order.trackNumber || !livcashAccountMatches(current,account,sole))continue;
          const changedRaw=current.commentStatus!==state.raw;
          const changedStatus=!!state.status && current.status!==state.status;
          if(changedStatus)await storage.updateOrderStatus(order.id,state.status!);
          if(changedRaw || current.carrierId==null)await storage.updateOrder(order.id,{commentStatus:state.raw,carrierId:account.id});
          if(changedRaw || changedStatus) {
            updated++;
            await storage.createOrderFollowUpLog({orderId:order.id,agentId:null,agentName:'Livcash',note:`Livcash : ${state.raw}${state.status ? ' → '+state.status : ''}`});
            broadcastToStore(account.storeId,'order_updated',{orderId:order.id,status:state.status || current.status,commentStatus:state.raw});
          }
        } catch(error:any) {
          failed++;
          if(error?.status===401 || error?.status===403)break;
        }
      }
      await db.execute(sql`INSERT INTO livcash_sync_cursors(account_id,last_order_id) VALUES(${account.id},${last}) ON CONFLICT(account_id) DO UPDATE SET last_order_id=EXCLUDED.last_order_id,updated_at=now()`);
    } catch {failed++;console.warn('[LIVCASH-SYNC] Account sync failed',{accountId:account.id,storeId:account.storeId});}
    finally {runningAccounts.delete(account.id);}
  }
  return {synced,updated,failed,busy,message:`${synced} colis vérifié(s), ${updated} mise(s) à jour, ${failed} réponse(s) non exploitable(s).${busy ? ' Une synchronisation est déjà en cours.' : ''}`};
}

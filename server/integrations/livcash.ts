/** Official contract: https://clients.livcash.ma/api.html
 * Fixed HTTPS endpoint, multipart form token, add/track only. Never retry add.
 */
export const LIVCASH_ENDPOINT = 'https://clients.livcash.ma/api-parcels';
export class LivcashError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class LivcashClient {
  constructor(private token: string) {
    this.token = token.trim();
    if (!this.token) throw new LivcashError(400, 'Token Livcash manquant.');
  }
  async request(action: 'add' | 'track', values: Record<string,string|number>): Promise<any> {
    const body = new FormData();
    body.set('token',this.token); body.set('action',action);
    for (const [key,value] of Object.entries(values)) body.set(key,String(value));
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(LIVCASH_ENDPOINT,{method:'POST',headers:{Accept:'application/json'},body,signal:controller.signal});
      let data: any;
      try { data=await response.json(); } catch { throw new LivcashError(502,'Livcash : réponse non JSON. Vérifiez le colis avant de réessayer.'); }
      if (!response.ok) throw new LivcashError(response.status,`Livcash HTTP ${response.status}.`);
      return data;
    } catch(error) {
      if(error instanceof LivcashError) throw error;
      throw new LivcashError(502,'Livcash indisponible. Vérifiez le colis avant de réessayer.');
    } finally {clearTimeout(timer);}
  }
  track(tracking: string) { return this.request('track',{tracking}); }
  create(fields: Record<string,string|number>) { return this.request('add',fields); }
}
export function mapLivcashStatus(raw: string): string|null {
  const key=raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const map: Record<string,string>={
    'livre':'delivered','livree':'delivered','delivered':'delivered',
    'refuse':'refused','refusee':'refused','refused':'refused',
    'retourne':'retourné','retournee':'retourné','returned':'retourné','retour recu':'retourné',
    'en cours de retour':'RETOUR READY','retour en cours':'RETOUR READY','return pending':'RETOUR READY',
    'attente de ramassage':'Attente De Ramassage','en attente':'Attente De Ramassage','pending':'Attente De Ramassage',
    'ramasse':'in_progress','picked up':'in_progress','en cours':'in_progress','en transit':'transit','transit':'transit',
    'en cours de livraison':'transit','mise en distribution':'transit','out for delivery':'transit',
    'reporte':'in_progress','programme':'in_progress','postponed':'in_progress',
    'injoignable':'unreachable','unreachable':'unreachable','annule':'refused','annulee':'refused','cancelled':'refused','canceled':'refused',
  };
  return map[key] || null;
}
/** Tracking response format is not specified by the public docs. Accept only
 * an actual string stage; a boolean status is an API acknowledgement, never delivery.
 */
export function readLivcashTracking(response:any,tracking:string): {raw:string;status:string|null}|null {
  if (!response || response.status===false || response.success===false) return null;
  function visit(node:any,depth=0,inArray=false):string|null {
    if(!node || typeof node!=='object' || depth>4 || node.status===false || node.success===false)return null;
    if(Array.isArray(node)){for(const item of node){const raw=visit(item,depth+1,true);if(raw)return raw;}return null;}
    const reference=node.tracking ?? node.tracking_number ?? node.sku;
    if(reference!=null && String(reference).trim()!==tracking)return null;
    for(const key of ['data','parcel','result']) {const raw=visit(node[key],depth+1,inArray && reference==null);if(raw)return raw;}
    if(inArray && reference==null)return null;
    for(const key of ['statut','etat','parcel_status','status_text','status']) {
      const raw=node[key];
      if(typeof raw==='string' && raw.trim() && !/^(true|false|success|ok|error|failed)$/i.test(raw.trim())) return raw.trim();
    }
    return null;
  }
  const raw=visit(response);return raw?{raw,status:mapLivcashStatus(raw)}:null;
}
export function livcashTrackingCode(storeId:number,orderId:number): string {
  if(!Number.isSafeInteger(storeId)||storeId<=0||!Number.isSafeInteger(orderId)||orderId<=0)throw new LivcashError(400,'Référence Livcash invalide.');
  return `TG${storeId}-${orderId}`;
}

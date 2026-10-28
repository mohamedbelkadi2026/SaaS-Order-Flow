// Internal English codes and exact carrier labels; never infer a refusal
// from a free-text reason, nor from a confirmation agent's Annulé (fake).
export const CARRIER_REFUSAL_CODES = ['cancelled','canceled','rejected','refused','refuse','annule'];
export function isCarrierRefusal(order:{status?:string|null;commentStatus?:string|null;shippingProvider?:string|null;carrierName?:string|null;trackNumber?:string|null}):boolean {
 if(!order.trackNumber?.trim() || !(order.shippingProvider || order.carrierName)?.trim())return false;
 const norm=(s:string)=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const status=norm(order.status || ''),raw=norm((order.commentStatus || '').split(' | ')[0]);
 if(status.startsWith('annule (') || status==='annule par client')return false;
 return CARRIER_REFUSAL_CODES.includes(status) || CARRIER_REFUSAL_CODES.includes(raw);
}

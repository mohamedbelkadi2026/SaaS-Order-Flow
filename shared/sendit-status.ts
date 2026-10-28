// Sendit's public WooCommerce integration documents these parcel codes.
// Display labels stay distinct even when operational stages share a lifecycle.
const states: Record<string, {label:string; status:string}> = {
 PENDING:{label:'En attente',status:'confirme'},
 TO_PREPARE:{label:'À préparer',status:'confirme'},
 NEW_DESTINATION:{label:'À changer',status:'confirme'},
 TOPICKUP:{label:'Ramassage en cours',status:'in_progress'},
 PICKEDUP:{label:'Ramassé',status:'in_progress'},
 WAREHOUSE:{label:'Entrepôt',status:'in_progress'},
 TRANSIT:{label:'En transit',status:'transit'},
 DISTRIBUTED:{label:'Distribué',status:'transit'},
 DELIVERING:{label:'En cours de livraison',status:'transit'},
 UNREACHABLE:{label:'Injoignable',status:'unreachable'},
 POSTPONED:{label:'Reporté',status:'confirme_reporte'},
 DELIVERED:{label:'Livré',status:'delivered'},
 CANCELED:{label:'Annulé',status:'cancelled'},
 REJECTED:{label:'Refusé',status:'refused'},
 RETURNED:{label:'Retourné',status:'retourné'},
};
const norm=(s:string)=>s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');
const aliases:Record<string,string>={TO_PICKUP:'TOPICKUP',PICKED_UP:'PICKEDUP',CANCELLED:'CANCELED',IN_TRANSIT:'TRANSIT',RETURN:'RETURNED',RETOUR:'RETURNED'};
export function readSenditStatus(raw: unknown): {label:string;status:string} | null {
 if(typeof raw !== 'string')return null;
 const key=norm(raw),canonical=aliases[key] || key;
 return states[canonical] || Object.values(states).find(s=>norm(s.label)===key) || null;
}
export function senditOrderStatusText(order: {shippingProvider?:string|null;carrierName?:string|null;commentStatus?:string|null;status?:string|null}): string {
 const raw=order.commentStatus || order.status || '';
 const provider=(order.shippingProvider || order.carrierName || '').trim().toLowerCase();
 if(provider!=='sendit')return raw;
 // Preserve reason text after the status, used by the order cards.
 const [head,...tail]=raw.split(' | '),label=readSenditStatus(head)?.label;
 return label ? [label,...tail].join(' | ') : raw;
}

export function senditWebhookFields(body:any) {
 const root=body && typeof body==='object' ? body : {};
 const nested=root.data && typeof root.data==='object' ? root.data : root.payload && typeof root.payload==='object' ? root.payload : {};
 const status=root.newStatus || root.new_status || root.status || nested.newStatus || nested.new_status || nested.status;
 const code=root.code || root.tracking_number || nested.code || nested.tracking_number;
 const reference=root.reference || nested.reference;
 return { code: typeof code==='string' || typeof code==='number' ? String(code).trim() : '',
   reference:typeof reference==='string' || typeof reference==='number' ? String(reference).trim() : '',
   newStatus:typeof status==='string' && status!=='delivery.status.update' ? status.trim() : '' };
}

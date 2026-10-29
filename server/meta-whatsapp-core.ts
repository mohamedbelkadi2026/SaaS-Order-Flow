import { createHmac, timingSafeEqual } from 'node:crypto';

export const META_ORDER_TEMPLATE = 'tajergrow_order_confirmation';
export const META_ORDER_TEMPLATE_BODY = `السلام عليكم، معاك فريق الدعم ديال {{1}} باش نأكدو معاك الطلب ديالك.
السمية: {{2}}
الهاتف: {{3}}
المدينة: {{4}}
العنوان: {{5}}
المنتج: {{6}}
الكمية: {{7}}
المجموع: {{8}} درهم — الدفع عند الاستلام.
واش نأكدو ليك الطلب؟`;
export const META_ORDER_BUTTONS = [
  { id: 'confirm', text: 'تأكيد الطلب' },
  { id: 'edit', text: 'تعديل المعلومات' },
  { id: 'cancel', text: 'إلغاء الطلب' },
];
export function metaPhone(value: string): string {
  const digits = String(value).replace(/\D/g, '');
  const phone = /^0\d{9}$/.test(digits) ? '212' + digits.slice(1) : digits;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Numéro WhatsApp invalide.');
  return phone;
}
export function validMetaSignature(raw: Buffer, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export function metaInteractive(body: string, buttons = META_ORDER_BUTTONS, header?: string, footer?: string) {
  return { type: 'interactive', interactive: { type: 'button',
    ...(header ? { header: { type: 'text', text: header.slice(0,60) } } : {}),
    body: { text: body.slice(0,1024) }, ...(footer ? { footer: { text: footer.slice(0,60) } } : {}),
    action: { buttons: buttons.slice(0,3).map(b => ({ type: 'reply', reply: { id: b.id, title: b.text.slice(0,20) } })) },
  } };
}
export function metaTemplate(parameters: string[], name = META_ORDER_TEMPLATE, language = 'ar') {
  if (parameters.length !== 8) throw new Error('Le modèle de confirmation attend huit informations.');
  return { type:'template', template:{ name, language:{code:language}, components:[
    {type:'body',parameters:parameters.map(text=>({type:'text',text:String(text || '—').replace(/[\r\n\t]+/g,' ').slice(0,500)}))},
    ...META_ORDER_BUTTONS.map((b,i)=>({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload:b.id}]})),
  ]} };
}
export function usableMetaOrderTemplate(template:any):boolean {
 const body=template?.components?.find((c:any)=>c.type==='BODY');
 const buttons=template?.components?.find((c:any)=>c.type==='BUTTONS')?.buttons;
 return template?.status==='APPROVED' && template?.category==='UTILITY' &&
  body?.text?.trim()===META_ORDER_TEMPLATE_BODY.trim() && Array.isArray(buttons) && buttons.length===3 &&
  META_ORDER_BUTTONS.every((button,i)=>buttons[i]?.type==='QUICK_REPLY' && buttons[i]?.text===button.text);
}
export function metaIncomingText(message: any): string | null {
  if (message?.type === 'text') return typeof message.text?.body === 'string' ? message.text.body : null;
  const reply = message?.interactive?.button_reply || message?.interactive?.list_reply;
  const id = reply?.id || message?.button?.payload;
  const button = META_ORDER_BUTTONS.find(b=>b.id===id);
  return button?.text || reply?.title || message?.button?.text || null;
}
export function nextMetaDeliveryStatus(current: string, incoming: string): string {
  const rank: Record<string,number> = {accepted:0,sent:1,delivered:2,read:3};
  if (incoming === 'failed') return (rank[current] ?? 0) >= 2 ? current : 'failed';
  if (!(incoming in rank)) return current;
  if (current === 'failed' && rank[incoming] < 2) return current;
  return rank[incoming] >= (rank[current] ?? 0) ? incoming : current;
}
export class MetaApiError extends Error {
  constructor(public code: number, public uncertain = false) {
    super(code === 131047 ? 'La fenêtre WhatsApp de 24 h est fermée. Utilisez un modèle approuvé.' :
      code === 190 ? 'Le jeton Meta a expiré ou a été révoqué. Reconnectez ce compte.' :
      code === 131026 ? 'WhatsApp ne peut pas livrer ce message au destinataire.' :
      code === 132000 || code === 132001 ? 'Modèle Meta absent ou paramètres incompatibles.' :
      uncertain ? 'Meta n’a pas confirmé l’envoi. Vérifiez le journal avant de réessayer.' : `Meta a refusé la requête (code ${code}).`);
  }
}
export function metaGraphVersion(): string {
  const version = process.env.META_GRAPH_API_VERSION || 'v24.0';
  if (!/^v\d+\.0$/.test(version)) throw new Error('Version Graph API invalide.');
  return version;
}
export async function metaGraph(token: string, endpoint: string, options: {method?:string;body?:unknown;form?:FormData;encoded?:URLSearchParams} = {}) {
  // Endpoint IDs are validated by callers; all requests stay on Meta's host.
  const method = options.method || 'GET';
  let response: Response;
  try { response = await fetch(`https://graph.facebook.com/${metaGraphVersion()}/${endpoint}`, {
    method, headers:{...(token ? {Authorization:`Bearer ${token}`} : {}),...(options.encoded ? {'Content-Type':'application/x-www-form-urlencoded'} : !options.form && options.body ? {'Content-Type':'application/json'} : {})},
    ...(options.encoded ? {body:options.encoded} : options.form ? {body:options.form} : options.body ? {body:JSON.stringify(options.body)} : {}),
    signal:AbortSignal.timeout(options.form ? 120000 : 25000),
  }); } catch { throw new MetaApiError(0,method==='POST'); }
  const result = await response.json().catch(()=>null);
  if (!response.ok || result?.error) throw new MetaApiError(Number(result?.error?.code || response.status),response.status>=500 && method==='POST');
  return result;
}

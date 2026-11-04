const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f]/g,'').toLowerCase().replace(new RegExp("[^\\p{L}\\p{N}]+","gu"),' ').trim();
export function mediaRequest(message:string):'image'|'video'|'audio'|null {
 const s=norm(message);
 if(new RegExp("(?:^| )(?:video|videos|فيديو|الفيديو)(?: |$)","u").test(s))return 'video';
 if(new RegExp("(?:^| )(?:audio|vocal|vocale|voice|sawt|sout|صوت|الصوت|صوتية|اوديو)(?: |$)","u").test(s))return 'audio';
 if(new RegExp("(?:^| )(?:tswira|tswra|taswira|swira|tsawer|tsawr|soura|photo|photos|pic|pics|pictures|image|images|صور|الصور|صورة|الصورة|تصويرة|التصويرة|تصاور)(?: |$)","u").test(s))return 'image';
 return null;
}
export function explicitConfirmation(message:string):boolean {
 const s=norm(message);
 if(mediaRequest(message) || /[?؟]/.test(message) || new RegExp("(?:^| )(?:لا|ماشي|non|not|no|wach|واش|شنو|كيفاش|فين)(?: |$)","u").test(s))return false;
 return new RegExp("^(?:تأكيد الطلب|تاكيد الطلب|نعم|اه|آه|واخا|واخا اكد|صافي اكد|اكد الطلب|اكد ليا الطلب|oui|yes|ok|okay|ah|wakha|confirmer|confirm|je confirme|je confirme la commande|اوافق)(?: (?:شكرا|merci|svp))?$","u").test(s);
}
export function explicitProductSwitch(message:string,target?:string|null):boolean {
 if(mediaRequest(message))return false;
 const text=norm(message);
 if(target && !text.includes(norm(target)))return false;
 return /(?:بدل المنتج|نبدل المنتج|تغيير المنتج|بغيت نطلب|بغيت ناخد|changer le produit|remplacer le produit|je veux commander)/i.test(text)
   || (!!target && /(?:بدل|نبدل|changer|remplacer|bdel|bdl)/i.test(text));
}
type Info={name:string|null;city:string|null;address:string|null;phone:string|null};
/** Model proposals are untrusted. Only exact values from the current customer
 * message may become delivery fields; existing site data needs an explicit edit. */
export function validatedDeliveryInfo(message:string,proposed:Info,current:Info,knownCities:string[],lastQuestion=''):Info {
 const empty:Info={name:null,city:null,address:null,phone:null};
 if(mediaRequest(message) || message.length>600)return empty;
 const text=norm(message),question=norm(lastQuestion);
 const requestedEdit=/(?:بدل|نبدل|تغيير|تصحيح|صحح|changer|modifier|corriger|bdel|bdl)/i.test(text);
 const isQuestion=/[?؟]/.test(message) || /(?:^| )(?:واش|wach|هل|شنو|فين|quelle|quel|comment|combien)(?: |$)/i.test(text);
 if(isQuestion && !requestedEdit)return empty;
 const citySet=new Set(knownCities.map(norm));
 const labels:Record<keyof Info,RegExp>={name:new RegExp("(?:الاسم|السمية|سميتي|nom|name)","u"),city:new RegExp("(?:المدينة|مدينتي|مدينة|ville|city)","u"),address:new RegExp("(?:العنوان|عنواني|عنوان|adresse|address|حي|شارع)","u"),phone:new RegExp("(?:الهاتف|رقمي|تليفون|telephone|phone|numero)","u")};
 const result={...empty};
 for(const field of ['name','city','address','phone'] as const){
  const raw=proposed[field];if(typeof raw!=='string')continue;
  const value=raw.trim(),key=norm(value);if(!key || value.length>(field==='address'?250:80))continue;
  if(field!=='phone' && !(` ${text} `).includes(` ${key} `))continue;
  if(field==='city' && !citySet.has(key))continue;
  if(field==='name' && !new RegExp("^[\\p{L}\\s'-]{2,80}$","u").test(value))continue;
  if(current[field] && (!labels[field].test(text) || (!requestedEdit && !/[:：=]/.test(message))))continue;
  if(!current[field] && field!=='city' && !labels[field].test(text) && !labels[field].test(question))continue;
  if(field==='phone'){
   const phone=(s:string)=>{const n=s.replace(/\D/g,'');return /^0[67]\d{8}$/.test(n)?'212'+n.slice(1):n;};
   const numbers=message.match(/(?:\+?212|00212|0)[67](?:[\s.-]*\d){8}\b/g)||[];
   if(!/^212[67]\d{8}$/.test(phone(value)) || !numbers.some(n=>phone(n.replace(/^00212/,'212'))===phone(value)))continue;
  }
  result[field]=value;
 }
 return result;
}

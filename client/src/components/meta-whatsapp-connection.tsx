import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import {useToast} from '@/hooks/use-toast';
import {CheckCircle2,Link2,Loader2,ShieldCheck,Send,RefreshCw} from 'lucide-react';

type MetaStatus={configured:boolean;active:boolean;displayPhone:string;wabaId:string;phoneNumberId:string;appReady:boolean;pilotAllowed:boolean;embeddedReady:boolean;appId:string;graphVersion:string;webhookUrl:string;messages:{id:number;phone:string;kind:string;status:string;error_code:number|null;created_at:string}[];queue:{state:string;count:number}[]};
const labels:Record<string,string>={sending:'En cours',accepted:'Accepté par Meta',sent:'Envoyé',delivered:'Livré',read:'Lu',failed:'Échec',uncertain:'À vérifier'};
async function post(endpoint:string,body:unknown={}){
 const response=await fetch('/api/automation/meta/'+endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message || 'Opération Meta impossible.');return result;
}
function loadSDK(appId:string,version:string):Promise<any>{
 return new Promise((resolve,reject)=>{
  const windowWithFB=window as any;
  const init=()=>{windowWithFB.FB.init({appId,autoLogAppEvents:false,xfbml:false,version});resolve(windowWithFB.FB);};
  if(windowWithFB.FB){init();return;}
  windowWithFB.fbAsyncInit=init;
  const existing=document.getElementById('tajergrow-meta-sdk');
  if(!existing){const script=document.createElement('script');script.id='tajergrow-meta-sdk';script.src='https://connect.facebook.net/fr_FR/sdk.js';script.async=true;script.onerror=()=>reject(new Error('Chargement Meta impossible.'));document.body.appendChild(script);}
 });
}
export default function MetaWhatsappConnection(){
 const {toast}=useToast();
 const {data:s,refetch,isLoading}=useQuery<MetaStatus>({queryKey:['/api/automation/meta/status'],queryFn:async()=>{
  const r=await fetch('/api/automation/meta/status',{credentials:'include',cache:'no-store'});if(!r.ok)throw Error('Connexion réservée au propriétaire du compte.');return r.json();
 },refetchInterval:15000,retry:false});
 const [signup,setSignup]=useState<any>(null),[signupRound,setSignupRound]=useState(0);
 const [busy,setBusy]=useState(''),[waba,setWaba]=useState(''),[phoneId,setPhoneId]=useState(''),[token,setToken]=useState(''),[pin,setPin]=useState('');
 const [testPhone,setTestPhone]=useState(''),[testType,setTestType]=useState('template'),[url,setUrl]=useState(''),[consent,setConsent]=useState(false);
 const attempt=useRef<{nonce:string;code?:string;wabaId?:string;phoneNumberId?:string;finishing?:boolean}|null>(null);
 const finish=useRef<()=>void>(()=>{});
 const refresh=async()=>{await refetch();await queryClient.invalidateQueries({queryKey:['/api/automation/ai-settings']});};
 const notify=(error:unknown)=>toast({title:error instanceof Error?error.message:'Connexion Meta impossible.',variant:'destructive'});
 finish.current=()=>{
  const a=attempt.current;if(!a?.code||!a.wabaId||!a.phoneNumberId||a.finishing)return;
  a.finishing=true;
  void post('signup/complete',{...a,pin}).then(async()=>{toast({title:'WhatsApp officiel connecté'});await refresh();}).catch(notify).finally(()=>{attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);});
 };
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{
   if(!['https://www.facebook.com','https://web.facebook.com'].includes(event.origin)||!attempt.current)return;
   let message;try{message=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
   if(message?.type!=='WA_EMBEDDED_SIGNUP')return;
   if(message.event==='FINISH' || message.event==='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'){
    attempt.current.wabaId=String(message.data?.waba_id || '');attempt.current.phoneNumberId=String(message.data?.phone_number_id || '');finish.current();
   }else if(message.event==='CANCEL'||message.event==='ERROR'){attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);toast({title:'Connexion interrompue. Vous pouvez recommencer.'});}
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[]);
 useEffect(()=>{if(!busy)return;const timer=setTimeout(()=>{attempt.current=null;setBusy('');},10*60*1000);return()=>clearTimeout(timer);},[busy]);
 useEffect(()=>{
  if(!s?.embeddedReady)return;
  let cancelled=false;
  const prepare=async()=>{try{const [info,fb]=await Promise.all([post('signup/start'),loadSDK(s.appId,s.graphVersion)]);if(!cancelled)setSignup({...info,fb});}catch(error){if(!cancelled)notify(error);}};
  void prepare();const timer=setInterval(()=>void prepare(),8*60*1000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[s?.embeddedReady,s?.appId,s?.graphVersion,signupRound]);
 function connect(){
  if(!/^\d{6}$/.test(pin)){notify(Error('Choisissez un code de sécurité de six chiffres pour votre numéro WhatsApp.'));return;}
  if(!signup)return;
  setBusy('connect');attempt.current={nonce:signup.nonce};
  // Launch synchronously within the click gesture so browsers allow Meta's popup.
  signup.fb.login((response:any)=>{
   if(!attempt.current)return;
   if(!response.authResponse?.code){attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);return;}
   attempt.current.code=response.authResponse.code;finish.current();
  },{config_id:signup.configId,auth_type:'rerequest',response_type:'code',override_default_response_type:true,extras:{}});
 }
 async function action(name:string,fn:()=>Promise<unknown>){setBusy(name);try{await fn();await refresh();}catch(error){notify(error);}finally{setBusy('');}}
 const input='w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
 return <section className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden" data-testid="meta-whatsapp-panel">
  <div className="bg-indigo-950 text-white p-6 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-indigo-200 mb-2">Meta Cloud API</p><h3 className="text-xl font-bold">WhatsApp officiel</h3><p className="text-sm text-indigo-100 mt-2">Votre numéro, votre compte Meta, vos conversations.</p></div><ShieldCheck className="w-8 h-8 text-emerald-300 shrink-0"/></div>
  <div className="p-6 space-y-5">
   {isLoading?<p>Chargement…</p>:!s?<p className="text-sm text-zinc-500">La configuration est accessible au propriétaire du compte.</p>:<>
    <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${s.active?'bg-emerald-500':'bg-zinc-300'}`}/>{s.active?`Connecté · ${s.displayPhone}`:s.configured?'Connexion désactivée':'Aucun numéro officiel connecté'}</div>
    <p className="text-sm text-zinc-600">Les nouvelles commandes du site commencent par un modèle approuvé par Meta. Après la réponse du client, l’IA peut envoyer les informations du produit, images, vidéos et audios pendant 24 heures.</p>
    {!s.embeddedReady&&<div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900">Le raccordement des utilisateurs sera ouvert après la validation Meta et la configuration de TajerGrow. {s.appReady?'Le pilote peut être testé sur les comptes autorisés.':'La configuration de l’application Meta reste à terminer.'}</div>}
    {s.embeddedReady&&<label className="block text-sm font-medium">Code de sécurité WhatsApp à conserver<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} placeholder="6 chiffres" className={input+' mt-2'}/></label>}
    <button type="button" disabled={!s.embeddedReady||!signup||!!busy} onClick={()=>void connect()} className="w-full rounded-xl bg-indigo-700 text-white font-semibold py-3 disabled:opacity-40 flex items-center justify-center gap-2" data-testid="meta-embedded-connect">{busy==='connect'?<Loader2 className="w-4 h-4 animate-spin"/>:<Link2 className="w-4 h-4"/>}ربط WhatsApp الرسمي</button>
    {s.pilotAllowed&&<details className="border rounded-xl p-4"><summary className="cursor-pointer font-semibold text-sm">Connexion pilote — compte de test</summary><div className="mt-4 space-y-3"><input aria-label="WhatsApp Business Account ID" className={input} placeholder="WhatsApp Business Account ID (WABA)" value={waba} onChange={e=>setWaba(e.target.value)}/><input aria-label="Phone Number ID" className={input} placeholder="Phone Number ID" value={phoneId} onChange={e=>setPhoneId(e.target.value)}/><input aria-label="Jeton Meta" type="password" autoComplete="off" className={input} placeholder="Jeton d’accès Meta (stocké chiffré)" value={token} onChange={e=>setToken(e.target.value)}/><button type="button" disabled={!!busy||!s.appReady} onClick={()=>void action('pilot',async()=>{await post('pilot-connect',{wabaId:waba,phoneNumberId:phoneId,accessToken:token});setToken('');toast({title:'Numéro pilote connecté'});})} className="rounded-lg bg-indigo-700 text-white px-4 py-2 text-sm disabled:opacity-40">Connecter le pilote</button></div></details>}
    {s.active&&<>
     <div className="flex flex-wrap gap-3"><button type="button" disabled={!!busy} onClick={()=>void action('template',async()=>{const r=await post('template');toast({title:`Modèle de confirmation : ${r.status}`});})} className="rounded-lg border px-4 py-2 text-sm">Préparer / vérifier le modèle</button><button type="button" disabled={!!busy} onClick={()=>void action('disconnect',()=>post('disconnect'))} className="text-sm text-red-600">Déconnecter</button></div>
     <div className="rounded-xl bg-zinc-50 p-4 space-y-3"><h4 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-indigo-600"/>Tester le numéro</h4><p className="text-xs text-zinc-500">Ajoutez votre destinataire autorisé dans Meta. Pour les messages libres et les médias, envoyez d’abord un message depuis ce téléphone au numéro connecté.</p><input aria-label="Numéro destinataire de test" className={input} placeholder="Votre numéro de test · +212…" value={testPhone} onChange={e=>setTestPhone(e.target.value)}/><select aria-label="Type de test" className={input} value={testType} onChange={e=>setTestType(e.target.value)}><option value="template">Confirmation par modèle approuvé</option><option value="text">Texte</option><option value="buttons">Trois boutons de réponse</option><option value="image">Image</option><option value="audio">Audio</option><option value="video">Vidéo</option></select>{['image','audio','video'].includes(testType)&&<input aria-label="URL du média de test" className={input} placeholder="URL du fichier enregistré dans Produits WhatsApp" value={url} onChange={e=>setUrl(e.target.value)}/>}<label className="flex gap-2 text-xs text-zinc-600"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Ce numéro m’appartient ou a accepté de recevoir ce test.</label><button type="button" disabled={!!busy||!consent||!testPhone} onClick={()=>void action('test',async()=>{await post('test',{phone:testPhone,type:testType,url,consent});toast({title:'Test accepté par Meta. Suivez son arrivée dans le journal.'});})} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40 flex items-center gap-2"><Send className="h-4 w-4"/>Envoyer le test</button></div>
    </>}
    {s.configured&&<button type="button" disabled={!!busy} onClick={()=>void action('green',()=>post('use-green'))} className="text-xs text-zinc-500 underline">Revenir à ma connexion Green API</button>}
    <div><div className="flex items-center justify-between mb-3"><h4 className="font-semibold">Suivi des envois</h4><button type="button" aria-label="Actualiser le suivi" onClick={()=>void refetch()}><RefreshCw className="h-4 w-4 text-zinc-500"/></button></div>{s.messages.length?<div className="overflow-x-auto"><table className="text-xs w-full"><thead><tr className="text-left text-zinc-500 border-b"><th className="py-2">Destinataire</th><th>Contenu</th><th>État</th><th>Date</th></tr></thead><tbody>{s.messages.map(m=><tr key={m.id} className="border-b border-zinc-100"><td className="py-3">+{m.phone}</td><td>{m.kind}</td><td className={['delivered','read'].includes(m.status)?'text-emerald-700':m.status==='failed'?'text-red-600':'text-zinc-600'}>{labels[m.status]||m.status}{m.error_code?` · ${m.error_code}`:''}</td><td>{new Date(m.created_at).toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>:<p className="text-sm text-zinc-400">Les tests et les messages de cette connexion apparaîtront ici.</p>}{s.queue.some(q=>q.state==='pending')&&<p className="text-xs text-amber-700 mt-3">Contenus du produit en attente de la réponse du client : {s.queue.find(q=>q.state==='pending')?.count}</p>}</div>
   </>}
  </div>
 </section>;
}

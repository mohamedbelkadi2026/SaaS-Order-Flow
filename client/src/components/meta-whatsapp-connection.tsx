import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import {useToast} from '@/hooks/use-toast';
import {CheckCircle2,Link2,Loader2,ShieldCheck,Send,RefreshCw} from 'lucide-react';
import {metaSignupReady,metaSignupResult,type MetaSignupAttempt} from '@/lib/meta-signup';

type MetaStatus={template:{status:string;ready:boolean;checkedAt:string|null;error:string|null};connectionHealth:{state:string;checkedAt:string|null;expiresAt:string|null;dataAccessExpiresAt:string|null};configured:boolean;active:boolean;displayPhone:string;wabaId:string;phoneNumberId:string;appReady:boolean;pilotAllowed:boolean;embeddedReady:boolean;appId:string;graphVersion:string;webhookUrl:string;messages:{id:number;phone:string;kind:string;status:string;error_code:number|null;created_at:string}[];queue:{state:string;count:number}[]};
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
 const [signupError,setSignupError]=useState('');
 const [connectMode,setConnectMode]=useState('existing'),[changeNumber,setChangeNumber]=useState(false),[setupError,setSetupError]=useState('');
 const [busy,setBusy]=useState(''),[waba,setWaba]=useState(''),[phoneId,setPhoneId]=useState(''),[token,setToken]=useState(''),[pin,setPin]=useState('');
 const [testPhone,setTestPhone]=useState(''),[testType,setTestType]=useState('template'),[url,setUrl]=useState(''),[consent,setConsent]=useState(false);
 const attempt=useRef<MetaSignupAttempt|null>(null);
 const finish=useRef<()=>void>(()=>{});
 // Restore public identifiers from the saved connection; never return its token to the browser.
 // Stable dependencies preserve in-progress edits during the status polling interval.
 useEffect(()=>{
  setWaba(s?.wabaId || '');setPhoneId(s?.phoneNumberId || '');
 },[s?.wabaId,s?.phoneNumberId]);
 const refresh=async()=>{await refetch();await queryClient.invalidateQueries({queryKey:['/api/automation/ai-settings']});};
 const notify=(error:unknown)=>toast({title:error instanceof Error?error.message:'Connexion Meta impossible.',variant:'destructive'});
 finish.current=()=>{
  const a=attempt.current;if(!a || !metaSignupReady(a))return;
  a.finishing=true;
  void post('signup/complete',{...a,pin:a.coexistence?undefined:pin}).then(async()=>{setSignupError('');setChangeNumber(false);toast({title:'WhatsApp connecté. Préparation de la confirmation…'});await refresh();}).catch(error=>{setSignupError(error instanceof Error?error.message:'Connexion Meta impossible.');notify(error);}).finally(()=>{attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);});
 };
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{
   if(!['https://www.facebook.com','https://web.facebook.com'].includes(event.origin)||!attempt.current)return;
   let message;try{message=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
   if(message?.type!=='WA_EMBEDDED_SIGNUP')return;
   const result=metaSignupResult(message);
   if(result){
    Object.assign(attempt.current,result);finish.current();
   }else if(message.event==='CANCEL'||message.event==='ERROR'){attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);toast({title:'Connexion interrompue. Vous pouvez recommencer.'});}
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[]);
 useEffect(()=>{if(busy!=='connect')return;const timer=setTimeout(()=>{attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);toast({title:'La connexion n’a pas été enregistrée. Relancez le raccordement Meta.',variant:'destructive'});},10*60*1000);return()=>clearTimeout(timer);},[busy]);
 useEffect(()=>{
  if(!s?.embeddedReady)return;
  let cancelled=false;
  const prepare=async()=>{try{const [info,fb]=await Promise.all([post('signup/start'),loadSDK(s.appId,s.graphVersion)]);if(!cancelled)setSignup({...info,fb});}catch(error){if(!cancelled)notify(error);}};
  void prepare();const timer=setInterval(()=>void prepare(),8*60*1000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[s?.embeddedReady,s?.appId,s?.graphVersion,signupRound]);
 useEffect(()=>{
  if(!s?.active || s.connectionHealth.state==='reconnect_required' || s.template?.ready)return;
  let cancelled=false;
  const prepare=async()=>{try{await post('template');if(!cancelled){setSetupError('');await refetch();}}catch{if(!cancelled)setSetupError('La préparation du message est temporairement indisponible. Réessayez.');}};
  void prepare();const timer=setInterval(()=>void prepare(),60000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[s?.active,s?.phoneNumberId,s?.connectionHealth.state,s?.template?.ready]);
 function connect(coexistence=false){
  if(!coexistence && !/^\d{6}$/.test(pin)){notify(Error('Choisissez un code de sécurité de six chiffres pour votre numéro WhatsApp.'));return;}
  if(!signup)return;
  setSignupError('');setBusy('connect');
  const currentAttempt:MetaSignupAttempt={nonce:signup.nonce,coexistence};attempt.current=currentAttempt;
  // Launch synchronously within the click gesture so browsers allow Meta's popup.
  signup.fb.login((response:any)=>{
   if(attempt.current!==currentAttempt)return;
   if(!response.authResponse?.code){setSignupError('Meta n’a pas renvoyé l’autorisation à TajerGrow. La connexion n’a pas été enregistrée. Relancez le raccordement et terminez toutes les étapes.');attempt.current=null;setBusy('');setSignup(null);setSignupRound(n=>n+1);return;}
   attempt.current.code=response.authResponse.code;finish.current();
  },{config_id:signup.configId,auth_type:'rerequest',response_type:'code',override_default_response_type:true,extras:{setup:{},sessionInfoVersion:'3',...(coexistence?{featureType:'whatsapp_business_app_onboarding'}:{})}});
 }
 async function action(name:string,fn:()=>Promise<unknown>){setBusy(name);try{await fn();await refresh();}catch(error){notify(error);}finally{setBusy('');}}
 const needsReconnect=s?.connectionHealth.state==='reconnect_required';
 const templateReady=!!s?.active && !needsReconnect && !!s?.template?.ready;
 const templateLabels:Record<string,string>={NOT_CREATED:'Préparation automatique',PENDING:'En cours de validation par Meta',APPROVED:'Message approuvé',REJECTED:'Message refusé par Meta',PAUSED:'Message suspendu par Meta',DISABLED:'Message désactivé par Meta',INCOMPATIBLE:'Message à vérifier',ERROR:'Préparation à réessayer',UNKNOWN:'Vérification en cours'};
 const sameTestPhone=!!testPhone && testPhone.replace(/\D/g,'').replace(/^0(?=\d{9}$)/,'212')===s?.displayPhone.replace(/\D/g,'');
 const input='w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
 return <section className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden" data-testid="meta-whatsapp-panel">
  <div className="bg-indigo-950 text-white p-6 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-indigo-200 mb-2">WhatsApp Business officiel</p><h3 className="text-xl font-bold text-white">Connectez WhatsApp à votre boutique</h3><p className="text-sm text-indigo-100 mt-2">Votre numéro, votre compte Meta, vos conversations.</p></div><ShieldCheck className="w-8 h-8 text-emerald-300 shrink-0"/></div>
  <div className="p-6 space-y-5">
   {isLoading?<p>Chargement…</p>:!s?<p className="text-sm text-zinc-500">La configuration est accessible au propriétaire du compte.</p>:<>
    <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${s.connectionHealth.state==='reconnect_required'?'bg-red-500':s.active?'bg-emerald-500':'bg-zinc-300'}`}/>{s.active?(s.connectionHealth.state==='reconnect_required'?`À reconnecter · ${s.displayPhone}`:`Connecté · ${s.displayPhone}`):s.configured?'Connexion désactivée':'Aucun numéro officiel connecté'}</div>
    {s.active&&<div className={`rounded-xl border p-4 text-sm space-y-2 ${needsReconnect?'bg-amber-50 border-amber-200 text-amber-950':'bg-emerald-50 border-emerald-100 text-emerald-900'}`} role="status">
     <p className="font-semibold">{needsReconnect?'Votre compte doit être reconnecté.':'Votre numéro WhatsApp est connecté.'}</p>
     <p>{needsReconnect?'Renouvelez l’autorisation avec Meta pour reprendre les envois.':templateReady?'Le message de confirmation est prêt. Activez la Confirmation IA ci-dessous pour les nouvelles commandes.':'TajerGrow prépare votre message de confirmation. Votre numéro reste connecté pendant cette étape.'}</p>
    </div>}
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Étapes de configuration WhatsApp">
     {[
      {title:'1. Connecter WhatsApp',done:!!s.active&&!needsReconnect,text:s.active&&!needsReconnect?'Numéro connecté':'Autorisez la connexion avec Meta'},
      {title:'2. Préparer le message',done:templateReady,text:s.active?(templateLabels[s.template?.status]||'Vérification en cours'):'Préparé automatiquement après connexion'},
      {title:'3. Confirmer les commandes',done:templateReady,text:templateReady?'Message prêt pour la Confirmation IA':'Disponible après validation du message'},
     ].map(step=><div key={step.title} className={`rounded-xl border p-3 ${step.done?'border-emerald-100 bg-emerald-50':'border-zinc-200 bg-zinc-50'}`}><p className="text-xs font-semibold flex gap-2 items-center">{step.done&&<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600"/>}{step.title}</p><p className="text-xs text-zinc-600 mt-2">{step.text}</p></div>)}
    </div>
    {s.active&&!needsReconnect&&<div className="rounded-xl border border-zinc-200 p-4 space-y-3" data-testid="meta-template-setup">
     <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-sm">Message de confirmation</h4><p className="text-sm text-zinc-600 mt-1" role="status">{templateLabels[s.template?.status]||'Vérification en cours'}</p></div><button type="button" disabled={!!busy} onClick={()=>void action('template',async()=>{setSetupError('');await post('template',{refresh:true});})} className="shrink-0 rounded-lg border px-3 py-2 text-xs disabled:opacity-40"><RefreshCw className="w-3 h-3 inline mr-1"/>Actualiser</button></div>
     <p className="text-xs text-zinc-500">{templateReady?'La confirmation contient les informations de la commande et les boutons Confirmer, Modifier et Annuler.':s.template?.status==='REJECTED'?'Meta a refusé ce message. Contactez le support TajerGrow pour corriger le modèle.':s.template?.status==='INCOMPATIBLE'?'Le message existant ne correspond pas à la confirmation de commande. Le support TajerGrow doit le vérifier.':'Le message est préparé et soumis automatiquement à Meta. Sa validation est nécessaire avant le premier envoi et peut prendre jusqu’à 24 h. Vous pouvez quitter cette page.'}</p>
     {(s.template?.error||setupError)&&<p role="alert" className="text-sm text-amber-800">{s.template?.error||setupError}</p>}
    </div>}
    {(!s.active||needsReconnect||changeNumber)&&<div className="space-y-4">
     <p className="text-sm text-zinc-600">Connectez votre numéro avec votre compte Facebook. TajerGrow s’occupe ensuite de préparer le message de confirmation.</p>
     {!s.embeddedReady&&<p className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900">La connexion WhatsApp officielle sera bientôt disponible pour votre compte.</p>}
     {s.embeddedReady&&<>
      <label className="block text-sm font-medium">Votre numéro<select aria-label="Mode de connexion WhatsApp" value={connectMode} onChange={e=>setConnectMode(e.target.value)} disabled={!!busy} className={input+' mt-2'}><option value="existing">J’utilise déjà WhatsApp Business</option><option value="new">Connecter un nouveau numéro</option></select></label>
      {connectMode==='new'&&<label className="block text-sm font-medium">Code de sécurité à conserver<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} placeholder="6 chiffres" className={input+' mt-2'}/></label>}
      <button type="button" disabled={!signup||!!busy} onClick={()=>connect(connectMode==='existing')} className="w-full rounded-xl bg-indigo-700 text-white font-semibold py-3 disabled:opacity-40 flex items-center justify-center gap-2" data-testid="meta-embedded-connect">{busy==='connect'?<Loader2 className="w-4 h-4 animate-spin"/>:<Link2 className="w-4 h-4"/>}{needsReconnect?'Reconnecter WhatsApp':'Connecter WhatsApp'}</button>
     </>}
    </div>}
    {signupError&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{signupError}</p>}
    {s.active&&<>
     <details className="rounded-xl bg-zinc-50 p-4"><summary className="cursor-pointer font-semibold text-sm">Vérifier avec un message test <span className="text-xs font-normal text-zinc-400">Facultatif</span></summary><div className="mt-4 space-y-3"><p className="text-xs text-zinc-500">Utilisez un autre numéro qui vous appartient pour recevoir la confirmation. Après sa réponse, vous pouvez tester les messages libres et les médias pendant 24 h.</p><input aria-label="Numéro destinataire de test" className={input} placeholder="Votre numéro de test · +212…" value={testPhone} onChange={e=>setTestPhone(e.target.value)}/><details className="text-xs"><summary className="cursor-pointer text-zinc-500">Tests avancés : texte et médias</summary><select aria-label="Type de test" className={input} value={testType} onChange={e=>setTestType(e.target.value)}><option value="template">Confirmation par modèle approuvé</option><option value="text">Texte</option><option value="buttons">Trois boutons de réponse</option><option value="image">Image</option><option value="audio">Audio</option><option value="video">Vidéo</option></select>{['image','audio','video'].includes(testType)&&<input aria-label="URL du média de test" className={input} placeholder="URL du fichier enregistré dans Produits WhatsApp" value={url} onChange={e=>setUrl(e.target.value)}/>}</details>{sameTestPhone&&<p role="alert" className="text-xs text-amber-800">Utilisez un autre numéro : votre WhatsApp connecté est l’expéditeur.</p>}<label className="flex gap-2 text-xs text-zinc-600"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Ce numéro m’appartient ou a accepté de recevoir ce test.</label><button type="button" disabled={!!busy||!consent||!testPhone||sameTestPhone||needsReconnect||(testType==='template'&&!templateReady)} onClick={()=>void action('test',async()=>{await post('test',{phone:testPhone,type:testType,url,consent});toast({title:'Test accepté par Meta. Suivez son arrivée dans le journal.'});})} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40 flex items-center gap-2"><Send className="h-4 w-4"/>Envoyer le test</button></div></details>
    </>}
    <details className="rounded-xl border border-zinc-200 p-4"><summary className="cursor-pointer text-sm font-medium text-zinc-600">Paramètres avancés</summary><div className="mt-4 space-y-4">
     {s.active&&<>
      <button type="button" disabled={!!busy} onClick={()=>void action('check',()=>post('check'))} className="rounded-lg border px-3 py-2 text-sm">Vérifier la connexion</button>
      {s.connectionHealth.expiresAt&&<p className="text-xs text-zinc-500">Autorisation valable jusqu’au {new Date(s.connectionHealth.expiresAt).toLocaleString('fr-FR')}</p>}
      <div className="flex gap-4"><button type="button" disabled={!!busy} onClick={()=>setChangeNumber(v=>!v)} className="text-sm text-indigo-700">Changer de numéro</button><button type="button" disabled={!!busy} onClick={()=>void action('disconnect',()=>post('disconnect'))} className="text-sm text-red-600">Déconnecter</button></div>
     </>}
    {s.pilotAllowed&&<details className="border rounded-xl p-4"><summary className="cursor-pointer font-semibold text-sm">Connexion pilote — compte de test</summary>
     <div className="mt-4 space-y-3">
      {s.active&&<p role="status" className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800">Connexion enregistrée. Votre jeton est conservé chiffré : vous n’avez pas besoin de le saisir à nouveau pour utiliser WhatsApp.</p>}
      <label className="block text-sm font-medium">WhatsApp Business Account ID (WABA)<input aria-label="WhatsApp Business Account ID" className={input+' mt-1'} placeholder="WhatsApp Business Account ID (WABA)" value={waba} onChange={e=>setWaba(e.target.value)}/></label>
      <label className="block text-sm font-medium">Phone Number ID<input aria-label="Phone Number ID" className={input+' mt-1'} placeholder="Phone Number ID" value={phoneId} onChange={e=>setPhoneId(e.target.value)}/></label>
      <label className="block text-sm font-medium">{s.active?'Remplacer le jeton Meta':'Jeton d’accès Meta'}<input aria-label="Jeton Meta" type="password" autoComplete="off" className={input+' mt-1'} placeholder={s.active?'Déjà enregistré — nouveau jeton uniquement pour modifier la connexion':'Jeton d’accès Meta (stocké chiffré)'} value={token} onChange={e=>setToken(e.target.value)}/></label>
      {s.active&&<p className="text-xs text-zinc-500">Pour modifier les identifiants ou remplacer le jeton, renseignez un nouveau jeton puis enregistrez la connexion.</p>}
      <button type="button" disabled={!!busy||!s.appReady||!waba.trim()||!phoneId.trim()||!token.trim()} onClick={()=>void action('pilot',async()=>{await post('pilot-connect',{wabaId:waba.trim(),phoneNumberId:phoneId.trim(),accessToken:token.trim()});setToken('');toast({title:'Connexion pilote enregistrée'});})} className="rounded-lg bg-indigo-700 text-white px-4 py-2 text-sm disabled:opacity-40">{s.active?'Mettre à jour la connexion':'Connecter le pilote'}</button>
     </div>
    </details>}
     {s.configured&&<button type="button" disabled={!!busy} onClick={()=>void action('green',()=>post('use-green'))} className="text-xs text-zinc-500 underline">Revenir à ma connexion Green API</button>}
    </div></details>
    <div><div className="flex items-center justify-between mb-3"><h4 className="font-semibold">Suivi des envois</h4><button type="button" aria-label="Actualiser le suivi" onClick={()=>void refetch()}><RefreshCw className="h-4 w-4 text-zinc-500"/></button></div>{s.messages.length?<div className="overflow-x-auto"><table className="text-xs w-full"><thead><tr className="text-left text-zinc-500 border-b"><th className="py-2">Destinataire</th><th>Contenu</th><th>État</th><th>Date</th></tr></thead><tbody>{s.messages.map(m=><tr key={m.id} className="border-b border-zinc-100"><td className="py-3">+{m.phone}</td><td>{m.kind}</td><td className={['delivered','read'].includes(m.status)?'text-emerald-700':m.status==='failed'?'text-red-600':'text-zinc-600'}>{labels[m.status]||m.status}{m.error_code?` · ${m.error_code}`:''}</td><td>{new Date(m.created_at).toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>:<p className="text-sm text-zinc-400">Les tests et les messages de cette connexion apparaîtront ici.</p>}{s.queue.some(q=>q.state==='pending')&&<p className="text-xs text-amber-700 mt-3">Contenus du produit en attente de la réponse du client : {s.queue.find(q=>q.state==='pending')?.count}</p>}</div>
   </>}
  </div>
 </section>;
}

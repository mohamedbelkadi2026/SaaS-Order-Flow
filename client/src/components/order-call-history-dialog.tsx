import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PhoneCall, UserRound, Clock3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const OUTCOME_LABELS: Record<string,string> = {
  tentative: "Tentative",
  repondu: "Répondu",
  pas_de_reponse: "Pas de réponse",
  occupe: "Occupé",
  rappel: "Rappel",
  confirme: "Confirmé",
  annule: "Annulé",
};

export function OrderCallHistoryDialog({ order, open, onOpenChange }:{
  order:any|null; open:boolean; onOpenChange:(v:boolean)=>void;
}) {
  const [outcome,setOutcome]=useState("tentative");
  const [note,setNote]=useState("");
  const qc=useQueryClient();
  const {toast}=useToast();
  const key=["/api/orders",order?.id,"calls"];
  const {data,isLoading}=useQuery<any>({
    queryKey:key,
    queryFn:async()=>{
      const r=await fetch(`/api/orders/${order.id}/calls`,{credentials:"include"});
      if(!r.ok) throw new Error("Historique indisponible");
      return r.json();
    },
    enabled:open&&!!order?.id,
    staleTime:0,
  });
  const save=useMutation({
    mutationFn:async()=>{
      const r=await fetch(`/api/orders/${order.id}/calls`,{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({outcome,note})
      });
      if(!r.ok) throw new Error((await r.json().catch(()=>({}))).message||"Erreur");
      return r.json();
    },
    onSuccess:()=>{
      setNote(""); setOutcome("tentative"); qc.invalidateQueries({queryKey:key});
      toast({title:"Appel enregistré",description:"La tentative a été ajoutée à l'historique."});
    },
    onError:(e:any)=>toast({title:"Erreur",description:e.message,variant:"destructive"}),
  });
  const attempts=data?.attempts||[];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl max-h-[86vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><PhoneCall className="w-5 h-5 text-emerald-600"/>Historique des appels {order?.orderNumber?`#${order.orderNumber}`:""}</DialogTitle>
        <DialogDescription>{order?.customerName||"Client"} · {order?.customerPhone||"—"} · {attempts.length} tentative{attempts.length!==1?"s":""}</DialogDescription>
      </DialogHeader>
      <div className="rounded-xl border p-3 space-y-2 bg-muted/20">
        <div className="text-sm font-semibold">Ajouter une tentative</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Select value={outcome} onValueChange={setOutcome}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
            {Object.entries(OUTCOME_LABELS).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent></Select>
          <Input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Note (optionnel)" />
        </div>
        <div className="flex gap-2">
          {order?.customerPhone&&<Button variant="outline" asChild><a href={`tel:${order.customerPhone}`}><PhoneCall className="w-4 h-4 mr-2"/>Appeler</a></Button>}
          <Button onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending?<Loader2 className="w-4 h-4 mr-2 animate-spin"/>:null}Enregistrer la tentative</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Sans API téléphonique, le résultat est saisi manuellement. L'heure et l'agent connecté sont enregistrés automatiquement.</p>
      </div>
      <div className="overflow-y-auto py-1">
        {isLoading?<div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin"/></div>:
        attempts.length===0?<div className="py-10 text-center text-sm text-muted-foreground">Aucun appel enregistré pour cette commande.</div>:
        <div className="space-y-2">{attempts.map((a:any,i:number)=><div key={a.id} className="rounded-xl border p-3">
          <div className="flex items-start justify-between gap-3">
            <div><div className="font-semibold text-sm">Tentative #{attempts.length-i} · {OUTCOME_LABELS[a.outcome]||a.outcome}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="w-3 h-3"/>{a.agentName||"Agent"}</div>
              {a.note&&<div className="text-xs mt-2">{a.note}</div>}
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1"><Clock3 className="w-3 h-3"/>{a.calledAt?new Date(a.calledAt).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}</div>
          </div>
        </div>)}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}

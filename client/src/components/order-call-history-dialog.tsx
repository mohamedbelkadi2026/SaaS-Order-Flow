import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PhoneCall, UserRound, Clock3 } from "lucide-react";

export function OrderCallHistoryDialog({ order, open, onOpenChange }:{
  order:any|null; open:boolean; onOpenChange:(v:boolean)=>void;
}) {
  const {data,isLoading,isError}=useQuery<any>({
    queryKey:["/api/orders",order?.id,"calls"],
    queryFn:async()=>{
      const r=await fetch(`/api/orders/${order.id}/calls`,{credentials:"include"});
      if(!r.ok) throw new Error("Historique indisponible");
      return r.json();
    },
    enabled:open&&!!order?.id,
    staleTime:0,
  });
  const attempts=data?.attempts||[];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg max-h-[82vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PhoneCall className="w-5 h-5 text-emerald-600"/>
          Historique des appels {order?.orderNumber?`#${order.orderNumber}`:""}
        </DialogTitle>
        <DialogDescription>
          {order?.customerName||"Client"} · {order?.customerPhone||"—"} · {attempts.length} appel{attempts.length!==1?"s":""}
        </DialogDescription>
      </DialogHeader>
      <div className="overflow-y-auto py-2">
        {isLoading?<div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin"/></div>:
        isError?<div className="py-10 text-center text-sm text-destructive">Impossible de charger l'historique.</div>:
        attempts.length===0?<div className="py-12 text-center text-sm text-muted-foreground">Aucun appel passé depuis l'icône téléphone.</div>:
        <div className="space-y-2">{attempts.map((a:any,i:number)=><div key={a.id} className="rounded-xl border p-3 bg-muted/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm flex items-center gap-2"><PhoneCall className="w-4 h-4 text-emerald-600"/>Appel #{attempts.length-i}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="w-3 h-3"/>{a.agentName||"Agent"}</div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Clock3 className="w-3 h-3"/>
              {a.calledAt?new Date(a.calledAt).toLocaleString("fr-MA",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}
            </div>
          </div>
        </div>)}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}

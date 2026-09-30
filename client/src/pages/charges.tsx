import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptText, Plus, Pencil, Trash2, CalendarDays, WalletCards, StickyNote } from "lucide-react";

type Charge = { id:number; name:string; amount:number; expenseDate:string; note?:string|null };
const localISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const money = (c:number) => (c/100).toLocaleString("fr-MA",{minimumFractionDigits:2,maximumFractionDigits:2})+" DH";

export default function Charges() {
  const qc=useQueryClient(); const {toast}=useToast();
  const [month,setMonth]=useState(localISO().slice(0,7));
  const empty=()=>({name:"",amount:"",expenseDate:localISO(),note:""});
  const [form,setForm]=useState(empty()); const [editing,setEditing]=useState<Charge|null>(null); const [open,setOpen]=useState(false);
  const {data:rows=[],isLoading}=useQuery<Charge[]>({queryKey:["/api/charges",month],queryFn:async()=>{const r=await fetch(`/api/charges?month=${month}`,{credentials:"include"});if(!r.ok)throw new Error("Erreur de chargement");return r.json();}});
  const total=useMemo(()=>rows.reduce((s,x)=>s+Number(x.amount||0),0),[rows]);
  const save=useMutation({mutationFn:async()=>{const body={...form,amount:Number(form.amount)};return editing?apiRequest("PATCH",`/api/charges/${editing.id}`,body):apiRequest("POST","/api/charges",body);},onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/charges"]});qc.invalidateQueries({queryKey:["/api/products/profitability"]});qc.invalidateQueries({queryKey:["/api/stats/filtered"]});setOpen(false);setEditing(null);setForm(empty());toast({title:"Charge enregistrée",description:"Le profit du mois concerné a été recalculé."});},onError:(e:any)=>toast({title:"Erreur",description:e.message,variant:"destructive"})});
  const del=useMutation({mutationFn:(id:number)=>apiRequest("DELETE",`/api/charges/${id}`),onSuccess:()=>{qc.invalidateQueries({queryKey:["/api/charges"]});qc.invalidateQueries({queryKey:["/api/products/profitability"]});qc.invalidateQueries({queryKey:["/api/stats/filtered"]});toast({title:"Charge supprimée"});}});
  const startAdd=()=>{setEditing(null);setForm({...empty(),expenseDate:month+"-"+String(Math.min(new Date().getDate(),28)).padStart(2,"0")});setOpen(true);};
  const startEdit=(x:Charge)=>{setEditing(x);setForm({name:x.name,amount:String(x.amount/100),expenseDate:x.expenseDate,note:x.note||""});setOpen(true);};
  return <div className="space-y-5 animate-in fade-in duration-300">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h1 className="text-2xl font-display font-bold uppercase tracking-tight">Les Charges</h1><p className="text-sm text-muted-foreground mt-1">Frais fixes et dépenses d'exploitation déduits automatiquement du profit du mois.</p></div><Button onClick={startAdd} className="gap-2 rounded-xl"><Plus className="w-4 h-4"/>Ajouter une charge</Button></div>
    <div className="grid sm:grid-cols-3 gap-3">
      <Card className="rounded-2xl sm:col-span-2 overflow-hidden border-0 text-white" style={{background:"linear-gradient(135deg,#172554,#1e3a8a)"}}><CardContent className="p-5"><div className="flex items-center gap-2 text-white/70 text-xs font-bold uppercase"><WalletCards className="w-4 h-4"/>Total charges du mois</div><div className="text-3xl font-black mt-2">− {money(total)}</div><div className="text-xs text-white/60 mt-1">{rows.length} charge{rows.length!==1?"s":""} • déduit du profit net</div></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground"><CalendarDays className="w-4 h-4"/>Mois</div><Input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="mt-3"/></CardContent></Card>
    </div>
    <Card className="rounded-2xl overflow-hidden"><CardHeader className="border-b bg-muted/20 py-4"><CardTitle className="text-sm flex items-center gap-2"><ReceiptText className="w-4 h-4 text-primary"/>Historique des charges</CardTitle></CardHeader><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/20 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-4">Charge</th><th className="text-left p-4">Date</th><th className="text-left p-4">Note</th><th className="text-right p-4">Montant</th><th className="w-24"></th></tr></thead><tbody>
      {isLoading?<tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Chargement…</td></tr>:rows.length===0?<tr><td colSpan={5} className="p-12 text-center text-muted-foreground">Aucune charge pour ce mois.</td></tr>:rows.map(x=><tr key={x.id} className="border-t hover:bg-muted/20"><td className="p-4 font-bold">{x.name}</td><td className="p-4 whitespace-nowrap">{x.expenseDate}</td><td className="p-4 text-muted-foreground max-w-[360px]"><span className="inline-flex items-center gap-1"><StickyNote className="w-3 h-3"/>{x.note||"—"}</span></td><td className="p-4 text-right font-black text-rose-600">−{money(x.amount)}</td><td className="p-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={()=>startEdit(x)}><Pencil className="w-4 h-4"/></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={()=>del.mutate(x.id)}><Trash2 className="w-4 h-4"/></Button></div></td></tr>)}
      </tbody></table></div>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editing?"Modifier la charge":"Ajouter une charge"}</DialogTitle></DialogHeader><div className="grid gap-4 pt-2">
      <div><label className="text-xs font-bold uppercase text-muted-foreground">Nom de la charge *</label><Input className="mt-1.5" placeholder="Ex: Loyer, Internet, Salaire…" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold uppercase text-muted-foreground">Montant (DH) *</label><Input className="mt-1.5" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div><label className="text-xs font-bold uppercase text-muted-foreground">Date *</label><Input className="mt-1.5" type="date" value={form.expenseDate} onChange={e=>setForm({...form,expenseDate:e.target.value})}/></div></div>
      <div><label className="text-xs font-bold uppercase text-muted-foreground">Note</label><textarea className="mt-1.5 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Détails optionnels…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></div>
      <Button disabled={!form.name||!form.amount||!form.expenseDate||save.isPending} onClick={()=>save.mutate()} className="h-11 rounded-xl">{save.isPending?"Enregistrement…":editing?"Enregistrer les modifications":"Ajouter la charge"}</Button>
    </div></DialogContent></Dialog>
  </div>;
}

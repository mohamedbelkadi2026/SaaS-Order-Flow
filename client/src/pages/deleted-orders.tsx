import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArchiveRestore, Loader2, Trash2, User, CalendarClock, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DeletedOrders() {
  const { toast } = useToast();
  const { data: batches = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders/deletion-history"],
    queryFn: async () => (await apiRequest("GET", "/api/orders/deletion-history")).json(),
  });

  const restore = useMutation({
    mutationFn: async (batchId: number) => (await apiRequest("POST", "/api/orders/deletion-undo/restore", { batchId })).json(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/deletion-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commandes restaurées", description: `${data.restored || 0} commande(s) restaurée(s).` });
    },
    onError: (e: any) => toast({ title: "Restauration impossible", description: e?.message || "Erreur", variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Trash2 className="w-6 h-6" /> Commandes supprimées</h1>
        <p className="text-muted-foreground mt-1">Corbeille des commandes supprimées — voyez qui les a supprimées et restaurez le dernier lot si nécessaire.</p>
      </div>
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30"><TableRow>
              <TableHead>Date suppression</TableHead><TableHead>Supprimé par</TableHead><TableHead>Commandes</TableHead><TableHead>Détails</TableHead><TableHead>État</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
              : !batches.length ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground"><Trash2 className="w-7 h-7 mx-auto mb-2 opacity-40" />Aucune commande supprimée.</TableCell></TableRow>
              : batches.map((b:any, index:number) => <TableRow key={b.id}>
                <TableCell className="whitespace-nowrap text-xs"><CalendarClock className="w-3.5 h-3.5 inline mr-1" />{new Date(b.deletedAt).toLocaleString("fr-FR")}</TableCell>
                <TableCell><div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{b.deletedByName}</span></div></TableCell>
                <TableCell><Badge variant="outline"><Package className="w-3 h-3 mr-1" />{b.orderCount}</Badge></TableCell>
                <TableCell className="min-w-[260px]"><div className="flex flex-wrap gap-1">{(b.orders || []).slice(0,6).map((o:any)=><Badge key={o.id} variant="secondary" className="text-[10px]">#{o.orderNumber} · {o.customerName || o.customerPhone}</Badge>)}{(b.orders?.length||0)>6 && <Badge variant="secondary">+{b.orders.length-6}</Badge>}</div></TableCell>
                <TableCell>{b.restoredAt ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Restauré</Badge> : <Badge variant="destructive">Supprimé</Badge>}</TableCell>
                <TableCell className="text-right">
                  {!b.restoredAt && index === 0 ? <Button size="sm" onClick={()=>restore.mutate(b.id)} disabled={restore.isPending}><ArchiveRestore className="w-4 h-4 mr-1.5" />Restaurer</Button>
                  : !b.restoredAt ? <span className="text-[11px] text-muted-foreground">Restaurer le lot le plus récent d'abord</span> : null}
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

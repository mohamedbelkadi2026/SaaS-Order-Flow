import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, TrendingUp, Wallet, Receipt, Calculator } from "lucide-react";

export default function MesDepenses() {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [productId, setProductId] = useState("none");
  const [notes, setNotes] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries = [], isLoading: loadingEntries } = useQuery<any[]>({
    queryKey: ['/api/marketing-spend', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const qs = p.toString();
      const res = await fetch(`/api/marketing-spend${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: profitData } = useQuery<{ revenue: number; productCost: number; shippingCost: number; packagingCost: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number }>({
    queryKey: ['/api/media-buyer/profit', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const qs = p.toString();
      const res = await fetch(`/api/media-buyer/profit${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!date || !amount) throw new Error("Date et montant requis");
      const res = await apiRequest("POST", "/api/marketing-spend", {
        date,
        amount,
        productId: productId !== 'none' ? productId : null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur serveur");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dépense ajoutée", description: "Votre dépense publicitaire a été enregistrée." });
      setAmount("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ['/api/marketing-spend'] });
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyer/profit'] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/marketing-spend/${id}`, undefined);
    },
    onSuccess: () => {
      toast({ title: "Supprimé" });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing-spend'] });
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyer/profit'] });
    },
  });

  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const totalAdSpend = entries.reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-mes-depenses-title">Mes Dépenses Publicitaires</h1>
        <p className="text-muted-foreground text-sm mt-1">Suivez vos dépenses pub quotidiennes et visualisez votre profit net en temps réel.</p>
      </div>

      {/* Summary Cards */}
      {profitData && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-xl p-5 text-white sm:col-span-2" style={{ background: 'linear-gradient(135deg, hsl(220 72% 38%), hsl(220 72% 28%))' }} data-testid="card-profit-net">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <Wallet className="w-4 h-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Profit Net (Livraisons)</p>
            </div>
            <p className="text-3xl font-extrabold">{formatCurrency(profitData.netProfit)}</p>
            <p className="text-xs opacity-70 mt-1">{profitData.deliveredCount} commandes livrées</p>
          </div>
          <div className="rounded-xl p-5 text-white" style={{ background: profitData.roi >= 0 ? '#16a34a' : '#dc2626' }} data-testid="card-roi">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <TrendingUp className="w-4 h-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">ROI</p>
            </div>
            <p className="text-3xl font-extrabold">{profitData.adSpend > 0 ? `${profitData.roi.toFixed(1)}%` : '∞'}</p>
            <p className="text-xs opacity-70 mt-1">Revenu: {formatCurrency(profitData.revenue)}</p>
          </div>
          <div className="rounded-xl p-5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30" data-testid="card-total-ad-spend">
            <div className="flex items-center gap-2 mb-3 text-orange-600">
              <Receipt className="w-4 h-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Total Dépenses Pub</p>
            </div>
            <p className="text-3xl font-extrabold text-orange-700 dark:text-orange-400">{formatCurrency(totalAdSpend)}</p>
            <p className="text-xs text-orange-500 mt-1">{entries.length} entrée(s)</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Du</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-[140px] text-sm" data-testid="input-filter-date-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Au</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-[140px] text-sm" data-testid="input-filter-date-to" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }} data-testid="button-reset-filter" className="text-muted-foreground h-9">
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add New Entry Form */}
      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            Ajouter une Dépense Publicitaire
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date *</label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-9 text-sm"
                data-testid="input-spend-date"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Montant (DH) *</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 500.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-9 text-sm"
                data-testid="input-spend-amount"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produit</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-spend-product">
                  <SelectValue placeholder="Tous les produits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tous les produits</SelectItem>
                  {(products || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
              <Input
                placeholder="Optionnel"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="h-9 text-sm"
                data-testid="input-spend-notes"
              />
            </div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !date || !amount}
              className="h-9 bg-primary hover:bg-primary/90"
              data-testid="button-add-spend"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              {addMutation.isPending ? "Enregistrement..." : "Ajouter"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              Historique des Dépenses
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{entries.length} entrées</Badge>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                <TableHead className="text-xs font-bold uppercase">Produit</TableHead>
                <TableHead className="text-xs font-bold uppercase text-right">Montant</TableHead>
                <TableHead className="text-xs font-bold uppercase">Notes</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingEntries ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">
                    Aucune dépense enregistrée. Ajoutez votre première dépense ci-dessus.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry: any) => (
                  <TableRow key={entry.id} data-testid={`row-spend-${entry.id}`}>
                    <TableCell className="font-medium text-sm">{entry.date}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.productId ? (productMap.get(entry.productId) || `#${entry.productId}`) : <span className="italic">Tous</span>}
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive text-sm">
                      -{formatCurrency(entry.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.notes || '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        disabled={deleteMutation.isPending}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-spend-${entry.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {entries.length > 0 && (
          <div className="px-5 py-3 bg-muted/10 border-t border-border/50 flex justify-end">
            <div className="text-sm font-bold text-destructive">
              Total: -{formatCurrency(totalAdSpend)}
            </div>
          </div>
        )}
      </Card>

      {/* Cost Breakdown */}
      {profitData && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold">Détail du Calcul de Profit</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-2 max-w-sm">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Revenu (commandes livrées)</span>
                <span className="font-semibold text-green-600">+{formatCurrency(profitData.revenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coût produits</span>
                <span className="font-semibold text-destructive">-{formatCurrency(profitData.productCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Frais de livraison</span>
                <span className="font-semibold text-destructive">-{formatCurrency(profitData.shippingCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coût emballage</span>
                <span className="font-semibold text-destructive">-{formatCurrency(profitData.packagingCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dépenses publicitaires</span>
                <span className="font-semibold text-destructive">-{formatCurrency(profitData.adSpend)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border/50 pt-2 mt-2">
                <span>Profit Net</span>
                <span className={profitData.netProfit >= 0 ? 'text-green-600' : 'text-destructive'}>
                  {formatCurrency(profitData.netProfit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

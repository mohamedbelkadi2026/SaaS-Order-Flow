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
import { PlusCircle, Trash2, TrendingUp, Wallet, Megaphone, BarChart3, Users, Package } from "lucide-react";

const AD_SOURCES = [
  { value: "Facebook Ads",  label: "📘 Facebook Ads",  color: "#1877F2" },
  { value: "TikTok Ads",   label: "⚫ TikTok Ads",   color: "#000000" },
  { value: "Google Ads",   label: "🔴 Google Ads",   color: "#EA4335" },
  { value: "Snapchat Ads", label: "🟡 Snapchat Ads", color: "#FFFC00" },
];

const SOURCE_COLORS: Record<string, string> = {
  "Facebook Ads":  "bg-blue-100 text-blue-700 border-blue-200",
  "TikTok Ads":    "bg-gray-100 text-gray-800 border-gray-300",
  "Google Ads":    "bg-red-100 text-red-700 border-red-200",
  "Snapchat Ads":  "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export default function Publicites() {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isMediaBuyer = user?.role === 'media_buyer';

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [productId, setProductId] = useState("none");
  const [source, setSource] = useState("none");
  const [notes, setNotes] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: mbEntries = [], isLoading: loadingMb } = useQuery<any[]>({
    queryKey: ['/api/marketing-spend', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const res = await fetch(`/api/marketing-spend${p.toString() ? `?${p}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isMediaBuyer,
  });

  const { data: adminData, isLoading: loadingAdmin } = useQuery<{ entries: any[]; byProduct: any[] }>({
    queryKey: ['/api/marketing-spend/admin', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const res = await fetch(`/api/marketing-spend/admin${p.toString() ? `?${p}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: profitData } = useQuery<{ revenue: number; productCost: number; shippingCost: number; packagingCost: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number }>({
    queryKey: ['/api/media-buyer/profit', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const res = await fetch(`/api/media-buyer/profit${p.toString() ? `?${p}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isMediaBuyer,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!date || !amount) throw new Error("Date et montant requis");
      if (source === 'none') throw new Error("Veuillez sélectionner une source");
      const res = await apiRequest("POST", "/api/marketing-spend", {
        date, amount, source,
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
      toast({ title: "Dépense ajoutée", description: "Dépense publicitaire enregistrée avec succès." });
      setAmount("");
      setNotes("");
      setSource("none");
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
      queryClient.invalidateQueries({ queryKey: ['/api/marketing-spend/admin'] });
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyer/profit'] });
    },
  });

  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const entries = isAdmin ? (adminData?.entries || []) : mbEntries;
  const totalAdSpend = entries.reduce((s: number, e: any) => s + e.amount, 0);

  const bySource: Record<string, number> = {};
  for (const e of entries) {
    if (e.source) bySource[e.source] = (bySource[e.source] || 0) + e.amount;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-publicites-title">
          {isAdmin ? "Gestion des Publicités" : "Mes Publicités"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? "Vue complète de toutes les dépenses publicitaires par media buyer et par produit."
            : "Enregistrez vos dépenses pub quotidiennes et visualisez votre profit net en temps réel."}
        </p>
      </div>

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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 rounded-xl p-5 text-white" style={{ background: 'linear-gradient(135deg, hsl(220 72% 38%), hsl(220 72% 28%))' }} data-testid="card-total-spend">
          <div className="flex items-center gap-2 mb-2 opacity-90">
            <Megaphone className="w-4 h-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Total Dépenses Pub</p>
          </div>
          <p className="text-3xl font-extrabold">{formatCurrency(totalAdSpend)}</p>
          <p className="text-xs opacity-70 mt-1">{entries.length} entrée(s)</p>
        </div>
        {isMediaBuyer && profitData && (
          <>
            <div className="rounded-xl p-5 text-white" style={{ background: profitData.roi >= 0 ? '#16a34a' : '#dc2626' }} data-testid="card-roi">
              <div className="flex items-center gap-2 mb-2 opacity-90">
                <TrendingUp className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">ROI</p>
              </div>
              <p className="text-3xl font-extrabold">{profitData.adSpend > 0 ? `${profitData.roi.toFixed(1)}%` : '∞'}</p>
              <p className="text-xs opacity-70 mt-1">{formatCurrency(profitData.revenue)} revenu</p>
            </div>
            <div className="rounded-xl p-5" style={{ background: profitData.netProfit >= 0 ? '#f0fdf4' : '#fef2f2', border: profitData.netProfit >= 0 ? '1px solid #bbf7d0' : '1px solid #fecaca' }} data-testid="card-net-profit">
              <div className="flex items-center gap-2 mb-2" style={{ color: profitData.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                <Wallet className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Profit Net</p>
              </div>
              <p className="text-3xl font-extrabold" style={{ color: profitData.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(profitData.netProfit)}</p>
              <p className="text-xs text-muted-foreground mt-1">{profitData.deliveredCount} livrées</p>
            </div>
          </>
        )}
        {isAdmin && (
          <>
            <div className="rounded-xl p-5 bg-muted/50 border border-border/50" data-testid="card-buyers-count">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Media Buyers</p>
              </div>
              <p className="text-3xl font-extrabold">{new Set(entries.filter((e: any) => e.mediaBuyerId).map((e: any) => e.mediaBuyerId)).size}</p>
            </div>
            <div className="rounded-xl p-5 bg-muted/50 border border-border/50" data-testid="card-products-count">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Package className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Produits Ciblés</p>
              </div>
              <p className="text-3xl font-extrabold">{adminData?.byProduct?.length ?? 0}</p>
            </div>
          </>
        )}
      </div>

      {/* Per-source breakdown */}
      {Object.keys(bySource).length > 0 && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Répartition par Source
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(bySource).map(([src, total]) => (
                <div key={src} className="rounded-lg p-3 border border-border/50 bg-card">
                  <Badge variant="outline" className={`text-[10px] mb-2 ${SOURCE_COLORS[src] || ''}`}>{src}</Badge>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(total)}</p>
                  <p className="text-xs text-muted-foreground">{entries.filter((e: any) => e.source === src).length} entrée(s)</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-product totals (admin only) */}
      {isAdmin && adminData?.byProduct && adminData.byProduct.length > 0 && (
        <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Total par Produit
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-xs font-bold uppercase">Produit</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Entrées</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Total Dépensé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminData.byProduct.sort((a: any, b: any) => b.total - a.total).map((row: any, i: number) => (
                  <TableRow key={i} data-testid={`row-product-spend-${i}`}>
                    <TableCell className="font-medium text-sm">{row.productName}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{row.entries}</Badge></TableCell>
                    <TableCell className="text-right font-bold text-destructive text-sm">-{formatCurrency(row.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Add New Entry Form (Media Buyer only) */}
      {isMediaBuyer && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-primary" />
              Ajouter une Dépense Publicitaire
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date *</label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-10 text-sm"
                  data-testid="input-spend-date"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source *</label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-10 text-sm" data-testid="select-spend-source">
                    <SelectValue placeholder="Choisir la plateforme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choisir...</SelectItem>
                    {AD_SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produit</label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="h-10 text-sm" data-testid="select-spend-product">
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
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Montant (DH) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 500.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="h-10 text-sm"
                  data-testid="input-spend-amount"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <Input
                  placeholder="Optionnel"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="h-10 text-sm"
                  data-testid="input-spend-notes"
                />
              </div>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !date || !amount || source === 'none'}
                className="h-10 text-white font-bold shadow-md"
                style={{ background: '#C5A059' }}
                data-testid="button-add-spend"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" />
                {addMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              {isAdmin ? "Toutes les Dépenses" : "Historique des Dépenses"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{entries.length} entrées</Badge>
              {entries.length > 0 && (
                <span className="text-xs font-bold text-destructive">Total: -{formatCurrency(totalAdSpend)}</span>
              )}
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                {isAdmin && <TableHead className="text-xs font-bold uppercase">Media Buyer</TableHead>}
                <TableHead className="text-xs font-bold uppercase">Source</TableHead>
                <TableHead className="text-xs font-bold uppercase">Produit</TableHead>
                <TableHead className="text-xs font-bold uppercase text-right">Montant</TableHead>
                {!isAdmin && <TableHead className="text-xs font-bold uppercase">Notes</TableHead>}
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isAdmin ? loadingAdmin : loadingMb) ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(isAdmin ? 6 : 6)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 6} className="text-center text-muted-foreground py-12 text-sm">
                    <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Aucune dépense publicitaire enregistrée.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry: any) => (
                  <TableRow key={entry.id} data-testid={`row-spend-${entry.id}`} className="hover:bg-muted/20">
                    <TableCell className="font-medium text-sm tabular-nums">{entry.date}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="text-xs">{entry.buyerName || '—'}</Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      {entry.source ? (
                        <Badge variant="outline" className={`text-[10px] font-semibold ${SOURCE_COLORS[entry.source] || 'bg-muted'}`}>
                          {entry.source}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.productId
                        ? (entry.productName || productMap.get(entry.productId) || `#${entry.productId}`)
                        : <span className="italic text-xs">Tous</span>}
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive text-sm tabular-nums">
                      -{formatCurrency(entry.amount)}
                    </TableCell>
                    {!isAdmin && (
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {entry.notes || '—'}
                      </TableCell>
                    )}
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
      </Card>

      {/* MB Cost Breakdown */}
      {isMediaBuyer && profitData && (
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold">Détail du Calcul de Profit</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="space-y-2 max-w-sm">
              {[
                { label: "Revenu (livrées)", value: profitData.revenue, positive: true },
                { label: "Coût produits", value: -profitData.productCost },
                { label: "Frais de livraison", value: -profitData.shippingCost },
                { label: "Coût emballage", value: -profitData.packagingCost },
                { label: "Dépenses publicitaires", value: -profitData.adSpend },
              ].map(({ label, value, positive }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-semibold ${positive ? 'text-green-600' : 'text-destructive'}`}>
                    {positive ? '+' : ''}{formatCurrency(Math.abs(value))}
                  </span>
                </div>
              ))}
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

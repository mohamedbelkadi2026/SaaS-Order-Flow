import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Plus, Trash2, X, TrendingUp, Wallet, BarChart3, Calendar } from "lucide-react";

const AD_SOURCES = ["Facebook Ads", "Google Ads", "TikTok Ads", "Snapchat Ads"];
const GOLD = "#C5A059";

const SOURCE_STYLES: Record<string, string> = {
  "Facebook Ads":  "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  "Google Ads":    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  "TikTok Ads":    "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300",
  "Snapchat Ads":  "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300",
};

type Tab = "source" | "produit";

const defaultFilters = { source: "all", productId: "all", dateFrom: "", dateTo: "" };

export default function Publicites() {
  const { user } = useAuth();
  const { data: products = [] } = useProducts();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const [tab, setTab] = useState<Tab>("source");
  const [filters, setFilters] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    source: AD_SOURCES[0],
    productId: "none",
    amount: "",
    productSellingPrice: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: storeData } = useQuery<any>({ queryKey: ["/api/store"] });
  const storeName = storeData?.name || "Mon Site";

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/publicites", tab, applied],
    queryFn: async () => {
      const p = new URLSearchParams({ tab });
      if (applied.source !== "all") p.set("source", applied.source);
      if (applied.productId !== "all") p.set("productId", applied.productId);
      if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) p.set("dateTo", applied.dateTo);
      const res = await fetch(`/api/publicites?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur serveur");
      return res.json();
    },
  });

  const totalCents = entries.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/publicites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/publicites"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      toast({ title: "Supprimé avec succès" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  function applyFilters() {
    setApplied({ ...filters });
  }

  function resetAndSwitchTab(t: Tab) {
    setTab(t);
    const f = defaultFilters;
    setFilters(f);
    setApplied(f);
  }

  function openModal() {
    setForm({ date: new Date().toISOString().split("T")[0], source: AD_SOURCES[0], productId: "none", amount: "", productSellingPrice: "" });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.date || !form.source || !form.amount) {
      toast({ title: "Champs requis manquants", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body: any = { date: form.date, source: form.source, amount: Number(form.amount) };
      if (tab === "produit" && form.productId !== "none") body.productId = Number(form.productId);
      if (tab === "produit" && form.productSellingPrice) body.productSellingPrice = Number(form.productSellingPrice);
      await apiRequest("POST", "/api/publicites", body);
      qc.invalidateQueries({ queryKey: ["/api/publicites"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      toast({ title: "Dépense enregistrée", description: `${form.amount} DH — ${form.source}` });
      setModalOpen(false);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const summaryCards = [
    {
      label: "Total Dépenses",
      value: formatCurrency(totalCents),
      icon: Wallet,
      gradient: `linear-gradient(135deg, ${GOLD} 0%, #a8853f 60%, #8a6930 100%)`,
      white: true,
    },
    {
      label: tab === "source" ? "Sources actives" : "Produits sponsorisés",
      value: String([...new Set(entries.map((e: any) => tab === "source" ? e.source : e.productId))].filter(Boolean).length),
      icon: BarChart3,
      bg: "bg-card",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Entrées",
      value: String(entries.length),
      icon: Megaphone,
      bg: "bg-card",
      iconBg: "bg-amber-50 dark:bg-amber-950/20",
      iconColor: "text-amber-600",
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold uppercase tracking-tight" data-testid="text-publicites-title">
            Publicités
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Suivi des dépenses publicitaires par source et par produit</p>
        </div>
        {isAdmin && (
          <Button
            onClick={openModal}
            className="gap-2 rounded-lg"
            style={{ background: GOLD, color: "#fff" }}
            data-testid="btn-nouvelle"
          >
            <Plus className="w-4 h-4" />
            Nouvelle dépense
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaryCards.map((c, i) => (
          <Card
            key={i}
            className={cn("rounded-2xl border-border/50 shadow-sm overflow-hidden", !c.white && c.bg)}
            style={c.white ? { background: c.gradient } : undefined}
            data-testid={`summary-card-${i}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", c.white ? "bg-white/20" : c.iconBg)}>
                <c.icon className={cn("w-5 h-5", c.white ? "text-white" : c.iconColor)} />
              </div>
              <div>
                <p className={cn("text-xs font-semibold uppercase tracking-wide", c.white ? "text-white/80" : "text-muted-foreground")}>
                  {c.label}
                </p>
                <p className={cn("text-xl font-bold mt-0.5", c.white ? "text-white" : "text-foreground")}>
                  {c.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-border/60 flex gap-0">
        {(["source", "produit"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => resetAndSwitchTab(t)}
            data-testid={`tab-${t}`}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold border-b-2 transition-all",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "source" ? "📢 Par Source" : "📦 Par Produit"}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="rounded-xl border-border/50 shadow-sm p-2.5 sm:p-3" data-testid="filter-bar">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-center">
          {tab === "produit" && (
            <Select value={filters.productId} onValueChange={v => setFilters(f => ({ ...f, productId: v }))}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] h-8 text-xs bg-white dark:bg-card border-border/60" data-testid="filter-product">
                <SelectValue placeholder="Tous les Produits" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Produits</SelectItem>
                {(products as any[]).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.source} onValueChange={v => setFilters(f => ({ ...f, source: v }))}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] h-8 text-xs bg-white dark:bg-card border-border/60" data-testid="filter-source">
              <SelectValue placeholder="Source de traffic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              {AD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 border border-border/60 rounded-md px-2.5 bg-white dark:bg-card h-8">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="date"
              className="bg-transparent outline-none text-xs text-foreground w-[110px]"
              value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              data-testid="filter-date-from"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <input
              type="date"
              className="bg-transparent outline-none text-xs text-foreground w-[110px]"
              value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              data-testid="filter-date-to"
            />
          </div>

          <Button size="sm" onClick={applyFilters} className="h-8 px-4 text-xs" data-testid="btn-filtrer">
            Filtrer
          </Button>
          {(applied.source !== "all" || applied.productId !== "all" || applied.dateFrom || applied.dateTo) && (
            <Button size="sm" variant="ghost" onClick={() => { setFilters(defaultFilters); setApplied(defaultFilters); }} className="h-8 px-3 text-xs text-muted-foreground">
              Réinitialiser
            </Button>
          )}
        </div>
      </Card>

      {/* Desktop Table */}
      <div className="hidden md:block" data-testid="desktop-table">
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-bold uppercase tracking-wide">Site</TableHead>
                {tab === "produit" && <TableHead className="text-xs font-bold uppercase tracking-wide">Produit</TableHead>}
                <TableHead className="text-xs font-bold uppercase tracking-wide">Source</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide">Date</TableHead>
                {tab === "produit" && <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Prix Produit</TableHead>}
                <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Montant (DH)</TableHead>
                {isAdmin && <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(tab === "produit" ? 7 : 5)].map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tab === "produit" ? 7 : 5} className="h-40 text-center text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Megaphone className="w-8 h-8 opacity-30" />
                      <span>Aucune dépense trouvée pour cette période</span>
                      {isAdmin && (
                        <Button variant="outline" size="sm" onClick={openModal} className="mt-1 gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Ajouter une dépense
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e: any) => (
                  <TableRow key={e.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-${e.id}`}>
                    <TableCell className="text-sm font-medium">{storeName}</TableCell>
                    {tab === "produit" && (
                      <TableCell className="text-sm">
                        {e.productName
                          ? <span className="font-medium">{e.productName}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs font-medium border", SOURCE_STYLES[e.source] || "")}>
                        {e.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.date}</TableCell>
                    {tab === "produit" && (
                      <TableCell className="text-sm text-right">
                        {e.productSellingPrice
                          ? <span className="font-medium">{formatCurrency(e.productSellingPrice)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-bold text-sm">{formatCurrency(e.amount)}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMut.mutate(e.id)}
                          disabled={deleteMut.isPending}
                          data-testid={`btn-delete-${e.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {/* Total footer */}
          {entries.length > 0 && (
            <div className="border-t-2 border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between" data-testid="total-footer">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Dépenses</span>
              <span className="text-lg font-bold" style={{ color: GOLD }} data-testid="total-value">
                {formatCurrency(totalCents)}
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3 pb-6" data-testid="mobile-cards">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="rounded-xl border-border/50 p-4">
              <Skeleton className="h-4 w-1/2 mb-2 rounded" />
              <Skeleton className="h-6 w-1/3 rounded" />
            </Card>
          ))
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center gap-2">
            <Megaphone className="w-8 h-8 opacity-30" />
            <span>Aucune dépense pour cette période</span>
          </div>
        ) : (
          entries.map((e: any) => (
            <Card key={e.id} className="rounded-xl border-border/50 shadow-sm" data-testid={`card-mobile-${e.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="outline" className={cn("text-xs font-medium border", SOURCE_STYLES[e.source] || "")}>
                        {e.source}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                    </div>
                    {tab === "produit" && e.productName && (
                      <p className="text-sm font-medium truncate mb-1">{e.productName}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{storeName}</p>
                    {tab === "produit" && e.productSellingPrice && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Prix produit: <span className="font-medium text-foreground">{formatCurrency(e.productSellingPrice)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-base font-bold text-foreground">{formatCurrency(e.amount)}</span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMut.mutate(e.id)}
                        disabled={deleteMut.isPending}
                        data-testid={`btn-delete-mobile-${e.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
        {entries.length > 0 && (
          <div className="border border-border/50 rounded-xl bg-muted/20 px-4 py-3 flex items-center justify-between" data-testid="total-footer-mobile">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="text-base font-bold" style={{ color: GOLD }}>{formatCurrency(totalCents)}</span>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white dark:bg-card" data-testid="modal-add">
          {/* Header */}
          <div className="flex justify-between items-center px-6 pt-5 pb-4 border-b border-border/60">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Megaphone className="w-5 h-5" style={{ color: GOLD }} />
              {tab === "source" ? "Dépense par Source" : "Dépense par Produit"}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setModalOpen(false)} className="rounded-full h-8 w-8">
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="h-9 text-sm"
                data-testid="modal-date"
              />
            </div>

            {/* Product — Par Produit only */}
            {tab === "produit" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Produit</Label>
                <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="h-9 text-sm" data-testid="modal-product">
                    <SelectValue placeholder="Sélectionner un produit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun produit —</SelectItem>
                    {(products as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Source */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Source de traffic</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger className="h-9 text-sm" data-testid="modal-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Montant dépensé (DH)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 150"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-9 text-sm"
                data-testid="modal-amount"
              />
            </div>

            {/* Product selling price — Par Produit only */}
            {tab === "produit" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Prix de vente produit (DH) <span className="text-muted-foreground font-normal text-xs">(optionnel)</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 299"
                  value={form.productSellingPrice}
                  onChange={e => setForm(f => ({ ...f, productSellingPrice: e.target.value }))}
                  className="h-9 text-sm"
                  data-testid="modal-selling-price"
                />
              </div>
            )}

            {/* Summary preview */}
            {form.amount && (
              <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Dépense à enregistrer</span>
                <span className="font-bold text-sm" style={{ color: GOLD }}>
                  {Number(form.amount).toLocaleString("fr-MA")} DH
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="rounded-lg" data-testid="modal-cancel">
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg gap-2 font-semibold"
              style={{ background: GOLD, color: "#fff" }}
              data-testid="modal-valider"
            >
              {saving ? "Enregistrement..." : "Valider"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

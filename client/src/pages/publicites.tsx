import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts, useAgents, useMagasins } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, Plus, Trash2, X, Wallet, BarChart3, Calendar, Users, Upload, FileSpreadsheet, ArrowRight, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

const AD_SOURCES = ["Facebook Ads", "Google Ads", "TikTok Ads", "Snapchat Ads"];
const GOLD = "#C5A059";

// ── Import helpers ────────────────────────────────────────────────────────
function normCampaign(s: string): string {
  return s.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// Platform-aware column finders with hard exclusions for metric columns
function findCampaignCol(headers: string[]): string | null {
  const n = (h: string) => h.toLowerCase().trim();
  const isMetric = (h: string) => { const hn = n(h); return hn.includes(" per ") || hn.includes("cpm") || hn.includes("cpc") || hn.startsWith("cost"); };
  return headers.find(x => !isMetric(x) && (n(x).includes("campaign name") || n(x).includes("nom de la campagne") || n(x) === "campagne" || n(x) === "campaign")) ?? null;
}

function findSpendCol(headers: string[]): string | null {
  const n = (h: string) => h.toLowerCase().trim();
  // 1) Facebook exact: "Amount spent (USD)" / "Amount spent (MAD)" etc.
  let h = headers.find(x => n(x).includes("amount spent")); if (h) return h;
  // 2) French Facebook
  h = headers.find(x => n(x).includes("montant dépensé") || n(x).includes("montant depense")); if (h) return h;
  // 3) Google / TikTok totals
  h = headers.find(x => /total\s*(cost|spent|spend)/.test(n(x))); if (h) return h;
  // 4) Bare spend keyword (exact)
  h = headers.find(x => ["spend", "dépenses", "depenses"].includes(n(x))); if (h) return h;
  // 5) "cost" alone — but NEVER "cost per …", cpm, cpc
  h = headers.find(x => { const hn = n(x); return hn.includes("cost") && !hn.includes("per") && !hn.includes("cpm") && !hn.includes("cpc"); }); return h ?? null;
}

function findDateCol(headers: string[]): string | null {
  const n = (h: string) => h.toLowerCase().trim();
  const isMetric = (h: string) => { const hn = n(h); return hn.includes("per") || hn.includes("cpm") || hn.includes("cpc") || hn.includes("cost") || hn.includes("spend"); };
  return headers.find(x => !isMetric(x) && (n(x).includes("reporting starts") || n(x) === "day" || n(x) === "date" || n(x) === "jour")) ?? null;
}

function fuzzyProduct(campaignNorm: string, products: any[]): number | null {
  let best: { id: number; score: number } | null = null;
  for (const p of products) {
    const pNorm = normCampaign(p.name);
    const tokens = pNorm.split(" ").filter(t => t.length > 2);
    const score = tokens.filter(t => campaignNorm.includes(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: p.id, score };
  }
  return best ? best.id : null;
}

interface ParsedRow { campaign: string; amountUsd: number; date: string; }

const SOURCE_STYLES: Record<string, string> = {
  "Facebook Ads": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  "Google Ads":   "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  "TikTok Ads":   "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300",
  "Snapchat Ads": "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300",
};

type Tab = "source" | "produit";
const defaultFilters = { source: "all", productId: "all", dateFrom: "", dateTo: "", userId: "all", magasinId: "all" };

export default function Publicites() {
  const { user } = useAuth();
  const { data: products = [] } = useProducts();
  const { data: agents = [] } = useAgents();
  const { data: magasins = [] } = useMagasins();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const isMediaBuyer = user?.role === "media_buyer";

  const [tab, setTab] = useState<Tab>("source");
  const [filters, setFilters] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    source: AD_SOURCES[0],
    productId: "none",
    amount: "",
    productSellingPrice: "",
    magasinId: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: storeData } = useQuery<any>({ queryKey: ["/api/store"] });
  const storeName = storeData?.name || "Mon Site";

  // All users (for admin filter dropdown)
  const mediaBuyers = (agents as any[]).filter((a: any) => a.role === "media_buyer" || a.role === "owner" || a.role === "admin");

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/publicites", tab, applied],
    queryFn: async () => {
      const p = new URLSearchParams({ tab });
      if (applied.source !== "all") p.set("source", applied.source);
      if (applied.productId !== "all") p.set("productId", applied.productId);
      if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) p.set("dateTo", applied.dateTo);
      if (isAdmin && applied.userId !== "all") p.set("userId", applied.userId);
      if (applied.magasinId !== "all") p.set("magasinId", applied.magasinId);
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
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  function applyFilters() { setApplied({ ...filters }); }
  function resetAndSwitchTab(t: Tab) {
    setTab(t);
    setFilters(defaultFilters);
    setApplied(defaultFilters);
  }
  function openModal() {
    // Preset modal magasin to whatever is selected in the top filter — saves
    // a click for the common "I'm filtering by Anakio, add an Anakio expense" flow.
    setForm({
      date: new Date().toISOString().split("T")[0],
      source: AD_SOURCES[0],
      productId: "none",
      amount: "",
      productSellingPrice: "",
      magasinId: filters.magasinId !== "all" ? filters.magasinId : "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.date || !form.source || !form.amount) {
      toast({ title: "Veuillez remplir tous les champs requis", variant: "destructive" }); return;
    }
    if (!form.magasinId) {
      toast({ title: "Veuillez sélectionner un magasin", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body: any = { date: form.date, source: form.source, amount: Number(form.amount), magasinId: Number(form.magasinId) };
      if (tab === "produit" && form.productId !== "none") body.productId = Number(form.productId);
      if (tab === "produit" && form.productSellingPrice) body.productSellingPrice = Number(form.productSellingPrice);
      await apiRequest("POST", "/api/publicites", body);
      qc.invalidateQueries({ queryKey: ["/api/publicites"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      qc.invalidateQueries({ queryKey: ["/api/media-buyer/profit"] });
      toast({ title: "Dépense enregistrée", description: `${form.amount} DH — ${form.source}` });
      setModalOpen(false);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const uniqueSources = Array.from(new Set(entries.map((e: any) => e.source))).filter(Boolean).length;
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
      value: String(uniqueSources),
      icon: BarChart3,
      bg: "bg-card",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: isAdmin ? "Entrées (équipe)" : "Mes entrées",
      value: String(entries.length),
      icon: isAdmin ? Users : Megaphone,
      bg: "bg-card",
      iconBg: "bg-amber-50 dark:bg-amber-950/20",
      iconColor: "text-amber-600",
    },
  ];

  // +1 for the new Magasin column (shown to all users)
  const colCount = tab === "produit" ? (isAdmin ? 8 : 7) : (isAdmin ? 6 : 5);

  // Pass products + magasins down via closure so ImportAdSpendModal can use them
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold uppercase tracking-tight" data-testid="text-publicites-title">
            Publicités
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isAdmin ? "Suivi global des dépenses publicitaires" : "Vos dépenses publicitaires personnelles"}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "produit" && (
            <Button onClick={() => setImportOpen(true)} variant="outline" className="gap-2 rounded-lg font-semibold border-border/60" data-testid="btn-importer">
              <Upload className="w-4 h-4" />
              Importer
            </Button>
          )}
          <Button onClick={openModal} className="gap-2 rounded-lg font-semibold" style={{ background: GOLD, color: "#fff" }} data-testid="btn-nouvelle">
            <Plus className="w-4 h-4" />
            {isMediaBuyer ? "Ajouter ma dépense" : "Nouvelle dépense"}
          </Button>
        </div>
      </div>

      {/* Media Buyer privacy notice */}
      {isMediaBuyer && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>Vous ne voyez que vos propres dépenses publicitaires. Vos données sont privées.</span>
        </div>
      )}

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
                <p className={cn("text-xs font-semibold uppercase tracking-wide", c.white ? "text-white/80" : "text-muted-foreground")}>{c.label}</p>
                <p className={cn("text-xl font-bold mt-0.5", c.white ? "text-white" : "text-foreground")}>{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-border/60 flex gap-0">
        {(["source", "produit"] as Tab[]).map(t => (
          <button key={t} onClick={() => resetAndSwitchTab(t)} data-testid={`tab-${t}`}
            className={cn("px-5 py-2.5 text-sm font-semibold border-b-2 transition-all",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t === "source" ? "📢 Par Source" : "📦 Par Produit"}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="rounded-xl border-border/50 shadow-sm p-2.5 sm:p-3" data-testid="filter-bar">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-center">
          {/* Admin user filter */}
          {isAdmin && (
            <Select value={filters.userId} onValueChange={v => setFilters(f => ({ ...f, userId: v }))}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[170px] h-8 text-xs bg-white dark:bg-card border-border/60" data-testid="filter-user">
                <SelectValue placeholder="Tous les utilisateurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les utilisateurs</SelectItem>
                {mediaBuyers.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.username} ({u.role === "owner" ? "Admin" : u.role === "media_buyer" ? "Media Buyer" : u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {tab === "produit" && (
            <Select value={filters.productId} onValueChange={v => setFilters(f => ({ ...f, productId: v }))}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] h-8 text-xs bg-white dark:bg-card border-border/60" data-testid="filter-product">
                <SelectValue placeholder="Tous les Produits" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Produits</SelectItem>
                {(products as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.magasinId} onValueChange={v => setFilters(f => ({ ...f, magasinId: v }))}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] h-8 text-xs bg-white dark:bg-card border-border/60" data-testid="filter-magasin">
              <SelectValue placeholder="Tous les magasins" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les magasins</SelectItem>
              {(magasins as any[]).map((m: any) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            <input type="date" className="bg-transparent outline-none text-xs text-foreground w-[108px]"
              value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} data-testid="filter-date-from" />
            <span className="text-muted-foreground text-xs">–</span>
            <input type="date" className="bg-transparent outline-none text-xs text-foreground w-[108px]"
              value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} data-testid="filter-date-to" />
          </div>

          <Button size="sm" onClick={applyFilters} className="h-8 px-4 text-xs" data-testid="btn-filtrer">Filtrer</Button>
          {(applied.source !== "all" || applied.productId !== "all" || applied.dateFrom || applied.dateTo || applied.userId !== "all" || applied.magasinId !== "all") && (
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
                {isAdmin && <TableHead className="text-xs font-bold uppercase tracking-wide">Ajouté par</TableHead>}
                <TableHead className="text-xs font-bold uppercase tracking-wide">Magasin</TableHead>
                {tab === "produit" && <TableHead className="text-xs font-bold uppercase tracking-wide">Produit</TableHead>}
                <TableHead className="text-xs font-bold uppercase tracking-wide">Source</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide">Date</TableHead>
                {tab === "produit" && <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Prix Produit</TableHead>}
                <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Montant (DH)</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(colCount)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>)}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-40 text-center text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Megaphone className="w-8 h-8 opacity-30" />
                      <span>Aucune dépense trouvée pour cette période</span>
                      <Button variant="outline" size="sm" onClick={openModal} className="mt-1 gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Ajouter une dépense
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : entries.map((e: any) => (
                <TableRow key={e.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-${e.id}`}>
                  {isAdmin && (
                    <TableCell className="text-sm">
                      <span className="font-medium">{e.userName || "Inconnu"}</span>
                    </TableCell>
                  )}
                  <TableCell className="text-sm" data-testid={`cell-magasin-${e.id}`}>
                    {e.magasinName || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {tab === "produit" && (
                    <TableCell className="text-sm">{e.productName || <span className="text-muted-foreground">—</span>}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs font-medium border", SOURCE_STYLES[e.source] || "")}>
                      {e.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.date}</TableCell>
                  {tab === "produit" && (
                    <TableCell className="text-sm text-right">
                      {e.productSellingPrice ? formatCurrency(e.productSellingPrice) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-bold text-sm" style={{ color: GOLD }} data-testid={`amount-${e.id}`}>
                    {formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(isAdmin || e.userId === user?.id) && (
                      <Button variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMut.mutate(e.id)}
                        disabled={deleteMut.isPending}
                        data-testid={`btn-delete-${e.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {entries.length > 0 && (
            <div className="border-t-2 border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between" data-testid="total-footer">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Total {isAdmin && applied.userId !== "all" ? `— ${mediaBuyers.find((u: any) => String(u.id) === applied.userId)?.username || ""}` : ""}
              </span>
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
              <Skeleton className="h-4 w-1/2 mb-2 rounded" /><Skeleton className="h-6 w-1/3 rounded" />
            </Card>
          ))
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center gap-2">
            <Megaphone className="w-8 h-8 opacity-30" />
            <span>Aucune dépense pour cette période</span>
            <Button variant="outline" size="sm" onClick={openModal} className="mt-1 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </Button>
          </div>
        ) : entries.map((e: any) => (
          <Card key={e.id} className="rounded-xl border-border/50 shadow-sm" data-testid={`card-mobile-${e.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge variant="outline" className={cn("text-xs font-medium border", SOURCE_STYLES[e.source] || "")}>{e.source}</Badge>
                    <span className="text-xs text-muted-foreground">{e.date}</span>
                  </div>
                  {isAdmin && <p className="text-xs font-semibold text-foreground mb-0.5">{e.userName || "Inconnu"}</p>}
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Magasin: <span className="font-medium text-foreground">{e.magasinName || "—"}</span>
                  </p>
                  {tab === "produit" && e.productName && <p className="text-sm font-medium truncate mb-1">{e.productName}</p>}
                  {tab === "produit" && e.productSellingPrice && (
                    <p className="text-xs text-muted-foreground">Prix produit: <span className="font-medium">{formatCurrency(e.productSellingPrice)}</span></p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-base font-bold" style={{ color: GOLD }}>{formatCurrency(e.amount)}</span>
                  {(isAdmin || e.userId === user?.id) && (
                    <Button variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMut.mutate(e.id)} disabled={deleteMut.isPending}
                      data-testid={`btn-delete-mobile-${e.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length > 0 && (
          <div className="border border-border/50 rounded-xl bg-muted/20 px-4 py-3 flex items-center justify-between" data-testid="total-footer-mobile">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="text-base font-bold" style={{ color: GOLD }}>{formatCurrency(totalCents)}</span>
          </div>
        )}
      </div>

      {/* Import Modal */}
      <ImportAdSpendModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        products={products as any[]}
        magasins={magasins as any[]}
      />

      {/* Add Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white dark:bg-card" data-testid="modal-add">
          <div className="flex justify-between items-center px-6 pt-5 pb-4 border-b border-border/60">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Megaphone className="w-5 h-5" style={{ color: GOLD }} />
              {tab === "source" ? "Dépense par Source" : "Dépense par Produit"}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setModalOpen(false)} className="rounded-full h-8 w-8">
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">
                Magasin <span className="text-red-500">*</span>
              </Label>
              <Select value={form.magasinId} onValueChange={v => setForm(f => ({ ...f, magasinId: v }))}>
                <SelectTrigger className="h-9 text-sm" data-testid="modal-magasin">
                  <SelectValue placeholder="Sélectionner un magasin" />
                </SelectTrigger>
                <SelectContent>
                  {(magasins as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" data-testid="modal-date" />
            </div>
            {tab === "produit" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Produit</Label>
                <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="h-9 text-sm" data-testid="modal-product">
                    <SelectValue placeholder="Sélectionner un produit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun produit —</SelectItem>
                    {(products as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Montant dépensé (DH)</Label>
              <Input type="number" min="0" step="0.01" placeholder="Ex: 150"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-9 text-sm" data-testid="modal-amount" />
            </div>
            {tab === "produit" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Prix de vente produit (DH) <span className="text-muted-foreground font-normal text-xs">(optionnel)</span>
                </Label>
                <Input type="number" min="0" step="0.01" placeholder="Ex: 299"
                  value={form.productSellingPrice} onChange={e => setForm(f => ({ ...f, productSellingPrice: e.target.value }))}
                  className="h-9 text-sm" data-testid="modal-selling-price" />
              </div>
            )}
            {form.amount && (
              <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">À enregistrer</span>
                <span className="font-bold text-sm" style={{ color: GOLD }}>{Number(form.amount).toLocaleString("fr-MA")} DH</span>
              </div>
            )}
          </div>
          <div className="px-6 pb-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="rounded-lg" data-testid="modal-cancel">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-lg gap-2 font-semibold"
              style={{ background: GOLD, color: "#fff" }} data-testid="modal-valider">
              {saving ? "Enregistrement..." : "Valider"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Import Ad Spend Modal ─────────────────────────────────────────────────

interface ImportAdSpendModalProps {
  open: boolean;
  onClose: () => void;
  products: any[];
  magasins: any[];
}

function ImportAdSpendModal({ open, onClose, products, magasins }: ImportAdSpendModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRowsRef = useRef<any[]>([]);
  const today = new Date().toISOString().split("T")[0];

  const [source, setSource] = useState(AD_SOURCES[0]);
  const [magasinId, setMagasinId] = useState("");
  const [taux, setTaux] = useState(10.0);
  const [fallbackDate, setFallbackDate] = useState(today);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [colOverrides, setColOverrides] = useState<{ campaign: string | null; spend: string | null; date: string | null }>({ campaign: null, spend: null, date: null });
  const [mapping, setMapping] = useState<Record<string, number | "none">>({});
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const { data: savedMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/publicites/campaign-map"],
    enabled: open,
  });

  // Fetch live USD→MAD rate when modal opens
  useEffect(() => {
    if (!open) return;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then(d => { if (d.rates?.MAD) setTaux(parseFloat(d.rates.MAD.toFixed(4))); })
      .catch(() => {});
  }, [open]);

  // Pre-fill mapping when rows + savedMap are ready
  useEffect(() => {
    if (parsedRows.length === 0) return;
    const newMapping: Record<string, number | "none"> = {};
    for (const r of parsedRows) {
      const norm = normCampaign(r.campaign);
      if (savedMap[norm] !== undefined) {
        newMapping[r.campaign] = savedMap[norm];
      } else {
        const fuzz = fuzzyProduct(norm, products);
        newMapping[r.campaign] = fuzz ?? "none";
      }
    }
    setMapping(newMapping);
  }, [parsedRows, savedMap, products]);

  function aggregateRows(rows: any[], campaignCol: string, spendCol: string, dateCol: string | null) {
    const agg: Record<string, ParsedRow> = {};
    for (const row of rows) {
      const campaign = String(row[campaignCol] || "").trim();
      if (!campaign) continue;
      const rawSpend = String(row[spendCol] || "0").replace(/[^0-9.-]/g, "");
      const spend = parseFloat(rawSpend) || 0;
      const date = dateCol ? String(row[dateCol] || "").trim().slice(0, 10) : "";
      const key = campaign + "||" + date;
      if (!agg[key]) agg[key] = { campaign, amountUsd: 0, date };
      agg[key].amountUsd += spend;
    }
    setParsedRows(Object.values(agg).filter(r => r.amountUsd > 0));
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
    if (rows.length === 0) { toast({ title: "Fichier vide ou illisible", variant: "destructive" }); return; }

    const headers = Object.keys(rows[0]);
    fileRowsRef.current = rows;
    setFileHeaders(headers);

    const campaignCol = findCampaignCol(headers);
    const spendCol = findSpendCol(headers);
    const dateCol = findDateCol(headers);

    setColOverrides({ campaign: campaignCol, spend: spendCol, date: dateCol });
    if (campaignCol && spendCol) {
      aggregateRows(rows, campaignCol, spendCol, dateCol);
    }
  }

  function reparse(overrides?: Partial<typeof colOverrides>) {
    const cols = { ...colOverrides, ...overrides };
    const rows = fileRowsRef.current;
    if (rows.length > 0 && cols.campaign && cols.spend) {
      aggregateRows(rows, cols.campaign, cols.spend, cols.date);
    }
  }

  async function handleImport() {
    if (!magasinId) { toast({ title: "Sélectionnez un magasin", variant: "destructive" }); return; }
    if (taux <= 0) { toast({ title: "Le taux de change doit être supérieur à 0", variant: "destructive" }); return; }
    if (parsedRows.length === 0) { toast({ title: "Aucune ligne à importer", variant: "destructive" }); return; }

    setImporting(true);
    try {
      const rows = parsedRows.map(r => ({
        date: r.date || fallbackDate,
        amount: parseFloat((r.amountUsd * taux).toFixed(2)),
        productId: mapping[r.campaign] !== "none" ? Number(mapping[r.campaign]) : null,
        campaignName: r.campaign,
      }));

      const res = await fetch("/api/publicites/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ magasinId: Number(magasinId), source, rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erreur serveur" }));
        throw new Error(err.message || "Erreur serveur");
      }
      const data = await res.json();
      toast({ title: `${data.inserted} dépenses importées · ${data.mapped} campagnes liées` });
      qc.invalidateQueries({ queryKey: ["/api/publicites"] });
      qc.invalidateQueries({ queryKey: ["/api/publicites/campaign-map"] });
      handleClose();
    } catch (e: any) {
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setParsedRows([]);
    setFileHeaders([]);
    setColOverrides({ campaign: null, spend: null, date: null });
    setMapping({});
    setFileName("");
    fileRowsRef.current = [];
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  const totalDH = parsedRows.reduce((s, r) => s + r.amountUsd * taux, 0);
  const hasParsed = parsedRows.length > 0;
  const needsColPicker = hasParsed === false && fileHeaders.length > 0;
  const columnsOk = !!(colOverrides.campaign && colOverrides.spend);

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto p-0 border-none shadow-2xl rounded-2xl bg-white dark:bg-card" data-testid="modal-import">
        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-5 pb-4 border-b border-border/60 sticky top-0 bg-white dark:bg-card z-10">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" style={{ color: GOLD }} />
            Importer les dépenses publicitaires
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full h-8 w-8">
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Step A: Settings ─────────────────────────── */}
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Étape 1 — Paramètres</p>

            {/* File input */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Fichier CSV / Excel</Label>
              <div
                className="border-2 border-dashed border-border/60 rounded-xl p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileRef.current?.click()}
                data-testid="import-dropzone"
              >
                <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                {fileName
                  ? <p className="text-sm font-medium text-foreground">{fileName}</p>
                  : <p className="text-sm text-muted-foreground">Cliquez pour choisir un fichier <span className="font-medium">.csv, .xlsx, .xls</span></p>
                }
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                data-testid="import-file-input"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Source */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-9 text-sm" data-testid="import-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Magasin */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Magasin <span className="text-red-500">*</span></Label>
                <Select value={magasinId} onValueChange={setMagasinId}>
                  <SelectTrigger className="h-9 text-sm" data-testid="import-magasin">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {magasins.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* USD rate */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Taux USD → MAD</Label>
                <Input
                  type="number" min="0.01" step="0.01"
                  value={taux}
                  onChange={e => setTaux(parseFloat(e.target.value) || 10)}
                  className="h-9 text-sm"
                  data-testid="import-taux"
                />
                <p className="text-xs text-muted-foreground">Montants en USD convertis en DH avec ce taux.</p>
              </div>

              {/* Fallback date */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Date (si absente du fichier)</Label>
                <Input
                  type="date" value={fallbackDate}
                  onChange={e => setFallbackDate(e.target.value)}
                  className="h-9 text-sm"
                  data-testid="import-date"
                />
              </div>
            </div>
          </div>

          {/* ── Spend column override (always shown after file is loaded) ── */}
          {fileHeaders.length > 0 && (
            <div className={cn(
              "rounded-xl border p-4 space-y-3",
              columnsOk
                ? "border-border/50 bg-muted/10"
                : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
            )}>
              {!columnsOk && (
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Colonnes non détectées automatiquement — sélectionnez-les :</p>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Colonne Campagne</Label>
                  <Select value={colOverrides.campaign || ""} onValueChange={v => {
                    const next = { ...colOverrides, campaign: v };
                    setColOverrides(next);
                    reparse(next);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>{fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Colonne du montant (USD)</Label>
                  <Select value={colOverrides.spend || ""} onValueChange={v => {
                    const next = { ...colOverrides, spend: v };
                    setColOverrides(next);
                    reparse(next);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>{fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Colonne Date (optionnel)</Label>
                  <Select value={colOverrides.date || "__none__"} onValueChange={v => {
                    const next = { ...colOverrides, date: v === "__none__" ? null : v };
                    setColOverrides(next);
                    reparse(next);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aucune" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Aucune —</SelectItem>
                      {fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!columnsOk && colOverrides.campaign && colOverrides.spend && (
                <Button size="sm" onClick={() => reparse()} className="gap-1.5" style={{ background: GOLD, color: "#fff" }}>
                  <ArrowRight className="w-3.5 h-3.5" /> Analyser le fichier
                </Button>
              )}
            </div>
          )}

          {/* ── Step B: Mapping table ────────────────────── */}
          {hasParsed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Étape 2 — Correspondances campagne → produit</p>
                <span className="text-xs font-bold" style={{ color: GOLD }}>Total : {totalDH.toFixed(2)} DH</span>
              </div>

              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide">Campagne</th>
                      <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wide">Montant (DH)</th>
                      <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide">Produit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => {
                      const dh = (r.amountUsd * taux).toFixed(2);
                      const isMapped = savedMap[normCampaign(r.campaign)] !== undefined;
                      return (
                        <tr key={i} className={cn("border-t border-border/40", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                          <td className="px-3 py-2 max-w-[200px]">
                            <p className="font-medium truncate" title={r.campaign}>{r.campaign}</p>
                            <p className="text-xs text-muted-foreground">${r.amountUsd.toFixed(2)}{r.date ? ` · ${r.date}` : ""}</p>
                            {isMapped && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold mt-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Mémorisée
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color: GOLD }}>{dh} DH</td>
                          <td className="px-3 py-2 min-w-[180px]">
                            <Select
                              value={mapping[r.campaign] !== undefined ? String(mapping[r.campaign]) : "none"}
                              onValueChange={v => setMapping(m => ({ ...m, [r.campaign]: v === "none" ? "none" : Number(v) }))}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`map-product-${i}`}>
                                <SelectValue placeholder="Aucun produit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— Aucun produit (ignorer) —</SelectItem>
                                {products.map((p: any) => (
                                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/20 border-t-2 border-border/60">
                    <tr>
                      <td className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{parsedRows.length} campagne(s)</td>
                      <td className="px-3 py-2 text-right font-bold text-base" style={{ color: GOLD }}>{totalDH.toFixed(2)} DH</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {Object.values(mapping).filter(v => v !== "none").length} liée(s)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end gap-2 border-t border-border/40 pt-4 sticky bottom-0 bg-white dark:bg-card">
          <Button variant="outline" onClick={handleClose} className="rounded-lg" data-testid="import-cancel">Annuler</Button>
          <Button
            onClick={handleImport}
            disabled={importing || !hasParsed || !magasinId || taux <= 0}
            className="rounded-lg gap-2 font-semibold"
            style={{ background: GOLD, color: "#fff" }}
            data-testid="import-confirm"
          >
            {importing ? "Importation..." : `Importer${hasParsed ? ` (${parsedRows.length})` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

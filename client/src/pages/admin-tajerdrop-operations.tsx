import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  AlertCircle, ArrowLeft, BarChart3, Check, CheckCircle2, ChevronRight,
  Clock3, FileText, Loader2, Package, Printer, RefreshCw, Search,
  ShieldCheck, ShoppingBag, TrendingUp, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";

const NAVY = "#0f1e38";
const NAVY2 = "#162847";
const GOLD = "#C5A059";

type OfferRequest = {
  id: number; status: string; cancelReason?: string | null; acceptedAt?: string | null; createdAt: string;
  seller: { id: number; name: string };
  product: { name: string; sku?: string; imageUrl?: string | null; productCost: number; stockLevel: string; category?: string | null };
};
type Invoice = {
  id: number; seller: { id: number; name: string }; periodFrom: string; periodTo: string;
  items: any[]; subtotal: number; vat: number; totalCashCollected: number; totalNet: number;
  processingStatus: string; paymentStatus: string; createdAt: string;
};
type SellerSnapshot = {
  sellerStoreId: number; sellerName: string; leads: number; confirmed: number; delivered: number;
  confirmationRate: number; deliveryRate: number; deliveredRevenue: number; productsInStock: number; lastLeadAt?: string | null;
};

function unwrap<T>(data: any): T {
  return (data?.data ?? data?.items ?? data) as T;
}
function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-MA", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function money(value?: number | null) {
  const n = Number(value ?? 0);
  return formatCurrency(Math.round(n));
}
function StatusPill({ value }: { value: string }) {
  const key = value?.toLowerCase();
  const style = key?.includes("pending") || key?.includes("draft")
    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
    : key?.includes("paid") || key?.includes("valid") || key?.includes("accept") || key?.includes("deliver")
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : key?.includes("reject") || key?.includes("cancel") || key?.includes("fail")
        ? "border-red-400/30 bg-red-400/10 text-red-300"
        : "border-white/15 bg-white/5 text-white/60";
  return <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider", style)}>{value || "—"}</span>;
}
function Stat({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,.045)", borderColor: "rgba(197,160,89,.18)" }}>
    <div className="flex items-center justify-between"><span className="text-[11px] uppercase tracking-wider text-white/45">{label}</span><Icon className="h-4 w-4" style={{ color: GOLD }} /></div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div><div className="mt-1 text-xs text-white/40">{detail}</div>
  </div>;
}

export default function AdminTajerDropOperations() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"offers" | "invoices" | "sellers">("offers");
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<OfferRequest | null>(null);
  const [reason, setReason] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [generator, setGenerator] = useState({ sellerStoreId: "", periodFrom: "", periodTo: "" });

  const offersQ = useQuery<OfferRequest[]>({ queryKey: ["/api/admin/offer-requests"], enabled: tab === "offers" });
  const invoicesQ = useQuery<Invoice[]>({ queryKey: ["/api/admin/seller-invoices"], enabled: tab === "invoices" });
  const sellersQ = useQuery<SellerSnapshot[]>({
    queryKey: ["/api/admin/tajerdrop/sellers"],
    enabled: tab === "sellers" || generateOpen,
  });
  const detailQ = useQuery<Invoice>({ queryKey: ["/api/admin/seller-invoices", detailId], enabled: !!detailId });
  const offers = unwrap<OfferRequest[]>(offersQ.data ?? []) || [];
  const invoices = unwrap<Invoice[]>(invoicesQ.data ?? []) || [];
  const sellers = unwrap<SellerSnapshot[]>(sellersQ.data ?? []) || [];

  const accept = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/offer-requests/${id}/accept`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/offer-requests"] }); toast({ title: "Demande acceptée" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e?.message || "Une erreur est survenue.", variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => apiRequest("PATCH", `/api/admin/offer-requests/${id}/reject`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/offer-requests"] }); setRejectTarget(null); setReason(""); toast({ title: "Demande refusée" }); },
    onError: (e: any) => toast({ title: "Refus impossible", description: e?.message, variant: "destructive" }),
  });
  const expire = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/offer-requests/expire-inactive"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/offer-requests"] }); toast({ title: "Contrôle d'expiration terminé" }); },
    onError: (e: any) => toast({ title: "Contrôle impossible", description: e?.message, variant: "destructive" }),
  });
  const invoiceAction = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "validate" | "mark-paid" }) => apiRequest("PATCH", `/api/admin/seller-invoices/${id}/${action}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/seller-invoices"] }); qc.invalidateQueries({ queryKey: ["/api/admin/seller-invoices", detailId] }); toast({ title: "Facture mise à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e?.message, variant: "destructive" }),
  });
  const generate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seller-invoices/generate", { sellerStoreId: Number(generator.sellerStoreId), periodFrom: generator.periodFrom, periodTo: generator.periodTo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/seller-invoices"] }); setGenerateOpen(false); toast({ title: "Facture générée" }); },
    onError: (e: any) => toast({ title: "Génération impossible", description: e?.message, variant: "destructive" }),
  });

  const pendingOffers = offers.filter(o => o.status?.toLowerCase() === "pending");
  const pendingInvoices = invoices.filter(i => !["paid", "validated"].includes(i.paymentStatus?.toLowerCase()));
  const filteredOffers = useMemo(() => offers.filter(o => `${o.seller.name} ${o.product.name} ${o.product.sku}`.toLowerCase().includes(search.toLowerCase())), [offers, search]);
  if (!(user as any)?.isSuperAdmin) return <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: NAVY }}><div className="text-center text-white"><AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" /><h1 className="text-xl font-semibold">Accès refusé</h1><Button className="mt-4" onClick={() => navigate("/")}>Retour</Button></div></div>;

  return <div className="min-h-[100dvh] text-white" style={{ background: NAVY }}>
    <header className="sticky top-0 z-30 border-b px-4 py-4 sm:px-7" style={{ background: `${NAVY}f2`, borderColor: "rgba(197,160,89,.22)" }}>
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        <div className="flex items-center gap-3"><button onClick={() => navigate("/super-admin")} className="text-white/45 hover:text-white"><ArrowLeft className="h-5 w-5" /></button><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(197,160,89,.14)" }}><ShieldCheck className="h-5 w-5" style={{ color: GOLD }} /></div><div><h1 className="font-semibold tracking-tight">TajerDrop <span style={{ color: GOLD }}>Operations</span></h1><p className="text-xs text-white/40">Décisions commerciales et règlement financier</p></div></div>
        <div className="hidden items-center gap-2 text-xs text-white/40 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Super Admin workspace</div>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[.2em]" style={{ color: GOLD }}>TajerDrop / Admin</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Centre de contrôle</h2><p className="mt-1 max-w-xl text-sm text-white/45">Traitez les demandes d'offre, clôturez les factures et surveillez la performance des vendeurs.</p></div><div className="flex gap-2"><Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => qc.invalidateQueries()}><RefreshCw className="mr-2 h-4 w-4" /> Actualiser</Button>{tab === "offers" && <Button style={{ background: GOLD, color: NAVY }} onClick={() => expire.mutate()} disabled={expire.isPending}><Clock3 className="mr-2 h-4 w-4" /> Contrôler les expirations</Button>}{tab === "invoices" && <Button style={{ background: GOLD, color: NAVY }} onClick={() => setGenerateOpen(true)}><FileText className="mr-2 h-4 w-4" /> Générer une facture</Button>}</div></div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat icon={ShoppingBag} label="Offres en attente" value={String(pendingOffers.length)} detail="Demandes à arbitrer" /><Stat icon={FileText} label="Factures ouvertes" value={String(pendingInvoices.length)} detail="À valider ou payer" /><Stat icon={Users} label="Vendeurs actifs" value={String(sellers.length)} detail="Snapshot opérationnel" /><Stat icon={TrendingUp} label="Cash livré" value={money(sellers.reduce((a, s) => a + Number(s.deliveredRevenue || 0), 0))} detail="Sur le portefeuille vendeur" /></div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border p-1" style={{ background: "rgba(255,255,255,.04)", borderColor: "rgba(197,160,89,.18)" }}>{[["offers", "Offer Requests", pendingOffers.length, ShoppingBag], ["invoices", "Seller Invoices", pendingInvoices.length, FileText], ["sellers", "Sellers", sellers.length, BarChart3]].map(([key, label, count, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={cn("flex min-w-[150px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition", tab === key ? "text-white" : "text-white/45 hover:text-white")} style={tab === key ? { background: "rgba(197,160,89,.16)", color: GOLD } : {}}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-white/10 px-1.5 text-[10px]">{count}</span></button>)}</div>
      {tab === "offers" && <section className="rounded-xl border" style={{ background: "rgba(255,255,255,.035)", borderColor: "rgba(197,160,89,.18)" }}><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "rgba(255,255,255,.08)" }}><div><h3 className="font-semibold">Demandes d'accès aux offres</h3><p className="text-xs text-white/40">Les validations modifient immédiatement les droits du seller.</p></div><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-white/35" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Seller, produit, SKU..." className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/30" /></div></div><div className="overflow-x-auto">{offersQ.isLoading ? <Loading /> : offersQ.isError ? <ErrorState /> : <table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-white/35"><th className="px-4 py-3">Produit</th><th>Seller</th><th>Économie</th><th>Demande</th><th>Statut</th><th className="pr-4 text-right">Décision</th></tr></thead><tbody>{filteredOffers.map(o => <tr key={o.id} className="border-t border-white/6 hover:bg-white/[.025]"><td className="px-4 py-3"><div className="flex items-center gap-3">{o.product.imageUrl ? <img src={o.product.imageUrl} className="h-10 w-10 rounded-lg object-cover" alt="" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Package className="h-4 w-4 text-white/35" /></div>}<div><div className="font-medium">{o.product.name}</div><div className="text-xs text-white/35">{o.product.sku || "SKU non renseigné"} · {o.product.category || "Sans catégorie"}</div></div></div></td><td><div>{o.seller.name}</div><div className="text-xs text-white/35">#{o.seller.id}</div></td><td><div>{money(o.product.productCost)}</div><div className="text-xs text-white/35">{o.product.stockLevel} en stock</div></td><td className="text-white/55">{date(o.createdAt)}</td><td><StatusPill value={o.status} /></td><td className="pr-4 text-right">{o.status?.toLowerCase() === "pending" ? <div className="flex justify-end gap-2"><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { accept.mutate(o.id); }} disabled={accept.isPending}><Check className="mr-1 h-3.5 w-3.5" /> Accepter</Button><Button size="sm" variant="outline" className="border-red-400/30 text-red-300 hover:bg-red-400/10" onClick={() => setRejectTarget(o)}><X className="mr-1 h-3.5 w-3.5" /> Refuser</Button></div> : <span className="text-xs text-white/35">{o.cancelReason || date(o.acceptedAt)}</span>}</td></tr>)}</tbody></table>}</div></section>}
      {tab === "invoices" && <section className="rounded-xl border" style={{ background: "rgba(255,255,255,.035)", borderColor: "rgba(197,160,89,.18)" }}><div className="border-b p-4" style={{ borderColor: "rgba(255,255,255,.08)" }}><h3 className="font-semibold">Registre des factures vendeur</h3><p className="text-xs text-white/40">Validez les calculs avant de confirmer un paiement.</p></div><div className="overflow-x-auto">{invoicesQ.isLoading ? <Loading /> : invoicesQ.isError ? <ErrorState /> : <table className="w-full min-w-[900px] text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-white/35"><th className="px-4 py-3">Facture</th><th>Seller</th><th>Période</th><th>Total net</th><th>Traitement</th><th>Paiement</th><th className="pr-4 text-right">Actions</th></tr></thead><tbody>{invoices.map(i => <tr key={i.id} className="border-t border-white/6 hover:bg-white/[.025]"><td className="px-4 py-3 font-mono text-xs" style={{ color: GOLD }}>INV-{String(i.id).padStart(5, "0")}</td><td className="font-medium">{i.seller?.name}</td><td className="text-xs text-white/55">{date(i.periodFrom)} → {date(i.periodTo)}</td><td className="font-semibold">{money(i.totalNet)}</td><td><StatusPill value={i.processingStatus} /></td><td><StatusPill value={i.paymentStatus} /></td><td className="pr-4 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" className="border-white/15 text-white hover:bg-white/10" onClick={() => setDetailId(i.id)}>Détails <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>{i.processingStatus?.toLowerCase() !== "validated" && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => invoiceAction.mutate({ id: i.id, action: "validate" })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Valider</Button>}{i.paymentStatus?.toLowerCase() !== "paid" && <Button size="sm" style={{ background: GOLD, color: NAVY }} onClick={() => invoiceAction.mutate({ id: i.id, action: "mark-paid" })}>Marquer payée</Button>}</div></td></tr>)}</tbody></table>}</div></section>}
      {tab === "sellers" && <section className="rounded-xl border" style={{ background: "rgba(255,255,255,.035)", borderColor: "rgba(197,160,89,.18)" }}><div className="border-b p-4" style={{ borderColor: "rgba(255,255,255,.08)" }}><h3 className="font-semibold">Performance vendeur</h3><p className="text-xs text-white/40">Vue consolidée des indicateurs qui guident l'allocation d'offres.</p></div><div className="overflow-x-auto">{sellersQ.isLoading ? <Loading /> : sellersQ.isError ? <ErrorState /> : <table className="w-full min-w-[950px] text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-white/35"><th className="px-4 py-3">Seller</th><th>Leads</th><th>Confirmés</th><th>Livrés</th><th>Taux confirmation</th><th>Taux livraison</th><th>CA livré</th><th>Stock</th><th>Dernier lead</th></tr></thead><tbody>{sellers.map(s => <tr key={s.sellerStoreId} className="border-t border-white/6 hover:bg-white/[.025]"><td className="px-4 py-3 font-medium">{s.sellerName}<div className="text-xs text-white/35">Store #{s.sellerStoreId}</div></td><td>{s.leads}</td><td>{s.confirmed}</td><td>{s.delivered}</td><td><span className="font-semibold text-emerald-300">{Number(s.confirmationRate || 0).toFixed(1)}%</span></td><td><span className="font-semibold" style={{ color: GOLD }}>{Number(s.deliveryRate || 0).toFixed(1)}%</span></td><td className="font-semibold">{money(s.deliveredRevenue)}</td><td><span className={s.productsInStock > 0 ? "text-emerald-300" : "text-red-300"}>{s.productsInStock}</span></td><td className="text-xs text-white/45">{date(s.lastLeadAt)}</td></tr>)}</tbody></table>}</div></section>}
    </main>
    <Dialog open={!!rejectTarget} onOpenChange={v => !v && setRejectTarget(null)}><DialogContent><DialogHeader><DialogTitle>Refuser la demande d'offre</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Expliquez la décision pour garder une trace opérationnelle.</p><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif du refus..." rows={4} /><DialogFooter><Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button><Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: reason.trim() })}>{reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmer le refus</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={generateOpen} onOpenChange={setGenerateOpen}><DialogContent><DialogHeader><DialogTitle>Générer une facture vendeur</DialogTitle></DialogHeader><div className="space-y-4"><label className="block text-sm font-medium">Seller<select value={generator.sellerStoreId} onChange={e => setGenerator({ ...generator, sellerStoreId: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Sélectionner un seller</option>{sellers.map(s => <option value={s.sellerStoreId} key={s.sellerStoreId}>{s.sellerName} · #{s.sellerStoreId}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Du<Input type="date" value={generator.periodFrom} onChange={e => setGenerator({ ...generator, periodFrom: e.target.value })} /></label><label className="text-sm font-medium">Au<Input type="date" value={generator.periodTo} onChange={e => setGenerator({ ...generator, periodTo: e.target.value })} /></label></div></div><DialogFooter><Button variant="outline" onClick={() => setGenerateOpen(false)}>Annuler</Button><Button style={{ background: GOLD, color: NAVY }} disabled={!generator.sellerStoreId || !generator.periodFrom || !generator.periodTo || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Générer</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!detailId} onOpenChange={v => !v && setDetailId(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Facture INV-{String(detailId).padStart(5, "0")}</DialogTitle></DialogHeader>{detailQ.isLoading ? <Loading /> : detailQ.data ? <div id="invoice-print" className="space-y-5"><div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-sm"><div><span className="text-muted-foreground">Seller</span><div className="font-semibold">{detailQ.data.seller.name}</div></div><div><span className="text-muted-foreground">Période</span><div>{date(detailQ.data.periodFrom)} → {date(detailQ.data.periodTo)}</div></div><div><span className="text-muted-foreground">Sous-total</span><div>{money(detailQ.data.subtotal)}</div></div><div><span className="text-muted-foreground">TVA</span><div>{money(detailQ.data.vat)}</div></div><div><span className="text-muted-foreground">Cash collecté</span><div>{money(detailQ.data.totalCashCollected)}</div></div><div><span className="text-muted-foreground">Total net</span><div className="text-lg font-bold" style={{ color: GOLD }}>{money(detailQ.data.totalNet)}</div></div></div><div><h4 className="mb-2 text-sm font-semibold">Lignes ({detailQ.data.items?.length || 0})</h4><div className="max-h-48 overflow-auto rounded-lg border">{(detailQ.data.items || []).map((item: any, idx: number) => <div key={idx} className="flex justify-between border-b p-3 text-sm last:border-0"><span>{item.name || item.label || item.description || `Ligne ${idx + 1}`}</span><span className="font-medium">{money(item.amount ?? item.total ?? 0)}</span></div>)}</div></div></div> : <ErrorState />}<DialogFooter><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimer</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Loading() { return <div className="space-y-3 p-6"><div className="h-4 w-1/3 animate-pulse rounded bg-white/10" /><div className="h-10 animate-pulse rounded bg-white/10" /><div className="h-10 animate-pulse rounded bg-white/10" /></div>; }
function ErrorState() { return <div className="flex items-center gap-3 p-8 text-sm text-red-300"><AlertCircle className="h-5 w-5" /> Impossible de charger ces données. Utilisez Actualiser pour réessayer.</div>; }
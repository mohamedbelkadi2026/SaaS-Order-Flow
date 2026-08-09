import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, ArrowDownRight, TrendingUp, Users, Megaphone, Box, Truck, PackageOpen, ShoppingCart, CheckCircle } from "lucide-react";
import { DateRangePicker } from "@/components/date-range-picker";

const GOLD = "#C5A059";

type AdminSummary = {
  revenue: number; productCost: number; shippingCost: number; packagingCost: number;
  agentCommissions: number; adSpend: number; netProfit: number; ordersCount: number;
  byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
  byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
};

type BuyerProfit = {
  revenue: number; productCost: number; shippingCost: number; packagingCost: number;
  adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads: number;
};

type TeamRow = {
  userId: number; userName: string; role: string;
  totalLeads: number; deliveredCount: number;
  revenue: number; productCost: number; shippingCost: number; packagingCost: number;
  agentCommissions: number; adSpend: number; totalCosts: number; netProfit: number;
};

const ROLE_LABELS: Record<string, string> = { owner: "Admin", admin: "Admin", media_buyer: "Media Buyer", agent: "Agent" };

export default function Profitability() {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedBuyer, setSelectedBuyer] = useState("all");

  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const isMediaBuyer = user?.role === "media_buyer";

  // Fetch all store users to populate media buyer dropdown
  const { data: storeUsers } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    enabled: isAdmin,
  });
  const mediaBuyers = (storeUsers ?? []).filter((u: any) => u.role === "media_buyer" || u.role === "owner" || u.role === "admin");

  // Admin summary — respects product + buyer + date filters
  const { data: summary, isLoading } = useQuery<AdminSummary>({
    queryKey: ["/api/profit/admin-summary", dateFrom, dateTo, selectedProduct, selectedBuyer],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (selectedProduct && selectedProduct !== "all") p.set("productId", selectedProduct);
      if (selectedBuyer && selectedBuyer !== "all") p.set("mediaBuyerId", selectedBuyer);
      const res = await fetch(`/api/profit/admin-summary${p.toString() ? `?${p}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
  });

  // Team profitability (admin only)
  const { data: teamSummary, isLoading: teamLoading } = useQuery<{ rows: TeamRow[] }>({
    queryKey: ["/api/profit/team-summary", dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(`/api/profit/team-summary${p.toString() ? `?${p}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
  });

  // Media buyer personal profit
  const { data: mbProfit, isLoading: mbLoading } = useQuery<BuyerProfit>({
    queryKey: ["/api/media-buyer/profit", dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(`/api/media-buyer/profit${p.toString() ? `?${p}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isMediaBuyer,
  });

  // Derived P&L figures
  const orderCosts = (summary?.productCost ?? 0) + (summary?.shippingCost ?? 0) + (summary?.packagingCost ?? 0) + (summary?.agentCommissions ?? 0);
  const totalCosts = orderCosts + (summary?.adSpend ?? 0);
  const profitMargin = (summary?.revenue ?? 0) > 0 ? ((summary!.netProfit / summary!.revenue) * 100) : 0;
  const roas = (summary?.adSpend ?? 0) > 0 ? ((summary!.revenue) / summary!.adSpend) : 0;
  const roi = (summary?.adSpend ?? 0) > 0 ? ((summary!.netProfit / summary!.adSpend) * 100) : 0;

  const mbDeliveryRate = mbProfit?.totalLeads ? Math.round((mbProfit.deliveredCount / mbProfit.totalLeads) * 100) : 0;

  // Shared cost row component
  const CostRow = ({ label, value, icon: Icon, indent = false }: { label: string; value: number; icon?: any; indent?: boolean }) => (
    <div className={`flex items-center justify-between py-2 border-b border-border/40 last:border-0 ${indent ? "pl-4" : ""}`}>
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 opacity-70" />}
        {label}
      </span>
      <span className="font-semibold text-sm text-destructive">-{formatCurrency(Math.abs(value))}</span>
    </div>
  );

  const DateFilters = () => (
    <div className="flex flex-wrap gap-2 items-center">
      <DateRangePicker
        value={{ from: dateFrom, to: dateTo }}
        onChange={(range) => {
          setDateFrom(range?.from ?? "");
          setDateTo(range?.to ?? "");
        }}
      />
    </div>
  );

  // ─── MEDIA BUYER VIEW ────────────────────────────────────────────────────────
  if (isMediaBuyer) {
    const loading = mbLoading;
    const p = mbProfit;
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-profitability-title">Ma Rentabilité</h1>
            <p className="text-muted-foreground text-sm mt-1">Votre performance personnelle — commandes livrées uniquement.</p>
          </div>
          <DateFilters />
        </div>

        {/* Personal KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-none shadow-xl" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #a8853f 60%, #8a6930 100%)` }}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 opacity-90">
                <Calculator className="w-4 h-4 text-white" />
                <h3 className="text-sm font-medium text-white">Mon Profit Net</h3>
              </div>
              {loading ? <Skeleton className="h-8 w-28 bg-white/20 rounded" /> : (
                <p className="text-3xl font-display font-bold text-white" data-testid="text-mb-net-profit">
                  {formatCurrency(p?.netProfit ?? 0)}
                </p>
              )}
              <p className="mt-1 text-white/80 text-xs">ROI: {p?.roi?.toFixed(1) ?? 0}%</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <DollarSign className="w-4 h-4" /><h3 className="text-sm font-medium">Revenu (Livrées)</h3>
              </div>
              {loading ? <Skeleton className="h-8 w-28 rounded" /> : (
                <p className="text-3xl font-display font-bold">{formatCurrency(p?.revenue ?? 0)}</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <ShoppingCart className="w-4 h-4" /><h3 className="text-sm font-medium">Total Leads</h3>
              </div>
              {loading ? <Skeleton className="h-8 w-16 rounded" /> : (
                <p className="text-3xl font-display font-bold">{p?.totalLeads ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{p?.deliveredCount ?? 0} livrées — {mbDeliveryRate}% taux livraison</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-amber-600">
                <Megaphone className="w-4 h-4" /><h3 className="text-sm font-medium">Ma Pub (DH)</h3>
              </div>
              {loading ? <Skeleton className="h-8 w-28 rounded" /> : (
                <p className="text-3xl font-display font-bold text-destructive">{formatCurrency(p?.adSpend ?? 0)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Personal P&L breakdown */}
        <Card className="rounded-2xl border-border/50 shadow-sm max-w-md">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold">Mon Compte de Résultat (Livrées)</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full rounded" />)}</div>
            ) : (
              <div>
                <div className="flex items-center justify-between py-2 border-b border-border/40 mb-1">
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-green-600" />Revenu Total (Livrées)
                  </span>
                  <span className="font-bold text-green-600 text-sm">+{formatCurrency(p?.revenue ?? 0)}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2 ml-1">Dépenses des commandes livrées :</p>
                <CostRow label="Coût produits" value={p?.productCost ?? 0} icon={Box} indent />
                <CostRow label="Frais de livraison" value={p?.shippingCost ?? 0} icon={Truck} indent />
                <CostRow label="Coût emballage" value={p?.packagingCost ?? 0} icon={PackageOpen} indent />
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 opacity-70" />Dépenses pub (marketing)
                  </span>
                  <span className="font-semibold text-sm text-amber-600">-{formatCurrency(p?.adSpend ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-border/60">
                  <span className="font-bold text-sm">Mon Profit Net Final</span>
                  <span className="font-bold text-lg" style={{ color: GOLD }}>
                    {formatCurrency(p?.netProfit ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── ADMIN VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header + Filters */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-profitability-title">Rentabilité Avancée</h1>
          <p className="text-muted-foreground text-sm mt-1">Modèle COD — seules les commandes <strong>Livrées</strong> comptent dans le profit.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DateFilters />
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-profit-product">
              <SelectValue placeholder="Tous les produits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les produits</SelectItem>
              {(products ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedBuyer} onValueChange={setSelectedBuyer}>
            <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-profit-buyer">
              <SelectValue placeholder="Tous les buyers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les buyers</SelectItem>
              {mediaBuyers.map((u: any) => (
                <SelectItem key={u.id} value={u.id.toString()}>{u.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Global KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Profit Net — Gold gradient */}
        <Card className="border-none shadow-xl" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #a8853f 60%, #8a6930 100%)` }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <Calculator className="w-4 h-4 text-white" /><h3 className="text-sm font-medium text-white">Profit Net Global</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 bg-white/20 rounded" /> : (
              <p className="text-3xl font-display font-bold text-white" data-testid="text-net-profit">
                {formatCurrency(summary?.netProfit ?? 0)}
              </p>
            )}
            <p className="mt-1 text-white/80 text-xs">
              Marge: {profitMargin.toFixed(1)}% | {summary?.ordersCount ?? 0} livrées
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-green-600">
              <DollarSign className="w-4 h-4" /><h3 className="text-sm font-medium">Revenu (Livrées)</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 rounded" /> : (
              <p className="text-3xl font-display font-bold text-green-600">{formatCurrency(summary?.revenue ?? 0)}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{summary?.ordersCount ?? 0} commandes livrées</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-destructive">
              <ArrowDownRight className="w-4 h-4" /><h3 className="text-sm font-medium">Total Coûts</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 rounded" /> : (
              <p className="text-3xl font-display font-bold text-destructive">{formatCurrency(totalCosts)}</p>
            )}
            <p className="mt-1 text-muted-foreground text-xs">Produits + Livraison + Pub</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-amber-600">
              <TrendingUp className="w-4 h-4" /><h3 className="text-sm font-medium">ROI / ROAS</h3>
            </div>
            <p className="text-2xl font-display font-bold" data-testid="text-roas">
              ROAS: {(summary?.adSpend ?? 0) > 0 ? roas.toFixed(2) : "∞"}x
            </p>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400" data-testid="text-roi">
              ROI: {(summary?.adSpend ?? 0) > 0 ? `${roi.toFixed(1)}%` : "∞"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Breakdown + Buyer Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Compte de Résultat ── */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calculator className="w-3.5 h-3.5 text-primary" />Compte de Résultat (COD)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-5 w-full rounded" />)}</div>
            ) : (
              <div>
                {/* Revenue row */}
                <div className="flex items-center justify-between py-2.5 border-b border-border/40 mb-2">
                  <span className="text-sm font-bold flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-green-600" />
                    Revenu Total (Livrées)
                  </span>
                  <span className="font-bold text-green-600">+{formatCurrency(summary?.revenue ?? 0)}</span>
                </div>

                {/* Order costs group */}
                <p className="text-[11px] uppercase font-bold text-muted-foreground/60 tracking-wider mb-1">Dépenses — commandes livrées</p>
                <CostRow label="Coût d'achat produits" value={summary?.productCost ?? 0} icon={Box} indent />
                <CostRow label="Frais de livraison" value={summary?.shippingCost ?? 0} icon={Truck} indent />
                <CostRow label="Coût emballage" value={summary?.packagingCost ?? 0} icon={PackageOpen} indent />
                <CostRow label="Commissions agents" value={summary?.agentCommissions ?? 0} icon={Users} indent />

                {/* Order costs subtotal */}
                <div className="flex items-center justify-between py-2 my-1 bg-muted/20 rounded px-2">
                  <span className="text-sm font-semibold text-muted-foreground">Sous-total coûts livrées</span>
                  <span className="font-bold text-sm text-destructive">-{formatCurrency(orderCosts)}</span>
                </div>

                {/* Ad Spend — separate section */}
                <p className="text-[11px] uppercase font-bold text-muted-foreground/60 tracking-wider mt-3 mb-1">Marketing (indépendant des livraisons)</p>
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2 font-medium">
                    <Megaphone className="w-3.5 h-3.5" />Dépenses publicitaires (Pub)
                  </span>
                  <span className="font-bold text-sm text-amber-700 dark:text-amber-400">-{formatCurrency(summary?.adSpend ?? 0)}</span>
                </div>

                {/* Net Profit */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t-2 border-border/60">
                  <span className="font-bold">Profit Net Final</span>
                  <span className="font-bold text-xl" style={{ color: (summary?.netProfit ?? 0) >= 0 ? GOLD : "#ef4444" }}>
                    {formatCurrency(summary?.netProfit ?? 0)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  = Revenu − Coûts livrées − Pub
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Pub par Media Buyer ── */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Megaphone className="w-3.5 h-3.5 text-primary" />Pub par Media Buyer
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{summary?.byBuyer?.length ?? 0} buyer(s)</Badge>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead className="text-[11px] font-bold uppercase">Media Buyer</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right text-green-700">Revenu</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right text-destructive/80">Pub</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right" style={{ color: GOLD }}>Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => <TableRow key={i}>{[...Array(4)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>)}</TableRow>)
                ) : (summary?.byBuyer?.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-8">Aucune donnée</TableCell></TableRow>
                ) : summary!.byBuyer.map(b => (
                  <TableRow key={b.buyerId} data-testid={`row-buyer-${b.buyerId}`}>
                    <TableCell className="font-medium text-sm">{b.buyerName}</TableCell>
                    <TableCell className="text-right text-sm text-green-600 font-medium">{formatCurrency(b.revenue)}</TableCell>
                    <TableCell className="text-right text-destructive text-sm font-semibold">-{formatCurrency(b.adSpend)}</TableCell>
                    <TableCell className="text-right font-bold text-sm" style={{ color: b.netProfit >= 0 ? GOLD : "#ef4444" }}>
                      {formatCurrency(b.netProfit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* ── TEAM PROFITABILITY TABLE ────────────────────────────────────────── */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              Rentabilité par Utilisateur (Team)
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{teamSummary?.rows?.length ?? 0} utilisateur(s)</Badge>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10">
                <TableHead className="text-[11px] font-bold uppercase">Utilisateur</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Rôle</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">
                  <div className="flex items-center gap-1 justify-end"><ShoppingCart className="w-3 h-3" />Leads</div>
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">
                  <div className="flex items-center gap-1 justify-end"><CheckCircle className="w-3 h-3 text-green-600" />Livrées</div>
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right text-destructive/80">Pub (DH)</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right text-destructive/80">Total Coûts</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right text-green-700">Revenu</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right" style={{ color: GOLD }}>Profit Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamLoading ? (
                [...Array(3)].map((_, i) => <TableRow key={i}>{[...Array(8)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>)}</TableRow>)
              ) : (teamSummary?.rows?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-10">
                    Aucune donnée disponible pour cette période
                  </TableCell>
                </TableRow>
              ) : teamSummary!.rows.map(r => (
                <TableRow key={r.userId} className="hover:bg-muted/20 transition-colors" data-testid={`row-team-${r.userId}`}>
                  <TableCell className="font-semibold text-sm">{r.userName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{ROLE_LABELS[r.role] || r.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{r.totalLeads}</TableCell>
                  <TableCell className="text-right text-sm">
                    <span className="font-semibold text-green-600">{r.deliveredCount}</span>
                    {r.totalLeads > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">({Math.round(r.deliveredCount / r.totalLeads * 100)}%)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-amber-700 dark:text-amber-400 font-medium">
                    {r.adSpend > 0 ? `-${formatCurrency(r.adSpend)}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm text-destructive">
                    {r.totalCosts > 0 ? `-${formatCurrency(r.totalCosts)}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-green-600">
                    {r.revenue > 0 ? formatCurrency(r.revenue) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-bold text-sm" style={{ color: r.netProfit >= 0 ? GOLD : "#ef4444" }}>
                    {formatCurrency(r.netProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Team totals footer */}
        {(teamSummary?.rows?.length ?? 0) > 0 && (() => {
          const totalRevenue = teamSummary!.rows.reduce((s, r) => s + r.revenue, 0);
          const totalAdSpendTeam = teamSummary!.rows.reduce((s, r) => s + r.adSpend, 0);
          const totalCostsTeam = teamSummary!.rows.reduce((s, r) => s + r.totalCosts, 0);
          const totalNetProfit = teamSummary!.rows.reduce((s, r) => s + r.netProfit, 0);
          return (
            <div className="border-t-2 border-border/60 bg-muted/20 px-4 py-3 grid grid-cols-8 gap-2 text-sm">
              <div className="col-span-2 font-bold text-foreground">Totaux Équipe</div>
              <div className="text-right font-semibold">{teamSummary!.rows.reduce((s, r) => s + r.totalLeads, 0)}</div>
              <div className="text-right font-semibold text-green-600">{teamSummary!.rows.reduce((s, r) => s + r.deliveredCount, 0)}</div>
              <div className="text-right font-semibold text-amber-700 dark:text-amber-400">{totalAdSpendTeam > 0 ? `-${formatCurrency(totalAdSpendTeam)}` : "—"}</div>
              <div className="text-right font-semibold text-destructive">{totalCostsTeam > 0 ? `-${formatCurrency(totalCostsTeam)}` : "—"}</div>
              <div className="text-right font-semibold text-green-600">{formatCurrency(totalRevenue)}</div>
              <div className="text-right font-bold" style={{ color: totalNetProfit >= 0 ? GOLD : "#ef4444" }}>{formatCurrency(totalNetProfit)}</div>
            </div>
          );
        })()}
      </Card>

      {/* Agent Commissions Table */}
      {(summary?.byAgent?.length ?? 0) > 0 && (
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />Commissions par Agent (Livrées)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead className="text-[11px] font-bold uppercase">Agent</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Taux (DH)</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Livrées</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right text-destructive/80">Total Commissions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary!.byAgent.map(a => (
                  <TableRow key={a.agentId} data-testid={`row-agent-${a.agentId}`}>
                    <TableCell className="font-medium text-sm">{a.agentName}</TableCell>
                    <TableCell className="text-right text-sm">{a.commissionRate} DH</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{a.deliveredCount}</TableCell>
                    <TableCell className="text-right text-destructive font-bold text-sm">-{formatCurrency(Number(a.totalCommission) * 100)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProducts } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, ArrowDownRight, TrendingUp, Users, Megaphone, Box, Truck, PackageOpen } from "lucide-react";
import { DateRangePicker } from "@/components/date-range-picker";

type AdminSummary = {
  revenue: number;
  productCost: number;
  shippingCost: number;
  packagingCost: number;
  agentCommissions: number;
  adSpend: number;
  netProfit: number;
  ordersCount: number;
  byBuyer: { buyerId: number; buyerName: string; adSpend: number; revenue: number; netProfit: number }[];
  byAgent: { agentId: number; agentName: string; commissionRate: number; deliveredCount: number; totalCommission: number }[];
};

export default function Profitability() {
  const { data: products } = useProducts();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");

  const { data: summary, isLoading } = useQuery<AdminSummary>({
    queryKey: ['/api/profit/admin-summary', dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      const qs = p.toString();
      const res = await fetch(`/api/profit/admin-summary${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const totalCosts = (summary?.productCost ?? 0) + (summary?.shippingCost ?? 0) + (summary?.packagingCost ?? 0) + (summary?.agentCommissions ?? 0) + (summary?.adSpend ?? 0);
  const profitMargin = summary && summary.revenue > 0 ? (summary.netProfit / summary.revenue) * 100 : 0;
  const roas = summary && summary.adSpend > 0 ? summary.revenue / summary.adSpend : 0;
  const roi = summary && summary.adSpend > 0 ? (summary.netProfit / summary.adSpend) * 100 : 0;

  const CostRow = ({ label, value, icon: Icon, color = "text-destructive" }: { label: string; value: number; icon?: any; color?: string }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 opacity-70" />}
        {label}
      </span>
      <span className={`font-semibold text-sm ${color}`}>{value >= 0 ? '-' : '+'}{formatCurrency(Math.abs(value))}</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-profitability-title">Rentabilité Avancée</h1>
          <p className="text-muted-foreground text-sm mt-1">Analyse complète de rentabilité — commandes livrées uniquement.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DateRangePicker
            value={{ from: dateFrom ? new Date(dateFrom) : undefined, to: dateTo ? new Date(dateTo) : undefined }}
            onChange={(range) => {
              setDateFrom(range?.from ? range.from.toISOString().split('T')[0] : '');
              setDateTo(range?.to ? range.to.toISOString().split('T')[0] : '');
            }}
          />
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-[180px] h-9 text-sm" data-testid="select-profit-product">
              <SelectValue placeholder="Tous les produits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les produits</SelectItem>
              {products?.map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <Calculator className="w-4 h-4" />
              <h3 className="text-sm font-medium">Profit Net</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 bg-white/20 rounded" /> : (
              <p className="text-3xl font-display font-bold" data-testid="text-net-profit">{formatCurrency(summary?.netProfit ?? 0)}</p>
            )}
            <p className="mt-1 text-primary-foreground/80 text-xs">
              Marge: {profitMargin.toFixed(1)}% | {summary?.ordersCount ?? 0} livrées
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              <h3 className="text-sm font-medium">Revenu (Livrées)</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 rounded" /> : (
              <p className="text-3xl font-display font-bold text-foreground">{formatCurrency(summary?.revenue ?? 0)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-destructive">
              <ArrowDownRight className="w-4 h-4" />
              <h3 className="text-sm font-medium">Total Coûts</h3>
            </div>
            {isLoading ? <Skeleton className="h-8 w-28 rounded" /> : (
              <p className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalCosts)}</p>
            )}
            <p className="mt-1 text-muted-foreground text-xs">Produit + Livraison + Emballage + Commissions + Pub</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-amber-600">
              <TrendingUp className="w-4 h-4" />
              <h3 className="text-sm font-medium">ROI / ROAS</h3>
            </div>
            <p className="text-2xl font-display font-bold text-foreground" data-testid="text-roas">
              ROAS: {(summary?.adSpend ?? 0) > 0 ? roas.toFixed(2) : '∞'}x
            </p>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400" data-testid="text-roi">
              ROI: {(summary?.adSpend ?? 0) > 0 ? `${roi.toFixed(1)}%` : '∞'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Full P&L Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold">Compte de Résultat</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-5 w-full rounded" />)}</div>
            ) : (
              <div>
                <div className="flex items-center justify-between py-2 border-b border-border/40 mb-2">
                  <span className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-green-600" />Revenu brut</span>
                  <span className="font-bold text-green-600 text-sm">+{formatCurrency(summary?.revenue ?? 0)}</span>
                </div>
                <CostRow label="Coût produits" value={summary?.productCost ?? 0} icon={Box} />
                <CostRow label="Frais de livraison" value={summary?.shippingCost ?? 0} icon={Truck} />
                <CostRow label="Coût emballage" value={summary?.packagingCost ?? 0} icon={PackageOpen} />
                <CostRow label="Commissions agents" value={summary?.agentCommissions ?? 0} icon={Users} />
                <CostRow label="Dépenses publicitaires" value={summary?.adSpend ?? 0} icon={Megaphone} />
                <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-border/60">
                  <span className="font-bold text-sm">Profit Net Final</span>
                  <span className={`font-bold text-lg ${(summary?.netProfit ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(summary?.netProfit ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ad Spend by Media Buyer */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Megaphone className="w-3.5 h-3.5 text-primary" />
                Dépenses par Media Buyer
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{summary?.byBuyer?.length ?? 0} buyer(s)</Badge>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead className="text-[11px] font-bold uppercase">Media Buyer</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Revenu</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right text-destructive/80">Pub</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right text-primary">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>{[...Array(4)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full rounded" /></TableCell>)}</TableRow>
                  ))
                ) : (summary?.byBuyer?.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-8">Aucune donnée</TableCell></TableRow>
                ) : (
                  summary!.byBuyer.map((b) => (
                    <TableRow key={b.buyerId} data-testid={`row-buyer-${b.buyerId}`}>
                      <TableCell className="font-medium text-sm">{b.buyerName}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(b.revenue)}</TableCell>
                      <TableCell className="text-right text-destructive text-sm font-semibold">-{formatCurrency(b.adSpend)}</TableCell>
                      <TableCell className={`text-right font-bold text-sm ${b.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatCurrency(b.netProfit)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Agent Commissions Table */}
      {(summary?.byAgent?.length ?? 0) > 0 && (
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-3 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              Commissions par Agent
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
                {summary!.byAgent.map((a) => (
                  <TableRow key={a.agentId} data-testid={`row-agent-${a.agentId}`}>
                    <TableCell className="font-medium text-sm">{a.agentName}</TableCell>
                    <TableCell className="text-right text-sm">{a.commissionRate} DH</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{a.deliveredCount}</TableCell>
                    <TableCell className="text-right text-destructive font-bold text-sm">-{formatCurrency(a.totalCommission * 100)}</TableCell>
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

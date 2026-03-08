import { useDashboardStats, useProducts, useOrders, useDailyStats, useTopProducts, useAgentPerformance, useAgents } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { ShoppingCart, CheckCircle, Clock, XCircle, Truck, Package, TrendingUp, FileText, Ban, Eye } from "lucide-react";

const PIE_COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#64748b'];

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: dailyStats } = useDailyStats();
  const { data: topProducts } = useTopProducts();
  const { data: agents } = useAgents();
  const { data: agentPerf } = useAgentPerformance();
  const [chartPeriod, setChartPeriod] = useState("daily");

  const StatCard = ({ title, value, icon: Icon, subtitle, iconBg, isCurrency = false }: any) => (
    <Card className="rounded-xl border-border/50 shadow-sm" data-testid={`card-stat-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-20 rounded-lg" />
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {isCurrency ? formatCurrency(value || 0) : (value?.toLocaleString('fr-FR') || '0')}
              </p>
            )}
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${iconBg || 'bg-primary/10'}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const confirme = stats?.confirme || 0;
  const cancelled = stats?.cancelled || 0;
  const inProgress = stats?.inProgress || 0;
  const delivered = stats?.delivered || 0;
  const totalOrders = stats?.totalOrders || 0;

  const confirmPct = totalOrders > 0 ? ((confirme / totalOrders) * 100).toFixed(2) : '0';
  const cancelPct = totalOrders > 0 ? ((cancelled / totalOrders) * 100).toFixed(2) : '0';
  const inProgressPct = totalOrders > 0 ? ((inProgress / totalOrders) * 100).toFixed(2) : '0';

  const pieData = [
    { name: `Confirm\u00e9 ${confirmPct}%`, value: confirme },
    { name: `Annul\u00e9 ${cancelPct}%`, value: cancelled },
    { name: `En Cours ${inProgressPct}%`, value: inProgress },
  ].filter(d => d.value > 0);

  const deliveryPieData = [
    { name: `Refus\u00e9 ${totalOrders > 0 ? ((stats?.refused || 0) / totalOrders * 100).toFixed(2) : 0}%`, value: stats?.refused || 0 },
    { name: `Livraison en cours ${inProgressPct}%`, value: inProgress },
    { name: `Livraison livr\u00e9e ${totalOrders > 0 ? (delivered / totalOrders * 100).toFixed(2) : 0}%`, value: delivered },
  ].filter(d => d.value > 0);

  const dailyChartData = dailyStats?.map((d: any) => ({
    date: d.date.slice(5),
    count: d.count,
  })) || [];

  const agentMap = new Map((agents || []).map((a: any) => [a.id, a]));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase" data-testid="text-dashboard-title">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Commandes" value={totalOrders} icon={ShoppingCart} iconBg="bg-slate-400" subtitle="100% voir plus" />
        <StatCard title={`Confirm\u00e9es`} value={confirme} icon={CheckCircle} iconBg="bg-green-400" subtitle={`${confirmPct}% voir plus`} />
        <StatCard title="En cours" value={inProgress} icon={Clock} iconBg="bg-blue-400" subtitle={`${inProgressPct}%`} />
        <StatCard title="Annul\u00e9es" value={cancelled} icon={Ban} iconBg="bg-red-400" subtitle={`${cancelPct}%`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Livr\u00e9es" value={delivered} icon={Truck} iconBg="bg-emerald-500" subtitle={`${totalOrders > 0 ? (delivered / totalOrders * 100).toFixed(2) : 0}% voir plus`} />
        <StatCard title="En cours livraison" value={inProgress} icon={Package} iconBg="bg-sky-400" />
        <StatCard title="Refus\u00e9es" value={stats?.refused || 0} icon={XCircle} iconBg="bg-orange-400" subtitle={`${totalOrders > 0 ? ((stats?.refused || 0) / totalOrders * 100).toFixed(2) : 0}%`} />
        <StatCard title="Factures" value={0} icon={FileText} iconBg="bg-teal-400" subtitle="0 Dh" isCurrency={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-xl shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Comparaison des ventes</CardTitle>
            <Select value={chartPeriod} onValueChange={setChartPeriod}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Quotidien</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {isLoading ? (
                <Skeleton className="w-full h-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 text-border" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', opacity: 0.4, fontSize: 10 }} dy={10} interval={2} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', opacity: 0.4, fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} name="Commandes" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 rounded-xl shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Statut des commandes</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-[280px]">
            {isLoading ? (
              <Skeleton className="w-[200px] h-[200px] rounded-full" />
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" outerRadius={90} dataKey="value" stroke="none">
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donn\u00e9e</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-xl shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg"><TrendingUp className="w-4 h-4 text-primary" /></div>
              Performance de l'\u00e9quipe
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="text-xs">Membre</TableHead>
                    <TableHead className="text-xs text-center">Activit\u00e9s</TableHead>
                    <TableHead className="text-xs">Cmd / Taux</TableHead>
                    <TableHead className="text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerf && agentPerf.length > 0 ? agentPerf.map((perf: any) => {
                    const agent = agentMap.get(perf.agentId);
                    const confirmRate = perf.total > 0 ? Math.round((perf.confirmed / perf.total) * 100) : 0;
                    const deliverRate = perf.total > 0 ? Math.round((perf.delivered / perf.total) * 100) : 0;
                    return (
                      <TableRow key={perf.agentId} data-testid={`perf-row-${perf.agentId}`}>
                        <TableCell>
                          <div className="font-medium text-sm">{agent?.username || `Agent #${perf.agentId}`}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-orange-500 text-white text-xs">{perf.total}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold w-5">{perf.confirmed}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[80px]">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${confirmRate}%` }} />
                              </div>
                              <span className="text-muted-foreground">confirme</span>
                              <span className="font-bold text-green-600">{confirmRate}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold w-5">{perf.delivered}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[80px]">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${deliverRate}%` }} />
                              </div>
                              <span className="text-muted-foreground">livr\u00e9</span>
                              <span className="font-bold text-blue-600">{deliverRate}%</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <button className="p-1.5 rounded-md hover:bg-muted transition-colors"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Aucune donn\u00e9e de performance</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 rounded-xl shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Statut des commandes</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-[280px]">
            {deliveryPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deliveryPieData} cx="50%" cy="45%" outerRadius={90} dataKey="value" stroke="none">
                    {deliveryPieData.map((_, index) => (
                      <Cell key={`dcell-${index}`} fill={['#ef4444', '#3b82f6', '#10b981'][index % 3]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donn\u00e9e</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl shadow-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Produits les plus vendus</CardTitle>
          <span className="text-xs text-primary font-medium">Top 10</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead className="text-xs">Produit</TableHead>
                  <TableHead className="text-xs text-center">Commandes</TableHead>
                  <TableHead className="text-xs text-center">Quantit\u00e9</TableHead>
                  <TableHead className="text-xs text-right">Revenu Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts && topProducts.length > 0 ? topProducts.map((p: any, i: number) => (
                  <TableRow key={i} data-testid={`top-product-${i}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{i + 1}</div>
                        <span className="font-medium text-sm">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-primary">{p.orders}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{p.quantity}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-bold text-primary text-sm">{formatCurrency(p.revenue)}</span>
                        <div className="w-20 bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${p.share}%` }} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Aucun produit vendu</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

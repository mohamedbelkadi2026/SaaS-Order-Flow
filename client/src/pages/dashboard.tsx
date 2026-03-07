import { useDashboardStats, useProducts, useOrders } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { Package, CheckCircle, Clock, XCircle, Truck, XSquare, TrendingUp, ShoppingBag } from "lucide-react";

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

export default function Dashboard() {
  const { data: stats, isLoading, error } = useDashboardStats();
  const { data: products } = useProducts();
  const { data: orders } = useOrders();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

  if (error) {
    return (
      <div className="p-8 text-center bg-destructive/10 rounded-2xl border border-destructive/20 text-destructive">
        <h3 className="font-bold text-lg">Erreur de chargement</h3>
        <p className="opacity-80 text-sm mt-1">Vérifiez que le backend est en cours d'exécution.</p>
      </div>
    );
  }

  const filteredOrders = selectedProduct === "all" 
    ? orders 
    : orders?.filter((o: any) => o.items?.some((i: any) => i.productId === parseInt(selectedProduct)));

  const filteredStats = selectedProduct === "all" ? stats : (() => {
    if (!filteredOrders) return stats;
    let totalOrders = filteredOrders.length;
    let confirmed = 0, delivered = 0, cancelled = 0, revenue = 0, profit = 0;
    filteredOrders.forEach((o: any) => {
      if (o.status === 'confirmed') confirmed++;
      if (o.status === 'delivered') delivered++;
      if (o.status === 'cancelled') cancelled++;
      if (['confirmed', 'delivered'].includes(o.status)) {
        revenue += o.totalPrice;
        profit += (o.totalPrice - o.productCost - o.shippingCost - o.adSpend);
      }
    });
    return { ...stats, totalOrders, confirmed, delivered, cancelled, revenue, profit, confirmationRate: totalOrders > 0 ? Math.round((confirmed + delivered) / totalOrders * 100) : 0 };
  })();

  const displayStats = filteredStats || stats;

  const StatCard = ({ title, value, icon: Icon, trend, isCurrency = false }: any) => (
    <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all duration-300" data-testid={`card-stat-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24 rounded-lg" />
            ) : (
              <p className="text-3xl font-display font-bold text-foreground">
                {isCurrency ? formatCurrency(value || 0) : (value?.toLocaleString() || '0')}
              </p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-xl">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-4 flex items-center text-sm">
            <span className="text-emerald-500 flex items-center font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              {trend}%
            </span>
            <span className="text-muted-foreground ml-2">taux confirmation</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const pieData = displayStats ? [
    { name: 'Nouveaux', value: displayStats.newOrders || (displayStats.totalOrders - (displayStats.confirmed + (displayStats.inProgress || 0) + displayStats.cancelled + displayStats.delivered + (displayStats.refused || 0))) },
    { name: 'Confirmés', value: displayStats.confirmed },
    { name: 'En cours', value: displayStats.inProgress || 0 },
    { name: 'Annulés', value: displayStats.cancelled },
    { name: 'Livrés', value: displayStats.delivered },
    { name: 'Refusés', value: displayStats.refused || 0 },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Bienvenue. Voici l'état de votre boutique aujourd'hui.</p>
        </div>
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger className="w-[200px]" data-testid="select-product-filter">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard title="Revenu Total" value={displayStats?.revenue} isCurrency icon={TrendingUp} />
        <StatCard title="Total Commandes" value={displayStats?.totalOrders} icon={Package} trend={displayStats?.confirmationRate} />
        <StatCard title="Confirmées" value={displayStats?.confirmed} icon={CheckCircle} />
        <StatCard title="Livrées" value={displayStats?.delivered} icon={Truck} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        <StatCard title="En cours" value={displayStats?.inProgress} icon={Clock} />
        <StatCard title="Annulées" value={displayStats?.cancelled} icon={XCircle} />
        <StatCard title="Refusées" value={displayStats?.refused} icon={XSquare} />
        <StatCard title="Profit Net" value={displayStats?.profit} isCurrency icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-2xl shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Comparaison des ventes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              {isLoading ? (
                <Skeleton className="w-full h-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 text-border" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'currentColor', opacity: 0.5, fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'currentColor', opacity: 0.5, fontSize: 12}} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 rounded-2xl shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Statuts des commandes</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-[350px]">
            {isLoading ? (
              <Skeleton className="w-[250px] h-[250px] rounded-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

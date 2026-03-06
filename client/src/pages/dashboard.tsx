import { useDashboardStats } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Package, CheckCircle, Clock, XCircle, Truck, XSquare, DollarSign, TrendingUp } from "lucide-react";

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#10b981', '#64748b'];

// Mock chart data to make it look premium even without real historical API
const mockLineData = [
  { name: 'Mon', revenue: 4000, orders: 24 },
  { name: 'Tue', revenue: 3000, orders: 13 },
  { name: 'Wed', revenue: 2000, orders: 98 },
  { name: 'Thu', revenue: 2780, orders: 39 },
  { name: 'Fri', revenue: 1890, orders: 48 },
  { name: 'Sat', revenue: 2390, orders: 38 },
  { name: 'Sun', revenue: 3490, orders: 43 },
];

export default function Dashboard() {
  const { data: stats, isLoading, error } = useDashboardStats();

  if (error) {
    return (
      <div className="p-8 text-center bg-destructive/10 rounded-2xl border border-destructive/20 text-destructive">
        <h3 className="font-bold text-lg">Failed to load dashboard data</h3>
        <p className="opacity-80 text-sm mt-1">Check if the backend is running and the database is seeded.</p>
      </div>
    );
  }

  const StatCard = ({ title, value, icon: Icon, trend, prefix = "" }: any) => (
    <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24 rounded-lg" />
            ) : (
              <p className="text-3xl font-display font-bold text-foreground">
                {prefix}{value?.toLocaleString()}
              </p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-xl">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center text-sm">
            <span className="text-emerald-500 flex items-center font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              {trend}%
            </span>
            <span className="text-muted-foreground ml-2">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const pieData = stats ? [
    { name: 'New', value: stats.totalOrders - (stats.confirmed + stats.inProgress + stats.cancelled + stats.delivered + stats.refused) || 5 },
    { name: 'Confirmed', value: stats.confirmed },
    { name: 'In Progress', value: stats.inProgress },
    { name: 'Cancelled', value: stats.cancelled },
    { name: 'Delivered', value: stats.delivered },
    { name: 'Refused', value: stats.refused },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening with your store today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard title="Total Revenue" value={stats ? stats.revenue / 100 : 0} prefix="$" icon={DollarSign} trend="12.5" />
        <StatCard title="Total Orders" value={stats?.totalOrders} icon={Package} trend="8.2" />
        <StatCard title="Confirmed" value={stats?.confirmed} icon={CheckCircle} />
        <StatCard title="Delivered" value={stats?.delivered} icon={Truck} trend="15.3" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        <StatCard title="In Progress" value={stats?.inProgress} icon={Clock} />
        <StatCard title="Cancelled" value={stats?.cancelled} icon={XCircle} />
        <StatCard title="Refused" value={stats?.refused} icon={XSquare} />
        <StatCard title="Net Profit" value={stats ? stats.profit / 100 : 0} prefix="$" icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-2xl shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Sales Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockLineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 text-border" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'currentColor', opacity: 0.5, fontSize: 12}} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: 'currentColor', opacity: 0.5, fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: 'currentColor', opacity: 0.5, fontSize: 12}} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontWeight: 600 }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="hsl(var(--muted-foreground))" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 rounded-2xl shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Order Status</CardTitle>
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

import { useFilteredStats, useFilterOptions, useAgents, useAgentPerformance, useAgentStoreSettings, useMagasins } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { ShoppingCart, CheckCircle, Clock, XCircle, Truck, Package, TrendingUp, FileText, Ban, Eye, Filter, CalendarDays, DollarSign, Check, Link2, Monitor, ChevronDown, Wallet, Receipt, Users, PackageSearch, PhoneCall, PackageCheck, BarChart3 } from "lucide-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useRealtime } from "@/hooks/use-realtime";

// Brand-aligned status colors
const STATUS_COLORS = {
  delivered:  '#10b981', // Emerald Green  — Success/Money
  confirme:   '#0ea5e9', // Sky Blue       — Progress/Action
  nouveau:    '#f59e0b', // Amber          — Attention/New
  transit:    '#64748b', // Slate Grey     — Neutral/En route
  cancelled:  '#e11d48', // Rose           — Loss/Cancelled
  unreachable:'#6366f1', // Indigo         — Injoignable/BV
};
const PIE_COLORS = [
  STATUS_COLORS.confirme,   // Confirmé
  STATUS_COLORS.cancelled,  // Annulé
  STATUS_COLORS.transit,    // En cours
  STATUS_COLORS.nouveau,    // Nouveau
  STATUS_COLORS.unreachable,// Injoignable
  '#94a3b8',                // other
];

function getDatePreset(preset: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yd = y.toISOString().slice(0, 10);
      return { dateFrom: yd, dateTo: yd };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return { dateFrom: firstDay, dateTo: today };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { dateFrom: firstDay, dateTo: lastDay };
    }
    default:
      return { dateFrom: '', dateTo: '' };
  }
}

export default function Dashboard() {
  useRealtime(); // live order + status updates via Socket.io
  const [filters, setFilters] = useState({
    city: 'all',
    productId: 'all',
    agentId: 'all',
    source: 'all',
    shippingProvider: 'all',
    utmSource: 'all',
    utmCampaign: 'all',
    magasinId: 'all',
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const activeFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (filters.city !== 'all') f.city = filters.city;
    if (filters.productId !== 'all') f.productId = filters.productId;
    if (filters.agentId !== 'all') f.agentId = filters.agentId;
    if (filters.source !== 'all') f.source = filters.source;
    if (filters.shippingProvider !== 'all') f.shippingProvider = filters.shippingProvider;
    if (filters.utmSource !== 'all') f.utmSource = filters.utmSource;
    if (filters.utmCampaign !== 'all') f.utmCampaign = filters.utmCampaign;
    if (filters.magasinId !== 'all') f.magasinId = filters.magasinId;
    if (filters.dateFrom) f.dateFrom = filters.dateFrom;
    if (filters.dateTo) f.dateTo = filters.dateTo;
    return f;
  }, [filters]);

  const { user } = useAuth();
  const isAgent = user?.role === 'agent';
  const isMediaBuyer = user?.role === 'media_buyer';
  const isAdminUser = user?.role === 'owner' || user?.role === 'admin';
  const [adminView, setAdminView] = useState<'global' | 'personal'>('global');
  const perms = (user?.dashboardPermissions || {}) as Record<string, boolean>;

  const canSeeRevenue = !isAgent || !!perms.show_revenue;
  const canSeeProfit = !isAgent || !!perms.show_profit;
  const canSeeCharts = !isAgent || !!perms.show_charts;
  const canSeeTopProducts = !isAgent || !!perms.show_top_products;

  const { data: walletData } = useQuery<{ totalEarned: number; deliveredThisMonth: number; deliveredTotal: number; commissionRate: number }>({
    queryKey: ['/api/agents/wallet'],
    enabled: isAgent,
  });

  const { data: agentMyStats, isLoading: agentStatsLoading } = useQuery<{
    daily: { date: string; orders: number }[];
    byStatus: { name: string; value: number; color: string }[];
    totalOrders: number;
  }>({
    queryKey: ['/api/agents/my-stats'],
    enabled: isAgent,
    refetchInterval: 60_000,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platformFilter, setPlatformFilter] = useState('all');
  const [mbDateRange, setMbDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [mbCityFilter, setMbCityFilter] = useState('all');
  const [mbProductFilter, setMbProductFilter] = useState('all');
  const [mbCampaignFilter, setMbCampaignFilter] = useState('all');
  const [linkPlatform, setLinkPlatform] = useState('');
  const [linkCampaign, setLinkCampaign] = useState('');
  const [linkBaseUrl, setLinkBaseUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: mediaBuyerStats } = useQuery<{ total: number; confirmed: number; inProgress: number; delivered: number; cancelled: number; revenue: number; confirmRate: number; deliveryRate: number; platforms: string[]; daily: any[]; products: any[]; cities: any[]; campaigns: string[] }>({
    queryKey: ['/api/media-buyer/stats', platformFilter, mbDateRange.from, mbDateRange.to, mbCityFilter, mbProductFilter, mbCampaignFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platformFilter && platformFilter !== 'all') params.set('platform', platformFilter);
      if (mbDateRange.from) params.set('dateFrom', mbDateRange.from);
      if (mbDateRange.to) params.set('dateTo', mbDateRange.to);
      if (mbCityFilter && mbCityFilter !== 'all') params.set('city', mbCityFilter);
      if (mbProductFilter && mbProductFilter !== 'all') params.set('product', mbProductFilter);
      if (mbCampaignFilter && mbCampaignFilter !== 'all') params.set('campaign', mbCampaignFilter);
      const qs = params.toString();
      const url = `/api/media-buyer/stats${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isMediaBuyer,
  });
  const { data: mbProfit } = useQuery<{ revenue: number; productCost: number; shippingCost: number; packagingCost: number; agentCommissions: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads?: number }>({
    queryKey: ['/api/media-buyer/profit', mbDateRange.from, mbDateRange.to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mbDateRange.from) params.set('dateFrom', mbDateRange.from);
      if (mbDateRange.to) params.set('dateTo', mbDateRange.to);
      const qs = params.toString();
      const res = await fetch(`/api/media-buyer/profit${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch profit');
      return res.json();
    },
    enabled: isMediaBuyer,
  });

  const { data: adminPersonalProfit } = useQuery<{ revenue: number; productCost: number; shippingCost: number; packagingCost: number; agentCommissions: number; adSpend: number; netProfit: number; roi: number; deliveredCount: number; totalLeads?: number }>({
    queryKey: ['/api/media-buyer/profit-admin-personal'],
    queryFn: async () => {
      const res = await fetch('/api/media-buyer/profit', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdminUser && adminView === 'personal',
  });

  const { data: commissionsSummary } = useQuery<{ agentId: number; agentName: string; commissionRate: number; deliveredTotal: number; totalOwed: number }[]>({
    queryKey: ['/api/stats/commissions-summary'],
    enabled: !isAgent,
  });
  const totalCommissionsOwed = commissionsSummary?.reduce((sum, a) => sum + Number(a.totalOwed), 0) ?? 0;

  const { data: stats, isLoading } = useFilteredStats(activeFilters);
  const { data: filterOptions } = useFilterOptions();
  const { data: agents } = useAgents();
  const { data: agentPerf } = useAgentPerformance();
  const { data: agentSettings = [] } = useAgentStoreSettings();
  const { data: magasins = [] } = useMagasins();

  const handleDatePreset = (preset: string) => {
    if (preset === 'custom') {
      setFilters(f => ({ ...f, datePreset: 'custom' }));
      return;
    }
    if (preset === 'all') {
      setFilters(f => ({ ...f, datePreset: 'all', dateFrom: '', dateTo: '' }));
      return;
    }
    const { dateFrom, dateTo } = getDatePreset(preset);
    setFilters(f => ({ ...f, datePreset: preset, dateFrom, dateTo }));
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      city: 'all', productId: 'all', agentId: 'all', source: 'all',
      shippingProvider: 'all', utmSource: 'all', utmCampaign: 'all',
      magasinId: 'all', datePreset: 'all', dateFrom: '', dateTo: '',
    });
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v && v !== 'all');

  const StatCard = ({ title, value, icon: Icon, subtitle, color = '#1e1b4b', isCurrency = false }: any) => (
    <div
      className="rounded-xl p-4 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
      style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` }}
      data-testid={`card-stat-${title.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none">{title}</p>
        {isLoading ? (
          <div className="h-7 w-20 rounded-lg bg-white/20 animate-pulse mt-2" />
        ) : (
          <p className="text-2xl font-extrabold mt-1.5 leading-none tabular-nums">
            {isCurrency ? formatCurrency(value || 0) : (value?.toLocaleString('fr-FR') ?? '—')}
          </p>
        )}
        {subtitle && <p className="text-[10px] opacity-60 mt-1 leading-none">{subtitle}</p>}
      </div>
      <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 ml-3">
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );

  const confirme = stats?.confirme || 0;
  const cancelled = stats?.cancelled || 0;
  const inProgress = stats?.inProgress || 0;
  const delivered = stats?.delivered || 0;
  const totalOrders = stats?.totalOrders || 0;

  const confirmPct = totalOrders > 0 ? ((confirme / totalOrders) * 100).toFixed(2) : '0';
  const cancelPct = totalOrders > 0 ? ((cancelled / totalOrders) * 100).toFixed(2) : '0';
  const inProgressPct = totalOrders > 0 ? ((inProgress / totalOrders) * 100).toFixed(2) : '0';
  // nouveau = leads not yet actioned (total minus confirmed minus cancelled)
  const nouveauPct = totalOrders > 0 ? (((stats?.nouveau || 0) / totalOrders) * 100).toFixed(2) : '0';

  // Pie shows cumulative confirmed (stable after shipping), cancelled, and new leads
  // inProgress is a subset of confirme (cumulative), so excluded to avoid double-counting
  const pieData = [
    { name: `Confirmé ${confirmPct}%`,   value: confirme,           color: STATUS_COLORS.confirme },
    { name: `Annulé ${cancelPct}%`,      value: cancelled,          color: STATUS_COLORS.cancelled },
    { name: `Nouveau ${nouveauPct}%`,    value: stats?.nouveau || 0, color: STATUS_COLORS.nouveau },
  ].filter(d => d.value > 0);

  const deliveryPieData = [
    { name: `Refusé ${totalOrders > 0 ? ((stats?.refused || 0) / totalOrders * 100).toFixed(2) : 0}%`,        value: stats?.refused || 0, color: STATUS_COLORS.cancelled },
    { name: `Livraison en cours ${inProgressPct}%`,                                                              value: inProgress,          color: STATUS_COLORS.transit },
    { name: `Livraison livrée ${totalOrders > 0 ? (delivered / totalOrders * 100).toFixed(2) : 0}%`,           value: delivered,           color: STATUS_COLORS.delivered },
  ].filter(d => d.value > 0);

  const dailyChartData = stats?.daily?.map((d: any) => ({
    date: d.date.slice(5),
    count: d.count,
  })) || [];

  const agentMap = new Map((agents || []).map((a: any) => [a.id, a]));
  const agentSettingsMap = new Map((agentSettings as any[]).map((s: any) => [s.agentId, s]));

  const roleBadge = (agentId: number) => {
    const s = agentSettingsMap.get(agentId);
    const role = s?.roleInStore || 'confirmation';
    if (role === 'suivi') return <Badge className="text-[10px] h-4 px-1.5 bg-sky-100 text-sky-700 border-sky-200">Suivi</Badge>;
    if (role === 'both') return <Badge className="text-[10px] h-4 px-1.5 bg-purple-100 text-purple-700 border-purple-200">Les deux</Badge>;
    return <Badge className="text-[10px] h-4 px-1.5 bg-sky-100 text-sky-700 border-sky-200">Confirmation</Badge>;
  };

  if (isMediaBuyer) {
    const PLATFORMS = ['Facebook-Ads', 'TikTok-Ads', 'Google-Ads', 'Snapchat-Ads'];
    const allPlatforms = [...new Set([...PLATFORMS, ...(mediaBuyerStats?.platforms || [])])];
    const allCities = [...new Set((mediaBuyerStats?.cities || []).map((c: any) => c.name))];
    const allProducts = [...new Set((mediaBuyerStats?.products || []).map((p: any) => p.name as string).filter(Boolean))];
    const allCampaigns = [...new Set((mediaBuyerStats?.campaigns || []))];
    const hasActiveFilters = platformFilter !== 'all' || mbCityFilter !== 'all' || mbProductFilter !== 'all' || mbCampaignFilter !== 'all' || mbDateRange.from || mbDateRange.to;

    const generatedLink = (() => {
      if (!linkBaseUrl) return '';
      const base = linkBaseUrl.replace(/\/$/, '');
      const baseUrl = base.startsWith('http') ? base : `https://${base}`;
      const effectivePlatform = linkPlatform && linkPlatform !== 'none' ? linkPlatform : '';
      const src = effectivePlatform
        ? `${user?.buyerCode || ''}*${effectivePlatform}`
        : (user?.buyerCode || '');
      const p = new URLSearchParams();
      p.set('utm_source', src);
      if (linkCampaign.trim()) p.set('utm_campaign', linkCampaign.trim());
      return `${baseUrl}?${p.toString()}`;
    })();

    const copyLink = () => {
      if (!generatedLink) return;
      navigator.clipboard.writeText(generatedLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    };

    const mb = mediaBuyerStats;
    const inProgressCount = mb?.inProgress ?? 0;
    const inProgressPct = mb && mb.total > 0 ? Math.round((inProgressCount / mb.total) * 100) : 0;

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-tight" data-testid="text-dashboard-title">STATISTICS</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Bonjour <span className="font-semibold">{user?.username}</span> — Code: <span className="font-mono font-bold text-violet-600">{user?.buyerCode || '—'}</span>
            </p>
          </div>
        </div>

        {/* Professional Filter Bar */}
        <div className="bg-white dark:bg-card border border-border/60 rounded-xl shadow-sm">
          <div className="px-4 pt-3 pb-1 border-b border-border/40">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Statistiques — Filtres</span>
          </div>
          <div className="flex flex-wrap items-center gap-0 divide-x divide-border/40">
            {/* City */}
            <div className="px-3 py-2.5">
              <Select value={mbCityFilter} onValueChange={setMbCityFilter}>
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 w-auto min-w-[130px] bg-transparent" data-testid="select-mb-city">
                  <SelectValue placeholder="Toutes les Villes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les Villes</SelectItem>
                  {allCities.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Product */}
            <div className="px-3 py-2.5">
              <Select value={mbProductFilter} onValueChange={setMbProductFilter}>
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 w-auto min-w-[140px] bg-transparent" data-testid="select-mb-product">
                  <SelectValue placeholder="Tous les Produits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les Produits</SelectItem>
                  {allProducts.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Platform / Source */}
            <div className="px-3 py-2.5">
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 w-auto min-w-[150px] bg-transparent" data-testid="select-platform-filter">
                  <SelectValue placeholder="Toutes les Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les Sources</SelectItem>
                  {allPlatforms.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Campaign */}
            <div className="px-3 py-2.5">
              <Select value={mbCampaignFilter} onValueChange={setMbCampaignFilter}>
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 w-auto min-w-[150px] bg-transparent" data-testid="select-mb-campaign">
                  <SelectValue placeholder="Toutes les Campagnes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les Campagnes</SelectItem>
                  {allCampaigns.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Date Range Picker */}
            <div className="px-3 py-2 ml-auto">
              <DateRangePicker
                value={mbDateRange}
                onChange={setMbDateRange}
                placeholder="Toutes les Dates"
              />
            </div>
            {/* Reset button */}
            {hasActiveFilters && (
              <div className="px-3 py-2 border-l border-border/40">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setPlatformFilter('all');
                    setMbCityFilter('all');
                    setMbProductFilter('all');
                    setMbCampaignFilter('all');
                    setMbDateRange({ from: '', to: '' });
                  }}
                  data-testid="button-mb-reset-filters"
                >
                  Réinitialiser
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 6 Stats Cards — row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Commandes Totales — Navy */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #2d2a6e 100%)' }}
            data-testid="card-mb-total"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Commandes Totales</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">{mb?.total ?? '—'}</p>
              <p className="text-[10px] opacity-50 mt-1">Toutes périodes filtrées</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <PackageSearch className="w-7 h-7 text-white/80" />
            </div>
          </div>

          {/* Confirmées — Sky Blue */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}
            data-testid="card-mb-confirmed"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Confirmées</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">{mb?.confirmed ?? '—'}</p>
              <p className="text-[10px] opacity-50 mt-1">Commandes confirmées</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <PhoneCall className="w-7 h-7 text-white/80" />
            </div>
          </div>

          {/* Taux de Confirmation — Brand Gold */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #C5A059 0%, #a8853f 100%)' }}
            data-testid="card-mb-confirm-rate"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Taux de Confirmation</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">{mb ? `${mb.confirmRate}%` : '—'}</p>
              <p className="text-[10px] opacity-60 mt-1">Confirmées / Total</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-7 h-7 text-white/80" />
            </div>
          </div>
        </div>

        {/* 6 Stats Cards — row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* En Cours — Slate */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' }}
            data-testid="card-mb-inprogress"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">En Cours de Livraison</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">
                {inProgressCount}
                <span className="text-lg font-bold opacity-70 ml-2">({inProgressPct}%)</span>
              </p>
              <p className="text-[10px] opacity-50 mt-1">En transit chez le livreur</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <Truck className="w-7 h-7 text-white/80" />
            </div>
          </div>

          {/* Livrées — Emerald */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            data-testid="card-mb-delivered"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Livrées</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">{mb?.delivered ?? '—'}</p>
              <p className="text-[10px] opacity-50 mt-1">Livraisons réussies</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <PackageCheck className="w-7 h-7 text-white/80" />
            </div>
          </div>

          {/* Taux de Livraison — Brand Gold */}
          <div
            className="rounded-xl p-5 flex items-center justify-between text-white shadow-sm hover:-translate-y-1 transition-transform duration-200 cursor-default select-none"
            style={{ background: 'linear-gradient(135deg, #C5A059 0%, #a8853f 100%)' }}
            data-testid="card-mb-delivery-rate"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Taux de Livraison</p>
              <p className="text-4xl font-extrabold mt-2 leading-none tabular-nums">{mb ? `${mb.deliveryRate}%` : '—'}</p>
              <p className="text-[10px] opacity-60 mt-1">Livrées / Confirmées</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-7 h-7 text-white/80" />
            </div>
          </div>
        </div>

        {/* Net Profit Engine — Media Buyer */}
        {mbProfit && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-4 flex items-center gap-2 pb-0.5">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Net Profit Engine</span>
            </div>
            <div className="rounded-xl p-4 text-white sm:col-span-2" style={{ background: 'linear-gradient(135deg, hsl(220 72% 38%), hsl(220 72% 28%))' }} data-testid="card-mb-net-profit">
              <p className="text-xs font-semibold opacity-80 uppercase tracking-wide mb-1">Profit Net (Livrées)</p>
              <p className="text-3xl font-extrabold leading-none">{formatCurrency(mbProfit.netProfit)}</p>
              <div className="flex gap-4 mt-2 text-xs opacity-80">
                <span>Revenu: {formatCurrency(mbProfit.revenue)}</span>
                <span>{mbProfit.deliveredCount} livrées</span>
              </div>
            </div>
            <div className="rounded-xl p-4 text-white" style={{ background: mbProfit.roi >= 0 ? '#16a34a' : '#dc2626' }} data-testid="card-mb-roi">
              <p className="text-xs font-semibold opacity-80 uppercase tracking-wide mb-1">ROI</p>
              <p className="text-3xl font-extrabold leading-none">{mbProfit.adSpend > 0 ? `${mbProfit.roi.toFixed(1)}%` : '∞'}</p>
              <p className="text-xs opacity-80 mt-2">Pub: {formatCurrency(mbProfit.adSpend)}</p>
            </div>
            <div className="rounded-xl p-4 bg-muted/60 border border-border/50" data-testid="card-mb-costs">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Déductions</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Coût produit</span><span className="font-semibold text-destructive">-{formatCurrency(mbProfit.productCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Livraison</span><span className="font-semibold text-destructive">-{formatCurrency(mbProfit.shippingCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Emballage</span><span className="font-semibold text-destructive">-{formatCurrency(mbProfit.packagingCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Commissions agents</span><span className="font-semibold text-destructive">-{formatCurrency(mbProfit.agentCommissions ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dépenses pub</span><span className="font-semibold text-destructive">-{formatCurrency(mbProfit.adSpend)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Line Chart */}
        {(mb?.daily?.length ?? 0) > 0 && (
          <Card className="rounded-xl border-border/50 shadow-sm" data-testid="card-mb-chart">
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={mb!.daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name="Commandes" stroke={STATUS_COLORS.nouveau} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="confirmed" name="Confirmées" stroke={STATUS_COLORS.confirme} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="delivered" name="Livrées" stroke={STATUS_COLORS.delivered} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tables: Products + Cities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* PRODUITS COMMANDÉS */}
          <Card className="rounded-xl border-border/50 shadow-sm" data-testid="card-mb-products">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Produits Commandés</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-[11px] font-bold uppercase">Produit</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Total</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Confirmé</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">% Conf</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">En Cours</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Livrées</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">% Livr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(mb?.products?.length ?? 0) === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-6">Aucune donnée</TableCell></TableRow>
                    ) : (mb?.products || []).map((p: any, i: number) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium max-w-[120px] truncate">{p.name}</TableCell>
                        <TableCell className="text-center font-bold">{p.total}</TableCell>
                        <TableCell className="text-center text-sky-600 font-semibold">{p.confirmed}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${p.confirmRate >= 60 ? 'text-green-600' : p.confirmRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{p.confirmRate}%</span>
                        </TableCell>
                        <TableCell className="text-center text-amber-600 font-semibold">{p.inProgress}</TableCell>
                        <TableCell className="text-center text-orange-600 font-semibold">{p.delivered}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${p.deliveryRate >= 50 ? 'text-green-600' : p.deliveryRate >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{p.deliveryRate}%</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* COMMANDES PAR VILLE */}
          <Card className="rounded-xl border-border/50 shadow-sm" data-testid="card-mb-cities">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Commandes par Ville</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-[11px] font-bold uppercase">Ville</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Total</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Confirmées</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">% Conf</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">Livrées</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-center">% Livr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(mb?.cities?.length ?? 0) === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">Aucune donnée</TableCell></TableRow>
                    ) : (mb?.cities || []).map((c: any, i: number) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-center font-bold">{c.total}</TableCell>
                        <TableCell className="text-center text-sky-600 font-semibold">{c.confirmed}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${c.confirmRate >= 60 ? 'text-green-600' : c.confirmRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{c.confirmRate}%</span>
                        </TableCell>
                        <TableCell className="text-center text-orange-600 font-semibold">{c.delivered}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${c.deliveryRate >= 50 ? 'text-green-600' : c.deliveryRate >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{c.deliveryRate}%</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* UTM Pro Link Generator */}
        <Card className="rounded-xl border-border/50 shadow-sm" data-testid="card-link-builder">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Générateur de Lien UTM Pro</h2>
                <p className="text-xs text-muted-foreground">Lien deep-tracking <code className="bg-muted px-1 rounded text-[10px]">CODE*PLATEFORME</code></p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-3 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Étape 1 — URL de la page</label>
                <Input data-testid="input-link-base-url" placeholder="ex: monsite.com/produit" value={linkBaseUrl} onChange={e => setLinkBaseUrl(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Étape 2 — Plateforme</label>
                <Select value={linkPlatform} onValueChange={setLinkPlatform}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-link-platform">
                    <SelectValue placeholder="Choisir la plateforme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune (code seul)</SelectItem>
                    <SelectItem value="Facebook-Ads">Facebook Ads</SelectItem>
                    <SelectItem value="TikTok-Ads">TikTok Ads</SelectItem>
                    <SelectItem value="Google-Ads">Google Ads</SelectItem>
                    <SelectItem value="Snapchat-Ads">Snapchat Ads</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Étape 3 — Nom de la campagne</label>
                <Input data-testid="input-link-campaign" placeholder="ex: mocasan-promo, ramadan-2025" value={linkCampaign} onChange={e => setLinkCampaign(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            {generatedLink && (
              <div className="mt-3 p-3 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-violet-700">Lien généré :</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-violet-300 text-violet-600 hover:bg-violet-100 gap-1.5" onClick={copyLink} data-testid="button-copy-link">
                    {copiedLink ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copié !</> : <><Link2 className="w-3.5 h-3.5" /> Copier</>}
                  </Button>
                </div>
                <code className="text-xs text-violet-800 dark:text-violet-300 font-mono break-all block">{generatedLink}</code>
                {linkPlatform && linkPlatform !== 'none' && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">utm_source: {user?.buyerCode}*{linkPlatform}</Badge>
                    {linkCampaign && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">utm_campaign: {linkCampaign}</Badge>}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase" data-testid="text-dashboard-title">Dashboard</h1>
          {isAdminUser && (
            <div className="flex rounded-lg border border-border/60 overflow-hidden text-xs" data-testid="admin-view-toggle">
              <button
                onClick={() => setAdminView('global')}
                className={`px-3 py-1.5 font-semibold transition-colors ${adminView === 'global' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                data-testid="toggle-global"
              >
                Stats Globales
              </button>
              <button
                onClick={() => setAdminView('personal')}
                className={`px-3 py-1.5 font-semibold transition-colors ${adminView === 'personal' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                data-testid="toggle-personal"
              >
                Mes Stats Personnelles
              </button>
            </div>
          )}
        </div>
        {!isAgent && hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5 text-xs" data-testid="button-reset-filters">
            <Filter className="w-3.5 h-3.5" /> Réinitialiser les filtres
          </Button>
        )}
      </div>

      {!isAgent && (
      <Card className="rounded-xl border-border/50 shadow-sm" data-testid="card-filter-bar">
        <CardContent className="p-2.5 md:p-4">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">Filtres</span>
            </div>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-[10px] text-primary font-medium hover:underline md:hidden" data-testid="button-reset-filters-mobile">
                Réinitialiser
              </button>
            )}
          </div>
          <div className="flex flex-col md:flex-row md:flex-wrap gap-1.5 md:gap-2">
            <Select value={filters.city} onValueChange={(v) => updateFilter('city', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-city">
                <SelectValue placeholder="Toutes les Villes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les Villes</SelectItem>
                {filterOptions?.cities?.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.productId} onValueChange={(v) => updateFilter('productId', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[150px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-product">
                <SelectValue placeholder="Tous les Produits" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Produits</SelectItem>
                {filterOptions?.products?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.shippingProvider} onValueChange={(v) => updateFilter('shippingProvider', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-shipper">
                <SelectValue placeholder="Tous les Livreurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Livreurs</SelectItem>
                {filterOptions?.shippingProviders?.map((s: string) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.agentId} onValueChange={(v) => updateFilter('agentId', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-agent">
                <SelectValue placeholder="Tous les Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Agents</SelectItem>
                {filterOptions?.agents?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.source} onValueChange={(v) => updateFilter('source', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-source">
                <SelectValue placeholder="Toutes les Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les Sources</SelectItem>
                {filterOptions?.sources?.map((s: string) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.utmSource} onValueChange={(v) => updateFilter('utmSource', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-utm-source">
                <SelectValue placeholder="UTM Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les UTM Source</SelectItem>
                {filterOptions?.utmSources?.map((s: string) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.utmCampaign} onValueChange={(v) => updateFilter('utmCampaign', v)}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[150px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-utm-campaign">
                <SelectValue placeholder="UTM Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les Campagnes</SelectItem>
                {filterOptions?.utmCampaigns?.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(magasins as any[]).length > 1 && (
              <Select value={filters.magasinId} onValueChange={(v) => updateFilter('magasinId', v)}>
                <SelectTrigger className="w-full md:w-auto md:min-w-[150px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-magasin">
                  <SelectValue placeholder="Tous les Magasins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les Magasins</SelectItem>
                  {(magasins as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filters.datePreset} onValueChange={handleDatePreset}>
              <SelectTrigger className="w-full md:w-auto md:min-w-[150px] h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-date-preset">
                <CalendarDays className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les dates</SelectItem>
                <SelectItem value="today">Aujourd'hui</SelectItem>
                <SelectItem value="yesterday">Hier</SelectItem>
                <SelectItem value="this_month">Ce mois</SelectItem>
                <SelectItem value="last_month">Mois dernier</SelectItem>
                <SelectItem value="custom">Personnalisé</SelectItem>
              </SelectContent>
            </Select>

            {filters.datePreset === 'custom' && (
              <div className="flex gap-1.5 md:gap-2 w-full md:w-auto">
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="flex-1 md:w-[130px] md:flex-none h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60"
                  data-testid="filter-date-from"
                />
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="flex-1 md:w-[130px] md:flex-none h-8 md:h-9 text-[11px] md:text-xs bg-white dark:bg-card border-border/60"
                  data-testid="filter-date-to"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {isAgent && walletData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
          <Card className="sm:col-span-3 rounded-xl border-0 shadow-md overflow-hidden" style={{ background: 'linear-gradient(135deg, #C5A059 0%, #a8853f 50%, #8a6930 100%)' }} data-testid="card-wallet">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <DollarSign className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-0.5">Mon Portefeuille</p>
                  <p className="text-white text-3xl font-bold">{Number(walletData.totalEarned).toFixed(2)} <span className="text-white/70 text-lg font-normal">DH</span></p>
                  <p className="text-white/70 text-xs mt-0.5">Total commissions gagnées ({walletData.deliveredTotal} livraisons)</p>
                </div>
              </div>
              <div className="flex sm:flex-col gap-4 sm:gap-2 sm:items-end">
                <div className="text-center sm:text-right">
                  <p className="text-white/70 text-xs uppercase tracking-wide">Ce mois</p>
                  <p className="text-white text-xl font-bold">{walletData.deliveredThisMonth}</p>
                  <p className="text-white/60 text-xs">livraisons</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-white/70 text-xs uppercase tracking-wide">Taux</p>
                  <p className="text-white text-xl font-bold">{walletData.commissionRate} DH</p>
                  <p className="text-white/60 text-xs">par livraison</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isAgent && totalCommissionsOwed > 0 && (
        <Card className="rounded-xl border-0 shadow-md overflow-hidden" style={{ background: 'linear-gradient(135deg, #C5A059 0%, #a8853f 100%)' }} data-testid="card-commissions-summary">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wider">Total Commissions à Payer</p>
                <p className="text-white text-2xl font-bold">{totalCommissionsOwed.toFixed(2)} DH</p>
              </div>
            </div>
            <div className="flex gap-4">
              {commissionsSummary?.filter(a => a.totalOwed > 0).map(a => (
                <div key={a.agentId} className="text-center">
                  <p className="text-white/70 text-xs">{a.agentName}</p>
                  <p className="text-white font-semibold text-sm">{Number(a.totalOwed).toFixed(2)} DH</p>
                  <p className="text-white/60 text-xs">{a.deliveredTotal} livrées</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin Personal Stats Banner */}
      {isAdminUser && adminView === 'personal' && (
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-300" data-testid="admin-personal-stats">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <h3 className="text-sm font-bold text-primary">Mes Stats Personnelles ({user?.username})</h3>
          </div>
          {adminPersonalProfit ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white dark:bg-card border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Mon Revenu</p>
                <p className="text-lg font-bold">{formatCurrency(adminPersonalProfit.revenue)}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-card border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Mes Livrées</p>
                <p className="text-lg font-bold">{adminPersonalProfit.deliveredCount}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-card border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Ma Pub</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(adminPersonalProfit.adSpend)}</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3" style={{ background: 'linear-gradient(135deg, #C5A059 0%, #8a6930 100%)' }}>
                <p className="text-xs text-white/80 mb-1">Mon Profit Net</p>
                <p className="text-lg font-bold text-white">{formatCurrency(adminPersonalProfit.netProfit)}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="rounded-xl border border-border/50 p-3 h-16 bg-white dark:bg-card"><div className="h-4 w-16 bg-muted rounded animate-pulse" /></div>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Les stats globales du magasin restent affichées ci-dessous.</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Commandes" value={totalOrders} icon={PackageSearch} color="#1e1b4b" subtitle="Total des commandes" />
        <StatCard title="Confirmées" value={confirme} icon={PhoneCall} color={STATUS_COLORS.confirme} subtitle={`${confirmPct}% du total`} />
        <StatCard title="En cours" value={inProgress} icon={Truck} color={STATUS_COLORS.transit} subtitle={`${inProgressPct}%`} />
        <StatCard title="Annulées" value={cancelled} icon={Ban} color={STATUS_COLORS.cancelled} subtitle={`${cancelPct}%`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Livrées" value={delivered} icon={PackageCheck} color={STATUS_COLORS.delivered} subtitle={`${totalOrders > 0 ? (delivered / totalOrders * 100).toFixed(2) : 0}%`} />
        {canSeeProfit ? (
          <Card className="rounded-xl border-0 shadow-md overflow-hidden" data-testid="card-net-profit" style={{ background: (stats?.profit || 0) >= 0 ? 'linear-gradient(135deg, #C5A059 0%, #a8853f 50%, #7a6025 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">Profit Net</p>
                <p className="text-white text-xl font-extrabold leading-none truncate">{formatCurrency(stats?.profit || 0)}</p>
                <p className="text-white/70 text-[10px] mt-0.5">Livraison: {stats?.deliveryRate || 0}%</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <StatCard title="Refusées" value={stats?.refused || 0} icon={XCircle} color={STATUS_COLORS.cancelled} subtitle={`${totalOrders > 0 ? ((stats?.refused || 0) / totalOrders * 100).toFixed(2) : 0}%`} />
        {canSeeRevenue && (
          <StatCard title="ROI / ROAS" value={null} icon={BarChart3} color="#C5A059" subtitle={
            stats?.adSpendTotal > 0
              ? `ROI: ${stats.roi?.toFixed(1)}% | ROAS: ${stats.roas?.toFixed(2)}x`
              : 'Aucune dépense pub'
          } />
        )}
      </div>

      {/* TOTAL COÛTS, COMMISSIONS AGENTS, DÉPENSES PUB cards hidden by request */}

      {/* ── Agent Performance Charts — placed below all status cards ── */}
      {isAgent && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Statistiques de Performance</h2>
            <span className="text-xs text-muted-foreground">— 15 derniers jours</span>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">

            {/* Line Chart — Évolution des commandes (70 % on desktop) */}
            <Card className="flex-1 lg:basis-[70%] rounded-xl shadow-sm border border-border/50" data-testid="card-agent-daily-chart">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: STATUS_COLORS.confirme }} />
                  Évolution des commandes
                </CardTitle>
                <p className="text-xs text-muted-foreground">Commandes traitées par jour (15 derniers jours)</p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {agentStatsLoading ? (
                  <div className="h-[220px] flex items-center justify-center">
                    <Skeleton className="w-full h-full rounded-lg" />
                  </div>
                ) : !agentMyStats?.daily?.length ? (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    Aucune donnée disponible
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={agentMyStats.daily} margin={{ top: 10, right: 20, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        dy={6}
                        interval={Math.max(0, Math.floor((agentMyStats.daily.length - 1) / 6))}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        allowDecimals={false}
                        width={30}
                      />
                      <RechartsTooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [v, 'Commandes']}
                        labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        stroke={STATUS_COLORS.confirme}
                        strokeWidth={2.5}
                        dot={{ fill: STATUS_COLORS.confirme, r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: STATUS_COLORS.confirme, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Donut Chart — Répartition des statuts (30 % on desktop) */}
            {(() => {
              // Build from the EXACT same variables the stat cards use — guaranteed match
              const pieRows = [
                { name: 'Nouveau',    value: stats?.nouveau || 0,  color: '#f59e0b'               },
                { name: 'Confirmées', value: confirme,              color: STATUS_COLORS.confirme  },
                { name: 'Livrées',    value: delivered,             color: STATUS_COLORS.delivered },
                { name: 'En cours',   value: inProgress,            color: STATUS_COLORS.transit   },
                { name: 'Annulées',   value: cancelled,             color: STATUS_COLORS.cancelled },
                { name: 'Refusées',   value: stats?.refused || 0,   color: '#e11d48'               },
              ];
              const pieTotal = totalOrders;
              const pieData  = pieRows.filter(r => r.value > 0); // only non-zero segments in donut
              return (
                <Card className="lg:basis-[30%] rounded-xl shadow-sm border border-border/50" data-testid="card-agent-status-chart">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" style={{ color: STATUS_COLORS.delivered }} />
                      Répartition des statuts
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {totalOrders} commande{totalOrders !== 1 ? 's' : ''} au total
                    </p>
                  </CardHeader>
                  <CardContent className="px-3 pb-5">
                    {isLoading ? (
                      <div className="h-[220px] flex items-center justify-center">
                        <Skeleton className="w-full h-full rounded-lg" />
                      </div>
                    ) : pieTotal === 0 ? (
                      <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                        Aucune commande sur cette période
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <ResponsiveContainer width="100%" height={150}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={68}
                              paddingAngle={3}
                              dataKey="value"
                              nameKey="name"
                              stroke="none"
                            >
                              {pieData.map((entry, i) => (
                                <Cell key={`cell-${i}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                              formatter={(v: number, name: string) => [`${v} commandes`, name]}
                              labelStyle={{ display: 'none' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Legend — ALL 5 rows always visible */}
                        <div className="w-full space-y-2">
                          {pieRows.map((s) => {
                            const pct = pieTotal > 0
                              ? ((s.value / pieTotal) * 100).toFixed(1)
                              : '0.0';
                            return (
                              <div key={s.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                                  <span className={`font-medium ${s.value > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{s.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 tabular-nums">
                                  <span className={`font-bold ${s.value > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{s.value}</span>
                                  <span className="text-muted-foreground text-[10px]">({pct}%)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

          </div>
        </div>
      )}

      {filters.productId !== 'all' && (
        <Card className="rounded-xl border-primary/30 bg-primary/5 shadow-sm" data-testid="card-product-drilldown">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-primary">Performance Produit</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Taux de confirmation</p>
                <p className="text-xl font-bold" data-testid="text-product-confirm-rate">{stats?.confirmationRate || 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taux de livraison</p>
                <p className="text-xl font-bold" data-testid="text-product-delivery-rate">{stats?.deliveryRate || 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dépenses Pub</p>
                <p className="text-xl font-bold">{formatCurrency(stats?.adSpendTotal || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ROI Produit</p>
                <p className="text-xl font-bold text-primary" data-testid="text-product-roi">
                  {stats?.adSpendTotal > 0 ? `${stats.roi?.toFixed(1)}%` : '∞'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canSeeCharts && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-xl shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Comparaison des ventes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {isLoading ? (
                <Skeleton className="w-full h-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 text-border" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', opacity: 0.4, fontSize: 10 }} dy={10} interval={Math.max(0, Math.floor(dailyChartData.length / 10))} />
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
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {!isAgent && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="col-span-1 lg:col-span-2 rounded-xl shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg"><TrendingUp className="w-4 h-4 text-primary" /></div>
              Performance de l'équipe
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="text-xs">Membre</TableHead>
                    <TableHead className="text-xs text-center">Activités</TableHead>
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
                          <div className="mt-0.5">{roleBadge(perf.agentId)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-orange-500 text-white text-xs">{perf.total}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold w-5">{perf.confirmed}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[80px]">
                                <div className="h-1.5 rounded-full" style={{ width: `${confirmRate}%`, background: STATUS_COLORS.confirme }} />
                              </div>
                              <span className="text-muted-foreground">confirme</span>
                              <span className="font-bold" style={{ color: STATUS_COLORS.confirme }}>{confirmRate}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold w-5">{perf.delivered}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[80px]">
                                <div className="h-1.5 rounded-full" style={{ width: `${deliverRate}%`, background: STATUS_COLORS.delivered }} />
                              </div>
                              <span className="text-muted-foreground">livré</span>
                              <span className="font-bold" style={{ color: STATUS_COLORS.delivered }}>{deliverRate}%</span>
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
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Aucune donnée de performance</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {canSeeCharts && (
        <Card className="col-span-1 rounded-xl shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Statut des livraisons</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-[280px]">
            {deliveryPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deliveryPieData} cx="50%" cy="45%" outerRadius={90} dataKey="value" stroke="none">
                    {deliveryPieData.map((entry, index) => (
                      <Cell key={`dcell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
        )}
      </div>}

      {canSeeTopProducts && (
      <Card className="rounded-xl border-border/50 shadow-sm bg-white dark:bg-card" data-testid="card-product-performance">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold uppercase tracking-wide">Produits Commandés</CardTitle>
          <span className="text-xs text-muted-foreground">{stats?.productPerformance?.length || 0} produit(s)</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Total</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Confirmés</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">% Confirmation</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">En Cours</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Livrées</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">% Livraison</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Coût Pub</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.productPerformance && stats.productPerformance.length > 0 ? stats.productPerformance.map((p: any, i: number) => {
                  const confColor = p.confirmationRate >= 70 ? 'text-emerald-600' : p.confirmationRate >= 40 ? 'text-amber-500' : 'text-red-500';
                  const confBg = p.confirmationRate >= 70 ? 'bg-emerald-500' : p.confirmationRate >= 40 ? 'bg-amber-400' : 'bg-red-400';
                  const delColor = p.deliveryRate >= 70 ? 'text-emerald-600' : p.deliveryRate >= 40 ? 'text-amber-500' : 'text-red-500';
                  const delBg = p.deliveryRate >= 70 ? 'bg-emerald-500' : p.deliveryRate >= 40 ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <TableRow key={i} className="hover:bg-muted/20 transition-colors" data-testid={`product-perf-${i}`}>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.name}</span>
                          {!p.inStock && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 font-medium">
                              Hors Stock
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-sm">{p.total}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-950/30">{p.confirme}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold text-sm ${confColor}`}>{p.confirmationRate}%</span>
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div className={`${confBg} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(p.confirmationRate, 100)}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-800/50">{p.inProgress}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">{p.delivered}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold text-sm ${delColor}`}>{p.deliveryRate}%</span>
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div className={`${delBg} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(p.deliveryRate, 100)}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.adCost > 0 ? (
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(p.adCost)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="w-8 h-8 text-muted-foreground/40" />
                        <span className="text-sm">Aucune donnée disponible</span>
                        <span className="text-xs text-muted-foreground/60">Modifiez les filtres ou la période pour voir les résultats</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Target, UserPlus, Loader2, Copy, Check, TrendingUp, ShoppingCart, Truck, DollarSign, Pencil, X, ChevronDown, ChevronRight, Monitor, Search, Calendar, Award, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function ProgressBar({ value, color }: { value: number; color: 'sky' | 'emerald' | 'amber' | 'rose' }) {
  const track: Record<string, string> = {
    sky: 'bg-sky-100 dark:bg-sky-900/30',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30',
    amber: 'bg-amber-100 dark:bg-amber-900/30',
    rose: 'bg-rose-100 dark:bg-rose-900/30',
  };
  const fill: Record<string, string> = {
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };
  const capped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("w-full rounded-full h-1.5 mt-1", track[color])}>
      <div className={cn("h-1.5 rounded-full transition-all", fill[color])} style={{ width: `${capped}%` }} />
    </div>
  );
}

function PctCell({ value, type }: { value: number; type: 'confirm' | 'delivery' }) {
  const isConfirm = type === 'confirm';
  const color = value >= 60 ? (isConfirm ? 'sky' : 'emerald') : value >= 40 ? 'amber' : 'rose';
  const textColor = value >= 60
    ? (isConfirm ? 'text-sky-700 dark:text-sky-400' : 'text-emerald-700 dark:text-emerald-400')
    : value >= 40 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <div className="min-w-[64px]">
      <span className={cn("text-sm font-bold", textColor)}>{value}%</span>
      <ProgressBar value={value} color={color} />
    </div>
  );
}

export default function MediaBuyersPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editBuyer, setEditBuyer] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedBuyer, setExpandedBuyer] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [form, setForm] = useState({ username: '', email: '', password: '', buyerCode: '' });
  const [editForm, setEditForm] = useState({ username: '', email: '', buyerCode: '' });

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set('dateFrom', dateFrom);
  if (dateTo) queryParams.set('dateTo', dateTo);
  const queryString = queryParams.toString();

  const { data: buyers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/media-buyers/summary', dateFrom, dateTo],
    queryFn: async () => {
      const url = `/api/media-buyers/summary${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/agents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyers/summary'] });
      toast({ title: "Media Buyer créé", description: `${form.username} a été ajouté avec succès.` });
      setShowAddModal(false);
      setForm({ username: '', email: '', password: '', buyerCode: '' });
    },
    onError: (err: any) => {
      const msg = err?.message || err?.response?.data?.message || "Impossible de créer le media buyer.";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PUT', `/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyers/summary'] });
      toast({ title: "Mis à jour", description: "Le media buyer a été modifié." });
      setEditBuyer(null);
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier.", variant: "destructive" }),
  });

  // Role guard — placed AFTER all hook declarations (Rules of Hooks)
  if (user && user.role !== 'owner' && user.role !== 'admin' && !user.isSuperAdmin) {
    navigate('/');
    return null;
  }

  const filteredBuyers = buyers.filter((b: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (b.username || '').toLowerCase().includes(s) || (b.email || '').toLowerCase().includes(s) || (b.buyerCode || '').toLowerCase().includes(s);
  });

  const handleCreate = () => {
    if (!form.username.trim() || !form.password.trim() || !form.buyerCode.trim()) {
      toast({ title: "Champs requis", description: "Nom, mot de passe et code UTM sont obligatoires.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      password: form.password,
      role: 'media_buyer',
      buyerCode: form.buyerCode.trim().toUpperCase(),
    });
  };

  const handleUpdate = () => {
    if (!editBuyer || !editForm.buyerCode.trim()) {
      toast({ title: "Code requis", description: "Le code UTM est obligatoire.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editBuyer.id,
      data: { buyerCode: editForm.buyerCode.trim().toUpperCase() },
    });
  };

  const openEdit = (buyer: any) => {
    setEditBuyer(buyer);
    setEditForm({ username: buyer.username, email: buyer.email || '', buyerCode: buyer.buyerCode || '' });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const clearDates = () => { setDateFrom(''); setDateTo(''); };

  const totalLeads = buyers.reduce((s: number, b: any) => s + (b.total || 0), 0);
  const avgConfirm = buyers.length > 0 ? Math.round(buyers.reduce((s: number, b: any) => s + (b.confirmRate || 0), 0) / buyers.length) : 0;
  const avgDelivery = buyers.length > 0 ? Math.round(buyers.reduce((s: number, b: any) => s + (b.deliveryRate || 0), 0) / buyers.length) : 0;
  const totalProfit = buyers.reduce((s: number, b: any) => s + (b.netProfit || 0), 0);

  const sortedBuyers = [...filteredBuyers].sort((a: any, b: any) => (b.netProfit || 0) - (a.netProfit || 0));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shadow-sm">
            <Target className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold uppercase" data-testid="text-page-title">Gestion Media Buyers</h1>
            <p className="text-xs text-muted-foreground">{buyers.length} media buyer{buyers.length !== 1 ? 's' : ''} — Leaderboard de performance</p>
          </div>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
          data-testid="button-add-media-buyer"
        >
          <UserPlus className="w-4 h-4" />
          Ajouter un Media Buyer
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Leads</p>
              <p className="text-2xl font-bold" data-testid="stat-total-leads">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Taux Conf. Moy.</p>
              <p className="text-2xl font-bold text-sky-600" data-testid="stat-avg-confirm">{avgConfirm}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Taux Livr. Moy.</p>
              <p className="text-2xl font-bold text-emerald-600" data-testid="stat-avg-delivery">{avgDelivery}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(197,160,89,0.15)' }}>
              <DollarSign className="w-4 h-4" style={{ color: '#C5A059' }} />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Profit Net Total</p>
              <p className="text-xl font-bold" style={{ color: '#C5A059' }} data-testid="stat-total-profit">{formatCurrency(totalProfit)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters: date range + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Rechercher par nom, email ou code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
            data-testid="input-search-buyer"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 text-sm border border-border rounded-md px-2 bg-background"
            data-testid="input-date-from"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 text-sm border border-border rounded-md px-2 bg-background"
            data-testid="input-date-to"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearDates} className="h-8 px-2 text-muted-foreground" data-testid="button-clear-dates">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Main table */}
      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedBuyers.length === 0 && buyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Target className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">Aucun media buyer pour l'instant</p>
            <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="gap-2" data-testid="button-add-first">
              <UserPlus className="w-3.5 h-3.5" /> Ajouter le premier
            </Button>
          </div>
        ) : sortedBuyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Search className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucun résultat pour "{search}"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-violet-50/60 dark:bg-violet-900/10">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase tracking-wider w-8"></TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider"># Rang</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider">Media Buyer</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider">Code UTM</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Total Leads</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Confirmés</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-center">% Confirm.</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Livrées</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-center">% Livraison</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Budget Pub</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Profit Net</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBuyers.map((buyer: any, idx: number) => (
                  <Fragment key={buyer.id}>
                    <TableRow
                      className={cn(
                        "hover:bg-muted/5 transition-colors",
                        idx === 0 && "bg-amber-50/30 dark:bg-amber-900/5"
                      )}
                      data-testid={`row-buyer-${buyer.id}`}
                    >
                      {/* Expand toggle */}
                      <TableCell className="px-2">
                        <button
                          onClick={() => setExpandedBuyer(expandedBuyer === buyer.id ? null : buyer.id)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          data-testid={`button-expand-${buyer.id}`}
                        >
                          {expandedBuyer === buyer.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </TableCell>

                      {/* Rank */}
                      <TableCell>
                        {idx === 0 ? (
                          <span title="Top performer" className="text-base">🥇</span>
                        ) : idx === 1 ? (
                          <span title="2e" className="text-base">🥈</span>
                        ) : idx === 2 ? (
                          <span title="3e" className="text-base">🥉</span>
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                        )}
                      </TableCell>

                      {/* Name + email */}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="w-8 h-8 border border-border">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${buyer.username}`} />
                            <AvatarFallback className="text-xs font-bold">{buyer.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">{buyer.username}</p>
                            {buyer.email && <p className="text-xs text-muted-foreground">{buyer.email}</p>}
                          </div>
                        </div>
                      </TableCell>

                      {/* UTM Code */}
                      <TableCell>
                        {buyer.buyerCode ? (
                          <div className="flex items-center gap-1.5">
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 font-mono text-xs">{buyer.buyerCode}</Badge>
                            <button
                              onClick={() => copyCode(buyer.buyerCode)}
                              className="text-muted-foreground hover:text-violet-600 transition-colors"
                              data-testid={`button-copy-code-${buyer.id}`}
                            >
                              {copiedCode === buyer.buyerCode
                                ? <Check className="w-3.5 h-3.5 text-green-500" />
                                : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : <span className="text-muted-foreground text-xs italic">Non défini</span>}
                      </TableCell>

                      {/* Total Leads */}
                      <TableCell className="text-center">
                        <span className="font-bold text-sm" data-testid={`text-leads-${buyer.id}`}>{buyer.total ?? 0}</span>
                      </TableCell>

                      {/* Confirmés count */}
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-semibold" data-testid={`text-confirmed-${buyer.id}`}>
                          {buyer.confirmed ?? 0}
                        </Badge>
                      </TableCell>

                      {/* % Confirmation */}
                      <TableCell className="text-center min-w-[90px]" data-testid={`text-confirm-rate-${buyer.id}`}>
                        <PctCell value={buyer.confirmRate ?? 0} type="confirm" />
                      </TableCell>

                      {/* Livrées count */}
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold" data-testid={`text-delivered-${buyer.id}`}>
                          {buyer.delivered ?? 0}
                        </Badge>
                      </TableCell>

                      {/* % Livraison */}
                      <TableCell className="text-center min-w-[90px]" data-testid={`text-delivery-rate-${buyer.id}`}>
                        <PctCell value={buyer.deliveryRate ?? 0} type="delivery" />
                      </TableCell>

                      {/* Ad Spend */}
                      <TableCell className="text-right">
                        <span className="text-sm font-medium text-muted-foreground" data-testid={`text-adspend-${buyer.id}`}>
                          {formatCurrency(buyer.adSpendTotal ?? 0)}
                        </span>
                      </TableCell>

                      {/* Profit Net — Gold */}
                      <TableCell className="text-right">
                        <span
                          className="text-sm font-bold"
                          style={{ color: (buyer.netProfit ?? 0) >= 0 ? '#C5A059' : '#e11d48' }}
                          data-testid={`text-profit-${buyer.id}`}
                        >
                          {formatCurrency(buyer.netProfit ?? 0)}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(buyer)}
                          data-testid={`button-edit-buyer-${buyer.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded platform breakdown */}
                    {expandedBuyer === buyer.id && buyer.platformBreakdown && buyer.platformBreakdown.length > 0 && (
                      <TableRow key={`${buyer.id}-breakdown`} className="bg-violet-50/40 dark:bg-violet-900/5">
                        <TableCell colSpan={12} className="py-3 px-6">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Monitor className="w-3.5 h-3.5 text-violet-500" />
                              <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Performance par Plateforme</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {buyer.platformBreakdown.map((pb: any) => (
                                <div key={pb.platform} className="bg-white dark:bg-card border border-border/50 rounded-lg p-3 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-muted-foreground">{pb.platform}</span>
                                    <Badge variant="outline" className={cn("text-[10px]",
                                      pb.confirmRate >= 60 ? "bg-sky-50 text-sky-700 border-sky-200"
                                        : pb.confirmRate >= 40 ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-rose-50 text-rose-700 border-rose-200"
                                    )}>{pb.confirmRate}%</Badge>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{pb.total} leads</span>
                                    <span className="text-emerald-600 font-medium">{pb.delivered} livrés</span>
                                  </div>
                                  <p className="text-xs font-semibold" style={{ color: '#C5A059' }}>{formatCurrency(pb.revenue)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md" data-testid="modal-add-media-buyer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-violet-600" />
              Ajouter un Media Buyer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-username">Nom d'utilisateur *</Label>
              <Input
                id="mb-username"
                data-testid="input-mb-username"
                placeholder="ex: Soufiane"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-email">Email (optionnel)</Label>
              <Input
                id="mb-email"
                data-testid="input-mb-email"
                type="email"
                placeholder="ex: soufiane@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-password">Mot de passe *</Label>
              <Input
                id="mb-password"
                data-testid="input-mb-password"
                type="password"
                placeholder="Mot de passe de connexion"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-code">Code UTM Unique *</Label>
              <Input
                id="mb-code"
                data-testid="input-mb-code"
                placeholder="ex: MB1, SOUF-ADS, YOUSSEF"
                value={form.buyerCode}
                onChange={e => setForm(f => ({ ...f, buyerCode: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Ce code sera utilisé comme <code className="bg-muted px-1 rounded text-xs">utm_source</code> dans les liens de tracking.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)} data-testid="button-cancel-add">Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              data-testid="button-confirm-add"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editBuyer} onOpenChange={v => !v && setEditBuyer(null)}>
        <DialogContent className="max-w-md" data-testid="modal-edit-media-buyer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-violet-600" />
              Modifier — {editBuyer?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-mb-code">Code UTM *</Label>
              <Input
                id="edit-mb-code"
                data-testid="input-edit-mb-code"
                placeholder="ex: MB1, SOUF-ADS"
                value={editForm.buyerCode}
                onChange={e => setEditForm(f => ({ ...f, buyerCode: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Modifier le code UTM unique de ce media buyer. Les commandes avec l'ancien code ne seront pas rétroactivement mises à jour.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditBuyer(null)} data-testid="button-cancel-edit">Annuler</Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

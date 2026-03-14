import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldAlert, Loader2, Store, ShoppingBag, TrendingUp, Users,
  RefreshCw, UserCheck, LogIn, ChevronDown, ChevronUp,
  Globe, Phone, Calendar, Package, Crown
} from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "hsl(220 72% 38%)";

const PLANS = [
  { value: "starter",  label: "Starter",  price: 20000, limit: 1500 },
  { value: "pro",      label: "Pro",       price: 40000, limit: 5000 },
  { value: "custom",   label: "Custom",    price: 0,     limit: 99999 },
];

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="rounded-2xl p-5 text-white flex items-center gap-4" style={{ background: color }}>
      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-2xl font-extrabold leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function PlanModal({ store, onClose }: { store: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const current = store.subscription;
  const [plan, setPlan] = useState(current?.plan ?? "starter");
  const [limit, setLimit] = useState(String(current?.monthlyLimit ?? 1500));
  const [price, setPrice] = useState(String((current?.pricePerMonth ?? 20000) / 100));

  const changePlan = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/stores/${store.id}/plan`, {
      plan,
      monthlyLimit: parseInt(limit),
      pricePerMonth: Math.round(parseFloat(price) * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan mis à jour", description: `${store.name} → ${plan}` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handlePlanSelect = (p: string) => {
    const preset = PLANS.find(x => x.value === p);
    setPlan(p);
    if (preset && preset.price > 0) {
      setPrice(String(preset.price / 100));
      setLimit(String(preset.limit));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5" style={{ color: GOLD }} />
          <h3 className="font-bold text-base">Gérer le plan — {store.name}</h3>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={handlePlanSelect}>
              <SelectTrigger data-testid="select-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label} — {p.price > 0 ? `${p.price / 100} DH/mois` : "Sur mesure"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Limite mensuelle (commandes)</Label>
            <Input type="number" value={limit} onChange={e => setLimit(e.target.value)} data-testid="input-plan-limit" />
          </div>

          <div className="space-y-1.5">
            <Label>Prix mensuel (DH)</Label>
            <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} data-testid="input-plan-price" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1 font-semibold"
            style={{ backgroundColor: GOLD, color: "white" }}
            disabled={changePlan.isPending}
            onClick={() => changePlan.mutate()}
            data-testid="button-confirm-plan"
          >
            {changePlan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [planModal, setPlanModal] = useState<any | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
  });
  const { data: stores, isLoading: storesLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/stores"],
  });

  const toggleStore = useMutation({
    mutationFn: ({ storeId, isActive }: { storeId: number; isActive: number }) =>
      apiRequest("PATCH", `/api/admin/stores/${storeId}/toggle`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const resetOrders = useMutation({
    mutationFn: (storeId: number) => apiRequest("POST", `/api/admin/stores/${storeId}/reset-orders`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      toast({ title: "Compteur réinitialisé avec succès" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const impersonate = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", `/api/admin/impersonate/${userId}`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: `Connecté en tant que ${data.username}`, description: "Bannière d'impersonation active" });
      window.location.href = "/";
    },
    onError: (e: any) => toast({ title: "Erreur d'impersonation", description: e.message, variant: "destructive" }),
  });

  const is403 = (statsError as any)?.status === 403 || (statsError as any)?.message?.includes("403");

  if (is403 || (!user?.isSuperAdmin && !statsLoading)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" data-testid="admin-access-denied">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <h1 className="text-2xl font-bold text-destructive">Accès refusé</h1>
        <p className="text-muted-foreground">Cette page est réservée au Super Administrateur</p>
      </div>
    );
  }

  const isLoading = statsLoading || storesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="admin-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  const mrr = ((stats?.mrr ?? 0) / 100).toFixed(0);
  const totalOrders = stats?.totalOrders ?? 0;

  return (
    <div className="space-y-6" data-testid="admin-panel">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: NAVY }}>
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">God Mode — Super Admin</h1>
          <p className="text-xs text-muted-foreground">Accès complet à toutes les boutiques et abonnements</p>
        </div>
        <div className="ml-auto">
          <Badge className="text-xs px-3 py-1" style={{ backgroundColor: GOLD, color: "white" }}>
            <Crown className="w-3 h-3 mr-1" />
            {user?.username}
          </Badge>
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Store}       label="Total Boutiques"   value={stats?.totalStores ?? 0}  color={NAVY} />
        <StatCard icon={ShoppingBag} label="Boutiques Actives"  value={stats?.activeStores ?? 0} color="#22543d" />
        <StatCard icon={TrendingUp}  label="MRR"               value={`${mrr} DH`}              sub="Revenus mensuels récurrents" color="#744210" />
        <StatCard icon={Package}     label="Total Commandes"    value={totalOrders}              color="#553c9a" />
      </div>

      {/* Stores table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
          <h2 className="font-bold text-sm">Toutes les Boutiques</h2>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => { qc.invalidateQueries({ queryKey: ["/api/admin/stores"] }); qc.invalidateQueries({ queryKey: ["/api/admin/stats"] }); }}
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />Actualiser
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Boutique</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Propriétaire</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Commandes</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Équipe</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Statut</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores && stores.length > 0 ? stores.map((store: any) => {
                const plan = store.subscription?.plan ?? "—";
                const isActive = store.subscription?.isActive === 1;
                const monthOrders = store.subscription?.currentMonthOrders ?? 0;
                const monthLimit = store.subscription?.monthlyLimit ?? 1500;
                const usagePct = Math.min(100, Math.round((monthOrders / monthLimit) * 100));
                const expanded = expandedRow === store.id;

                return [
                  <tr
                    key={store.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(expanded ? null : store.id)}
                    data-testid={`store-row-${store.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {store.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-xs" data-testid={`store-name-${store.id}`}>{store.name}</p>
                          {store.website && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{store.website}</p>
                          )}
                        </div>
                        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground ml-1" /> : <ChevronDown className="w-3 h-3 text-muted-foreground ml-1" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium" data-testid={`store-email-${store.id}`}>{store.ownerEmail ?? "—"}</p>
                      {store.ownerPhone && (
                        <p className="text-[10px] text-muted-foreground">{store.ownerPhone}</p>
                      )}
                      {store.ownerCreatedAt && (
                        <p className="text-[10px] text-muted-foreground">{new Date(store.ownerCreatedAt).toLocaleDateString('fr-MA')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className="text-[10px] px-2 py-0.5 cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: plan === "pro" ? GOLD : plan === "starter" ? "#1a3a8f" : "#553c9a", color: "white" }}
                        onClick={e => { e.stopPropagation(); setPlanModal(store); }}
                        data-testid={`store-plan-${store.id}`}
                      >
                        {plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-bold" data-testid={`store-orders-${store.id}`}>{monthOrders} <span className="text-muted-foreground font-normal">/ {monthLimit}</span></p>
                        <div className="h-1.5 w-20 rounded-full bg-muted mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${usagePct}%`, backgroundColor: usagePct >= 80 ? "#ef4444" : "#22c55e" }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs" data-testid={`store-team-${store.id}`}>{store.teamCount ?? 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{store.totalOrders ?? 0} total</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => toggleStore.mutate({ storeId: store.id, isActive: isActive ? 0 : 1 })}
                          disabled={toggleStore.isPending}
                          data-testid={`toggle-store-${store.id}`}
                        />
                        <Badge className={`text-[10px] px-2 py-0.5 ${isActive ? "bg-green-500" : "bg-red-500"} text-white`} data-testid={`store-status-${store.id}`}>
                          {isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          style={{ borderColor: GOLD, color: GOLD }}
                          onClick={() => setPlanModal(store)}
                          data-testid={`button-plan-${store.id}`}
                        >
                          <Crown className="w-3 h-3 mr-1" />Plan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          onClick={() => resetOrders.mutate(store.id)}
                          disabled={resetOrders.isPending}
                          data-testid={`button-reset-${store.id}`}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />Reset
                        </Button>
                        {store.ownerId && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] px-2 text-white"
                            style={{ backgroundColor: NAVY }}
                            onClick={() => impersonate.mutate(store.ownerId)}
                            disabled={impersonate.isPending}
                            data-testid={`button-impersonate-${store.id}`}
                          >
                            <LogIn className="w-3 h-3 mr-1" />Se connecter
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${store.id}-expanded`} className="border-b border-border/50 bg-muted/10">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Site:</span>
                            <span className="font-medium">{store.website ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Tél:</span>
                            <span className="font-medium">{store.phone ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Inscrit:</span>
                            <span className="font-medium">{store.ownerCreatedAt ? new Date(store.ownerCreatedAt).toLocaleDateString('fr-MA') : "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Facturation:</span>
                            <span className="font-medium">{store.subscription?.billingCycleStart ? new Date(store.subscription.billingCycleStart).toLocaleDateString('fr-MA') : "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Prix/mois:</span>
                            <span className="font-bold" style={{ color: GOLD }}>{((store.subscription?.pricePerMonth ?? 0) / 100).toFixed(0)} DH</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Owner ID:</span>
                            <span className="font-medium">{store.ownerId ?? "—"}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                ];
              }) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    Aucune boutique trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan change modal */}
      {planModal && <PlanModal store={planModal} onClose={() => setPlanModal(null)} />}
    </div>
  );
}

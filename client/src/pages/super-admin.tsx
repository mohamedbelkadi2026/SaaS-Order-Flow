import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Shield, Store, Users, ShoppingCart, TrendingUp, Crown,
  Power, RotateCcw, LogIn, LogOut, ChevronDown, X, Check,
  BarChart3, DollarSign, Activity, Eye, Package, Calendar,
  AlertCircle, Zap, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────── */
type StoreRow = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  ownerId: number | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerCreatedAt: string | null;
  teamCount: number;
  totalOrders: number;
  canOpen: number;
  createdAt: string | null;
  subscription: {
    id: number;
    plan: string;
    monthlyLimit: number;
    pricePerMonth: number;
    currentMonthOrders: number;
    isActive: number;
    billingCycleStart: string | null;
  } | null;
};

type GlobalStats = {
  totalStores: number;
  activeStores: number;
  mrr: number;
  totalOrders: number;
};

const PLAN_OPTIONS = [
  { id: "starter", label: "Starter", price: 20000, limit: 1500 },
  { id: "pro",     label: "Pro",     price: 40000, limit: 5000 },
  { id: "custom",  label: "Custom",  price: 0,     limit: 99999 },
];

const GOLD = "#C5A059";
const NAVY = "#0f1e38";
const NAVY2 = "#162847";
const NAVY3 = "#1d3357";

/* ─── Stat card ─────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4 shadow-lg border"
      style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.2)" }}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(197,160,89,0.15)" }}>
        <Icon className="w-6 h-6" style={{ color: GOLD }} />
      </div>
      <div>
        <p className="text-xs font-medium opacity-60 text-white">{label}</p>
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-50 text-white mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Plan badge ────────────────────────────────────────────────── */
function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: "bg-blue-900/40 text-blue-300 border-blue-700",
    pro:     "bg-purple-900/40 text-purple-300 border-purple-700",
    custom:  "bg-amber-900/40 text-amber-300 border-amber-600",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide", colors[plan] ?? "bg-white/10 text-white border-white/20")}>
      {plan}
    </span>
  );
}

/* ─── Change Plan Modal ─────────────────────────────────────────── */
function ChangePlanModal({
  store,
  onClose,
  onSave,
}: {
  store: StoreRow;
  onClose: () => void;
  onSave: (plan: string, limit: number, price: number) => void;
}) {
  const cur = PLAN_OPTIONS.find(p => p.id === store.subscription?.plan) ?? PLAN_OPTIONS[0];
  const [selected, setSelected] = useState(cur.id);
  const [customPrice, setCustomPrice] = useState(store.subscription?.pricePerMonth ?? 0);
  const [customLimit, setCustomLimit] = useState(store.subscription?.monthlyLimit ?? 1500);

  const opt = PLAN_OPTIONS.find(p => p.id === selected)!;
  const finalPrice = selected === "custom" ? customPrice : opt.price;
  const finalLimit = selected === "custom" ? customLimit : opt.limit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl border p-6"
        style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.3)" }}
        onClick={e => e.stopPropagation()}
        data-testid="modal-change-plan"
      >
        <button className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors" onClick={onClose} data-testid="button-close-plan-modal">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(197,160,89,0.15)" }}>
            <Crown className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Changer le plan</h3>
            <p className="text-white/50 text-xs">{store.name}</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {PLAN_OPTIONS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={cn(
                "w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left",
                selected === plan.id
                  ? "border-[#C5A059] bg-[#C5A059]/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
              data-testid={`option-plan-${plan.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", selected === plan.id ? "border-[#C5A059] bg-[#C5A059]" : "border-white/30")}>
                  {selected === plan.id && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{plan.label}</p>
                  <p className="text-white/50 text-xs">{plan.limit >= 99999 ? "Illimité" : `${plan.limit.toLocaleString()} commandes/mois`}</p>
                </div>
              </div>
              <span className="text-white/70 text-sm font-mono">
                {plan.id === "custom" ? "Sur mesure" : `${(plan.price / 100).toFixed(0)} DH`}
              </span>
            </button>
          ))}
        </div>

        {selected === "custom" && (
          <div className="flex gap-3 mb-6">
            <div className="flex-1">
              <label className="text-xs text-white/50 mb-1 block">Prix / mois (centimes)</label>
              <input
                type="number"
                value={customPrice}
                onChange={e => setCustomPrice(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-custom-price"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/50 mb-1 block">Limite commandes</label>
              <input
                type="number"
                value={customLimit}
                onChange={e => setCustomLimit(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-custom-limit"
              />
            </div>
          </div>
        )}

        <button
          onClick={() => onSave(selected, finalLimit, finalPrice)}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #C5A059, #a07840)" }}
          data-testid="button-confirm-plan"
        >
          Confirmer le changement
        </button>
      </div>
    </div>
  );
}

/* ─── Main Super Admin Page ─────────────────────────────────────── */
export default function SuperAdminPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [planModalStore, setPlanModalStore] = useState<StoreRow | null>(null);
  const [impersonateConfirm, setImpersonateConfirm] = useState<StoreRow | null>(null);
  const [search, setSearch] = useState("");

  /* ── Guard ──────────────────────────────────────────────────────── */
  if (!user?.isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: NAVY }}>
        <AlertCircle className="w-16 h-16 text-red-400" />
        <h1 className="text-white text-2xl font-bold">Accès refusé</h1>
        <p className="text-white/50 text-sm">Cette section est réservée au Super Admin.</p>
        <button onClick={() => navigate("/")} className="mt-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: GOLD }}>
          Retour à l'accueil
        </button>
      </div>
    );
  }

  /* ── Queries ────────────────────────────────────────────────────── */
  const { data: stores = [], isLoading: storesLoading } = useQuery<StoreRow[]>({
    queryKey: ["/api/admin/stores"],
  });

  const { data: stats } = useQuery<GlobalStats>({
    queryKey: ["/api/admin/stats"],
  });

  /* ── Mutations ──────────────────────────────────────────────────── */
  const toggleMutation = useMutation({
    mutationFn: ({ storeId, isActive }: { storeId: number; isActive: number }) =>
      apiRequest("PATCH", `/api/admin/stores/${storeId}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const planMutation = useMutation({
    mutationFn: ({ storeId, plan, monthlyLimit, pricePerMonth }: { storeId: number; plan: string; monthlyLimit: number; pricePerMonth: number }) =>
      apiRequest("PATCH", `/api/admin/stores/${storeId}/plan`, { plan, monthlyLimit, pricePerMonth }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan mis à jour" });
      setPlanModalStore(null);
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: (storeId: number) => apiRequest("POST", `/api/admin/stores/${storeId}/reset-orders`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      toast({ title: "Compteur réinitialisé" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", `/api/admin/impersonate/${userId}`, {}),
    onSuccess: (res: any) => {
      res.json().then((data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        toast({ title: `Connecté en tant que ${data.username}` });
        setTimeout(() => { window.location.href = "/"; }, 500);
      });
    },
    onError: () => toast({ title: "Erreur d'impersonation", variant: "destructive" }),
  });

  /* ── Filtered stores ────────────────────────────────────────────── */
  const filtered = stores.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.ownerEmail?.toLowerCase().includes(q) ?? false) ||
      (s.website?.toLowerCase().includes(q) ?? false)
    );
  });

  const mrrFormatted = stats ? `${(stats.mrr / 100).toLocaleString("fr-MA")} DH` : "—";

  return (
    <div className="min-h-screen font-sans" style={{ background: NAVY }}>
      {/* ── Top Header ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b flex items-center justify-between px-4 sm:px-6 py-3.5"
        style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.2)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(197,160,89,0.15)" }}>
            <Shield className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">
              <span style={{ color: GOLD }}>God Mode</span> — TajerGrow
            </h1>
            <p className="text-white/40 text-xs">Super Admin Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ background: "rgba(197,160,89,0.08)", borderColor: "rgba(197,160,89,0.25)" }}>
            <Crown className="w-3.5 h-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold text-white">{user.username}</span>
          </div>
          <button
            onClick={() => logout().then(() => navigate("/"))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/60 hover:text-white text-xs font-medium border border-white/10 hover:border-white/20 transition-all"
            data-testid="button-super-admin-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Platform Stats ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4" style={{ color: GOLD }} />
            <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider">Vue Plateforme</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Store}       label="Boutiques totales"  value={stats ? String(stats.totalStores) : "—"} />
            <StatCard icon={Activity}    label="Boutiques actives"  value={stats ? String(stats.activeStores) : "—"} />
            <StatCard icon={DollarSign}  label="MRR mensuel"        value={mrrFormatted} sub="Revenu récurrent" />
            <StatCard icon={ShoppingCart} label="Commandes totales" value={stats ? stats.totalOrders.toLocaleString() : "—"} />
          </div>
        </section>

        {/* ── Stores Master Table ──────────────────────────────────── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: GOLD }} />
              <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider">Gestion des Boutiques</h2>
              <span className="text-xs px-2 py-0.5 rounded-full text-white/60 border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
                {filtered.length}
              </span>
            </div>
            <input
              type="text"
              placeholder="Rechercher boutique, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#C5A059] transition-colors"
              data-testid="input-search-stores"
            />
          </div>

          {storesLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border" style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.1)" }}>
              <Package className="w-10 h-10 text-white/20 mb-3" />
              <p className="text-white/40 text-sm">Aucune boutique trouvée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(store => {
                const isActive = (store.subscription?.isActive ?? 1) === 1;
                const sub = store.subscription;
                const usagePercent = sub ? Math.min(100, Math.round((sub.currentMonthOrders / sub.monthlyLimit) * 100)) : 0;

                return (
                  <div
                    key={store.id}
                    className="rounded-2xl border p-4 sm:p-5 transition-all hover:border-[#C5A059]/30"
                    style={{ background: NAVY2, borderColor: isActive ? "rgba(197,160,89,0.15)" : "rgba(239,68,68,0.2)" }}
                    data-testid={`store-row-${store.id}`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">

                      {/* ── Store identity ────────────────────────── */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm"
                          style={{ background: "linear-gradient(135deg, #C5A059, #a07840)" }}
                        >
                          {store.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className="text-white font-bold text-sm truncate" data-testid={`text-store-name-${store.id}`}>
                              {store.name}
                            </span>
                            <PlanBadge plan={sub?.plan ?? "starter"} />
                            <span
                              className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase", isActive ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-red-900/40 text-red-400 border border-red-700")}
                              data-testid={`status-store-${store.id}`}
                            >
                              {isActive ? "Actif" : "Suspendu"}
                            </span>
                          </div>
                          {store.ownerEmail && (
                            <p className="text-white/50 text-xs truncate" data-testid={`text-owner-email-${store.id}`}>{store.ownerEmail}</p>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1">
                            {store.ownerPhone && (
                              <span className="text-white/40 text-xs">{store.ownerPhone}</span>
                            )}
                            {store.website && (
                              <a href={store.website} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/70 text-xs truncate max-w-[140px] transition-colors">{store.website}</a>
                            )}
                            {store.ownerCreatedAt && (
                              <span className="text-white/30 text-xs flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(store.ownerCreatedAt).toLocaleDateString("fr-MA")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Stats ─────────────────────────────────── */}
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-center">
                          <p className="text-white/40 text-[10px] uppercase tracking-wide">Commandes</p>
                          <p className="text-white font-bold text-base" data-testid={`text-orders-${store.id}`}>{store.totalOrders.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-white/40 text-[10px] uppercase tracking-wide">Équipe</p>
                          <p className="text-white font-bold text-base" data-testid={`text-team-${store.id}`}>{store.teamCount}</p>
                        </div>
                        {sub && (
                          <div className="hidden sm:block w-28">
                            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">
                              Usage {sub.currentMonthOrders}/{sub.monthlyLimit >= 99999 ? "∞" : sub.monthlyLimit}
                            </p>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${usagePercent}%`,
                                  background: usagePercent > 80 ? "#ef4444" : GOLD,
                                }}
                              />
                            </div>
                            <p className="text-white/30 text-[10px] mt-0.5 text-right">{usagePercent}%</p>
                          </div>
                        )}
                      </div>

                      {/* ── Actions ───────────────────────────────── */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => toggleMutation.mutate({ storeId: store.id, isActive: isActive ? 0 : 1 })}
                          disabled={toggleMutation.isPending}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50",
                            isActive
                              ? "bg-red-900/30 text-red-400 border-red-700/50 hover:bg-red-900/50"
                              : "bg-green-900/30 text-green-400 border-green-700/50 hover:bg-green-900/50"
                          )}
                          data-testid={`button-toggle-store-${store.id}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {isActive ? "Désactiver" : "Activer"}
                        </button>

                        {/* Change plan */}
                        <button
                          onClick={() => setPlanModalStore(store)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
                          style={{ background: "rgba(197,160,89,0.1)", color: GOLD, borderColor: "rgba(197,160,89,0.3)" }}
                          data-testid={`button-change-plan-${store.id}`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                          Plan
                        </button>

                        {/* Reset counter */}
                        <button
                          onClick={() => {
                            if (confirm(`Réinitialiser le compteur de commandes pour "${store.name}" ?`)) {
                              resetMutation.mutate(store.id);
                            }
                          }}
                          disabled={resetMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-50"
                          data-testid={`button-reset-orders-${store.id}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>

                        {/* Impersonate */}
                        {store.ownerId && (
                          <button
                            onClick={() => setImpersonateConfirm(store)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all"
                            data-testid={`button-impersonate-${store.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Se connecter en tant que
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── MRR row ─────────────────────────────────── */}
                    {sub && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-4 text-xs text-white/40">
                        <span>💰 {(sub.pricePerMonth / 100).toFixed(0)} DH/mois</span>
                        {sub.billingCycleStart && (
                          <span>📅 Cycle depuis {new Date(sub.billingCycleStart).toLocaleDateString("fr-MA")}</span>
                        )}
                        <span>📦 {sub.currentMonthOrders} commandes ce mois</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Change Plan Modal ────────────────────────────────────────── */}
      {planModalStore && (
        <ChangePlanModal
          store={planModalStore}
          onClose={() => setPlanModalStore(null)}
          onSave={(plan, limit, price) =>
            planMutation.mutate({ storeId: planModalStore.id, plan, monthlyLimit: limit, pricePerMonth: price })
          }
        />
      )}

      {/* ── Impersonate Confirm Modal ────────────────────────────────── */}
      {impersonateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setImpersonateConfirm(null)}>
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl shadow-2xl border p-6"
            style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.3)" }}
            onClick={e => e.stopPropagation()}
            data-testid="modal-impersonate-confirm"
          >
            <button className="absolute top-4 right-4 text-white/40 hover:text-white" onClick={() => setImpersonateConfirm(null)}>
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(197,160,89,0.15)" }}>
                <LogIn className="w-5 h-5" style={{ color: GOLD }} />
              </div>
              <div>
                <h3 className="text-white font-bold">Connexion en tant que</h3>
                <p className="text-white/50 text-xs">{impersonateConfirm.ownerEmail}</p>
              </div>
            </div>
            <p className="text-white/60 text-sm mb-6">
              Vous allez entrer dans le tableau de bord de <strong className="text-white">{impersonateConfirm.name}</strong> en mode support. Une bannière d'avertissement sera affichée.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setImpersonateConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-white/60 border border-white/10 text-sm font-semibold hover:border-white/20 transition-all"
                data-testid="button-cancel-impersonate"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (impersonateConfirm.ownerId) {
                    impersonateMutation.mutate(impersonateConfirm.ownerId);
                    setImpersonateConfirm(null);
                  }
                }}
                disabled={impersonateMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #C5A059, #a07840)" }}
                data-testid="button-confirm-impersonate"
              >
                {impersonateMutation.isPending ? "Connexion..." : "Se connecter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

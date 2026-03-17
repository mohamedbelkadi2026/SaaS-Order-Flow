import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import {
  Shield, Store, Users, ShoppingCart, TrendingUp, Crown,
  Power, RotateCcw, LogIn, LogOut, X, Check,
  BarChart3, DollarSign, Activity, Eye, Package, Calendar,
  AlertCircle, Bell, MessageCircle, Phone, ChevronDown, ChevronUp,
  CreditCard, FileText, ExternalLink, Clock, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────── */
type SubscriptionInfo = {
  id: number;
  plan: string;
  monthlyLimit: number;
  pricePerMonth: number;
  currentMonthOrders: number;
  isActive: number;
  isBlocked: number;
  billingCycleStart: string | null;
  planStartDate: string | null;
  planExpiryDate: string | null;
};

type StoreRow = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  ownerId: number | null;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerCreatedAt: string | null;
  teamCount: number;
  totalOrders: number;
  monthlyOrders: number;
  totalNetProfit: number;
  canOpen: number;
  createdAt: string | null;
  subscription: SubscriptionInfo | null;
};

type GlobalStats = {
  totalStores: number;
  activeStores: number;
  mrr: number;
  totalOrders: number;
  expiringCount: number;
};

type ExpiryNotification = {
  storeId: number;
  storeName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  plan: string;
  planExpiryDate: string;
  daysLeft: number;
};

const PLAN_OPTIONS = [
  { id: "trial",   label: "Trial",   price: 0,     limit: 60 },
  { id: "starter", label: "Starter", price: 20000, limit: 1500 },
  { id: "pro",     label: "Pro",     price: 40000, limit: 5000 },
  { id: "custom",  label: "Custom",  price: 0,     limit: 99999 },
];

const GOLD = "#C5A059";
const NAVY = "#0f1e38";
const NAVY2 = "#162847";

/* ─── Helpers ───────────────────────────────────────────────────── */
function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const exp = new Date(dateStr);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryTag({ planExpiryDate }: { planExpiryDate: string | null | undefined }) {
  if (!planExpiryDate) return null;
  const days = daysUntilExpiry(planExpiryDate);
  const expired = days !== null && days < 0;
  const expiringSoon = days !== null && days >= 0 && days <= 5;

  if (expired) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-red-900/50 text-red-300 border border-red-600">
        Expiré
      </span>
    );
  }
  if (expiringSoon) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-orange-900/40 text-orange-300 border border-orange-600">
        {days}j restants
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-900/30 text-green-400 border border-green-700">
      {days}j
    </span>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, alert }: { icon: any; label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4 shadow-lg border"
      style={{ background: NAVY2, borderColor: alert ? "rgba(249,115,22,0.4)" : "rgba(197,160,89,0.2)" }}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: alert ? "rgba(249,115,22,0.15)" : "rgba(197,160,89,0.15)" }}>
        <Icon className="w-6 h-6" style={{ color: alert ? "#f97316" : GOLD }} />
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
    trial:   "bg-slate-900/40 text-slate-300 border-slate-600",
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
  onSave: (plan: string, limit: number, price: number, startDate: string | null, expiryDate: string | null) => void;
}) {
  const cur = PLAN_OPTIONS.find(p => p.id === store.subscription?.plan) ?? PLAN_OPTIONS[1];
  const [selected, setSelected] = useState(cur.id);
  const [customPrice, setCustomPrice] = useState(store.subscription?.pricePerMonth ?? 0);
  const [customLimit, setCustomLimit] = useState(store.subscription?.monthlyLimit ?? 1500);

  const todayStr = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [planStartDate, setPlanStartDate] = useState<string>(
    store.subscription?.planStartDate ? new Date(store.subscription.planStartDate).toISOString().slice(0, 10) : todayStr
  );
  const [planExpiryDate, setPlanExpiryDate] = useState<string>(
    store.subscription?.planExpiryDate ? new Date(store.subscription.planExpiryDate).toISOString().slice(0, 10) : in30Days
  );

  const opt = PLAN_OPTIONS.find(p => p.id === selected)!;
  const finalPrice = selected === "custom" ? customPrice : opt.price;
  const finalLimit = selected === "custom" ? customLimit : opt.limit;

  function applyPreset(days: number) {
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    setPlanStartDate(start.toISOString().slice(0, 10));
    setPlanExpiryDate(end.toISOString().slice(0, 10));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl border p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.3)" }}
        onClick={e => e.stopPropagation()}
        data-testid="modal-change-plan"
      >
        <button className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors" onClick={onClose} data-testid="button-close-plan-modal">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(197,160,89,0.15)" }}>
            <Crown className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Changer le plan</h3>
            <p className="text-white/50 text-xs">{store.name}</p>
          </div>
        </div>

        {/* Plan selector */}
        <div className="space-y-2 mb-5">
          {PLAN_OPTIONS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                selected === plan.id ? "border-[#C5A059] bg-[#C5A059]/10" : "border-white/10 bg-white/5 hover:border-white/20"
              )}
              data-testid={`option-plan-${plan.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", selected === plan.id ? "border-[#C5A059] bg-[#C5A059]" : "border-white/30")}>
                  {selected === plan.id && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{plan.label}</p>
                  <p className="text-white/50 text-xs">{plan.limit >= 99999 ? "Illimité" : `${plan.limit.toLocaleString()} cmds/mois`}</p>
                </div>
              </div>
              <span className="text-white/70 text-sm font-mono">
                {plan.id === "custom" ? "Sur mesure" : plan.price === 0 ? "Gratuit" : `${(plan.price / 100).toFixed(0)} DH`}
              </span>
            </button>
          ))}
        </div>

        {/* Custom fields */}
        {selected === "custom" && (
          <div className="flex gap-3 mb-5">
            <div className="flex-1">
              <label className="text-xs text-white/50 mb-1 block">Prix/mois (centimes)</label>
              <input type="number" value={customPrice} onChange={e => setCustomPrice(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-custom-price" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/50 mb-1 block">Limite commandes</label>
              <input type="number" value={customLimit} onChange={e => setCustomLimit(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-custom-limit" />
            </div>
          </div>
        )}

        {/* Dates section */}
        <div className="border border-white/10 rounded-xl p-4 mb-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" style={{ color: GOLD }} />
            Cycle d'abonnement
          </p>
          <div className="flex gap-2 flex-wrap">
            {[7, 30, 90, 365].map(d => (
              <button key={d} onClick={() => applyPreset(d)}
                className="text-xs px-2.5 py-1 rounded-lg border border-white/15 text-white/60 hover:border-[#C5A059]/50 hover:text-white transition-all"
                data-testid={`preset-${d}-days`}>
                {d}j
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Date début</label>
              <input type="date" value={planStartDate} onChange={e => setPlanStartDate(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-plan-start-date" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Date expiration</label>
              <input type="date" value={planExpiryDate} onChange={e => setPlanExpiryDate(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C5A059]"
                data-testid="input-plan-expiry-date" />
            </div>
          </div>
        </div>

        <button
          onClick={() => onSave(selected, finalLimit, finalPrice, planStartDate || null, planExpiryDate || null)}
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

/* ─── Notification Panel ─────────────────────────────────────────── */
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { data: notifications = [], isLoading } = useQuery<ExpiryNotification[]>({
    queryKey: ["/api/admin/notifications"],
  });

  return (
    <div className="absolute top-full right-0 mt-2 w-80 rounded-2xl border shadow-2xl z-50" style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.25)" }}>
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-white font-semibold text-sm">Plans expirant bientôt</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-white/50 text-sm">Aucun plan expirant prochainement</p>
          </div>
        ) : (
          notifications.map(n => (
            <div key={n.storeId} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{n.storeName}</p>
                  {n.ownerEmail && <p className="text-white/50 text-xs truncate">{n.ownerEmail}</p>}
                  {n.ownerPhone && (
                    <a
                      href={`https://wa.me/${n.ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Bonjour ${n.ownerName || n.storeName}, c'est l'administration de TajerGrow. Votre abonnement arrive à échéance le ${new Date(n.planExpiryDate).toLocaleDateString('fr-MA')}. Merci de procéder au paiement pour garder votre accès actif.`
                      )}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-green-400 text-xs flex items-center gap-1 hover:text-green-300 transition-colors mt-0.5">
                      <MessageCircle className="w-3 h-3" />
                      {n.ownerPhone}
                    </a>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", n.daysLeft <= 0 ? "bg-red-900/50 text-red-300" : "bg-orange-900/40 text-orange-300")}>
                    {n.daysLeft <= 0 ? "Expiré" : `${n.daysLeft}j`}
                  </span>
                  <p className="text-white/30 text-[10px] mt-1">{new Date(n.planExpiryDate).toLocaleDateString("fr-MA")}</p>
                </div>
              </div>
            </div>
          ))
        )}
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedStoreId, setExpandedStoreId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"stores" | "payments">("stores");
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});

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
    mutationFn: ({ storeId, plan, monthlyLimit, pricePerMonth, planStartDate, planExpiryDate }: {
      storeId: number; plan: string; monthlyLimit: number; pricePerMonth: number;
      planStartDate: string | null; planExpiryDate: string | null;
    }) => apiRequest("PATCH", `/api/admin/stores/${storeId}/plan`, { plan, monthlyLimit, pricePerMonth, planStartDate, planExpiryDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "Plan mis à jour avec succès" });
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
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: `✓ Connecté en tant que ${data.username}`, description: "Redirection vers le tableau de bord..." });
      setTimeout(() => { window.location.href = "/"; }, 600);
    },
    onError: () => toast({ title: "Erreur d'impersonation", description: "Impossible de se connecter en tant que cet utilisateur", variant: "destructive" }),
  });

  /* ── Payments ───────────────────────────────────────────────────── */
  const { data: allPayments = [], isLoading: paymentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/payments"],
  });

  const pendingCount = allPayments.filter((p: any) => p.status === "pending").length;

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/payments/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      toast({ title: "✓ Paiement approuvé", description: "L'abonnement a été activé automatiquement." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'approuver.", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiRequest("PATCH", `/api/admin/payments/${id}/reject`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      toast({ title: "Paiement refusé" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de refuser.", variant: "destructive" }),
  });

  /* ── Filtering ──────────────────────────────────────────────────── */
  const filtered = stores.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.ownerEmail?.toLowerCase().includes(q) ?? false) ||
      (s.ownerName?.toLowerCase().includes(q) ?? false) ||
      (s.website?.toLowerCase().includes(q) ?? false) ||
      (s.ownerPhone?.includes(q) ?? false)
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
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(v => !v)}
              className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 hover:border-[#C5A059]/40 transition-all"
              style={{ background: "rgba(255,255,255,0.05)" }}
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4 text-white/70" />
              {stats && stats.expiringCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {stats.expiringCount}
                </span>
              )}
            </button>
            {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
          </div>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard icon={Store}        label="Boutiques totales"  value={stats ? String(stats.totalStores) : "—"} />
            <StatCard icon={Activity}     label="Boutiques actives"  value={stats ? String(stats.activeStores) : "—"} />
            <StatCard icon={DollarSign}   label="MRR mensuel"        value={mrrFormatted} sub="Revenu récurrent" />
            <StatCard icon={ShoppingCart} label="Commandes totales"  value={stats ? stats.totalOrders.toLocaleString() : "—"} />
            <StatCard icon={Bell}         label="Plans expirant"     value={stats ? String(stats.expiringCount) : "—"} sub="≤ 5 jours" alert={!!stats && stats.expiringCount > 0} />
          </div>
        </section>

        {/* ── Tab Nav ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b pb-4" style={{ borderColor: "rgba(197,160,89,0.15)" }}>
          {[
            { id: "stores" as const,   label: "Boutiques",          icon: Store,      count: filtered.length },
            { id: "payments" as const, label: "Paiements à valider", icon: CreditCard, count: pendingCount, alert: pendingCount > 0 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === tab.id
                  ? "text-white shadow-md"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
              style={activeTab === tab.id ? { background: "rgba(197,160,89,0.2)", border: "1px solid rgba(197,160,89,0.4)" } : { border: "1px solid transparent" }}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" style={{ color: activeTab === tab.id ? GOLD : undefined }} />
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center")}
                  style={{ background: tab.alert ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.15)", color: "#fff" }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Stores Master Table ──────────────────────────────────── */}
        {activeTab === "stores" && <section>
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
              placeholder="Nom admin, email, boutique, téléphone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-72 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#C5A059] transition-colors"
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
                const effectiveLimit = sub ? (sub.monthlyLimit <= 0 || sub.monthlyLimit >= 99999 ? Math.max(store.monthlyOrders, 1) : sub.monthlyLimit) : 1;
                const usagePercent = sub ? Math.min(100, Math.round((store.monthlyOrders / effectiveLimit) * 100)) : 0;
                const days = daysUntilExpiry(sub?.planExpiryDate);
                const isExpired = days !== null && days < 0;
                const isExpiringSoon = days !== null && days >= 0 && days <= 5;
                const isExpanded = expandedStoreId === store.id;

                return (
                  <div
                    key={store.id}
                    className="rounded-2xl border transition-all hover:border-[#C5A059]/30"
                    style={{
                      background: NAVY2,
                      borderColor: isExpired ? "rgba(239,68,68,0.35)" : isExpiringSoon ? "rgba(249,115,22,0.35)" : isActive ? "rgba(197,160,89,0.15)" : "rgba(239,68,68,0.2)"
                    }}
                    data-testid={`store-row-${store.id}`}
                  >
                    <div className="p-4 sm:p-5">
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
                              <PlanBadge plan={sub?.plan ?? "trial"} />
                              <span
                                className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase", isActive ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-red-900/40 text-red-400 border border-red-700")}
                                data-testid={`status-store-${store.id}`}
                              >
                                {isActive ? "Actif" : "Suspendu"}
                              </span>
                              {sub?.planExpiryDate && <ExpiryTag planExpiryDate={sub.planExpiryDate} />}
                            </div>
                            {store.ownerName && (
                              <p className="text-white/70 text-xs font-medium truncate" data-testid={`text-owner-name-${store.id}`}>{store.ownerName}</p>
                            )}
                            {store.ownerEmail && (
                              <p className="text-white/40 text-xs truncate" data-testid={`text-owner-email-${store.id}`}>{store.ownerEmail}</p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-1">
                              {store.ownerPhone && (
                                <a
                                  href={`https://wa.me/${store.ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                    `Bonjour ${store.ownerName || store.name}, c'est l'administration de TajerGrow. Votre abonnement arrive à échéance le ${store.subscription?.planExpiryDate ? new Date(store.subscription.planExpiryDate).toLocaleDateString('fr-MA') : 'bientôt'}. Merci de procéder au paiement pour garder votre accès actif.`
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-400/70 hover:text-green-400 text-xs flex items-center gap-1 transition-colors"
                                  title="Envoyer un message WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  {store.ownerPhone}
                                </a>
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

                        {/* ── Performance metrics ───────────────────── */}
                        <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                          <div className="text-center">
                            <p className="text-white/40 text-[10px] uppercase tracking-wide">Ce mois</p>
                            <p className="text-white font-bold text-base" data-testid={`text-month-orders-${store.id}`}>
                              {store.monthlyOrders.toLocaleString()}
                              {sub && <span className="text-white/30 text-xs font-normal"> /{sub.monthlyLimit >= 99999 ? "∞" : sub.monthlyLimit}</span>}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-[10px] uppercase tracking-wide">Total Cmds</p>
                            <p className="text-white/70 font-semibold text-sm" data-testid={`text-orders-${store.id}`}>{store.totalOrders.toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-[10px] uppercase tracking-wide">Profit Net</p>
                            <p
                              className={cn("font-bold text-base", (store.totalNetProfit ?? 0) < 0 && "text-red-400")}
                              style={(store.totalNetProfit ?? 0) >= 0 ? { color: GOLD } : undefined}
                              data-testid={`text-profit-${store.id}`}
                            >
                              {formatCurrency(store.totalNetProfit ?? 0)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-[10px] uppercase tracking-wide">Équipe</p>
                            <p className="text-white font-bold text-base" data-testid={`text-team-${store.id}`}>{store.teamCount}</p>
                          </div>
                          {sub && (
                            <div className="hidden sm:block w-24">
                              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">
                                {sub.currentMonthOrders}/{sub.monthlyLimit >= 99999 ? "∞" : sub.monthlyLimit}
                              </p>
                              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${usagePercent}%`, background: usagePercent > 80 ? "#ef4444" : GOLD }} />
                              </div>
                              <p className="text-white/30 text-[10px] mt-0.5 text-right">{usagePercent}%</p>
                            </div>
                          )}
                        </div>

                        {/* ── Actions ───────────────────────────────── */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            onClick={() => toggleMutation.mutate({ storeId: store.id, isActive: isActive ? 0 : 1 })}
                            disabled={toggleMutation.isPending}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50",
                              isActive ? "bg-red-900/30 text-red-400 border-red-700/50 hover:bg-red-900/50" : "bg-green-900/30 text-green-400 border-green-700/50 hover:bg-green-900/50"
                            )}
                            data-testid={`button-toggle-${store.id}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {isActive ? "Suspendre" : "Activer"}
                          </button>

                          <button
                            onClick={() => setPlanModalStore(store)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                            style={{ background: "rgba(197,160,89,0.1)", borderColor: "rgba(197,160,89,0.3)", color: GOLD }}
                            data-testid={`button-change-plan-${store.id}`}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            Plan
                          </button>

                          <button
                            onClick={() => resetMutation.mutate(store.id)}
                            disabled={resetMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-50"
                            data-testid={`button-reset-orders-${store.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset
                          </button>

                          {store.ownerId && (
                            <button
                              onClick={() => setImpersonateConfirm(store)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-[#C5A059]/40 hover:bg-[#C5A059]/10 transition-all"
                              data-testid={`button-impersonate-${store.id}`}
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              Entrer
                            </button>
                          )}

                          <button
                            onClick={() => setExpandedStoreId(isExpanded ? null : store.id)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-all"
                            data-testid={`button-expand-${store.id}`}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* ── Expanded details ──────────────────────── */}
                      {isExpanded && sub && (
                        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Prix mensuel</p>
                            <p className="text-white font-semibold text-sm">{(sub.pricePerMonth / 100).toFixed(0)} DH</p>
                          </div>
                          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Début abonnement</p>
                            <p className="text-white font-semibold text-sm">
                              {sub.planStartDate ? new Date(sub.planStartDate).toLocaleDateString("fr-MA") : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", borderLeft: `2px solid ${isExpired ? "#ef4444" : isExpiringSoon ? "#f97316" : "#22c55e"}` }}>
                            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Expiration</p>
                            <p className={cn("font-semibold text-sm", isExpired ? "text-red-400" : isExpiringSoon ? "text-orange-400" : "text-green-400")}>
                              {sub.planExpiryDate ? new Date(sub.planExpiryDate).toLocaleDateString("fr-MA") : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Cmds ce mois</p>
                            <p className="text-white font-semibold text-sm">{sub.currentMonthOrders.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>}

        {/* ── Payments Tab ─────────────────────────────────────────── */}
        {activeTab === "payments" && <section>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4" style={{ color: GOLD }} />
            <h2 className="text-white/80 text-sm font-semibold uppercase tracking-wider">Paiements à valider</h2>
            {pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "rgba(239,68,68,0.7)" }}>
                {pendingCount} en attente
              </span>
            )}
          </div>

          {paymentsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border" style={{ background: NAVY2, borderColor: "rgba(197,160,89,0.1)" }}>
              <CreditCard className="w-10 h-10 text-white/20 mb-3" />
              <p className="text-white/40 text-sm">Aucun paiement enregistré</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allPayments.map((payment: any) => {
                const statusColors: Record<string, string> = {
                  pending: "bg-amber-900/40 text-amber-300 border-amber-600",
                  approved: "bg-green-900/40 text-green-400 border-green-700",
                  rejected: "bg-red-900/40 text-red-400 border-red-700",
                };
                const statusLabels: Record<string, string> = {
                  pending: "En attente",
                  approved: "Approuvé",
                  rejected: "Refusé",
                };
                const methodLabels: Record<string, string> = {
                  bank: "Virement Bancaire",
                  paypal: "PayPal",
                  polar: "Polar.sh",
                };
                const isPending = payment.status === "pending";
                return (
                  <div
                    key={payment.id}
                    className="rounded-2xl border p-5"
                    style={{ background: NAVY2, borderColor: isPending ? "rgba(197,160,89,0.3)" : "rgba(255,255,255,0.08)" }}
                    data-testid={`payment-row-${payment.id}`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-white font-bold text-sm">{payment.ownerName ?? "—"}</span>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase", statusColors[payment.status] ?? "bg-white/10 text-white border-white/20")}>
                            {statusLabels[payment.status] ?? payment.status}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/15 uppercase font-semibold">
                            {payment.plan}
                          </span>
                        </div>
                        {payment.ownerEmail && (
                          <p className="text-white/40 text-xs mb-1">{payment.ownerEmail}</p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-2">
                          <div>
                            <p className="text-white/40 text-[10px] uppercase mb-0.5">Méthode</p>
                            <p className="text-white/80 text-xs font-medium">{methodLabels[payment.method] ?? payment.method}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-[10px] uppercase mb-0.5">Montant DH</p>
                            <p className="font-bold text-sm" style={{ color: GOLD }}>{(payment.amountDh / 100).toFixed(0)} DH</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-[10px] uppercase mb-0.5">Montant USD</p>
                            <p className="text-white/70 text-xs font-medium">${(payment.amountUsd / 100).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-[10px] uppercase mb-0.5">Date</p>
                            <p className="text-white/60 text-xs">{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString("fr-MA") : "—"}</p>
                          </div>
                          {payment.receiptUrl && (
                            <div>
                              <p className="text-white/40 text-[10px] uppercase mb-0.5">Reçu</p>
                              <a
                                href={payment.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#C5A059] text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
                                data-testid={`link-receipt-${payment.id}`}
                              >
                                <FileText className="w-3 h-3" />
                                Voir le reçu
                              </a>
                            </div>
                          )}
                        </div>
                        {payment.notes && (
                          <p className="text-white/40 text-xs mt-2 italic">Note: {payment.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {isPending && (
                        <div className="flex flex-col gap-2 shrink-0 min-w-[160px]">
                          <button
                            onClick={() => approveMutation.mutate(payment.id)}
                            disabled={approveMutation.isPending}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                            data-testid={`button-approve-${payment.id}`}
                          >
                            {approveMutation.isPending ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : <Check className="w-4 h-4" />}
                            Approuver
                          </button>
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              placeholder="Motif de refus (optionnel)"
                              value={rejectNotes[payment.id] ?? ""}
                              onChange={(e) => setRejectNotes(prev => ({ ...prev, [payment.id]: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/30"
                              data-testid={`input-reject-notes-${payment.id}`}
                            />
                            <button
                              onClick={() => rejectMutation.mutate({ id: payment.id, notes: rejectNotes[payment.id] })}
                              disabled={rejectMutation.isPending}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white/70 border border-white/15 transition-all hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                              data-testid={`button-reject-${payment.id}`}
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Refuser
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>}
      </div>

      {/* ── Change Plan Modal ────────────────────────────────────────── */}
      {planModalStore && (
        <ChangePlanModal
          store={planModalStore}
          onClose={() => setPlanModalStore(null)}
          onSave={(plan, limit, price, startDate, expiryDate) =>
            planMutation.mutate({ storeId: planModalStore.id, plan, monthlyLimit: limit, pricePerMonth: price, planStartDate: startDate, planExpiryDate: expiryDate })
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
                <p className="text-white/50 text-sm">{impersonateConfirm.name}</p>
              </div>
            </div>
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.2)" }}>
              <p className="text-white/70 text-xs">
                Vous allez accéder au tableau de bord de <strong className="text-white">{impersonateConfirm.ownerEmail ?? impersonateConfirm.name}</strong>.
                Un bouton "Retour Super Admin" sera disponible en haut de l'écran.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setImpersonateConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-white/60 border border-white/15 text-sm font-semibold hover:border-white/25 transition-all">
                Annuler
              </button>
              <button
                onClick={() => { impersonateMutation.mutate(impersonateConfirm.ownerId!); setImpersonateConfirm(null); }}
                disabled={impersonateMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #C5A059, #a07840)" }}
                data-testid="button-confirm-impersonate"
              >
                {impersonateMutation.isPending ? "Connexion..." : "Entrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

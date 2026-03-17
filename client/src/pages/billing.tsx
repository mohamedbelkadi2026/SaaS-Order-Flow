import { useSubscription } from "@/hooks/use-store-data";
import { useLocation } from "wouter";
import { Check, AlertTriangle, Zap, CreditCard, Crown, Lock, TrendingUp, Infinity, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceDh: 200,
    priceUsd: 19.99,
    limit: 1500,
    limitLabel: "1 500 commandes/mois",
    icon: CreditCard,
    features: [
      "Gestion des commandes",
      "Tableau de bord analytique",
      "1 500 commandes par mois",
      "Support par email",
      "Gestion des produits & stock",
    ],
    style: "light" as const,
  },
  {
    id: "pro",
    name: "Pro",
    priceDh: 400,
    priceUsd: 39.99,
    limit: 0,
    limitLabel: "Commandes illimitées",
    icon: Zap,
    features: [
      "Toutes les fonctionnalités Starter",
      "Commandes illimitées",
      "Support prioritaire 24h/7j",
      "Intégrations avancées",
      "Rapports de rentabilité avancés",
      "Gestion d'équipe complète",
    ],
    style: "dark" as const,
  },
];

const PLAN_LABELS: Record<string, string> = {
  trial: "Essai",
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

export default function BillingPage() {
  const { data: subscription, isLoading } = useSubscription();
  const [, navigate] = useLocation();

  const currentPlan = subscription?.plan || "trial";
  const isTrial = currentPlan === "trial";
  const isBlocked = subscription?.isBlocked === 1 || subscription?.isBlocked === true;
  const currentMonthOrders = subscription?.currentMonthOrders ?? 0;
  const monthlyLimit = subscription?.monthlyLimit ?? (isTrial ? 60 : 1500);
  const usagePercent = monthlyLimit > 0 ? Math.min(Math.round((currentMonthOrders / monthlyLimit) * 100), 100) : 0;
  const isNearLimit = usagePercent > 80 && !isBlocked && monthlyLimit > 0;
  const expiryDate = subscription?.planExpiryDate
    ? new Date(subscription.planExpiryDate).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  const handleSelect = (planId: string) => {
    if (planId === currentPlan) return;
    navigate(`/checkout?plan=${planId}`);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-billing">

      {/* ── Page Title ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }} data-testid="text-page-title">
          Facturation & Abonnement
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Gérez votre abonnement et suivez votre consommation mensuelle</p>
      </div>

      {/* ── Plan Status Header ─────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border"
        style={{
          background: isBlocked
            ? "linear-gradient(135deg, #1c0a0a, #3b0f0f)"
            : `linear-gradient(135deg, ${NAVY}, #2d2a7a)`,
          borderColor: isBlocked ? "#7f1d1d" : "rgba(197,160,89,0.25)",
        }}
        data-testid="card-plan-status"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: isBlocked ? "rgba(239,68,68,0.15)" : "rgba(197,160,89,0.15)", border: `2px solid ${isBlocked ? "#ef4444" : GOLD}` }}
          >
            {isBlocked
              ? <Lock className="w-7 h-7 text-red-400" />
              : isTrial
              ? <TrendingUp className="w-7 h-7" style={{ color: GOLD }} />
              : <Crown className="w-7 h-7" style={{ color: GOLD }} />
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-white font-bold text-lg">
                {isBlocked ? "Compte bloqué" : `Plan ${PLAN_LABELS[currentPlan] ?? currentPlan}`}
              </span>
              <Badge
                className="text-[10px] font-bold border-0 uppercase tracking-wider"
                style={isBlocked
                  ? { background: "#ef4444", color: "#fff" }
                  : isTrial
                  ? { background: "rgba(197,160,89,0.9)", color: "#fff" }
                  : { background: "#16a34a", color: "#fff" }
                }
                data-testid="badge-plan-status"
              >
                {isBlocked ? "BLOQUÉ" : isTrial ? "ESSAI" : "ACTIF"}
              </Badge>
            </div>

            {/* Usage */}
            {(isTrial || monthlyLimit > 0) && (
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60" data-testid="text-usage-count">
                    {currentMonthOrders.toLocaleString("fr-FR")} / {monthlyLimit.toLocaleString("fr-FR")} commandes ce mois
                  </span>
                  <span className="font-semibold" style={{ color: isBlocked ? "#ef4444" : GOLD }}>{usagePercent}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${usagePercent}%`, background: isBlocked ? "#ef4444" : isNearLimit ? "#f97316" : GOLD }}
                  />
                </div>
              </div>
            )}
            {currentPlan === "pro" && monthlyLimit === 0 && (
              <div className="flex items-center gap-1.5 text-white/60 text-xs mb-3">
                <Infinity className="w-3.5 h-3.5" />
                <span>{currentMonthOrders.toLocaleString("fr-FR")} commandes ce mois — illimité</span>
              </div>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap gap-4">
              {expiryDate && (
                <div className="flex items-center gap-1.5 text-xs text-white/50" data-testid="text-expiry-date">
                  <Calendar className="w-3.5 h-3.5" />
                  Expire le <span className="text-white/80 font-medium ml-1">{expiryDate}</span>
                </div>
              )}
              {isNearLimit && (
                <div className="flex items-center gap-1.5 text-xs text-orange-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Approche de la limite
                </div>
              )}
              {isBlocked && (
                <p className="text-red-300 text-xs">Limite atteinte — choisissez un plan payant pour continuer</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Plan Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isDark = plan.style === "dark";
          const PlanIcon = plan.icon;

          return (
            <div
              key={plan.id}
              className={cn("relative rounded-2xl overflow-hidden transition-all border", isCurrent && "ring-2")}
              style={isDark
                ? {
                    background: NAVY,
                    borderColor: isCurrent ? GOLD : "rgba(197,160,89,0.3)",
                    ringColor: GOLD,
                    boxShadow: "0 8px 32px rgba(30,27,75,0.3)",
                  }
                : {
                    background: "#ffffff",
                    borderColor: isCurrent ? NAVY : "#e4e4e7",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  }
              }
              data-testid={`card-plan-${plan.id}`}
            >
              {/* Premium ribbon */}
              {isDark && (
                <div
                  className="absolute top-0 right-0 text-[10px] font-bold px-3 py-1 text-white tracking-widest uppercase"
                  style={{ background: GOLD, borderBottomLeftRadius: "12px" }}
                >
                  Premium
                </div>
              )}

              {isCurrent && (
                <div
                  className={cn("absolute top-0 left-0 text-[10px] font-bold px-3 py-1 text-white tracking-widest uppercase", isDark ? "rounded-br-xl" : "rounded-br-xl")}
                  style={{ background: isDark ? "rgba(22,163,74,0.9)" : NAVY, borderBottomRightRadius: "12px" }}
                >
                  ✓ Actuel
                </div>
              )}

              <div className="p-6">
                {/* Icon + Name */}
                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: isDark ? "rgba(197,160,89,0.15)" : "rgba(30,27,75,0.08)" }}
                  >
                    <PlanIcon className="w-5 h-5" style={{ color: isDark ? GOLD : NAVY }} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-lg", isDark ? "text-white" : "text-zinc-900")}>{plan.name}</p>
                    <p className={cn("text-xs", isDark ? "text-white/50" : "text-zinc-400")}>{plan.limitLabel}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-4xl font-bold", isDark ? "text-white" : "text-zinc-900")}>
                      {plan.priceDh.toFixed(2)} DH
                    </span>
                  </div>
                  <p className={cn("text-sm mt-0.5", isDark ? "text-white/50" : "text-zinc-400")}>
                    {plan.priceUsd.toFixed(2)} $ / mois
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0"
                        style={{ background: isDark ? "rgba(197,160,89,0.2)" : "rgba(30,27,75,0.08)" }}
                      >
                        <Check className="w-2.5 h-2.5" style={{ color: isDark ? GOLD : NAVY }} />
                      </div>
                      <span className={isDark ? "text-white/70" : "text-zinc-600"}>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={isCurrent}
                  className={cn(
                    "w-full py-3.5 rounded-xl font-bold text-sm transition-all",
                    isCurrent
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:opacity-90 active:scale-[0.98]"
                  )}
                  style={{
                    background: isCurrent
                      ? isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
                      : `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
                    color: isCurrent ? (isDark ? "#fff" : NAVY) : "#fff",
                  }}
                  data-testid={`button-select-plan-${plan.id}`}
                >
                  {isCurrent ? "✓ Plan actuel" : "Choisir ce plan →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Contact Footer ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 text-center border"
        style={{ background: "linear-gradient(135deg, #0f1e38, #1a3a8f)", borderColor: "rgba(197,160,89,0.2)" }}
      >
        <p className="text-white/80 text-sm font-medium mb-1">Besoin d'aide pour choisir votre plan ?</p>
        <p className="text-white/50 text-xs mb-4">Notre équipe est disponible pour vous accompagner 7j/7</p>
        <a
          href="https://wa.me/212688959768"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: "#25D366" }}
          data-testid="link-whatsapp-support"
        >
          WhatsApp Support
        </a>
      </div>
    </div>
  );
}

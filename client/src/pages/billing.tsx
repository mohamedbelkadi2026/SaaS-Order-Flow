import { useSubscription, useUpdateSubscription } from "@/hooks/use-store-data";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, XCircle, Loader2, CreditCard, Zap, Crown, TrendingUp, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PAID_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 200,
    limit: 1500,
    limitLabel: "1 500 commandes/mois",
    icon: CreditCard,
    color: "#1a3a8f",
    features: [
      "Gestion des commandes",
      "Tableau de bord analytique",
      "1 500 commandes par mois",
      "Support par email",
      "Gestion des produits & stock",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 400,
    limit: 5000,
    limitLabel: "5 000 commandes/mois",
    icon: Zap,
    color: "#C5A059",
    popular: true,
    features: [
      "Toutes les fonctionnalités Starter",
      "5 000 commandes par mois",
      "Support prioritaire 24h/7j",
      "Intégrations avancées",
      "Rapports de rentabilité",
      "Gestion d'équipe complète",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 700,
    limit: null,
    limitLabel: "Commandes illimitées",
    icon: Crown,
    color: "#7c3aed",
    features: [
      "Toutes les fonctionnalités Pro",
      "Commandes illimitées",
      "Account Manager dédié",
      "Onboarding personnalisé",
      "API accès complet",
      "Rapports sur mesure",
    ],
  },
];

export default function BillingPage() {
  const { data: subscription, isLoading } = useSubscription();
  const updateSubscription = useUpdateSubscription();
  const { toast } = useToast();

  const currentPlan = subscription?.plan || "trial";
  const isTrial = currentPlan === "trial";
  const isBlocked = subscription?.isBlocked === 1 || subscription?.isBlocked === true;
  const currentMonthOrders = subscription?.currentMonthOrders ?? 0;
  const monthlyLimit = isTrial ? 60 : (subscription?.monthlyLimit ?? 1500);
  const usagePercent = monthlyLimit > 0 ? Math.min(Math.round((currentMonthOrders / monthlyLimit) * 100), 100) : 0;
  const trialRemaining = Math.max(0, monthlyLimit - currentMonthOrders);
  const isNearLimit = usagePercent > 80 && !isBlocked;

  const handleChangePlan = (planId: string) => {
    if (planId === currentPlan) return;
    const plan = PAID_PLANS.find(p => p.id === planId);
    updateSubscription.mutate(
      { plan: planId },
      {
        onSuccess: () => {
          toast({
            title: "Plan mis à jour",
            description: `Vous êtes maintenant sur le plan ${plan?.name || planId}.`,
          });
        },
        onError: () => {
          toast({
            title: "Erreur",
            description: "Impossible de changer de plan. Veuillez réessayer.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-billing">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Facturation & Abonnement</h1>
        <p className="text-muted-foreground mt-1">Gérez votre abonnement et suivez votre consommation</p>
      </div>

      {/* Trial / Blocked Banner */}
      {isTrial && (
        <div
          className="rounded-2xl overflow-hidden shadow-lg"
          style={{ background: isBlocked ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : 'linear-gradient(135deg, #0f1e38, #1a3a8f)' }}
          data-testid="card-trial-banner"
        >
          <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: isBlocked ? 'rgba(239,68,68,0.2)' : 'rgba(197,160,89,0.2)', border: `2px solid ${isBlocked ? '#ef4444' : '#C5A059'}` }}
            >
              {isBlocked ? <Lock className="w-6 h-6 text-red-400" /> : <TrendingUp className="w-6 h-6" style={{ color: '#C5A059' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-bold text-white text-base">
                  {isBlocked ? "Compte bloqué — Limite atteinte" : "Version d'essai gratuite"}
                </h2>
                <Badge
                  className="text-[10px] font-bold border-0"
                  style={{ background: isBlocked ? '#ef4444' : '#C5A059', color: '#fff' }}
                >
                  {isBlocked ? "BLOQUÉ" : "ESSAI"}
                </Badge>
              </div>
              <p className="text-white/70 text-sm">
                {isBlocked
                  ? `Vous avez utilisé vos ${monthlyLimit} commandes gratuites. Choisissez un plan payant pour continuer.`
                  : `Il vous reste ${trialRemaining} commande${trialRemaining !== 1 ? 's' : ''} gratuites sur ${monthlyLimit} — Passez au plan payant pour continuer sans limite.`
                }
              </p>
              {/* Progress */}
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-white/60">
                  <span>{currentMonthOrders} commandes utilisées</span>
                  <span className="font-semibold" style={{ color: isBlocked ? '#ef4444' : '#C5A059' }}>{usagePercent}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${usagePercent}%`, background: isBlocked ? '#ef4444' : '#C5A059' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paid plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PAID_PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const PlanIcon = plan.icon;
          return (
            <Card
              key={plan.id}
              className="relative overflow-hidden transition-all"
              style={plan.popular
                ? { border: `2px solid #C5A059`, boxShadow: '0 4px 24px rgba(197,160,89,0.15)' }
                : isCurrent
                ? { border: `2px solid ${plan.color}` }
                : {}}
              data-testid={`card-plan-${plan.id}`}
            >
              {plan.popular && (
                <div
                  className="absolute top-0 right-0 text-[10px] font-bold px-3 py-1 text-white"
                  style={{ background: '#C5A059', borderBottomLeftRadius: '10px' }}
                >
                  ⭐ POPULAIRE
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${plan.color}22` }}>
                    <PlanIcon className="w-4 h-4" style={{ color: plan.color }} />
                  </div>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && (
                    <Badge data-testid={`badge-current-plan-${plan.id}`} className="ml-auto text-[10px]">Actuel</Badge>
                  )}
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">{plan.price} DH</span>
                  <span className="text-muted-foreground text-sm">/mois</span>
                </CardDescription>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.limitLabel}</p>
              </CardHeader>
              <CardContent className="pb-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: plan.color }} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-0">
                <Button
                  className="w-full font-semibold"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || updateSubscription.isPending}
                  onClick={() => handleChangePlan(plan.id)}
                  style={!isCurrent ? { background: plan.color, borderColor: plan.color } : {}}
                  data-testid={`button-select-plan-${plan.id}`}
                >
                  {updateSubscription.isPending && updateSubscription.variables?.plan === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {isCurrent ? "✓ Plan actuel" : "Choisir ce plan"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Usage card (for non-trial paid plans) */}
      {!isTrial && (
        <Card data-testid="card-usage">
          <CardHeader>
            <CardTitle>Consommation du mois</CardTitle>
            <CardDescription>
              {currentPlan === "elite"
                ? "Vous bénéficiez de commandes illimitées"
                : `${currentMonthOrders.toLocaleString("fr-FR")} / ${monthlyLimit.toLocaleString("fr-FR")} commandes utilisées`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentPlan !== "elite" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground" data-testid="text-usage-count">
                    {currentMonthOrders.toLocaleString("fr-FR")} commandes
                  </span>
                  <span className="text-sm font-semibold" data-testid="text-usage-percent">{usagePercent}%</span>
                </div>
                <Progress value={usagePercent} data-testid="progress-usage" />
                {isNearLimit && (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50" data-testid="badge-usage-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Attention : vous approchez de votre limite
                  </Badge>
                )}
              </>
            )}
            {currentPlan === "elite" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-unlimited">
                <Check className="h-4 w-4 text-primary" />
                <span>{currentMonthOrders.toLocaleString("fr-FR")} commandes ce mois-ci (illimité)</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact footer */}
      <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(135deg, #0f1e38, #1a3a8f)' }}>
        <p className="text-white/80 text-sm font-medium mb-1">Besoin d'aide pour choisir votre plan ?</p>
        <p className="text-white/50 text-xs mb-3">Notre équipe est disponible pour vous accompagner</p>
        <a
          href="https://wa.me/212600000000"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-80"
          style={{ background: '#25D366' }}
          data-testid="link-whatsapp-support"
        >
          WhatsApp Support
        </a>
      </div>
    </div>
  );
}

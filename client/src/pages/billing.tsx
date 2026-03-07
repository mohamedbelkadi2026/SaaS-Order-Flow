import { useSubscription, useUpdateSubscription } from "@/hooks/use-store-data";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, XCircle, Loader2, CreditCard, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 200,
    limit: 1500,
    limitLabel: "1 500 commandes/mois",
    icon: CreditCard,
    features: [
      "Gestion des commandes",
      "Tableau de bord",
      "1 500 commandes par mois",
      "Support par email",
      "Gestion des produits",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 400,
    limit: null,
    limitLabel: "Commandes illimitées",
    icon: Zap,
    features: [
      "Toutes les fonctionnalités Starter",
      "Commandes illimitées",
      "Support prioritaire",
      "Intégrations avancées",
      "Rapports de rentabilité",
      "Gestion d'équipe",
    ],
  },
];

export default function BillingPage() {
  const { data: subscription, isLoading } = useSubscription();
  const updateSubscription = useUpdateSubscription();
  const { toast } = useToast();

  const currentPlan = subscription?.plan || "starter";
  const currentMonthOrders = subscription?.currentMonthOrders || 0;
  const monthlyLimit = subscription?.monthlyLimit || 1500;
  const usagePercent = monthlyLimit > 0 ? Math.min(Math.round((currentMonthOrders / monthlyLimit) * 100), 100) : 0;
  const isNearLimit = usagePercent > 80;
  const isAtLimit = currentMonthOrders >= monthlyLimit && currentPlan !== "pro";

  const handleChangePlan = (planId: string) => {
    if (planId === currentPlan) return;
    updateSubscription.mutate(
      { plan: planId },
      {
        onSuccess: () => {
          toast({
            title: "Plan mis à jour",
            description: `Vous êtes maintenant sur le plan ${planId === "pro" ? "Pro" : "Starter"}.`,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-billing">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Facturation & Abonnement</h1>
        <p className="text-muted-foreground mt-1">Gérez votre abonnement et suivez votre consommation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const PlanIcon = plan.icon;
          return (
            <Card
              key={plan.id}
              className={isCurrent ? "border-primary border-2" : ""}
              data-testid={`card-plan-${plan.id}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlanIcon className="h-5 w-5 text-primary" />
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  {isCurrent && (
                    <Badge data-testid={`badge-current-plan-${plan.id}`}>Plan actuel</Badge>
                  )}
                </div>
                <CardDescription className="mt-2">
                  <span className="text-2xl font-bold text-foreground">{plan.price} DH</span>
                  <span className="text-muted-foreground">/mois</span>
                </CardDescription>
                <p className="text-sm text-muted-foreground">{plan.limitLabel}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || updateSubscription.isPending}
                  onClick={() => handleChangePlan(plan.id)}
                  data-testid={`button-select-plan-${plan.id}`}
                >
                  {updateSubscription.isPending && updateSubscription.variables?.plan === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {isCurrent ? "Plan actuel" : "Choisir ce plan"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-usage">
        <CardHeader>
          <CardTitle>Consommation du mois</CardTitle>
          <CardDescription>
            {currentPlan === "pro"
              ? "Vous bénéficiez de commandes illimitées"
              : `${currentMonthOrders.toLocaleString("fr-FR")} / ${monthlyLimit.toLocaleString("fr-FR")} commandes utilisées`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentPlan !== "pro" && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground" data-testid="text-usage-count">
                  {currentMonthOrders.toLocaleString("fr-FR")} commandes
                </span>
                <span className="text-sm font-medium" data-testid="text-usage-percent">
                  {usagePercent}%
                </span>
              </div>
              <Progress value={usagePercent} data-testid="progress-usage" />

              {isAtLimit && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive" data-testid="alert-limit-reached">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">Limite atteinte. Passez au plan Pro.</span>
                </div>
              )}

              {isNearLimit && !isAtLimit && (
                <Badge variant="outline" className="gap-1" data-testid="badge-usage-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Attention: vous approchez de votre limite
                </Badge>
              )}
            </>
          )}

          {currentPlan === "pro" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-pro-unlimited">
              <Check className="h-4 w-4 text-primary" />
              <span>{currentMonthOrders.toLocaleString("fr-FR")} commandes ce mois-ci</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

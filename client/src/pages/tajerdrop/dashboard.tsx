import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, CheckCircle, Truck, XCircle, TrendingUp, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

const GOLD = "#C5A059";
const NAVY = "#0f1e38";

interface SellerStats {
  totalLeads: number;
  confirmed: number;
  delivered: number;
  refused: number;
  confirmationRate: number;
  deliveryRate: number;
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: (color || GOLD) + "18" }}>
          <Icon className="w-5 h-5" style={{ color: color || GOLD }} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TajerDropDashboard() {
  const { data: stats, isLoading } = useQuery<SellerStats>({
    queryKey: ["/api/marketplace/stats"],
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  const s = stats || { totalLeads: 0, confirmed: 0, delivered: 0, refused: 0, confirmationRate: 0, deliveryRate: 0 };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vue globale de votre activité TajerDrop</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={ShoppingCart} label="Total leads" value={s.totalLeads} color={GOLD} />
        <StatCard icon={CheckCircle}  label="Confirmés"   value={s.confirmed}  color="#16a34a" />
        <StatCard icon={Truck}        label="Livrés"      value={s.delivered}  color="#2563eb" />
        <StatCard icon={XCircle}      label="Refusés"     value={s.refused}    color="#dc2626" />
        <StatCard
          icon={TrendingUp}
          label="Taux de confirmation"
          value={`${s.confirmationRate}%`}
          color="#7c3aed"
        />
        <StatCard
          icon={Truck}
          label="Taux de livraison"
          value={`${s.deliveryRate}%`}
          color="#0891b2"
        />
      </div>

      {/* Quick actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Actions rapides</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/tajerdrop/catalogue">
            <a className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: GOLD }}>
              <Package className="w-4 h-4" />
              Parcourir le catalogue
            </a>
          </Link>
          <Link href="/tajerdrop/commandes">
            <a className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-muted">
              <ShoppingCart className="w-4 h-4" />
              Mes commandes
            </a>
          </Link>
        </CardContent>
      </Card>

      {/* How it works */}
      {s.totalLeads === 0 && (
        <Card className="border-0 shadow-sm" style={{ background: NAVY }}>
          <CardContent className="p-6 text-center space-y-2">
            <Package className="w-10 h-10 mx-auto mb-3" style={{ color: GOLD }} />
            <h3 className="font-semibold text-white">Commencez à vendre !</h3>
            <p className="text-sm text-white/60">
              Choisissez un produit dans le catalogue, fixez votre prix de vente, et créez votre première commande.
            </p>
            <Link href="/tajerdrop/catalogue">
              <a className="inline-block mt-3 px-5 py-2 rounded-lg text-sm font-semibold"
                style={{ background: GOLD, color: NAVY }}>
                Voir le catalogue
              </a>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

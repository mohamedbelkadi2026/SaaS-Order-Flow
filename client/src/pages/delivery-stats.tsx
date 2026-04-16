import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Truck, Package, RotateCcw, Clock, TrendingUp, AlertCircle } from 'lucide-react';

export default function DeliveryStats() {
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ['/api/orders'] });
  const { data: carrierAccounts = [] } = useQuery<any[]>({ queryKey: ['/api/carrier-accounts'] });

  const stats = useMemo(() => {
    const shipped = orders.filter((o: any) => o.trackNumber);
    const delivered = shipped.filter((o: any) => o.status === 'delivered');
    const refused = shipped.filter((o: any) => o.status === 'refused' || o.status === 'retourné');
    const pending = shipped.filter((o: any) => !['delivered','refused','retourné','Retour Recu'].includes(o.status));
    const inTransit = shipped.filter((o: any) => ['in_progress','En cours de livraison','Sorti pour livraison','Ramassé','En transit','En cours de réception au network','Arrivé au hub'].includes(o.status || o.commentStatus));

    const deliveryRate = shipped.length > 0 ? ((delivered.length / shipped.length) * 100).toFixed(1) : '0';
    const returnRate = shipped.length > 0 ? ((refused.length / shipped.length) * 100).toFixed(1) : '0';

    const deliveryTimes = delivered
      .filter((o: any) => o.createdAt && o.updatedAt)
      .map((o: any) => {
        const diff = new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime();
        return diff / (1000 * 60 * 60 * 24);
      });
    const avgDays = deliveryTimes.length > 0
      ? (deliveryTimes.reduce((a: number, b: number) => a + b, 0) / deliveryTimes.length).toFixed(1)
      : '—';

    const byCarrier: Record<string, { total: number; delivered: number; pending: number; refused: number }> = {};
    for (const o of shipped) {
      const c = o.shippingProvider || 'Inconnu';
      if (!byCarrier[c]) byCarrier[c] = { total: 0, delivered: 0, pending: 0, refused: 0 };
      byCarrier[c].total++;
      if (o.status === 'delivered') byCarrier[c].delivered++;
      else if (['refused','retourné'].includes(o.status)) byCarrier[c].refused++;
      else byCarrier[c].pending++;
    }

    const statusBreakdown: Record<string, number> = {};
    for (const o of shipped) {
      const s = o.commentStatus || o.status || 'Inconnu';
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }

    const pendingReturn = orders.filter((o: any) => o.status === 'retourné');

    return {
      totalShipped: shipped.length,
      delivered: delivered.length,
      refused: refused.length,
      pending: pending.length,
      inTransit: inTransit.length,
      deliveryRate,
      returnRate,
      avgDays,
      byCarrier,
      statusBreakdown,
      pendingReturn: pendingReturn.length,
      totalRevenue: delivered.reduce((s: number, o: any) => s + (o.totalPrice || 0), 0),
      totalShippingCost: delivered.reduce((s: number, o: any) => s + (o.shippingCost || 0), 0),
    };
  }, [orders]);

  const fmtDH = (v: number) => `${(v / 100).toFixed(2)} DH`;

  return (
    <div className="space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold">📦 Statistiques de Livraison</h1>
        <p className="text-muted-foreground text-sm mt-1">Vue complète de vos performances de livraison</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Expédiées', value: stats.totalShipped, icon: Truck, color: '#3b82f6', sub: 'Total colis' },
          { label: 'Livrées', value: stats.delivered, icon: Package, color: '#10b981', sub: `${stats.deliveryRate}% taux` },
          { label: 'En attente', value: stats.pending, icon: Clock, color: '#f59e0b', sub: 'En transit' },
          { label: 'Retours', value: stats.refused, icon: RotateCcw, color: '#ef4444', sub: `${stats.returnRate}% taux` },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border bg-white dark:bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase font-semibold">{card.label}</span>
              <card.icon className="w-4 h-4" style={{ color: card.color }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-white dark:bg-card p-6 shadow-sm flex flex-col items-center justify-center">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3"
                strokeDasharray={`${stats.deliveryRate} ${100 - parseFloat(stats.deliveryRate)}`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-green-600">{stats.deliveryRate}%</span>
              <span className="text-xs text-muted-foreground">Livré</span>
            </div>
          </div>
          <p className="mt-3 font-semibold">Taux de livraison</p>
          <p className="text-xs text-muted-foreground">{stats.delivered} / {stats.totalShipped} colis</p>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Délai moyen', value: `${stats.avgDays} jours`, icon: '⏱️', color: 'text-blue-600' },
            { label: 'Taux de retour', value: `${stats.returnRate}%`, icon: '↩️', color: 'text-red-500' },
            { label: 'Revenu livré', value: fmtDH(stats.totalRevenue), icon: '💰', color: 'text-green-600' },
            { label: 'Frais livraison', value: fmtDH(stats.totalShippingCost), icon: '🚚', color: 'text-orange-500' },
            { label: 'En transit', value: stats.inTransit, icon: '🔄', color: 'text-blue-500' },
            { label: 'Retours en attente', value: stats.pendingReturn, icon: '⚠️', color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-white dark:bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{s.icon}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-white dark:bg-card p-5 shadow-sm">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          Performance par transporteur
        </h2>
        <div className="space-y-4">
          {Object.entries(stats.byCarrier).map(([carrier, data]) => {
            const rate = data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0;
            return (
              <div key={carrier}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <img src={`/carriers/${carrier.toLowerCase()}.svg`} className="w-6 h-6 object-contain" onError={e => (e.currentTarget.style.display='none')} alt={carrier} />
                    <span className="font-semibold text-sm capitalize">{carrier}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="text-green-600 font-semibold">{data.delivered} livrées</span>
                    <span className="text-amber-600">{data.pending} en attente</span>
                    <span className="text-red-500">{data.refused} retours</span>
                    <span className="font-bold text-foreground">{data.total} total</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                  <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${rate}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>G.S: {rate}%</span>
                  <span>{data.total} expédiées</span>
                </div>
              </div>
            );
          })}
          {Object.keys(stats.byCarrier).length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-4">Aucune commande expédiée</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white dark:bg-card p-5 shadow-sm">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          Répartition des statuts transporteur
        </h2>
        <div className="space-y-2">
          {Object.entries(stats.statusBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm">{status}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, (count / stats.totalShipped) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

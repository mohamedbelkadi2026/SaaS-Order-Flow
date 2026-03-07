import { useAuth } from "@/hooks/use-auth";
import { useAgents, useIntegrations, useStore } from "@/hooks/use-store-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, User, CheckCircle2, Truck, Globe } from "lucide-react";

export default function Magasins() {
  const { user } = useAuth();
  const { data: agents } = useAgents();
  const { data: integrations } = useIntegrations("store");

  const { data: storeData } = useStore();
  const storeName = storeData?.name || "Ma Boutique";
  const ownerName = user?.username || "Propriétaire";

  const connectedStores = integrations?.filter((i: any) => i.isActive) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-display font-bold" data-testid="text-magasins-title">Mes magasins</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid="card-store-main">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                  <Store className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg uppercase tracking-tight" data-testid="text-store-name">{storeName}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {ownerName}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 px-3 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                </div>
                Actif
              </Badge>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">ÉQUIPE DE TRAITEMENT</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold">Agents:</span>
                  <span className="text-muted-foreground" data-testid="text-agent-list">
                    {agents && agents.length > 0
                      ? agents.map((a: any) => a.username).join(", ")
                      : "Aucun agent"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">Total agents:</span>
                  <span className="text-muted-foreground">{agents?.length || 0}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-2 flex-wrap">
                {connectedStores.length > 0 ? connectedStores.map((s: any) => (
                  <div key={s.id} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500" title={s.provider}>
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                )) : (
                  <span className="text-xs text-muted-foreground">Aucune intégration connectée</span>
                )}
              </div>
              <div className="flex items-center h-6 w-10 bg-green-500 rounded-full relative px-1">
                <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

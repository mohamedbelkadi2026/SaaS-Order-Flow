import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link2, Settings, CheckCircle, Unlink, Loader2, Truck, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from "@/hooks/use-store-data";

const SHIPPING_PROVIDERS = [
  { id: "cathedis", name: "Cathedis", cities: 520 },
  { id: "digylog", name: "Digylog", cities: 581 },
  { id: "onessta", name: "Onessta", cities: 378 },
  { id: "ozoneexpress", name: "OzoneExpress", cities: 628 },
  { id: "sendit", name: "Sendit", cities: 500 },
  { id: "speedex", name: "Speedex", cities: 439 },
  { id: "kargoexpress", name: "Kargoexpress", cities: 335 },
  { id: "forcelog", name: "Forcelog", cities: 468 },
  { id: "livo", name: "Livo", cities: 369 },
  { id: "quicklivraison", name: "Quicklivraison", cities: 404 },
];

export default function ShippingIntegrations() {
  const { toast } = useToast();
  const { data: integrations, isLoading } = useIntegrations("shipping");
  const createIntegration = useCreateIntegration();
  const deleteIntegration = useDeleteIntegration();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [settingsProvider, setSettingsProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState(false);

  const connectedMap = new Map(
    (integrations || []).map((i: any) => [i.provider, i])
  );

  const handleConnect = async () => {
    if (!connectingProvider) return;
    if (!formData.apiKey?.trim()) {
      toast({ title: "Champ requis", description: "Veuillez entrer la clé API", variant: "destructive" });
      return;
    }
    try {
      await createIntegration.mutateAsync({
        provider: connectingProvider,
        type: "shipping",
        credentials: formData,
      });
      toast({ title: "Connecté", description: `${connectingProvider} connecté avec succès` });
      setConnectingProvider(null);
      setFormData({});
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleDisconnect = async (integration: any) => {
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast({ title: "Déconnecté", description: `${integration.provider} déconnecté` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-shipping-title">Sociétés de Livraison</h1>
        <p className="text-muted-foreground mt-1">Connectez vos transporteurs marocains pour envoyer les commandes en livraison.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SHIPPING_PROVIDERS.map((provider) => {
            const connected = connectedMap.get(provider.id);
            return (
              <Card key={provider.id} className="relative rounded-2xl border-border/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow" data-testid={`card-shipping-${provider.id}`}>
                {connected && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-emerald-500 text-white text-[10px] font-bold px-8 py-1 rotate-45 translate-x-6 -translate-y-1 shadow-sm flex items-center gap-1 justify-center w-32">
                      <CheckCircle className="w-2.5 h-2.5" /> Connecté
                    </div>
                  </div>
                )}
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Truck className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{provider.name}</h3>
                      <p className="text-xs text-muted-foreground">{provider.cities} villes couvertes</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {connected ? (
                      <>
                        <Button
                          variant="outline" size="sm" className="flex-1"
                          data-testid={`button-settings-${provider.id}`}
                          onClick={() => { setSettingsProvider(provider.id); setFormData({}); }}
                        >
                          <Settings className="w-4 h-4 mr-2" /> Paramètres
                        </Button>
                        <Button
                          variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50"
                          data-testid={`button-disconnect-shipping-${provider.id}`}
                          onClick={() => handleDisconnect(connected)}
                          disabled={deleteIntegration.isPending}
                        >
                          <Unlink className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                        data-testid={`button-connect-shipping-${provider.id}`}
                        onClick={() => { setConnectingProvider(provider.id); setFormData({}); setShowSecret(false); }}
                      >
                        <Link2 className="w-4 h-4 mr-2" /> Connecter
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!connectingProvider} onOpenChange={(open) => { if (!open) setConnectingProvider(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connecter {connectingProvider}</DialogTitle>
            <DialogDescription>Entrez vos identifiants API pour ce transporteur.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Clé API</Label>
              <div className="relative">
                <Input
                  data-testid="input-shipping-apiKey"
                  type={showSecret ? "text" : "password"}
                  placeholder="Votre clé API..."
                  value={formData.apiKey || ""}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Token Secret (optionnel)</Label>
              <Input
                data-testid="input-shipping-apiSecret"
                type="password"
                placeholder="Token secret..."
                value={formData.apiSecret || ""}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>URL API (optionnelle)</Label>
              <Input
                data-testid="input-shipping-apiUrl"
                placeholder="https://api.transporteur.ma/v1"
                value={formData.apiUrl || ""}
                onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConnectingProvider(null)} data-testid="button-cancel-shipping">Annuler</Button>
            <Button data-testid="button-confirm-shipping" onClick={handleConnect} disabled={createIntegration.isPending}>
              {createIntegration.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {createIntegration.isPending ? "Connexion..." : "Connecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settingsProvider} onOpenChange={(open) => { if (!open) setSettingsProvider(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paramètres — {settingsProvider}</DialogTitle>
            <DialogDescription>Mettez à jour vos identifiants API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Clé API</Label>
              <Input
                data-testid="input-settings-apiKey"
                type="password"
                placeholder="Nouvelle clé API..."
                value={formData.apiKey || ""}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Token Secret (optionnel)</Label>
              <Input
                data-testid="input-settings-apiSecret"
                type="password"
                placeholder="Nouveau token secret..."
                value={formData.apiSecret || ""}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSettingsProvider(null)}>Annuler</Button>
            <Button
              data-testid="button-save-settings"
              onClick={async () => {
                if (!settingsProvider || !formData.apiKey?.trim()) {
                  toast({ title: "Erreur", description: "Clé API requise", variant: "destructive" });
                  return;
                }
                try {
                  await createIntegration.mutateAsync({ provider: settingsProvider, type: "shipping", credentials: formData });
                  toast({ title: "Mis à jour", description: "Identifiants mis à jour" });
                  setSettingsProvider(null);
                  setFormData({});
                } catch (err: any) {
                  toast({ title: "Erreur", description: err.message, variant: "destructive" });
                }
              }}
              disabled={createIntegration.isPending}
            >
              {createIntegration.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

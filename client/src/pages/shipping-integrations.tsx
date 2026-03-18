import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link2, Settings, CheckCircle, Unlink, Loader2, Truck, Eye, EyeOff, RotateCcw, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from "@/hooks/use-store-data";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

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

  /* ── Open Retour state ─────────────────────────────────────── */
  const [orDialog, setOrDialog] = useState(false);
  const [orApiKey, setOrApiKey] = useState("");
  const [orClientId, setOrClientId] = useState("");
  const [orShowKey, setOrShowKey] = useState(false);

  const { data: orSettings, isLoading: orLoading } = useQuery<any>({
    queryKey: ["/api/open-retour/settings"],
    queryFn: () => fetch("/api/open-retour/settings", { credentials: "include" }).then(r => r.json()),
  });

  const saveOrMutation = useMutation({
    mutationFn: () => fetch("/api/open-retour/settings", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: orApiKey, clientId: orClientId }),
    }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-retour/settings"] });
      if (data.success) {
        toast({ title: "Open Retour connecté ✅", description: data.message });
        setOrDialog(false);
      } else {
        toast({ title: "Erreur", description: data.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const disconnectOrMutation = useMutation({
    mutationFn: () => fetch("/api/open-retour/settings", { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-retour/settings"] });
      toast({ title: "Open Retour déconnecté" });
    },
  });

  /* ── Shipping providers ────────────────────────────────────── */
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

  const openOrDialog = () => {
    setOrApiKey("");
    setOrClientId(orSettings?.clientId || "");
    setOrDialog(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── SECTION: Open Retour ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
          <h2 className="text-xl font-bold" style={{ color: NAVY }}>Gestion des Retours</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Connectez votre compte Open Retour pour automatiser les tickets de retour directement depuis vos commandes.</p>

        {orLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
        ) : (
          <Card className="relative overflow-hidden rounded-2xl border-2" style={{
            borderColor: orSettings?.connected ? "rgba(197,160,89,0.5)" : "rgba(30,27,75,0.1)",
          }}>
            {orSettings?.connected && (
              <div className="absolute top-0 right-0 z-10">
                <div className="text-white text-[10px] font-bold px-8 py-1 rotate-45 translate-x-6 -translate-y-1 shadow-sm flex items-center gap-1 justify-center w-32"
                  style={{ background: GOLD }}>
                  <CheckCircle className="w-2.5 h-2.5" /> Connecté
                </div>
              </div>
            )}
            <CardContent className="p-6">
              <div className="flex items-start gap-5">
                {/* Logo */}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d2a7a 100%)` }}>
                  <RotateCcw className="w-7 h-7 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold" style={{ color: NAVY }}>Open Retour</h3>
                    <Badge className="text-[10px] font-bold border-0"
                      style={{ background: `rgba(197,160,89,0.12)`, color: GOLD }}>
                      Maroc
                    </Badge>
                    <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Plateforme marocaine de gestion des retours COD. Créez des tickets de retour, tracez les colis et gérez les remboursements automatiquement.
                  </p>

                  {orSettings?.connected ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="font-semibold text-green-700">Compte connecté</span>
                        {orSettings.clientId && (
                          <span className="text-muted-foreground">· Client ID: <code className="bg-zinc-100 px-1 rounded text-xs">{orSettings.clientId}</code></span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={openOrDialog}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all hover:opacity-90"
                          style={{ borderColor: GOLD, color: GOLD }}
                          data-testid="button-or-settings"
                        >
                          <Settings className="w-4 h-4" /> Modifier les clés
                        </button>
                        <button
                          onClick={() => disconnectOrMutation.mutate()}
                          disabled={disconnectOrMutation.isPending}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          data-testid="button-or-disconnect"
                        >
                          {disconnectOrMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                          Déconnecter
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={openOrDialog}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 shadow-md"
                      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
                      data-testid="button-or-connect"
                    >
                      <Link2 className="w-4 h-4" /> Connecter Open Retour
                    </button>
                  )}
                </div>
              </div>

              {/* Features */}
              <div className="mt-5 pt-4 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ["🔄", "Retours automatiques", "Créez des tickets en 1 clic depuis la commande"],
                  ["📦", "Tracking retour", "Numéro de suivi retour enregistré sur la commande"],
                  ["🤖", "Déclenchement auto", "Prompt automatique sur les commandes refusées"],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(30,27,75,0.03)" }}>
                    <span className="text-base">{icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-700">{title}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── SECTION: Shipping Carriers ───────────────────────────── */}
      <div>
        <h1 className="text-2xl font-display font-bold mb-1" data-testid="text-shipping-title">Sociétés de Livraison</h1>
        <p className="text-muted-foreground mb-4">Connectez vos transporteurs marocains pour envoyer les commandes en livraison.</p>

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
      </div>

      {/* ── Open Retour Dialog ────────────────────────────────────── */}
      <Dialog open={orDialog} onOpenChange={setOrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
              {orSettings?.connected ? "Modifier les identifiants" : "Connecter"} Open Retour
            </DialogTitle>
            <DialogDescription>
              Obtenez votre API Key et Client ID sur{" "}
              <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GOLD }}>
                openretour.ma
              </a>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-semibold">Client ID</Label>
              <Input
                data-testid="input-or-clientId"
                placeholder="Votre Client ID Open Retour..."
                value={orClientId}
                onChange={e => setOrClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">API Key (Secret)</Label>
              <div className="relative">
                <Input
                  data-testid="input-or-apiKey"
                  type={orShowKey ? "text" : "password"}
                  placeholder="Votre clé API secrète..."
                  value={orApiKey}
                  onChange={e => setOrApiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setOrShowKey(!orShowKey)}
                >
                  {orShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                🔒 Stockée de façon sécurisée en base de données, isolée par magasin.
              </p>
            </div>

            <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: `rgba(197,160,89,0.07)`, border: `1px solid rgba(197,160,89,0.2)` }}>
              <p className="font-semibold" style={{ color: GOLD }}>Comment trouver vos identifiants ?</p>
              <ol className="space-y-0.5 text-zinc-600 list-decimal list-inside">
                <li>Connectez-vous sur openretour.ma</li>
                <li>Allez dans Paramètres → API</li>
                <li>Copiez votre Client ID et générez une API Key</li>
              </ol>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOrDialog(false)} data-testid="button-or-cancel">Annuler</Button>
            <Button
              onClick={() => saveOrMutation.mutate()}
              disabled={saveOrMutation.isPending || !orApiKey.trim() || !orClientId.trim()}
              className="text-white font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
              data-testid="button-or-save"
            >
              {saveOrMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {saveOrMutation.isPending ? "Connexion..." : "Enregistrer et connecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Shipping connect dialog ───────────────────────────────── */}
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

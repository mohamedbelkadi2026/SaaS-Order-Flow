import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Link2, Settings, CheckCircle, Unlink, Loader2, RotateCcw, ExternalLink, Eye, EyeOff, MapPin, Video, Home, ChevronRight, Plus, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from "@/hooks/use-store-data";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

const SHIPPING_PROVIDERS = [
  { id: "digylog",        name: "Digylog",          cities: 581, logo: "/carriers/digylog.svg",   tutorialUrl: "https://youtu.be/digylog" },
  { id: "onessta",        name: "Onessta",           cities: 378, logo: "/carriers/onessta.svg",   tutorialUrl: "https://youtu.be/onessta" },
  { id: "ozoneexpress",   name: "Ozone Express",     cities: 628, logo: "/carriers/ozon.svg",      tutorialUrl: "https://youtu.be/ozone" },
  { id: "sendit",         name: "Sendit",            cities: 500, logo: "/carriers/sendit.svg",    tutorialUrl: "https://youtu.be/sendit" },
  { id: "ameex",          name: "Ameex",             cities: 420, logo: "/carriers/ameex.svg",     tutorialUrl: "https://youtu.be/ameex" },
  { id: "cathedis",       name: "Cathedis",          cities: 520, logo: "/carriers/cathidis.svg",  tutorialUrl: "https://youtu.be/cathedis" },
  { id: "speedex",        name: "Speedex",           cities: 439, logo: "/carriers/speedx.png",    tutorialUrl: "https://youtu.be/speedex" },
  { id: "kargoexpress",   name: "KargoExpress",      cities: 335, logo: "/carriers/cargo.svg",     tutorialUrl: "https://youtu.be/kargo" },
  { id: "forcelog",       name: "ForceLog",          cities: 468, logo: "/carriers/forcelog.png",  tutorialUrl: "https://youtu.be/forcelog" },
  { id: "livo",           name: "Livo",              cities: 369, logo: "/carriers/ol.svg",        tutorialUrl: "https://youtu.be/livo" },
  { id: "quicklivraison", name: "Quick Livraison",   cities: 404, logo: "/carriers/ql.svg",        tutorialUrl: "https://youtu.be/ql" },
  { id: "codinafrica",    name: "Codinafrica",       cities: 312, logo: "/carriers/cargo.svg",     tutorialUrl: "https://youtu.be/codinafrica" },
  { id: "olivraison",     name: "Olivraison",        cities: 280, logo: null,                                                     tutorialUrl: "https://youtu.be/olivraison" },
  { id: "livreego",       name: "Livreego",          cities: 295, logo: null,                                                     tutorialUrl: "https://youtu.be/livreego" },
  { id: "powerdelivery",  name: "PowerDelivery",     cities: 350, logo: null,                                                     tutorialUrl: "https://youtu.be/powerdelivery" },
  { id: "caledex",        name: "Caledex",           cities: 270, logo: null,                                                     tutorialUrl: "https://youtu.be/caledex" },
  { id: "oscario",        name: "Oscario",           cities: 390, logo: null,                                                     tutorialUrl: "https://youtu.be/oscario" },
  { id: "colisspeed",     name: "Colisspeed",        cities: 445, logo: null,                                                     tutorialUrl: "https://youtu.be/colisspeed" },
];

function ProviderLogo({ logo, name }: { logo: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);

  if (logo && !imgError) {
    return (
      <img
        src={logo}
        alt={name}
        onError={() => setImgError(true)}
        style={{ maxHeight: 40 }}
        className="w-full object-contain p-1.5"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-zinc-600 flex items-center justify-center">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-300">{name.slice(0, 2).toUpperCase()}</span>
      </div>
      <span className="text-[8px] text-gray-400 text-center leading-tight max-w-[48px] truncate">{name}</span>
    </div>
  );
}

export default function ShippingIntegrations() {
  const { toast } = useToast();
  const { data: integrations, isLoading } = useIntegrations("shipping");
  const createIntegration = useCreateIntegration();
  const deleteIntegration = useDeleteIntegration();

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [settingsProvider, setSettingsProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState(false);
  const [showSettingsSecret, setShowSettingsSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  /* ── Open Retour ─────────────────────────────────────────────── */
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

  /* ── Shipping providers ──────────────────────────────────────── */
  const connectedMap = new Map((integrations || []).map((i: any) => [i.provider, i]));

  const handleConnect = async () => {
    if (!connectingProvider) return;
    if (!formData.apiKey?.trim()) {
      toast({ title: "Champ requis", description: "Veuillez entrer la clé API", variant: "destructive" });
      return;
    }
    try {
      await createIntegration.mutateAsync({ provider: connectingProvider, type: "shipping", credentials: formData });
      toast({ title: "Connecté ✅", description: `${connectingProvider} connecté avec succès` });
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

  const connectingMeta = SHIPPING_PROVIDERS.find(p => p.id === connectingProvider);
  const settingsMeta   = SHIPPING_PROVIDERS.find(p => p.id === settingsProvider);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Home className="w-3 h-3" />
          <span>Accueil</span>
          <ChevronRight className="w-3 h-3" />
          <span>Intégrations</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-foreground">Sociétés de Livraison</span>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }} data-testid="text-shipping-title">
              SOCIÉTÉS DE LIVRAISON
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connectez vos transporteurs marocains pour expédier vos commandes COD.
            </p>
          </div>
          <button
            onClick={() => toast({ title: "Bientôt disponible", description: "L'ajout manuel de transporteur arrive prochainement." })}
            data-testid="button-add-carrier"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 transition-all shrink-0"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
          >
            <Plus className="w-4 h-4" /> Ajouter un transporteur
          </button>
        </div>
      </div>

      {/* ── SECTION: Open Retour ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Gestion des Retours</h2>
        </div>

        {orLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
        ) : (
          <Card className="relative overflow-hidden rounded-2xl border-2 transition-shadow hover:shadow-md" style={{
            borderColor: orSettings?.connected ? "rgba(197,160,89,0.4)" : "rgba(0,0,0,0.07)",
          }}>
            {orSettings?.connected && (
              <div className="absolute top-3.5 right-3.5 z-10">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-sm">
                  <CheckCircle className="w-3 h-3" /> Connecté
                </span>
              </div>
            )}
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d2a7a 100%)` }}>
                  <RotateCcw className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-lg font-bold" style={{ color: NAVY }}>Open Retour</h3>
                    <Badge className="text-[10px] font-bold border-0" style={{ background: `rgba(197,160,89,0.12)`, color: GOLD }}>Maroc</Badge>
                    <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Plateforme marocaine de gestion des retours COD. Créez des tickets de retour, tracez les colis et gérez les remboursements automatiquement.
                  </p>
                  {orSettings?.connected ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      {orSettings.clientId && (
                        <span className="text-xs text-muted-foreground">
                          Client ID: <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">{orSettings.clientId}</code>
                        </span>
                      )}
                      <button onClick={() => { setOrApiKey(""); setOrClientId(orSettings?.clientId || ""); setOrDialog(true); }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 hover:opacity-80 transition-all"
                        style={{ borderColor: GOLD, color: GOLD }} data-testid="button-or-settings">
                        <Settings className="w-3.5 h-3.5" /> Modifier
                      </button>
                      <button onClick={() => disconnectOrMutation.mutate()} disabled={disconnectOrMutation.isPending}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        data-testid="button-or-disconnect">
                        {disconnectOrMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />} Déconnecter
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setOrApiKey(""); setOrClientId(""); setOrDialog(true); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 shadow-md transition-all"
                      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }} data-testid="button-or-connect">
                      <Link2 className="w-4 h-4" /> Connecter Open Retour
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── SECTION: Shipping Carriers ───────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Transporteurs</h2>
          <span className="ml-auto text-xs text-muted-foreground">{SHIPPING_PROVIDERS.length} transporteurs disponibles</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SHIPPING_PROVIDERS.map((provider) => {
              const connected = connectedMap.get(provider.id);
              return (
                <Card
                  key={provider.id}
                  data-testid={`card-shipping-${provider.id}`}
                  className="relative overflow-hidden rounded-2xl border border-border/60 bg-white dark:bg-card shadow-sm hover:shadow-md transition-all duration-200"
                  style={{ borderColor: connected ? "rgba(16,185,129,0.35)" : undefined }}
                >
                  {/* Connected ribbon */}
                  {connected && (
                    <div className="absolute top-0 right-0 z-10 overflow-hidden w-20 h-20 pointer-events-none">
                      <div className="absolute top-3.5 -right-5 w-24 flex items-center justify-center gap-1 rotate-45 bg-emerald-500 text-white text-[9px] font-bold py-1 shadow-sm">
                        <CheckCircle className="w-2.5 h-2.5 shrink-0" /> Connecté
                      </div>
                    </div>
                  )}

                  <CardContent className="p-5 flex flex-col gap-4">
                    {/* Top row: logo + name */}
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl border border-border/40 bg-gray-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                        <ProviderLogo logo={provider.logo} name={provider.name} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[15px] leading-tight text-foreground">{provider.name}</h3>
                        <a
                          href={`#${provider.id}`}
                          onClick={e => e.preventDefault()}
                          className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
                        >
                          <Link2 className="w-3 h-3" /> {provider.name} Link
                        </a>
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{provider.cities} villes couvertes</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2">
                      {connected ? (
                        <div className="flex gap-2">
                          <button
                            data-testid={`button-settings-${provider.id}`}
                            onClick={() => { setSettingsProvider(provider.id); setFormData({}); setShowSettingsSecret(false); }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all hover:opacity-80"
                            style={{ borderColor: GOLD, color: GOLD }}
                          >
                            <Settings className="w-3.5 h-3.5" /> Paramètres
                          </button>
                          <button
                            data-testid={`button-disconnect-shipping-${provider.id}`}
                            onClick={() => handleDisconnect(connected)}
                            disabled={deleteIntegration.isPending}
                            className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                          >
                            {deleteIntegration.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <button
                          data-testid={`button-connect-shipping-${provider.id}`}
                          onClick={() => { setConnectingProvider(provider.id); setFormData({}); setShowSecret(false); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm"
                        >
                          <Link2 className="w-4 h-4" /> Connecter
                        </button>
                      )}

                      <a
                        href={provider.tutorialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-tutorial-${provider.id}`}
                        className="flex items-center justify-center gap-1.5 text-[12px] font-medium hover:opacity-80 transition-opacity py-1"
                        style={{ color: GOLD }}
                      >
                        <Video className="w-3.5 h-3.5" /> Comment connecter ?
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Open Retour Dialog ─────────────────────────────────────── */}
      <Dialog open={orDialog} onOpenChange={setOrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
              {orSettings?.connected ? "Modifier les identifiants" : "Connecter"} Open Retour
            </DialogTitle>
            <DialogDescription>
              Obtenez vos identifiants sur{" "}
              <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GOLD }}>openretour.ma</a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-semibold">Client ID</Label>
              <Input data-testid="input-or-clientId" placeholder="Votre Client ID..." value={orClientId} onChange={e => setOrClientId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">API Key (Secret)</Label>
              <div className="relative">
                <Input data-testid="input-or-apiKey" type={orShowKey ? "text" : "password"} placeholder="Votre clé API secrète..." value={orApiKey} onChange={e => setOrApiKey(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setOrShowKey(!orShowKey)}>
                  {orShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">🔒 Stockée de façon sécurisée, isolée par magasin.</p>
            </div>
            <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: `rgba(197,160,89,0.07)`, border: `1px solid rgba(197,160,89,0.2)` }}>
              <p className="font-semibold" style={{ color: GOLD }}>Comment trouver vos identifiants ?</p>
              <ol className="space-y-0.5 text-muted-foreground list-decimal list-inside">
                <li>Connectez-vous sur openretour.ma</li>
                <li>Allez dans Paramètres → API</li>
                <li>Copiez votre Client ID et générez une clé API</li>
              </ol>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOrDialog(false)} data-testid="button-or-cancel">Annuler</Button>
            <Button onClick={() => saveOrMutation.mutate()} disabled={saveOrMutation.isPending || !orApiKey.trim() || !orClientId.trim()}
              className="text-white font-bold" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }} data-testid="button-or-save">
              {saveOrMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {saveOrMutation.isPending ? "Connexion..." : "Enregistrer et connecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Shipping Connect Dialog ──────────────────────────────── */}
      <Dialog open={!!connectingProvider} onOpenChange={(open) => { if (!open) setConnectingProvider(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {connectingMeta?.logo && (
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={connectingMeta.logo} alt={connectingMeta.name} className="w-full h-full object-contain p-0.5" onError={() => {}} />
                </div>
              )}
              Connecter {connectingMeta?.name || connectingProvider}
            </DialogTitle>
            <DialogDescription>
              Entrez vos identifiants API pour ce transporteur.
              {connectingMeta?.tutorialUrl && (
                <a href={connectingMeta.tutorialUrl} target="_blank" rel="noopener noreferrer" className="ml-1 underline text-blue-500 inline-flex items-center gap-0.5">
                  <Video className="w-3 h-3" /> Voir le tutoriel
                </a>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Webhook URL */}
            {connectingProvider && (
              <div className="space-y-1.5">
                <Label className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">URL Webhook</Label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/40">
                  <code className="flex-1 text-[11px] font-mono text-foreground truncate">
                    {`https://tajergrow.com/api/webhook/${connectingProvider}/v2`}
                  </code>
                  <button
                    type="button"
                    data-testid="button-copy-webhook"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://tajergrow.com/api/webhook/${connectingProvider}/v2`);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-border/60 transition-colors"
                    title="Copier"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Collez cette URL dans les paramètres webhook du transporteur.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-semibold">Clé API</Label>
              <div className="relative">
                <Input data-testid="input-shipping-apiKey" type={showSecret ? "text" : "password"} placeholder="Votre clé API..." value={formData.apiKey || ""} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Token Secret <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
              <Input data-testid="input-shipping-apiSecret" type="password" placeholder="Token secret..." value={formData.apiSecret || ""} onChange={e => setFormData({ ...formData, apiSecret: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>URL API <span className="text-muted-foreground font-normal">(optionnelle)</span></Label>
              <Input data-testid="input-shipping-apiUrl" placeholder="https://api.transporteur.ma/v1" value={formData.apiUrl || ""} onChange={e => setFormData({ ...formData, apiUrl: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">🔒 Vos identifiants sont chiffrés et isolés par magasin.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConnectingProvider(null)} data-testid="button-cancel-shipping">Annuler</Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white font-bold" data-testid="button-confirm-shipping" onClick={handleConnect} disabled={createIntegration.isPending}>
              {createIntegration.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {createIntegration.isPending ? "Connexion..." : "Connecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Shipping Settings Dialog ─────────────────────────────── */}
      <Dialog open={!!settingsProvider} onOpenChange={(open) => { if (!open) setSettingsProvider(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {settingsMeta?.logo && (
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={settingsMeta.logo} alt={settingsMeta.name} className="w-full h-full object-contain p-0.5" onError={() => {}} />
                </div>
              )}
              Paramètres — {settingsMeta?.name || settingsProvider}
            </DialogTitle>
            <DialogDescription>Mettez à jour vos identifiants API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-semibold">Nouvelle clé API</Label>
              <div className="relative">
                <Input data-testid="input-settings-apiKey" type={showSettingsSecret ? "text" : "password"} placeholder="Nouvelle clé API..." value={formData.apiKey || ""} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSettingsSecret(!showSettingsSecret)}>
                  {showSettingsSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Token Secret <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
              <Input data-testid="input-settings-apiSecret" type="password" placeholder="Nouveau token secret..." value={formData.apiSecret || ""} onChange={e => setFormData({ ...formData, apiSecret: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSettingsProvider(null)} data-testid="button-cancel-settings">Annuler</Button>
            <Button
              data-testid="button-save-settings"
              className="text-white font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
              disabled={createIntegration.isPending}
              onClick={async () => {
                if (!settingsProvider || !formData.apiKey?.trim()) {
                  toast({ title: "Erreur", description: "Clé API requise", variant: "destructive" });
                  return;
                }
                try {
                  await createIntegration.mutateAsync({ provider: settingsProvider, type: "shipping", credentials: formData });
                  toast({ title: "Mis à jour ✅", description: "Identifiants mis à jour avec succès" });
                  setSettingsProvider(null);
                  setFormData({});
                } catch (err: any) {
                  toast({ title: "Erreur", description: err.message, variant: "destructive" });
                }
              }}
            >
              {createIntegration.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
              {createIntegration.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

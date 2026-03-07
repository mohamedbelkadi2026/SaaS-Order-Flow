import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShoppingBag, Globe, Copy, CheckCircle, Link2, Unlink, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SiShopify, SiWoocommerce, SiMagento } from "react-icons/si";
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";

const STORE_PROVIDERS = [
  {
    id: "shopify", name: "Shopify", icon: SiShopify, color: "text-[#95BF47]", bg: "bg-[#95BF47]/10",
    fields: [
      { key: "storeUrl", label: "URL de la boutique", placeholder: "monshop.myshopify.com" },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true },
      { key: "apiKey", label: "Clé API (optionnelle)", placeholder: "shpat_...", secret: true },
    ],
  },
  {
    id: "youcan", name: "YouCan", icon: ShoppingBag, color: "text-red-500", bg: "bg-red-50",
    fields: [
      { key: "storeUrl", label: "URL de la boutique", placeholder: "monshop.youcan.shop" },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "Secret...", secret: true },
    ],
  },
  {
    id: "woocommerce", name: "WooCommerce", icon: SiWoocommerce, color: "text-[#96588A]", bg: "bg-[#96588A]/10",
    fields: [
      { key: "storeUrl", label: "URL WordPress", placeholder: "monsite.com" },
      { key: "consumerKey", label: "Consumer Key", placeholder: "ck_...", secret: true },
      { key: "consumerSecret", label: "Consumer Secret", placeholder: "cs_...", secret: true },
    ],
  },
  {
    id: "gsheets", name: "Google Sheets", icon: Globe, color: "text-green-600", bg: "bg-green-50",
    fields: [
      { key: "scriptUrl", label: "URL du script Apps Script", placeholder: "https://script.google.com/..." },
    ],
  },
  {
    id: "lightfunnels", name: "LightFunnels", icon: Globe, color: "text-blue-400", bg: "bg-blue-50",
    fields: [
      { key: "storeUrl", label: "URL de la boutique", placeholder: "monshop.lightfunnels.com" },
      { key: "apiKey", label: "Clé API", placeholder: "lf_...", secret: true },
    ],
  },
  {
    id: "magento", name: "Magento", icon: SiMagento, color: "text-[#EE672F]", bg: "bg-[#EE672F]/10",
    fields: [
      { key: "storeUrl", label: "URL Magento", placeholder: "monshop.com" },
      { key: "apiKey", label: "Access Token", placeholder: "Token...", secret: true },
    ],
  },
];

export default function Integrations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: integrations, isLoading } = useIntegrations("store");
  const createIntegration = useCreateIntegration();
  const deleteIntegration = useDeleteIntegration();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const connectedProviders = new Map(
    (integrations || []).map((i: any) => [i.provider, i])
  );

  const handleConnect = async (providerId: string) => {
    const provider = STORE_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    const missingFields = provider.fields.filter(f => !formData[f.key]?.trim());
    if (missingFields.length > 0) {
      toast({ title: "Champs requis", description: `Veuillez remplir: ${missingFields.map(f => f.label).join(', ')}`, variant: "destructive" });
      return;
    }

    try {
      await createIntegration.mutateAsync({
        provider: providerId,
        type: "store",
        credentials: formData,
      });
      toast({ title: "Connecté", description: `${provider.name} connecté avec succès` });
      setConnectingProvider(null);
      setFormData({});
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur de connexion", variant: "destructive" });
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

  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-integrations-title">Intégrations Boutiques</h1>
          <p className="text-muted-foreground mt-1">Connectez vos boutiques e-commerce pour synchroniser les commandes automatiquement.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STORE_PROVIDERS.map((provider) => {
            const connected = connectedProviders.get(provider.id);
            const Icon = provider.icon;

            return (
              <Card key={provider.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow" data-testid={`card-integration-${provider.id}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", provider.bg)}>
                        <Icon className={cn("w-6 h-6", provider.color)} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{provider.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {provider.id === 'woocommerce' ? 'Sync auto toutes les 10 min' : 'Webhook temps réel'}
                        </p>
                      </div>
                    </div>
                    {connected && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" /> Connecté
                      </Badge>
                    )}
                  </div>

                  {connected && (provider.id === 'shopify' || provider.id === 'youcan') && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">URL Webhook :</p>
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] bg-background px-2 py-1 rounded border flex-1 truncate">
                          {webhookBaseUrl}/api/integrations/webhook/{provider.id}?store_id={user?.storeId}
                        </code>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          data-testid={`button-copy-webhook-${provider.id}`}
                          onClick={() => {
                            navigator.clipboard.writeText(`${webhookBaseUrl}/api/integrations/webhook/${provider.id}?store_id=${user?.storeId}`);
                            toast({ title: "Copié!", description: "URL webhook copiée" });
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {connected ? (
                      <Button
                        variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                        data-testid={`button-disconnect-${provider.id}`}
                        onClick={() => handleDisconnect(connected)}
                        disabled={deleteIntegration.isPending}
                      >
                        <Unlink className="w-4 h-4 mr-2" />
                        {deleteIntegration.isPending ? "Déconnexion..." : "Déconnecter"}
                      </Button>
                    ) : (
                      <Button
                        className="flex-1 bg-primary hover:bg-primary/90"
                        data-testid={`button-connect-${provider.id}`}
                        onClick={() => { setConnectingProvider(provider.id); setFormData({}); setShowSecrets({}); }}
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
            <DialogTitle>
              Connecter {STORE_PROVIDERS.find(p => p.id === connectingProvider)?.name}
            </DialogTitle>
            <DialogDescription>
              Entrez vos identifiants pour connecter votre boutique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {STORE_PROVIDERS.find(p => p.id === connectingProvider)?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <div className="relative">
                  <Input
                    data-testid={`input-${field.key}`}
                    type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  />
                  {field.secret && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSecrets({ ...showSecrets, [field.key]: !showSecrets[field.key] })}
                    >
                      {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConnectingProvider(null)} data-testid="button-cancel-connect">
              Annuler
            </Button>
            <Button
              data-testid="button-confirm-connect"
              onClick={() => connectingProvider && handleConnect(connectingProvider)}
              disabled={createIntegration.isPending}
            >
              {createIntegration.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {createIntegration.isPending ? "Connexion..." : "Connecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

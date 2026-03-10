import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Copy, CheckCircle, Loader2, Link2, ExternalLink, RefreshCw, X } from "lucide-react";
import { SiShopify, SiWoocommerce, SiGooglesheets } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIntegrations, useCreateIntegration, useDeleteIntegration, useWebhookKey, useVerifyConnection, useMagasins } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";

// ---- Platform definitions ----
type PlatformId = "gsheets" | "shopify" | "youcan" | "storeep" | "woocommerce" | "lightfunnels" | "magento";

interface Platform {
  id: PlatformId;
  name: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  webhookBased: boolean;
  steps?: { title: string; subtitle?: string }[];
}

const PLATFORMS: Platform[] = [
  {
    id: "gsheets", name: "Google Sheets", icon: SiGooglesheets, iconColor: "text-green-600",
    webhookBased: false,
  },
  {
    id: "shopify", name: "Shopify", icon: SiShopify, iconColor: "text-[#95BF47]",
    webhookBased: true,
    steps: [
      { title: "Se connecter à Shopify", subtitle: "Ouvrir l'admin Shopify\nLe lien s'adapte après choix du magasin." },
      { title: "Paramètres → Notifications → Webhooks" },
      { title: "Créer un webhook" },
      { title: "Enregistrer" },
      { title: "Vidéo courte (optionnel)" },
    ],
  },
  {
    id: "youcan", name: "YouCan", icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ), iconColor: "text-red-600",
    webhookBased: false,
  },
  {
    id: "storeep", name: "Storeep", icon: () => (
      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">S</div>
    ), iconColor: "text-blue-600",
    webhookBased: true,
    steps: [
      { title: "Se connecter à Storeep", subtitle: "Ouvrir l'admin Storeep\nLe lien s'adapte après choix du magasin." },
      { title: "Storeep → Réglages → Webhooks" },
      { title: "Ajouter un nouveau webhook" },
      { title: "Enregistrer" },
      { title: "Vidéo courte (optionnel)" },
    ],
  },
  {
    id: "woocommerce", name: "WooCommerce", icon: SiWoocommerce, iconColor: "text-[#96588A]",
    webhookBased: true,
    steps: [
      { title: "Se connecter à WooCommerce", subtitle: "Ouvrir l'admin WooCommerce\nLe lien s'adapte après choix du magasin." },
      { title: "WooCommerce → Paramètres → Avancé → Webhooks" },
      { title: "Créer un webhook" },
      { title: "Enregistrer" },
      { title: "Vidéo courte (optionnel)" },
    ],
  },
  {
    id: "lightfunnels", name: "lightfunnels", icon: () => (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ), iconColor: "text-blue-400",
    webhookBased: true,
    steps: [
      { title: "Se connecter à Lightfunnels", subtitle: "Ouvrir l'admin Lightfunnels\nLe lien s'adapte après choix du magasin." },
      { title: "Lightfunnels → Paramètres → Avancé → Webhooks" },
      { title: "Créer un webhook" },
      { title: "Enregistrer" },
      { title: "Vidéo courte (optionnel)" },
    ],
  },
  {
    id: "magento", name: "Magento", icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#EE672F]"><path d="M12 2L2 7.5v9L12 22l10-5.5v-9L12 2zm0 2.3l7.5 4.1v7.2L12 19.7l-7.5-4.1V8.4L12 4.3z"/></svg>
    ), iconColor: "text-[#EE672F]",
    webhookBased: true,
    steps: [
      { title: "Se connecter à Magento", subtitle: "Ouvrir l'admin Magento" },
      { title: "Système → Webhooks" },
      { title: "Créer un webhook" },
      { title: "Enregistrer" },
      { title: "Vidéo courte (optionnel)" },
    ],
  },
];

function TabIcon({ platform, size = "sm" }: { platform: Platform; size?: "sm" | "lg" }) {
  const Icon = platform.icon;
  const s = size === "lg" ? "w-8 h-8" : "w-4 h-4";
  return <Icon className={cn(s, platform.iconColor)} />;
}

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copié !", description: "Contenu copié dans le presse-papier" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5 border-gray-300">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </Button>
  );
}

function StoreSelector({ stores, value, onChange }: { stores: any[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-6">
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase">Magasin</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4 mt-5">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox defaultChecked /> Can Open
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox /> Ramassage
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox /> Stock
        </label>
      </div>
    </div>
  );
}

function WebhookUrlBox({ url }: { url: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">URL du Webhook</Label>
      <div className="flex gap-2">
        <Input value={url} readOnly className="font-mono text-xs bg-gray-50 flex-1" />
        <CopyButton text={url} label="Copier" />
      </div>
      <p className="text-xs text-muted-foreground">Collez cette URL dans {" "}
        <span className="font-medium">{"plateforme"} → Webhooks</span>.
      </p>
    </div>
  );
}

function StepsList({ steps }: { steps: { title: string; subtitle?: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-blue-600">Étapes pour ajouter ce webhook :</p>
      <p className="text-xs text-muted-foreground">5 étapes courtes</p>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-blue-300 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0 mt-0.5">{i + 1}</div>
            <div>
              <p className="text-sm font-semibold">{step.title}</p>
              {step.subtitle && step.subtitle.split('\n').map((line, li) => (
                <p key={li} className={cn("text-xs", li === 0 ? "text-blue-500 font-medium" : "text-muted-foreground")}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Google Sheets Tab ---
function GoogleSheetsTab({ webhookKey, origin }: { webhookKey: string; origin: string }) {
  const { toast } = useToast();
  const [understood, setUnderstood] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const verify = useVerifyConnection();
  const createIntegration = useCreateIntegration();

  const webhookUrl = `${origin}/api/webhooks/gsheets/${webhookKey}`;
  const appScript = `// TajerGrow - Google Sheets Integration Script
// Copiez ce script dans Apps Script et exécutez-le

const WEBHOOK_URL = "${webhookUrl}";

function onFormSubmit(e) {
  const row = e.values;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const data = {};
  headers.forEach((header, index) => {
    data[header] = row[index] || '';
  });

  // Map your column headers to our API fields:
  const payload = {
    name: data['Nom'] || data['name'] || '',
    phone: data['Téléphone'] || data['phone'] || '',
    city: data['Ville'] || data['city'] || '',
    address: data['Adresse'] || data['address'] || '',
    product: data['Produit'] || data['product'] || '',
    price: data['Prix'] || data['price'] || '0',
    ref: 'GS-' + Date.now()
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log('TajerGrow Response: ' + response.getContentText());
  } catch (error) {
    Logger.log('TajerGrow Error: ' + error.toString());
  }
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(appScript);
    toast({ title: "Script copié !", description: "Collez-le dans Apps Script" });
  };

  const handleVerify = async () => {
    const result = await verify.mutateAsync("gsheets");
    setVerifyResult(result);
    if (result.hasActivity) {
      toast({ title: "Connexion vérifiée !", description: `${result.logsCount} log(s) trouvé(s)` });
    } else {
      toast({ title: "Aucune activité", description: "Exécutez le script dans Google Sheets pour tester", variant: "default" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-card rounded-2xl border shadow-sm p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-center mb-1">Guide d'intégration avec Google Sheets</h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-blue-600">Étapes :</p>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              { text: "Ouvrez votre ", link: "compte Google Sheets", rest: "." },
              { text: "Allez dans Extensions > 🎉 Apps Script." },
              { text: "Cliquez sur le bouton ci-dessous pour copier le script." },
              { text: "Collez le script dans l'éditeur Apps Script." },
              { text: "Enregistrez le script et exécutez le code." },
              { text: "Accordez les autorisations à l'application pour accéder à vos données." },
            ].map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-blue-500 font-bold shrink-0">{i + 1}.</span>
                <span>
                  {step.text}
                  {step.link && <a href="#" className="text-blue-500 underline">{step.link}</a>}
                  {step.rest}
                </span>
              </li>
            ))}
          </ol>
          <a href="#" className="text-sm text-blue-500 underline block">Démo : Comment intégrer Google Sheets avec notre application</a>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Votre URL webhook unique :</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs bg-gray-50" />
            <CopyButton text={webhookUrl} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button onClick={copyScript} className="bg-blue-600 hover:bg-blue-700 text-white px-6">
            <Copy className="w-4 h-4 mr-2" /> Copy Code
          </Button>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox checked={understood} onCheckedChange={v => setUnderstood(!!v)} />
            I understand the steps
          </label>
        </div>

        {verifyResult && (
          <div className={cn("p-3 rounded-lg text-sm", verifyResult.hasActivity ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>
            {verifyResult.hasActivity ? `✓ Connexion active — ${verifyResult.logsCount} événement(s)` : "⚠ Aucune activité détectée. Assurez-vous d'avoir exécuté le script."}
          </div>
        )}

        <Button
          onClick={handleVerify}
          disabled={verify.isPending}
          className="w-full bg-[#4CAF82] hover:bg-[#3d9e72] text-white h-12 text-base font-semibold"
        >
          {verify.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Verify Connection
        </Button>
      </div>
    </div>
  );
}

// --- YouCan Tab ---
function YouCanTab() {
  const { toast } = useToast();
  const createIntegration = useCreateIntegration();
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState("");

  const handleConnect = async () => {
    if (!token.trim()) { toast({ title: "Token requis", variant: "destructive" }); return; }
    try {
      await createIntegration.mutateAsync({ provider: "youcan", type: "store", credentials: { apiToken: token } });
      toast({ title: "YouCan connecté !", description: "Votre boutique est maintenant synchronisée" });
      setTokenOpen(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white dark:bg-card rounded-2xl border-2 border-dashed border-blue-200 shadow-sm p-10 text-center space-y-6">
        <div className="w-16 h-16 rounded-full border-2 border-blue-200 flex items-center justify-center mx-auto">
          <Link2 className="w-8 h-8 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Connectez votre boutique Youcan</h2>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 bg-green-600 rounded text-white text-xs flex items-center justify-center font-bold">G</div>
            <span className="text-muted-foreground">×</span>
            <div className="w-6 h-6 bg-red-600 rounded text-white text-xs flex items-center justify-center font-bold">Y</div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vous n'avez pas encore connecté votre boutique Youcan à Garean. En quelques clics, activez l'intégration pour commencer à synchroniser vos produits, commandes et clients.
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground text-left">
          Une fois connecté, vous pourrez automatiser vos tâches e-commerce et gérer vos ventes directement depuis Garean.
        </div>
        <Button onClick={() => setTokenOpen(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 font-semibold gap-2">
          <Link2 className="w-4 h-4" /> Connecter ma boutique Youcan
        </Button>
        <div>
          <a href="#" className="text-sm text-muted-foreground underline">En savoir plus sur l'intégration</a>
        </div>
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Non connecté</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Données non synchronisées</span>
        </div>
      </div>

      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogTitle>Connecter YouCan</DialogTitle>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Entrez votre token API YouCan pour synchroniser vos commandes.</p>
            <div className="space-y-1.5">
              <Label>Token API YouCan</Label>
              <Input value={token} onChange={e => setToken(e.target.value)} placeholder="yc_live_..." type="password" />
            </div>
            <a href="https://youcan.shop" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
              Trouver mon token YouCan <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setTokenOpen(false)}>Annuler</Button>
            <Button onClick={handleConnect} disabled={createIntegration.isPending} className="bg-blue-600 hover:bg-blue-700">
              {createIntegration.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Connecter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Webhook-based integration tab ---
function WebhookTab({ platform, webhookKey, stores, origin }: { platform: Platform; webhookKey: string; stores: any[]; origin: string }) {
  const { toast } = useToast();
  const verify = useVerifyConnection();
  const { data: integrations } = useIntegrations("store");
  const createIntegration = useCreateIntegration();
  const deleteIntegration = useDeleteIntegration();

  const [selectedStore, setSelectedStore] = useState(stores[0] ? String(stores[0].id) : "");
  const [agreed, setAgreed] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const integration = (integrations || []).find((i: any) => i.provider === platform.id);
  const webhookUrl = `${origin}/api/webhooks/${platform.id}/order/${webhookKey}`;

  const handleVerify = async () => {
    if (!agreed) {
      toast({ title: "Veuillez confirmer", description: "Cochez la case pour confirmer la configuration", variant: "destructive" });
      return;
    }
    // Save integration if not already saved
    if (!integration) {
      try {
        await createIntegration.mutateAsync({ provider: platform.id, type: "store", credentials: { webhookUrl } });
      } catch {}
    }
    const result = await verify.mutateAsync(platform.id);
    setVerifyResult(result);
    if (result.hasActivity) {
      toast({ title: "Connexion vérifiée !", description: "Des événements ont été reçus" });
    } else {
      toast({ title: "En attente", description: "Configurez le webhook dans votre plateforme et renvoyez un test", variant: "default" });
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="bg-white dark:bg-card rounded-2xl border shadow-sm p-7 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold">Intégrer {platform.name}</h2>
            <p className="text-sm text-muted-foreground">Configurez le webhook rapidement, sans défilement.</p>
          </div>
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Webhook: Order creation</Badge>
        </div>

        <StoreSelector stores={stores} value={selectedStore} onChange={setSelectedStore} />

        <div className="grid grid-cols-2 gap-8">
          {/* Left: Steps */}
          {platform.steps && <StepsList steps={platform.steps} />}

          {/* Right: Webhook URL + status */}
          <div className="space-y-4">
            <WebhookUrlBox url={webhookUrl} />

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={agreed} onCheckedChange={v => setAgreed(!!v)} className="mt-0.5" />
              <span className="text-sm text-muted-foreground">Je comprends les étapes et j'ai configuré le webhook.</span>
            </label>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Statut de la connexion</span>
              {verifyResult ? (
                <span className={cn("font-semibold", verifyResult.hasActivity ? "text-green-600" : "text-amber-600")}>
                  {verifyResult.hasActivity ? "✓ Vérifiée" : "En attente"}
                </span>
              ) : (
                <span className="text-muted-foreground">Non vérifiée</span>
              )}
            </div>

            {verifyResult?.lastLog && (
              <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
                <p className="font-semibold">Dernier événement :</p>
                <p className="text-muted-foreground">{verifyResult.lastLog.message}</p>
                <p className="text-muted-foreground">{new Date(verifyResult.lastLog.createdAt).toLocaleString('fr-FR')}</p>
              </div>
            )}

            <Button
              onClick={handleVerify}
              disabled={verify.isPending || createIntegration.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 font-semibold"
            >
              {(verify.isPending || createIntegration.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Vérifier la Connexion
            </Button>

            {integration && (
              <p className="text-xs text-center text-green-600 font-medium flex items-center justify-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Intégration enregistrée
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main page ----
export default function Integrations() {
  const { user } = useAuth();
  const { data: webhookData } = useWebhookKey();
  const { data: magasins } = useMagasins();
  const [activeTab, setActiveTab] = useState<PlatformId>("gsheets");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.garean.com";
  const webhookKey = webhookData?.webhookKey || "LOADING";
  const stores = magasins || [];
  const platform = PLATFORMS.find(p => p.id === activeTab)!;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-integrations-title">Intégrations</h1>
        <p className="text-muted-foreground mt-1">Connectez vos boutiques e-commerce pour synchroniser les commandes en temps réel.</p>
      </div>

      {/* Tabs */}
      <div className="border-b overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            const isActive = activeTab === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActiveTab(p.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                  isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-200"
                )}
                data-testid={`tab-${p.id}`}
              >
                <Icon className={cn("w-4 h-4", p.iconColor)} />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === "gsheets" && (
          <GoogleSheetsTab webhookKey={webhookKey} origin={origin} />
        )}
        {activeTab === "youcan" && (
          <YouCanTab />
        )}
        {platform.webhookBased && activeTab !== "gsheets" && activeTab !== "youcan" && (
          <WebhookTab platform={platform} webhookKey={webhookKey} stores={stores} origin={origin} />
        )}
      </div>
    </div>
  );
}

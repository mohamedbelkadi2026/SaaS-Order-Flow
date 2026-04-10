import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, CheckCircle, Loader2, Link2, ExternalLink, RefreshCw, Trash2, Plus, ShoppingBag } from "lucide-react";
import { SiShopify, SiWoocommerce, SiGooglesheets } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useIntegrations, useCreateIntegration, useDeleteIntegration, useWebhookKey, useVerifyConnection, useMagasins,
  useShopifyIntegrations, useCreateShopifyIntegration, useToggleShopifyIntegration, useDeleteShopifyIntegration,
} from "@/hooks/use-store-data";
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
  const [copied, setCopied] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const verify = useVerifyConnection();

  const apiUrl = `${origin}/api/integrations/google-sheets/webhook`;
  const apiKey = webhookKey;

  const appScript = `// ═══════════════════════════════════════════════════════════════
//  🚀 TajerGrow — Google Sheets Integration Script
//  Script généré automatiquement — Ne pas modifier API_URL / API_KEY
// ═══════════════════════════════════════════════════════════════

const API_URL = '${apiUrl}';
const API_KEY = '${apiKey}';

// ─── Configuration des colonnes (1 = A, 2 = B, ..., 10 = J) ───
const COL_NOM       = 1;   // A — Nom du client
const COL_TELEPHONE = 2;   // B — Téléphone
const COL_ADRESSE   = 3;   // C — Adresse
const COL_VILLE     = 4;   // D — Ville
const COL_PRODUIT   = 5;   // E — Produit
const COL_PRIX      = 6;   // F — Prix (DH)
const COL_QTY       = 7;   // G — Quantité
const COL_STATUS    = 10;  // J — Statut (vide = à envoyer, SENT = déjà envoyé)

// ─── Menu personnalisé dans Google Sheets ──────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 TajerGrow')
    .addItem('Envoyer les nouvelles commandes', 'sendOrdersToTajerGrow')
    .addToUi();
}

// ─── Envoi des nouvelles commandes ────────────────────────────
function sendOrdersToTajerGrow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Aucune commande à envoyer.');
    return;
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (let row = 2; row <= lastRow; row++) {
    const statusCell = sheet.getRange(row, COL_STATUS);
    const status = statusCell.getValue().toString().trim().toUpperCase();

    // Ignorer les lignes déjà envoyées
    if (status === 'SENT' || status === 'ENVOYÉ' || status === 'DUPLICATE') {
      skipped++;
      continue;
    }

    const nom       = sheet.getRange(row, COL_NOM).getValue().toString().trim();
    const telephone = sheet.getRange(row, COL_TELEPHONE).getValue().toString().trim();

    // Ignorer les lignes vides
    if (!nom && !telephone) continue;

    const adresse = sheet.getRange(row, COL_ADRESSE).getValue().toString().trim();
    const ville   = sheet.getRange(row, COL_VILLE).getValue().toString().trim();
    const produit = sheet.getRange(row, COL_PRODUIT).getValue().toString().trim();
    const prix    = sheet.getRange(row, COL_PRIX).getValue().toString().trim();
    const qty     = sheet.getRange(row, COL_QTY).getValue() || 1;

    const payload = {
      name:     nom,
      phone:    telephone,
      address:  adresse,
      city:     ville,
      product:  produit,
      price:    prix,
      quantity: qty.toString(),
      ref:      'GS-R' + row + '-' + Date.now()
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(API_URL, options);
      const code = response.getResponseCode();
      const body = JSON.parse(response.getContentText());

      if (code === 200 && body.success && !body.duplicate) {
        statusCell.setValue('SENT');
        statusCell.setBackground('#d4edda');
        Logger.log('✓ Ligne ' + row + ' → Commande #' + body.orderId + ' créée');
        sent++;
      } else if (body.duplicate) {
        statusCell.setValue('DUPLICATE');
        statusCell.setBackground('#fff3cd');
        Logger.log('⚠ Ligne ' + row + ' → Commande déjà existante');
        skipped++;
      } else {
        Logger.log('✗ Ligne ' + row + ' → Erreur: ' + response.getContentText());
        errors++;
      }
    } catch (e) {
      Logger.log('✗ Ligne ' + row + ' → Exception: ' + e.toString());
      errors++;
    }
  }

  const msg = sent + ' commande(s) envoyée(s)' +
    (skipped > 0 ? ', ' + skipped + ' ignorée(s)' : '') +
    (errors > 0 ? ', ' + errors + ' erreur(s)' : '') + '.';
  SpreadsheetApp.getUi().alert('🚀 TajerGrow — ' + msg);
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(appScript);
    setCopied(true);
    toast({ title: "Script copié !", description: "Collez-le dans Apps Script → Éditeur de code" });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleVerify = async () => {
    const result = await verify.mutateAsync("gsheets");
    setVerifyResult(result);
    if (result.hasActivity) {
      toast({ title: "Connexion vérifiée !", description: `${result.logsCount} événement(s) reçu(s)` });
    } else {
      toast({ title: "Aucune activité détectée", description: "Exécutez 'Envoyer les nouvelles commandes' dans votre Google Sheet." });
    }
  };

  const STEPS = [
    { icon: "1", text: "Ouvrez votre Google Sheet et allez dans", highlight: "Extensions → Apps Script" },
    { icon: "2", text: "Effacez le contenu par défaut, puis cliquez sur", highlight: "«\u00a0Copier le script\u00a0»" },
    { icon: "3", text: "Collez le script dans l'éditeur, puis cliquez sur", highlight: "Enregistrer (Ctrl+S)" },
    { icon: "4", text: "Rechargez votre Sheet — le menu", highlight: "🚀 TajerGrow apparaîtra" },
    { icon: "5", text: "Cliquez sur", highlight: "🚀 TajerGrow → Envoyer les nouvelles commandes" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header card */}
      <div className="bg-white border rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-1">
          <SiGooglesheets className="w-7 h-7 text-green-600" />
          <h2 className="text-lg font-bold">Google Sheets → TajerGrow</h2>
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200">Plug & Play</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Copiez le script ci-dessous, collez-le dans Google Apps Script et vos commandes se synchronisent automatiquement.
        </p>
      </div>

      {/* Steps */}
      <div className="bg-white border rounded-2xl shadow-sm p-6 space-y-3">
        <p className="text-sm font-semibold text-[#1e1b4b]">Étapes d'installation :</p>
        <div className="space-y-2.5">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#1e1b4b] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.icon}</div>
              <p className="text-sm text-muted-foreground">
                {s.text} <span className="font-semibold text-[#1e1b4b]">{s.highlight}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Script card */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="ml-2 text-xs font-mono text-gray-500">Code.gs — Google Apps Script</span>
          </div>
          <Button
            onClick={handleCopy}
            size="sm"
            className={cn(
              "gap-2 text-sm font-semibold px-5 h-9 transition-all",
              copied
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-[#1e1b4b] hover:bg-[#2d2a6e] text-white"
            )}
            data-testid="button-copy-script"
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copié !" : "Copier le script"}
          </Button>
        </div>
        <div className="overflow-auto max-h-80 bg-[#1e1b4b]">
          <pre className="p-5 text-xs font-mono text-green-300 leading-relaxed whitespace-pre">
            {appScript}
          </pre>
        </div>
      </div>

      {/* API credentials card */}
      <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vos identifiants (déjà inclus dans le script)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">API URL</Label>
            <div className="flex gap-2">
              <Input value={apiUrl} readOnly className="font-mono text-xs bg-gray-50 flex-1" />
              <CopyButton text={apiUrl} label="Copier" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Votre Clé API (API Key)</Label>
            <div className="flex gap-2">
              <Input value={apiKey} readOnly className="font-mono text-xs bg-gray-50 flex-1" type="password" />
              <CopyButton text={apiKey} label="Copier" />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ces valeurs sont uniques à votre compte et déjà renseignées dans le script. Ne les partagez pas.
        </p>
      </div>

      {/* Column mapping info */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-amber-800 mb-2">Structure attendue de votre Google Sheet :</p>
        <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
          {["A — Nom", "B — Téléphone", "C — Adresse", "D — Ville", "E — Produit", "F — Prix (DH)", "G — Quantité", "H — (libre)", "I — (libre)", "J — Status"].map((col, i) => (
            <div key={i} className={cn("rounded px-2 py-1.5 font-medium", col.startsWith("J") ? "bg-amber-200 text-amber-900" : "bg-white text-amber-700 border border-amber-200")}>
              {col}
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-700 mt-2">La colonne <strong>J (Status)</strong> est gérée automatiquement par le script — ne la remplissez pas manuellement.</p>
      </div>

      {/* Verify */}
      <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
        {verifyResult && (
          <div className={cn("p-3 rounded-lg text-sm font-medium", verifyResult.hasActivity ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>
            {verifyResult.hasActivity
              ? `✓ Connexion active — ${verifyResult.logsCount} commande(s) reçue(s)`
              : "⚠ Aucune activité détectée. Exécutez le script dans votre Google Sheet."}
          </div>
        )}
        <Button
          onClick={handleVerify}
          disabled={verify.isPending}
          className="w-full bg-green-600 hover:bg-green-700 text-white h-11 font-semibold gap-2"
          data-testid="button-verify-gsheets"
        >
          {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Vérifier la connexion
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

// ─── Shopify integration guide steps ────────────────────────────────────────
const SHOPIFY_STEPS = [
  { title: "Se connecter à Shopify", sub: "Ouvrir l'admin Shopify\nLe lien s'adapte après choix du magasin." },
  { title: "Paramètres → Notifications → Webhooks" },
  { title: "Créer un webhook", sub: "Coller l'URL ci-contre dans le champ URL." },
  { title: "Format : JSON — Événement : Création de commande" },
  { title: "Enregistrer & tester" },
];

// ─── Shopify multi-store tab ────────────────────────────────────────────────
function ShopifyTab({ magasins, origin }: { magasins: any[]; origin: string }) {
  const { toast } = useToast();
  const { data: integrations = [], isLoading } = useShopifyIntegrations();
  const createIntegration = useCreateShopifyIntegration();
  const toggleIntegration = useToggleShopifyIntegration();
  const deleteIntegration = useDeleteShopifyIntegration();
  // Step 1 state
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [canOpen, setCanOpen] = useState(true);
  const [ramassage, setRamassage] = useState(false);
  const [stock, setStock] = useState(false);

  // Step 2 state
  const [createdIntegration, setCreatedIntegration] = useState<any>(null);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const resetModal = () => {
    setStep(1);
    setSelectedStoreId("");
    setConnectionName("");
    setCanOpen(true);
    setRamassage(false);
    setStock(false);
    setCreatedIntegration(null);
  };

  const handleOpenModal = () => { resetModal(); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); resetModal(); };

  const handleCreate = async () => {
    if (!selectedStoreId || !connectionName.trim()) {
      toast({ title: "Champs requis", description: "Choisissez un magasin et saisissez un nom.", variant: "destructive" });
      return;
    }
    try {
      const result = await createIntegration.mutateAsync({
        storeId: Number(selectedStoreId),
        connectionName: connectionName.trim(),
        canOpen,
        ramassage,
        stock,
      } as any);
      setCreatedIntegration(result);
      setStep(2);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleConnect = () => {
    toast({ title: "Shopify connecté avec succès ✅", description: "Les commandes seront synchronisées automatiquement via votre webhook." });
    handleCloseModal();
  };

  const handleToggle = async (id: number) => {
    try { await toggleIntegration.mutateAsync(id); }
    catch (err: any) { toast({ title: "Erreur", description: err.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteIntegration.mutateAsync(id);
      toast({ title: "Supprimé" });
      setConfirmDeleteId(null);
    } catch (err: any) { toast({ title: "Erreur", description: err.message, variant: "destructive" }); }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiée !", description: "Collez-la dans Shopify → Webhooks" });
  };

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1e1b4b] flex items-center gap-2">
            <SiShopify className="w-5 h-5 text-[#95BF47]" />
            Intégrations Shopify
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connectez plusieurs boutiques Shopify à vos magasins TajerGrow.
          </p>
        </div>
        <Button
          onClick={handleOpenModal}
          className="gap-2 bg-[#1e3a8f] hover:bg-[#1e40af] text-white font-semibold h-9 px-4"
          data-testid="button-add-shopify"
        >
          <Plus className="w-4 h-4" />
          Intégrer Shopify
        </Button>
      </div>

      {/* ── Cards grid ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="bg-white border border-border/50 rounded-2xl shadow-sm p-14 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-[#95BF47]/10 flex items-center justify-center mx-auto">
            <SiShopify className="w-7 h-7 text-[#95BF47]" />
          </div>
          <p className="font-semibold text-[#1e1b4b]">Aucune intégration Shopify</p>
          <p className="text-sm text-muted-foreground">Cliquez sur «&nbsp;Intégrer Shopify&nbsp;» pour démarrer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((item: any) => {
            let creds: any = {};
            try { creds = JSON.parse(item.credentials || "{}"); } catch {}
            const isVerified = creds.verified === true;
            const isActive = item.isActive === 1;
            const webhookUrl = `${origin}/api/webhooks/shopify/order/${item.webhookKey}`;
            const shortKey = item.webhookKey ? item.webhookKey.slice(0, 14) + "…" : "—";
            return (
              <div
                key={item.id}
                className="relative bg-white border border-border/50 rounded-2xl shadow-sm overflow-hidden flex flex-col"
                data-testid={`card-shopify-${item.id}`}
              >
                {/* Ribbon */}
                {isVerified ? (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Connecté
                    </div>
                  </div>
                ) : (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-amber-400 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">
                      Non vérifié
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="p-5 flex-1 space-y-3 pt-7">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#95BF47]/10 flex items-center justify-center shrink-0">
                      <SiShopify className="w-5 h-5 text-[#95BF47]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#1e1b4b] truncate" data-testid={`text-shopify-name-${item.id}`}>
                        {item.connectionName || "Sans nom"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">Magasin : {item.storeName}</p>
                    </div>
                  </div>

                  {/* Webhook key */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unique Webhook Key</p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono bg-zinc-50 border rounded-lg px-2.5 py-1.5 flex-1 truncate text-zinc-600" data-testid={`text-shopify-key-${item.id}`}>
                        {shortKey}
                      </code>
                      <button
                        onClick={() => copyUrl(webhookUrl)}
                        className="shrink-0 p-1.5 rounded-lg border bg-white hover:bg-zinc-50 transition-colors"
                        title="Copier l'URL complète"
                        data-testid={`button-copy-shopify-${item.id}`}
                      >
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="bg-[#f8fafc] border border-border/40 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Total Commandes</span>
                    <span className="text-2xl font-bold text-[#1e3a8f]" data-testid={`text-shopify-orders-${item.id}`}>
                      {item.ordersCount ?? 0}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t px-5 py-3 flex items-center justify-between bg-zinc-50/60">
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => handleToggle(item.id)}
                      disabled={toggleIntegration.isPending}
                      data-testid={`switch-shopify-${item.id}`}
                      className="data-[state=checked]:bg-[#1e3a8f]"
                    />
                    <span className={cn("text-xs font-medium", isActive ? "text-[#1e3a8f]" : "text-muted-foreground")}>
                      {isActive ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(item.id)}
                    className="h-8 px-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
                    data-testid={`button-delete-shopify-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Setup Modal (2 steps) ─────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className={cn("rounded-2xl overflow-hidden", step === 2 ? "sm:max-w-3xl" : "sm:max-w-lg")}>
          {/* Modal header */}
          <DialogTitle className="flex items-center gap-2 text-[#1e1b4b]">
            <SiShopify className="w-5 h-5 text-[#95BF47]" />
            {step === 1 ? "Nouvelle intégration Shopify" : "Guide de configuration"}
          </DialogTitle>

          {/* ─── Step 1: Store selector + toggles ─── */}
          {step === 1 && (
            <div className="space-y-5 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Nom de la connexion</Label>
                <Input
                  value={connectionName}
                  onChange={e => setConnectionName(e.target.value)}
                  placeholder="ex: Boutique principale"
                  data-testid="input-shopify-name"
                />
              </div>

              {/* Magasin + toggles row */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Magasin</Label>
                  <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                    <SelectTrigger className="h-10" data-testid="select-shopify-store">
                      <SelectValue placeholder="Sélectionner un magasin…" />
                    </SelectTrigger>
                    <SelectContent>
                      {magasins.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-6 pt-1">
                  {[
                    { label: "Can Open", value: canOpen, set: setCanOpen },
                    { label: "Ramassage", value: ramassage, set: setRamassage },
                    { label: "Stock", value: stock, set: setStock },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={value}
                        onCheckedChange={v => set(!!v)}
                        className="data-[state=checked]:bg-[#1e3a8f] data-[state=checked]:border-[#1e3a8f]"
                      />
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Les commandes reçues via ce webhook seront enregistrées dans le magasin sélectionné.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={handleCloseModal}>Annuler</Button>
                <Button
                  onClick={handleCreate}
                  disabled={createIntegration.isPending}
                  className="bg-[#1e3a8f] hover:bg-[#1e40af] text-white font-semibold"
                  data-testid="button-confirm-shopify"
                >
                  {createIntegration.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Créer & Configurer →
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Guide + webhook URL + verify ─── */}
          {step === 2 && createdIntegration && (() => {
            const webhookUrl = `${origin}/api/webhooks/shopify/order/${createdIntegration.webhookKey}`;
            return (
              <div className="space-y-5 py-2">
                {/* Badge confirming creation */}
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Intégration active — suivez les 5 étapes ci-dessous pour connecter Shopify.
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Guide */}
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-[#1e3a8f]">Guide d'intégration</p>
                    <p className="text-xs text-muted-foreground">5 étapes courtes</p>
                    <div className="space-y-3">
                      {SHOPIFY_STEPS.map((s, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-6 h-6 rounded-full border-2 border-[#1e3a8f]/30 flex items-center justify-center text-xs font-bold text-[#1e3a8f] shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#1e1b4b]">{s.title}</p>
                            {s.sub && s.sub.split('\n').map((line, li) => (
                              <p key={li} className={cn("text-xs", li === 0 ? "text-[#1e3a8f] font-medium" : "text-muted-foreground")}>
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Webhook URL + connect */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">URL du Webhook</Label>
                      <div className="flex gap-2">
                        <Input
                          value={webhookUrl}
                          readOnly
                          className="font-mono text-xs bg-[#f8fafc] flex-1 border-border/60"
                          data-testid="input-shopify-webhook-url"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyUrl(webhookUrl)}
                          className="shrink-0 gap-1.5 border-border/60"
                          data-testid="button-copy-webhook-url"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copier
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Collez cette URL dans <span className="font-semibold">Shopify → Paramètres → Webhooks</span>, topic <span className="font-semibold">Commandes / création</span>.
                      </p>
                    </div>

                    {/* Info note */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 space-y-1">
                      <p className="text-xs font-semibold text-[#1e3a8f]">Prêt à recevoir des commandes</p>
                      <p className="text-[12px] text-blue-700 leading-relaxed">
                        Votre intégration est active. Configurez le webhook dans Shopify puis cliquez sur « Enregistrer et Connecter » pour finaliser.
                      </p>
                    </div>

                    <Button
                      onClick={handleConnect}
                      className="w-full bg-[#1e3a8f] hover:bg-[#1e40af] text-white h-10 font-semibold gap-2"
                      data-testid="button-save-connect-shopify"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Enregistrer et Connecter
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground text-xs h-8"
                      onClick={handleCloseModal}
                    >
                      Terminer plus tard
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete modal ─────────────────────────────────────── */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogTitle>Supprimer l'intégration ?</DialogTitle>
          <p className="text-sm text-muted-foreground py-2">
            Cette action est irréversible. Le webhook ne fonctionnera plus.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              disabled={deleteIntegration.isPending}
              data-testid="button-confirm-delete-shopify"
            >
              {deleteIntegration.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
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

  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.tajergrow.com";
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
        {activeTab === "shopify" && (
          <ShopifyTab magasins={stores} origin={origin} />
        )}
        {platform.webhookBased && activeTab !== "gsheets" && activeTab !== "youcan" && activeTab !== "shopify" && (
          <WebhookTab platform={platform} webhookKey={webhookKey} stores={stores} origin={origin} />
        )}
      </div>
    </div>
  );
}

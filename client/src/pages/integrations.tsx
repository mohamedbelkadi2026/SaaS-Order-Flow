import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, CheckCircle, Loader2, Link2, ExternalLink, RefreshCw, Trash2, Plus, ShoppingBag } from "lucide-react";
import { SiShopify, SiWoocommerce, SiGooglesheets } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useIntegrations, useCreateIntegration, useDeleteIntegration, useUpdateIntegration, useWebhookKey, useVerifyConnection, useMagasins,
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

  const { data: appsScriptData } = useQuery<{ script: string; apiUrl: string; apiKey: string }>({
    queryKey: ['/api/integrations/gsheets/apps-script'],
    queryFn: () => fetch('/api/integrations/gsheets/apps-script', { credentials: 'include' }).then(r => r.json()),
  });
  const scriptCode = appsScriptData?.script || '';

  const appScript = `// ═══════════════════════════════════════════════════════════════
//  🚀 TajerGrow — Google Sheets Auto-Sync Script
//  Synchronisation automatique en temps réel
//  Ne pas modifier API_URL / API_KEY
// ═══════════════════════════════════════════════════════════════

var API_URL = '${apiUrl}';
var API_KEY = '${apiKey}';
var DEBOUNCE_SECONDS = 30;
var STATUS_COLUMN_LABEL = 'TajerGrow Status';

// ─── Synonymes de colonnes (12 champs reconnus) ───────────────
var COLUMN_ALIASES = {
  name: [
    'nom', 'nom client', 'nom du client', 'nom complet', 'client',
    'fullname', 'full name', 'name', 'customer', 'customer name',
    'destinataire', 'recipient', 'الاسم', 'اسم العميل'
  ],
  phone: [
    'telephone', 'tel', 'phone', 'numero', 'numero tel', 'numero telephone',
    'gsm', 'mobile', 'whatsapp', 'mobile phone', 'cell',
    'الهاتف', 'رقم الهاتف', 'رقم'
  ],
  address: ['adresse', 'address', 'rue', 'street', 'العنوان'],
  city: ['ville', 'city', 'town', 'localite', 'المدينة'],
  product: ['produit', 'product', 'article', 'item', 'nom produit', 'product name', 'المنتج'],
  price: ['prix', 'price', 'montant', 'amount', 'total', 'tarif', 'السعر'],
  quantity: ['quantite', 'qty', 'quantity', 'qte', 'nombre', 'count', 'الكمية'],
  note: ['note', 'notes', 'comment', 'commentaire', 'remarque', 'message', 'ملاحظة'],
  offer: ['offre', 'offer', 'promo', 'promotion', 'deal', 'pack', 'عرض'],
  utmSource: ['utm source', 'source', 'utm_source', 'origine', 'مصدر'],
  utmCampaign: ['utm campaign', 'campaign', 'utm_campaign', 'campagne', 'حملة'],
  productId: ['product id', 'productid', 'sku', 'reference produit', 'ameex product id', 'معرف المنتج'],
};

// ─── Mode positionnel : ordre des colonnes pour anciens tableaux ──
// Utilisé quand les en-têtes ne sont pas reconnus.
var POSITIONAL_MAP = {
  name:        1,   // A — nom client
  phone:       2,   // B — téléphone
  city:        3,   // C — ville
  address:     4,   // D — adresse
  product:     5,   // E — produit (fallback : nom de l\\'onglet)
  price:       6,   // F — prix
  quantity:    7,   // G — quantité
  utmCampaign: 11,  // K — utm_campaign
  utmSource:   12,  // L — utm_source
  note:        13,  // M — note / tracking ref
  productId:   14,  // N — sku / product code
};

function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^no\s*label\s*/i, '')
    .replace(/^col(onne|umn)?\s*/i, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();
}

// ─── Convertit un numéro de colonne 1-based en lettre (A, B…) ─
function columnLetter(col) {
  var s = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

// ─── Détection hybride : headers d\\'abord, fallback positionnel ─
// Retourne { map, mode ('header'|'positional'), tabName, error? }
function detectColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 1) {
    return { map: {}, mode: 'empty', tabName: sheet.getName(), error: 'Onglet vide.' };
  }

  // ── Essai 1 : détection par en-têtes (ligne 1) ──────────────
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};
  var statusCol = 0;

  for (var i = 0; i < headers.length; i++) {
    var h = normalizeHeader(headers[i]);
    if (!h) continue;

    if (h.indexOf('tajergrow') >= 0 || h === 'status' || h === 'statut' ||
        h === 'orders' || h === 'order status') {
      statusCol = i + 1;
      continue;
    }

    for (var key in COLUMN_ALIASES) {
      if (headerMap[key]) continue;
      var aliases = COLUMN_ALIASES[key];
      for (var j = 0; j < aliases.length; j++) {
        if (h === normalizeHeader(aliases[j])) { headerMap[key] = i + 1; break; }
      }
    }
  }

  // Si name + phone détectés depuis les headers → mode header ──
  if (headerMap.name && headerMap.phone) {
    if (!statusCol) {
      statusCol = lastCol + 1;
      sheet.getRange(1, statusCol).setValue(STATUS_COLUMN_LABEL).setFontWeight('bold');
    }
    headerMap.status = statusCol;
    return { map: headerMap, mode: 'header', tabName: sheet.getName() };
  }

  // ── Essai 2 : mode positionnel (legacy, sans en-têtes) ──────
  var positional = {};
  for (var k in POSITIONAL_MAP) positional[k] = POSITIONAL_MAP[k];

  // Colonne status = première colonne libre après la dernière utilisée
  var maxUsed = lastCol;
  for (var k in positional) { if (positional[k] > maxUsed) maxUsed = positional[k]; }
  if (!statusCol) statusCol = maxUsed + 1;
  positional.status = statusCol;

  return { map: positional, mode: 'positional', tabName: sheet.getName() };
}

// ═══════════════════════════════════════════════════════════════
//  SETUP — Active la synchro pour les NOUVELLES commandes uniquement
//  Les commandes déjà présentes sont marquées "ANCIEN" et ignorées.
// ═══════════════════════════════════════════════════════════════
function setup() {
  var ui = SpreadsheetApp.getUi();

  var confirm = ui.alert(
    'Activer la synchronisation TajerGrow',
    '✨ Seules les NOUVELLES commandes ajoutées à partir de maintenant seront synchronisées.\\n\\n' +
    'Les commandes déjà présentes dans vos onglets seront marquées "ANCIEN" (ignorées).\\n\\n' +
    'Continuer ?',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  setupOnEditTrigger();
  setupDailyTrigger();

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = spreadsheet.getSheets();
  var report = '✅ TajerGrow — Synchronisation activée\\n\\n';
  var totalMarked = 0;

  for (var s = 0; s < allSheets.length; s++) {
    var sheet = allSheets[s];
    var detection = detectColumns(sheet);
    if (detection.error) {
      report += '• ' + sheet.getName() + ' — ⚠️ ' + detection.error + '\\n';
      continue;
    }
    var marked = markExistingRowsAsAncien(sheet, detection);
    totalMarked += marked;
    var mode = detection.mode === 'header' ? '📋' : '📐';
    report += '• ' + mode + ' ' + sheet.getName() + ' (' + marked + ' anciennes ignorées)\\n';
  }

  report += '\\n✨ ' + totalMarked + ' commandes existantes marquées "ANCIEN".\\n';
  report += 'À partir de maintenant, toute NOUVELLE ligne ajoutée sera synchronisée automatiquement (30 secondes après modification).';
  ui.alert(report);
}

// ─── Marque toutes les lignes existantes comme "ANCIEN" sans rien envoyer ──
function markExistingRowsAsAncien(sheet, detection) {
  var lastRow = sheet.getLastRow();
  var minRow = detection.mode === 'header' ? 2 : 1;
  if (lastRow < minRow) return 0;

  var marked = 0;
  for (var row = minRow; row <= lastRow; row++) {
    var statusCell = sheet.getRange(row, detection.map.status);
    var current = statusCell.getValue().toString().trim().toUpperCase();
    if (current === 'SENT' || current === 'DUPLICATE' || current === 'ANCIEN') continue;

    var hasData = false;
    if (detection.map.name && sheet.getRange(row, detection.map.name).getValue().toString().trim()) hasData = true;
    if (detection.map.phone && sheet.getRange(row, detection.map.phone).getValue().toString().trim()) hasData = true;
    if (!hasData) continue;

    statusCell.setValue('ANCIEN');
    statusCell.setBackground('#e2e3e5');
    marked++;
  }
  return marked;
}

// ─── Menu personnalisé ────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 TajerGrow')
    .addItem('▶️ Activer la synchro auto (tous les onglets)', 'setup')
    .addItem('🔄 Re-synchroniser tous les onglets', 'syncAllSheets')
    .addItem('📋 Vérifier la détection (onglet actif)', 'showDetection')
    .addItem('🩺 Tester la connexion', 'testConnection')
    .addItem('🧹 Réinitialiser les statuts (onglet actif)', 'resetActiveSheetStatuses')
    .addToUi();
}

// ─── Triggers ─────────────────────────────────────────────────
function setupOnEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onEditHandler') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditHandler')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit().create();
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyCheckHandler') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheckHandler').timeBased().atHour(10).everyDays(1).create();
}

// ─── onEdit : déclenché sur n\\'importe quel onglet ────────────
function onEditHandler(e) {
  if (!e || !e.range) return;
  var sheet = e.source.getActiveSheet();
  var detection = detectColumns(sheet);
  if (detection.error) return;

  var startRow = e.range.getRow();
  var endRow   = e.range.getLastRow();
  var minRow = detection.mode === 'header' ? 2 : 1;
  if (endRow < minRow) return;
  if (startRow < minRow) startRow = minRow;
  if (e.range.getColumn() === detection.map.status) return;

  for (var row = startRow; row <= endRow; row++) {
    queueRowForSync(sheet, detection, row);
  }
}

// ─── File d\\'attente avec debounce — clé inclut l\\'ID de l\\'onglet ─
function queueRowForSync(sheet, detection, row) {
  var statusCell = sheet.getRange(row, detection.map.status);
  var status = statusCell.getValue().toString().trim().toUpperCase();
  if (status === 'SENT' || status === 'DUPLICATE' || status === 'EN ATTENTE') return;

  statusCell.setValue('EN ATTENTE');
  statusCell.setBackground('#fff3cd');

  PropertiesService.getDocumentProperties().setProperty(
    'queue_' + sheet.getSheetId() + '_' + row,
    new Date().getTime().toString()
  );
  ScriptApp.newTrigger('processQueue').timeBased().after(DEBOUNCE_SECONDS * 1000).create();
}

// ─── Traite les lignes en attente (toutes feuilles) ───────────
function processQueue() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processQueue') {
      try { ScriptApp.deleteTrigger(t); } catch (err) {}
    }
  });

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getDocumentProperties();
  var allProps = props.getProperties();
  var nowMs = new Date().getTime();
  var debounceMs = DEBOUNCE_SECONDS * 1000;

  for (var key in allProps) {
    if (key.indexOf('queue_') !== 0) continue;
    var queuedAt = parseInt(allProps[key], 10);
    if (nowMs - queuedAt < debounceMs - 5000) continue;

    var parts = key.replace('queue_', '').split('_');
    if (parts.length !== 2) { props.deleteProperty(key); continue; }
    var sheetIdNum = parseInt(parts[0], 10);
    var row = parseInt(parts[1], 10);
    if (isNaN(sheetIdNum) || isNaN(row)) { props.deleteProperty(key); continue; }

    var targetSheet = null;
    var allSheets = spreadsheet.getSheets();
    for (var i = 0; i < allSheets.length; i++) {
      if (allSheets[i].getSheetId() === sheetIdNum) { targetSheet = allSheets[i]; break; }
    }
    if (!targetSheet) { props.deleteProperty(key); continue; }

    var detection = detectColumns(targetSheet);
    if (!detection.error) syncRow(targetSheet, detection, row);
    props.deleteProperty(key);
  }
}

// ─── Synchronisation d\\'une seule ligne ──────────────────────
function syncRow(sheet, detection, row) {
  var cols = detection.map;
  var statusCell = sheet.getRange(row, cols.status);
  var status = statusCell.getValue().toString().trim().toUpperCase();
  if (status === 'SENT' || status === 'DUPLICATE' || status === 'ANCIEN') return;

  function readCol(key) {
    if (!cols[key]) return '';
    var lastCol = sheet.getLastColumn();
    if (cols[key] > lastCol) return '';
    return sheet.getRange(row, cols[key]).getValue().toString().trim();
  }

  var nom       = readCol('name');
  var telephone = readCol('phone');

  if (!nom && !telephone) { statusCell.setValue(''); statusCell.setBackground(null); return; }
  if (!telephone) { statusCell.setValue('PHONE MANQUANT'); statusCell.setBackground('#f8d7da'); return; }

  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var qty     = readCol('quantity') || 1;

  // Si la colonne produit est vide, utiliser le nom de l\\'onglet (ex : "cofer")
  var product = readCol('product') || detection.tabName;

  var payload = {
    name:         nom,
    phone:        telephone,
    address:      readCol('address'),
    city:         readCol('city'),
    product:      product,
    price:        readCol('price'),
    quantity:     qty.toString(),
    note:         readCol('note'),
    offer:        readCol('offer'),
    utm_source:   readCol('utmSource'),
    utm_campaign: readCol('utmCampaign'),
    product_id:   readCol('productId'),
    ref:          'GS-' + sheetId.substring(0, 6) + '-' + sheet.getSheetId() + '-R' + row,
    tab_name:     detection.tabName,
  };

  try {
    var response = UrlFetchApp.fetch(API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());
    if (code === 200 && body.success && !body.duplicate) {
      statusCell.setValue('SENT');
      statusCell.setBackground('#d4edda');
      Logger.log('✓ ' + sheet.getName() + ' L' + row + ' → Commande #' + body.orderId);
    } else if (body.duplicate) {
      statusCell.setValue('DUPLICATE');
      statusCell.setBackground('#fff3cd');
    } else {
      statusCell.setValue('ERREUR');
      statusCell.setBackground('#f8d7da');
      Logger.log('✗ ' + sheet.getName() + ' L' + row + ': ' + response.getContentText());
    }
  } catch (err) {
    statusCell.setValue('ERREUR');
    statusCell.setBackground('#f8d7da');
    Logger.log('✗ ' + sheet.getName() + ' L' + row + ' exception: ' + err.toString());
  }
}

// ─── Synchroniser toutes les lignes d\\'un onglet ────────────
function syncAllRowsInSheet(sheet, detection) {
  var lastRow = sheet.getLastRow();
  var minRow = detection.mode === 'header' ? 2 : 1;
  if (lastRow < minRow) return;
  for (var row = minRow; row <= lastRow; row++) {
    syncRow(sheet, detection, row);
    Utilities.sleep(200);
  }
}

// ─── Synchroniser TOUS les onglets manuellement ──────────────
function syncAllSheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = spreadsheet.getSheets();
  var totalSynced = 0;
  for (var s = 0; s < allSheets.length; s++) {
    var detection = detectColumns(allSheets[s]);
    if (!detection.error) { syncAllRowsInSheet(allSheets[s], detection); totalSynced++; }
  }
  SpreadsheetApp.getUi().alert('✅ ' + totalSynced + ' onglet(s) re-synchronisé(s)');
}

// ─── Filet de sécurité quotidien : tous les onglets ──────────
function dailyCheckHandler() {
  var allSheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < allSheets.length; s++) {
    var sheet = allSheets[s];
    var detection = detectColumns(sheet);
    if (detection.error) continue;
    var lastRow = sheet.getLastRow();
    var minRow = detection.mode === 'header' ? 2 : 1;
    for (var row = minRow; row <= lastRow; row++) {
      var st = sheet.getRange(row, detection.map.status).getValue().toString().trim().toUpperCase();
      if (st !== 'SENT' && st !== 'DUPLICATE' && st !== 'ANCIEN') { syncRow(sheet, detection, row); Utilities.sleep(200); }
    }
  }
}

// ─── Vérifier la détection de l\\'onglet actif ────────────────
function showDetection() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var detection = detectColumns(sheet);
  if (detection.error) { SpreadsheetApp.getUi().alert('❌ ' + detection.error); return; }
  var msg = '📋 Onglet : ' + detection.tabName + '\\n';
  msg += 'Mode : ' + (detection.mode === 'header' ? 'Headers (ligne 1)' : 'Positionnel (legacy)') + '\\n\\n';
  for (var key in detection.map) {
    msg += '  • ' + key + ' → colonne ' + columnLetter(detection.map[key]) + '\\n';
  }
  if (detection.mode === 'positional') {
    msg += '\\n💡 Le nom de l\\'onglet "' + detection.tabName + '" sera utilisé comme produit si la colonne E est vide.';
  }
  SpreadsheetApp.getUi().alert(msg);
}

// ─── Test de connexion ────────────────────────────────────────
function testConnection() {
  try {
    var response = UrlFetchApp.fetch(API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': API_KEY },
      payload: JSON.stringify({ test: true, ref: 'TEST-' + new Date().getTime() }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    SpreadsheetApp.getUi().alert(
      code === 200
        ? '✅ Connexion réussie !\\n\\n' + response.getContentText()
        : '❌ Erreur HTTP ' + code + '\\n\\n' + response.getContentText()
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert('❌ Erreur réseau\\n\\n' + err.toString());
  }
}

// ─── Réinitialiser les statuts de l\\'onglet actif ────────────
function resetActiveSheetStatuses() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var detection = detectColumns(sheet);
  if (detection.error) { ui.alert('❌ ' + detection.error); return; }

  var resp = ui.alert('Réinitialiser les statuts ?',
    'Toutes les lignes de l\\'onglet "' + detection.tabName + '" seront marquées comme "à envoyer".',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var lastRow = sheet.getLastRow();
  var minRow = detection.mode === 'header' ? 2 : 1;
  if (lastRow < minRow) return;
  var range = sheet.getRange(minRow, detection.map.status, lastRow - minRow + 1, 1);
  range.clearContent();
  range.setBackground(null);
  ui.alert('✅ Statuts réinitialisés pour l\\'onglet "' + detection.tabName + '"');
}`;

  type ConnStep = 'url' | 'mapping' | 'done';
  type SheetPreview = { sheetId: string; tabs: Array<{ gid: string; title: string }>; sampleRow: string[]; sampleRows?: string[][]; columnCount: number };
  type ColMapping = Record<string, number | null>;

  const DEFAULT_COL_MAPPING: ColMapping = {
    name: 1, phone: 0, address: 3, city: 2,
    product: 4, price: 5, quantity: 6,
    note: null, utmCampaign: null, utmSource: null, productId: null,
  };

  function columnLetter(col: number): string {
    let s = '';
    let c = col;
    while (c > 0) { const rem = (c - 1) % 26; s = String.fromCharCode(65 + rem) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }

  const [sheetUrl, setSheetUrl] = useState('');
  const [connStep, setConnStep] = useState<ConnStep>('url');
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [selectedMagasin, setSelectedMagasin] = useState<string>('');
  const [colMapping, setColMapping] = useState<ColMapping>(DEFAULT_COL_MAPPING);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { data: magasins = [] } = useMagasins();

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode || appScript);
    setCopied(true);
    toast({ title: "✅ Script copié !", description: "Collez-le dans Apps Script et déployez." });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleVerify = async () => {
    const result = await verify.mutateAsync("gsheets");
    setVerifyResult(result);
    if (result.hasActivity) {
      toast({ title: "Connexion vérifiée !", description: `${result.logsCount} événement(s) reçu(s)` });
    } else {
      toast({ title: "Aucune activité détectée", description: "Exécutez la fonction 'setup' dans Apps Script pour activer la synchro auto." });
    }
  };

  const { data: gsheetsConn, refetch } = useQuery<any>({
    queryKey: ['/api/integrations/google-sheets/status'],
  });

  useEffect(() => {
    if (gsheetsConn?.connected && connStep === 'url' && !sheetUrl) {
      setConnStep('done');
    }
  }, [gsheetsConn?.connected]);

  function timeSince(dt: string | null): string {
    if (!dt) return "jamais";
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
  }

  function autoDetectMapping(sampleRows: string[][], columnCount: number): ColMapping {
    const result: ColMapping = {
      name: null, phone: null, address: null, city: null,
      product: null, price: null, quantity: null,
      note: null, utmCampaign: null, utmSource: null, productId: null,
    };
    if (!sampleRows || sampleRows.length === 0) return result;
    for (let col = 0; col < columnCount; col++) {
      const values = sampleRows.map(r => (r?.[col] || '').toString().trim()).filter(v => v);
      if (values.length === 0) continue;
      const allText = values.join(' ').toLowerCase();

      if (!result.phone && values.every(v => /^[+\d\s\-()]{8,20}$/.test(v) && v.replace(/\D/g, '').length >= 8)) {
        result.phone = col; continue;
      }
      if (!result.price && values.every(v => /^\d+([.,]\d+)?$/.test(v.replace(/\s/g, '')))) {
        const nums = values.map(v => parseFloat(v.replace(',', '.')));
        if (nums.every(n => n >= 10 && n <= 100000)) { result.price = col; continue; }
      }
      if (!result.quantity && values.every(v => /^\d{1,2}$/.test(v))) {
        const nums = values.map(v => parseInt(v, 10));
        if (nums.every(n => n >= 1 && n <= 99)) { result.quantity = col; continue; }
      }
      if (!result.name && values.every(v => /^[\p{L}\s.''-]{2,50}$/u.test(v) && !/^\d/.test(v))) {
        result.name = col; continue;
      }
      if (!result.city && values.every(v => /^[\p{L}\s]{2,30}$/u.test(v) && v.split(/\s+/).length <= 3)) {
        result.city = col; continue;
      }
      if (!result.address && values.every(v => v.length > 8 && /\d/.test(v) && /\p{L}/u.test(v))) {
        result.address = col; continue;
      }
      if (!result.utmSource && allText.match(/facebook|instagram|google|tiktok|youtube|organic|direct/)) {
        result.utmSource = col; continue;
      }
      if (!result.productId && values.every(v => /^[a-f0-9-]{20,}$/i.test(v))) {
        result.productId = col; continue;
      }
    }
    return result;
  }

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const r = await fetch('/api/integrations/google-sheets/preview-url', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetUrl }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: 'Erreur', description: data.error, variant: 'destructive' }); return; }
      setPreview(data);
      const detected = autoDetectMapping(data.sampleRows || [data.sampleRow || []], data.columnCount || 10);
      setColMapping(detected);
      setConnStep('mapping');
      const detectedCount = Object.values(detected).filter(v => v !== null).length;
      if (detectedCount > 0) {
        toast({
          title: `✨ ${detectedCount} colonne(s) détectée(s) automatiquement`,
          description: 'Vérifiez le mapping et ajustez si nécessaire.',
          duration: 5000,
        });
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const cleanMapping: Record<string, number> = {};
      for (const [k, v] of Object.entries(colMapping)) { if (v !== null) cleanMapping[k] = v; }
      const r = await fetch('/api/integrations/google-sheets/connect-url', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetUrl, magasinId: Number(selectedMagasin), columnMapping: cleanMapping, webhookUrl: webhookUrl.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: 'Erreur', description: data.error, variant: 'destructive' }); return; }
      toast({
        title: '✅ Google Sheets connecté',
        description: `Mapping enregistré. La première synchronisation démarre dans 30 secondes.`,
        duration: 8000,
      });
      setConnStep('done');
      refetch();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Déconnecter Google Sheets ? Les commandes déjà importées seront conservées.')) return;
    await fetch('/api/integrations/google-sheets/disconnect', { method: 'POST', credentials: 'include' });
    toast({ title: 'Déconnecté', description: 'Les commandes importées sont conservées.' });
    setConnStep('url');
    setSheetUrl('');
    setPreview(null);
    refetch();
  };

  const handleResync = async () => {
    setIsSyncing(true);
    try {
      const r = await fetch('/api/integrations/google-sheets/sync-now', { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (!r.ok) { toast({ title: 'Erreur sync', description: data.error, variant: 'destructive' }); }
      else { toast({ title: '✅ Sync effectuée', description: 'Les nouvelles lignes ont été importées.' }); refetch(); }
    } catch { toast({ title: 'Erreur réseau', variant: 'destructive' }); }
    finally { setIsSyncing(false); }
  };

  const handleEnterEdit = () => {
    setSheetUrl(gsheetsConn?.sheetUrl || '');
    setSelectedMagasin(gsheetsConn?.magasinId ? String(gsheetsConn.magasinId) : '');
    const existing = gsheetsConn?.columnMapping;
    setColMapping(existing ? { ...DEFAULT_COL_MAPPING, ...existing } : DEFAULT_COL_MAPPING);
    setWebhookUrl(gsheetsConn?.webhookUrl || '');
    setPreview(null);
    setConnStep('url');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white border rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-1">
          <SiGooglesheets className="w-7 h-7 text-green-600" />
          <h2 className="text-lg font-bold">Google Sheets → TajerGrow</h2>
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200">Plug & Play</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Synchronisez automatiquement vos commandes en collant simplement l'URL de votre sheet.
        </p>
      </div>

      <div className="mt-4 _tabs-removed">
          <div className="bg-white border rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-2xl">⚡</div>
              <div className="flex-1">
                <h3 className="font-bold text-base">Synchronisation automatique en 2 minutes</h3>
                <p className="text-sm text-muted-foreground">Collez un script dans votre Google Sheet — toutes les commandes existantes et futures arrivent automatiquement dans TajerGrow.</p>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>✅ Import initial automatique de toutes les lignes existantes</li>
              <li>✅ Nouvelle commande dans le sheet = nouvelle commande dans la plateforme</li>
              <li>✅ Aucune URL publique requise — votre sheet reste privé</li>
              <li>✅ Anti-doublons intégré</li>
            </ul>
            <Button onClick={() => window.location.href = '/integrations/sheets-script'} className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white">Ouvrir le guide d'intégration →</Button>
          </div>
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
  const updateIntegration = useUpdateIntegration();

  const [selectedStore, setSelectedStore] = useState(stores[0] ? String(stores[0].id) : "");
  const [agreed, setAgreed] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { setVerifyResult(null); }, [selectedStore]);

  const allProviderIntegrations = (integrations || []).filter((i: any) => i.provider === platform.id);
  const integration = allProviderIntegrations.find(
    (i: any) => String(i.magasinId) === selectedStore
  );
  const webhookUrl = `${origin}/api/webhooks/${platform.id}/order/${webhookKey}?magasin_id=${selectedStore}`;

  const isConnected = allProviderIntegrations.length > 0;
  const shouldShowForm = !isConnected || showForm;

  const handleVerify = async () => {
    if (!agreed) {
      toast({ title: "Veuillez confirmer", description: "Cochez la case pour confirmer la configuration", variant: "destructive" });
      return;
    }
    if (!integration) {
      try {
        await createIntegration.mutateAsync({ provider: platform.id, type: "store", credentials: { webhookUrl }, magasinId: Number(selectedStore) } as any);
      } catch {}
    }
    const result = await verify.mutateAsync({ provider: platform.id, magasinId: Number(selectedStore) });
    setVerifyResult(result);
    if (result.hasActivity) {
      toast({ title: "Connexion vérifiée !", description: "Des événements ont été reçus" });
      setShowForm(false);
    } else {
      toast({ title: "En attente", description: "Configurez le webhook dans votre plateforme et renvoyez un test", variant: "default" });
    }
  };

  const PlatformIcon = platform.icon;

  // ── Connected cards view ──────────────────────────────────────────────────
  if (!shouldShowForm) {
    return (
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{platform.name} — Intégrations</h2>
            <p className="text-sm text-muted-foreground">{allProviderIntegrations.length} boutique(s) connectée(s)</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-dashed"
            onClick={() => { setVerifyResult(null); setAgreed(false); setShowForm(true); }}
          >
            <Plus className="w-4 h-4" />
            Intégrer le nouveau {platform.name}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {allProviderIntegrations.map((integ: any) => {
            const magasin = stores.find((s: any) => s.id === integ.magasinId);
            const magasinName = magasin?.name || (integ.magasinId ? `Magasin #${integ.magasinId}` : "Boutique principale");
            return (
              <div key={integ.id} className="relative bg-gray-50 dark:bg-muted/40 border rounded-xl p-4 space-y-3 overflow-hidden">
                {/* Connected ribbon */}
                <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-xl rounded-tr-xl">
                  Connecté
                </div>

                {/* Header */}
                <div className="flex items-center gap-2 pr-16">
                  <PlatformIcon className={cn("w-5 h-5 shrink-0", platform.iconColor)} />
                  <span className="font-semibold text-sm truncate">{magasinName}</span>
                </div>

                {/* Webhook key snippet */}
                <p className="font-mono text-xs text-muted-foreground truncate">
                  🔗 …/order/{webhookKey}?magasin_id={integ.magasinId}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {integ.ordersCount ?? 0} commande(s)
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Toggle */}
                    <button
                      title={integ.isActive ? "Désactiver" : "Activer"}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors focus:outline-none",
                        integ.isActive ? "bg-green-400" : "bg-gray-300"
                      )}
                      onClick={() => updateIntegration.mutate({ id: integ.id, isActive: integ.isActive ? 0 : 1 })}
                    />
                    {/* Delete */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 border-red-200 text-red-500 hover:bg-red-50"
                      onClick={() => deleteIntegration.mutate(integ.id)}
                      disabled={deleteIntegration.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Setup form view ───────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl">
      {isConnected && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">Ajout d'une nouvelle connexion {platform.name}</p>
          <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
            ← Retour aux connexions
          </Button>
        </div>
      )}
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
          {platform.steps && <StepsList steps={platform.steps} />}

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

  // Fetch the canonical public URL from the backend (Railway sets RAILWAY_PUBLIC_DOMAIN).
  // Falls back to window.location.origin so it always works in dev and on custom domains.
  const { data: systemUrlData } = useQuery<{ publicUrl: string | null }>({
    queryKey: ["/api/system/public-url"],
  });
  const origin = systemUrlData?.publicUrl
    ?? (typeof window !== "undefined" ? window.location.origin : "https://www.tajergrow.com");
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

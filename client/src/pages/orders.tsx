import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFilteredOrders, useUpdateOrderStatus, useAssignAgent, useAgents, useIntegrations, useShipOrder, useUpdateOrder, useBulkAssign, useBulkShip, useStore, useOrderFollowUpLogs, useCreateFollowUpLog, useFilterOptions, useMagasins } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { OrderDetailsModal } from "@/components/order-details-modal";
import { CustomerHistoryModal } from "@/components/customer-history-modal";
import { formatCurrency, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { SourceBadge } from '@/components/source-badge';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, Pencil, Clock, Users, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Trash2, FileSpreadsheet, Headphones, BookOpen, Send, RefreshCw, SlidersHorizontal, AlertTriangle, CheckCircle2, CalendarClock, Package, PackageCheck } from "lucide-react";
import { SiWhatsapp, SiShopify } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useRoute } from "wouter";
import { DateRangePicker } from "@/components/date-range-picker";
import { useRealtime } from "@/hooks/use-realtime";
import { apiRequest } from "@/lib/queryClient";
import { validateOrdersBatch, type OrderValidationResult } from "@/lib/shipping-guard";
import { getDefaultCitiesForCarrier } from "@/lib/carrier-cities";

function cleanCustomerName(name: string): string {
  return (name || "").split(" ").map(p => p.trim()).filter(p => p !== "" && p !== "-" && p !== "–" && p !== "—").join(" ").trim();
}

const CARRIER_LOGOS: Record<string, string> = {
  digylog: '/carriers/digylog.svg',
  expresscoursier: '/carriers/expresscoursier.png',
  'express coursier': '/carriers/expresscoursier.png',
  onessta: '/carriers/onessta.svg',
  ozonexpress: '/carriers/ozonexpress.png',
  'ozon express': '/carriers/ozonexpress.png',
  ozoneexpress: '/carriers/ozonexpress.png',
  'ozone express': '/carriers/ozonexpress.png',
  ozon: '/carriers/ozonexpress.png',
  sendit: '/carriers/sendit.svg',
  ameex: '/carriers/ameex.svg',
  cathedis: '/carriers/cathidis.svg',
  cathidis: '/carriers/cathidis.svg',
  speedex: '/carriers/speedx.png',
  speedx: '/carriers/speedx.png',
  kargoexpress: '/carriers/cargo.svg',
  'kargo express': '/carriers/cargo.svg',
  cargo: '/carriers/cargo.svg',
  forcelog: '/carriers/forcelog.png',
  livo: '/carriers/ol.svg',
  ol: '/carriers/ol.svg',
  quicklivraison: '/carriers/ql.svg',
  'quick livraison': '/carriers/ql.svg',
  ql: '/carriers/ql.svg',
};

function getCarrierLogo(provider: string | null | undefined): string | null {
  if (!provider) return null;
  const key = provider.toLowerCase().replace(/\s+/g, '');
  return CARRIER_LOGOS[key] || CARRIER_LOGOS[provider.toLowerCase()] || null;
}

/**
 * Returns YYYY-MM-DD for a given Date in the Africa/Casablanca timezone.
 * Used to compare scheduled-for dates without timezone drift on the client.
 */
function casablancaDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Normalize a `scheduledFor` value (string from pg or Date) to YYYY-MM-DD. */
function scheduledForToCasablancaDateStr(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // pg `date` columns serialize as 'YYYY-MM-DD' — already shaped, no tz math needed.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return casablancaDateStr(new Date(value));
  }
  if (value instanceof Date) return casablancaDateStr(value);
  return null;
}

const STATUS_MAP: Record<string, string> = {
  nouvelles: "nouveau",
  confirme: "confirme",
  "confirme-reporte": "confirme_reporte",
  rappel: "rappel",
  injoignable: "Injoignable",
  annules: "annule_group",
  "boite-vocale": "boite vocale",
  "pas-reponse": "pas_reponse_group",
  "en-cours": "in_progress",
  suivi: "suivi_group",
  livrees: "delivered",
  refuses: "refused",
  retours: "retour_group",
};

const TITLE_MAP: Record<string, string> = {
  "": "NOUVELLES",
  confirme: "CONFIRMÉES",
  "confirme-reporte": "CONFIRMÉ REPORTÉ",
  rappel: "RAPPEL",
  injoignable: "INJOIGNABLES",
  annules: "ANNULÉES",
  "boite-vocale": "BOITE VOCALE",
  "pas-reponse": "PAS DE RÉPONSE",
  "en-cours": "EN COURS",
  suivi: "SUIVI DES COLIS",
  livrees: "LIVRÉES",
  refuses: "REFUSÉES",
  retours: "RETOURS",
};

// ── Status dropdown options (grouped: agent-set first, carrier-set below) ──
// Used by the inline status setter in the orders table row.
const STATUS_DROPDOWN_OPTIONS: { value: string; label: string; disabled?: boolean }[] = [
  // ── Agent statuses (manually set by agents) ─────────────────
  { value: 'nouveau',                       label: 'Nouveau'                    },
  { value: 'confirme',                      label: 'Confirmé'                   },
  { value: 'rappel',                        label: 'Rappel'                     },
  { value: 'Injoignable',                   label: 'Injoignable'                },
  { value: 'Annulé (fake)',                 label: 'Annulé (fake)'              },
  { value: 'Annulé (faux numéro)',          label: 'Annulé (faux numéro)'       },
  { value: 'Annulé (double)',               label: 'Annulé (double)'            },
  { value: 'boite vocale',                  label: 'Boite Vocale'               },
  { value: 'Pas de réponse 1',              label: 'Pas de réponse 1'           },
  { value: 'Pas de réponse 2',              label: 'Pas de réponse 2'           },
  { value: 'Pas de réponse 3',              label: 'Pas de réponse 3'           },
  { value: 'Pas de réponse 4',              label: 'Pas de réponse 4'           },
  { value: "Client n'a pas commandé",       label: "Client n'a pas commandé"    },
  { value: 'Produit non disponible',        label: 'Produit non disponible'     },
  { value: 'in_progress',                   label: 'En cours'                   },
  { value: 'refused',                       label: 'Refusé'                     },

  // ── Visual separator (non-selectable) ────────────────────────
  { value: '__separator_carrier__',         label: '── Transporteur ──',  disabled: true },

  // ── Carrier / Shipping statuses (set by carrier webhook) ─────
  { value: 'Attente De Ramassage',          label: 'Attente Ramassage'          },
  { value: 'expédié',                       label: 'Expédié'                    },
  { value: 'retourné',                      label: 'Retourné'                   },
  { value: 'delivered',                     label: 'Livré'                      },
  { value: 'En Voyage',                     label: 'En Voyage'                  },
  { value: 'À préparer',                    label: 'À préparer'                 },
  { value: 'Ramassé',                       label: 'Ramassé'                    },
  { value: 'En transit',                    label: 'En transit'                 },
  { value: 'Reçu',                          label: 'Reçu'                       },
  { value: 'En cours de distribution',      label: 'En cours de distribution'   },
  { value: 'Programmé',                     label: 'Programmé'                  },
  { value: 'En stock',                      label: 'En stock'                   },
  { value: 'Changer destinataire',          label: 'Changer destinataire'       },
  { value: 'En cours de réception au network', label: 'En cours de réception'  },
  { value: 'Arrivé au hub',                 label: 'Arrivé au hub'              },
  { value: 'En cours de livraison',         label: 'En cours de livraison'      },
  { value: 'Sorti pour livraison',          label: 'Sorti pour livraison'       },
  { value: 'Pris en charge',                label: 'Pris en charge'             },
  { value: 'Collecté',                      label: 'Collecté'                   },
  { value: 'Chargé',                        label: 'Chargé'                     },
  { value: 'Confirmé par livreur',          label: 'Confirmé par livreur'       },
  { value: 'Confirmé par livreur *',        label: 'Confirmé par livreur *'     },
];

const ALL_ORDER_STATUSES = [
  { value: '', label: 'Tous les statuts' },

  // ── Confirmation statuses ─────────────────────────────
  { value: 'nouveau',                       label: 'Nouveau'                    },
  { value: 'confirme',                      label: 'Confirmé'                   },
  { value: 'rappel',                        label: 'Rappel'                     },
  { value: 'Injoignable',                   label: 'Injoignable'                },
  { value: 'boite vocale',                  label: 'Boite vocale'               },
  { value: 'Pas de réponse 1',              label: 'Pas de réponse 1'           },
  { value: 'Pas de réponse 2',              label: 'Pas de réponse 2'           },
  { value: 'Pas de réponse 3',              label: 'Pas de réponse 3'           },
  { value: 'Pas de réponse 4',              label: 'Pas de réponse 4'           },
  { value: "Client n'a pas commandé",       label: "Client n'a pas commandé"    },
  { value: 'Produit non disponible',        label: 'Produit non disponible'     },
  { value: 'Annulé (fake)',                 label: 'Annulé (fake)'              },
  { value: 'Annulé (faux numéro)',          label: 'Annulé (faux numéro)'       },
  { value: 'Annulé (double)',               label: 'Annulé (double)'            },

  // ── Suivi / Livraison statuses ────────────────────────
  { value: 'Attente De Ramassage',          label: 'Attente Ramassage'          },
  { value: 'in_progress',                   label: 'En cours de livraison'      },
  { value: 'delivered',                     label: 'Livré'                      },
  { value: 'refused',                       label: 'Refusé'                     },
  { value: 'Reporté',                       label: 'Reporté'                    },
  { value: 'retourné',                      label: 'Retourné'                   },
];

const ALL_COLUMNS = [
  { key: 'code', label: 'Code', locked: false },
  { key: 'destinataire', label: 'Destinataire', locked: false },
  { key: 'telephone', label: 'Téléphone', locked: false },
  { key: 'ville', label: 'Ville', locked: false },
  { key: 'produit', label: 'Produit', locked: false },
  { key: 'boutique', label: 'Boutique', locked: false },
  { key: 'actionBy', label: 'Action By', locked: false },
  { key: 'comment', label: 'Comment', locked: false },
  { key: 'livraison', label: 'Livraison', locked: false },
  { key: 'derniereAction', label: 'Dernière action', locked: false },
  { key: 'status', label: 'Status', locked: false },
  { key: 'prix', label: 'Prix', locked: false },
  { key: 'adresse', label: 'Adresse', locked: false },
  { key: 'reference', label: 'Référence', locked: false },
  { key: 'source', label: 'Source', locked: false },
  { key: 'utmSource', label: 'UTM Source', locked: false },
  { key: 'utmCampaign', label: 'UTM Campagne', locked: false },
  { key: 'infosSupp', label: 'Infos supplémentaires', locked: false },
  { key: 'action', label: 'Action', locked: true },
] as const;

// NOTE: 'boutique' is intentionally NOT added to LEGACY_BASELINE_DEFAULTS below.
// That's how the knownDefaults bootstrap auto-appends it once for legacy
// users while still respecting any defaults they had explicitly hidden.
const DEFAULT_VISIBLE = ['code','destinataire','telephone','ville','produit','boutique','comment','livraison','derniereAction','status','prix','adresse','reference','source','action'];

const COLUMNS_KEY = 'tajergrow_columns';
// Snapshot of which defaults this browser had already "seen" the last time
// columns were reconciled. Used to tell a brand-new default column (auto-
// append it) apart from a default the user explicitly hid (don't re-add).
const KNOWN_DEFAULTS_KEY = 'tajergrow_columns_known_defaults';
// Baseline of defaults that already existed when this fix was first deployed
// (April 2026). Used ONLY for legacy users who don't yet have a
// KNOWN_DEFAULTS_KEY entry. Anything in DEFAULT_VISIBLE that is NOT in this
// baseline is treated as a brand-new column and auto-appended once. Without
// this baseline we can't distinguish "user hid this default" from "this
// default didn't exist when the user last customized". Add new keys to
// DEFAULT_VISIBLE freely going forward — do NOT update this baseline.
const LEGACY_BASELINE_DEFAULTS = ['code','destinataire','telephone','ville','produit','comment','livraison','derniereAction','status','prix','adresse','reference','source','action'];

function getStoredColumns(): string[] {
  try {
    const stored = localStorage.getItem(COLUMNS_KEY);
    if (!stored) return DEFAULT_VISIBLE;

    const parsedRaw: unknown = JSON.parse(stored);
    if (!Array.isArray(parsedRaw)) return DEFAULT_VISIBLE;
    const parsed: string[] = parsedRaw.filter((k): k is string => typeof k === 'string');

    // Read the previous "known defaults" snapshot. Anything in DEFAULT_VISIBLE
    // that wasn't in this snapshot is treated as a brand-new column added
    // since the user last customized → auto-append. Anything that WAS known
    // but is absent from `parsed` was deliberately hidden by the user → skip.
    let known: string[] = [];
    try {
      const rawKnown = localStorage.getItem(KNOWN_DEFAULTS_KEY);
      if (rawKnown) {
        const parsedKnown = JSON.parse(rawKnown);
        if (Array.isArray(parsedKnown)) {
          known = parsedKnown.filter((k): k is string => typeof k === 'string');
        }
      }
    } catch {}

    // Bootstrap for legacy users (no KNOWN_DEFAULTS_KEY yet): use the
    // hardcoded baseline of defaults that existed at deploy time, NOT the
    // user's `parsed` list. Otherwise any default the user had hidden would
    // be misclassified as "new" and re-added on next load.
    const knownSet = new Set(known.length > 0 ? known : LEGACY_BASELINE_DEFAULTS);
    const validKeys = new Set(ALL_COLUMNS.map(c => c.key));

    const merged: string[] = [];
    const seen = new Set<string>();
    // 1. Keep the user's existing order + visibility intact.
    for (const k of parsed) {
      if (validKeys.has(k) && !seen.has(k)) {
        merged.push(k);
        seen.add(k);
      }
    }
    // 2. Append only truly new defaults (in DEFAULT_VISIBLE but never seen).
    for (const col of DEFAULT_VISIBLE) {
      if (!knownSet.has(col) && !seen.has(col) && validKeys.has(col)) {
        merged.push(col);
        seen.add(col);
      }
    }

    // Persist the new "known" snapshot so future renders can distinguish
    // future-new columns from user-hidden ones. Best-effort.
    try {
      localStorage.setItem(KNOWN_DEFAULTS_KEY, JSON.stringify(DEFAULT_VISIBLE));
    } catch {}

    return merged;
  } catch {}
  return DEFAULT_VISIBLE;
}

function formatPhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/^0/, '+212');
}

function buildWhatsappLink(phone: string, order: any, template?: string | null) {
  const cleaned = formatPhone(phone).replace('+', '');
  let msg: string;
  if (template) {
    msg = template
      .replace(/\*\{Nom_Client\}\*/g, order.customerName || '')
      .replace(/\*\{Ville_Client\}\*/g, order.customerCity || '')
      .replace(/\*\{Address_Client\}\*/g, order.customerAddress || '')
      .replace(/\*\{Phone_Client\}\*/g, order.customerPhone || '')
      .replace(/\*\{Date_Commande\}\*/g, order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-MA') : '')
      .replace(/\*\{Heure\}\*/g, order.createdAt ? new Date(order.createdAt).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }) : '')
      .replace(/\*\{Nom_Produit\}\*/g, order.items?.map((i: any) => i.product?.name).filter(Boolean).join(', ') || '')
      .replace(/\*\{Transporteur\}\*/g, order.shippingProvider || '')
      .replace(/\*\{Date_Livraison\}\*/g, '');
  } else {
    msg = `Bonjour ${order.customerName}, nous vous contactons pour confirmer votre commande. Merci de nous confirmer votre adresse de livraison.`;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`;
}

function telLink(phone: string) {
  return `tel:${formatPhone(phone)}`;
}

function FollowUpLogsPanel({ orderId }: { orderId: number }) {
  const { data: logs = [], isLoading } = useOrderFollowUpLogs(orderId);
  const createLog = useCreateFollowUpLog();
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const handleSubmit = () => {
    if (!note.trim()) return;
    createLog.mutate({ orderId, note: note.trim() }, {
      onSuccess: () => { setNote(""); },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    });
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 text-primary font-bold mb-3">
        <BookOpen className="w-5 h-5" /> Journal de suivi
      </div>
      <div className="bg-white dark:bg-card rounded-xl border p-3 space-y-3 max-h-48 overflow-y-auto mb-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Aucune entrée de suivi</p>
        ) : (
          logs.map((log: any) => (
            <div key={log.id} className="flex gap-3 text-sm border-b last:border-0 pb-2">
              <div className="shrink-0 pt-0.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-3 h-3 text-primary" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-xs">{log.agentName || 'Système'}</span>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('fr-MA')}</span>
                </div>
                <p className="text-sm mt-0.5">{log.note}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Ajouter une note de suivi..."
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="flex-1 bg-white dark:bg-card"
        />
        <Button size="sm" onClick={handleSubmit} disabled={createLog.isPending || !note.trim()}>
          {createLog.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// "Tout sélectionner" fetch limit: high enough to load every order in a store's
// filtered set in one page, so cross-page selection acts on real, loaded IDs.
const SELECT_ALL_LIMIT = 100000;

export default function Orders() {
  const [, params] = useRoute("/orders/:filter");
  const filterKey = params?.filter || "";
  const urlStatus = STATUS_MAP[filterKey] || (filterKey ? filterKey : "nouveau");
  // Pages where the driver/livreur info is relevant: any carrier-flow page.
  // Once the order has been picked up by a courier, the driver phone is useful
  // everywhere downstream (chasing a delivery, asking why it bounced, etc.) —
  // not only on Suivi des Colis. Pre-handoff pages (Nouveaux, Confirmés…)
  // never have a driver, so the block stays hidden there naturally.
  const showDriverInfo = ['suivi_group', 'in_progress', 'delivered', 'refused'].includes(urlStatus);
  const { data: storeData } = useStore();
  const whatsappLink = (phone: string, order: any) => buildWhatsappLink(phone, order, storeData?.whatsappTemplate);
  const { user } = useAuth();
  const isMediaBuyer = user?.role === 'media_buyer';

  const [filters, setFilters] = useState({
    status: urlStatus,
    statusFilter: '',
    agentId: '',
    productId: '',
    city: '',
    source: '',
    utmSource: '',
    utmCampaign: '',
    dateFrom: '',
    dateTo: '',
    dateType: 'createdAt',
    search: '',
    page: 1,
    limit: 25,
  });
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const { data: magasins } = useMagasins();
  const [selectedMagasin, setSelectedMagasin] = useState<number | null>(null);

  const actualFilters = useMemo(() => ({
    ...filters,
    // statusFilter overrides tab-level urlStatus (lets user drill into a specific carrier status)
    status: filters.statusFilter || urlStatus,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    // Magasin filter MUST go to the server — otherwise we'd only filter the
    // current page (25 rows) and miss orders living on later pages.
    magasinId: selectedMagasin ?? undefined,
    // For media buyers, the backend scopes orders to their ID + UTM pattern automatically
    // Do NOT override utmSource here — it breaks deep tracking (CODE*PLATFORM) matching
  }), [filters, urlStatus, dateRange, selectedMagasin]);

  const { data, isLoading, isError, error, refetch } = useFilteredOrders(actualFilters);
  const { data: agents } = useAgents();
  const { data: filterOptions } = useFilterOptions();
  const { data: shippingIntegrations } = useIntegrations("shipping");
  const updateStatus = useUpdateOrderStatus();
  const assignAgent = useAssignAgent();
  const shipOrder = useShipOrder();
  const updateOrder = useUpdateOrder();
  const bulkAssign = useBulkAssign();
  const bulkShip = useBulkShip();
  const queryClient = useQueryClient();

  /* ── Open Retour prompt ───────────────────────────────────────── */
  const [orPrompt, setOrPrompt] = useState<{ orderId: number; orderRef: string; customerName: string } | null>(null);
  const [orPromptReason, setOrPromptReason] = useState("");
  const { data: orSettings } = useQuery<any>({
    queryKey: ["/api/open-retour/settings"],
    queryFn: () => fetch("/api/open-retour/settings", { credentials: "include" }).then(r => r.json()),
  });
  const createReturnMutation = useMutation({
    mutationFn: (orderId: number) => fetch("/api/open-retour/create-return", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, reason: orPromptReason, updateStatus: false }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Erreur Open Retour");
      return d;
    }),
    onSuccess: (data) => {
      toast({ title: "Ticket de retour créé ✅", description: `N° de retour: ${data.returnTrackingNumber}` });
      setOrPrompt(null);
    },
    onError: (e: any) => toast({ title: "Erreur Open Retour", description: e.message, variant: "destructive" }),
  });

  useRealtime(); // live order + status updates via Socket.io
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // When ON, the page-size dropdown ("Tout sélectionner") raises the fetch limit so
  // EVERY order matching the current filter is actually loaded — that way the existing
  // ID-based bulk endpoints (delete/ship/assign) operate on real, loaded IDs across all
  // "pages" instead of silently acting on only the visible page.
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<number>>(new Set());
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [customerHistoryPhone, setCustomerHistoryPhone] = useState<string | null>(null);
  const [shippingProvider, setShippingProvider] = useState<string>("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkShipModal, setShowBulkShipModal] = useState(false);
  const [assignServiceType, setAssignServiceType] = useState("confirmation");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [bulkShipProvider, setBulkShipProvider] = useState("");
  const [bulkShipAccountId, setBulkShipAccountId] = useState<number | null>(null);
  const [shipProgress, setShipProgress] = useState<{
    active: boolean; done: number; total: number; shipped: number; failed: number; provider: string;
    retries?: number;
    results?: { orderId: number; orderNumber?: string; status: 'shipped' | 'failed'; error?: string }[];
  } | null>(null);

  const [ameexShipOrderId, setAmeexShipOrderId] = useState<number | null>(null);
  const [ameexShipPending, setAmeexShipPending] = useState(false);

  // ── Pre-shipping validation state ─────────────────────────────
  const [shipValidation, setShipValidation] = useState<{
    valid: OrderValidationResult[];
    invalid: OrderValidationResult[];
    suggestOnly: OrderValidationResult[];
  } | null>(null);

  // Fetch carrier city list for the selected provider (for pre-flight validation)
  const { data: bulkCarrierData } = useQuery<{ provider: string | null; cities: string[]; isCarrierSpecific: boolean }>({
    queryKey: ["/api/carriers/cities", bulkShipProvider, selectedMagasin],
    queryFn: () =>
      bulkShipProvider
        ? fetch(`/api/carriers/cities?provider=${encodeURIComponent(bulkShipProvider)}${selectedMagasin ? `&magasin_id=${selectedMagasin}` : ''}`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve({ provider: null, cities: [], isCarrierSpecific: false }),
    enabled: !!bulkShipProvider,
    staleTime: 5 * 60 * 1000,
  });

  // Active carrier accounts — fetched from carrier_accounts table, NOT legacy storeIntegrations
  const { data: activeCarrierAccounts, isLoading: loadingCarrierAccounts } = useQuery<any[]>({
    queryKey: ["/api/shipping/active-accounts", selectedMagasin],
    queryFn: async () => {
      const magasinParam = selectedMagasin ? `?magasin_id=${selectedMagasin}` : '';
      const r1 = await fetch(`/api/shipping/active-accounts${magasinParam}`, { credentials: "include" });
      if (r1.ok) {
        const data = await r1.json();
        console.log("[DEBUG-SHIPPING]: Carriers from /api/shipping/active-accounts:", data?.length, data);
        return Array.isArray(data) ? data : [];
      }
      // Fallback for older Railway deployments
      console.warn("[DEBUG-SHIPPING]: Fallback to /api/carrier-accounts (status:", r1.status, ")");
      const r2 = await fetch("/api/carrier-accounts", { credentials: "include" });
      if (!r2.ok) return [];
      const data2 = await r2.json();
      return (Array.isArray(data2) ? data2 : []).filter(
        (a: any) => a.isActive === 1 || a.isActive === true || a.is_active === 1 || a.is_active === true
      );
    },
    enabled: showBulkShipModal || ameexShipOrderId !== null,
    staleTime: 0,
    retry: false,
  });

  const [visibleCols, setVisibleCols] = useState<string[]>(getStoredColumns);
  const [showColMenu, setShowColMenu] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showInlineFilters, setShowInlineFilters] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSingleId, setDeleteSingleId] = useState<number | null>(null);

  const deleteSingleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/orders/${id}`),
    onSuccess: (_, id) => {
      setHiddenOrderIds((prev: Set<number>) => new Set(Array.from(prev).concat(id)));
      setSelectedIds((prev: Set<number>) => { const n = new Set(Array.from(prev)); n.delete(id); return n; });
      qc.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: "Commande supprimée", description: "La commande a été supprimée définitivement." });
    },
    onError: (err: any) => toast({ title: "Erreur de suppression", description: err.message || "Une erreur s'est produite.", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/orders/bulk-delete", { orderIds: ids }),
    onSuccess: (data: any, ids) => {
      const count = data?.deleted ?? ids.length;
      setHiddenOrderIds((prev: Set<number>) => new Set(Array.from(prev).concat(ids)));
      setSelectedIds(new Set<number>());
      qc.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: `${count} commande${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''} avec succès` });
    },
    onError: (err: any) => toast({ title: "Erreur de suppression", description: err.message || "Une erreur s'est produite.", variant: "destructive" }),
  });

  const bulkMarkEcShippedMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/orders/bulk-mark-ec-shipped", { orderIds: ids }),
    onSuccess: (data: any, ids) => {
      const count = data?.updated ?? ids.length;
      setSelectedIds(new Set<number>());
      qc.invalidateQueries({ queryKey: ['/api/orders'] });
      qc.invalidateQueries({ queryKey: ['/api/orders/filtered'] });
      toast({
        title: `✅ ${count} commande${count > 1 ? 's' : ''} marquée${count > 1 ? 's' : ''} comme expédiée${count > 1 ? 's' : ''} (EC)`,
        description: "Statut → Attente De Ramassage. Le suivi sera mis à jour automatiquement par le prochain webhook Express Coursier.",
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message || "Une erreur s'est produite.", variant: "destructive" }),
  });

  function handleDeleteSingle(id: number) {
    setDeleteSingleId(id);
    setShowDeleteModal(true);
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) { toast({ title: "Sélectionnez des commandes à supprimer" }); return; }
    setDeleteSingleId(null);
    setShowDeleteModal(true);
  }

  function confirmDelete() {
    if (deleteSingleId !== null) {
      deleteSingleMutation.mutate(deleteSingleId);
    } else {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
    setShowDeleteModal(false);
    setDeleteSingleId(null);
  }

  useEffect(() => {
    localStorage.setItem('tajergrow_columns', JSON.stringify(visibleCols));
  }, [visibleCols]);

  const toggleColumn = (key: string) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const resetColumns = () => {
    setVisibleCols(DEFAULT_VISIBLE);
  };

  const isColVisible = (key: string) => visibleCols.includes(key);

  const ordersList = data?.orders || [];
  const totalOrders = data?.total || 0;
  const totalPages = Math.ceil(totalOrders / filters.limit);

  const normalizePhone = (phone: string) => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('212')) return digits.slice(3);
    if (digits.startsWith('0')) return digits.slice(1);
    return digits;
  };

  // Casablanca date strings used for "Confirmé Reporté" sorting + urgency colors.
  // Re-tick every 60s so day-boundary classification stays correct if a user
  // leaves the tab open across midnight Casablanca time.
  const [dayTick, setDayTick] = useState(() => casablancaDateStr(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const today = casablancaDateStr(new Date());
      setDayTick(prev => (prev === today ? prev : today));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const casablancaToday = dayTick;
  const casablancaTomorrow = useMemo(() => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 1);
    return casablancaDateStr(t);
  }, [dayTick]);

  const filteredOrders = useMemo(() => {
    let visible = hiddenOrderIds.size > 0 ? ordersList.filter((o: any) => !hiddenOrderIds.has(o.id)) : ordersList;
    if (showDuplicatesOnly) visible = visible.filter((o: any) => (o.duplicateCount ?? 1) > 1);
    // selectedMagasin is now applied server-side via actualFilters — no client filter here.
    const applyConfirmeReporteSort = (rows: any[]) => {
      if (urlStatus !== 'confirme_reporte') return rows;
      // Sort soonest first; rows without scheduledFor go to the end.
      return [...rows].sort((a, b) => {
        const aS = scheduledForToCasablancaDateStr(a.scheduledFor);
        const bS = scheduledForToCasablancaDateStr(b.scheduledFor);
        if (aS && bS) return aS.localeCompare(bS);
        if (aS) return -1;
        if (bS) return 1;
        return 0;
      });
    };
    if (!Object.values(colFilters).some(v => v)) return applyConfirmeReporteSort(visible);
    const colFiltered = visible.filter((o: any) => {
      if (colFilters.code && !((o as any).trackNumber || o.orderNumber || '').toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.destinataire && !o.customerName?.toLowerCase().includes(colFilters.destinataire.toLowerCase())) return false;
      if (colFilters.telephone) {
        const normalizedSearch = normalizePhone(colFilters.telephone);
        const normalizedPhone = normalizePhone(o.customerPhone || '');
        if (!normalizedPhone.includes(normalizedSearch)) return false;
      }
      if (colFilters.ville && !o.customerCity?.toLowerCase().includes(colFilters.ville.toLowerCase())) return false;
      if (colFilters.produit) {
        const allNames = [
          o.rawProductName || '',
          ...(o.items || []).map((i: any) => i.rawProductName || i.product?.name || ''),
        ].join(' ').toLowerCase();
        if (!allNames.includes(colFilters.produit.toLowerCase())) return false;
      }
      if (colFilters.actionBy) {
        const agentName = o.agent?.username || '';
        if (!agentName.toLowerCase().includes(colFilters.actionBy.toLowerCase())) return false;
      }
      if (colFilters.boutique) {
        const name = ((o as any).magasin?.name || '').toLowerCase();
        if (!name.includes(colFilters.boutique.toLowerCase())) return false;
      }
      return true;
    });
    return applyConfirmeReporteSort(colFiltered);
  }, [ordersList, colFilters, showDuplicatesOnly, hiddenOrderIds, urlStatus, dayTick]);

  /**
   * Urgency level for a Confirmé Reporté row, used both for the page banner
   * counts and the left-border color on each table row.
   *   'overdue'  → scheduledFor < today (red)
   *   'due-soon' → scheduledFor in [today, tomorrow] (amber)
   *   null       → not on this tab, no schedule, or further out
   */
  const reporteUrgency = (order: any): 'overdue' | 'due-soon' | null => {
    if (urlStatus !== 'confirme_reporte') return null;
    const s = scheduledForToCasablancaDateStr(order.scheduledFor);
    if (!s) return null;
    if (s < casablancaToday) return 'overdue';
    if (s <= casablancaTomorrow) return 'due-soon';
    return null;
  };

  // Counts for the in-page urgency banner on the Confirmé Reporté tab.
  const reporteBannerCounts = useMemo(() => {
    if (urlStatus !== 'confirme_reporte') return { overdue: 0, dueSoon: 0 };
    let overdue = 0, dueSoon = 0;
    for (const o of filteredOrders) {
      const u = reporteUrgency(o);
      if (u === 'overdue') overdue++;
      else if (u === 'due-soon') dueSoon++;
    }
    return { overdue, dueSoon };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, urlStatus, casablancaToday, casablancaTomorrow]);

  useEffect(() => {
    setSelectedIds(prev => {
      const visibleIds = new Set(filteredOrders.map((o: any) => o.id));
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size !== prev.size ? next : prev;
    });
  }, [filteredOrders]);

  useEffect(() => {
    setHiddenOrderIds(new Set());
  }, [urlStatus]);

  // ── SSE listener for real-time carrier status updates (persistent) ──
  // Listens for order_updated events broadcast by the webhook handler
  // and immediately refreshes the order list without requiring a page reload.
  useEffect(() => {
    const es = new EventSource("/api/automation/events", { withCredentials: true });

    es.addEventListener("order_updated", (e: MessageEvent) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
        queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
      } catch {}
    });

    es.addEventListener("new_order", () => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      } catch {}
    });

    es.onerror = () => { /* keep alive — reconnects automatically */ };
    return () => es.close();
  }, []);

  // ── SSE listener for real-time shipping progress ──────────────────
  useEffect(() => {
    if (!shipProgress?.active) return;
    const es = new EventSource("/api/automation/events", { withCredentials: true });
    es.addEventListener("shipping_progress", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setShipProgress(prev => prev ? {
          ...prev,
          done:    d.done    ?? prev.done,
          total:   d.total   ?? prev.total,
          shipped: d.shipped ?? prev.shipped,
          failed:  d.failed  ?? prev.failed,
          retries: d.retries ?? prev.retries,
          results: d.results ?? (prev as any).results,
          active:  !d.complete,
        } : null);
        if (d.complete) {
          es.close();
          // Invalidate order cache so the updated statuses appear immediately
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
          queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
          // If some orders were blocked (non-confirmed status), show a specific toast
          const blocked = (d.results || []).filter((r: any) => r.status === 'failed' && r.error?.includes("doit être"));
          if (blocked.length > 0) {
            toast({
              title: "Commandes non confirmées",
              description: `${blocked.length} commande(s) n'ont pas été envoyées car elles ne sont pas confirmées. Veuillez d'abord confirmer ces commandes.`,
              variant: "destructive",
            });
          }
          // Surface retry count (shown separately in progress modal badge)
          const shipped = d.shipped ?? 0;
          const failed  = d.failed  ?? 0;
          const retries = d.retries ?? 0;
          if (shipped > 0 || failed > 0) {
            toast({
              title: `${shipped} expédiée${shipped > 1 ? 's' : ''}`,
              description: retries > 0
                ? `${retries} ${retries > 1 ? 'ont nécessité' : 'a nécessité'} une seconde tentative.${failed > 0 ? ` ${failed} échec${failed > 1 ? 's' : ''}.` : ''}`
                : (failed > 0 ? `${failed} échec${failed > 1 ? 's' : ''}.` : 'Toutes les commandes traitées avec succès.'),
            });
          }
        }
      } catch {}
    });
    es.onerror = () => { /* keep alive — server may not be streaming yet */ };
    return () => es.close();
  }, [shipProgress?.active]);

  // Auto-select the only account when exactly one is connected
  useEffect(() => {
    if (!showBulkShipModal) return;
    if (activeCarrierAccounts?.length === 1 && !bulkShipAccountId) {
      const acct = activeCarrierAccounts[0];
      setBulkShipAccountId(acct.id);
      setBulkShipProvider(acct.carrierName);
    }
  }, [activeCarrierAccounts, showBulkShipModal]);

  // ── Pre-shipping validation: runs immediately with client-side city list,
  //    upgrades to server list when bulkCarrierData arrives ──
  useEffect(() => {
    if (!bulkShipProvider || !showBulkShipModal) { setShipValidation(null); return; }
    const selectedOrders = filteredOrders.filter((o: any) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) { setShipValidation(null); return; }

    const cities        = bulkCarrierData?.cities         ?? getDefaultCitiesForCarrier(bulkShipProvider);
    const isCarrierSpec = bulkCarrierData?.isCarrierSpecific
      ?? (getDefaultCitiesForCarrier(bulkShipProvider).length < 700);

    const results = validateOrdersBatch(selectedOrders, cities, isCarrierSpec);
    const invalid = results.filter(r => !r.valid);
    const suggestOnly = results.filter(r => r.valid && r.suggestedCity);
    const valid = results.filter(r => r.valid);
    setShipValidation({ valid, invalid, suggestOnly });
  }, [bulkShipProvider, bulkCarrierData, selectedIds, filteredOrders, showBulkShipModal]);

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    setEditFields({
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      customerAddress: order.customerAddress || "",
      customerCity: order.customerCity || "",
      comment: order.comment || "",
      shippingCost: ((order.shippingCost || 0) / 100).toFixed(2),
    });
  };

  const hasEdits = selectedOrder && (
    editFields.customerName !== (selectedOrder.customerName || "") ||
    editFields.customerPhone !== (selectedOrder.customerPhone || "") ||
    editFields.customerAddress !== (selectedOrder.customerAddress || "") ||
    editFields.customerCity !== (selectedOrder.customerCity || "") ||
    editFields.comment !== (selectedOrder.comment || "") ||
    editFields.shippingCost !== ((selectedOrder.shippingCost || 0) / 100).toFixed(2)
  );

  const handleSaveEdits = () => {
    if (!selectedOrder || !hasEdits) return;
    const d: any = {};
    if (editFields.customerName !== (selectedOrder.customerName || "")) d.customerName = editFields.customerName;
    if (editFields.customerPhone !== (selectedOrder.customerPhone || "")) d.customerPhone = editFields.customerPhone;
    if (editFields.customerAddress !== (selectedOrder.customerAddress || "")) d.customerAddress = editFields.customerAddress;
    if (editFields.customerCity !== (selectedOrder.customerCity || "")) d.customerCity = editFields.customerCity;
    if (editFields.comment !== (selectedOrder.comment || "")) d.comment = editFields.comment;
    const newShipping = Math.round(parseFloat(editFields.shippingCost || "0") * 100);
    if (newShipping !== (selectedOrder.shippingCost || 0)) d.shippingCost = newShipping;
    updateOrder.mutate({ id: selectedOrder.id, ...d }, {
      onSuccess: () => {
        toast({ title: "Commande mise à jour" });
        setSelectedOrder({ ...selectedOrder, ...d, ...(d.shippingCost !== undefined ? { shippingCost: d.shippingCost } : {}) });
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" }),
    });
  };

  const handleStatusChange = (id: number, status: string, order?: any) => {
    const isReturnStatus = status === "refused" || status.startsWith("annule") || status === "retourné";
    updateStatus.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: "Statut mis à jour", description: `Commande changée en ${status}` });
        // Immediately patch the cached list so the badge updates without waiting for refetch
        queryClient.setQueryData(["/api/orders/filtered", actualFilters], (old: any) => {
          if (!old) return old;
          const list: any[] = Array.isArray(old) ? old : (old.orders ?? []);
          const patched = list.map((o: any) => o.id === id ? { ...o, status } : o);
          return Array.isArray(old) ? patched : { ...old, orders: patched };
        });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder(null);
        }
        if (status !== urlStatus) {
          setHiddenOrderIds(prev => new Set([...prev, id]));
        }
        // If OR is connected and this is a refused/annulé order, show prompt
        if (isReturnStatus && orSettings?.connected) {
          const ord = order || filteredOrders?.find((o: any) => o.id === id);
          setOrPromptReason("");
          setOrPrompt({
            orderId: id,
            orderRef: ord?.orderNumber || `#${id}`,
            customerName: ord?.customerName || "",
          });
        }
      }
    });
  };

  // An order is shippable only if it's confirmed AND has no tracking number
  // yet. Already-shipped rows must be unselectable in the UI to prevent the
  // user from accidentally clicking "Expédier" twice (which would create
  // duplicate tracking numbers in the carrier system).
  const isOrderShippable = (o: any) => o?.status === 'confirme' && !o?.trackNumber;
  const shippableOrders = filteredOrders.filter(isOrderShippable);
  // Rows are only un-selectable on the Confirmées tab when not shippable
  // (a stale trackNumber means it can't be re-shipped). On every other tab
  // all displayed rows are selectable, so "select all" must target them.
  const isOrderSelectable = (o: any) => !(urlStatus === 'confirme' && !isOrderShippable(o));
  const selectableOrders = filteredOrders.filter(isOrderSelectable);

  // "Tout sélectionner": select every loaded selectable order ONCE, right after the
  // full set finishes loading. Deliberately a one-time sync (not on every data change)
  // so it never re-selects survivors after a bulk delete, nor fights manual un-ticks.
  const allModeSynced = useRef(false);
  useEffect(() => {
    if (!selectAllPages) { allModeSynced.current = false; return; }
    if (!isLoading && !allModeSynced.current) {
      allModeSynced.current = true;
      setSelectedIds(new Set(selectableOrders.map((o: any) => o.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectAllPages, isLoading, filteredOrders]);

  // If the selection is emptied while all-mode is active (header un-check, "tout
  // désélectionner", or a bulk action that clears it), exit all-mode and restore the
  // normal page size so the banner/dropdown never falsely claim "all selected".
  useEffect(() => {
    if (selectAllPages && allModeSynced.current && selectedIds.size === 0) {
      setSelectAllPages(false);
      setFilters(f => (f.limit === SELECT_ALL_LIMIT ? { ...f, limit: 25 } : f));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectAllPages]);

  // Exit "Tout sélectionner" whenever the effective filter set or tab changes — covers
  // every entry point (tab/route, magasin, product, search, dates…), including the ones
  // that bypass updateFilter. limit/page are intentionally excluded so enabling all-mode
  // (which itself raises the limit) doesn't immediately cancel itself.
  const filterSignature = `${urlStatus}|${filters.statusFilter}|${filters.search}|${filters.productId}|${filters.city}|${filters.agentId}|${filters.source}|${filters.utmSource}|${filters.utmCampaign}|${dateRange.from}|${dateRange.to}|${filters.dateType}|${selectedMagasin ?? ''}`;
  const prevFilterSignature = useRef(filterSignature);
  useEffect(() => {
    if (prevFilterSignature.current === filterSignature) return;
    prevFilterSignature.current = filterSignature;
    if (selectAllPages) {
      setSelectAllPages(false);
      setSelectedIds(new Set());
      setFilters(f => (f.limit === SELECT_ALL_LIMIT ? { ...f, limit: 25 } : f));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  const toggleSelect = (id: number) => {
    if (id == null) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    // Select / deselect every selectable row currently displayed.
    const allSelected = selectableOrders.length > 0 && selectableOrders.every((o: any) => selectedIds.has(o.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableOrders.map((o: any) => o.id)));
    }
  };

  const handleBulkAssign = () => {
    if (!assignAgentId || selectedIds.size === 0) return;
    bulkAssign.mutate({ orderIds: Array.from(selectedIds), agentId: Number(assignAgentId) }, {
      onSuccess: (data) => {
        toast({ title: "Assignation réussie", description: `${data.updated} commandes assignées` });
        setShowAssignModal(false);
        setSelectedIds(new Set());
        setAssignAgentId("");
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    });
  };

  const handleBulkShip = () => {
    if (!bulkShipProvider || selectedIds.size === 0) return;
    const orderIds = Array.from(selectedIds);
    const provider = bulkShipProvider;
    const accountId = bulkShipAccountId;

    // Close selection modal and open progress modal immediately
    setShowBulkShipModal(false);
    setShipProgress({ active: true, done: 0, total: orderIds.length, shipped: 0, failed: 0, provider });

    bulkShip.mutate({ orderIds, provider, accountId }, {
      onSuccess: (data) => {
        if (data.queued) {
          // Background processing — keep progress bar active; SSE events will
          // update the counts and set active:false when complete.
          setSelectedIds(new Set());
          setBulkShipProvider("");
          setBulkShipAccountId(null);
        } else {
          // Synchronous result (legacy) — finalize immediately
          setShipProgress(prev => prev ? {
            ...prev,
            active: false,
            shipped: data.shipped ?? prev.shipped,
            failed: data.failed ?? prev.failed,
            done: data.total ?? prev.done,
            results: data.results ?? [],
          } : null);
          setSelectedIds(new Set());
          setBulkShipProvider("");
          setBulkShipAccountId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
          queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
        }
      },
      onError: (err: any) => {
        const msg = String(err.message || "").replace(/^\d{3}:\s*/, "");
        setShipProgress(null);
        toast({ title: "Erreur d'expédition", description: msg, variant: "destructive" });
      },
    });
  };

  const updateFilter = (key: string, value: any) => {
    // Any real filter/page change exits "Tout sélectionner" and restores the normal
    // page size so we don't keep fetching the entire (now-different) result set.
    setSelectAllPages(false);
    setFilters(f => ({
      ...f,
      [key]: value,
      page: key === 'page' ? value : 1,
      limit: f.limit === SELECT_ALL_LIMIT ? 25 : f.limit,
    }));
    setSelectedIds(new Set());
  };

  // "Tout sélectionner" handler for the page-size dropdown: load every matching order
  // (raise the limit) and flag all-pages mode; the effect below selects them once loaded.
  const handlePageSizeChange = (v: string) => {
    if (v === 'all') {
      setSelectAllPages(true);
      setFilters(f => ({ ...f, limit: SELECT_ALL_LIMIT, page: 1 }));
    } else {
      setSelectAllPages(false);
      setSelectedIds(new Set());
      setFilters(f => ({ ...f, limit: Number(v), page: 1 }));
    }
  };

  const cancelSelectAllPages = () => {
    setSelectAllPages(false);
    setSelectedIds(new Set());
    setFilters(f => ({ ...f, limit: 25, page: 1 }));
  };

  const resetFilters = () => {
    setSelectAllPages(false);
    setFilters(f => ({ ...f, statusFilter: '', agentId: '', source: '', utmSource: '', utmCampaign: '', search: '', page: 1, limit: f.limit === SELECT_ALL_LIMIT ? 25 : f.limit }));
    setDateRange({ from: '', to: '' });
    setSelectedMagasin(null);
    setSelectedIds(new Set());
  };

  const hasActiveFilters = !!(filters.statusFilter || filters.agentId || filters.source || filters.utmSource || filters.utmCampaign || filters.search || dateRange.from || dateRange.to || selectedMagasin);

  const pageTitle = TITLE_MAP[filterKey] || "NOUVELLES";
  const visibleCount = visibleCols.length;
  const colSpanTotal = visibleCount + 1;

  const renderColFilter = (key: string, placeholder: string) => (
    <Input
      placeholder={placeholder}
      value={colFilters[key] || ''}
      onChange={e => setColFilters(f => ({ ...f, [key]: e.target.value }))}
      className="h-6 text-[10px] bg-white dark:bg-card border-border/50 px-1.5 mt-0.5"
      data-testid={`col-filter-${key}`}
    />
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-3 animate-pulse" data-testid="orders-loading-skeleton">
        <div className="h-8 bg-muted rounded-lg w-48" />
        <div className="h-10 bg-muted rounded-xl w-full" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-xl w-full" />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center" data-testid="orders-error-panel">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-semibold text-destructive">Impossible de charger les commandes</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as any)?.message || "Une erreur est survenue. Veuillez réessayer."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-orders">
          <RefreshCw className="h-4 w-4 mr-2" />
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-tight" data-testid="text-orders-title">{pageTitle}</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Commandes / {pageTitle}</p>
          {filters.productId && (() => {
            const product = (filterOptions?.products || []).find((p: any) => String(p.id) === filters.productId);
            if (!product) return null;
            return (
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-xs gap-1 pr-1">
                  <Package className="w-3 h-3" />
                  Produit: {product.name}
                  <button
                    onClick={() => setFilters(f => ({ ...f, productId: '', page: 1 }))}
                    className="ml-1 hover:text-red-600 transition-colors"
                    aria-label="Retirer le filtre produit"
                    data-testid="button-clear-product-filter"
                  >
                    ×
                  </button>
                </Badge>
              </div>
            );
          })()}
        </div>
        {urlStatus === 'confirme_reporte' && (reporteBannerCounts.overdue + reporteBannerCounts.dueSoon) > 0 && (
          <div
            className={cn(
              "flex items-start gap-2 px-3 py-2 rounded-lg border w-full sm:w-auto sm:max-w-md",
              reporteBannerCounts.overdue > 0
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
            )}
            data-testid="banner-confirme-reporte-urgency"
          >
            <CalendarClock
              className={cn(
                "w-4 h-4 mt-0.5 shrink-0",
                reporteBannerCounts.overdue > 0 ? "text-red-600" : "text-amber-600",
              )}
            />
            <div className="text-xs leading-tight">
              {reporteBannerCounts.overdue > 0 && (
                <div className="font-semibold text-red-900 dark:text-red-200" data-testid="text-banner-overdue">
                  {reporteBannerCounts.overdue} en retard — à rappeler immédiatement
                </div>
              )}
              {reporteBannerCounts.dueSoon > 0 && (
                <div className="font-semibold text-amber-900 dark:text-amber-200" data-testid="text-banner-due-soon">
                  {reporteBannerCounts.dueSoon} à reconfirmer aujourd'hui ou demain
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMediaBuyer && selectedIds.size > 0 && (
            <Badge variant="secondary" className="text-xs mr-1" data-testid="badge-selected-count">{selectedIds.size} sélectionnée(s)</Badge>
          )}
          {!isMediaBuyer && (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9 border-blue-200 text-blue-500 hover:bg-blue-50" title="Assigner" onClick={() => { if (selectedIds.size > 0) setShowAssignModal(true); else toast({ title: "Sélectionnez des commandes" }); }} data-testid="button-bulk-assign">
                <Headphones className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`h-9 w-9 border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all ${selectedIds.size === 0 ? 'opacity-40' : 'opacity-100 hover:border-red-400'}`}
                title={selectedIds.size > 0 ? `Supprimer ${selectedIds.size} commande(s)` : "Sélectionnez des commandes"}
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
                data-testid="button-bulk-delete"
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 border-green-200 text-green-600 hover:bg-green-50" title="Expédier" onClick={() => { if (selectedIds.size > 0) setShowBulkShipModal(true); else toast({ title: "Sélectionnez des commandes" }); }} data-testid="button-bulk-ship">
                <Truck className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`h-9 w-9 border-orange-200 text-orange-500 hover:bg-orange-50 active:scale-95 transition-all ${selectedIds.size === 0 ? 'opacity-40' : 'opacity-100 hover:border-orange-400'}`}
                title={selectedIds.size > 0 ? `Marquer ${selectedIds.size} commande(s) comme expédiée(s) via Express Coursier (sans passer par la plateforme)` : "Sélectionnez des commandes"}
                onClick={() => {
                  if (selectedIds.size === 0) { toast({ title: "Sélectionnez des commandes" }); return; }
                  bulkMarkEcShippedMutation.mutate(Array.from(selectedIds));
                }}
                disabled={selectedIds.size === 0 || bulkMarkEcShippedMutation.isPending}
                data-testid="button-bulk-mark-ec-shipped"
              >
                {bulkMarkEcShippedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 border-emerald-200 text-emerald-600 hover:bg-emerald-50 opacity-50 cursor-not-allowed" title="Exporter (bientôt)" disabled data-testid="button-export">
                <FileSpreadsheet className="w-4 h-4" />
              </Button>
            </>
          )}
          <Popover open={showColMenu} onOpenChange={setShowColMenu}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-gray-300 text-gray-600 hover:bg-gray-50" title="Colonnes" data-testid="button-columns-menu">
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end" data-testid="popover-columns">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-primary">Colonnes visibles</span>
                <button onClick={resetColumns} className="text-muted-foreground hover:text-foreground" title="Réinitialiser" data-testid="button-reset-columns">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={visibleCols.includes(col.key)}
                      onCheckedChange={() => !col.locked && toggleColumn(col.key)}
                      disabled={col.locked}
                      data-testid={`col-toggle-${col.key}`}
                    />
                    <span className={col.locked ? 'text-muted-foreground' : ''}>{col.label}</span>
                    {col.locked && <span className="text-[10px] text-muted-foreground">🔒</span>}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card className="rounded-xl border border-border/60 shadow-sm bg-card" data-testid="card-orders-filter-bar">
        <div className="px-4 py-3 flex flex-wrap items-end gap-3">

          {/* ── Menu (page size) ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Menu</span>
            <Select value={selectAllPages ? "all" : String(filters.limit)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[72px] h-9 text-xs bg-background border-border/60" data-testid="filter-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectSeparator />
                <SelectItem value="all" className="text-blue-600 font-semibold" data-testid="filter-select-all-pages">☑️ Tout sélectionner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Rechercher ── */}
          <div className="flex flex-col min-w-[180px] flex-1 max-w-[260px]">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Rechercher</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                data-testid="input-search-orders"
                placeholder="Nom, tél, référence..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="pl-8 h-9 text-xs bg-background border-border/60 w-full"
              />
            </div>
          </div>

          {/* ── Type service (source) ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Type service</span>
            <Select value={filters.source || 'all'} onValueChange={(v) => updateFilter('source', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[130px]" data-testid="filter-source">
                <SelectValue placeholder="Toutes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sources</SelectItem>
                <SelectItem value="manual">Manuel</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="youcan">YouCan</SelectItem>
                <SelectItem value="woocommerce">WooCommerce</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Magasin ── */}
          {Array.isArray(magasins) && magasins.length > 1 && (
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Magasin</span>
              <Select value={selectedMagasin ? String(selectedMagasin) : 'all'} onValueChange={(v) => {
                setSelectedMagasin(v === 'all' ? null : Number(v));
                // Reset pagination — otherwise switching magasins while on page 4
                // can show "no results" if the new magasin has fewer pages.
                setFilters(f => ({ ...f, page: 1 }));
              }}>
                <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[140px]" data-testid="filter-magasin">
                  <SelectValue placeholder="Tous les Magasins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les Magasins</SelectItem>
                  {magasins.map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)} data-testid={`filter-magasin-${m.id}`}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Produit ── */}
          {(filterOptions?.products || []).length > 0 && (
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Produit</span>
              <Select
                value={filters.productId || 'all'}
                onValueChange={(v) => setFilters(f => ({ ...f, productId: v === 'all' ? '' : v, page: 1 }))}
              >
                <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[160px]" data-testid="filter-product">
                  <SelectValue placeholder="Tous les Produits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les Produits</SelectItem>
                  {(filterOptions?.products || []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} data-testid={`filter-product-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Équipe ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Équipe</span>
            <Select value={filters.agentId || 'all'} onValueChange={(v) => updateFilter('agentId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[140px]" data-testid="filter-equipe">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute l'équipe</SelectItem>
                {agents?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Statut ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Statut</span>
            <Select value={filters.statusFilter || 'all'} onValueChange={(v) => updateFilter('statusFilter', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[160px]" data-testid="filter-status">
                <SelectValue placeholder="Tous statuts" />
              </SelectTrigger>
              <SelectContent>
                {ALL_ORDER_STATUSES.map(s => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── UTM / Media buyer ── */}
          {isMediaBuyer ? (
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Code buyer</span>
              <div className="flex items-center gap-1.5 px-2.5 h-9 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 font-mono text-[11px] h-5">{user?.buyerCode}</Badge>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">UTM Source</span>
                <Select value={filters.utmSource || 'all'} onValueChange={(v) => updateFilter('utmSource', v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[130px]" data-testid="filter-utm-source">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">UTM Source</SelectItem>
                    {filterOptions?.utmSources?.map((s: string) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Campagne</span>
                <Select value={filters.utmCampaign || 'all'} onValueChange={(v) => updateFilter('utmCampaign', v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[140px]" data-testid="filter-utm-campaign">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">UTM Campagne</SelectItem>
                    {filterOptions?.utmCampaigns?.map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Date ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Date</span>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="Toutes les dates"
            />
          </div>

          {/* ── Type date ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Type date</span>
            <Select value={filters.dateType} onValueChange={(v) => updateFilter('dateType', v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[155px]" data-testid="filter-date-type">
                <SelectValue placeholder="Type date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Date de création</SelectItem>
                <SelectItem value="updatedAt">Dernière action</SelectItem>
                <SelectItem value="pickupDate">Ramassage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Actions (Doublons + Reset) aligned to bottom ── */}
          <div className="flex items-end gap-2 ml-auto">
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-transparent mb-1">·</span>
              <button
                onClick={() => setShowDuplicatesOnly(v => !v)}
                data-testid="button-filter-duplicates"
                className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap ${
                  showDuplicatesOnly
                    ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                    : "bg-background border-border/60 text-muted-foreground hover:text-orange-600 hover:border-orange-300"
                }`}
              >
                ⚠️ Doublons
              </button>
            </div>
            {hasActiveFilters && (
              <div className="flex flex-col shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-transparent mb-1">·</span>
                <button
                  onClick={resetFilters}
                  data-testid="button-reset-filters"
                  className="h-9 px-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-red-100 dark:hover:bg-red-950/60 whitespace-nowrap"
                  title="Réinitialiser tous les filtres"
                >
                  <RotateCcw className="w-3 h-3" />
                  Réinitialiser
                </button>
              </div>
            )}
          </div>

        </div>
      </Card>

      {filterKey === 'retours' && (
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="segmented-retours-filter">
          {[
            { key: '', label: 'Tous' },
            { key: 'retour_en_route', label: '🚚 En route' },
            { key: 'retour_recu', label: '✅ Reçus' },
          ].map(opt => {
            const active = filters.statusFilter === opt.key;
            return (
              <button
                key={opt.key || 'all'}
                onClick={() => setFilters(f => ({ ...f, statusFilter: opt.key, page: 1 }))}
                data-testid={`button-retours-${opt.key || 'all'}`}
                className={`h-9 px-4 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {selectAllPages && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5 mb-3" data-testid="banner-select-all-pages">
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            ✅ Toutes les commandes sont sélectionnées ({selectedIds.size})
          </span>
          <button
            onClick={cancelSelectAllPages}
            className="text-sm text-red-500 hover:text-red-700 underline font-medium"
            data-testid="button-cancel-select-all-pages"
          >
            Annuler
          </button>
        </div>
      )}

      <div className="hidden md:block bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={selectableOrders.length > 0 && selectableOrders.every((o: any) => selectedIds.has(o.id))}
                    onCheckedChange={toggleAll}
                    disabled={selectableOrders.length === 0}
                    title={selectableOrders.length === 0 ? "Aucune commande sélectionnable" : `Sélectionner ${selectableOrders.length} commande(s)`}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                {isColVisible('code') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Code</div>{showInlineFilters && renderColFilter('code', 'Filtr...')}</TableHead>}
                {isColVisible('destinataire') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Destinataire</div>{showInlineFilters && renderColFilter('destinataire', 'Filtr...')}</TableHead>}
                {isColVisible('telephone') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Téléphone</div>{showInlineFilters && renderColFilter('telephone', 'Filtr...')}</TableHead>}
                {isColVisible('ville') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Ville</div>{showInlineFilters && renderColFilter('ville', 'Filtr...')}</TableHead>}
                {isColVisible('produit') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Produit</div>{showInlineFilters && renderColFilter('produit', 'Filtr...')}</TableHead>}
                {isColVisible('boutique') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Boutique</div>{showInlineFilters && renderColFilter('boutique', 'Filtr...')}</TableHead>}
                {isColVisible('actionBy') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Action By</div>{showInlineFilters && renderColFilter('actionBy', 'Filtr...')}</TableHead>}
                {isColVisible('comment') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Comment</TableHead>}
                {isColVisible('livraison') && <TableHead>Frais de livraison</TableHead>}
                {isColVisible('derniereAction') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Dernière action</TableHead>}
                {isColVisible('status') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>}
                {isColVisible('prix') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Prix</TableHead>}
                {isColVisible('adresse') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Adresse</TableHead>}
                {isColVisible('reference') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Référence</TableHead>}
                {isColVisible('source') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Source</TableHead>}
                {isColVisible('utmSource') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">UTM Source</TableHead>}
                {isColVisible('utmCampaign') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">UTM Campagne</TableHead>}
                {isColVisible('infosSupp') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Infos supplémentaires</TableHead>}
                {!isMediaBuyer && isColVisible('action') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Action</TableHead>}
              </TableRow>
              {!showInlineFilters && (
                <TableRow className="bg-muted/10 border-t-0">
                  <TableHead className="py-1 px-2">
                    <button onClick={() => setShowInlineFilters(true)} className="text-[9px] text-primary hover:underline" data-testid="button-show-inline-filters">Filtr.</button>
                  </TableHead>
                  {visibleCols.filter(c => c !== 'action').map(c => (
                    <TableHead key={c} className="py-1" />
                  ))}
                  {isColVisible('action') && <TableHead className="py-1" />}
                </TableRow>
              )}
              {showInlineFilters && (
                <TableRow className="bg-muted/10 border-t-0">
                  <TableHead className="py-1 px-2">
                    <button onClick={() => { setShowInlineFilters(false); setColFilters({}); }} className="text-[9px] text-red-500 hover:underline" data-testid="button-hide-inline-filters">×</button>
                  </TableHead>
                  {visibleCols.filter(c => c !== 'action').map(c => <TableHead key={c} className="py-0" />)}
                  {isColVisible('action') && <TableHead className="py-0" />}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpanTotal}><div className="h-10 w-full bg-muted rounded animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpanTotal} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Aucune commande trouvée.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => {
                  // Multi-item display (handles upsells from EasySell/ReConvert/etc.)
                  // Each line item gets its own "Name - Variant (xQty)" segment,
                  // joined with " + " so the customer sees every product on the order.
                  const items = (order.items || []) as any[];
                  let productName: string;
                  if (order.rawProductName && order.rawProductName.includes(' + ')) {
                    productName = order.rawProductName;
                  } else if (items.length > 1) {
                    productName = items.map((it) => {
                      const name = it.rawProductName || it.product?.name || '';
                      const v = (it.variantInfo || '').trim();
                      const vClean = (v && v !== 'Default Title' && v !== 'null' && !name.includes(v)) ? ` - ${v}` : '';
                      const qty = (it.quantity || 1) > 1 ? ` (x${it.quantity})` : '';
                      return `${name}${vClean}${qty}`;
                    }).filter(Boolean).join(' + ');
                  } else {
                    const rawName = order.rawProductName || items[0]?.rawProductName || items[0]?.product?.name || '-';
                    const rawVariant = items[0]?.variantInfo || '';
                    const variantAlreadyInName = rawVariant && rawName.includes(rawVariant);
                    const displayName = (rawVariant && rawVariant !== 'Default Title' && rawVariant !== 'null' && !variantAlreadyInName) ? `${rawName} - ${rawVariant}` : rawName;
                    const qty = items[0]?.quantity || order.rawQuantity || 1;
                    productName = qty > 1 ? `${displayName} (x${qty})` : displayName;
                  }
                  const productRef = order.items?.[0]?.product?.sku || order.items?.map((i: any) => `qty:${i.quantity} #${i.productId}`).join(', ') || '-';
                  const agentName = order.agent?.username || '-';
                  return (
                    <TableRow
                      key={order.id}
                      className={cn(
                        "hover:bg-muted/20 transition-colors text-xs",
                        reporteUrgency(order) === 'overdue' && "border-l-4 border-l-red-500",
                        reporteUrgency(order) === 'due-soon' && "border-l-4 border-l-amber-500",
                      )}
                      data-testid={`row-order-${order.id}`}
                    >
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const shippable = isOrderShippable(order);
                          // Only block selection on the Confirmées tab: an order
                          // with a stale trackNumber cannot be re-shipped.
                          // On every other tab (expédié, refused, etc.) the checkbox
                          // is always enabled so agents can still bulk-delete or
                          // bulk-assign those orders.
                          const isDisabled = urlStatus === 'confirme' && !shippable;
                          return (
                            <Checkbox
                              checked={selectedIds.has(order.id)}
                              onCheckedChange={() => toggleSelect(order.id)}
                              disabled={isDisabled}
                              title={isDisabled ? 'Cette commande a déjà été expédiée ou n\'est pas confirmée' : undefined}
                              data-testid={`checkbox-order-${order.id}`}
                            />
                          );
                        })()}
                      </TableCell>
                      {isColVisible('code') && (
                        <TableCell className="whitespace-nowrap font-mono text-[10px]">
                          {(order as any).trackNumber
                            ? <span className="text-blue-600 dark:text-blue-400 font-semibold" title={`Tracking: ${(order as any).trackNumber}`}>{(order as any).trackNumber}</span>
                            : <span className="text-muted-foreground">{order.orderNumber || 'N/D'}</span>
                          }
                        </TableCell>
                      )}
                      {isColVisible('destinataire') && (
                        <TableCell className="whitespace-nowrap font-medium">
                          <div className="flex items-center gap-1.5">
                            {cleanCustomerName(order.customerName)}
                            {(() => {
                              const inv = (s: any) => String(s ?? '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
                              const missing: string[] = [];
                              if (!inv(order.customerName) || inv(order.customerName).length < 2) missing.push('nom');
                              if (!(order.customerPhone ?? '').replace(/\D/g, '') || (order.customerPhone ?? '').replace(/\D/g, '').length < 8) missing.push('tél');
                              if (!inv(order.customerCity)) missing.push('ville');
                              if (!inv(order.customerAddress) && !inv(order.customerCity)) missing.push('adresse');
                              return missing.length > 0 ? (
                                <span
                                  title={`Champs manquants: ${missing.join(', ')}`}
                                  className="inline-flex items-center px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-[9px] font-medium shrink-0"
                                  data-testid={`badge-missing-fields-${order.id}`}
                                >
                                  ⚠ {missing.length}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                      )}
                      {isColVisible('telephone') && (
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px]">{order.customerPhone}</span>
                            {(order.duplicateCount ?? 1) > 1 && (
                              <button
                                onClick={e => { e.stopPropagation(); setCustomerHistoryPhone(order.customerPhone); }}
                                data-testid={`badge-duplicate-${order.id}`}
                                title={`${order.duplicateCount} commandes — cliquez pour voir l'historique`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-orange-500 text-white hover:bg-orange-600 active:scale-95 transition-all shrink-0 cursor-pointer shadow-sm"
                              >
                                x{order.duplicateCount}
                              </button>
                            )}
                            <a href={whatsappLink(order.customerPhone, order)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-500 hover:text-green-700" data-testid={`whatsapp-${order.id}`}>
                              <SiWhatsapp className="w-3.5 h-3.5" />
                            </a>
                            <a href={telLink(order.customerPhone)} onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700" data-testid={`phone-${order.id}`}>
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </TableCell>
                      )}
                      {isColVisible('ville') && <TableCell className="whitespace-nowrap">{order.customerCity || "-"}</TableCell>}
                      {isColVisible('produit') && (
                        <TableCell className="text-[11px] align-top" title={productName} data-testid={`text-product-${order.id}`}>
                          <div className="max-w-[200px] line-clamp-2 break-words">{productName}</div>
                        </TableCell>
                      )}
                      {isColVisible('boutique') && (
                        <TableCell className="whitespace-nowrap text-[11px]" data-testid={`text-boutique-${order.id}`}>
                          {(order as any).magasin?.name ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-md bg-[#95BF47]/10 flex items-center justify-center shrink-0">
                                <SiShopify className="w-3 h-3 text-[#95BF47]" />
                              </div>
                              <span className="font-medium">{(order as any).magasin.name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {isColVisible('actionBy') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          {agentName !== '-' ? (
                            <Badge variant="outline" className="text-[10px] font-medium">{agentName}</Badge>
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      )}
                      {isColVisible('comment') && (
                        <TableCell className="max-w-[140px] text-muted-foreground text-[11px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate" title={order.comment || order.commentStatus || ''}>
                              {order.comment || order.commentStatus || '-'}
                            </span>
                            {urlStatus === 'confirme_reporte' && (order as any).scheduledFor && (
                              <span
                                className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap"
                                data-testid={`text-scheduled-for-${order.id}`}
                              >
                                📅 Programmé: {new Date((order as any).scheduledFor).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {showDriverInfo && (order as any).driverPhone && (
                              <a
                                href={`tel:${(order as any).driverPhone}`}
                                className="flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline"
                                onClick={e => e.stopPropagation()}
                                data-testid={`link-comment-driver-phone-${order.id}`}
                              >
                                🚴 {(order as any).driverPhone}
                              </a>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {isColVisible('livraison') && (
                        <TableCell className="text-sm font-medium text-center">
                          <div className="flex items-center gap-2 justify-center">
                            {order.shippingProvider && (() => {
                              const logo = getCarrierLogo(order.shippingProvider);
                              return logo
                                ? <img src={logo} alt={order.shippingProvider} className="w-6 h-6 object-contain shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                                : null;
                            })()}
                            {(order as any).shippingCost && (order as any).shippingCost > 0
                              ? `${((order as any).shippingCost / 100).toFixed(2)} DH`
                              : <span className="text-muted-foreground text-xs">—</span>
                            }
                          </div>
                        </TableCell>
                      )}
                      {isColVisible('derniereAction') && (
                        <TableCell className="whitespace-nowrap text-muted-foreground text-[11px]">
                          {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                        </TableCell>
                      )}
                      {isColVisible('status') && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          {isMediaBuyer ? (
                            (() => {
                              const rawCs = order.commentStatus || order.status || '';
                              const parts = rawCs.split(' | ');
                              const mainStatus = parts[0]?.trim() || '';
                              const motifPart  = parts.find((p: string) => p.startsWith('Motif:'))?.replace('Motif:', '').trim() || '';
                              const statusColor: Record<string, string> = {
                                'Refusée':   'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                                'Refusée *': 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                                'Annulée':   'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                                'Annulé':    'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                                'Livrée':    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                                'Livré':     'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                                'Livrée *':  'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                              };
                              const badgeClass = statusColor[mainStatus] || '';
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {badgeClass ? (
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${badgeClass}`}>
                                      {mainStatus}
                                    </span>
                                  ) : (
                                    <StatusBadge status={mainStatus || order.status} />
                                  )}
                                  {motifPart && (
                                    <span className="text-[10px] text-muted-foreground leading-tight max-w-[160px] truncate" title={motifPart}>
                                      {motifPart}
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <Select
                              value={order.status}
                              onValueChange={(newStatus) => {
                                console.log(`[STATUS CHANGE] order #${order.orderNumber} ${order.status} → ${newStatus}`);
                                handleStatusChange(order.id, newStatus);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[11px] border-0 bg-transparent p-0 shadow-none focus:ring-0 w-auto gap-1" data-testid={`status-select-${order.id}`}>
                                {(() => {
                                  const rawCs = order.commentStatus || order.status || '';
                                  const parts = rawCs.split(' | ');
                                  const mainStatus = parts[0]?.trim() || '';
                                  const motifPart  = parts.find((p: string) => p.startsWith('Motif:'))?.replace('Motif:', '').trim() || '';
                                  const statusColor: Record<string, string> = {
                                    'Refusée':   'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                                    'Refusée *': 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                                    'Annulée':   'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                                    'Annulé':    'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                                    'Livrée':    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                                    'Livré':     'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                                    'Livrée *':  'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                                  };
                                  const badgeClass = statusColor[mainStatus] || '';
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {badgeClass ? (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${badgeClass}`}>
                                          {mainStatus}
                                        </span>
                                      ) : (
                                        <StatusBadge status={mainStatus || order.status} className="cursor-pointer" />
                                      )}
                                      {motifPart && (
                                        <span className="text-[10px] text-muted-foreground leading-tight max-w-[160px] truncate" title={motifPart}>
                                          {motifPart}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_DROPDOWN_OPTIONS.map(s => (
                                  <SelectItem
                                    key={s.value}
                                    value={s.value}
                                    disabled={s.disabled}
                                    className={s.disabled
                                      ? "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pointer-events-none opacity-70 justify-center"
                                      : "text-xs"}
                                  >
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {/* Livreur info — shown on every carrier-flow page (En cours, Suivi, Livrées, Refusées) */}
                          {showDriverInfo && ((order as any).driverPhone || (order as any).driverName) && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-muted-foreground">🚴</span>
                              {(order as any).driverName && (
                                <span className="text-[10px] font-medium" data-testid={`text-driver-name-${order.id}`}>{(order as any).driverName}</span>
                              )}
                              {(order as any).driverPhone && (
                                <a
                                  href={`tel:${(order as any).driverPhone}`}
                                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
                                  onClick={e => e.stopPropagation()}
                                  data-testid={`link-driver-phone-${order.id}`}
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  {(order as any).driverPhone}
                                </a>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      {isColVisible('prix') && <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(order.totalPrice)}</TableCell>}
                      {isColVisible('adresse') && <TableCell className="max-w-[140px] truncate text-muted-foreground text-[11px]">{order.customerAddress || "-"}</TableCell>}
                      {isColVisible('reference') && <TableCell className="text-[10px] font-medium text-muted-foreground max-w-[100px] truncate">{productRef}</TableCell>}
                      {isColVisible('source') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          <SourceBadge source={order.source} />
                        </TableCell>
                      )}
                      {isColVisible('utmSource') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          {order.utmSource ? (
                            <SourceBadge source={order.utmSource} />
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      )}
                      {isColVisible('utmCampaign') && (
                        <TableCell className="max-w-[120px] truncate text-[11px]">
                          {order.utmCampaign ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] font-medium max-w-[110px] truncate block">{order.utmCampaign}</Badge>
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      )}
                      {isColVisible('infosSupp') && (
                        <TableCell className="max-w-[160px] text-[11px]" data-testid={`cell-infos-supp-${order.id}`}>
                          {order.variantDetails && order.variantDetails !== "null" ? (
                            <span className="font-semibold px-1.5 py-0.5 rounded-md text-[10px]" style={{ backgroundColor: "#e8d5a8", color: "#7a5c1e" }}>
                              {order.variantDetails}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {!isMediaBuyer && isColVisible('action') && (
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Voir" data-testid={`action-view-${order.id}`}>
                              <Eye className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Modifier" data-testid={`action-edit-${order.id}`}>
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-muted transition-colors" title="Historique" data-testid={`action-history-${order.id}`}>
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            {order.status === 'confirme' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setAmeexShipOrderId(order.id); }}
                                className="p-1.5 rounded hover:bg-emerald-50 transition-colors"
                                title="Expédier via Ameex"
                                data-testid={`action-ship-ameex-${order.id}`}
                              >
                                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSingle(order.id); }}
                              className="p-1.5 rounded hover:bg-red-50 transition-colors"
                              title="Supprimer"
                              data-testid={`action-delete-${order.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/10" data-testid="pagination-bar">
            <span className="text-xs text-muted-foreground">
              Page {filters.page} / {Math.max(totalPages, 1)} ({totalOrders} commandes)
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} data-testid="button-prev-page">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} data-testid="button-next-page">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE CARD LIST ─────────────────────────────── */}
      <div className="md:hidden pb-24">

        {/* Mobile search bar */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={filters.search}
              onChange={e => updateFilter('search', e.target.value)}
              className="pl-9 h-10 text-sm bg-card border-border/60 rounded-xl w-full"
              data-testid="input-mobile-search"
            />
          </div>
          <button
            className="h-10 w-10 rounded-xl border border-border/60 bg-card flex items-center justify-center shrink-0"
            onClick={() => setShowMobileFilters(v => !v)}
            data-testid="button-mobile-filter"
          >
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Breadcrumb + count */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          <p className="text-[11px] text-muted-foreground">Commandes / <span className="font-semibold text-foreground">{pageTitle}</span></p>
          <span className="text-[11px] text-muted-foreground">{totalOrders} commande{totalOrders > 1 ? 's' : ''}</span>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-40 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Aucune commande trouvée.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredOrders.map((order: any) => {
              const itemCount = (order.items?.length) || 1;
              const _baseCardName = order.rawProductName || order.items?.[0]?.rawProductName || order.items?.[0]?.product?.name || '—';
              const _cardVariant = order.items?.[0]?.variantInfo || '';
              const _cardVariantInName = _cardVariant && _baseCardName.includes(_cardVariant);
              const productName = (_cardVariant && _cardVariant !== 'Default Title' && _cardVariant !== 'null' && !_cardVariantInName) ? `${_baseCardName} - ${_cardVariant}` : _baseCardName;
              const orderDate = order.createdAt
                ? new Date(order.createdAt).toLocaleString('fr-MA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

              const cardUrgency = reporteUrgency(order);
              return (
                <div
                  key={order.id}
                  className={cn(
                    "bg-white dark:bg-card rounded-2xl shadow-sm border border-border/40 overflow-hidden",
                    cardUrgency === 'overdue' && "border-l-4 border-l-red-500",
                    cardUrgency === 'due-soon' && "border-l-4 border-l-amber-500",
                  )}
                  data-testid={`card-order-${order.id}`}
                >
                  {/* ── TOP BAR: checkbox + phone + call icons + status ── */}
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    {!isMediaBuyer && (
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                        disabled={!isOrderSelectable(order)}
                        title={!isOrderSelectable(order) ? 'Cette commande a déjà été expédiée ou n\'est pas confirmée' : undefined}
                        className="shrink-0 border-border"
                        data-testid={`checkbox-mobile-${order.id}`}
                      />
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="font-bold text-[13px] text-foreground tracking-wide truncate">
                        {order.customerPhone}
                      </span>
                      {(order.duplicateCount ?? 1) > 1 && (
                        <button
                          onClick={e => { e.stopPropagation(); setCustomerHistoryPhone(order.customerPhone); }}
                          data-testid={`badge-duplicate-mobile-${order.id}`}
                          className="shrink-0 text-[10px] font-bold text-white bg-orange-500 rounded-full px-1.5 py-0.5 active:scale-95 hover:bg-orange-600 transition-colors cursor-pointer"
                        >
                          ⚠️ {order.duplicateCount} Cmds
                        </button>
                      )}
                      {(() => {
                        const inv = (s: any) => String(s ?? '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
                        const missing: string[] = [];
                        if (!inv(order.customerName) || inv(order.customerName).length < 2) missing.push('nom');
                        if (!(order.customerPhone ?? '').replace(/\D/g, '') || (order.customerPhone ?? '').replace(/\D/g, '').length < 8) missing.push('tél');
                        if (!inv(order.customerCity)) missing.push('ville');
                        if (!inv(order.customerAddress) && !inv(order.customerCity)) missing.push('adresse');
                        return missing.length > 0 ? (
                          <span
                            title={`Champs manquants: ${missing.join(', ')}`}
                            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-[10px] font-medium"
                            data-testid={`badge-missing-fields-mobile-${order.id}`}
                          >
                            ⚠ {missing.length}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {itemCount > 1 && (
                      <span className="text-[10px] font-extrabold text-white bg-amber-500 rounded-full px-1.5 py-0.5 shrink-0">
                        x{itemCount}
                      </span>
                    )}
                    {!isMediaBuyer && (
                      <>
                        <a
                          href={telLink(order.customerPhone)}
                          onClick={e => e.stopPropagation()}
                          className="shrink-0 w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 active:scale-95"
                          data-testid={`phone-mobile-${order.id}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={whatsappLink(order.customerPhone, order)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="shrink-0 w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center text-green-600 active:scale-95"
                          data-testid={`whatsapp-mobile-${order.id}`}
                        >
                          <SiWhatsapp className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                    {(() => {
                      const rawCs = order.commentStatus || order.status || '';
                      const parts = rawCs.split(' | ');
                      const mainStatus = parts[0]?.trim() || '';
                      const motifPart  = parts.find((p: string) => p.startsWith('Motif:'))?.replace('Motif:', '').trim() || '';
                      const statusColor: Record<string, string> = {
                        'Refusée':   'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                        'Refusée *': 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400',
                        'Annulée':   'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                        'Annulé':    'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400',
                        'Livrée':    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                        'Livré':     'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                        'Livrée *':  'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400',
                      };
                      const badgeClass = statusColor[mainStatus] || '';
                      return (
                        <div className="flex flex-col items-end gap-0.5 ml-1 shrink-0 max-w-[55%]">
                          {badgeClass ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap ${badgeClass}`}>
                              {mainStatus}
                            </span>
                          ) : (
                            <StatusBadge status={mainStatus || order.status} className="text-[10px]" />
                          )}
                          {motifPart && (
                            <span className="text-[9px] text-muted-foreground leading-tight text-right line-clamp-2">
                              {motifPart}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── MIDDLE: customer name, city, store, carrier ── */}
                  <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{order.customerName}</span>
                    <span className="text-muted-foreground text-[11px]">·</span>
                    <span className="text-[12px] font-bold text-foreground/80">{order.customerCity || '—'}</span>
                    {storeData?.name && (
                      <>
                        <span className="text-muted-foreground text-[11px]">·</span>
                        <span className="text-[11px] text-muted-foreground">{storeData.name}</span>
                      </>
                    )}
                    {order.shippingProvider && (() => {
                      const logo = getCarrierLogo(order.shippingProvider);
                      return logo
                        ? <img src={logo} alt={order.shippingProvider} style={{ maxHeight: 22, maxWidth: 60 }} className="ml-auto object-contain shrink-0" />
                        : <Badge className="ml-auto text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 shrink-0">{order.shippingProvider}</Badge>;
                    })()}
                  </div>

                  {/* ── DIVIDER ── */}
                  <div className="mx-3 border-t border-border/30" />

                  {/* ── PRODUCT ROW: name + price + date ── */}
                  <div className="px-3 py-2.5 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground/90 truncate leading-snug">{productName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{orderDate}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[15px] font-extrabold text-foreground">{formatCurrency(order.totalPrice)}</span>
                    </div>
                  </div>

                  {/* ── BOTTOM ACTIONS ── */}
                  <div className="px-3 pb-3 flex items-center gap-2">
                    <button
                      onClick={() => openOrder(order)}
                      className="w-8 h-8 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                      data-testid={`history-mobile-${order.id}`}
                      title="Historique"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openOrder(order)}
                      className="w-8 h-8 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors active:scale-95"
                      data-testid={`view-mobile-${order.id}`}
                      title="Voir"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {!isMediaBuyer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSingle(order.id); }}
                        className="w-8 h-8 rounded-lg border border-red-100 bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors active:scale-95"
                        data-testid={`delete-mobile-card-${order.id}`}
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {order.utmSource && (
                      <span className="ml-1 inline-flex"><SourceBadge source={order.utmSource} /></span>
                    )}
                    <span className="ml-auto"><SourceBadge source={order.source} /></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 pb-1" data-testid="pagination-bar-mobile">
            <span className="text-xs text-muted-foreground font-medium">Page {filters.page}/{totalPages}</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)}>
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Préc
              </Button>
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)}>
                Suiv <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── FIXED BOTTOM BAR (mobile only) ─────────────────────── */}
      {!isMediaBuyer && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-card border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)]" data-testid="bottom-action-bar">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            {/* Select all */}
            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                checked={selectableOrders.length > 0 && selectableOrders.every((o: any) => selectedIds.has(o.id))}
                onCheckedChange={toggleAll}
                className="border-border"
                data-testid="checkbox-select-all-mobile"
              />
              <span className="text-[11px] font-bold text-foreground/70 whitespace-nowrap">Tout</span>
            </div>

            {/* Count */}
            <div className="flex-1 min-w-0">
              {selectedIds.size > 0 ? (
                <span className="text-[12px] font-bold text-primary">
                  {selectedIds.size} Cmd{selectedIds.size > 1 ? 's' : ''} choisie{selectedIds.size > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{totalOrders} commande{totalOrders > 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Action icons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95"
                title="Rafraîchir"
                data-testid="button-mobile-refresh"
                onClick={() => setSelectedIds(new Set())}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 active:scale-95"
                title="Assigner"
                data-testid="button-mobile-assign"
                onClick={() => { if (selectedIds.size > 0) setShowAssignModal(true); else toast({ title: "Sélectionnez des commandes" }); }}
              >
                <Headphones className="w-4 h-4" />
              </button>
              <button
                className={`w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 border border-red-100 active:scale-95 transition-all ${selectedIds.size === 0 ? 'opacity-40' : 'opacity-100'}`}
                title={selectedIds.size > 0 ? `Supprimer ${selectedIds.size} commande(s)` : "Sélectionnez des commandes"}
                data-testid="button-mobile-delete"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
              <button
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white active:scale-95"
                style={{ background: '#16a34a' }}
                title="Expédier"
                data-testid="button-mobile-ship"
                onClick={() => { if (selectedIds.size > 0) setShowBulkShipModal(true); else toast({ title: "Sélectionnez des commandes" }); }}
              >
                <Truck className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ─────────────────────────────── */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!open) { setShowDeleteModal(false); setDeleteSingleId(null); } }}>
        <DialogContent className="sm:max-w-sm rounded-2xl border-none shadow-2xl p-0 overflow-hidden" data-testid="dialog-delete-confirm">
          <div className="bg-red-50 dark:bg-red-950/30 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-base font-bold text-red-700 dark:text-red-400">
                Confirmer la suppression
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-red-600/80 dark:text-red-400/80 ml-13">
              {deleteSingleId !== null
                ? "Voulez-vous vraiment supprimer cette commande ? Cette action est irréversible."
                : `Voulez-vous vraiment supprimer ${selectedIds.size} commande${selectedIds.size > 1 ? 's' : ''} ? Cette action est irréversible et définitive.`}
            </DialogDescription>
          </div>
          <div className="px-6 py-4 flex justify-end gap-2 bg-background">
            <Button
              variant="outline"
              onClick={() => { setShowDeleteModal(false); setDeleteSingleId(null); }}
              className="rounded-lg"
              data-testid="btn-delete-cancel"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteSingleMutation.isPending || bulkDeleteMutation.isPending}
              className="rounded-lg gap-2"
              data-testid="btn-delete-confirm"
            >
              {(deleteSingleMutation.isPending || bulkDeleteMutation.isPending) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Suppression...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Supprimer définitivement</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AMEEX SINGLE-ORDER SHIP DIALOG ──────────────────────────── */}
      {(() => {
        const ameexOrder = ameexShipOrderId
          ? (data?.orders ?? []).find((o: any) => o.id === ameexShipOrderId)
          : null;
        const ameexAcct = activeCarrierAccounts?.find((a: any) => a.carrierName === "ameex");
        return (
          <Dialog
            open={ameexShipOrderId !== null}
            onOpenChange={(open) => { if (!open) setAmeexShipOrderId(null); }}
          >
            <DialogContent className="sm:max-w-md rounded-xl" data-testid="dialog-ameex-ship">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <img src="/carriers/ameex.svg" alt="Ameex" className="h-6 object-contain" />
                  Expédier via Ameex
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  La commande sera envoyée directement à Ameex et le numéro de suivi sera enregistré automatiquement.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {!ameexAcct ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                    <span>
                      Aucun compte Ameex connecté.{" "}
                      <a href="/integrations/shipping" className="underline font-semibold" onClick={() => setAmeexShipOrderId(null)}>
                        Configurer maintenant
                      </a>
                    </span>
                  </div>
                ) : (
                  <>
                    {ameexOrder && (
                      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Commande</span>
                          <span className="font-semibold">#{(ameexOrder as any).orderNumber || ameexShipOrderId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Client</span>
                          <span className="font-medium">{(ameexOrder as any).customerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ville</span>
                          <span className="font-medium">{(ameexOrder as any).customerCity || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Montant COD</span>
                          <span className="font-semibold text-emerald-700">
                            {((ameexOrder as any).totalPrice / 100).toFixed(2)} DH
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Compte Ameex: <strong className="text-foreground">{ameexAcct.connectionName}</strong></span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmeexShipOrderId(null)}
                  data-testid="button-ameex-ship-cancel"
                >
                  Annuler
                </Button>
                {ameexAcct && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    disabled={ameexShipPending}
                    data-testid="button-ameex-ship-confirm"
                    onClick={async () => {
                      if (!ameexShipOrderId) return;
                      setAmeexShipPending(true);
                      try {
                        const res = await apiRequest("POST", `/api/orders/${ameexShipOrderId}/ship`, {
                          provider: "ameex",
                          accountId: ameexAcct.id,
                        });
                        const data = await res.json();
                        setAmeexShipOrderId(null);
                        qc.invalidateQueries({ queryKey: ['/api/orders'] });
                        toast({
                          title: "✅ Expédié via Ameex",
                          description: data.trackingNumber
                            ? `Tracking: ${data.trackingNumber}`
                            : "Commande envoyée avec succès.",
                        });
                      } catch (err: any) {
                        const msg = err?.message || "Erreur lors de l'expédition.";
                        toast({ title: "Erreur Ameex", description: msg, variant: "destructive" });
                      } finally {
                        setAmeexShipPending(false);
                      }
                    }}
                  >
                    {ameexShipPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...</>
                    ) : (
                      <><Truck className="w-4 h-4" /> Expédier via Ameex</>
                    )}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-md rounded-xl" data-testid="dialog-bulk-assign">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Assigner une équipe</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Assignez les commandes sélectionnées à un agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Type de service</label>
              <Select value={assignServiceType} onValueChange={setAssignServiceType}>
                <SelectTrigger className="bg-white dark:bg-card" data-testid="select-service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmation">Confirmation</SelectItem>
                  <SelectItem value="suivi">Suivi</SelectItem>
                  <SelectItem value="confirmation_suivi">Confirmation & Suivi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Équipe / Agent</label>
              <Select value={assignAgentId} onValueChange={setAssignAgentId}>
                <SelectTrigger className="bg-white dark:bg-card" data-testid="select-assign-agent">
                  <SelectValue placeholder="Sélectionner un agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agents?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{selectedIds.size} commande(s) sélectionnée(s)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Annuler</Button>
            <Button onClick={handleBulkAssign} disabled={!assignAgentId || bulkAssign.isPending} data-testid="button-confirm-assign">
              {bulkAssign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SHIPPING PROGRESS MODAL ──────────────────────────────── */}
      <Dialog open={shipProgress !== null} onOpenChange={(open) => { if (!open && !shipProgress?.active) setShipProgress(null); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl border-none shadow-2xl p-0 overflow-hidden" data-testid="dialog-ship-progress">
          <div className="bg-indigo-50 dark:bg-indigo-950/30 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                {shipProgress?.active
                  ? <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  : <Truck className="w-5 h-5 text-indigo-600" />
                }
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                  {shipProgress?.active ? "Expédition en cours..." : "Expédition terminée"}
                </DialogTitle>
                {shipProgress && (
                  <p className="text-xs text-indigo-500 mt-0.5">{shipProgress.provider}</p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {shipProgress && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-indigo-600 font-medium mb-1">
                  <span>{shipProgress.active ? "Envoi des commandes en cours..." : "Traitement terminé"}</span>
                  <span className="font-bold">{shipProgress.done} / {shipProgress.total}</span>
                </div>
                <div className="w-full bg-indigo-100 dark:bg-indigo-900/40 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: shipProgress.total > 0 ? `${Math.round((shipProgress.done / shipProgress.total) * 100)}%` : '0%',
                      background: shipProgress.active ? '#6366f1' : (shipProgress.failed > 0 ? '#f97316' : '#22c55e'),
                    }}
                  />
                </div>
              </div>
            )}

            {/* Result summary (shown after complete) */}
            {shipProgress && !shipProgress.active && (
              <div className="flex gap-3 mt-4">
                <div className="flex-1 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-xl px-3 py-2">
                  <span className="text-lg">✅</span>
                  <div>
                    <p className="text-xs text-green-600 font-semibold">Expédiées</p>
                    <p className="text-xl font-bold text-green-700">{shipProgress.shipped}</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl px-3 py-2">
                  <span className="text-lg">❌</span>
                  <div>
                    <p className="text-xs text-red-500 font-semibold">Échouées</p>
                    <p className="text-xl font-bold text-red-600">{shipProgress.failed}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Banner for blocked (non-confirmed) orders */}
          {shipProgress && !shipProgress.active && shipProgress.results && shipProgress.results.some(r => r.status === 'failed' && r.error?.includes("doit être")) && (
            <div className="mx-6 mt-4 mb-1 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                Certaines commandes n'ont pas été envoyées car elles ne sont pas confirmées.
                <br />
                <span className="font-semibold">Veuillez d'abord confirmer ces commandes.</span>
              </p>
            </div>
          )}

          {/* Per-order error details — categorized by type */}
          {shipProgress && !shipProgress.active && shipProgress.failed > 0 && shipProgress.results && (() => {
            const failures = shipProgress.results.filter(r => r.status === 'failed');
            const blacklisted        = failures.filter(r => r.error?.includes('blacklist') || r.error?.includes('liste noire') || r.error?.includes('🚫'));
            const duplicates         = failures.filter(r => r.error?.includes('double') || r.error?.includes('existe déjà') || r.error?.includes('⚠️ Commande'));
            const addressBad         = failures.filter(r => r.error?.includes('Adresse') || r.error?.includes('Ville') || r.error?.includes('📍'));
            const validationFailures = failures.filter(r => /Données manquantes|Destinataire.*obligatoire/i.test(r.error || ''));
            const transient          = failures.filter(r =>
              !blacklisted.includes(r) && !duplicates.includes(r) && !addressBad.includes(r) && !validationFailures.includes(r)
            );
            return (
              <div className="px-6 pb-2 space-y-3">
                {blacklisted.length > 0 && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-xs font-bold text-red-800 dark:text-red-200 mb-1.5">
                      🚫 {blacklisted.length} commande{blacklisted.length > 1 ? 's' : ''} avec numéro blacklisté
                    </p>
                    <p className="text-[10px] text-red-700/80 dark:text-red-300/80 mb-2">
                      Ces clients ont un historique d'annulations chez le transporteur. Vérifiez manuellement avant de réessayer.
                    </p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {blacklisted.map(r => (
                        <li key={r.orderId} className="text-[10px] text-red-700 dark:text-red-300">
                          <span className="font-mono font-bold">#{r.orderNumber}</span> — {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {duplicates.length > 0 && (
                  <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3">
                    <p className="text-xs font-bold text-orange-800 dark:text-orange-200 mb-1.5">
                      ⚠️ {duplicates.length} commande{duplicates.length > 1 ? 's' : ''} en double
                    </p>
                    <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                      {duplicates.map(r => (
                        <li key={r.orderId} className="text-[10px] text-orange-700 dark:text-orange-300">
                          <span className="font-mono font-bold">#{r.orderNumber}</span> — {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {addressBad.length > 0 && (
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-3">
                    <p className="text-xs font-bold text-yellow-800 dark:text-yellow-200 mb-1.5">
                      📍 {addressBad.length} commande{addressBad.length > 1 ? 's' : ''} avec adresse/ville invalide
                    </p>
                    <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                      {addressBad.map(r => (
                        <li key={r.orderId} className="text-[10px] text-yellow-700 dark:text-yellow-300">
                          <span className="font-mono font-bold">#{r.orderNumber}</span> — {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationFailures.length > 0 && (
                  <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3">
                    <p className="text-xs font-bold text-orange-800 dark:text-orange-200 mb-1">
                      📝 {validationFailures.length} commande{validationFailures.length > 1 ? 's' : ''} avec données incomplètes
                    </p>
                    <p className="text-[10px] text-orange-700/80 dark:text-orange-300/80 mb-2">
                      Ouvrez chaque commande pour compléter les champs manquants avant de réexpédier.
                    </p>
                    <ul className="space-y-0.5 max-h-[180px] overflow-y-auto">
                      {validationFailures.map(r => (
                        <li key={r.orderId}>
                          <button
                            className="text-left hover:underline text-[10px] text-orange-700 dark:text-orange-300"
                            onClick={() => {
                              const fullOrder = (data?.orders || []).find((o: any) => o.id === r.orderId);
                              if (fullOrder) setSelectedOrder(fullOrder);
                            }}
                          >
                            <span className="font-mono font-bold">#{r.orderNumber}</span> — {r.error}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {transient.length > 0 && transient.some(r => /ameex/i.test(r.error || '') && /numéro de suivi/i.test(r.error || '')) && (
                  <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-900 dark:text-blue-200">
                    💡 <strong>Astuce Ameex :</strong> Ameex peut créer la commande dans son portail sans renvoyer le numéro de suivi immédiatement. Vérifiez votre portail Ameex avant de cliquer "Réessayer" pour éviter les doublons.
                  </div>
                )}

                {transient.length > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                    <div className="flex items-start gap-2 mb-1.5">
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-200 flex-1">
                        ⏱ {transient.length} échec{transient.length > 1 ? 's' : ''} transitoire{transient.length > 1 ? 's' : ''}
                      </p>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 text-[10px] px-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                        data-testid="button-retry-transient"
                        onClick={() => {
                          const ids = transient.map(r => r.orderId);
                          const provider = shipProgress.provider;
                          setShipProgress({ active: true, done: 0, total: ids.length, shipped: 0, failed: 0, provider });
                          bulkShip.mutate({ orderIds: ids, provider, accountId: bulkShipAccountId }, {
                            onError: (err: any) => {
                              const msg = String(err.message || "").replace(/^\d{3}:\s*/, "");
                              setShipProgress(null);
                              toast({ title: "Erreur d'expédition", description: msg, variant: "destructive" });
                            },
                          });
                        }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Réessayer
                      </Button>
                    </div>
                    <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mb-2">
                      Probable hiccup côté transporteur. Cliquez "Réessayer" pour relancer ces commandes seules.
                    </p>
                    <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                      {transient.map(r => (
                        <li key={r.orderId} className="text-[10px] text-amber-700 dark:text-amber-300">
                          <span className="font-mono font-bold">#{r.orderNumber}</span> — {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {shipProgress && !shipProgress.active && shipProgress.failed > 0 && (
            <div className="px-6 pb-4">
              <Button
                variant="default"
                size="sm"
                className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
                data-testid="button-retry-failed-ship"
                onClick={() => {
                  const failedIds = (shipProgress.results || [])
                    .filter(r => r.status === 'failed')
                    .map(r => r.orderId);
                  if (failedIds.length === 0) return;
                  const provider = shipProgress.provider;
                  setShipProgress({ active: true, done: 0, total: failedIds.length, shipped: 0, failed: 0, provider });
                  bulkShip.mutate({ orderIds: failedIds, provider, accountId: bulkShipAccountId }, {
                    onError: (err: any) => {
                      const msg = String(err.message || "").replace(/^\d{3}:\s*/, "");
                      setShipProgress(null);
                      toast({ title: "Erreur d'expédition", description: msg, variant: "destructive" });
                    },
                  });
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Réessayer les {shipProgress.failed} échec{shipProgress.failed > 1 ? 's' : ''}
              </Button>
            </div>
          )}

          {!shipProgress?.active && (
            <div className="px-6 py-4 flex justify-end">
              <Button
                onClick={() => setShipProgress(null)}
                className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl"
                data-testid="button-close-ship-progress"
              >
                Fermer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkShipModal} onOpenChange={(open) => { setShowBulkShipModal(open); if (!open) { setBulkShipProvider(""); setBulkShipAccountId(null); setShipValidation(null); } }}>
        <DialogContent className="sm:max-w-lg rounded-xl" data-testid="dialog-bulk-ship">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-500" />
              Expédier les commandes
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Seules les commandes avec le statut <Badge variant="outline" className="text-emerald-600 mx-1">Confirmé</Badge>, <Badge variant="outline" className="text-slate-600 mx-1">Expédié</Badge> ou <Badge variant="outline" className="text-orange-600 mx-1">Attente Ramassage</Badge> seront expédiées.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Carrier selector — from carrier_accounts table ── */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Société de livraison</label>

              {/* Loading */}
              {loadingCarrierAccounts && (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des transporteurs...
                </div>
              )}

              {/* Empty state */}
              {!loadingCarrierAccounts && (activeCarrierAccounts?.length ?? 0) === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    Aucune société connectée.{" "}
                    <a href="/shipping-integrations" className="underline font-semibold" onClick={() => setShowBulkShipModal(false)}>
                      Configurer maintenant
                    </a>
                  </span>
                </div>
              )}

              {/* Dropdown */}
              {!loadingCarrierAccounts && (activeCarrierAccounts?.length ?? 0) > 0 && (
                <>
                  <Select
                    value={bulkShipAccountId ? String(bulkShipAccountId) : ""}
                    onValueChange={v => {
                      const acct = activeCarrierAccounts?.find((a: any) => String(a.id) === v);
                      if (acct) {
                        setBulkShipAccountId(acct.id);
                        setBulkShipProvider(acct.carrierName);
                      }
                      setShipValidation(null);
                    }}
                  >
                    <SelectTrigger className="bg-white dark:bg-card" data-testid="select-bulk-ship-provider">
                      <SelectValue placeholder="Sélectionner un compte transporteur..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCarrierAccounts?.map((acct: any) => {
                        const logo = getCarrierLogo(acct.carrierName);
                        return (
                          <SelectItem key={acct.id} value={String(acct.id)}>
                            <span className="flex items-center gap-2">
                              {logo && <img src={logo} alt={acct.carrierName} style={{ height: 18, maxWidth: 50 }} className="object-contain shrink-0" />}
                              <span className="capitalize font-medium">{acct.carrierName}</span>
                              {acct.connectionName && acct.connectionName !== acct.carrierName && (
                                <span className="text-muted-foreground text-[11px]">— {acct.connectionName}</span>
                              )}
                              {acct.isDefault === 1 && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">défaut</span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Selected account preview */}
                  {bulkShipAccountId && (() => {
                    const acct = activeCarrierAccounts?.find((a: any) => a.id === bulkShipAccountId);
                    if (!acct) return null;
                    const logo = getCarrierLogo(acct.carrierName);
                    return (
                      <div className="flex items-center gap-3 mt-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                        {logo && <img src={logo} alt={acct.carrierName} style={{ height: 32, maxWidth: 90 }} className="object-contain shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold capitalize">{acct.carrierName}</p>
                          <p className="text-[11px] text-muted-foreground">{acct.connectionName}</p>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* ── Pre-flight validation panel ── */}
            {bulkShipProvider && !bulkCarrierData && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Vérification des villes...
              </div>
            )}

            {bulkCarrierData && shipValidation && (
              <div className="space-y-3">
                {/* Summary bar */}
                {shipValidation.invalid.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {selectedIds.size} commande(s) validée(s) — prêtes à expédier
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {shipValidation.invalid.length} erreur(s) détectée(s) sur {selectedIds.size} commande(s)
                  </div>
                )}

                {/* Error list */}
                {shipValidation.invalid.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden max-h-52 overflow-y-auto">
                    <div className="px-3 py-2 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#C5A059" }}>
                        Commandes avec erreurs — à corriger avant envoi
                      </span>
                    </div>
                    {shipValidation.invalid.map(r => (
                      <div key={r.orderId} className="px-3 py-2.5 border-b border-amber-100 last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">
                              {r.orderNumber} — {r.customerName}
                            </p>
                            <div className="mt-1 space-y-0.5">
                              {r.cityError && (
                                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  {r.cityError}
                                </p>
                              )}
                              {r.phoneError && (
                                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  {r.phoneError}
                                </p>
                              )}
                              {r.addressError && (
                                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  {r.addressError}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const order = filteredOrders.find((o: any) => o.id === r.orderId);
                              if (order) { setShowBulkShipModal(false); openOrder(order); }
                            }}
                            className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors"
                            style={{ color: "#C5A059", borderColor: "#C5A059", background: "rgba(197,160,89,0.08)" }}
                          >
                            Corriger
                          </button>
                        </div>
                        {r.suggestedCity && (
                          <p className="mt-1 text-[10px] text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Suggestion : <strong>{r.suggestedCity}</strong>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* City suggestions (non-blocking) */}
                {shipValidation.suggestOnly.length > 0 && shipValidation.invalid.length === 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                    <strong>Auto-correction</strong> : {shipValidation.suggestOnly.length} ville(s) seront corrigées automatiquement par le serveur avant envoi.
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">{selectedIds.size} commande(s) sélectionnée(s)</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowBulkShipModal(false); setBulkShipProvider(""); setBulkShipAccountId(null); setShipValidation(null); }}>
              Annuler
            </Button>
            {/* If there are invalid orders but also some valid ones, allow partial ship */}
            {shipValidation && shipValidation.invalid.length > 0 && shipValidation.valid.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  const validIds = new Set(shipValidation.valid.map(r => r.orderId));
                  setSelectedIds(validIds);
                  setTimeout(() => handleBulkShip(), 50);
                }}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                data-testid="button-ship-valid-only"
              >
                <Truck className="w-4 h-4 mr-1" />
                Expédier les valides ({shipValidation.valid.length})
              </Button>
            )}
            <Button
              onClick={handleBulkShip}
              disabled={!bulkShipAccountId || bulkShip.isPending || (shipValidation !== null && shipValidation.invalid.length > 0 && shipValidation.valid.length === 0)}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
              data-testid="button-confirm-bulk-ship"
            >
              {bulkShip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              {shipValidation && shipValidation.invalid.length > 0 ? "Expédier quand même" : "Expédier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrderDetailsModal
        order={selectedOrder}
        storeName={storeData?.name}
        onClose={() => setSelectedOrder(null)}
        onUpdated={(updated: any) => setSelectedOrder((prev: any) => prev ? { ...prev, ...updated } : prev)}
      />

      {customerHistoryPhone && (
        <CustomerHistoryModal
          phone={customerHistoryPhone}
          onClose={() => setCustomerHistoryPhone(null)}
        />
      )}

      {/* ── Open Retour prompt dialog ─────────────────────────────── */}
      <Dialog open={!!orPrompt} onOpenChange={(open) => { if (!open) setOrPrompt(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Créer un ticket de retour ?
            </DialogTitle>
            <DialogDescription>
              La commande <strong>{orPrompt?.orderRef}</strong> — {orPrompt?.customerName} a été marquée comme refusée/annulée.
              Voulez-vous créer un ticket de retour Open Retour ?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-semibold block mb-1.5">Raison du retour (optionnel)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400/50"
              placeholder="Ex: colis refusé, client absent..."
              value={orPromptReason}
              onChange={e => setOrPromptReason(e.target.value)}
              data-testid="input-or-prompt-reason"
            />
          </div>
          <DialogFooter className="gap-2 flex-row justify-end">
            <Button variant="outline" onClick={() => setOrPrompt(null)} data-testid="button-or-prompt-ignore">
              Ignorer
            </Button>
            <Button
              onClick={() => orPrompt && createReturnMutation.mutate(orPrompt.orderId)}
              disabled={createReturnMutation.isPending}
              className="font-bold text-white"
              style={{ background: "linear-gradient(135deg, #C5A059 0%, #b8904a 100%)" }}
              data-testid="button-or-prompt-create"
            >
              {createReturnMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Création...</>
                : <><RotateCcw className="w-4 h-4 mr-2" /> Oui, créer un retour</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

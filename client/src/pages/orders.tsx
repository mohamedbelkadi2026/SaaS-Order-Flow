import { useState, useMemo, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFilteredOrders, useUpdateOrderStatus, useAssignAgent, useAgents, useIntegrations, useShipOrder, useUpdateOrder, useBulkAssign, useBulkShip, useStore, useOrderFollowUpLogs, useCreateFollowUpLog, useFilterOptions } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { OrderDetailsModal } from "@/components/order-details-modal";
import { CustomerHistoryModal } from "@/components/customer-history-modal";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge, ORDER_STATUSES } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, Pencil, Clock, Users, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Trash2, FileSpreadsheet, Headphones, BookOpen, Send, RefreshCw, SlidersHorizontal, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
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
  onessta: '/carriers/onessta.svg',
  ozoneexpress: '/carriers/ozon.svg',
  'ozone express': '/carriers/ozon.svg',
  ozon: '/carriers/ozon.svg',
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

const STATUS_MAP: Record<string, string> = {
  nouvelles: "nouveau",
  confirme: "confirme",
  injoignable: "Injoignable",
  annules: "annule_group",
  "boite-vocale": "boite vocale",
  "en-cours": "in_progress",
  suivi: "suivi_group",
  livrees: "delivered",
  refuses: "refused",
};

const TITLE_MAP: Record<string, string> = {
  "": "NOUVELLES",
  confirme: "CONFIRMÉES",
  injoignable: "INJOIGNABLES",
  annules: "ANNULÉES",
  "boite-vocale": "BOITE VOCALE",
  "en-cours": "EN COURS",
  suivi: "SUIVI DES COLIS",
  livrees: "LIVRÉES",
  refuses: "REFUSÉES",
};

const ALL_ORDER_STATUSES = [
  { value: '', label: 'Tous les statuts' },
  { value: 'nouveau',                       label: 'Nouveau'                         },
  { value: 'confirme',                      label: 'Confirmé'                        },
  { value: 'Injoignable',                   label: 'Injoignable'                     },
  { value: 'boite vocale',                  label: 'Boite vocale'                    },
  { value: 'in_progress',                   label: 'En cours / Expédié'             },
  { value: 'Attente De Ramassage',          label: 'Attente Ramassage'              },
  { value: 'En Voyage',                     label: '🚚 En Voyage'                   },
  { value: 'À préparer',                    label: '📦 À préparer'                  },
  { value: 'Ramassé',                       label: '✅ Ramassé'                     },
  { value: 'En transit',                    label: '🔄 En transit'                  },
  { value: 'Reçu',                          label: '📬 Reçu'                        },
  { value: 'En cours de distribution',      label: '🛵 En cours de distribution'    },
  { value: 'Programmé',                     label: '📅 Programmé'                   },
  { value: 'En stock',                      label: '🏭 En stock'                    },
  { value: 'Changer destinataire',          label: '📝 Changer destinataire'        },
  { value: 'Annulé (fake)',                 label: 'Annulé (fake)'                  },
  { value: 'Annulé (faux numéro)',          label: 'Annulé (faux numéro)'           },
  { value: 'Annulé (double)',               label: 'Annulé (double)'                },
  { value: 'Client intéressé',              label: 'Client intéressé'               },
  { value: 'Remboursé',                     label: 'Remboursé'                      },
  { value: 'Adresse inconnue',              label: 'Adresse inconnue'               },
  { value: 'Retour en route',               label: 'Retour en route'                },
  { value: 'Article retourné',              label: 'Article retourné'               },
  { value: 'Boîte vocale',                  label: 'Boîte vocale (transporteur)'    },
  { value: 'Pas de réponse + SMS',          label: 'Pas de réponse + SMS'           },
  { value: 'Demande retour',                label: 'Demande retour'                 },
  { value: 'delivered',                     label: 'Livré'                          },
  { value: 'refused',                       label: 'Refusé'                         },
];

const ALL_COLUMNS = [
  { key: 'code', label: 'Code', locked: false },
  { key: 'destinataire', label: 'Destinataire', locked: false },
  { key: 'telephone', label: 'Téléphone', locked: false },
  { key: 'ville', label: 'Ville', locked: false },
  { key: 'produit', label: 'Produit', locked: false },
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

const DEFAULT_VISIBLE = ['code','destinataire','telephone','ville','produit','comment','derniereAction','status','prix','adresse','reference','source','action'];

function getStoredColumns(): string[] {
  try {
    const stored = localStorage.getItem('tajergrow_columns');
    if (stored) return JSON.parse(stored);
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

export default function Orders() {
  const [, params] = useRoute("/orders/:filter");
  const filterKey = params?.filter || "";
  const urlStatus = STATUS_MAP[filterKey] || (filterKey ? filterKey : "nouveau");
  const { data: storeData } = useStore();
  const whatsappLink = (phone: string, order: any) => buildWhatsappLink(phone, order, storeData?.whatsappTemplate);
  const { user } = useAuth();
  const isMediaBuyer = user?.role === 'media_buyer';

  const [filters, setFilters] = useState({
    status: urlStatus,
    statusFilter: '',
    agentId: '',
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

  const actualFilters = useMemo(() => ({
    ...filters,
    // statusFilter overrides tab-level urlStatus (lets user drill into a specific carrier status)
    status: filters.statusFilter || urlStatus,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    // For media buyers, the backend scopes orders to their ID + UTM pattern automatically
    // Do NOT override utmSource here — it breaks deep tracking (CODE*PLATFORM) matching
  }), [filters, urlStatus, dateRange]);

  const { data, isLoading } = useFilteredOrders(actualFilters);
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
    results?: { orderId: number; orderNumber?: string; status: 'shipped' | 'failed'; error?: string }[];
  } | null>(null);

  // ── Pre-shipping validation state ─────────────────────────────
  const [shipValidation, setShipValidation] = useState<{
    valid: OrderValidationResult[];
    invalid: OrderValidationResult[];
    suggestOnly: OrderValidationResult[];
  } | null>(null);

  // Fetch carrier city list for the selected provider (for pre-flight validation)
  const { data: bulkCarrierData } = useQuery<{ provider: string | null; cities: string[]; isCarrierSpecific: boolean }>({
    queryKey: ["/api/carriers/cities", bulkShipProvider],
    queryFn: () =>
      bulkShipProvider
        ? fetch(`/api/carriers/cities?provider=${encodeURIComponent(bulkShipProvider)}`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve({ provider: null, cities: [], isCarrierSpecific: false }),
    enabled: !!bulkShipProvider,
    staleTime: 5 * 60 * 1000,
  });

  // Active carrier accounts — fetched from carrier_accounts table, NOT legacy storeIntegrations
  const { data: activeCarrierAccounts, isLoading: loadingCarrierAccounts } = useQuery<any[]>({
    queryKey: ["/api/shipping/active-accounts"],
    queryFn: async () => {
      const r1 = await fetch("/api/shipping/active-accounts", { credentials: "include" });
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
    enabled: showBulkShipModal,
    staleTime: 0,
    retry: false,
  });

  const [visibleCols, setVisibleCols] = useState<string[]>(getStoredColumns);
  const [showColMenu, setShowColMenu] = useState(false);

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

  const filteredOrders = useMemo(() => {
    let visible = hiddenOrderIds.size > 0 ? ordersList.filter((o: any) => !hiddenOrderIds.has(o.id)) : ordersList;
    if (showDuplicatesOnly) visible = visible.filter((o: any) => (o.duplicateCount ?? 1) > 1);
    if (!Object.values(colFilters).some(v => v)) return visible;
    return visible.filter((o: any) => {
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
      return true;
    });
  }, [ordersList, colFilters, showDuplicatesOnly, hiddenOrderIds]);

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
          results: d.results ?? (prev as any).results,
          active:  !d.complete,
        } : null);
        if (d.complete) {
          es.close();
          // Invalidate order cache so the updated statuses appear immediately
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
          queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
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
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status });
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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o: any) => o.id)));
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
    setFilters(f => ({ ...f, [key]: value, page: key === 'page' ? value : 1 }));
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setFilters(f => ({ ...f, statusFilter: '', agentId: '', source: '', utmSource: '', utmCampaign: '', search: '', page: 1 }));
    setDateRange({ from: '', to: '' });
  };

  const hasActiveFilters = !!(filters.statusFilter || filters.agentId || filters.source || filters.utmSource || filters.utmCampaign || filters.search || dateRange.from || dateRange.to);

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

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-tight" data-testid="text-orders-title">{pageTitle}</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Commandes / {pageTitle}</p>
        </div>
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
            <Select value={String(filters.limit)} onValueChange={(v) => updateFilter('limit', Number(v))}>
              <SelectTrigger className="w-[72px] h-9 text-xs bg-background border-border/60" data-testid="filter-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
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

      <div className="hidden md:block bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
                </TableHead>
                {isColVisible('code') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Code</div>{showInlineFilters && renderColFilter('code', 'Filtr...')}</TableHead>}
                {isColVisible('destinataire') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Destinataire</div>{showInlineFilters && renderColFilter('destinataire', 'Filtr...')}</TableHead>}
                {isColVisible('telephone') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Téléphone</div>{showInlineFilters && renderColFilter('telephone', 'Filtr...')}</TableHead>}
                {isColVisible('ville') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Ville</div>{showInlineFilters && renderColFilter('ville', 'Filtr...')}</TableHead>}
                {isColVisible('produit') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Produit</div>{showInlineFilters && renderColFilter('produit', 'Filtr...')}</TableHead>}
                {isColVisible('actionBy') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider"><div>Action By</div>{showInlineFilters && renderColFilter('actionBy', 'Filtr...')}</TableHead>}
                {isColVisible('comment') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Comment</TableHead>}
                {isColVisible('livraison') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Livraison</TableHead>}
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
                  const rawName = order.rawProductName || order.items?.[0]?.rawProductName || order.items?.[0]?.product?.name || '-';
                  const rawVariant = order.items?.[0]?.variantInfo || '';
                  const variantAlreadyInName = rawVariant && rawName.includes(rawVariant);
                  const displayName = (rawVariant && rawVariant !== 'Default Title' && rawVariant !== 'null' && !variantAlreadyInName) ? `${rawName} - ${rawVariant}` : rawName;
                  const totalQty = (order.items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0) || order.rawQuantity || 1;
                  const productName = totalQty > 1 ? `${displayName} (x${totalQty})` : displayName;
                  const productRef = order.items?.[0]?.product?.sku || order.items?.map((i: any) => `qty:${i.quantity} #${i.productId}`).join(', ') || '-';
                  const agentName = order.agent?.username || '-';
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors text-xs" data-testid={`row-order-${order.id}`}>
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} data-testid={`checkbox-order-${order.id}`} />
                      </TableCell>
                      {isColVisible('code') && (
                        <TableCell className="whitespace-nowrap font-mono text-[10px]">
                          {(order as any).trackNumber
                            ? <span className="text-blue-600 dark:text-blue-400 font-semibold" title={`Tracking: ${(order as any).trackNumber}`}>{(order as any).trackNumber}</span>
                            : <span className="text-muted-foreground">{order.orderNumber || 'N/D'}</span>
                          }
                        </TableCell>
                      )}
                      {isColVisible('destinataire') && <TableCell className="whitespace-nowrap font-medium">{cleanCustomerName(order.customerName)}</TableCell>}
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
                      {isColVisible('produit') && <TableCell className="max-w-[120px] truncate text-[11px]">{productName}</TableCell>}
                      {isColVisible('actionBy') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          {agentName !== '-' ? (
                            <Badge variant="outline" className="text-[10px] font-medium">{agentName}</Badge>
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      )}
                      {isColVisible('comment') && <TableCell className="max-w-[120px] truncate text-muted-foreground text-[11px]">{order.comment || order.commentStatus || "-"}</TableCell>}
                      {isColVisible('livraison') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          {order.shippingProvider ? (() => {
                            const logo = getCarrierLogo(order.shippingProvider);
                            return logo
                              ? <img src={logo} alt={order.shippingProvider} style={{ maxHeight: 25, maxWidth: 70 }} className="object-contain mx-auto" />
                              : <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{order.shippingProvider}</Badge>;
                          })() : <span className="text-muted-foreground">-</span>}
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
                            <StatusBadge status={(order as any).trackNumber && order.commentStatus ? order.commentStatus : order.status} />
                          ) : (
                            <Select
                              value={order.status}
                              onValueChange={(newStatus) => {
                                console.log(`[STATUS CHANGE] order #${order.orderNumber} ${order.status} → ${newStatus}`);
                                handleStatusChange(order.id, newStatus);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[11px] border-0 bg-transparent p-0 shadow-none focus:ring-0 w-auto gap-1" data-testid={`status-select-${order.id}`}>
                                <StatusBadge status={(order as any).trackNumber && order.commentStatus ? order.commentStatus : order.status} className="cursor-pointer" />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_STATUSES.map(s => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      )}
                      {isColVisible('prix') && <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(order.totalPrice)}</TableCell>}
                      {isColVisible('adresse') && <TableCell className="max-w-[140px] truncate text-muted-foreground text-[11px]">{order.customerAddress || "-"}</TableCell>}
                      {isColVisible('reference') && <TableCell className="text-[10px] font-medium text-muted-foreground max-w-[100px] truncate">{productRef}</TableCell>}
                      {isColVisible('source') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          <span className="capitalize text-muted-foreground">{order.source || 'manual'}</span>
                        </TableCell>
                      )}
                      {isColVisible('utmSource') && (
                        <TableCell className="whitespace-nowrap text-[11px]">
                          {order.utmSource ? (
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] font-medium">{order.utmSource}</Badge>
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
            onClick={() => setShowColMenu(v => !v)}
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

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border/40 overflow-hidden"
                  data-testid={`card-order-${order.id}`}
                >
                  {/* ── TOP BAR: checkbox + phone + call icons + status ── */}
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    {!isMediaBuyer && (
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
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
                    <StatusBadge status={(order as any).trackNumber && order.commentStatus ? order.commentStatus : order.status} className="text-[10px] shrink-0 ml-1" />
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
                      <Badge className="text-[9px] font-mono bg-violet-50 text-violet-700 border-violet-200 ml-1">{order.utmSource}</Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground/70 font-medium capitalize">{order.source || 'manual'}</span>
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
                checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0}
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

          {/* Per-order error details — shown only when there are failures */}
          {shipProgress && !shipProgress.active && shipProgress.failed > 0 && shipProgress.results && (
            <div className="px-6 pb-2">
              <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1">
                <span>⚠️</span>
                <span>سبب الفشل — تفاصيل الأخطاء:</span>
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {shipProgress.results
                  .filter(r => r.status === 'failed')
                  .map((r, idx) => (
                    <div
                      key={r.orderId || idx}
                      className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm mt-0.5 shrink-0">❌</span>
                      <div className="min-w-0">
                        {r.orderNumber && (
                          <p className="text-xs font-bold text-red-700 dark:text-red-400">
                            #{r.orderNumber}
                          </p>
                        )}
                        <p className="text-xs text-red-600 dark:text-red-300 break-words leading-snug">
                          {r.error || "Erreur inconnue retournée par le transporteur."}
                        </p>
                      </div>
                    </div>
                  ))
                }
              </div>
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
              Seules les commandes avec le statut <Badge variant="outline" className="text-emerald-600 mx-1">confirmé</Badge> seront expédiées.
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

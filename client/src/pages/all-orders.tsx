import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAllOrders, useUpdateOrderStatus, useAssignAgent, useAgents, useIntegrations, useShipOrder, useUpdateOrder, useBulkAssign, useBulkShip, useStore, useFilterOptions } from "@/hooks/use-store-data";
import { OrderDetailsModal } from "@/components/order-details-modal";
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
import { Search, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, Pencil, Clock, Users, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Trash2, FileSpreadsheet, Headphones, ListOrdered, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { validateOrdersBatch, type OrderValidationResult } from "@/lib/shipping-guard";
import { getDefaultCitiesForCarrier } from "@/lib/carrier-cities";

const ALL_STATUSES = [
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
  { key: 'action', label: 'Action', locked: true },
] as const;

const DEFAULT_VISIBLE = ['code','destinataire','telephone','ville','produit','actionBy','comment','derniereAction','status','prix','adresse','reference','source','action'];

function cleanCustomerName(name: string): string {
  return (name || "").split(" ").map(p => p.trim()).filter(p => p !== "" && p !== "-" && p !== "–" && p !== "—").join(" ").trim();
}

function getStoredColumns(): string[] {
  try {
    const stored = localStorage.getItem('tajergrow_all_columns');
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

function normalizePhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('212')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export default function AllOrders() {
  const { data: storeData } = useStore();
  const whatsappLink = (phone: string, order: any) => buildWhatsappLink(phone, order, storeData?.whatsappTemplate);

  const [filters, setFilters] = useState({
    status: '',
    agentId: '',
    city: '',
    source: '',
    utmSource: '',
    utmCampaign: '',
    dateFrom: '',
    dateTo: '',
    search: '',
    page: 1,
    limit: 25,
  });

  const { data, isLoading } = useAllOrders(filters);
  const { data: agents } = useAgents();
  const { data: filterOptions } = useFilterOptions();
  const { data: shippingIntegrations } = useIntegrations("shipping");
  const updateStatus = useUpdateOrderStatus();
  const assignAgent = useAssignAgent();
  const shipOrder = useShipOrder();
  const updateOrder = useUpdateOrder();
  const bulkAssign = useBulkAssign();
  const bulkShip = useBulkShip();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [shippingProvider, setShippingProvider] = useState<string>("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkShipModal, setShowBulkShipModal] = useState(false);
  const [assignServiceType, setAssignServiceType] = useState("confirmation");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [bulkShipProvider, setBulkShipProvider] = useState("");
  const [bulkShipAccountId, setBulkShipAccountId] = useState<number | null>(null);
  const [shipValidation, setShipValidation] = useState<{
    valid: OrderValidationResult[];
    invalid: OrderValidationResult[];
    suggestOnly: OrderValidationResult[];
  } | null>(null);

  const { data: bulkCarrierData } = useQuery<{ provider: string | null; cities: string[]; isCarrierSpecific: boolean }>({
    queryKey: ["/api/carriers/cities", bulkShipProvider],
    queryFn: () =>
      bulkShipProvider
        ? fetch(`/api/carriers/cities?provider=${encodeURIComponent(bulkShipProvider)}`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve({ provider: null, cities: [], isCarrierSpecific: false }),
    enabled: !!bulkShipProvider,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeCarrierAccounts, isLoading: loadingCarrierAccounts } = useQuery<any[]>({
    queryKey: ["/api/shipping/active-accounts"],
    queryFn: async () => {
      // Primary: new dedicated endpoint (requires latest Railway deployment)
      const r1 = await fetch("/api/shipping/active-accounts", { credentials: "include" });
      if (r1.ok) {
        const data = await r1.json();
        console.log("[DEBUG-SHIPPING]: Carriers from /api/shipping/active-accounts:", data?.length, data);
        return Array.isArray(data) ? data : [];
      }
      // Fallback: old endpoint — works even on older Railway deployments
      console.warn("[DEBUG-SHIPPING]: /api/shipping/active-accounts returned", r1.status, "— falling back to /api/carrier-accounts");
      const r2 = await fetch("/api/carrier-accounts", { credentials: "include" });
      if (!r2.ok) return [];
      const data2 = await r2.json();
      const active = (Array.isArray(data2) ? data2 : []).filter(
        (a: any) => a.isActive === 1 || a.isActive === true || a.is_active === 1 || a.is_active === true
      );
      console.log("[DEBUG-SHIPPING]: Carriers from fallback /api/carrier-accounts:", active?.length, active);
      return active;
    },
    enabled: showBulkShipModal,
    staleTime: 0,
    retry: false,
  });

  // Auto-select the only account when there's exactly one
  useEffect(() => {
    if (!showBulkShipModal) return;
    if (activeCarrierAccounts?.length === 1 && !bulkShipAccountId) {
      const acct = activeCarrierAccounts[0];
      setBulkShipAccountId(acct.id);
      setBulkShipProvider(acct.carrierName);
    }
  }, [activeCarrierAccounts, showBulkShipModal]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<number>>(new Set());

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/orders/bulk-delete", { orderIds: ids }),
    onSuccess: (data: any, ids) => {
      const count = data?.deleted ?? ids.length;
      setHiddenOrderIds((prev: Set<number>) => new Set(Array.from(prev).concat(ids)));
      setSelectedIds(new Set<number>());
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast({ title: `${count} commande${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''} avec succès` });
    },
    onError: (err: any) => toast({ title: "Erreur de suppression", description: err.message || "Une erreur s'est produite.", variant: "destructive" }),
  });

  function handleBulkDelete() {
    if (selectedIds.size === 0) { toast({ title: "Sélectionnez des commandes à supprimer" }); return; }
    setShowDeleteModal(true);
  }

  function confirmDelete() {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
    setShowDeleteModal(false);
  }

  const [visibleCols, setVisibleCols] = useState<string[]>(getStoredColumns);
  const [showColMenu, setShowColMenu] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showInlineFilters, setShowInlineFilters] = useState(false);

  useEffect(() => {
    localStorage.setItem('tajergrow_all_columns', JSON.stringify(visibleCols));
  }, [visibleCols]);

  const toggleColumn = (key: string) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const resetColumns = () => setVisibleCols(DEFAULT_VISIBLE);
  const isColVisible = (key: string) => visibleCols.includes(key);

  const ordersList = data?.orders || [];
  const totalOrders = data?.total || 0;
  const totalPages = Math.ceil(totalOrders / filters.limit);

  const filteredOrders = useMemo(() => {
    let visible = hiddenOrderIds.size > 0 ? ordersList.filter((o: any) => !hiddenOrderIds.has(o.id)) : ordersList;
    if (!Object.values(colFilters).some(v => v)) return visible;
    return visible.filter((o: any) => {
      if (colFilters.code && !((o as any).trackNumber || o.orderNumber || '').toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.destinataire && !o.customerName?.toLowerCase().includes(colFilters.destinataire.toLowerCase())) return false;
      if (colFilters.telephone) {
        const ns = normalizePhone(colFilters.telephone);
        const np = normalizePhone(o.customerPhone || '');
        if (!np.includes(ns)) return false;
      }
      if (colFilters.ville && !o.customerCity?.toLowerCase().includes(colFilters.ville.toLowerCase())) return false;
      if (colFilters.produit) {
        const allNames = [o.rawProductName || '', ...(o.items || []).map((i: any) => i.rawProductName || i.product?.name || '')].join(' ').toLowerCase();
        if (!allNames.includes(colFilters.produit.toLowerCase())) return false;
      }
      if (colFilters.actionBy) {
        const agentName = o.agent?.username || '';
        if (!agentName.toLowerCase().includes(colFilters.actionBy.toLowerCase())) return false;
      }
      return true;
    });
  }, [ordersList, colFilters]);

  useEffect(() => {
    setSelectedIds(prev => {
      const visibleIds = new Set(filteredOrders.map((o: any) => o.id));
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size !== prev.size ? next : prev;
    });
  }, [filteredOrders]);

  // Pre-shipping validation — runs immediately using client-side city lists,
  // then upgrades to server-side list when bulkCarrierData arrives.
  useEffect(() => {
    if (!bulkShipProvider || !showBulkShipModal) { setShipValidation(null); return; }
    const selectedOrders = filteredOrders.filter((o: any) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) { setShipValidation(null); return; }

    // Use server cities if available; otherwise fall back to the client-side list instantly
    const cities         = bulkCarrierData?.cities         ?? getDefaultCitiesForCarrier(bulkShipProvider);
    const isCarrierSpec  = bulkCarrierData?.isCarrierSpecific
      ?? (getDefaultCitiesForCarrier(bulkShipProvider).length < 700); // not the generic list

    const results = validateOrdersBatch(selectedOrders, cities, isCarrierSpec);
    setShipValidation({
      invalid:     results.filter(r => !r.valid),
      suggestOnly: results.filter(r => r.valid && r.suggestedCity),
      valid:       results.filter(r => r.valid),
    });
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

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: "Statut mis à jour", description: `Commande changée en ${status}` });
        if (selectedOrder && selectedOrder.id === id) setSelectedOrder({ ...selectedOrder, status });
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

  const resetBulkShipModal = () => {
    setBulkShipProvider("");
    setBulkShipAccountId(null);
    setShipValidation(null);
  };

  const handleBulkShip = () => {
    if (!bulkShipProvider || selectedIds.size === 0) return;
    const selectedOrders = filteredOrders.filter((o: any) => selectedIds.has(o.id));
    const nonConfirmed = selectedOrders.filter((o: any) => o.status !== 'confirme');
    if (nonConfirmed.length > 0) {
      toast({
        title: "Attention",
        description: `${nonConfirmed.length} commande(s) n'ont pas le statut "confirmé" et ne seront pas expédiées. Seules les commandes confirmées seront envoyées.`,
        variant: "destructive",
      });
    }
    bulkShip.mutate({ orderIds: Array.from(selectedIds), provider: bulkShipProvider, accountId: bulkShipAccountId }, {
      onSuccess: (data) => {
        if (data.queued) {
          toast({ title: "Expédition lancée ✅", description: `${data.total} commande(s) en cours d'envoi en arrière-plan.` });
        } else {
          toast({ title: "Envoi réussi", description: `${data.shipped} commandes expédiées` });
        }
        setShowBulkShipModal(false);
        setSelectedIds(new Set());
        resetBulkShipModal();
      },
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const updateFilter = (key: string, value: any) => {
    setFilters(f => ({ ...f, [key]: value, page: key === 'page' ? value : 1 }));
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setFilters(f => ({ ...f, status: '', agentId: '', source: '', utmSource: '', utmCampaign: '', dateFrom: '', dateTo: '', search: '', page: 1 }));
  };

  const hasActiveFilters = !!(filters.status || filters.agentId || filters.source || filters.utmSource || filters.utmCampaign || filters.dateFrom || filters.dateTo || filters.search);

  const visibleCount = visibleCols.length;
  const colSpanTotal = visibleCount + 1;

  const renderColFilter = (key: string, placeholder: string) => (
    <Input
      placeholder={placeholder}
      value={colFilters[key] || ''}
      onChange={e => setColFilters(f => ({ ...f, [key]: e.target.value }))}
      className="h-6 text-[10px] bg-white dark:bg-card border-border/50 px-1.5 mt-0.5"
      data-testid={`all-col-filter-${key}`}
    />
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase flex items-center gap-2" data-testid="text-all-orders-title">
            <ListOrdered className="w-6 h-6 text-primary" />
            TOUTES LES COMMANDES
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Vue globale de toutes les commandes</p>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="text-xs mr-1" data-testid="all-badge-selected-count">{selectedIds.size} sélectionnée(s)</Badge>
          )}
          <Button variant="outline" size="icon" className="h-9 w-9 border-blue-200 text-blue-500 hover:bg-blue-50" title="Assigner" onClick={() => { if (selectedIds.size > 0) setShowAssignModal(true); else toast({ title: "Sélectionnez des commandes" }); }} data-testid="all-button-bulk-assign">
            <Headphones className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={`h-9 w-9 border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all ${selectedIds.size === 0 ? 'opacity-40' : 'opacity-100 hover:border-red-400'}`}
            title={selectedIds.size > 0 ? `Supprimer ${selectedIds.size} commande(s)` : "Sélectionnez des commandes"}
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
            data-testid="all-button-bulk-delete"
          >
            {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 border-green-200 text-green-600 hover:bg-green-50" title="Expédier" onClick={() => { if (selectedIds.size > 0) setShowBulkShipModal(true); else toast({ title: "Sélectionnez des commandes" }); }} data-testid="all-button-bulk-ship">
            <Truck className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 border-emerald-200 text-emerald-600 hover:bg-emerald-50 opacity-50 cursor-not-allowed" title="Exporter (bientôt)" disabled data-testid="all-button-export">
            <FileSpreadsheet className="w-4 h-4" />
          </Button>
          <Popover open={showColMenu} onOpenChange={setShowColMenu}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-gray-300 text-gray-600 hover:bg-gray-50" title="Colonnes" data-testid="all-button-columns-menu">
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end" data-testid="all-popover-columns">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-blue-600">Colonnes</span>
                <button onClick={resetColumns} className="text-muted-foreground hover:text-foreground" title="Réinitialiser" data-testid="all-button-reset-columns">
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
                      data-testid={`all-col-toggle-${col.key}`}
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

      <Card className="rounded-xl border border-border/60 shadow-sm bg-card" data-testid="all-card-filter-bar">
        <div className="px-4 py-3 flex flex-wrap items-end gap-3">

          {/* ── Menu (page size) ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Menu</span>
            <Select value={String(filters.limit)} onValueChange={(v) => updateFilter('limit', Number(v))}>
              <SelectTrigger className="w-[72px] h-9 text-xs bg-background border-border/60" data-testid="all-filter-page-size">
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
                data-testid="all-input-search-orders"
                placeholder="Nom, tél, référence..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="pl-8 h-9 text-xs bg-background border-border/60 w-full"
              />
            </div>
          </div>

          {/* ── Statut ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Statut</span>
            <Select value={filters.status || 'all'} onValueChange={(v) => updateFilter('status', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[160px]" data-testid="all-filter-status">
                <SelectValue placeholder="Tous statuts" />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Équipe ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Équipe</span>
            <Select value={filters.agentId || 'all'} onValueChange={(v) => updateFilter('agentId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[140px]" data-testid="all-filter-equipe">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {agents?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Type service ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Type service</span>
            <Select value={filters.source || 'all'} onValueChange={(v) => updateFilter('source', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[130px]" data-testid="all-filter-source">
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

          {/* ── UTM Source ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">UTM Source</span>
            <Select value={filters.utmSource || 'all'} onValueChange={(v) => updateFilter('utmSource', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[130px]" data-testid="all-filter-utm-source">
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

          {/* ── Campagne ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Campagne</span>
            <Select value={filters.utmCampaign || 'all'} onValueChange={(v) => updateFilter('utmCampaign', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border/60 w-[140px]" data-testid="all-filter-utm-campaign">
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

          {/* ── Date ── */}
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Date de début</span>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              className="w-[135px] h-9 text-xs bg-background border-border/60"
              data-testid="all-filter-date-from"
            />
          </div>

          <div className="flex flex-col shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 ml-0.5">Date de fin</span>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              className="w-[135px] h-9 text-xs bg-background border-border/60"
              data-testid="all-filter-date-to"
            />
          </div>

          {/* ── Reset — appears only when filters are active ── */}
          {hasActiveFilters && (
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-transparent mb-1">·</span>
              <button
                onClick={resetFilters}
                data-testid="all-button-reset-filters"
                className="h-9 px-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-red-100 dark:hover:bg-red-950/60 whitespace-nowrap"
                title="Réinitialiser tous les filtres"
              >
                <RotateCcw className="w-3 h-3" />
                Réinitialiser
              </button>
            </div>
          )}

        </div>
      </Card>

      <div className="hidden md:block bg-white dark:bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0} onCheckedChange={toggleAll} data-testid="all-checkbox-select-all" />
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
                {isColVisible('action') && <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Action</TableHead>}
              </TableRow>
              {!showInlineFilters && (
                <TableRow className="bg-muted/10 border-t-0">
                  <TableHead className="py-1 px-2">
                    <button onClick={() => setShowInlineFilters(true)} className="text-[9px] text-primary hover:underline" data-testid="all-button-show-inline-filters">Filtr.</button>
                  </TableHead>
                  {visibleCols.filter(c => c !== 'action').map(c => <TableHead key={c} className="py-1" />)}
                  {isColVisible('action') && <TableHead className="py-1" />}
                </TableRow>
              )}
              {showInlineFilters && (
                <TableRow className="bg-muted/10 border-t-0">
                  <TableHead className="py-1 px-2">
                    <button onClick={() => { setShowInlineFilters(false); setColFilters({}); }} className="text-[9px] text-red-500 hover:underline" data-testid="all-button-hide-inline-filters">×</button>
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
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors text-xs" data-testid={`all-row-order-${order.id}`}>
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} data-testid={`all-checkbox-order-${order.id}`} />
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
                            <a href={whatsappLink(order.customerPhone, order)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-500 hover:text-green-700" data-testid={`all-whatsapp-${order.id}`}>
                              <SiWhatsapp className="w-3.5 h-3.5" />
                            </a>
                            <a href={telLink(order.customerPhone)} onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700" data-testid={`all-phone-${order.id}`}>
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
                          {(() => {
                            const carrier = (order as any).carrierName || order.shippingProvider;
                            if (!carrier) return <span className="text-muted-foreground text-[10px]">Non assigné</span>;
                            const logo = getCarrierLogo(carrier);
                            return logo
                              ? <img src={logo} alt={carrier} style={{ maxHeight: 25, maxWidth: 70 }} className="object-contain mx-auto" />
                              : <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{carrier}</Badge>;
                          })()}
                        </TableCell>
                      )}
                      {isColVisible('derniereAction') && (
                        <TableCell className="whitespace-nowrap text-muted-foreground text-[11px]">
                          {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                        </TableCell>
                      )}
                      {isColVisible('status') && <TableCell><StatusBadge status={order.commentStatus || order.status} /></TableCell>}
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
                      {isColVisible('action') && (
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Voir" data-testid={`all-action-view-${order.id}`}>
                              <Eye className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Modifier" data-testid={`all-action-edit-${order.id}`}>
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-muted transition-colors" title="Historique" data-testid={`all-action-history-${order.id}`}>
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
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
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/10" data-testid="all-pagination-bar">
            <span className="text-xs text-muted-foreground">
              Page {filters.page} / {Math.max(totalPages, 1)} ({totalOrders} commandes)
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} data-testid="all-button-prev-page">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} data-testid="all-button-next-page">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Aucune commande trouvée.
          </div>
        ) : (
          filteredOrders.map((order: any) => (
            <Card key={order.id} className="p-3 rounded-xl border-border/50 shadow-sm" data-testid={`all-card-order-${order.id}`}>
              <div className="flex items-start gap-2 mb-2">
                <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} className="mt-1" data-testid={`all-checkbox-mobile-${order.id}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{order.customerName}</span>
                    <StatusBadge status={order.commentStatus || order.status} className="text-[10px] shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{order.customerPhone}</span>
                    <a href={telLink(order.customerPhone)} className="p-1 rounded-full bg-blue-100 text-blue-600" data-testid={`all-phone-mobile-${order.id}`}>
                      <Phone className="w-3 h-3" />
                    </a>
                    <a href={whatsappLink(order.customerPhone, order)} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full bg-green-100 text-green-600" data-testid={`all-whatsapp-mobile-${order.id}`}>
                      <SiWhatsapp className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{order.customerCity || "-"}</span>
                    <span className="text-right font-bold text-foreground">{formatCurrency(order.totalPrice)}</span>
                    <span className="truncate">{order.customerAddress || "-"}</span>
                    <span className="text-right text-[10px]">{order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "-"}</span>
                  </div>
                  {order.agent?.username && (
                    <Badge variant="outline" className="mt-1 text-[10px]">{order.agent.username}</Badge>
                  )}
                  {(() => {
                    const carrier = (order as any).carrierName || order.shippingProvider;
                    if (!carrier) return null;
                    const logo = getCarrierLogo(carrier);
                    return logo
                      ? <img src={logo} alt={carrier} style={{ maxHeight: 22, maxWidth: 60 }} className="mt-1 ml-1 object-contain inline-block" />
                      : <Badge className="mt-1 ml-1 bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{carrier}</Badge>;
                  })()}
                  {order.utmSource && (
                    <Badge className="mt-1 ml-1 bg-violet-100 text-violet-700 border-violet-200 text-[10px]">{order.utmSource}</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t pt-2">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openOrder(order)} data-testid={`all-view-mobile-${order.id}`}>
                  <Eye className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openOrder(order)} data-testid={`all-edit-mobile-${order.id}`}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground capitalize">{order.source || 'manual'}</span>
              </div>
            </Card>
          ))
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2" data-testid="all-pagination-bar-mobile">
            <span className="text-xs text-muted-foreground">Page {filters.page}/{totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)}>
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Préc
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)}>
                Suiv <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-md rounded-xl" data-testid="all-dialog-bulk-assign">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Assigner une équipe</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Assignez les commandes sélectionnées à un agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Type de service</label>
              <Select value={assignServiceType} onValueChange={setAssignServiceType}>
                <SelectTrigger className="bg-white dark:bg-card" data-testid="all-select-service-type">
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
                <SelectTrigger className="bg-white dark:bg-card" data-testid="all-select-assign-agent">
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
            <Button onClick={handleBulkAssign} disabled={!assignAgentId || bulkAssign.isPending} data-testid="all-button-confirm-assign">
              {bulkAssign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkShipModal} onOpenChange={(open) => { setShowBulkShipModal(open); if (!open) resetBulkShipModal(); }}>
        <DialogContent className="sm:max-w-lg rounded-xl" data-testid="all-dialog-bulk-ship">
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
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Société de livraison</label>

              {/* ── Loading state ── */}
              {loadingCarrierAccounts && (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des transporteurs...
                </div>
              )}

              {/* ── Empty state — no connected carriers ── */}
              {!loadingCarrierAccounts && activeCarrierAccounts?.length === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    Aucune société de livraison connectée.{" "}
                    <a href="/shipping-integrations" className="underline font-semibold hover:text-amber-900" onClick={() => setShowBulkShipModal(false)}>
                      Cliquez ici pour configurer
                    </a>
                  </span>
                </div>
              )}

              {/* ── Account selector ── */}
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
                    <SelectTrigger className="bg-white dark:bg-card" data-testid="all-select-bulk-ship-provider">
                      <SelectValue placeholder="Sélectionner un compte transporteur..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCarrierAccounts?.map((acct: any) => {
                        const logo = getCarrierLogo(acct.carrierName);
                        return (
                          <SelectItem key={acct.id} value={String(acct.id)} data-testid={`ship-account-${acct.id}`}>
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

            {bulkShipProvider && !bulkCarrierData && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Vérification des villes...
              </div>
            )}

            {bulkCarrierData && shipValidation && (
              <div className="space-y-3">
                {shipValidation.invalid.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {selectedIds.size} commande(s) validée(s) — prêtes à expédier
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {shipValidation.invalid.length} erreur(s) sur {selectedIds.size} commande(s)
                  </div>
                )}
                {shipValidation.invalid.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden max-h-52 overflow-y-auto">
                    <div className="px-3 py-2 bg-amber-100 border-b border-amber-200">
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#C5A059" }}>
                        À corriger avant envoi
                      </span>
                    </div>
                    {shipValidation.invalid.map(r => (
                      <div key={r.orderId} className="px-3 py-2.5 border-b border-amber-100 last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">{r.orderNumber} — {r.customerName}</p>
                            <div className="mt-1 space-y-0.5">
                              {r.cityError && <p className="text-[11px] text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3 shrink-0" />{r.cityError}</p>}
                              {r.phoneError && <p className="text-[11px] text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3 shrink-0" />{r.phoneError}</p>}
                              {r.addressError && <p className="text-[11px] text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3 shrink-0" />{r.addressError}</p>}
                            </div>
                            {r.suggestedCity && (
                              <p className="mt-1 text-[10px] text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                Suggestion : <strong>{r.suggestedCity}</strong>
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => { const o = filteredOrders.find((x: any) => x.id === r.orderId); if (o) { setShowBulkShipModal(false); openOrder(o); } }}
                            className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors"
                            style={{ color: "#C5A059", borderColor: "#C5A059", background: "rgba(197,160,89,0.08)" }}
                          >
                            Corriger
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {shipValidation.suggestOnly.length > 0 && shipValidation.invalid.length === 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                    <strong>Auto-correction</strong> : {shipValidation.suggestOnly.length} ville(s) seront corrigées automatiquement.
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">{selectedIds.size} commande(s) sélectionnée(s)</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowBulkShipModal(false); resetBulkShipModal(); }}>Annuler</Button>
            {shipValidation && shipValidation.invalid.length > 0 && shipValidation.valid.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  const validIds = new Set(shipValidation.valid.map(r => r.orderId));
                  setSelectedIds(validIds);
                  setTimeout(() => handleBulkShip(), 50);
                }}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Truck className="w-4 h-4 mr-1" />
                Valides seulement ({shipValidation.valid.length})
              </Button>
            )}
            <Button
              onClick={handleBulkShip}
              disabled={!bulkShipAccountId || bulkShip.isPending || (shipValidation !== null && shipValidation.invalid.length > 0 && shipValidation.valid.length === 0)}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
              data-testid="all-button-confirm-bulk-ship"
            >
              {bulkShip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              {shipValidation && shipValidation.invalid.length > 0 ? "Expédier quand même" : "Expédier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!open) setShowDeleteModal(false); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl border-none shadow-2xl p-0 overflow-hidden" data-testid="all-dialog-delete-confirm">
          <div className="bg-red-50 dark:bg-red-950/30 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-base font-bold text-red-700 dark:text-red-400">
                Confirmer la suppression
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-red-600/80 dark:text-red-400/80">
              Êtes-vous sûr de vouloir supprimer <strong>{selectedIds.size} commande{selectedIds.size > 1 ? 's' : ''}</strong> ? Cette action est irréversible et définitive.
            </DialogDescription>
          </div>
          <div className="px-6 py-4 flex justify-end gap-2 bg-background">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="rounded-lg" data-testid="all-btn-delete-cancel">
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={bulkDeleteMutation.isPending}
              className="rounded-lg gap-2"
              data-testid="all-btn-delete-confirm"
            >
              {bulkDeleteMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Suppression...</>
                : <><Trash2 className="w-4 h-4" /> Supprimer définitivement</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <OrderDetailsModal
        order={selectedOrder}
        storeName={storeData?.name}
        onClose={() => setSelectedOrder(null)}
        onUpdated={(updated) => setSelectedOrder((prev: any) => prev ? { ...prev, ...updated } : prev)}
      />
    </div>
  );
}

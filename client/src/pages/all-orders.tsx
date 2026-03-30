import { useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Search, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, Pencil, Clock, Users, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Trash2, FileSpreadsheet, Headphones, ListOrdered } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

const ALL_STATUSES = [
  { value: '', label: 'Tous les statuts' },
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'confirme', label: 'Confirmé' },
  { value: 'Injoignable', label: 'Injoignable' },
  { value: 'Annulé (fake)', label: 'Annulé (fake)' },
  { value: 'Annulé (faux numéro)', label: 'Annulé (faux numéro)' },
  { value: 'Annulé (double)', label: 'Annulé (double)' },
  { value: 'boite vocale', label: 'Boite vocale' },
  { value: 'in_progress', label: 'En cours / Expédié' },
  { value: 'Attente De Ramassage', label: 'Attente Ramassage' },
  { value: 'delivered', label: 'Livré' },
  { value: 'refused', label: 'Refusé' },
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
      if (colFilters.code && !o.orderNumber?.toLowerCase().includes(colFilters.code.toLowerCase())) return false;
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
    bulkShip.mutate({ orderIds: Array.from(selectedIds), provider: bulkShipProvider }, {
      onSuccess: (data) => {
        toast({ title: "Envoi réussi", description: `${data.shipped} commandes expédiées` });
        setShowBulkShipModal(false);
        setSelectedIds(new Set());
        setBulkShipProvider("");
      },
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const updateFilter = (key: string, value: any) => {
    setFilters(f => ({ ...f, [key]: value, page: key === 'page' ? value : 1 }));
    setSelectedIds(new Set());
  };

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

      <Card className="rounded-xl border-border/50 shadow-sm p-2.5 md:p-3" data-testid="all-card-filter-bar">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-1.5 md:gap-2 items-stretch md:items-center">
          <Select value={String(filters.limit)} onValueChange={(v) => updateFilter('limit', Number(v))}>
            <SelectTrigger className="w-full md:w-[70px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-0 md:max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-testid="all-input-search-orders"
              placeholder="Recherche..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-8 h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60"
            />
          </div>
          <Select value={filters.status || 'all'} onValueChange={(v) => updateFilter('status', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[150px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-status">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s.value || 'all'} value={s.value || 'all'}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.agentId || 'all'} onValueChange={(v) => updateFilter('agentId', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-equipe">
              <SelectValue placeholder="Tous les agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les agents</SelectItem>
              {agents?.map((a: any) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.source || 'all'} onValueChange={(v) => updateFilter('source', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[110px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-source">
              <SelectValue placeholder="Toutes Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes Sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="youcan">YouCan</SelectItem>
              <SelectItem value="woocommerce">WooCommerce</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.utmSource || 'all'} onValueChange={(v) => updateFilter('utmSource', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-utm-source">
              <SelectValue placeholder="UTM Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">UTM Source</SelectItem>
              {filterOptions?.utmSources?.map((s: string) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.utmCampaign || 'all'} onValueChange={(v) => updateFilter('utmCampaign', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-utm-campaign">
              <SelectValue placeholder="UTM Campagne" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">UTM Campagne</SelectItem>
              {filterOptions?.utmCampaigns?.map((c: string) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full md:w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-date-from" />
          <Input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full md:w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="all-filter-date-to" />
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
                  const displayName = (rawVariant && rawVariant !== 'Default Title' && rawVariant !== 'null') ? `${rawName} - ${rawVariant}` : rawName;
                  const totalQty = (order.items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0) || order.rawQuantity || 1;
                  const productName = totalQty > 1 ? `${displayName} (x${totalQty})` : displayName;
                  const productRef = order.items?.[0]?.product?.sku || order.items?.map((i: any) => `qty:${i.quantity} #${i.productId}`).join(', ') || '-';
                  const agentName = order.agent?.username || '-';
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors text-xs" data-testid={`all-row-order-${order.id}`}>
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} data-testid={`all-checkbox-order-${order.id}`} />
                      </TableCell>
                      {isColVisible('code') && <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-[10px]">{order.orderNumber || 'N/D'}</TableCell>}
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
                      {isColVisible('status') && <TableCell><StatusBadge status={order.status} /></TableCell>}
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
                    <StatusBadge status={order.status} className="text-[10px] shrink-0" />
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
                  {order.shippingProvider && (() => {
                    const logo = getCarrierLogo(order.shippingProvider);
                    return logo
                      ? <img src={logo} alt={order.shippingProvider} style={{ maxHeight: 22, maxWidth: 60 }} className="mt-1 ml-1 object-contain inline-block" />
                      : <Badge className="mt-1 ml-1 bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{order.shippingProvider}</Badge>;
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

      <Dialog open={showBulkShipModal} onOpenChange={setShowBulkShipModal}>
        <DialogContent className="sm:max-w-md rounded-xl" data-testid="all-dialog-bulk-ship">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Expédier les commandes</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Seules les commandes confirmées seront expédiées</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              ⚠️ Seules les commandes avec le statut <Badge variant="outline" className="text-emerald-600 mx-1">confirmé</Badge> seront expédiées. Les commandes avec d'autres statuts seront ignorées.
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Transporteur</label>
              <Select value={bulkShipProvider} onValueChange={setBulkShipProvider}>
                <SelectTrigger className="bg-white dark:bg-card" data-testid="all-select-bulk-ship-provider">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {shippingIntegrations?.map((si: any) => (
                    <SelectItem key={si.provider} value={si.provider}>{si.provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{selectedIds.size} commande(s) sélectionnée(s)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkShipModal(false)}>Annuler</Button>
            <Button onClick={handleBulkShip} disabled={!bulkShipProvider || bulkShip.isPending} className="bg-indigo-500 hover:bg-indigo-600 text-white" data-testid="all-button-confirm-bulk-ship">
              {bulkShip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              Expédier
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

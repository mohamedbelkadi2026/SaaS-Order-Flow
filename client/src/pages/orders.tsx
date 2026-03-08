import { useState, useMemo } from "react";
import { useFilteredOrders, useUpdateOrderStatus, useAssignAgent, useAgents, useIntegrations, useShipOrder, useUpdateOrder, useBulkAssign, useBulkShip } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge, ORDER_STATUSES } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Search, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, Pencil, Clock, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useRoute } from "wouter";

const STATUS_MAP: Record<string, string> = {
  confirme: "confirme",
  injoignable: "Injoignable",
  annules: "annule_group",
  "boite-vocale": "boite vocale",
  "en-cours": "in_progress",
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
  livrees: "LIVRÉES",
  refuses: "REFUSÉES",
};

function formatPhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/^0/, '+212');
}

function whatsappLink(phone: string, customerName: string) {
  const cleaned = formatPhone(phone).replace('+', '');
  const msg = encodeURIComponent(`Bonjour ${customerName}, nous vous contactons pour confirmer votre commande. Merci de nous confirmer votre adresse de livraison.`);
  return `https://wa.me/${cleaned}?text=${msg}`;
}

function telLink(phone: string) {
  return `tel:${formatPhone(phone)}`;
}

export default function Orders() {
  const [, params] = useRoute("/orders/:filter");
  const filterKey = params?.filter || "";
  const urlStatus = STATUS_MAP[filterKey] || (filterKey ? filterKey : "nouveau");

  const [filters, setFilters] = useState({
    status: urlStatus,
    agentId: '',
    city: '',
    source: '',
    dateFrom: '',
    dateTo: '',
    search: '',
    page: 1,
    limit: 25,
  });

  const actualFilters = useMemo(() => ({
    ...filters,
    status: urlStatus,
  }), [filters, urlStatus]);

  const { data, isLoading } = useFilteredOrders(actualFilters);
  const { data: agents } = useAgents();
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

  const [colSearch, setColSearch] = useState('');
  const colSearchDebounced = useMemo(() => colSearch, [colSearch]);

  const ordersList = data?.orders || [];
  const totalOrders = data?.total || 0;
  const totalPages = Math.ceil(totalOrders / filters.limit);
  const filteredOrders = ordersList;

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

  const pageTitle = TITLE_MAP[filterKey] || "NOUVELLES";

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase" data-testid="text-orders-title">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Commandes / {pageTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Badge variant="secondary" className="text-xs" data-testid="badge-selected-count">{selectedIds.size} sélectionnée(s)</Badge>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Assigner" onClick={() => setShowAssignModal(true)} data-testid="button-bulk-assign">
                <Users className="w-4 h-4" />
              </Button>
              {shippingIntegrations?.length > 0 && (
                <Button variant="outline" size="icon" className="h-9 w-9" title="Expédier" onClick={() => setShowBulkShipModal(true)} data-testid="button-bulk-ship">
                  <Truck className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Card className="rounded-xl border-border/50 shadow-sm p-2.5 md:p-3" data-testid="card-orders-filter-bar">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-1.5 md:gap-2 items-stretch md:items-center">
          <div className="relative flex-1 min-w-0 md:max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-testid="input-search-orders"
              placeholder="Recherche..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-8 h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60"
            />
          </div>
          <Select value={filters.agentId || 'all'} onValueChange={(v) => updateFilter('agentId', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full md:w-auto md:min-w-[140px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-equipe">
              <SelectValue placeholder="Toutes les Équipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les Équipes</SelectItem>
              {agents?.map((a: any) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full md:w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-date-from" />
          <Input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full md:w-[130px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-date-to" />
          <Select value={String(filters.limit)} onValueChange={(v) => updateFilter('limit', Number(v))}>
            <SelectTrigger className="w-full md:w-[80px] h-8 text-[11px] md:text-xs bg-white dark:bg-card border-border/60" data-testid="filter-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="hidden md:block bg-white dark:bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Code</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Destinataire</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Téléphone</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Ville</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Comment</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Dernière action</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Prix</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Adresse</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Référence</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12}><div className="h-10 w-full bg-muted rounded animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Aucune commande trouvée.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => {
                  const productRef = order.items?.[0]?.product?.sku || order.items?.[0]?.product?.name || '-';
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors text-xs" data-testid={`row-order-${order.id}`}>
                      <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} data-testid={`checkbox-order-${order.id}`} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-[10px]">{order.orderNumber || 'N/D'}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{order.customerName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px]">{order.customerPhone}</span>
                          <a href={whatsappLink(order.customerPhone, order.customerName)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-500 hover:text-green-700" data-testid={`whatsapp-${order.id}`}>
                            <SiWhatsapp className="w-3.5 h-3.5" />
                          </a>
                          <a href={telLink(order.customerPhone)} onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700" data-testid={`phone-${order.id}`}>
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{order.customerCity || "-"}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground text-[11px]">{order.comment || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-[11px]">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                      </TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(order.totalPrice)}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground text-[11px]">{order.customerAddress || "-"}</TableCell>
                      <TableCell className="text-[10px] font-medium text-muted-foreground max-w-[100px] truncate">{productRef}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Voir" data-testid={`action-view-${order.id}`}>
                            <Eye className="w-3.5 h-3.5 text-blue-500" />
                          </button>
                          <button onClick={() => openOrder(order)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Modifier" data-testid={`action-edit-${order.id}`}>
                            <Pencil className="w-3.5 h-3.5 text-amber-500" />
                          </button>
                          <button className="p-1.5 rounded hover:bg-muted transition-colors" title="Historique" data-testid={`action-history-${order.id}`}>
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/10" data-testid="pagination-bar">
            <span className="text-xs text-muted-foreground">
              Page {filters.page} / {totalPages} ({totalOrders} commandes)
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
            <Card key={order.id} className="p-3 rounded-xl border-border/50 shadow-sm" data-testid={`card-order-${order.id}`}>
              <div className="flex items-start gap-2 mb-2">
                <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} className="mt-1" data-testid={`checkbox-mobile-${order.id}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{order.customerName}</span>
                    <StatusBadge status={order.status} className="text-[10px] shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{order.customerPhone}</span>
                    <a href={telLink(order.customerPhone)} className="p-1 rounded-full bg-blue-100 text-blue-600" data-testid={`phone-mobile-${order.id}`}>
                      <Phone className="w-3 h-3" />
                    </a>
                    <a href={whatsappLink(order.customerPhone, order.customerName)} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full bg-green-100 text-green-600" data-testid={`whatsapp-mobile-${order.id}`}>
                      <SiWhatsapp className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{order.customerCity || "-"}</span>
                    <span className="text-right font-bold text-foreground">{formatCurrency(order.totalPrice)}</span>
                    <span className="truncate">{order.customerAddress || "-"}</span>
                    <span className="text-right text-[10px]">{order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "-"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t pt-2">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openOrder(order)} data-testid={`view-mobile-${order.id}`}>
                  <Eye className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openOrder(order)} data-testid={`edit-mobile-${order.id}`}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground capitalize">{order.source || 'manual'}</span>
              </div>
            </Card>
          ))
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2" data-testid="pagination-bar-mobile">
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
        <DialogContent className="sm:max-w-md rounded-xl" data-testid="dialog-bulk-assign">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Assigner une équipe</DialogTitle>
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

      <Dialog open={showBulkShipModal} onOpenChange={setShowBulkShipModal}>
        <DialogContent className="sm:max-w-md rounded-xl" data-testid="dialog-bulk-ship">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Expédier les commandes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Seules les commandes avec le statut <Badge variant="outline" className="text-emerald-600 mx-1">confirmé</Badge> seront expédiées.</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Transporteur</label>
              <Select value={bulkShipProvider} onValueChange={setBulkShipProvider}>
                <SelectTrigger className="bg-white dark:bg-card" data-testid="select-bulk-ship-provider">
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
            <Button onClick={handleBulkShip} disabled={!bulkShipProvider || bulkShip.isPending} className="bg-indigo-500 hover:bg-indigo-600 text-white" data-testid="button-confirm-bulk-ship">
              {bulkShip.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
              Expédier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}>
        {selectedOrder && (
          <DialogContent className="sm:max-w-3xl rounded-2xl overflow-hidden p-0 border-none shadow-2xl max-h-[95vh]">
            <div className="bg-white dark:bg-card border-b p-4 sm:p-6 flex justify-between items-center">
              <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Détails de la commande</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(null)}><XCircle className="w-6 h-6" /></Button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[80vh] bg-[#f8f9fc] dark:bg-muted/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Nom du client</label>
                    <Input data-testid="input-edit-customer-name" value={editFields.customerName} onChange={e => setEditFields(f => ({ ...f, customerName: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                    <Input data-testid="input-edit-customer-phone" value={editFields.customerPhone} onChange={e => setEditFields(f => ({ ...f, customerPhone: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Adresse</label>
                    <Input data-testid="input-edit-customer-address" value={editFields.customerAddress} onChange={e => setEditFields(f => ({ ...f, customerAddress: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Ville</label>
                    <Input data-testid="input-edit-customer-city" value={editFields.customerCity} onChange={e => setEditFields(f => ({ ...f, customerCity: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Statut</label>
                    <Select defaultValue={selectedOrder.status} onValueChange={(v) => handleStatusChange(selectedOrder.id, v)}>
                      <SelectTrigger className="bg-white dark:bg-card" data-testid="select-order-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Agent assigné</label>
                    <Select 
                      defaultValue={selectedOrder.assignedToId?.toString() || "unassigned"} 
                      onValueChange={(val) => assignAgent.mutate({ id: selectedOrder.id, agentId: val === "unassigned" ? null : parseInt(val) })}
                    >
                      <SelectTrigger className="bg-white dark:bg-card" data-testid="select-order-agent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Non assigné</SelectItem>
                        {agents?.map((agent: any) => (
                          <SelectItem key={agent.id} value={agent.id.toString()}>{agent.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Prix Total</label>
                    <Input value={formatCurrency(selectedOrder.totalPrice)} className="bg-white dark:bg-card" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Frais de livraison (MAD)</label>
                    <Input data-testid="input-edit-shipping-cost" type="number" step="0.01" value={editFields.shippingCost} onChange={e => setEditFields(f => ({ ...f, shippingCost: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Source</label>
                    <Input defaultValue={selectedOrder.source || 'manual'} className="bg-white dark:bg-card" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Commentaire</label>
                    <Input data-testid="input-edit-comment" value={editFields.comment} onChange={e => setEditFields(f => ({ ...f, comment: e.target.value }))} className="bg-white dark:bg-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Détails</label>
                    <textarea className="w-full min-h-[60px] p-3 rounded-md border border-input bg-white dark:bg-card text-sm" readOnly defaultValue={`#${selectedOrder.orderNumber}`} />
                  </div>
                </div>
              </div>

              {hasEdits && (
                <div className="mt-4 flex justify-end">
                  <Button data-testid="button-save-order-edits" onClick={handleSaveEdits} disabled={updateOrder.isPending} className="gap-2">
                    {updateOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Sauvegarder
                  </Button>
                </div>
              )}

              <div className="mt-6">
                <div className="flex items-center gap-2 text-primary font-bold mb-3">
                  <ShoppingBag className="w-5 h-5" /> Articles <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{selectedOrder.items?.length || 0}</span>
                </div>
                <div className="bg-white dark:bg-card rounded-xl border p-3 space-y-3">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-3 items-center text-sm">
                      <Input value={item.product?.name || 'Produit'} className="flex-[2]" readOnly />
                      <Input value={`${(item.price / 100).toFixed(2)} MAD`} className="flex-1" readOnly />
                      <Input value={`x${item.quantity}`} className="w-14" readOnly />
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.trackNumber && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                    <Truck className="w-4 h-4" /> Livraison
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs block">Transporteur</span>
                      <Badge variant="outline" className="capitalize mt-1">{selectedOrder.shippingProvider}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">N° Suivi</span>
                      <span className="font-mono font-bold text-xs mt-1 block">{selectedOrder.trackNumber}</span>
                    </div>
                    {selectedOrder.labelLink && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Étiquette</span>
                        <a href={selectedOrder.labelLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 text-xs font-semibold mt-1 hover:underline">
                          <ExternalLink className="w-3 h-3" /> PDF
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(selectedOrder.status === 'confirme' || selectedOrder.status === 'nouveau') && !selectedOrder.trackNumber && shippingIntegrations?.length > 0 && (
                <div className="mt-4 bg-muted/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Truck className="w-4 h-4 text-primary" /> Envoyer en livraison
                  </div>
                  <div className="flex gap-3">
                    <Select value={shippingProvider} onValueChange={setShippingProvider}>
                      <SelectTrigger className="flex-1 bg-white dark:bg-card" data-testid="select-shipping-provider">
                        <SelectValue placeholder="Transporteur..." />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingIntegrations.map((si: any) => (
                          <SelectItem key={si.provider} value={si.provider}>{si.provider}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button data-testid="button-ship-order" className="bg-indigo-500 hover:bg-indigo-600 text-white" disabled={!shippingProvider || shipOrder.isPending}
                      onClick={() => {
                        shipOrder.mutate({ id: selectedOrder.id, provider: shippingProvider }, {
                          onSuccess: (data) => {
                            toast({ title: "Envoyé!", description: `Tracking: ${data.trackingNumber}` });
                            setSelectedOrder({ ...selectedOrder, trackNumber: data.trackingNumber, labelLink: data.labelLink, shippingProvider: data.provider, status: 'in_progress' });
                            setShippingProvider("");
                          },
                          onError: (err: any) => toast({ title: "Erreur", description: err.message || "Erreur d'envoi", variant: "destructive" }),
                        });
                      }}
                    >
                      {shipOrder.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
                      Envoyer
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button data-testid="button-confirm-order" className="bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm" onClick={() => handleStatusChange(selectedOrder.id, 'confirme')} disabled={updateStatus.isPending}>
                  Confirmer
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm" onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')} disabled={updateStatus.isPending}>
                  En cours
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm" onClick={() => handleStatusChange(selectedOrder.id, 'Annulé (fake)')} disabled={updateStatus.isPending}>
                  Annuler
                </Button>
                <Button className="bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm" onClick={() => handleStatusChange(selectedOrder.id, 'refused')} disabled={updateStatus.isPending}>
                  Refuser
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useOrders, useUpdateOrderStatus, useAssignAgent, useAgents, useIntegrations, useShipOrder, useUpdateOrder } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge, ORDER_STATUSES } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Search, Filter, AlertCircle, ShoppingBag, XCircle, Truck, ExternalLink, Loader2, Save, Phone, Eye, RotateCcw } from "lucide-react";
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
  const statusFilter = STATUS_MAP[filterKey] || (filterKey ? filterKey : undefined);
  
  const { data: orders, isLoading } = useOrders(statusFilter || "nouveau");
  const { data: agents } = useAgents();
  const { data: shippingIntegrations } = useIntegrations("shipping");
  const updateStatus = useUpdateOrderStatus();
  const assignAgent = useAssignAgent();
  const shipOrder = useShipOrder();
  const updateOrder = useUpdateOrder();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [shippingProvider, setShippingProvider] = useState<string>("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});

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
    const data: any = {};
    if (editFields.customerName !== (selectedOrder.customerName || "")) data.customerName = editFields.customerName;
    if (editFields.customerPhone !== (selectedOrder.customerPhone || "")) data.customerPhone = editFields.customerPhone;
    if (editFields.customerAddress !== (selectedOrder.customerAddress || "")) data.customerAddress = editFields.customerAddress;
    if (editFields.customerCity !== (selectedOrder.customerCity || "")) data.customerCity = editFields.customerCity;
    if (editFields.comment !== (selectedOrder.comment || "")) data.comment = editFields.comment;
    const newShipping = Math.round(parseFloat(editFields.shippingCost || "0") * 100);
    if (newShipping !== (selectedOrder.shippingCost || 0)) data.shippingCost = newShipping;

    updateOrder.mutate({ id: selectedOrder.id, ...data }, {
      onSuccess: () => {
        toast({ title: "Commande mise \u00e0 jour" });
        setSelectedOrder({ ...selectedOrder, ...data, ...(data.shippingCost !== undefined ? { shippingCost: data.shippingCost } : {}) });
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" }),
    });
  };

  const allOrders = orders || [];

  const filteredOrders = allOrders.filter((o: any) => 
    !search || 
    o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerPhone?.includes(search) ||
    (o.customerCity && o.customerCity.toLowerCase().includes(search.toLowerCase()))
  );

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: "Statut mis \u00e0 jour", description: `Commande chang\u00e9e en ${status}` });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status });
        }
      }
    });
  };

  const pageTitle = TITLE_MAP[filterKey] || "NOUVELLES";

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase" data-testid="text-orders-title">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm mt-1">Commandes / {pageTitle}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              data-testid="input-search-orders"
              placeholder="Recherche rapide..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border"
            />
          </div>
          <Button variant="outline" size="icon" className="shrink-0"><Filter className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="hidden md:block bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold">Destinataire</TableHead>
                <TableHead className="font-semibold">T\u00e9l\u00e9phone</TableHead>
                <TableHead className="font-semibold">Ville</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Prix</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><div className="h-12 w-full bg-muted rounded animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Aucune commande trouv\u00e9e.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => (
                  <TableRow 
                    key={order.id} 
                    className="hover:bg-muted/20 transition-colors group cursor-pointer text-xs" 
                    onClick={() => openOrder(order)}
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell className="whitespace-nowrap font-medium">{order.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {order.customerPhone}
                        <a href={telLink(order.customerPhone)} onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a href={whatsappLink(order.customerPhone, order.customerName)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-500 hover:text-green-700">
                          <SiWhatsapp className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerCity || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground capitalize">{order.source || 'manual'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                    </TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="font-semibold">{formatCurrency(order.totalPrice)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-[10px]">
                      #{order.orderNumber}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Aucune commande trouv\u00e9e.
          </div>
        ) : (
          filteredOrders.map((order: any) => (
            <Card key={order.id} className="p-4 rounded-xl border-border/50 shadow-sm" data-testid={`card-order-${order.id}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm">{order.customerPhone}</span>
                  <a href={telLink(order.customerPhone)} className="p-1.5 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors" data-testid={`phone-${order.id}`}>
                    <Phone className="w-4 h-4" />
                  </a>
                  <a href={whatsappLink(order.customerPhone, order.customerName)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors" data-testid={`whatsapp-${order.id}`}>
                    <SiWhatsapp className="w-4 h-4" />
                  </a>
                </div>
                <StatusBadge status={order.status} className="text-[10px]" />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                <div className="font-medium">{order.customerName}</div>
                <div className="font-bold text-right">{formatCurrency(order.totalPrice)}</div>
                <div className="text-muted-foreground font-semibold">{order.customerCity || "-"}</div>
                <div className="text-muted-foreground text-right text-xs">
                  {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}
                </div>
              </div>

              <div className="text-xs text-muted-foreground truncate mb-3">
                {order.items?.[0]?.product?.name || order.comment || `#${order.orderNumber}`}
              </div>

              <div className="flex items-center gap-2 border-t pt-2">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => handleStatusChange(order.id, 'nouveau')} data-testid={`retry-${order.id}`}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => openOrder(order)} data-testid={`view-${order.id}`}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="capitalize">{order.source || 'manual'}</span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}>
        {selectedOrder && (
          <DialogContent className="sm:max-w-3xl rounded-2xl overflow-hidden p-0 border-none shadow-2xl max-h-[95vh]">
            <div className="bg-white dark:bg-card border-b p-4 sm:p-6 flex justify-between items-center">
              <DialogTitle className="text-lg sm:text-xl font-bold text-primary">D\u00e9tails de la commande</DialogTitle>
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
                    <label className="text-xs font-bold text-muted-foreground uppercase">T\u00e9l\u00e9phone</label>
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
                    <label className="text-xs font-bold text-muted-foreground uppercase">Agent assign\u00e9</label>
                    <Select 
                      defaultValue={selectedOrder.assignedToId?.toString() || "unassigned"} 
                      onValueChange={(val) => assignAgent.mutate({ id: selectedOrder.id, agentId: val === "unassigned" ? null : parseInt(val) })}
                    >
                      <SelectTrigger className="bg-white dark:bg-card" data-testid="select-order-agent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Non assign\u00e9</SelectItem>
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
                    <label className="text-xs font-bold text-muted-foreground uppercase">D\u00e9tails</label>
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
                        <span className="text-muted-foreground text-xs block">\u00c9tiquette</span>
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
                            toast({ title: "Envoy\u00e9!", description: `Tracking: ${data.trackingNumber}` });
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
                <Button className="bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm" onClick={() => handleStatusChange(selectedOrder.id, 'Annul\u00e9 (fake)')} disabled={updateStatus.isPending}>
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

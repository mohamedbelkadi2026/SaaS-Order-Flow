import { useState } from "react";
import { useOrders, useUpdateOrderStatus, useAssignAgent, useAgents } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Filter, AlertCircle, ShoppingBag, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRoute } from "wouter";

const STATUS_MAP: Record<string, string> = {
  confirmation: "confirmed",
  annules: "cancelled",
  suivies: "in_progress",
  livrees: "delivered",
};

const TITLE_MAP: Record<string, string> = {
  "": "NOUVELLES",
  confirmation: "CONFIRMÉES",
  annules: "ANNULÉES",
  suivies: "SUIVIES",
  livrees: "LIVRÉES",
};

export default function Orders() {
  const [, params] = useRoute("/orders/:filter");
  const filterKey = params?.filter || "";
  const statusFilter = STATUS_MAP[filterKey] || (filterKey ? filterKey : undefined);
  
  const { data: orders, isLoading } = useOrders(statusFilter || "new");
  const { data: agents } = useAgents();
  const updateStatus = useUpdateOrderStatus();
  const assignAgent = useAssignAgent();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const filteredOrders = orders?.filter((o: any) => 
    o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerPhone?.includes(search) ||
    (o.customerCity && o.customerCity.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: "Statut mis à jour", description: `Commande changée en ${status}` });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status });
        }
      }
    });
  };

  const pageTitle = TITLE_MAP[filterKey] || "NOUVELLES";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase" data-testid="text-orders-title">{pageTitle}</h1>
          <p className="text-muted-foreground mt-1">Commandes / {pageTitle}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              data-testid="input-search-orders"
              placeholder="Rechercher..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border"
            />
          </div>
          <Button variant="outline" size="icon" className="shrink-0"><Filter className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[60px] font-semibold">Code</TableHead>
                <TableHead className="font-semibold">Destinataire</TableHead>
                <TableHead className="font-semibold">Téléphone</TableHead>
                <TableHead className="font-semibold">Ville</TableHead>
                <TableHead className="font-semibold">Boutique</TableHead>
                <TableHead className="font-semibold">Dernière action</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Prix</TableHead>
                <TableHead className="font-semibold">Adresse</TableHead>
                <TableHead className="font-semibold">Infos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={10}><div className="h-12 w-full bg-muted rounded animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Aucune commande trouvée.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => (
                  <TableRow 
                    key={order.id} 
                    className="hover:bg-muted/20 transition-colors group cursor-pointer text-xs" 
                    onClick={() => setSelectedOrder(order)}
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell className="font-medium whitespace-nowrap">N/D</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{order.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerPhone}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerCity || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{order.source === 'shopify' ? 'Shopify' : 'promomarkett'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                    </TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="font-semibold">{(order.totalPrice / 100).toFixed(2)}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{order.customerAddress || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-[10px]">
                      qty: {order.items?.[0]?.quantity || 1} #{order.orderNumber}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        {selectedOrder && (
          <DialogContent className="sm:max-w-3xl rounded-2xl overflow-hidden p-0 border-none shadow-2xl">
            <div className="bg-white border-b p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold text-primary">Détails de la commande</h2>
              <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(null)}><XCircle className="w-6 h-6" /></Button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[80vh] bg-[#f8f9fc]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Nom du client</label>
                    <Input defaultValue={selectedOrder.customerName} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                    <Input defaultValue={selectedOrder.customerPhone} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Adresse</label>
                    <Input defaultValue={selectedOrder.customerAddress || ""} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Ville</label>
                    <Input defaultValue={selectedOrder.customerCity || ""} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Statut</label>
                    <Select defaultValue={selectedOrder.status} onValueChange={(v) => handleStatusChange(selectedOrder.id, v)}>
                      <SelectTrigger className="bg-white" data-testid="select-order-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Nouveau</SelectItem>
                        <SelectItem value="confirmed">Confirmé</SelectItem>
                        <SelectItem value="in_progress">En cours</SelectItem>
                        <SelectItem value="delivered">Livré</SelectItem>
                        <SelectItem value="cancelled">Annulé</SelectItem>
                        <SelectItem value="refused">Refusé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Agent assigné</label>
                    <Select 
                      defaultValue={selectedOrder.assignedToId?.toString() || "unassigned"} 
                      onValueChange={(val) => assignAgent.mutate({ id: selectedOrder.id, agentId: val === "unassigned" ? null : parseInt(val) })}
                    >
                      <SelectTrigger className="bg-white" data-testid="select-order-agent">
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
                  <div className="flex justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold">can open :</label>
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-5 ${selectedOrder.canOpen ? 'bg-green-400' : 'bg-red-400'} rounded-full relative`}>
                          <div className={`absolute ${selectedOrder.canOpen ? 'right-1' : 'left-1'} top-1 w-3 h-3 bg-white rounded-full`}></div>
                        </div>
                        <span className={`text-xs font-bold ${selectedOrder.canOpen ? 'text-green-400' : 'text-red-400'}`}>{selectedOrder.canOpen ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold">Up Sell :</label>
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-5 ${selectedOrder.upSell ? 'bg-green-400' : 'bg-red-400'} rounded-full relative`}>
                          <div className={`absolute ${selectedOrder.upSell ? 'right-1' : 'left-1'} top-1 w-3 h-3 bg-white rounded-full`}></div>
                        </div>
                        <span className={`text-xs font-bold ${selectedOrder.upSell ? 'text-green-400' : 'text-red-400'}`}>{selectedOrder.upSell ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Prix</label>
                    <Input defaultValue={(selectedOrder.totalPrice / 100).toFixed(2)} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Source</label>
                    <Input defaultValue={selectedOrder.source || 'manual'} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Commentaire</label>
                    <Input defaultValue={selectedOrder.comment || ""} className="bg-white" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Détails</label>
                    <textarea 
                      className="w-full min-h-[80px] p-3 rounded-md border border-input bg-white text-sm"
                      readOnly
                      defaultValue={`quantity: ${selectedOrder.items?.[0]?.quantity || 1}\norder_number: ${selectedOrder.orderNumber}`}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center gap-2 text-primary font-bold mb-4">
                  <ShoppingBag className="w-5 h-5" /> Articles <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{selectedOrder.items?.length || 0}</span>
                </div>
                <div className="bg-white rounded-xl border p-4 space-y-4">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-center">
                      <Input value={item.product?.name || 'Produit'} className="flex-[2]" readOnly />
                      <Input value={`${(item.price / 100).toFixed(2)} MAD`} className="flex-1" readOnly />
                      <Input value={`x${item.quantity}`} className="w-16" readOnly />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-3">
                <Button
                  data-testid="button-confirm-order"
                  className="bg-green-500 hover:bg-green-600 text-white"
                  onClick={() => handleStatusChange(selectedOrder.id, 'confirmed')}
                  disabled={updateStatus.isPending}
                >
                  Confirmer
                </Button>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')}
                  disabled={updateStatus.isPending}
                >
                  En cours
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                  disabled={updateStatus.isPending}
                >
                  Annuler
                </Button>
                <Button
                  className="bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => handleStatusChange(selectedOrder.id, 'refused')}
                  disabled={updateStatus.isPending}
                >
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

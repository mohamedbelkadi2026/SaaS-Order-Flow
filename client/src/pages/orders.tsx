import { useState } from "react";
import { useOrders, useUpdateOrderStatus, useAssignAgent, useAgents } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Filter, AlertCircle, ArrowRight, ShoppingBag, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Orders() {
  const { data: orders, isLoading } = useOrders();
  const { data: agents } = useAgents();
  const updateStatus = useUpdateOrderStatus();
  const assignAgent = useAssignAgent();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const filteredOrders = orders?.filter((o: any) => 
    o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName.toLowerCase().includes(search.toLowerCase()) ||
    o.customerPhone.includes(search) ||
    (o.customerCity && o.customerCity.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: "Status updated", description: `Order status changed to ${status}` });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status });
        }
      }
    });
  };

  const handleCallClient = () => {
    toast({
      title: "Calling Client...",
      description: `Initiating call to ${selectedOrder?.customerPhone}`,
    });
    // Mocking an immediate confirmed state transition on call for speed flow
    handleStatusChange(selectedOrder.id, 'in_progress');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase">Nouvelles</h1>
          <p className="text-muted-foreground mt-1">Commandes / Nouvelles</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search orders..." 
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
                <TableHead className="w-[80px] font-semibold">Code</TableHead>
                <TableHead className="font-semibold">Destinataire</TableHead>
                <TableHead className="font-semibold">Téléphone</TableHead>
                <TableHead className="font-semibold">Ville</TableHead>
                <TableHead className="font-semibold">Boutique</TableHead>
                <TableHead className="font-semibold">comment</TableHead>
                <TableHead className="font-semibold">Dernière action</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Prix</TableHead>
                <TableHead className="font-semibold">Adresse</TableHead>
                <TableHead className="font-semibold">Référence</TableHead>
                <TableHead className="font-semibold">Infos supplémentaires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12}><div className="h-12 w-full bg-muted rounded animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => (
                  <TableRow key={order.id} className="hover:bg-muted/20 transition-colors group cursor-pointer text-xs" onClick={() => setSelectedOrder(order)}>
                    <TableCell className="font-medium whitespace-nowrap">N/D</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{order.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerPhone}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerCity || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">promomarkett</TableCell>
                    <TableCell className="whitespace-nowrap">{order.comment || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="font-semibold">{(order.totalPrice / 100).toFixed(2)}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{order.customerAddress || "-"}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-right text-muted-foreground" dir="rtl">{order.items?.[0]?.product?.reference || order.items?.[0]?.product?.sku || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      quantity: {order.items?.[0]?.quantity || 1} order_number: {order.orderNumber}
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
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <label className="text-sm font-bold">replace :</label>
                    <div className="flex items-center gap-2"><div className="w-10 h-5 bg-red-400 rounded-full relative"><div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full"></div></div><span className="text-xs font-bold text-red-400">No</span></div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Replacement Track Number</label>
                    <Input placeholder="Enter replacement track number" className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Nom du client</label>
                    <Input defaultValue={selectedOrder.customerName} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                    <Input defaultValue={selectedOrder.customerPhone} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Adresse</label>
                    <Input defaultValue={selectedOrder.customerAddress || ""} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Ville</label>
                    <Input defaultValue={selectedOrder.customerCity || ""} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Statut</label>
                    <Select defaultValue={selectedOrder.status} onValueChange={(v) => handleStatusChange(selectedOrder.id, v)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Nouveau</SelectItem>
                        <SelectItem value="confirmed">Confirmé</SelectItem>
                        <SelectItem value="cancelled">Annulé</SelectItem>
                        <SelectItem value="refused">Refusé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold">can open :</label>
                      <div className="flex items-center gap-2"><div className="w-10 h-5 bg-green-400 rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div></div><span className="text-xs font-bold text-green-400">Yes</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold">Up Sell :</label>
                      <div className="flex items-center gap-2"><div className="w-10 h-5 bg-red-400 rounded-full relative"><div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full"></div></div><span className="text-xs font-bold text-red-400">No</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold">Is Stock :</label>
                      <div className="flex items-center gap-2"><div className="w-10 h-5 bg-red-400 rounded-full relative"><div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full"></div></div><span className="text-xs font-bold text-red-400">No</span></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Nom du produit</label>
                    <Input defaultValue={selectedOrder.items?.[0]?.product?.name || ""} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Prix</label>
                    <Input defaultValue={(selectedOrder.totalPrice / 100).toFixed(2)} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Reference</label>
                    <Input defaultValue={selectedOrder.items?.[0]?.product?.sku || ""} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Comment Order</label>
                    <Input defaultValue={selectedOrder.comment || ""} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Détails</label>
                    <textarea 
                      className="w-full min-h-[100px] p-3 rounded-md border border-input bg-white text-sm"
                      defaultValue={`quantity: ${selectedOrder.items?.[0]?.quantity || 1} order_number: ${selectedOrder.orderNumber}`}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center gap-2 text-primary font-bold mb-4">
                   <ShoppingBag className="w-5 h-5" /> Order Items <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{selectedOrder.items?.length || 0}</span>
                </div>
                <div className="bg-white rounded-xl border p-4 space-y-4">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-center">
                       <Input value={item.product.name} className="flex-[2]" readOnly />
                       <Input value={(item.price / 100).toFixed(2)} className="flex-1" readOnly />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setSelectedOrder(null)}>Annuler</Button>
              <Button className="bg-primary hover:bg-primary/90 text-white px-8">Enregistrer les modifications</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

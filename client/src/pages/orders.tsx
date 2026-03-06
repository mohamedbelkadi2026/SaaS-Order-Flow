import { useState } from "react";
import { useOrders, useUpdateOrderStatus, useAssignAgent, useAgents } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, CheckCircle, XCircle, Search, Filter, AlertCircle, ArrowRight } from "lucide-react";
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
    o.customerPhone.includes(search)
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
          <h1 className="text-3xl font-display font-bold">Orders Management</h1>
          <p className="text-muted-foreground mt-1">Process and assign incoming orders.</p>
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
                <TableHead className="w-[100px] font-semibold">Order ID</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Customer</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Total</TableHead>
                <TableHead className="font-semibold">Agent</TableHead>
                <TableHead className="text-right font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted rounded animate-pulse"></div></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted rounded animate-pulse"></div></TableCell>
                    <TableCell><div className="h-6 w-20 bg-muted rounded-full animate-pulse"></div></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted rounded animate-pulse"></div></TableCell>
                    <TableCell className="text-right"><div className="h-8 w-16 bg-muted rounded-md inline-block animate-pulse"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order: any) => (
                  <TableRow key={order.id} className="hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <TableCell className="font-medium text-primary">#{order.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {order.createdAt ? format(new Date(order.createdAt), "MMM d, yyyy") : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="font-semibold">{formatCurrency(order.totalPrice)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={order.assignedToId?.toString() || "unassigned"} 
                        onValueChange={(val) => assignAgent.mutate({ id: order.id, agentId: val === "unassigned" ? null : parseInt(val) })}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs border-transparent group-hover:border-border hover:bg-muted bg-transparent">
                          <SelectValue placeholder="Assign Agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {agents?.map((agent: any) => (
                            <SelectItem key={agent.id} value={agent.id.toString()}>{agent.username}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10">
                        View <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
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
          <DialogContent className="sm:max-w-xl rounded-2xl overflow-hidden p-0 border-none shadow-2xl">
            <div className="bg-primary p-6 text-primary-foreground">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-display font-bold">Order #{selectedOrder.orderNumber}</h2>
                  <p className="opacity-90 text-sm mt-1">{format(new Date(selectedOrder.createdAt || new Date()), "MMMM d, yyyy 'at' h:mm a")}</p>
                </div>
                <StatusBadge status={selectedOrder.status} className="bg-white/20 text-white border-white/30 backdrop-blur-sm" />
              </div>
            </div>
            
            <div className="p-6 space-y-6 bg-background">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Customer Info</p>
                  <p className="font-semibold text-lg">{selectedOrder.customerName}</p>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Phone className="w-4 h-4" /> {selectedOrder.customerPhone}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-sm font-medium text-muted-foreground">Order Total</p>
                  <p className="font-display font-bold text-3xl text-primary">{formatCurrency(selectedOrder.totalPrice)}</p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <p className="font-medium mb-3">Action Center</p>
                <div className="flex gap-3">
                  <Button 
                    className="flex-1 shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all" 
                    size="lg"
                    onClick={handleCallClient}
                  >
                    <Phone className="w-4 h-4 mr-2" /> Call Client Now
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Button 
                    variant="outline" 
                    className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-900/50 dark:text-green-400 dark:hover:bg-green-900/20"
                    onClick={() => handleStatusChange(selectedOrder.id, 'confirmed')}
                    disabled={updateStatus.isPending || selectedOrder.status === 'confirmed'}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Mark Confirmed
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                    onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                    disabled={updateStatus.isPending || selectedOrder.status === 'cancelled'}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Mark Cancelled
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

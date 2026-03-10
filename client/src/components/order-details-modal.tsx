import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Trash2, Plus, Tag, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── Moroccan cities ──────────────────────────────────────────────
const MOROCCAN_CITIES = [
  "Casablanca","Rabat","Fès","Marrakech","Agadir","Tanger","Meknès","Oujda","Kénitra",
  "Tétouan","Safi","El Jadida","Nador","Beni Mellal","Taza","Khémisset","Errachidia",
  "Settat","Larache","Khouribga","Guelmim","Berrechid","Mohammedia","Salé","Temara",
  "Inezgane","Tiznit","Laâyoune","Dakhla","Essaouira","Ouarzazate","Zagora",
  "Al Hoceima","Ifrane","Khénifra","Azrou","Chefchaouen","Asilah","Taroudant",
  "Taroudnat","Ait Melloul","Ouled Teima","Dcheira El Jihadia","Sidi Slimane",
  "Sidi Kacem","Souk El Arbaa","Berkane","Taourirt","Jerada","Tifariti",
].sort();

// ── Carrier logo component ───────────────────────────────────────
function CarrierLogo({ provider }: { provider?: string }) {
  if (!provider) return null;
  const logos: Record<string, string> = {
    amana: "A", digylog: "D", "marocpost": "M", "jumia": "J", "glovo": "G",
  };
  const initial = logos[provider?.toLowerCase()] || provider?.[0]?.toUpperCase() || "?";
  return (
    <div className="w-6 h-6 rounded bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
      {initial}
    </div>
  );
}

// ── Toggle pill ──────────────────────────────────────────────────
interface TogglePillProps {
  value: boolean;
  onChange: (v: boolean) => void;
  leftLabel?: string;
  rightLabel?: string;
}
function TogglePill({ value, onChange, leftLabel = "No", rightLabel = "Yes" }: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "relative inline-flex items-center h-7 w-[72px] rounded-full transition-colors focus:outline-none border",
        value ? "bg-green-400 border-green-500" : "bg-red-400 border-red-500"
      )}
    >
      <span className={cn(
        "absolute text-[10px] font-bold text-white transition-all",
        value ? "left-2" : "right-2"
      )}>
        {value ? leftLabel : rightLabel}
      </span>
      <span className={cn(
        "absolute w-5 h-5 bg-white rounded-full shadow transition-all",
        value ? "right-1" : "left-1"
      )} />
    </button>
  );
}

// ── Order item row ───────────────────────────────────────────────
interface ItemRowProps {
  item: any;
  onChange: (id: string | number, field: string, value: any) => void;
  onDelete: (id: string | number) => void;
}
function ItemRow({ item, onChange, onDelete }: ItemRowProps) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <Input
          value={item.rawProductName || item.product?.name || ""}
          onChange={e => onChange(item.id, "rawProductName", e.target.value)}
          className="flex-1 text-sm bg-gray-50 border-gray-200"
          placeholder="Nom du produit"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="shrink-0 border-red-200 hover:bg-red-50 text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-1">
          <Badge variant="outline" className="text-xs text-gray-500 font-normal shrink-0">
            {item.sku || "null"}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-5 h-5 p-0 text-gray-400 hover:text-red-500"
            onClick={() => onChange(item.id, "sku", "")}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          <Input
            type="number"
            value={(item.price / 100).toFixed(0)}
            onChange={e => onChange(item.id, "price", Math.round(parseFloat(e.target.value) * 100))}
            className="w-20 text-sm text-right"
          />
          <span className="text-xs font-bold bg-blue-600 text-white px-2 py-1 rounded">DH</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={item.variantInfo || ""}
          onChange={e => onChange(item.id, "variantInfo", e.target.value)}
          className="flex-1 text-sm bg-gray-50 border-gray-200 text-muted-foreground"
          placeholder="Variant info..."
        />
        <div className="flex items-center gap-1">
          <Box className="w-3.5 h-3.5 text-gray-400" />
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={e => onChange(item.id, "quantity", parseInt(e.target.value) || 1)}
            className="w-16 text-sm text-right"
          />
          <span className="text-xs font-bold bg-green-600 text-white px-2 py-1 rounded">Qty</span>
        </div>
      </div>
    </div>
  );
}

// ── Order statuses ───────────────────────────────────────────────
const ORDER_STATUSES = [
  { value: "nouveau", label: "Nouveau" },
  { value: "confirme", label: "Confirmé" },
  { value: "in_progress", label: "En cours" },
  { value: "delivered", label: "Livré" },
  { value: "cancelled", label: "Annulé" },
  { value: "refused", label: "Refusé" },
  { value: "Annulé (fake)", label: "Annulé (Fake)" },
  { value: "Annulé (Faux numéro)", label: "Faux Numéro" },
  { value: "Annulé (Double)", label: "Double" },
  { value: "Boite Vocale", label: "Boite Vocale" },
  { value: "Injoignable", label: "Injoignable" },
];

// ── Main Modal ───────────────────────────────────────────────────
interface OrderDetailsModalProps {
  order: any | null;
  storeName?: string;
  onClose: () => void;
  onUpdated?: (order: any) => void;
}

export function OrderDetailsModal({ order, storeName, onClose, onUpdated }: OrderDetailsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Local state mirroring order fields ──
  const [fields, setFields] = useState<any>({});
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [newItemCounter, setNewItemCounter] = useState(0);

  useEffect(() => {
    if (!order) return;
    setFields({
      replace: !!order.replace,
      canOpen: order.canOpen !== 0,
      upSell: !!order.upSell,
      isStock: !!order.isStock,
      replacementTrackNumber: order.replacementTrackNumber || "",
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      customerAddress: order.customerAddress || "",
      customerCity: order.customerCity || "",
      status: order.status || "nouveau",
      commentStatus: order.commentStatus || "",
      rawProductName: order.rawProductName || (order.items?.[0]?.rawProductName) || (order.items?.[0]?.product?.name) || "",
      totalPrice: order.totalPrice ? (order.totalPrice / 100).toFixed(2) : "0.00",
      reference: "",
      commentOrder: order.commentOrder || "",
    });
    setLocalItems((order.items || []).map((item: any) => ({ ...item })));
  }, [order]);

  // ── Save mutation ──
  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const payload: any = {
        replace: fields.replace ? 1 : 0,
        canOpen: fields.canOpen ? 1 : 0,
        upSell: fields.upSell ? 1 : 0,
        isStock: fields.isStock ? 1 : 0,
        replacementTrackNumber: fields.replacementTrackNumber || null,
        customerName: fields.customerName,
        customerPhone: fields.customerPhone,
        customerAddress: fields.customerAddress,
        customerCity: fields.customerCity,
        status: fields.status,
        commentStatus: fields.commentStatus || null,
        rawProductName: fields.rawProductName || null,
        totalPrice: Math.round(parseFloat(fields.totalPrice || "0") * 100),
        commentOrder: fields.commentOrder || null,
      };
      console.log(`[MODAL SAVE] order #${order.orderNumber} status=${payload.status}`, payload);
      await apiRequest("PATCH", `/api/orders/${order.id}`, payload);

      // Sync items: delete removed ones and add new ones
      for (const item of localItems) {
        if (typeof item.id === "string" && item.id.startsWith("new-")) {
          await apiRequest("POST", `/api/orders/${order.id}/items`, {
            rawProductName: item.rawProductName,
            sku: item.sku || null,
            variantInfo: item.variantInfo || null,
            quantity: item.quantity,
            price: item.price,
            productId: item.productId || null,
          });
        } else {
          await apiRequest("PATCH", `/api/order-items/${item.id}`, {
            rawProductName: item.rawProductName,
            sku: item.sku || null,
            variantInfo: item.variantInfo || null,
            quantity: item.quantity,
            price: item.price,
          });
        }
      }
    },
    onSuccess: () => {
      const statusChanged = fields.status !== order?.status;
      const msg = statusChanged
        ? `Statut mis à jour : ${fields.status}`
        : "La commande a été mise à jour.";
      toast({ title: "Modifications enregistrées", description: msg });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      onUpdated?.({ ...order, ...fields, status: fields.status });
      if (statusChanged) onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message || "Erreur lors de la sauvegarde", variant: "destructive" });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string | number) => {
      if (typeof itemId === "string" && itemId.startsWith("new-")) return;
      await apiRequest("DELETE", `/api/order-items/${itemId}`, undefined);
    },
  });

  const set = (key: string, value: any) => setFields((f: any) => ({ ...f, [key]: value }));

  const handleItemChange = (id: string | number, field: string, value: any) => {
    setLocalItems(items => items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleItemDelete = async (id: string | number) => {
    try {
      await deleteItem.mutateAsync(id);
      setLocalItems(items => items.filter(i => i.id !== id));
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleAddItem = () => {
    const tempId = `new-${newItemCounter}`;
    setNewItemCounter(c => c + 1);
    setLocalItems(items => [...items, {
      id: tempId, rawProductName: "", sku: "", variantInfo: "", quantity: 1, price: 0,
    }]);
  };

  // ── Build "Détails" string ──
  const detailsText = (() => {
    if (localItems.length > 0) {
      return localItems.map((item) => {
        const parts: string[] = [`quantity: ${item.quantity}`];
        if (order?.orderNumber) parts.push(`order_number: ${order.orderNumber}`);
        if (item.variantInfo) parts.push(`variant: ${item.variantInfo}`);
        return parts.join(" | ");
      }).join("\n");
    }
    // Fallback: use order-level raw fields saved from webhook
    const parts: string[] = [];
    if ((order as any)?.rawQuantity) parts.push(`quantity: ${(order as any).rawQuantity}`);
    if (order?.orderNumber) parts.push(`order_number: ${order.orderNumber}`);
    if ((order as any)?.variantDetails) parts.push(`variant: ${(order as any).variantDetails}`);
    return parts.join(" | ");
  })();

  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 rounded-2xl overflow-hidden border shadow-2xl max-h-[95vh] flex flex-col">
        <DialogDescription className="sr-only">Détails et modification de la commande #{order?.orderNumber}</DialogDescription>

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b bg-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-blue-600">Détails de la commande</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Store : <span className="font-semibold text-foreground">{storeName || "–"}</span>
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="mt-0.5">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {order.trackNumber && (
            <div className="mt-2">
              <Label className="text-xs font-semibold text-muted-foreground">Track Number :</Label>
              <p className="font-mono font-bold text-sm mt-0.5">{order.trackNumber}</p>
            </div>
          )}
          {!order.trackNumber && (
            <p className="text-xs text-muted-foreground mt-1">Track Number :</p>
          )}

          {/* ── 4 Toggles ── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">replace :</span>
              <TogglePill
                value={fields.replace}
                onChange={v => set("replace", v)}
                leftLabel="Yes"
                rightLabel="No"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">can open :</span>
              <TogglePill
                value={fields.canOpen}
                onChange={v => set("canOpen", v)}
                leftLabel="Yes"
                rightLabel="No"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Up Sell :</span>
              <TogglePill
                value={fields.upSell}
                onChange={v => set("upSell", v)}
                leftLabel="Yes"
                rightLabel="No"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Is Stock :</span>
              <TogglePill
                value={fields.isStock}
                onChange={v => set("isStock", v)}
                leftLabel="Yes"
                rightLabel="No"
              />
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 p-6 bg-white space-y-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Replacement Track Number</Label>
                <Input
                  placeholder="Enter replacement track number"
                  value={fields.replacementTrackNumber}
                  onChange={e => set("replacementTrackNumber", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Nom du client</Label>
                <Input
                  value={fields.customerName}
                  onChange={e => set("customerName", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Téléphone</Label>
                <Input
                  value={fields.customerPhone}
                  onChange={e => set("customerPhone", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Adresse</Label>
                <Input
                  value={fields.customerAddress}
                  onChange={e => set("customerAddress", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Ville</Label>
                <div className="relative flex items-center">
                  {order.shippingProvider && (
                    <div className="absolute left-2 z-10">
                      <CarrierLogo provider={order.shippingProvider} />
                    </div>
                  )}
                  <Select value={fields.customerCity} onValueChange={v => set("customerCity", v)}>
                    <SelectTrigger className={cn("bg-white", order.shippingProvider && "pl-10")}>
                      <SelectValue placeholder="Sélectionner une ville" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {MOROCCAN_CITIES.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Statut</Label>
                <Select value={fields.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="bg-white">
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
                <Label className="text-sm font-semibold">Comment Status</Label>
                <Input
                  value={fields.commentStatus}
                  onChange={e => set("commentStatus", e.target.value)}
                  className="bg-white"
                  placeholder=""
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Nom du produit</Label>
                <Input
                  value={fields.rawProductName}
                  onChange={e => set("rawProductName", e.target.value)}
                  className="bg-white"
                  placeholder="Auto-rempli depuis la boutique"
                  dir="rtl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Prix</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fields.totalPrice}
                  onChange={e => set("totalPrice", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Reference</Label>
                <Input
                  value={fields.reference || order.orderNumber || ""}
                  readOnly
                  className="bg-gray-50 text-muted-foreground"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Comment Order</Label>
                <Input
                  value={fields.commentOrder}
                  onChange={e => set("commentOrder", e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Détails</Label>
                <textarea
                  readOnly
                  value={detailsText}
                  rows={4}
                  className="w-full p-3 rounded-md border border-input bg-gray-50 text-sm resize-none text-muted-foreground font-mono"
                />
              </div>
            </div>
          </div>

          {/* ── Order Items ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-blue-600 font-bold">
                <span className="text-base">🛍</span>
                <span>Order Items</span>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {localItems.length}
                </span>
              </div>
              <Button
                type="button"
                size="icon"
                onClick={handleAddItem}
                className="w-8 h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {localItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onChange={handleItemChange}
                  onDelete={handleItemDelete}
                />
              ))}
              {localItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-xl border-dashed">
                  Aucun article — cliquez sur + pour en ajouter
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-white">
          <Button variant="outline" onClick={onClose} className="px-6">
            Annuler
          </Button>
          <Button
            onClick={() => saveOrder.mutate()}
            disabled={saveOrder.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 font-semibold"
          >
            {saveOrder.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Enregistrer les modifications
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

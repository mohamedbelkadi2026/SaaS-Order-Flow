import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, Trash2, Plus, Phone, MessageCircle, RotateCcw, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";
const GOLD_MUTED = "#e8d5a8";

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

// ── Status badge toggle ──────────────────────────────────────────
function StatusBadge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all border select-none",
        active
          ? "border-yellow-500 text-yellow-900"
          : "border-gray-300 bg-white text-gray-400 hover:border-gray-400"
      )}
      style={active ? { backgroundColor: GOLD_MUTED, borderColor: GOLD, color: "#7a5c1e" } : {}}
    >
      {label}
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
    <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg border border-gray-100 bg-white">
      <div className="flex-1 min-w-0">
        <Input
          value={item.rawProductName || item.product?.name || ""}
          onChange={e => onChange(item.id, "rawProductName", e.target.value)}
          className="text-sm font-medium border-0 p-0 h-auto bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Nom du produit"
        />
        <div className="flex items-center gap-3 mt-1">
          {item.sku && (
            <span className="text-[10px] text-gray-400 font-mono">{item.sku}</span>
          )}
          <Input
            value={item.variantInfo || ""}
            onChange={e => onChange(item.id, "variantInfo", e.target.value)}
            className="text-xs border-0 p-0 h-auto bg-transparent text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
            placeholder="Taille / Couleur..."
          />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center">
          <Input
            type="number"
            value={(item.price / 100).toFixed(0)}
            onChange={e => onChange(item.id, "price", Math.round(parseFloat(e.target.value) * 100))}
            className="w-16 text-sm text-right font-bold h-8"
            style={{ color: NAVY }}
          />
          <span className="text-[10px] font-bold ml-1" style={{ color: NAVY }}>DH</span>
        </div>
        <span className="text-gray-300">·</span>
        <div className="flex items-center">
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={e => onChange(item.id, "quantity", parseInt(e.target.value) || 1)}
            className="w-12 text-sm text-right font-bold h-8"
            style={{ color: NAVY }}
          />
          <span className="text-[10px] font-bold ml-1" style={{ color: NAVY }}>Qté</span>
        </div>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-red-300 hover:text-red-500 transition-colors ml-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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

  const [fields, setFields] = useState<any>({});
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [newItemCounter, setNewItemCounter] = useState(0);

  useEffect(() => {
    if (!order) return;
    const firstItemVariant = order.items?.[0]?.variantInfo || "";
    const variantFallback = firstItemVariant || order.variantDetails || "";
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
      variantInfo: variantFallback !== "null" ? variantFallback : "",
      commentOrder: order.commentOrder || "",
    });
    setLocalItems((order.items || []).map((item: any) => ({
      ...item,
      variantInfo: item.variantInfo === "null" ? "" : (item.variantInfo || ""),
    })));
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
      await apiRequest("PATCH", `/api/orders/${order.id}`, payload);

      // Sync items
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
      const msg = statusChanged ? `Statut mis à jour : ${fields.status}` : "La commande a été mise à jour.";
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

  /* ── Open Retour ─────────────────────────────────────────────── */
  const [orOpen, setOrOpen] = useState(false);
  const [orReason, setOrReason] = useState("");
  const [orDone, setOrDone] = useState<{ tracking: string } | null>(null);

  const { data: orSettings } = useQuery<any>({
    queryKey: ["/api/open-retour/settings"],
    queryFn: () => fetch("/api/open-retour/settings", { credentials: "include" }).then(r => r.json()),
    enabled: !!order,
  });

  const createReturn = useMutation({
    mutationFn: () => fetch("/api/open-retour/create-return", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order!.id, reason: orReason, updateStatus: false }),
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Erreur Open Retour");
      return data;
    }),
    onSuccess: (data) => {
      setOrDone({ tracking: data.returnTrackingNumber });
      setOrOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      toast({ title: "Ticket de retour créé ✅", description: `N° de retour: ${data.returnTrackingNumber}` });
    },
    onError: (e: any) => toast({ title: "Erreur Open Retour", description: e.message, variant: "destructive" }),
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
    setLocalItems(items => [...items, { id: tempId, rawProductName: "", sku: "", variantInfo: "", quantity: 1, price: 0 }]);
  };

  const whatsappLink = fields.customerPhone
    ? `https://wa.me/${fields.customerPhone.replace(/\D/g, "")}`
    : null;
  const callLink = fields.customerPhone ? `tel:${fields.customerPhone}` : null;

  if (!order) return null;

  return (
    <>
    <Dialog open={!!order} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 rounded-2xl overflow-hidden shadow-2xl max-h-[95vh] flex flex-col border-0">
        <DialogTitle className="sr-only">Commande #{order?.orderNumber}</DialogTitle>
        <DialogDescription className="sr-only">Détails et modification de la commande #{order?.orderNumber}</DialogDescription>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: NAVY }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium opacity-70">Commande</span>
              <span className="font-bold text-lg" style={{ color: GOLD }}>#{order.orderNumber}</span>
              {order.trackNumber && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full text-white/60 border border-white/20">
                  {order.trackNumber}
                </span>
              )}
            </div>
            <p className="text-white/50 text-xs mt-0.5">{storeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            data-testid="button-close-modal"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* ── STATUS PILL TOGGLES ── */}
        <div className="flex items-center gap-2 px-6 py-3 flex-wrap border-b" style={{ backgroundColor: "#f8f7ff" }}>
          <StatusBadge label="Replace" active={fields.replace} onClick={() => set("replace", !fields.replace)} />
          <StatusBadge label="Can Open" active={fields.canOpen} onClick={() => set("canOpen", !fields.canOpen)} />
          <StatusBadge label="Up Sell" active={fields.upSell} onClick={() => set("upSell", !fields.upSell)} />
          <StatusBadge label="Is Stock" active={fields.isStock} onClick={() => set("isStock", !fields.isStock)} />
          {fields.replacementTrackNumber && (
            <span className="text-xs font-mono px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-500 ml-auto">
              🔄 {fields.replacementTrackNumber}
            </span>
          )}
        </div>

        {/* ── BODY ── */}
        <div className="overflow-y-auto flex-1 bg-gray-50">

          {/* ── SPLIT CARD ROW ── */}
          <div className="grid grid-cols-2 gap-4 p-4">

            {/* LEFT: Customer Card */}
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#f1f0f9" }}>
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY, opacity: 0.5 }}>Client</p>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Nom</Label>
                <Input
                  value={fields.customerName}
                  onChange={e => set("customerName", e.target.value)}
                  className="bg-white border-gray-200 text-sm h-9 font-semibold"
                  style={{ color: NAVY }}
                  data-testid="input-customer-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Téléphone</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={fields.customerPhone}
                    onChange={e => set("customerPhone", e.target.value)}
                    className="bg-white border-gray-200 text-sm h-9 flex-1"
                    data-testid="input-customer-phone"
                  />
                  {callLink && (
                    <a href={callLink} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {whatsappLink && (
                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Ville</Label>
                <Select value={fields.customerCity} onValueChange={v => set("customerCity", v)}>
                  <SelectTrigger className="bg-white border-gray-200 text-sm h-9" data-testid="select-city">
                    <SelectValue placeholder="Sélectionner une ville" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {MOROCCAN_CITIES.map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Adresse</Label>
                <Input
                  value={fields.customerAddress}
                  onChange={e => set("customerAddress", e.target.value)}
                  className="bg-white border-gray-200 text-sm h-9"
                  data-testid="input-customer-address"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Statut</Label>
                <Select value={fields.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="bg-white border-gray-200 text-sm h-9" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* RIGHT: Product Card */}
            <div className="rounded-xl p-4 space-y-3 bg-white border border-gray-100">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY, opacity: 0.5 }}>Produit</p>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Nom du produit</Label>
                <Input
                  value={fields.rawProductName}
                  onChange={e => set("rawProductName", e.target.value)}
                  className="bg-gray-50 border-gray-200 text-sm h-9 font-semibold"
                  style={{ color: NAVY }}
                  placeholder="Auto-rempli depuis la boutique"
                  dir="rtl"
                  data-testid="input-product-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Prix total</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    value={fields.totalPrice}
                    onChange={e => set("totalPrice", e.target.value)}
                    className="bg-gray-50 border-gray-200 text-sm h-9 font-bold flex-1"
                    style={{ color: NAVY }}
                    data-testid="input-total-price"
                  />
                  <span className="text-xs font-bold px-2 py-1.5 rounded-lg text-white" style={{ backgroundColor: NAVY }}>DH</span>
                </div>
              </div>

              {/* Variant — prominent footwear-first field */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Taille / Variant</Label>
                <div className="relative">
                  <Input
                    value={fields.variantInfo}
                    onChange={e => {
                      set("variantInfo", e.target.value);
                      setLocalItems(items => items.map((item, i) => i === 0 ? { ...item, variantInfo: e.target.value } : item));
                    }}
                    className="bg-gray-50 border-gray-200 text-sm h-9 font-bold pr-12"
                    style={{ color: GOLD !== "" ? "#7a5c1e" : undefined }}
                    placeholder="Sélectionner variant (ex: 40, Marron)"
                    data-testid="input-variant-info"
                  />
                  {fields.variantInfo && (
                    <span
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: GOLD_MUTED, color: "#7a5c1e" }}
                    >
                      {fields.variantInfo}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Réf. commande</Label>
                <Input
                  value={order.orderNumber || ""}
                  readOnly
                  className="bg-gray-100 border-gray-200 text-sm h-9 text-gray-400 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-500">Replacement Track</Label>
                <Input
                  value={fields.replacementTrackNumber}
                  onChange={e => set("replacementTrackNumber", e.target.value)}
                  className="bg-gray-50 border-gray-200 text-sm h-9"
                  placeholder="N° de suivi remplacement"
                  data-testid="input-replacement-track"
                />
              </div>
            </div>
          </div>

          {/* ── ORDER ITEMS ── */}
          <div className="mx-4 mb-4 rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: NAVY }}>Articles</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#e8e7f8", color: NAVY }}>
                  {localItems.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: NAVY }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {localItems.map(item => (
                <ItemRow key={item.id} item={item} onChange={handleItemChange} onDelete={handleItemDelete} />
              ))}
              {localItems.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">
                  Aucun article — cliquez sur + pour en ajouter
                </p>
              )}
            </div>
          </div>

          {/* ── COMMENTS ── */}
          <div className="grid grid-cols-2 gap-4 mx-4 mb-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Commentaire client</Label>
              <textarea
                value={fields.commentStatus}
                onChange={e => set("commentStatus", e.target.value)}
                rows={3}
                className="w-full p-3 rounded-lg border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-offset-0"
                style={{ "--tw-ring-color": GOLD } as any}
                placeholder="Remarques du client..."
                data-testid="textarea-comment-status"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Note interne</Label>
              <textarea
                value={fields.commentOrder}
                onChange={e => set("commentOrder", e.target.value)}
                rows={3}
                className="w-full p-3 rounded-lg border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-offset-0"
                placeholder="Note pour l'équipe..."
                data-testid="textarea-comment-order"
              />
            </div>
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
          {/* Left: Open Retour */}
          <div>
            {orDone ? (
              <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Retour <code className="bg-green-50 px-1.5 py-0.5 rounded text-xs font-mono">{orDone.tracking}</code>
              </div>
            ) : orSettings?.connected ? (
              <Button
                variant="outline" size="sm"
                onClick={() => { setOrReason(order?.comment || order?.commentStatus || ""); setOrOpen(true); }}
                className="border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold text-xs"
                data-testid="button-create-return"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Créer un Retour
              </Button>
            ) : (
              <span className="text-xs text-gray-400 hidden sm:block">Open Retour non connecté</span>
            )}
          </div>

          {/* Right: Cancel + Save */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} className="px-5 text-sm">Annuler</Button>
            <Button
              onClick={() => saveOrder.mutate()}
              disabled={saveOrder.isPending}
              className="px-7 py-2.5 text-sm font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
              style={{ backgroundColor: GOLD, color: "#1e1b4b", border: "none" }}
              data-testid="button-save-order"
            >
              {saveOrder.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── Open Retour dialog ──────────────────────────────────── */}
    <Dialog open={orOpen} onOpenChange={setOrOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-base font-bold" style={{ color: NAVY }}>
          <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
          Créer un ticket de retour
        </DialogTitle>
        <DialogDescription>
          Commande <strong>#{order?.orderNumber || order?.id}</strong> — {order?.customerName}
        </DialogDescription>
        <div className="space-y-3 py-1">
          <Label className="text-sm font-semibold">Raison du retour</Label>
          <Input
            data-testid="input-or-reason"
            placeholder="Ex: produit endommagé, erreur de taille..."
            value={orReason}
            onChange={e => setOrReason(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOrOpen(false)}>Annuler</Button>
          <Button
            onClick={() => createReturn.mutate()}
            disabled={createReturn.isPending || !orReason.trim()}
            style={{ backgroundColor: GOLD, color: NAVY, border: "none" }}
            className="font-bold"
          >
            {createReturn.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Confirmer le retour
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

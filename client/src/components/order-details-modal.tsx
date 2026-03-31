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
import { CityCombobox } from "@/components/city-combobox";
import { MOROCCAN_CITIES } from "@/lib/carrier-cities";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";
const GOLD_MUTED = "#e8d5a8";

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
  return CARRIER_LOGOS[(provider || "").toLowerCase()] ?? null;
}

/** Remove lone hyphens used as placeholder last names (e.g. "Ahmed -") */
function cleanCustomerName(name: string): string {
  return (name || "")
    .split(" ")
    .map(p => p.trim())
    .filter(p => p !== "" && p !== "-" && p !== "–" && p !== "—")
    .join(" ")
    .trim();
}

// ── Status badge toggle ──────────────────────────────────────────
function StatusBadge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 min-w-0 py-2 px-3 rounded-xl text-xs font-bold tracking-wide transition-all border select-none text-center",
        active
          ? "border-yellow-500"
          : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
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
  products: ProductOption[];
  onChange: (id: string | number, field: string, value: any) => void;
  onDelete: (id: string | number) => void;
}
function ItemRow({ item, products, onChange, onDelete }: ItemRowProps) {
  const priceVal = (item.price ?? 0) / 100;
  const qty = item.quantity || 1;
  const total = priceVal * qty;
  const productName = item.rawProductName || item.product?.name || "";

  const handleProductSelect = (p: ProductOption) => {
    onChange(item.id, "rawProductName", p.name);
    onChange(item.id, "sku", p.sku || "");
    onChange(item.id, "price", p.sellingPrice ?? p.costPrice ?? 0);
    onChange(item.id, "productId", p.id);
  };

  return (
    <div className="py-3 px-4 border-b border-gray-50 last:border-0">
      {/* Product combobox + delete */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <ProductCombobox
            products={products}
            value={productName}
            onChange={handleProductSelect}
            placeholder="Rechercher dans le stock..."
          />
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.sku && (
              <span className="text-[10px] text-gray-400 font-mono shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">
                {item.sku}
              </span>
            )}
            <Input
              value={item.variantInfo || ""}
              onChange={e => onChange(item.id, "variantInfo", e.target.value)}
              className="text-xs border-0 p-0 h-auto bg-transparent text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0 flex-1"
              placeholder="Taille / Couleur..."
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-red-300 hover:text-red-500 transition-colors p-1 shrink-0 mt-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Price × Qty row with live total */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          <Input
            type="number"
            value={priceVal.toFixed(2)}
            onChange={e => onChange(item.id, "price", Math.round(parseFloat(e.target.value) * 100))}
            className="w-20 text-sm text-right font-semibold h-8 rounded-lg"
            style={{ color: NAVY }}
          />
          <span className="text-xs font-bold ml-0.5" style={{ color: NAVY }}>DH</span>
        </div>
        <span className="text-gray-400 text-sm">×</span>
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={e => onChange(item.id, "quantity", parseInt(e.target.value) || 1)}
          className="w-14 text-sm text-center font-semibold h-8 rounded-lg"
          style={{ color: NAVY }}
        />
        <span className="text-gray-300 text-sm">=</span>
        <span className="text-sm font-bold" style={{ color: NAVY }}>
          {total.toFixed(2)} DH
        </span>
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

// ── Field wrapper ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</Label>
      {children}
    </div>
  );
}

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

  // ── Carrier city list ─────────────────────────────────────────────
  const { data: carrierData } = useQuery<{ provider: string | null; cities: string[]; isCarrierSpecific: boolean }>({
    queryKey: ["/api/carriers/cities"],
    staleTime: 5 * 60 * 1000,
  });
  const carrierCities = carrierData?.cities ?? MOROCCAN_CITIES;
  const isCarrierSpecific = carrierData?.isCarrierSpecific ?? false;

  const { data: stockProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products"],
    staleTime: 5 * 60 * 1000,
  });

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
      customerName: cleanCustomerName(order.customerName || ""),
      customerPhone: order.customerPhone || "",
      customerAddress: order.customerAddress || "",
      customerCity: order.customerCity || "",
      status: order.status || "nouveau",
      comment: order.comment || "",
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
      if (!order) return null;
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
        comment: fields.comment !== undefined ? (fields.comment || null) : undefined,
        commentStatus: fields.commentStatus || null,
        rawProductName: fields.rawProductName || null,
        totalPrice: Math.round(parseFloat(fields.totalPrice || "0") * 100),
        commentOrder: fields.commentOrder || null,
      };
      const res = await apiRequest("PATCH", `/api/orders/${order.id}`, payload);
      const updatedOrder = await res.json();

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
      return updatedOrder;
    },
    onSuccess: (updatedOrder: any) => {
      toast({ title: "Commande mise à jour avec succès" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      const saved = updatedOrder ?? { ...order, ...fields };
      onUpdated?.(saved);
      const statusChanged = (updatedOrder?.status ?? fields.status) !== order?.status;
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

  /* ── Shared input style (16px on mobile prevents iOS zoom) ────── */
  const inputCls = "w-full bg-white border-gray-200 h-11 text-[16px] sm:text-sm sm:h-9 font-semibold rounded-lg";

  return (
    <>
    <Dialog open={!!order} onOpenChange={open => { if (!open) onClose(); }}>
      {/*
        Mobile: full-screen sheet (no rounded corners, no side margins)
        Desktop: centered card with max-width and rounded corners
      */}
      <DialogContent className={cn(
        "p-0 border-0 shadow-2xl flex flex-col",
        "w-full max-w-full rounded-none h-[100dvh]",
        "sm:rounded-2xl sm:max-w-2xl sm:h-auto sm:max-h-[95vh]",
        "overflow-hidden"
      )}>
        <DialogTitle className="sr-only">Commande #{order?.orderNumber}</DialogTitle>
        <DialogDescription className="sr-only">Détails et modification de la commande #{order?.orderNumber}</DialogDescription>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 shrink-0" style={{ background: NAVY }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white text-sm font-medium opacity-70">Commande</span>
              <span className="font-bold text-lg" style={{ color: GOLD }}>#{order.orderNumber}</span>
              {order.trackNumber && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full text-white/60 border border-white/20 truncate max-w-[140px]">
                  {order.trackNumber}
                </span>
              )}
            </div>
            <p className="text-white/50 text-xs mt-0.5 truncate">{storeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0 ml-2"
            data-testid="button-close-modal"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* ── STATUS PILL TOGGLES (2×2 grid on mobile) ── */}
        <div className="px-4 sm:px-6 py-3 border-b shrink-0" style={{ backgroundColor: "#f8f7ff" }}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <StatusBadge label="Replace" active={fields.replace} onClick={() => set("replace", !fields.replace)} />
            <StatusBadge label="Can Open" active={fields.canOpen} onClick={() => set("canOpen", !fields.canOpen)} />
            <StatusBadge label="Up Sell" active={fields.upSell} onClick={() => set("upSell", !fields.upSell)} />
            <StatusBadge label="Is Stock" active={fields.isStock} onClick={() => set("isStock", !fields.isStock)} />
          </div>
          {fields.replacementTrackNumber && (
            <div className="mt-2">
              <span className="text-xs font-mono px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-500">
                🔄 {fields.replacementTrackNumber}
              </span>
            </div>
          )}
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="overflow-y-auto flex-1 bg-gray-50">

          {/* ── TWO CARDS: stacked on mobile, side-by-side on desktop ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">

            {/* ╔══════ CLIENT CARD ══════╗ */}
            <div className="rounded-xl border border-indigo-100 p-4 space-y-4" style={{ backgroundColor: "#f1f0f9" }}>
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY, opacity: 0.45 }}>
                Client
              </p>

              <Field label="Nom complet">
                <Input
                  value={fields.customerName}
                  onChange={e => set("customerName", e.target.value)}
                  className={inputCls}
                  style={{ color: NAVY }}
                  data-testid="input-customer-name"
                />
              </Field>

              <Field label="Téléphone">
                {/* Phone field: input takes all space, icon buttons to the right */}
                <div className="flex gap-2">
                  <Input
                    value={fields.customerPhone}
                    onChange={e => set("customerPhone", e.target.value)}
                    className={cn(inputCls, "flex-1 min-w-0")}
                    inputMode="tel"
                    data-testid="input-customer-phone"
                  />
                  {callLink && (
                    <a
                      href={callLink}
                      className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      <Phone className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </a>
                  )}
                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </a>
                  )}
                </div>
              </Field>

              <Field label={carrierData?.provider ? `Ville (${carrierData.provider})` : "Ville"}>
                <CityCombobox
                  value={fields.customerCity || ""}
                  onChange={v => set("customerCity", v)}
                  cities={carrierCities}
                  isCarrierSpecific={isCarrierSpecific}
                  carrierLogo={getCarrierLogo(carrierData?.provider)}
                  data-testid="select-city"
                  className="w-full"
                />
              </Field>

              <Field label="Adresse">
                <Input
                  value={fields.customerAddress}
                  onChange={e => set("customerAddress", e.target.value)}
                  className={inputCls}
                  data-testid="input-customer-address"
                />
              </Field>

              <Field label="Statut de la commande">
                <Select value={fields.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger
                    className="w-full h-11 sm:h-9 text-[16px] sm:text-sm bg-white border-gray-200 rounded-lg font-semibold"
                    style={{ color: NAVY }}
                    data-testid="select-status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* ╔══════ PRODUIT CARD ══════╗ */}
            <div className="rounded-xl border border-gray-100 p-4 space-y-4 bg-white">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY, opacity: 0.45 }}>
                Produit
              </p>

              <Field label="Nom du produit">
                <Input
                  value={fields.rawProductName}
                  onChange={e => set("rawProductName", e.target.value)}
                  className={cn(inputCls, "bg-gray-50")}
                  style={{ color: NAVY }}
                  placeholder="Auto-rempli depuis la boutique"
                  dir="rtl"
                  data-testid="input-product-name"
                />
              </Field>

              <Field label="Prix total">
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    step="0.01"
                    value={fields.totalPrice}
                    onChange={e => set("totalPrice", e.target.value)}
                    className={cn(inputCls, "flex-1 bg-gray-50 text-right font-bold")}
                    style={{ color: NAVY }}
                    data-testid="input-total-price"
                  />
                  <span
                    className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg text-white"
                    style={{ backgroundColor: NAVY }}
                  >DH</span>
                </div>
              </Field>

              <Field label="Taille / Variant">
                <div className="relative">
                  <Input
                    value={fields.variantInfo}
                    onChange={e => {
                      set("variantInfo", e.target.value);
                      setLocalItems(items =>
                        items.map((item, i) => i === 0 ? { ...item, variantInfo: e.target.value } : item)
                      );
                    }}
                    className={cn(inputCls, "bg-gray-50 pr-16 font-bold")}
                    style={{ color: "#7a5c1e" }}
                    placeholder="Ex: 40, Marron, XL..."
                    data-testid="input-variant-info"
                  />
                  {fields.variantInfo && (
                    <span
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                      style={{ backgroundColor: GOLD_MUTED, color: "#7a5c1e" }}
                    >
                      {fields.variantInfo}
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Réf. commande">
                <Input
                  value={order.orderNumber || ""}
                  readOnly
                  className={cn(inputCls, "bg-gray-100 text-gray-400 font-mono cursor-default")}
                />
              </Field>

              <Field label="Replacement Track">
                <Input
                  value={fields.replacementTrackNumber}
                  onChange={e => set("replacementTrackNumber", e.target.value)}
                  className={cn(inputCls, "bg-gray-50")}
                  placeholder="N° de suivi remplacement"
                  data-testid="input-replacement-track"
                />
              </Field>
            </div>
          </div>

          {/* ── ORDER ITEMS ── */}
          <div className="mx-4 mb-3 rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: NAVY }}>Articles</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "#e8e7f8", color: NAVY }}
                >
                  {localItems.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: NAVY }}
                data-testid="button-add-item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div>
              {localItems.map(item => (
                <ItemRow key={item.id} item={item} products={stockProducts} onChange={handleItemChange} onDelete={handleItemDelete} />
              ))}
              {localItems.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">
                  Aucun article — cliquez sur + pour en ajouter
                </p>
              )}
            </div>
          </div>

          {/* ── COMMENTS — stacked on mobile, side-by-side on desktop ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mx-4 mb-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Commentaire</Label>
              <textarea
                value={fields.comment}
                onChange={e => set("comment", e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:ring-offset-0"
                placeholder="Commentaire (visible dans la liste)..."
                data-testid="textarea-comment"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Note interne</Label>
              <textarea
                value={fields.commentOrder}
                onChange={e => set("commentOrder", e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:ring-offset-0"
                placeholder="Note pour l'équipe..."
                data-testid="textarea-comment-order"
              />
            </div>
          </div>

          {/* bottom padding so content isn't hidden behind sticky footer on mobile */}
          <div className="h-4 sm:h-0" />
        </div>

        {/* ── STICKY FOOTER ──
            Mobile: full-width stacked buttons stuck to bottom of viewport
            Desktop: inline justify-between row
        ── */}
        <div className="shrink-0 border-t bg-white px-4 sm:px-6 py-3 sm:py-4">
          {/* Open Retour row (above buttons on mobile) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="order-2 sm:order-1">
              {orDone ? (
                <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Retour <code className="bg-green-50 px-1.5 py-0.5 rounded text-xs font-mono">{orDone.tracking}</code>
                </div>
              ) : orSettings?.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setOrReason(order?.comment || order?.commentStatus || ""); setOrOpen(true); }}
                  className="border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold text-xs"
                  data-testid="button-create-return"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Créer un Retour
                </Button>
              ) : (
                <span className="text-xs text-gray-400 hidden sm:inline">Open Retour non connecté</span>
              )}
            </div>

            {/* Action buttons — full-width on mobile, inline on desktop */}
            <div className="order-1 sm:order-2 flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 sm:flex-none sm:px-5 h-11 sm:h-9 text-sm font-semibold rounded-xl"
              >
                Annuler
              </Button>
              <Button
                onClick={() => saveOrder.mutate()}
                disabled={saveOrder.isPending}
                className="flex-1 sm:flex-none sm:px-7 h-11 sm:h-9 text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
                style={{ backgroundColor: GOLD, color: NAVY, border: "none" }}
                data-testid="button-save-order"
              >
                {saveOrder.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>

    {/* ── Open Retour dialog ──────────────────────────────────── */}
    <Dialog open={orOpen} onOpenChange={setOrOpen}>
      <DialogContent className="sm:max-w-sm mx-4 sm:mx-auto rounded-2xl">
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
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => setOrOpen(false)} className="flex-1 sm:flex-none">Annuler</Button>
          <Button
            onClick={() => createReturn.mutate()}
            disabled={createReturn.isPending || !orReason.trim()}
            style={{ backgroundColor: GOLD, color: NAVY, border: "none" }}
            className="font-bold flex-1 sm:flex-none"
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

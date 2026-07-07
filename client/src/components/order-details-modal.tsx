import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, Trash2, Plus, Phone, MessageCircle, RotateCcw, CheckCircle, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CityCombobox } from "@/components/city-combobox";
import { MOROCCAN_CITIES, getDefaultCitiesForCarrier, findBestCityMatch } from "@/lib/carrier-cities";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { AlertTriangle } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";
const GOLD_MUTED = "#e8d5a8";

const CARRIER_LOGOS: Record<string, string> = {
  digylog: '/carriers/digylog.svg',
  expresscoursier: '/carriers/expresscoursier.png',
  'express coursier': '/carriers/expresscoursier.png',
  onessta: '/carriers/onessta.svg',
  ozonexpress: '/carriers/ozonexpress.png',
  'ozon express': '/carriers/ozonexpress.png',
  ozoneexpress: '/carriers/ozonexpress.png',
  'ozone express': '/carriers/ozonexpress.png',
  ozon: '/carriers/ozonexpress.png',
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
    if (p.id !== -1) {
      // Stock product: auto-fill price and SKU
      onChange(item.id, "sku", p.sku || "");
      onChange(item.id, "price", p.sellingPrice ?? p.costPrice ?? 0);
      onChange(item.id, "productId", p.id);
    }
    // id === -1 means manually typed name — price/qty stay as-is
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
            placeholder="Stock ou nom libre... (Entrée pour ajouter)"
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
            type="text"
            inputMode="decimal"
            value={priceVal === 0 ? '' : priceVal.toFixed(2)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
              if (raw === '') { onChange(item.id, "price", 0); return; }
              const f = parseFloat(raw);
              if (Number.isFinite(f) && f >= 0) onChange(item.id, "price", Math.round(f * 100));
            }}
            className="w-20 text-sm text-right font-semibold h-8 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: NAVY }}
            data-testid="input-item-price"
          />
          <span className="text-xs font-bold ml-0.5" style={{ color: NAVY }}>DH</span>
        </div>
        <span className="text-gray-400 text-sm">×</span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={qty === 0 ? '' : String(qty)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '');
            if (raw === '') { onChange(item.id, "quantity", 0); return; }
            const n = parseInt(raw, 10);
            if (Number.isFinite(n) && n >= 0) onChange(item.id, "quantity", n);
          }}
          onBlur={() => {
            if (qty < 1) onChange(item.id, "quantity", 1);
          }}
          className="w-16 text-sm text-center font-semibold h-8 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={{ color: NAVY }}
          data-testid="input-item-quantity"
        />
        <span className="text-gray-300 text-sm">=</span>
        <span className="text-sm font-bold" style={{ color: NAVY }}>
          {total.toFixed(2)} DH
        </span>
      </div>
    </div>
  );
}

// ── Order statuses (grouped: agent-set first, carrier-set below) ─
const ORDER_STATUSES: { value: string; label: string; disabled?: boolean }[] = [
  // ── Agent statuses (manually set by agents) ─────────────────
  { value: "nouveau",                        label: "Nouveau" },
  { value: "confirme",                       label: "Confirmé" },
  { value: "confirme_reporte",               label: "📅 Confirmé Reporté" },
  { value: "rappel",                         label: "📞 Rappel" },
  { value: "Injoignable",                    label: "Injoignable" },
  { value: "Annulé (fake)",                  label: "Annulé (fake)" },
  { value: "Annulé (faux numéro)",           label: "Annulé (faux numéro)" },
  { value: "Annulé (double)",                label: "Annulé (double)" },
  { value: "boite vocale",                   label: "Boite Vocale" },
  { value: "Pas de réponse 1",               label: "Pas de réponse 1" },
  { value: "Pas de réponse 2",               label: "Pas de réponse 2" },
  { value: "Pas de réponse 3",               label: "Pas de réponse 3" },
  { value: "Pas de réponse 4",               label: "Pas de réponse 4" },
  { value: "Client n'a pas commandé",        label: "Client n'a pas commandé" },
  { value: "Produit non disponible",         label: "Produit non disponible" },
  { value: "in_progress",                    label: "En cours" },
  { value: "refused",                        label: "Refusé" },

  // ── Visual separator (non-selectable) ────────────────────────
  { value: "__separator_carrier__",          label: "── Transporteur ──", disabled: true },

  // ── Carrier / Shipping statuses (set by carrier webhook) ─────
  { value: "Attente De Ramassage",           label: "Attente Ramassage" },
  { value: "expédié",                        label: "Expédié" },
  { value: "retourné",                       label: "Retourné" },
  { value: "delivered",                      label: "Livré" },
  { value: "En Voyage",                      label: "En Voyage" },
  { value: "À préparer",                     label: "À préparer" },
  { value: "Ramassé",                        label: "Ramassé" },
  { value: "En transit",                     label: "En transit" },
  { value: "Reçu",                           label: "Reçu" },
  { value: "En cours de distribution",       label: "En cours de distribution" },
  { value: "Programmé",                      label: "Programmé" },
  { value: "Reporté",                        label: "Reporté" },
  { value: "En stock",                       label: "En stock" },
  { value: "Changer destinataire",           label: "Changer destinataire" },
  { value: "En cours de réception au network", label: "En cours de réception" },
  { value: "Arrivé au hub",                  label: "Arrivé au hub" },
  { value: "En cours de livraison",          label: "En cours de livraison" },
  { value: "Sorti pour livraison",           label: "Sorti pour livraison" },
  { value: "Pris en charge",                 label: "Pris en charge" },
  { value: "Collecté",                       label: "Collecté" },
  { value: "Chargé",                         label: "Chargé" },
  { value: "Confirmé par livreur",           label: "Confirmé par livreur" },
  { value: "Confirmé par livreur *",         label: "Confirmé par livreur *" },
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState<any>({});
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [newItemCounter, setNewItemCounter] = useState(0);
  const [manualPriceOverride, setManualPriceOverride] = useState(false);
  const [ecTrackInput, setEcTrackInput] = useState("");
  // Track the last order ID so we only reset the manual override when a
  // different order is opened — NOT when the same order's data refreshes
  // after save (which would immediately re-run the auto-calc and undo the
  // manually typed price).
  const prevOrderIdRef = useRef<number | null>(null);
  // Tracks whether the fresh-order fetch has already been applied for the
  // current open session — reset to null on close so reopening re-applies.
  const freshOrderAppliedRef = useRef<number | null>(null);

  // ── Carrier city list — filtered by the order's assigned carrier ──
  const orderCarrier = (order as any)?.carrierName || order?.shippingProvider || null;
  // True when the order's carrier is Express Coursier (normalise across all known variants)
  const isEC = /express[\s-]?coursier/i.test(orderCarrier ?? '') || orderCarrier === 'expresscoursier';
  const { data: carrierData, isLoading: citiesLoading } = useQuery<{
    provider: string | null; cities: string[]; isCarrierSpecific: boolean; source?: string;
  }>({
    queryKey: ["/api/carriers/cities", orderCarrier],
    queryFn: () =>
      fetch(
        orderCarrier
          ? `/api/carriers/cities?provider=${encodeURIComponent(orderCarrier)}`
          : `/api/carriers/cities`,
        { credentials: "include" }
      ).then(r => r.json()),
    staleTime: 3 * 60 * 1000,
  });
  // Fallback to MOROCCAN_CITIES if API fails or returns empty
  const carrierCities = (carrierData?.cities && carrierData.cities.length > 0)
    ? carrierData.cities
    : MOROCCAN_CITIES;
  const isCarrierSpecific = carrierData?.isCarrierSpecific ?? false;

  const { data: stockProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products"],
    staleTime: 5 * 60 * 1000,
  });

  // Always fetch the latest order from the server when the modal opens.
  // staleTime=0 ensures a refetch even when the same order is reopened after
  // save, so the modal never displays a totalPrice from a stale list-cache prop.
  const { data: freshOrder } = useQuery<any>({
    queryKey: ['/api/orders', order?.id],
    enabled: !!order?.id,
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const res = await fetch(`/api/orders/${order!.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
  });

  // Recalculate totalPrice whenever items change — skipped when user has manually
  // overridden the price (manualPriceOverride flag set by the Prix total onChange).
  useEffect(() => {
    if (manualPriceOverride || localItems.length === 0) return;
    const sum = localItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0
    );
    setFields((f: any) => ({ ...f, totalPrice: (sum / 100).toFixed(2) }));
  }, [localItems, manualPriceOverride]);

  // When fresh server data arrives, patch totalPrice (and re-evaluate the
  // manualPriceOverride flag) — but only if the user hasn't already typed a
  // manual override since the modal opened. This corrects a stale prop that
  // the parent list-cache may have passed.
  useEffect(() => {
    if (!freshOrder?.id) return;
    if (freshOrder.id === freshOrderAppliedRef.current) return; // already applied
    freshOrderAppliedRef.current = freshOrder.id;
    const dbTotal = freshOrder.totalPrice ?? 0;
    const itemsSum = (freshOrder.items || []).reduce(
      (s: number, i: any) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 1)),
      0
    );
    const hasOverride = Math.abs(dbTotal - itemsSum) > 100;
    setManualPriceOverride(hasOverride);
    // Update totalPrice only if user hasn't manually typed a value yet
    if (!manualPriceOverride) {
      setFields((f: any) => ({
        ...f,
        totalPrice: dbTotal ? (dbTotal / 100).toFixed(2) : "0.00",
      }));
    }
    console.log('[ORDER-MODAL-LOAD]', {
      orderId: freshOrder.id,
      fromFresh_totalPrice: dbTotal,
      finalUsedDH: (dbTotal / 100).toFixed(2),
      itemsSum,
      hasOverride,
    });
  }, [freshOrder]);

  useEffect(() => {
    if (!order) {
      prevOrderIdRef.current = null;
      freshOrderAppliedRef.current = null; // reset so reopen re-applies fresh data
      return;
    }
    const isNewOrder = order.id !== prevOrderIdRef.current;
    if (isNewOrder) {
      prevOrderIdRef.current = order.id;
      // Detect whether the stored totalPrice is a manual override (differs from
      // items subtotal by > 1 DH). If so, keep manualPriceOverride=true so the
      // items-useEffect doesn't clobber it when setLocalItems triggers it below.
      const dbTotal = order.totalPrice ?? 0;
      const itemsSum = (order.items || []).reduce(
        (s: number, i: any) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 1)),
        0
      );
      setManualPriceOverride(Math.abs(dbTotal - itemsSum) > 100);
    }
    const firstItemVariant = order.items?.[0]?.variantInfo || "";
    const variantFallback = firstItemVariant || order.variantDetails || "";
    setFields((prev: any) => ({
      // For a new order, start completely fresh from DB values.
      // For a same-order refresh, keep existing field edits and only sync
      // fields that come purely from the server (not user-editable mid-session).
      ...(isNewOrder ? {} : prev),
      replace: !!order.replace,
      canOpen: order.canOpen !== 0,
      upSell: !!order.upSell,
      isStock: !!order.isStock,
      replacementTrackNumber: order.replacementTrackNumber || "",
      customerName: isNewOrder ? cleanCustomerName(order.customerName || "") : (prev.customerName ?? cleanCustomerName(order.customerName || "")),
      customerPhone: isNewOrder ? (order.customerPhone || "") : (prev.customerPhone ?? order.customerPhone ?? ""),
      customerAddress: isNewOrder ? (order.customerAddress || "") : (prev.customerAddress ?? order.customerAddress ?? ""),
      customerCity: isNewOrder ? (order.customerCity || "") : (prev.customerCity ?? order.customerCity ?? ""),
      status: isNewOrder ? (order.status || "nouveau") : (prev.status ?? order.status ?? "nouveau"),
      scheduledFor: isNewOrder ? (order.scheduledFor || "") : (prev.scheduledFor ?? order.scheduledFor ?? ""),
      comment: isNewOrder ? (order.comment || "") : (prev.comment ?? order.comment ?? ""),
      commentStatus: isNewOrder ? (order.commentStatus || "") : (prev.commentStatus ?? order.commentStatus ?? ""),
      rawProductName: isNewOrder ? (order.rawProductName || (order.items?.[0]?.rawProductName) || (order.items?.[0]?.product?.name) || "") : (prev.rawProductName ?? order.rawProductName ?? ""),
      // For a new order, seed price from DB. For same-order refresh, keep whatever
      // the user typed (manualPriceOverride keeps auto-calc from clobbering it too).
      totalPrice: isNewOrder ? (order.totalPrice ? (order.totalPrice / 100).toFixed(2) : "0.00") : (prev.totalPrice ?? (order.totalPrice ? (order.totalPrice / 100).toFixed(2) : "0.00")),
      variantInfo: isNewOrder ? (variantFallback !== "null" ? variantFallback : "") : (prev.variantInfo ?? (variantFallback !== "null" ? variantFallback : "")),
      commentOrder: isNewOrder ? (order.commentOrder || "") : (prev.commentOrder ?? order.commentOrder ?? ""),
    }));
    const mappedItems = (order.items || []).map((item: any) => ({
      ...item,
      variantInfo: item.variantInfo === "null" ? "" : (item.variantInfo || ""),
      // Ensure rawProductName is never null/empty when product name is available
      rawProductName: item.rawProductName || item.product?.name || "",
    }));

    // If the order has no items rows but has a rawProductName (e.g. Shopify/WooCommerce webhook),
    // seed the Articles section with that product name so it's never empty.
    if (mappedItems.length === 0) {
      const seedName = order.rawProductName || "";
      if (seedName) {
        mappedItems.push({
          id: "seed-0",
          rawProductName: seedName,
          sku: "",
          variantInfo: order.variantDetails && order.variantDetails !== "null" ? order.variantDetails : "",
          quantity: order.rawQuantity || 1,
          price: order.totalPrice || 0,
          productId: null,
        });
      }
    }

    setLocalItems(mappedItems);
  }, [order]);

  // ── Save mutation ──
  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!order) return null;
      // Client-side guard: confirme_reporte requires a scheduled date in the future.
      // Server validates again, but failing fast here gives a clearer error.
      if (fields.status === 'confirme_reporte') {
        const sf = (fields.scheduledFor || "").slice(0, 10);
        if (!sf) {
          toast({ title: "Date requise", description: "Veuillez choisir une date de livraison souhaitée.", variant: "destructive" });
          throw new Error("scheduledFor required");
        }
        const target = new Date(sf);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (target < today) {
          toast({ title: "Date invalide", description: "La date programmée ne peut pas être dans le passé.", variant: "destructive" });
          throw new Error("scheduledFor in past");
        }
      }
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
        scheduledFor: fields.status === 'confirme_reporte'
          ? ((fields.scheduledFor || "").slice(0, 10) || null)
          : null,
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
        if (typeof item.id === "string" && (item.id.startsWith("new-") || item.id.startsWith("seed-"))) {
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
      // Invalidate the single-order cache so the modal re-renders with fresh
      // DB data on next open, instead of the stale filtered-list prop value.
      if (order?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', order.id] });
      }
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

  const attachTracking = useMutation({
    mutationFn: (trackingNumber: string) =>
      apiRequest("PATCH", `/api/orders/${order!.id}/attach-tracking`, {
        trackingNumber,
        provider: 'expresscoursier',
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order?.id] });
      setEcTrackInput("");
      const retroMsg = data?.retroMatched
        ? ` Statut retro-appliqué: ${data.status}.`
        : " Suivi démarré — le statut sera mis à jour au prochain webhook EC.";
      toast({
        title: `✅ Tracking EC attaché — ${data?.trackingNumber}`,
        description: `La commande entre en Suivi.${retroMsg}`,
      });
      if (onUpdated) onUpdated({ ...order!, trackNumber: data?.trackingNumber, status: data?.status ?? 'Attente De Ramassage' });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message || "Impossible d'attacher le tracking", variant: "destructive" }),
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

  const resetShipping = useMutation({
    mutationFn: () => apiRequest("POST", `/api/orders/${order!.id}/reset-shipping`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      toast({ title: "Expédition réinitialisée", description: "La commande est revenue au statut Confirmée et peut être réexpédiée." });
      if (onUpdated) onUpdated({ ...order, status: 'confirme', trackNumber: null });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const set = (key: string, value: any) => setFields((f: any) => ({ ...f, [key]: value }));
  const handleItemChange = (id: string | number, field: string, value: any) => {
    setLocalItems(items => items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  const handleItemDelete = async (id: string | number) => {
    // new-* and seed-* items don't exist in DB yet — just remove from local state
    if (typeof id === "string" && (id.startsWith("new-") || id.startsWith("seed-"))) {
      setLocalItems(items => items.filter(i => i.id !== id));
      return;
    }
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

          {/* Livreur section — visible whenever carrier reported a driver */}
          {((order as any).driverPhone || (order as any).driverName) && (
            <div className="mx-4 mt-4 rounded-xl border p-3 bg-blue-50 dark:bg-blue-900/20 space-y-2" data-testid="section-driver-info">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700 flex items-center gap-1.5">
                🚴 Livreur assigné
              </p>
              <div className="flex items-center justify-between">
                <div>
                  {(order as any).driverName && (
                    <p className="font-semibold text-sm" data-testid="text-driver-name">{(order as any).driverName}</p>
                  )}
                  {(order as any).driverPhone && (
                    <p className="text-xs text-muted-foreground" data-testid="text-driver-phone">{(order as any).driverPhone}</p>
                  )}
                </div>
                {(order as any).driverPhone && (
                  <div className="flex gap-2">
                    <a
                      href={`tel:${(order as any).driverPhone}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600"
                      data-testid="link-driver-call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Appeler
                    </a>
                    <a
                      href={`https://wa.me/${String((order as any).driverPhone).replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600"
                      data-testid="link-driver-whatsapp"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  carrierLogo={getCarrierLogo(carrierData?.provider ?? orderCarrier)}
                  isLoading={citiesLoading}
                  data-testid="select-city"
                  className="w-full"
                />
                {/* ── Carrier city mismatch alert ─────────────────────── */}
                {(() => {
                  const city = (fields.customerCity || "").trim();
                  if (!city || !isCarrierSpecific || carrierCities.length === 0) return null;
                  const norm = (s: string) =>
                    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                  const exact = carrierCities.some(c => norm(c) === norm(city));
                  if (exact) return null;
                  const suggestion = findBestCityMatch(city, carrierCities);
                  return (
                    <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                      <div>
                        <p className="font-medium text-[13px]">
                          ⚠️ هذه المدينة غير مدعومة من طرف هذه الشركة، يرجى التصحيح
                        </p>
                        {suggestion && (
                          <button
                            type="button"
                            className="mt-1 text-[11px] underline text-red-600 hover:text-red-800"
                            onClick={() => set("customerCity", suggestion)}
                          >
                            اقتراح: استخدم «{suggestion}»
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                      <SelectItem
                        key={s.value}
                        value={s.value}
                        disabled={s.disabled}
                        className={s.disabled
                          ? "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pointer-events-none opacity-70 justify-center"
                          : undefined}
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>


            {/* Date picker — only when status = confirme_reporte */}
            {fields.status === 'confirme_reporte' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-4">
                <Field label="📅 Date de livraison souhaitée">
                  <Input
                    type="date"
                    min={(() => {
                      const t = new Date();
                      t.setDate(t.getDate() + 1);
                      return t.toISOString().split('T')[0];
                    })()}
                    value={(fields.scheduledFor || "").slice(0, 10)}
                    onChange={e => set("scheduledFor", e.target.value)}
                    className={inputCls}
                    data-testid="input-scheduled-for"
                  />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Date de rappel enregistrée — l'agent devra confirmer manuellement.
                  </p>
                </Field>
              </div>
            )}

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
                    onChange={e => { setManualPriceOverride(true); set("totalPrice", e.target.value); }}
                    className={cn(inputCls, "flex-1 bg-gray-50 text-right font-bold")}
                    style={{ color: NAVY }}
                    data-testid="input-total-price"
                  />
                  <span
                    className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg text-white"
                    style={{ backgroundColor: NAVY }}
                  >DH</span>
                </div>
                {/* Offer/discount badge — shown when total differs from items sum by > 1 DH */}
                {(() => {
                  const itemsSubtotal = localItems.reduce(
                    (s: number, i: any) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 1)),
                    0
                  );
                  const facture = Math.round(parseFloat(fields.totalPrice || "0") * 100);
                  const isOffer = Math.abs(itemsSubtotal - facture) > 100;
                  if (!isOffer) return null;
                  return (
                    <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded p-2 mt-2" data-testid="badge-offer-discount">
                      <div className="flex justify-between">
                        <span>Sous-total articles:</span>
                        <span className="font-mono">{(itemsSubtotal / 100).toFixed(2)} DH</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total facturé:</span>
                        <span className="font-mono">{(facture / 100).toFixed(2)} DH</span>
                      </div>
                      <div className="flex justify-between text-amber-700 dark:text-amber-300 text-[10px] mt-1">
                        <span>Offre/remise:</span>
                        <span className="font-mono">−{((itemsSubtotal - facture) / 100).toFixed(2)} DH</span>
                      </div>
                    </div>
                  );
                })()}
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

          {/* ── EC tracking attach — Express Coursier only, no trackNumber yet ── */}
          {isEC && !(order as any)?.trackNumber && (
            <div className="mx-4 mb-3 rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-orange-700 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5" />
                Tracking Express Coursier (package_id)
              </p>
              <p className="text-[11px] text-orange-600">
                Pour les colis créés directement chez EC (non expédiés via la plateforme). Une fois attaché, la commande entre en Suivi et les prochains webhooks EC se lieront automatiquement.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={ecTrackInput}
                  onChange={e => setEcTrackInput(e.target.value.trim())}
                  placeholder="ex: CL-EXP-2607061340-164X51032181"
                  className="w-full h-11 sm:h-9 text-sm font-mono border-orange-200 bg-white"
                  data-testid="input-ec-track-number"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && ecTrackInput) attachTracking.mutate(ecTrackInput);
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => { if (ecTrackInput) attachTracking.mutate(ecTrackInput); }}
                  disabled={!ecTrackInput || attachTracking.isPending}
                  className="h-11 sm:h-9 w-full sm:w-auto px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                  data-testid="button-attach-ec-tracking"
                >
                  {attachTracking.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><PackageCheck className="w-3.5 h-3.5 mr-1.5" />Attacher</>}
                </Button>
              </div>
            </div>
          )}

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

            {/* Admin-only: reset a shipped order back to Confirmée */}
            {isAdmin && (order as any)?.trackNumber && (
              <div className="order-0 sm:order-0 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Réinitialiser l'expédition de la commande #${order?.orderNumber || order?.id} ?\n\nLe numéro de suivi et les informations transporteur seront effacés. La commande reviendra au statut "Confirmée".`)) return;
                    resetShipping.mutate();
                  }}
                  disabled={resetShipping.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50 font-semibold text-xs w-full sm:w-auto"
                  data-testid="button-reset-shipping"
                >
                  {resetShipping.isPending
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                  Réinitialiser l'expédition
                </Button>
              </div>
            )}

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

import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, X, History, ShieldAlert, Trophy, TriangleAlert } from "lucide-react";

/* ─── Types ───────────────────────────────────────────────── */
interface HistoryOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerCity: string | null;
  status: string;
  totalPrice: number;
  rawProductName: string | null;
  variantDetails: string | null;
  storeName?: string;
  createdAt: string;
  items?: Array<{
    rawProductName: string | null;
    variantInfo: string | null;
    sku: string | null;
    quantity: number;
    product?: { name: string; sku: string } | null;
  }>;
}

/* ─── Helpers ─────────────────────────────────────────────── */
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-MA", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatCurrency(n: number) {
  return (n / 100).toLocaleString("fr-MA", { style: "currency", currency: "MAD", maximumFractionDigits: 0 });
}

function getProductDisplay(order: HistoryOrder): { name: string; sku: string; variant: string } {
  const firstItem = order.items?.[0];
  const name =
    firstItem?.product?.name ||
    firstItem?.rawProductName ||
    order.rawProductName ||
    "—";
  const sku = firstItem?.sku || firstItem?.product?.sku || "";
  const variant = firstItem?.variantInfo || order.variantDetails || "";
  return { name, sku, variant };
}

/* ─── Smart customer intelligence banner ─────────────────── */
function IntelligenceBanner({ orders }: { orders: HistoryOrder[] }) {
  if (orders.length <= 1) return null;

  const delivered  = orders.filter(o => o.status === "delivered").length;
  const cancelled  = orders.filter(o => o.status.startsWith("Annulé") || o.status === "refused").length;
  const total      = orders.length;

  if (delivered > 0 && delivered / total >= 0.5) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
        <Trophy className="w-4 h-4 shrink-0 text-emerald-600" />
        <span>
          <strong>Client fidèle</strong> — {delivered} commande{delivered > 1 ? "s" : ""} livrée{delivered > 1 ? "s" : ""} sur {total}.
          Priorité haute ✅
        </span>
      </div>
    );
  }
  if (cancelled > 0 && cancelled / total >= 0.5) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
        <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
        <span>
          <strong>Attention</strong> — {cancelled} annulation{cancelled > 1 ? "s" : ""} sur {total} commandes.
          Soyez prudent ⚠️
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
      <TriangleAlert className="w-4 h-4 shrink-0 text-amber-600" />
      <span>
        <strong>{total} commandes</strong> pour ce numéro — vérifiez l'historique avant confirmation.
      </span>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────── */
interface CustomerHistoryModalProps {
  phone: string;
  onClose: () => void;
}

export function CustomerHistoryModal({ phone, onClose }: CustomerHistoryModalProps) {
  const { data: orders = [], isLoading, isError } = useQuery<HistoryOrder[]>({
    queryKey: ["/api/orders/customer", phone],
    queryFn: async () => {
      const res = await fetch(`/api/orders/customer/${encodeURIComponent(phone)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erreur lors du chargement");
      return res.json();
    },
    enabled: !!phone,
    staleTime: 30_000,
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col"
        style={{ fontFamily: "inherit" }}
      >
        {/* ── Blue header ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ background: "#1e40af" }}
          data-testid="modal-header-customer-history"
        >
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-white/80" />
            <div>
              <h2 className="text-white font-bold text-base tracking-wide">
                Commandes — {phone}
              </h2>
              <p className="text-blue-200 text-xs mt-0.5">
                Historique complet · trié par date
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            data-testid="button-close-customer-history"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950">

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin" />
              <p className="text-sm">Chargement de l'historique…</p>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-red-500">Erreur lors du chargement des commandes.</p>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && orders.length === 0 && (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-muted-foreground">Aucune commande trouvée pour ce numéro.</p>
            </div>
          )}

          {/* Content */}
          {!isLoading && !isError && orders.length > 0 && (
            <div className="flex flex-col gap-0">

              {/* Intelligence banner */}
              <div className="px-4 pt-4 pb-2">
                <IntelligenceBanner orders={orders} />
              </div>

              {/* ── Desktop table ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Client
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Ville
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Téléphone
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Produit
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Statut
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Magasin
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, idx) => {
                      const { name: pName, sku, variant } = getProductDisplay(order);
                      const isDelivered = order.status === "delivered";
                      const isCancelled = order.status.startsWith("Annulé") || order.status === "refused";
                      return (
                        <tr
                          key={order.id}
                          data-testid={`row-history-${order.id}`}
                          className={`border-b border-gray-100 dark:border-zinc-800 transition-colors ${
                            isDelivered
                              ? "bg-emerald-50/40 dark:bg-emerald-900/10"
                              : isCancelled
                              ? "bg-rose-50/40 dark:bg-rose-900/10"
                              : idx % 2 === 0 ? "bg-white dark:bg-zinc-950" : "bg-gray-50/60 dark:bg-zinc-900/40"
                          }`}
                        >
                          {/* Client */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-[13px] text-foreground">
                              {order.customerName}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              #{order.orderNumber}
                            </div>
                          </td>

                          {/* Ville */}
                          <td className="px-4 py-3 whitespace-nowrap text-[13px] text-muted-foreground">
                            {order.customerCity || "—"}
                          </td>

                          {/* Téléphone */}
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px] text-muted-foreground">
                            {order.customerPhone}
                          </td>

                          {/* Produit */}
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="font-medium text-[13px] text-foreground leading-tight line-clamp-2">
                              {pName}
                            </div>
                            {sku && (
                              <div className="text-[10px] font-mono text-blue-600 mt-0.5">
                                SKU: {sku}
                              </div>
                            )}
                            {variant && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 italic">
                                {variant}
                              </div>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={order.status} className="text-[10px]" />
                          </td>

                          {/* Magasin */}
                          <td className="px-4 py-3 whitespace-nowrap text-[12px] text-muted-foreground">
                            {order.storeName || "—"}
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3 whitespace-nowrap text-[12px] text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile cards ── */}
              <div className="md:hidden flex flex-col divide-y divide-gray-100 dark:divide-zinc-800 px-3 pt-1 pb-3 gap-2">
                {orders.map((order) => {
                  const { name: pName, sku, variant } = getProductDisplay(order);
                  const isDelivered = order.status === "delivered";
                  const isCancelled = order.status.startsWith("Annulé") || order.status === "refused";
                  return (
                    <div
                      key={order.id}
                      data-testid={`card-history-mobile-${order.id}`}
                      className={`rounded-xl p-3 border mt-2 ${
                        isDelivered
                          ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10"
                          : isCancelled
                          ? "border-rose-200 bg-rose-50/60 dark:bg-rose-900/10"
                          : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-bold text-[13px]">{order.customerName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">#{order.orderNumber}</p>
                        </div>
                        <StatusBadge status={order.status} className="text-[9px] shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Ville: </span>
                          <span className="font-medium">{order.customerCity || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date: </span>
                          <span className="font-medium">{formatDate(order.createdAt)}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Produit: </span>
                          <span className="font-medium">{pName}</span>
                          {sku && <span className="text-blue-600 font-mono ml-1">({sku})</span>}
                        </div>
                        {variant && (
                          <div className="col-span-2 italic text-muted-foreground">{variant}</div>
                        )}
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Magasin: </span>
                          <span className="font-medium">{order.storeName || "—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {!isLoading && !isError && orders.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0"
            data-testid="footer-customer-history"
          >
            <p className="text-xs text-muted-foreground">
              Toutes les commandes sont triées de la plus récente à la plus ancienne.
            </p>
            <p className="text-sm font-bold text-foreground">
              Total :{" "}
              <span className="text-blue-700 dark:text-blue-400">
                {orders.length} commande{orders.length > 1 ? "s" : ""}
              </span>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

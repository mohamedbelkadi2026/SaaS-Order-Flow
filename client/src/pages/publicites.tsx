import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2 } from "lucide-react";

const AD_SOURCES = ["Facebook Ads", "Google Ads", "TikTok Ads", "Snapchat Ads"];
const BURGUNDY = "#800040";

function fmtAmount(cents: number) {
  return (cents / 100).toLocaleString("fr-MA", { maximumFractionDigits: 0 });
}

export default function Publicites() {
  const { user } = useAuth();
  const { data: products = [] } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const [tab, setTab] = useState<"source" | "produit">("source");
  const [filterSource, setFilterSource] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    source: "all", product: "all", dateFrom: "", dateTo: "",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [mDate, setMDate] = useState(new Date().toISOString().split("T")[0]);
  const [mSource, setMSource] = useState(AD_SOURCES[0]);
  const [mProduct, setMProduct] = useState("none");
  const [mAmount, setMAmount] = useState("");
  const [mSellingPrice, setMSellingPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: storeData } = useQuery<any>({ queryKey: ['/api/store'] });
  const storeName = storeData?.name || "Mon Site";

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/publicites", tab, appliedFilters],
    queryFn: async () => {
      const p = new URLSearchParams({ tab });
      if (appliedFilters.source !== "all") p.set("source", appliedFilters.source);
      if (appliedFilters.product !== "all") p.set("productId", appliedFilters.product);
      if (appliedFilters.dateFrom) p.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) p.set("dateTo", appliedFilters.dateTo);
      const res = await fetch(`/api/publicites?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/publicites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publicites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      toast({ title: "Supprimé" });
    },
  });

  const totalCents = entries.reduce((s: number, e: any) => s + (e.amount || 0), 0);

  function applyFilters() {
    setAppliedFilters({ source: filterSource, product: filterProduct, dateFrom: filterDateFrom, dateTo: filterDateTo });
  }

  function switchTab(t: "source" | "produit") {
    setTab(t);
    setAppliedFilters({ source: "all", product: "all", dateFrom: "", dateTo: "" });
    setFilterSource("all"); setFilterProduct("all"); setFilterDateFrom(""); setFilterDateTo("");
  }

  async function handleSave() {
    if (!mDate || !mSource || !mAmount) {
      toast({ title: "Champs obligatoires manquants", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const body: any = { date: mDate, source: mSource, amount: Number(mAmount) };
      if (tab === "produit" && mProduct !== "none") body.productId = Number(mProduct);
      if (tab === "produit" && mSellingPrice) body.productSellingPrice = Number(mSellingPrice);
      await apiRequest("POST", "/api/publicites", body);
      queryClient.invalidateQueries({ queryKey: ["/api/publicites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      toast({ title: "Enregistré avec succès" });
      setModalOpen(false);
      setMDate(new Date().toISOString().split("T")[0]);
      setMSource(AD_SOURCES[0]); setMProduct("none"); setMAmount(""); setMSellingPrice("");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const colSpanTotal = tab === "produit" ? 4 : 3;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header tabs — matching screenshot nav style */}
      <div className="flex items-center gap-0 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => switchTab("source")}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold transition-colors border-b-2"
          style={tab === "source"
            ? { borderColor: BURGUNDY, color: BURGUNDY }
            : { borderColor: "transparent", color: "#6b7280" }}
          data-testid="tab-par-source"
        >
          📢 Par Source
        </button>
        <button
          onClick={() => switchTab("produit")}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold transition-colors border-b-2"
          style={tab === "produit"
            ? { borderColor: BURGUNDY, color: BURGUNDY }
            : { borderColor: "transparent", color: "#6b7280" }}
          data-testid="tab-par-produit"
        >
          📢 Par Produit
        </button>
      </div>

      {/* Page title */}
      <h1 className="text-center text-base font-bold uppercase tracking-widest text-gray-700 dark:text-gray-200 mb-5" data-testid="page-title">
        PUBLICITÉ {tab === "source" ? "PAR SOURCE DE TRAFFIC" : "PAR PRODUIT"}
      </h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Site */}
        <div className="relative">
          <select
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 pr-7 appearance-none min-w-[140px]"
            data-testid="filter-site"
          >
            <option value="all">Tous les Sites</option>
            <option value="1">{storeName}</option>
          </select>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
        </div>

        {/* Produit — Par Produit only */}
        {tab === "produit" && (
          <div className="relative">
            <select
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 pr-7 appearance-none min-w-[160px]"
              value={filterProduct}
              onChange={e => setFilterProduct(e.target.value)}
              data-testid="filter-product"
            >
              <option value="all">Tous les Produits</option>
              {(products as any[]).map((p: any) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
          </div>
        )}

        {/* Source de traffic */}
        <div className="relative">
          <select
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 pr-7 appearance-none min-w-[160px]"
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            data-testid="filter-source"
          >
            <option value="all">Source de traffic</option>
            {AD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-sm">
          <input
            type="date"
            className="bg-transparent outline-none text-gray-700 dark:text-gray-200 w-[118px] text-xs"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            data-testid="filter-date-from"
          />
          <span className="text-gray-400 text-xs">-</span>
          <input
            type="date"
            className="bg-transparent outline-none text-gray-700 dark:text-gray-200 w-[118px] text-xs"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            data-testid="filter-date-to"
          />
        </div>

        {/* Filtrer */}
        <button
          className="px-5 py-1.5 rounded text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: BURGUNDY }}
          onClick={applyFilters}
          data-testid="btn-filtrer"
        >
          Filtrer
        </button>
      </div>

      {/* Nouvelle + */}
      {isAdmin && (
        <div className="flex justify-end mb-2">
          <button
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1 transition-colors"
            onClick={() => setModalOpen(true)}
            data-testid="btn-nouvelle"
          >
            📢 Nouvelle +
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-900">
        <table className="w-full text-sm" data-testid="ad-spend-table">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">Site</th>
              {tab === "produit" && (
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">Produit</th>
              )}
              <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">Source Traffic</th>
              {tab === "produit" && (
                <th className="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">Prix Produit (DH)</th>
              )}
              <th className="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">Cout Publicité ($)</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={tab === "produit" ? 6 : 4} className="text-center py-10 text-gray-400 text-sm">
                  Chargement...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={tab === "produit" ? 6 : 4} className="text-center py-12 text-gray-400 text-sm">
                  Aucune dépense trouvée pour cette période
                </td>
              </tr>
            ) : entries.map((e: any) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" data-testid={`row-${e.id}`}>
                <td className="px-4 py-2.5 border-r border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 text-sm">{storeName}</td>
                {tab === "produit" && (
                  <td className="px-4 py-2.5 border-r border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 text-sm">
                    {e.productName || "—"}
                  </td>
                )}
                <td className="px-4 py-2.5 border-r border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-sm">{e.source}</td>
                {tab === "produit" && (
                  <td className="px-4 py-2.5 border-r border-gray-100 dark:border-gray-800 text-right text-gray-800 dark:text-gray-200 text-sm">
                    {e.productSellingPrice ? fmtAmount(e.productSellingPrice) : "—"}
                  </td>
                )}
                <td className="px-4 py-2.5 border-r border-gray-100 dark:border-gray-800 text-right font-medium text-gray-800 dark:text-gray-200 text-sm">
                  {fmtAmount(e.amount)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {isAdmin && (
                    <button
                      className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-70 transition-opacity"
                      style={{ color: BURGUNDY }}
                      onClick={() => deleteMut.mutate(e.id)}
                      disabled={deleteMut.isPending}
                      data-testid={`btn-delete-${e.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <td colSpan={colSpanTotal} className="px-4 py-3 text-right font-bold text-gray-800 dark:text-gray-100 text-sm" data-testid="total-label">
                  Total :
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-gray-100 text-sm" data-testid="total-value">
                  {fmtAmount(totalCents)} $
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
          data-testid="modal-overlay"
        >
          <div className="bg-white dark:bg-gray-900 rounded shadow-2xl w-full max-w-sm mx-4">
            <div className="p-6">
              <button
                className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 text-2xl leading-none mb-2 block"
                onClick={() => setModalOpen(false)}
                data-testid="modal-close"
              >
                ×
              </button>
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-4">Informations :</p>

              {/* Date */}
              <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Date :</label>
                <input
                  type="date"
                  className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent outline-none"
                  value={mDate}
                  onChange={e => setMDate(e.target.value)}
                  data-testid="modal-date"
                />
              </div>

              {/* Produits — Par Produit only */}
              {tab === "produit" && (
                <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Produits :</label>
                  <select
                    className="w-full text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-700 rounded px-2 py-1"
                    value={mProduct}
                    onChange={e => setMProduct(e.target.value)}
                    data-testid="modal-product"
                  >
                    <option value="none">— Sélectionner —</option>
                    {(products as any[]).map((p: any) => (
                      <option key={p.id} value={String(p.id)}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Source de traffic */}
              <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                  Source de traffic{tab === "produit" ? ":" : " :"}
                </label>
                <select
                  className="w-full text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none"
                  value={mSource}
                  onChange={e => setMSource(e.target.value)}
                  data-testid="modal-source"
                >
                  {AD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Site */}
              <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Site:</label>
                <select
                  className="w-full text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none"
                  data-testid="modal-site"
                >
                  <option value="1">{storeName}</option>
                </select>
              </div>

              {/* Cout */}
              <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                  {tab === "produit" ? "Cout publicité ($) :" : "Cout ($) :"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent outline-none"
                  value={mAmount}
                  onChange={e => setMAmount(e.target.value)}
                  data-testid="modal-amount"
                />
              </div>

              {/* Prix de vente — Par Produit only */}
              {tab === "produit" && (
                <div className="border border-gray-200 dark:border-gray-700 rounded mb-3 p-3">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Prix de vente (DH) :</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent outline-none"
                    value={mSellingPrice}
                    onChange={e => setMSellingPrice(e.target.value)}
                    data-testid="modal-selling-price"
                  />
                </div>
              )}

              {/* Valider */}
              <button
                className="px-6 py-2 rounded text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ background: BURGUNDY }}
                onClick={handleSave}
                disabled={submitting}
                data-testid="modal-valider"
              >
                {submitting ? "..." : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

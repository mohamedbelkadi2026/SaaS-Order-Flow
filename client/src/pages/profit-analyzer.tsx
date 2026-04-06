import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Upload, CheckCircle2, RotateCcw, TrendingUp, Package, Truck,
  Megaphone, DollarSign, Target, Sparkles, ArrowRight, BarChart3,
  Globe, Settings2, AlertTriangle, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";
const NAVY_MID = "#1A2F4E";

/* ─── Helpers ───────────────────────────────────────── */
/** Strip diacritics and lowercase — makes matching locale-agnostic */
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Find the header that best matches any keyword (substring, accent-insensitive) */
function detectCol(headers: string[], keywords: string[]): string {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => norm(h).includes(norm(kw)));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

/**
 * Scan data rows to find a column whose VALUES contain "Designation".
 * Handles files where the product column is named "Ref" but values look like
 * "Designation : Product Name" — common in Moroccan carrier exports.
 */
function detectProductColFromData(headers: string[], dataRows: any[][]): string {
  const sample = dataRows.slice(0, 30);
  let bestCol = "";
  let bestScore = 0;
  for (let ci = 0; ci < headers.length; ci++) {
    const hits = sample.filter(r => {
      const v = norm(String(r[ci] ?? ""));
      return v.includes("designat") || v.startsWith("ref");
    }).length;
    if (hits > bestScore) { bestScore = hits; bestCol = headers[ci]; }
  }
  return bestScore >= 1 ? bestCol : "";
}

/**
 * Strip common carrier-export prefixes from product name values.
 * e.g. "Designation : Chaussures Homme" → "Chaussures Homme"
 */
function cleanProductName(raw: string): string {
  return raw
    .replace(/^designation\s*:\s*/i, "")
    .replace(/^ref\s*:\s*/i, "")
    .trim();
}

/** Parse a number from mixed-format cells (French: "1 234,56" / US: "1,234.56") */
function parseNum(val: any): number {
  if (val == null || val === "") return 0;
  // If already a number (from XLSX numeric cell), return directly
  if (typeof val === "number") return val;
  const s = String(val)
    .replace(/\s/g, "")          // remove spaces
    .replace(/[^\d.,-]/g, "")   // keep digits, dot, comma, minus
    .replace(/,(\d{1,2})$/, ".$1"); // trailing comma = decimal sep
  return parseFloat(s) || 0;
}

/** "Livré" / "livrée" / "delivered" etc. */
function isDelivered(statusVal: string): boolean {
  const n = norm(statusVal);
  return n.includes("livr") || n.includes("deliver") || n === "done" || n === "complete";
}

/* ─── Types ─────────────────────────────────────────── */
interface ColMap { product: string; qty: string; cod: string; status: string }

interface ProductSummary {
  name: string;
  totalQty: number;
  totalRevenue: number;
  rowCount: number;
  buyingCost: string;
  shippingFee: string;
  adSpend: string;
  suggestedPrice?: number;
}

interface ProfitResult {
  name: string; qty: number; revenue: number;
  cogs: number; shipping: number; adSpend: number;
  totalCost: number; netProfit: number; roi: number;
}

/* ─── Step indicator ─────────────────────────────────── */
function StepBar({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Import fichier" },
    { n: 2, label: "Saisie des coûts" },
    { n: 3, label: "Rapport final" },
  ];
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              current > s.n ? "border-amber-500 bg-amber-500 text-white"
              : current === s.n ? "border-amber-400 bg-amber-400/20 text-amber-300"
              : "border-slate-600 bg-slate-800/50 text-slate-500"
            }`}>
              {current > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${
              current === s.n ? "text-amber-400" : current > s.n ? "text-amber-600" : "text-slate-600"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mx-1 mb-4 ${current > s.n ? "bg-amber-500" : "bg-slate-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── KPI card ───────────────────────────────────────── */
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4 border border-white/10 bg-white/5 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: `${color}22` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{label}</p>
        <p className="text-xl font-extrabold text-white leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────── */
export default function ProfitAnalyzer() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  /* state */
  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  /* raw data stored so remapping works without re-reading the file */
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawDataRows, setRawDataRows] = useState<any[][]>([]);

  const [colMap, setColMap] = useState<ColMap>({ product: "", qty: "", cod: "", status: "" });
  const [previewProducts, setPreviewProducts] = useState<ProductSummary[]>([]);
  const [previewMeta, setPreviewMeta] = useState({ totalRows: 0, filteredRows: 0, noStatusFilter: false });
  const [hasParsed, setHasParsed] = useState(false);

  /* step-2 editable products */
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [adMode, setAdMode] = useState<"global" | "specific">("global");
  const [globalAdSpend, setGlobalAdSpend] = useState("0");

  /* step-3 results */
  const [results, setResults] = useState<ProfitResult[]>([]);

  /* ── Inventory price suggestions ── */
  const { data: inventoryStats } = useQuery<any>({
    queryKey: ["/api/inventory/stats"],
    retry: false,
  });
  function getSuggestedPrice(productName: string): number | undefined {
    const stats: any[] = inventoryStats?.productStats ?? [];
    const found = stats.find(p => norm(p.name) === norm(productName));
    return found ? found.sellingPrice / 100 : undefined;
  }

  /* ── Core: build product summaries from raw rows + colMap ── */
  function buildProducts(
    dataRows: any[][],
    headers: string[],
    map: ColMap,
  ): { ok: boolean; error?: string } {
    const pIdx = headers.indexOf(map.product);
    const qIdx = headers.indexOf(map.qty);
    const cIdx = headers.indexOf(map.cod);
    const sIdx = headers.indexOf(map.status);

    if (pIdx === -1) {
      return { ok: false, error: "⚠️ Impossible de détecter la colonne Produit. Sélectionnez-la manuellement." };
    }

    const hasStatus = sIdx !== -1;
    const hasQty = qIdx !== -1;
    const hasCod = cIdx !== -1;

    const totalRows = dataRows.filter(r => {
      const n = cleanProductName(String(r[pIdx] ?? "").trim());
      return n !== "";
    }).length;

    /* Filter by delivered status */
    const relevantRows = dataRows.filter(r => {
      const name = cleanProductName(String(r[pIdx] ?? "").trim());
      if (!name) return false;
      if (!hasStatus) return true; // no status col → include all
      return isDelivered(String(r[sIdx] ?? ""));
    });

    if (totalRows > 0 && relevantRows.length === 0 && hasStatus) {
      return {
        ok: false,
        error: `⚠️ Aucune ligne avec statut "Livré/Livrée/Delivered" trouvée dans ${totalRows} lignes. Vérifiez la colonne Statut ou sélectionnez "(aucune)" pour tout inclure.`,
      };
    }

    /* Group by product — strip carrier-specific prefixes from name values */
    const groupMap: Record<string, { qty: number; rev: number; count: number; displayName: string }> = {};
    for (const row of relevantRows) {
      const rawVal = String(row[pIdx] ?? "").trim();
      if (!rawVal) continue;
      const name = cleanProductName(rawVal);   // strips "Designation : " etc.
      if (!name) continue;
      const key = norm(name);
      if (!groupMap[key]) groupMap[key] = { qty: 0, rev: 0, count: 0, displayName: name };
      groupMap[key].qty += hasQty ? (parseNum(row[qIdx]) || 1) : 1;
      groupMap[key].rev += hasCod ? parseNum(row[cIdx]) : 0;
      groupMap[key].count++;
    }

    if (Object.keys(groupMap).length === 0) {
      return { ok: false, error: "⚠️ Aucun produit valide trouvé. Vérifiez le format du fichier." };
    }

    const summaries: ProductSummary[] = Object.entries(groupMap).map(([key, d]) => {
      const cleanName = d.displayName;
      return {
        name: cleanName,
        totalQty: d.qty,
        totalRevenue: d.rev,
        rowCount: d.count,
        buyingCost: "",
        shippingFee: "40",
        adSpend: "0",
        suggestedPrice: getSuggestedPrice(cleanName),
      };
    }).sort((a, b) => b.totalQty - a.totalQty);

    setPreviewProducts(summaries);
    setPreviewMeta({
      totalRows,
      filteredRows: relevantRows.length,
      noStatusFilter: !hasStatus,
    });
    setParseError(null);
    return { ok: true };
  }

  /* ── File parsing ── */
  async function processFile(file: File) {
    setIsLoading(true);
    setParseError(null);
    setHasParsed(false);
    setFileName(file.name);
    setPreviewProducts([]);

    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

      if (raw.length < 2) {
        setParseError("⚠️ Le fichier semble vide (moins de 2 lignes).");
        setIsLoading(false);
        return;
      }

      const headers = raw[0].map((h: any) => String(h ?? "").trim()).filter(Boolean);
      const dataRows = raw.slice(1);

      /* Auto-detect columns — header-based first */
      const detected: ColMap = {
        product: detectCol(headers, [
          "produit", "designation", "article", "libelle", "nom produit",
          "product", "name", "description", "ref",
        ]),
        qty: detectCol(headers, [
          "quantite", "quantity", "qte", "qty", "nbre", "nombre", "nbr colis",
        ]),
        cod: detectCol(headers, [
          "cod", "montant cod", "prix", "montant", "amount", "valeur",
          "revenue", "total", "tarif", "price",
        ]),
        status: detectCol(headers, [
          "statut", "status", "etat", "livraison", "situation",
        ]),
      };

      /*
       * Fallback for product column: if header-based detection failed,
       * scan the actual cell VALUES in the first 30 rows looking for a
       * column whose values contain "Designation" (e.g. a "Ref" column
       * in carrier exports like Cathedis/Digylog that stores
       * "Designation : Product Name" in each cell).
       */
      if (!detected.product) {
        detected.product = detectProductColFromData(headers, dataRows);
      }

      setRawHeaders(headers);
      setRawDataRows(dataRows);
      setColMap(detected);

      const result = buildProducts(dataRows, headers, detected);
      if (!result.ok) {
        setParseError(result.error ?? "Erreur inconnue.");
      } else {
        setHasParsed(true);
      }
    } catch (e: any) {
      setParseError(`⚠️ Impossible de lire ce fichier : ${e?.message || "format non supporté"}`);
    } finally {
      setIsLoading(false);
    }
  }

  /* ── Remap column + rebuild immediately ── */
  function remapCol(field: keyof ColMap, val: string) {
    const newMap: ColMap = { ...colMap, [field]: val === "__none__" ? "" : val };
    setColMap(newMap);
    if (rawDataRows.length > 0) {
      const result = buildProducts(rawDataRows, rawHeaders, newMap);
      if (result.ok) setHasParsed(true);
      else { setHasParsed(false); setParseError(result.error ?? null); }
    }
  }

  /* ── Advance to step 2 ── */
  function goToStep2() {
    setProducts(previewProducts.map(p => ({ ...p })));
    setStep(2);
  }

  /* ── Update cost field in step 2 ── */
  function updateProduct(idx: number, field: keyof ProductSummary, val: string) {
    setProducts(prev => {
      const next = [...prev];
      (next[idx] as any)[field] = val;
      return next;
    });
  }

  function toNum(v: string) { const x = parseFloat(v); return isNaN(x) ? 0 : x; }

  /* ── Calculate ── */
  function calculate() {
    const missing = products.filter(p => !p.buyingCost || p.buyingCost === "0");
    if (missing.length > 0) {
      toast({
        title: "Coûts manquants",
        description: `Prix d'achat requis pour : ${missing.map(m => m.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const totalRev = products.reduce((s, p) => s + p.totalRevenue, 0);
    const globalAd = adMode === "global" ? toNum(globalAdSpend) : 0;

    const res: ProfitResult[] = products.map(p => {
      const rev = p.totalRevenue;
      const qty = p.totalQty;
      const cogs = toNum(p.buyingCost) * qty;
      const ship = toNum(p.shippingFee) * qty;
      const adS = adMode === "specific"
        ? toNum(p.adSpend)
        : totalRev > 0 ? globalAd * (rev / totalRev) : globalAd / products.length;
      const totalCost = cogs + ship + adS;
      const net = rev - totalCost;
      const roi = cogs > 0 ? (net / cogs) * 100 : 0;
      return { name: p.name, qty, revenue: rev, cogs, shipping: ship, adSpend: adS, totalCost, netProfit: net, roi };
    });

    setResults(res);
    setStep(3);
  }

  /* ── Reset ── */
  function reset() {
    setStep(1); setHasParsed(false); setParseError(null); setFileName("");
    setRawHeaders([]); setRawDataRows([]); setColMap({ product: "", qty: "", cod: "", status: "" });
    setPreviewProducts([]); setProducts([]); setResults([]);
    setGlobalAdSpend("0"); setAdMode("global");
    if (fileRef.current) fileRef.current.value = "";
  }

  function fmtDH(v: number) {
    return `${v.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
  }

  /* ── Report aggregates ── */
  const totalRev  = results.reduce((s, r) => s + r.revenue, 0);
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const totalNet  = results.reduce((s, r) => s + r.netProfit, 0);
  const totalCOGS = results.reduce((s, r) => s + r.cogs, 0);
  const totalShip = results.reduce((s, r) => s + r.shipping, 0);
  const totalAd   = results.reduce((s, r) => s + r.adSpend, 0);
  const globalROI = totalCOGS > 0 ? (totalNet / totalCOGS) * 100 : 0;
  const barData   = results.map(r => ({
    name:   r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    Revenu: Math.round(r.revenue),
    Coûts:  Math.round(r.totalCost),
    Profit: Math.round(r.netProfit),
  }));
  const pieData = [
    { name: "Achat",      value: Math.round(totalCOGS), color: "#3b82f6" },
    { name: "Livraison",  value: Math.round(totalShip), color: "#f59e0b" },
    { name: "Publicité",  value: Math.round(totalAd),   color: "#8b5cf6" },
    { name: "Profit net", value: Math.max(0, Math.round(totalNet)), color: "#10b981" },
  ].filter(d => d.value > 0);

  /* ─────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #152645 55%, #1a3060 100%)` }}>

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 sticky top-0 z-10 backdrop-blur-md bg-black/20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40` }}>
              <BarChart3 className="w-4.5 h-4.5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight leading-none">Profit Analyzer Pro</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">Importez votre rapport transporteur · Profit net en 3 étapes</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StepBar current={step} />
            {(hasParsed || step > 1) && (
              <button onClick={reset} data-testid="button-reset-analyzer"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors ml-2">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* ═══════════════════════════════════════════
            STEP 1 — Upload + Preview
        ═══════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-5">

            {/* Drop zone */}
            <div
              data-testid="dropzone-file-upload"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => !isLoading && fileRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center py-12 gap-4 ${
                isDragging ? "border-amber-400 bg-amber-400/8" : "border-slate-600/70 hover:border-amber-500/50 bg-white/3"
              }`}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                     onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                     data-testid="input-file-upload" />

              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-slate-300 font-semibold">Analyse du fichier en cours…</p>
                  <p className="text-xs text-slate-500">Détection des colonnes et extraction des données</p>
                </div>
              ) : hasParsed ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  <p className="text-white font-bold">{fileName}</p>
                  <p className="text-slate-400 text-sm">
                    {previewMeta.filteredRows} ligne(s) livrée(s) · {previewProducts.length} produit(s) unique(s)
                    {previewMeta.noStatusFilter && <span className="text-amber-400"> (toutes lignes incluses)</span>}
                  </p>
                  <p className="text-amber-400/70 text-xs">Cliquez pour changer de fichier</p>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                       style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}25` }}>
                    <Upload className="w-7 h-7" style={{ color: GOLD }} />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">Glissez votre fichier ici</p>
                    <p className="text-slate-400 text-sm mt-1">ou cliquez pour sélectionner</p>
                    <p className="text-slate-500 text-xs mt-2">
                      Formats : <span className="text-amber-400 font-mono">XLSX · XLS · CSV</span>
                      <span className="mx-2 text-slate-700">·</span>
                      Rapports : Digylog, Cathedis, EcoTrack, Amana…
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Error */}
            {parseError && !isLoading && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-semibold text-sm">{parseError}</p>
                  <p className="text-red-400/70 text-xs mt-1">
                    Utilisez les menus ci-dessous pour mapper manuellement les colonnes.
                  </p>
                </div>
              </div>
            )}

            {/* Column mapping — visible once file is loaded (even on error) */}
            {rawHeaders.length > 0 && !isLoading && (
              <Card className="border-white/10 bg-white/5 text-white">
                <CardHeader className="pb-3 pt-4">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                             style={{ color: GOLD }}>
                    <Settings2 className="w-3.5 h-3.5" /> Mappage des colonnes
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    La détection est automatique. Corrigez si besoin.
                    Seules les lignes avec statut "Livré / Livrée / Delivered" sont comptées.
                  </p>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(["product", "qty", "cod", "status"] as const).map(field => {
                      const labels: Record<string, string> = {
                        product: "Produit *",
                        qty: "Quantité",
                        cod: "Montant COD",
                        status: "Statut (optionnel)",
                      };
                      return (
                        <div key={field} className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {labels[field]}
                          </label>
                          <Select
                            value={colMap[field] || "__none__"}
                            onValueChange={v => remapCol(field, v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white/10 border-white/15 text-white"
                                           data-testid={`select-col-${field}`}>
                              <SelectValue placeholder="(aucune)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">(aucune)</SelectItem>
                              {rawHeaders.map(h => (
                                <SelectItem key={h} value={h}>{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {colMap[field] ? (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> {colMap[field]}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">Non mappé</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Products preview */}
            {hasParsed && previewProducts.length > 0 && (
              <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                               style={{ color: GOLD }}>
                      <Package className="w-3.5 h-3.5" />
                      {previewProducts.length} produit(s) identifié(s)
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {previewMeta.noStatusFilter && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                          <Info className="w-3 h-3" /> Toutes lignes (pas de colonne statut)
                        </span>
                      )}
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/25 text-xs">
                        {previewMeta.filteredRows} / {previewMeta.totalRows} lignes
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-slate-500 text-xs font-semibold">Produit</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center">Qté totale</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right">Revenu COD</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewProducts.map((p, i) => (
                        <TableRow key={i} className="border-white/8 hover:bg-white/4"
                                  data-testid={`row-parsed-product-${i}`}>
                          <TableCell className="text-white font-medium text-sm py-2.5">{p.name}</TableCell>
                          <TableCell className="text-center py-2.5">
                            <Badge variant="outline"
                                   className="border-amber-500/35 text-amber-300 bg-amber-500/8 text-xs">
                              {p.totalQty}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-emerald-300 font-semibold text-sm py-2.5">
                            {p.totalRevenue > 0 ? fmtDH(p.totalRevenue) : <span className="text-slate-500 text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-center py-2.5">
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                              LIVRÉ
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* CTA */}
            {hasParsed && previewProducts.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={goToStep2}
                        className="gap-2 font-bold px-7"
                        style={{ background: GOLD, color: NAVY }}
                        data-testid="button-next-step-2">
                  Saisir les coûts <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Feature hints (shown when no file yet) */}
            {!hasParsed && !parseError && rawHeaders.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                {[
                  { icon: <Settings2 className="w-5 h-5" />, title: "Détection auto",
                    desc: "Colonnes Produit, Quantité et COD détectées automatiquement. Corrigez si besoin." },
                  { icon: <Package className="w-5 h-5" />, title: "Filtrage intelligent",
                    desc: "Seules les lignes \"Livré / Livrée / Delivered\" sont comptées." },
                  { icon: <BarChart3 className="w-5 h-5" />, title: "Rapport visuel",
                    desc: "Profit net, ROI et graphiques générés instantanément après vos coûts." },
                ].map((c, i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/4 p-4 flex gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                         style={{ background: `${GOLD}12`, color: GOLD }}>{c.icon}</div>
                    <div>
                      <p className="text-white font-semibold text-sm">{c.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 2 — Cost inputs
        ═══════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">

            {/* Ad spend mode */}
            <Card className="border-white/10 bg-white/5 text-white">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <Megaphone className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="text-sm font-bold">Mode dépenses pub :</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdMode("global")}
                      data-testid="button-ad-mode-global"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                        adMode === "global"
                          ? "border-amber-400 text-amber-400 bg-amber-400/10"
                          : "border-white/15 text-slate-400 hover:border-white/30"
                      }`}>
                      <Globe className="w-3.5 h-3.5" /> Global total
                    </button>
                    <button
                      onClick={() => setAdMode("specific")}
                      data-testid="button-ad-mode-specific"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                        adMode === "specific"
                          ? "border-amber-400 text-amber-400 bg-amber-400/10"
                          : "border-white/15 text-slate-400 hover:border-white/30"
                      }`}>
                      <Target className="w-3.5 h-3.5" /> Par produit
                    </button>
                  </div>
                  {adMode === "global" && (
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-xs text-slate-400 whitespace-nowrap">Total pub (DH) :</label>
                      <Input
                        type="number" min={0}
                        value={globalAdSpend}
                        onChange={e => setGlobalAdSpend(e.target.value)}
                        className="w-32 h-8 text-sm text-center bg-white/10 border-white/15 text-white"
                        placeholder="0"
                        data-testid="input-global-ad-spend"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Per-product table */}
            <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                           style={{ color: GOLD }}>
                  <Package className="w-3.5 h-3.5" /> Coûts par produit
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Prix d'achat obligatoire. Frais de livraison par défaut : 40 DH.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-slate-500 text-xs font-semibold min-w-[180px]">Produit</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center">Qté</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right">Revenu</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[150px]">
                          Prix d'achat (DH) <span className="text-red-400">*</span>
                        </TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[130px]">
                          Frais livr. (DH)
                        </TableHead>
                        {adMode === "specific" && (
                          <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[120px]">
                            Pub (DH)
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p, i) => (
                        <TableRow key={i} className="border-white/8 hover:bg-white/4"
                                  data-testid={`row-cost-product-${i}`}>
                          <TableCell className="py-3">
                            <p className="text-white font-semibold text-sm">{p.name}</p>
                            {p.suggestedPrice != null && (
                              <button
                                onClick={() => updateProduct(i, "buyingCost", String(p.suggestedPrice))}
                                className="text-[10px] text-amber-400/60 hover:text-amber-400 flex items-center gap-0.5 mt-0.5 transition-colors"
                                data-testid={`button-suggest-price-${i}`}>
                                <Sparkles className="w-2.5 h-2.5" /> Inventaire: {p.suggestedPrice} DH
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Badge variant="outline"
                                   className="border-amber-500/30 text-amber-300 bg-amber-500/8 text-xs">
                              {p.totalQty}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-emerald-300 font-semibold text-sm py-3">
                            {p.totalRevenue > 0 ? fmtDH(p.totalRevenue) : <span className="text-slate-500">—</span>}
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Input
                              type="number" min={0}
                              value={p.buyingCost}
                              onChange={e => updateProduct(i, "buyingCost", e.target.value)}
                              className="h-8 text-xs text-center bg-white/10 border-white/15 text-white max-w-[120px] mx-auto"
                              placeholder="Ex: 85"
                              data-testid={`input-buying-cost-${i}`}
                            />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Input
                              type="number" min={0}
                              value={p.shippingFee}
                              onChange={e => updateProduct(i, "shippingFee", e.target.value)}
                              className="h-8 text-xs text-center bg-white/10 border-white/15 text-white max-w-[100px] mx-auto"
                              placeholder="40"
                              data-testid={`input-shipping-fee-${i}`}
                            />
                          </TableCell>
                          {adMode === "specific" && (
                            <TableCell className="text-center py-3">
                              <Input
                                type="number" min={0}
                                value={p.adSpend}
                                onChange={e => updateProduct(i, "adSpend", e.target.value)}
                                className="h-8 text-xs text-center bg-white/10 border-white/15 text-white max-w-[100px] mx-auto"
                                placeholder="0"
                                data-testid={`input-ad-spend-${i}`}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}
                      className="border-white/20 text-slate-300 hover:bg-white/8 hover:text-white"
                      data-testid="button-back-step-1">
                ← Retour
              </Button>
              <Button onClick={calculate}
                      className="gap-2 font-bold px-8 text-sm"
                      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }}
                      data-testid="button-calculate">
                <BarChart3 className="w-4 h-4" /> Calculer le profit
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 3 — Report
        ═══════════════════════════════════════════ */}
        {step === 3 && results.length > 0 && (
          <div className="space-y-5">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Revenu total" value={fmtDH(totalRev)}
                sub={`${results.reduce((s, r) => s + r.qty, 0)} unités`}
                color="#10b981" icon={<DollarSign className="w-5 h-5" />} />
              <KpiCard label="Coûts totaux" value={fmtDH(totalCost)}
                sub="Achat + livraison + pub"
                color="#f59e0b" icon={<Truck className="w-5 h-5" />} />
              <KpiCard label="Bénéfice net" value={fmtDH(totalNet)}
                sub={totalNet >= 0 ? "✅ En bénéfice" : "🔴 En déficit"}
                color={totalNet >= 0 ? "#10b981" : "#ef4444"}
                icon={<TrendingUp className="w-5 h-5" />} />
              <KpiCard label="ROI Global" value={`${globalROI.toFixed(1)}%`}
                sub="vs coût d'achat"
                color={globalROI >= 30 ? "#10b981" : globalROI >= 0 ? "#f59e0b" : "#ef4444"}
                icon={<Target className="w-5 h-5" />} />
            </div>

            {/* Per-product table */}
            <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                           style={{ color: GOLD }}>
                  <Package className="w-3.5 h-3.5" /> Détail par produit
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        {["Produit","Qté","Revenu","Coût achat","Livraison","Pub","Profit net","ROI"].map(h => (
                          <TableHead key={h} className="text-slate-500 text-xs font-semibold">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r, i) => {
                        const pc = r.roi >= 50 ? "text-emerald-400" : r.roi >= 20 ? "text-amber-400" : "text-red-400";
                        const nc = r.netProfit >= 0 ? "text-emerald-400" : "text-red-400";
                        return (
                          <TableRow key={i} className="border-white/8 hover:bg-white/4"
                                    data-testid={`row-result-${i}`}>
                            <TableCell className="text-white font-semibold text-sm py-3">{r.name}</TableCell>
                            <TableCell className="text-center py-3">
                              <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/8 text-xs">{r.qty}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-emerald-300 font-semibold text-sm py-3">{fmtDH(r.revenue)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">{fmtDH(r.cogs)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">{fmtDH(r.shipping)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">{fmtDH(r.adSpend)}</TableCell>
                            <TableCell className={`text-right font-extrabold text-sm py-3 ${nc}`}>{fmtDH(r.netProfit)}</TableCell>
                            <TableCell className={`text-right font-bold text-sm py-3 ${pc}`}>{r.roi.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <Card className="border-white/10 bg-white/5 text-white col-span-1 lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                    Revenu · Coûts · Profit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                      <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        contentStyle={{ background: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11 }}
                        formatter={(val: number) => fmtDH(val)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                      <Bar dataKey="Revenu" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="Coûts"  fill="#f59e0b" radius={[3,3,0,0]} />
                      <Bar dataKey="Profit" fill={GOLD}    radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/5 text-white col-span-1 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                    Répartition des coûts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="43%" innerRadius={50} outerRadius={85}
                           dataKey="value" stroke="none">
                        {pieData.map((e, idx) => <Cell key={idx} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ background: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11 }}
                        formatter={(val: number) => fmtDH(val)}
                      />
                      <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Cost breakdown bars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: "Coût d'achat", val: totalCOGS, color: "#3b82f6" },
                { label: "Frais livraison", val: totalShip, color: "#f59e0b" },
                { label: "Dépenses pub",  val: totalAd,   color: "#8b5cf6" },
              ].map(item => {
                const pct = totalCost > 0 ? (item.val / totalCost) * 100 : 0;
                return (
                  <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-semibold">{item.label}</span>
                      <span className="text-xs font-bold" style={{ color: item.color }}>{pct.toFixed(1)}%</span>
                    </div>
                    <p className="text-lg font-extrabold text-white">{fmtDH(item.val)}</p>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all"
                           style={{ width: `${Math.min(pct, 100)}%`, background: item.color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}
                      className="border-white/20 text-slate-300 hover:bg-white/8 hover:text-white"
                      data-testid="button-back-step-2">
                ← Modifier les coûts
              </Button>
              <Button variant="outline" onClick={reset}
                      className="border-amber-500/35 text-amber-400 hover:bg-amber-500/10"
                      data-testid="button-new-analysis">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Nouvelle analyse
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

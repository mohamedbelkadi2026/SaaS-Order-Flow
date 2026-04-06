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

/**
 * Find the header that best matches any keyword.
 * Strategy: exact normalized match first, then substring match.
 * Skips empty-string headers (preserved for index alignment).
 */
function detectCol(headers: string[], keywords: string[]): string {
  // Pass 1 — exact match (accent-insensitive)
  for (const kw of keywords) {
    const nkw = norm(kw);
    const idx = headers.findIndex(h => h !== "" && norm(h) === nkw);
    if (idx !== -1) return headers[idx];
  }
  // Pass 2 — substring match
  for (const kw of keywords) {
    const nkw = norm(kw);
    const idx = headers.findIndex(h => h !== "" && norm(h).includes(nkw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

/**
 * Scan data rows to find a column whose VALUES contain "Designation :".
 * Handles Digylog/Cathedis/Onessta files where the "Ref" column stores
 * values like "Designation : Product Name".
 */
function detectProductColFromData(headers: string[], dataRows: any[][]): string {
  const sample = dataRows.slice(0, 40);
  let bestCol = "";
  let bestScore = 0;
  for (let ci = 0; ci < headers.length; ci++) {
    const hits = sample.filter(r => {
      const v = norm(String(r[ci] ?? ""));
      return v.includes("designat") || v.includes("designation :") || v.startsWith("ref :");
    }).length;
    if (hits > bestScore) { bestScore = hits; bestCol = headers[ci]; }
  }
  return bestScore >= 1 ? bestCol : "";
}

/**
 * Strip common carrier-export prefixes from product name values.
 * "Designation : Chaussures Homme" → "Chaussures Homme"
 * "Ref : 12345" → "12345"
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
  if (typeof val === "number") return val;
  const s = String(val)
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,(\d{1,2})$/, ".$1");
  return parseFloat(s) || 0;
}

/**
 * "Livrée" / "Livre" / "Livré" / "delivered" / "done" → true.
 * Accent-insensitive, handles all Digylog/Cathedis status spellings.
 */
function isDelivered(statusVal: string): boolean {
  const n = norm(statusVal);
  // "livre", "livree", "livré", "livrée" all normalize to "livre" or "livree"
  return n.includes("livre") || n.includes("deliver") || n === "done" || n === "complete";
}

/* ─── Types ─────────────────────────────────────────── */
interface ColMap {
  product: string;
  qty: string;
  cod: string;
  status: string;
  shipping: string; // "Shipping cost" column from file
}

interface ProductSummary {
  name: string;
  totalQty: number;
  totalRevenue: number;   // sum of Price column (CA Brut)
  totalShipping: number;  // sum of Shipping cost column (from file)
  rowCount: number;
  buyingCost: string;       // manual: prix d'achat / unité
  confirmationFee: string;  // manual: frais confirmation / unité
  adSpend: string;          // manual: pub (global or specific)
  suggestedPrice?: number;
}

interface ProfitResult {
  name: string;
  qty: number;
  caBrut: number;       // Price from file (total)
  shippingFromFile: number; // Shipping cost from file (total)
  caNet: number;        // caBrut - shippingFromFile
  cogs: number;         // buyingCost × qty
  confirmation: number; // confirmationFee × qty
  adSpend: number;
  totalCost: number;
  netProfit: number;
  roi: number;
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

  const [colMap, setColMap] = useState<ColMap>({ product: "", qty: "", cod: "", status: "", shipping: "" });
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
    const pIdx   = headers.indexOf(map.product);
    const qIdx   = headers.indexOf(map.qty);
    const cIdx   = headers.indexOf(map.cod);
    const sIdx   = headers.indexOf(map.status);
    const shIdx  = headers.indexOf(map.shipping); // Shipping cost column

    if (pIdx === -1) {
      return { ok: false, error: "⚠️ Impossible de détecter la colonne Produit. Sélectionnez-la manuellement." };
    }

    const hasStatus   = sIdx  !== -1;
    const hasQty      = qIdx  !== -1;
    const hasCod      = cIdx  !== -1;
    const hasShipping = shIdx !== -1;

    const totalRows = dataRows.filter(r => {
      const n = cleanProductName(String(r[pIdx] ?? "").trim());
      return n !== "";
    }).length;

    /* Filter by delivered status */
    const relevantRows = dataRows.filter(r => {
      const name = cleanProductName(String(r[pIdx] ?? "").trim());
      if (!name) return false;
      if (!hasStatus) return true;
      return isDelivered(String(r[sIdx] ?? ""));
    });

    if (totalRows > 0 && relevantRows.length === 0 && hasStatus) {
      return {
        ok: false,
        error: `⚠️ Aucune ligne avec statut "Livré/Livrée/Delivered" trouvée dans ${totalRows} lignes. Vérifiez la colonne Statut ou sélectionnez "(aucune)" pour tout inclure.`,
      };
    }

    /* Group by product — strip carrier-specific prefixes, sum revenue + shipping */
    const groupMap: Record<string, {
      qty: number; rev: number; ship: number; count: number; displayName: string;
    }> = {};

    for (const row of relevantRows) {
      const rawVal = String(row[pIdx] ?? "").trim();
      if (!rawVal) continue;
      const name = cleanProductName(rawVal);
      if (!name) continue;
      const key = norm(name);
      if (!groupMap[key]) groupMap[key] = { qty: 0, rev: 0, ship: 0, count: 0, displayName: name };
      groupMap[key].qty  += hasQty      ? (parseNum(row[qIdx])  || 1) : 1;
      groupMap[key].rev  += hasCod      ? parseNum(row[cIdx])         : 0;
      groupMap[key].ship += hasShipping ? parseNum(row[shIdx])        : 0;
      groupMap[key].count++;
    }

    if (Object.keys(groupMap).length === 0) {
      return { ok: false, error: "⚠️ Aucun produit valide trouvé. Vérifiez le format du fichier." };
    }

    const summaries: ProductSummary[] = Object.entries(groupMap).map(([, d]) => ({
      name: d.displayName,
      totalQty: d.qty,
      totalRevenue: d.rev,
      totalShipping: d.ship,
      rowCount: d.count,
      buyingCost: "",
      confirmationFee: "",
      adSpend: "0",
      suggestedPrice: getSuggestedPrice(d.displayName),
    })).sort((a, b) => b.totalQty - a.totalQty);

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

      /*
       * CRITICAL: Do NOT filter(Boolean) here.
       * Carrier files (Digylog, Onessta, Cathedis) often have blank column
       * headers between named ones (e.g. columns A-E named, F empty, G named…).
       * Filtering removes those gaps and shifts every subsequent column index,
       * causing all data reads to land on the wrong cell.
       * We preserve empty strings so `headers[i]` always matches `row[i]`.
       */
      const headers = raw[0].map((h: any) => String(h ?? "").trim());
      const dataRows = raw.slice(1);

      /*
       * Auto-detect columns.
       * detectCol() skips empty-string headers and tries exact match first,
       * then substring — so "Ref" ≡ keyword "ref", "Price" ≡ "price", etc.
       * Keyword order = priority (most specific / most common first).
       */
      const detected: ColMap = {
        // Product — Digylog/Onessta uses header "Ref" with values like "Designation : …"
        product: detectCol(headers, [
          "ref",           // ← exact match for Digylog/Onessta "Ref" column
          "designation", "produit", "article", "libelle", "nom produit",
          "product", "name", "description",
        ]),
        // Quantity — "Qté" (accent-stripped → "qte"), "Qty", "Quantity"
        qty: detectCol(headers, [
          "qte", "qty", "quantite", "quantity", "nbre", "nombre", "nbr colis",
        ]),
        // COD / Price — "Price" is the exact Digylog header
        cod: detectCol(headers, [
          "price",         // ← exact match for Digylog/Onessta "Price" column
          "cod", "montant cod", "prix", "montant", "amount", "valeur",
          "revenue", "total", "tarif",
        ]),
        // Status — "Status" is the exact Digylog header
        status: detectCol(headers, [
          "status",        // ← exact match for Digylog/Onessta "Status" column
          "statut", "etat", "livraison", "situation",
        ]),
        // Shipping cost — "Shipping cost" is the exact Digylog header (column L)
        shipping: detectCol(headers, [
          "shipping cost", // ← exact match for Digylog/Onessta "Shipping cost" column
          "frais livr", "frais exp", "cout livr",
          "shipping", "frais port", "frais transport", "delivery cost",
        ]),
      };

      /*
       * Fallback for product column: if header-based detection failed,
       * scan cell VALUES looking for "Designation :" pattern.
       * This catches the case where the "Ref" keyword is present in the header
       * but empty cells before it shifted our detection.
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

    const totalRevAll = products.reduce((s, p) => s + p.totalRevenue, 0);
    const globalAd    = adMode === "global" ? toNum(globalAdSpend) : 0;

    const res: ProfitResult[] = products.map(p => {
      const caBrut          = p.totalRevenue;
      const shippingFromFile = p.totalShipping;      // from file, already summed
      const caNet            = caBrut - shippingFromFile;
      const qty              = p.totalQty;
      const cogs             = toNum(p.buyingCost) * qty;
      const confirmation     = toNum(p.confirmationFee) * qty;
      const adS              = adMode === "specific"
        ? toNum(p.adSpend)
        : totalRevAll > 0
          ? globalAd * (caBrut / totalRevAll)
          : globalAd / products.length;

      // Net Profit = Price - ShippingFile - BuyingCost×Qty - ConfirmFee×Qty - AdSpend
      const totalCost = shippingFromFile + cogs + confirmation + adS;
      const netProfit = caBrut - totalCost;
      const roi       = cogs > 0 ? (netProfit / cogs) * 100 : 0;

      return {
        name: p.name, qty,
        caBrut, shippingFromFile, caNet,
        cogs, confirmation, adSpend: adS,
        totalCost, netProfit, roi,
      };
    });

    setResults(res);
    setStep(3);
  }

  /* ── Reset ── */
  function reset() {
    setStep(1); setHasParsed(false); setParseError(null); setFileName("");
    setRawHeaders([]); setRawDataRows([]);
    setColMap({ product: "", qty: "", cod: "", status: "", shipping: "" });
    setPreviewProducts([]); setProducts([]); setResults([]);
    setGlobalAdSpend("0"); setAdMode("global");
    if (fileRef.current) fileRef.current.value = "";
  }

  function fmtDH(v: number) {
    return `${v.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
  }

  /* ── Report aggregates ── */
  const totalCaBrut   = results.reduce((s, r) => s + r.caBrut, 0);
  const totalShipFile = results.reduce((s, r) => s + r.shippingFromFile, 0);
  const totalCaNet    = results.reduce((s, r) => s + r.caNet, 0);
  const totalCost     = results.reduce((s, r) => s + r.totalCost, 0);
  const totalNet      = results.reduce((s, r) => s + r.netProfit, 0);
  const totalCOGS     = results.reduce((s, r) => s + r.cogs, 0);
  const totalConfirm  = results.reduce((s, r) => s + r.confirmation, 0);
  const totalAd       = results.reduce((s, r) => s + r.adSpend, 0);
  const globalROI     = totalCOGS > 0 ? (totalNet / totalCOGS) * 100 : 0;
  const barData = results.map(r => ({
    name:   r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    "CA Brut": Math.round(r.caBrut),
    "CA Net":  Math.round(r.caNet),
    "Profit":  Math.round(r.netProfit),
  }));
  const pieData = [
    { name: "Sourcing",     value: Math.round(totalCOGS),    color: "#3b82f6" },
    { name: "Livraison",    value: Math.round(totalShipFile), color: "#f59e0b" },
    { name: "Confirmation", value: Math.round(totalConfirm),  color: "#06b6d4" },
    { name: "Publicité",    value: Math.round(totalAd),       color: "#8b5cf6" },
    { name: "Profit net",   value: Math.max(0, Math.round(totalNet)), color: "#10b981" },
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {(["product", "qty", "cod", "status", "shipping"] as const).map(field => {
                      const labels: Record<string, string> = {
                        product: "Produit *",
                        qty: "Quantité",
                        cod: "Prix / COD",
                        status: "Statut (optionnel)",
                        shipping: "Frais livr. (fichier)",
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
                              {rawHeaders.filter(h => h !== "").map(h => (
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
                        <TableHead className="text-slate-500 text-xs font-semibold text-center">Qté</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right">CA Brut</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right">Frais Livr.</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right">CA Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewProducts.map((p, i) => {
                        const caNet = p.totalRevenue - p.totalShipping;
                        return (
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
                            <TableCell className="text-right text-amber-300 text-sm py-2.5">
                              {p.totalShipping > 0 ? <span className="text-red-400">−{fmtDH(p.totalShipping)}</span> : <span className="text-slate-500 text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm py-2.5">
                              <span className={caNet >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtDH(caNet)}</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                               style={{ color: GOLD }}>
                      <Package className="w-3.5 h-3.5" /> Coûts à saisir par produit
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Frais de livraison extraits automatiquement du fichier.
                      Entrez vos coûts <strong className="text-slate-300">par unité</strong> — le total est calculé live.
                    </p>
                  </div>
                  {/* Summary badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="rounded-lg px-3 py-1.5 text-center" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total unités</p>
                      <p className="text-base font-extrabold" style={{ color: GOLD }}>
                        {products.reduce((s, p) => s + p.totalQty, 0)}
                      </p>
                    </div>
                    <div className="rounded-lg px-3 py-1.5 text-center bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">CA Net total</p>
                      <p className="text-base font-extrabold text-emerald-300">
                        {fmtDH(products.reduce((s, p) => s + (p.totalRevenue - p.totalShipping), 0))}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-slate-500 text-xs font-semibold min-w-[180px]">Produit</TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center whitespace-nowrap">
                          Total<br/>Unités
                        </TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right whitespace-nowrap">
                          CA Net<br/><span className="text-[9px] text-slate-600 font-normal normal-case">(du fichier)</span>
                        </TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-right text-amber-400/70 whitespace-nowrap">
                          Livraison<br/><span className="text-[9px] text-slate-600 font-normal normal-case">(du fichier)</span>
                        </TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[155px] whitespace-nowrap">
                          Prix achat / unité <span className="text-red-400">*</span><br/>
                          <span className="text-[9px] text-slate-600 font-normal normal-case">→ total = prix × unités</span>
                        </TableHead>
                        <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[155px] whitespace-nowrap">
                          Confirmation / unité<br/>
                          <span className="text-[9px] text-slate-600 font-normal normal-case">→ total = confirm. × unités</span>
                        </TableHead>
                        {adMode === "specific" && (
                          <TableHead className="text-slate-500 text-xs font-semibold text-center min-w-[110px]">
                            Pub (total DH)
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p, i) => {
                        const caNet        = p.totalRevenue - p.totalShipping;
                        const buyNum       = parseFloat(p.buyingCost) || 0;
                        const confirmNum   = parseFloat(p.confirmationFee) || 0;
                        const totalBuy     = buyNum * p.totalQty;
                        const totalConfirm = confirmNum * p.totalQty;
                        return (
                          <TableRow key={i} className="border-white/8 hover:bg-white/4"
                                    data-testid={`row-cost-product-${i}`}>
                            {/* Product name */}
                            <TableCell className="py-3">
                              <p className="text-white font-semibold text-sm leading-tight">{p.name}</p>
                              {p.suggestedPrice != null && (
                                <button
                                  onClick={() => updateProduct(i, "buyingCost", String(p.suggestedPrice))}
                                  className="text-[10px] text-amber-400/60 hover:text-amber-400 flex items-center gap-0.5 mt-0.5 transition-colors"
                                  data-testid={`button-suggest-price-${i}`}>
                                  <Sparkles className="w-2.5 h-2.5" /> Inventaire: {p.suggestedPrice} DH
                                </button>
                              )}
                            </TableCell>
                            {/* Total units — prominent badge */}
                            <TableCell className="text-center py-3">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-lg font-extrabold" style={{ color: GOLD }}>{p.totalQty}</span>
                                <span className="text-[9px] text-slate-500">unités</span>
                              </div>
                            </TableCell>
                            {/* CA Net */}
                            <TableCell className="text-right py-3">
                              <span className={caNet >= 0 ? "text-emerald-300 font-semibold text-sm" : "text-red-400 font-semibold text-sm"}>
                                {fmtDH(caNet)}
                              </span>
                            </TableCell>
                            {/* Shipping from file */}
                            <TableCell className="text-right py-3">
                              {p.totalShipping > 0
                                ? <span className="text-amber-400 text-sm">{fmtDH(p.totalShipping)}</span>
                                : <span className="text-slate-600 text-xs">—</span>}
                            </TableCell>
                            {/* Buying cost input + live total */}
                            <TableCell className="text-center py-3">
                              <Input
                                type="number" min={0}
                                value={p.buyingCost}
                                onChange={e => updateProduct(i, "buyingCost", e.target.value)}
                                className="h-8 text-xs text-center bg-white/10 border-white/15 text-white max-w-[110px] mx-auto"
                                placeholder="Ex: 80"
                                data-testid={`input-buying-cost-${i}`}
                              />
                              {buyNum > 0 && (
                                <p className="text-[10px] text-blue-400 mt-1 text-center">
                                  = <strong>{fmtDH(totalBuy)}</strong> total
                                </p>
                              )}
                            </TableCell>
                            {/* Confirmation fee input + live total */}
                            <TableCell className="text-center py-3">
                              <Input
                                type="number" min={0}
                                value={p.confirmationFee}
                                onChange={e => updateProduct(i, "confirmationFee", e.target.value)}
                                className="h-8 text-xs text-center bg-white/10 border-white/15 text-white max-w-[110px] mx-auto"
                                placeholder="Ex: 10"
                                data-testid={`input-confirmation-fee-${i}`}
                              />
                              {confirmNum > 0 && (
                                <p className="text-[10px] text-cyan-400 mt-1 text-center">
                                  = <strong>{fmtDH(totalConfirm)}</strong> total
                                </p>
                              )}
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
                        );
                      })}
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

            {/* ── Total Units Sold banner ── */}
            {(() => {
              const totalUnits    = results.reduce((s, r) => s + r.qty, 0);
              const uniqueProds   = results.length;
              return (
                <div className="rounded-xl border flex flex-col sm:flex-row items-center gap-4 sm:gap-8 px-6 py-4"
                     style={{ background: `linear-gradient(135deg, ${GOLD}12 0%, rgba(255,255,255,0.03) 100%)`, borderColor: `${GOLD}35` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${GOLD}20` }}>
                      <Package className="w-5 h-5" style={{ color: GOLD }} />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Total unités vendues (Livrée)</p>
                      <p className="text-3xl font-extrabold leading-none" style={{ color: GOLD }}>{totalUnits.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="hidden sm:block w-px h-10 bg-white/10" />
                  <div className="flex items-center gap-6 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">Produits uniques</p>
                      <p className="text-xl font-bold text-white">{uniqueProds}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">Moy. unités / produit</p>
                      <p className="text-xl font-bold text-white">{uniqueProds > 0 ? (totalUnits / uniqueProds).toFixed(1) : "—"}</p>
                    </div>
                  </div>
                  <div className="sm:ml-auto text-center sm:text-right">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Formule appliquée</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 font-mono">
                      Bénéf. = CA Brut − Livr. − (Achat × Qté) − (Confirm. × Qté) − Pub
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label="CA Brut (Price)" value={fmtDH(totalCaBrut)}
                sub={`${results.reduce((s, r) => s + r.qty, 0)} unités livrées`}
                color="#10b981" icon={<DollarSign className="w-5 h-5" />} />
              <KpiCard label="Frais livr. (fichier)" value={fmtDH(totalShipFile)}
                sub="Déduit automatiquement"
                color="#f59e0b" icon={<Truck className="w-5 h-5" />} />
              <KpiCard label="CA Net" value={fmtDH(totalCaNet)}
                sub="Prix − Frais livr."
                color="#06b6d4" icon={<TrendingUp className="w-5 h-5" />} />
              <KpiCard label="Bénéfice net" value={fmtDH(totalNet)}
                sub={totalNet >= 0 ? "En bénéfice" : "En déficit"}
                color={totalNet >= 0 ? "#10b981" : "#ef4444"}
                icon={<Target className="w-5 h-5" />} />
              <KpiCard label="ROI Global" value={`${globalROI.toFixed(1)}%`}
                sub="vs coût sourcing"
                color={globalROI >= 30 ? "#10b981" : globalROI >= 0 ? "#f59e0b" : "#ef4444"}
                icon={<BarChart3 className="w-5 h-5" />} />
            </div>

            {/* ── Per-product detail table ── */}
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
                        {[
                          { label: "Produit",                            sub: "",                      cls: "" },
                          { label: "Total Unités",                       sub: "",                      cls: "text-center" },
                          { label: "CA Brut",                            sub: "price total",           cls: "text-right text-emerald-400/80" },
                          { label: "Frais Livr.",                        sub: "du fichier",            cls: "text-right text-amber-400/70" },
                          { label: "CA Net",                             sub: "brut − livr.",          cls: "text-right text-cyan-400/80" },
                          { label: "Sourcing Total",                     sub: "achat × unités",        cls: "text-right" },
                          { label: "Commissions",                        sub: "confirm. × unités",     cls: "text-right" },
                          { label: "Pub",                                sub: "",                      cls: "text-right" },
                          { label: "Bénéfice Net",                       sub: "",                      cls: "text-right" },
                          { label: "ROI",                                sub: "",                      cls: "text-right" },
                        ].map(({ label, sub, cls }) => (
                          <TableHead key={label} className={`text-slate-500 text-xs font-semibold whitespace-nowrap ${cls}`}>
                            {label}
                            {sub && <><br/><span className="text-[9px] text-slate-600 font-normal normal-case">{sub}</span></>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r, i) => {
                        const roiCls  = r.roi >= 50 ? "text-emerald-400" : r.roi >= 20 ? "text-amber-400" : "text-red-400";
                        const profCls = r.netProfit >= 0 ? "text-emerald-400 font-extrabold" : "text-red-400 font-extrabold";
                        return (
                          <TableRow key={i} className="border-white/8 hover:bg-white/4" data-testid={`row-result-${i}`}>
                            <TableCell className="text-white font-semibold text-sm py-3 max-w-[180px]">{r.name}</TableCell>
                            <TableCell className="text-center py-3">
                              <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/8 text-xs">{r.qty}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-emerald-300 font-semibold text-sm py-3">{fmtDH(r.caBrut)}</TableCell>
                            <TableCell className="text-right text-red-400 text-sm py-3">−{fmtDH(r.shippingFromFile)}</TableCell>
                            <TableCell className="text-right text-cyan-300 font-semibold text-sm py-3">{fmtDH(r.caNet)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtDH(r.cogs)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtDH(r.confirmation)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtDH(r.adSpend)}</TableCell>
                            <TableCell className={`text-right text-sm py-3 ${profCls}`}>{fmtDH(r.netProfit)}</TableCell>
                            <TableCell className={`text-right font-bold text-sm py-3 ${roiCls}`}>{r.roi.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      <TableRow className="border-t-2 border-white/20 bg-white/5">
                        <TableCell className="text-white font-extrabold text-sm py-3" colSpan={2}>TOTAL</TableCell>
                        <TableCell className="text-right text-emerald-300 font-bold text-sm py-3">{fmtDH(totalCaBrut)}</TableCell>
                        <TableCell className="text-right text-red-400 font-bold text-sm py-3">−{fmtDH(totalShipFile)}</TableCell>
                        <TableCell className="text-right text-cyan-300 font-bold text-sm py-3">{fmtDH(totalCaNet)}</TableCell>
                        <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtDH(totalCOGS)}</TableCell>
                        <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtDH(totalConfirm)}</TableCell>
                        <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtDH(totalAd)}</TableCell>
                        <TableCell className={`text-right font-extrabold text-sm py-3 ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtDH(totalNet)}</TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">{globalROI.toFixed(1)}%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <Card className="border-white/10 bg-white/5 text-white col-span-1 lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                    CA Brut · CA Net · Bénéfice par produit
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
                      <Bar dataKey="CA Brut" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="CA Net"  fill="#06b6d4" radius={[3,3,0,0]} />
                      <Bar dataKey="Profit"  fill={GOLD}    radius={[3,3,0,0]} />
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
                      <Pie data={pieData} cx="50%" cy="43%" innerRadius={50} outerRadius={80}
                           dataKey="value" stroke="none">
                        {pieData.map((e, idx) => <Cell key={idx} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ background: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11 }}
                        formatter={(val: number) => fmtDH(val)}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Cost breakdown bars ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Sourcing",          val: totalCOGS,    color: "#3b82f6" },
                { label: "Livraison (fichier)",val: totalShipFile, color: "#f59e0b" },
                { label: "Confirmation",       val: totalConfirm,  color: "#06b6d4" },
                { label: "Publicité",          val: totalAd,       color: "#8b5cf6" },
              ].map(item => {
                const pct = totalCost > 0 ? (item.val / totalCost) * 100 : 0;
                return (
                  <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-semibold leading-tight">{item.label}</span>
                      <span className="text-xs font-bold shrink-0 ml-1" style={{ color: item.color }}>{pct.toFixed(1)}%</span>
                    </div>
                    <p className="text-base font-extrabold text-white">{fmtDH(item.val)}</p>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: item.color }} />
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

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Upload, CheckCircle2, RotateCcw, TrendingUp, Package, Truck,
  Megaphone, DollarSign, Target, Sparkles, ArrowRight, BarChart3,
  Globe, Settings2, AlertTriangle, Info, RefreshCw,
  Crown, Save, FolderOpen, Trash2, Zap, CalendarDays, X, FileText, Layers,
  ChevronDown, ChevronRight, DollarSign as DollarSignIcon, BadgeDollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";
const NAVY_MID = "#1A2F4E";

/* ─── Helpers ───────────────────────────────────────── */
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function detectCol(headers: string[], keywords: string[]): string {
  for (const kw of keywords) {
    const nkw = norm(kw);
    const idx = headers.findIndex(h => h !== "" && norm(h) === nkw);
    if (idx !== -1) return headers[idx];
  }
  for (const kw of keywords) {
    const nkw = norm(kw);
    const idx = headers.findIndex(h => h !== "" && norm(h).includes(nkw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

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

function cleanProductName(raw: string): string {
  return raw
    .replace(/^designation\s*:\s*/i, "")
    .replace(/^ref\s*:\s*/i, "")
    .trim();
}

function parseRefCell(val: any): { designation: string; qtyPerRow: number } {
  const text = String(val ?? "").trim();
  const designationMatch = text.match(/Designation\s*:\s*([^\n\r]+)/i);
  const quantityMatch    = text.match(/Quantity\s*:\s*(\d+)/i);
  const designation = designationMatch
    ? designationMatch[1].trim()
    : cleanProductName(text.split(/[\n\r]/)[0]);
  const qtyPerRow = quantityMatch ? Math.max(1, parseInt(quantityMatch[1], 10)) : 0;
  return { designation, qtyPerRow };
}

function parseNum(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val)
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,(\d{1,2})$/, ".$1");
  return parseFloat(s) || 0;
}

function isDelivered(statusVal: string): boolean {
  const n = norm(statusVal);
  return n.includes("livre") || n.includes("deliver") || n === "done" || n === "complete";
}

function computeRowId(row: any[], headers: string[]): string {
  const idKeywords = ["tracking", "n° commande", "numero commande", "reference", "bon de commande",
    "order id", "code colis", "suivi", "barcode", "code suivi", "colis id", "id commande"];
  const idCol = detectCol(headers, idKeywords);
  if (idCol) {
    const idx = headers.indexOf(idCol);
    const val = String(row[idx] ?? "").trim();
    if (val && val.length > 2) return `id:${val}`;
  }
  return `row:${row.map(v => String(v ?? "").trim()).join("|")}`;
}

/* ─── Ad Spend Helpers ────────────────────────────────── */

/** Parse a spend number from various formats: "1 234,56", "1,234.56", "$123.45" */
function parseSpendNum(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const s = String(val).trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  // European: 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // US: 1,234.56
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, "")) || 0;
  }
  // Fallback: treat comma as decimal separator
  return parseFloat(s.replace(",", ".")) || 0;
}

/** Detect campaign and spend columns in Facebook Ads / ad-platform export headers. */
function detectAdCols(headers: string[]): {
  campaign: string; spend: string; isMad: boolean; ambiguous: boolean;
} {
  const campKws = ["campaign name", "nom de la campagne", "campagne", "campaign"];
  const spendKws = ["amount spent", "amount spent (usd)", "montant depense", "spend", "depenses", "cost"];
  const madKws   = ["mad", " dh", "dirham", "marocain"];

  let campaign = detectCol(headers, campKws);
  let spend    = detectCol(headers, spendKws);

  // Fallback: any header containing "usd"
  if (!spend) {
    spend = headers.find(h => h !== "" && norm(h).includes("usd")) ?? "";
  }
  // Fallback: any header containing "spend" or "amount"
  if (!spend) {
    spend = headers.find(h => h !== "" && (norm(h).includes("spend") || norm(h).includes("amount"))) ?? "";
  }

  const isMad = !!(spend && madKws.some(kw => norm(spend).includes(norm(kw))));
  const ambiguous = !campaign || !spend;
  return { campaign, spend, isMad, ambiguous };
}

/** Fuzzy match: does any significant part of productName appear in campaignName? */
function campaignMatchesProduct(campaignName: string, productName: string): boolean {
  const nc = norm(campaignName);
  const np = norm(productName);
  if (nc.includes(np) && np.length >= 4) return true;
  // Token-based: check significant words (>=5 chars)
  const tokens = np.split(/\s+/).filter(t => t.length >= 5);
  return tokens.some(t => nc.includes(t));
}

/* ─── Types ─────────────────────────────────────────── */
interface ColMap {
  product: string; qty: string; cod: string; status: string; shipping: string;
}

interface NormalizedRow {
  designation: string; qty: number; cod: number; shipping: number; rowId: string;
}

interface ParsedEntry {
  id: string; fileName: string; sheetName: string;
  totalRows: number; deliveredRows: number;
  headers: string[]; rawDataRows: any[][]; colMap: ColMap; rows: NormalizedRow[];
  error?: string;
}

interface ProductSummary {
  name: string; totalQty: number; totalRevenue: number; totalShipping: number;
  rowCount: number; buyingCost: string; packagingCost: string;
  confirmationFee: string; adSpend: string; suggestedPrice?: number;
}

interface ProfitResult {
  name: string; qty: number; commandes: number; caBrut: number;
  shippingFromFile: number; caNet: number; cogs: number; packaging: number;
  confirmation: number; adSpend: number; totalCost: number; netProfit: number; roi: number;
}

/** One aggregated campaign from the ad-spend import */
interface AdCampaignData {
  name: string;
  totalSpendRaw: number;  // in USD (or MAD if isMad file)
}

/** Per-campaign mapping configuration */
interface CampaignMapping {
  campaignName: string;
  ignored: boolean;
  selectedProducts: string[];
  splitMode: 'prorata' | 'equal' | 'manual';
  manualPcts: Record<string, number>;  // productName → %
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

function fmtMAD(v: number) {
  return `${v.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}
function fmtUSD(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Main page ──────────────────────────────────────── */
export default function ProfitAnalyzer() {
  const { toast } = useToast();
  const fileRef    = useRef<HTMLInputElement>(null);
  const adFileRef  = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /* ── Subscription ── */
  const { data: subscription } = useQuery<any>({
    queryKey: ['/api/subscription'], staleTime: 60_000,
  });
  const hasImportCsv: boolean = subscription?.hasImportCsv ?? true;
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState<'live' | 'csv'>('live');

  /* ── Live tab ── */
  const [liveDateRange,  setLiveDateRange]  = useState('month');
  const [liveDateFrom,   setLiveDateFrom]   = useState('');
  const [liveDateTo,     setLiveDateTo]     = useState('');
  const [liveShowCustom, setLiveShowCustom] = useState(false);
  const [platformView,   setPlatformView]   = useState(false);

  const buildLiveParams = () => {
    const p = new URLSearchParams();
    if (liveShowCustom && liveDateFrom) {
      p.set('dateFrom', liveDateFrom);
      p.set('dateTo', liveDateTo || new Date().toISOString().slice(0, 10));
    } else {
      // Always send explicit dateFrom/dateTo so both the dashboard and the
      // profit backend use identical date boundaries — same local-calendar
      // constructor, same end-of-day 23:59:59. Only 'all' keeps dateRange=all.
      //
      // Use local-calendar date strings (NOT toISOString which is UTC-based
      // and would send the previous day for UTC+ timezones after midnight).
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const today = new Date();
      const todayStr = toStr(today);
      if (liveDateRange === 'today') {
        p.set('dateFrom', todayStr);
        p.set('dateTo',   todayStr);
      } else if (liveDateRange === '7days') {
        const from = new Date(today); from.setDate(from.getDate() - 6);
        p.set('dateFrom', toStr(from));
        p.set('dateTo',   todayStr);
      } else if (liveDateRange === 'month') {
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        p.set('dateFrom', toStr(from));
        p.set('dateTo',   todayStr);
      } else if (liveDateRange === 'lastmonth') {
        const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const to   = new Date(today.getFullYear(), today.getMonth(), 0);
        p.set('dateFrom', toStr(from));
        p.set('dateTo',   toStr(to));
      } else {
        // 'all' — keep as dateRange so the backend returns all-time data
        p.set('dateRange', 'all');
      }
    }
    return p.toString();
  };

  const liveDateRangeLabel = useMemo(() => {
    const d = new Date();
    const fmt = (dt: Date) => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    if (liveShowCustom && liveDateFrom) return `${liveDateFrom} → ${liveDateTo || "aujourd'hui"}`;
    if (liveDateRange === 'today')     return `Aujourd'hui — ${fmt(d)}`;
    if (liveDateRange === '7days') { const f = new Date(d); f.setDate(f.getDate()-6); return `7 jours — ${fmt(f)} → ${fmt(d)}`; }
    if (liveDateRange === 'month')     { const f = new Date(d.getFullYear(), d.getMonth(), 1); return `Ce mois — ${fmt(f)} → ${fmt(d)}`; }
    if (liveDateRange === 'lastmonth') { const f = new Date(d.getFullYear(), d.getMonth()-1, 1); const t = new Date(d.getFullYear(), d.getMonth(), 0); return `Mois dernier — ${fmt(f)} → ${fmt(t)}`; }
    return 'Toutes les périodes';
  }, [liveDateRange, liveDateFrom, liveDateTo, liveShowCustom]);

  const { data: liveData, isLoading: liveLoading, refetch: liveRefetch } = useQuery<{ products: any[]; platforms: any[]; globalAdSpend?: number }>({
    queryKey: ['/api/products/profitability', liveDateRange, liveDateFrom, liveDateTo, liveShowCustom],
    queryFn: async () => {
      const r = await fetch(`/api/products/profitability?${buildLiveParams()}`, { credentials: 'include' });
      return r.json();
    },
    enabled: activeTab === 'live',
  });

  const liveProducts  = liveData?.products  ?? [];
  const livePlatforms = liveData?.platforms ?? [];
  const liveTotalOrders    = (liveData as any)?.totals?.totalOrders     ?? liveProducts.reduce((s: number, p: any) => s + p.totalOrders, 0);
  const liveTotalDelivered = (liveData as any)?.totals?.deliveredOrders ?? liveProducts.reduce((s: number, p: any) => s + p.deliveredOrders, 0);
  const liveTotalRevenue   = liveProducts.reduce((s: number, p: any) => s + p.revenue, 0);
  const liveTotalProfit    = liveProducts.reduce((s: number, p: any) => s + p.netProfit, 0) - (liveData?.globalAdSpend ?? 0);
  const liveDeliveryRate   = liveTotalOrders > 0 ? ((liveTotalDelivered / liveTotalOrders) * 100).toFixed(1) : "0";

  /* ── CSV Step state ── */
  const [step, setStep]             = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [parseProgress, setParseProgress] = useState<string | null>(null);
  const [parseError, setParseError]       = useState<string | null>(null);
  const [fileErrors, setFileErrors]       = useState<{ label: string; error: string }[]>([]);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [dupCount, setDupCount]           = useState(0);

  const singleEntry = parsedEntries.length === 1 && !parsedEntries[0].error ? parsedEntries[0] : null;
  const rawHeaders  = singleEntry?.headers ?? [];
  const colMap: ColMap = singleEntry?.colMap ?? { product: "", qty: "", cod: "", status: "", shipping: "" };

  const [previewProducts, setPreviewProducts]   = useState<ProductSummary[]>([]);
  const [previewMeta, setPreviewMeta]           = useState({ totalRows: 0, filteredRows: 0, noStatusFilter: false });
  const [hasParsed, setHasParsed]               = useState(false);
  const [products, setProducts]                 = useState<ProductSummary[]>([]);
  const [adMode, setAdMode]                     = useState<"global" | "specific">("global");
  const [globalAdSpend, setGlobalAdSpend]       = useState("0");
  const [results, setResults]                   = useState<ProfitResult[]>([]);

  /* ── Ad Import state (persists across steps) ── */
  const [adImportOpen, setAdImportOpen]         = useState(false);
  const [adImportLoading, setAdImportLoading]   = useState(false);
  const [adImportProgress, setAdImportProgress] = useState<string | null>(null);
  const [adImportFileErrors, setAdImportFileErrors] = useState<{ label: string; error: string }[]>([]);
  const [adRawHeaders, setAdRawHeaders]         = useState<string[]>([]);
  const [adRawRows, setAdRawRows]               = useState<any[][]>([]);
  const [adColMap, setAdColMap]                 = useState<{ campaign: string; spend: string }>({ campaign: '', spend: '' });
  const [adAmbiguous, setAdAmbiguous]           = useState(false);
  const [adIsMad, setAdIsMad]                   = useState(false);
  const [adCampaigns, setAdCampaigns]           = useState<AdCampaignData[]>([]);
  const [usdRate, setUsdRate]                   = useState('');
  const [campaignMappings, setCampaignMappings] = useState<CampaignMapping[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [adApplyConfirmPending, setAdApplyConfirmPending] = useState(false);
  const [adIsDragging, setAdIsDragging]         = useState(false);

  /* ── Saved reports ── */
  const [currentReportId, setCurrentReportId] = useState<number | null>(null);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportTitle, setReportTitle] = useState("");
  const [savingReport, setSavingReport] = useState(false);

  const { data: savedReports = [] } = useQuery<any[]>({
    queryKey: ['/api/profit-reports'], enabled: hasImportCsv, staleTime: 30_000,
  });
  const deleteReportMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/profit-reports/${id}`, { method: 'DELETE', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/profit-reports'] }); toast({ title: 'Rapport supprimé' }); },
    onError: () => toast({ title: 'Erreur', variant: 'destructive' }),
  });

  /* ── Product selector ── */
  const [selectedProductKeys, setSelectedProductKeys] = useState<Set<string>>(new Set());
  const [productSearchQuery, setProductSearchQuery]   = useState("");

  /* ── Stock auto-fill ── */
  const [stockAutoFilled, setStockAutoFilled]   = useState<Record<string, boolean>>({});
  const [stockProducts, setStockProducts]       = useState<any[]>([]);
  const [resetStockConfirm, setResetStockConfirm] = useState(false);

  useEffect(() => {
    if (previewProducts.length > 0 && selectedProductKeys.size === 0) {
      setSelectedProductKeys(new Set(previewProducts.map(p => p.name)));
    }
  }, [previewProducts]);

  const filteredPreviewProducts = useMemo(() => {
    const q = productSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!q) return previewProducts;
    return previewProducts.filter(p =>
      p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [previewProducts, productSearchQuery]);

  const totalSelectedLines = useMemo(() =>
    previewProducts.reduce((sum, p) => selectedProductKeys.has(p.name) ? sum + p.rowCount : sum, 0),
    [previewProducts, selectedProductKeys]);

  const handleToggleAll = () => {
    if (selectedProductKeys.size === previewProducts.length) setSelectedProductKeys(new Set());
    else setSelectedProductKeys(new Set(previewProducts.map(p => p.name)));
  };
  const handleToggleProduct = (key: string) => {
    setSelectedProductKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const { data: inventoryStats } = useQuery<any>({ queryKey: ["/api/inventory/stats"], retry: false });
  function getSuggestedPrice(n: string): number | undefined {
    const stats: any[] = inventoryStats?.productStats ?? [];
    const found = stats.find(p => norm(p.name) === norm(n));
    return found ? found.sellingPrice / 100 : undefined;
  }

  /* ────────────────────────────────────────────────────────────
     CARRIER FILE PARSING (multi-file / multi-sheet)
  ──────────────────────────────────────────────────────────── */
  function normalizeRow(row: any[], headers: string[], cm: ColMap): NormalizedRow | null {
    const pIdx = cm.product ? headers.indexOf(cm.product) : -1;
    if (pIdx === -1) return null;
    const { designation, qtyPerRow: embeddedQty } = parseRefCell(row[pIdx]);
    if (!designation) return null;
    const sIdx = cm.status   ? headers.indexOf(cm.status)   : -1;
    const qIdx = cm.qty      ? headers.indexOf(cm.qty)      : -1;
    const cIdx = cm.cod      ? headers.indexOf(cm.cod)      : -1;
    const shIdx= cm.shipping ? headers.indexOf(cm.shipping) : -1;
    if (sIdx !== -1 && !isDelivered(String(row[sIdx] ?? ""))) return null;
    const hasQtyCol = qIdx !== -1 && qIdx !== pIdx;
    let qty = 1;
    if (hasQtyCol) { const p = parseNum(row[qIdx]); if (p > 0 && p <= 10000) qty = p; else if (embeddedQty > 0) qty = embeddedQty; }
    else if (embeddedQty > 0) qty = embeddedQty;
    return { designation, qty, cod: cIdx !== -1 ? parseNum(row[cIdx]) : 0, shipping: shIdx !== -1 ? parseNum(row[shIdx]) : 0, rowId: computeRowId(row, headers) };
  }

  function buildProductsFromRows(rows: NormalizedRow[]): ProductSummary[] {
    const groupMap: Record<string, { qty: number; rev: number; ship: number; count: number; displayName: string }> = {};
    for (const r of rows) {
      const key = norm(r.designation);
      if (!groupMap[key]) groupMap[key] = { qty: 0, rev: 0, ship: 0, count: 0, displayName: r.designation };
      groupMap[key].qty += r.qty; groupMap[key].rev += r.cod; groupMap[key].ship += r.shipping; groupMap[key].count++;
    }
    return Object.entries(groupMap).map(([, d]) => ({
      name: d.displayName, totalQty: d.qty, totalRevenue: d.rev, totalShipping: d.ship,
      rowCount: d.count, buyingCost: "", packagingCost: "", confirmationFee: "", adSpend: "0",
      suggestedPrice: getSuggestedPrice(d.displayName),
    })).sort((a, b) => b.totalQty - a.totalQty);
  }

  function rebuildFromEntries(entries: ParsedEntry[]): void {
    const validEntries = entries.filter(e => !e.error);
    if (validEntries.length === 0) { setPreviewProducts([]); setHasParsed(false); return; }
    const allRows: NormalizedRow[] = [];
    for (const e of validEntries) allRows.push(...e.rows);
    const seen = new Set<string>(); let dups = 0;
    const deduped = allRows.filter(r => { if (seen.has(r.rowId)) { dups++; return false; } seen.add(r.rowId); return true; });
    setDupCount(dups);
    if (deduped.length === 0) {
      const totalR = entries.reduce((s, e) => s + e.totalRows, 0);
      const hasS = validEntries.some(e => e.colMap.status !== "");
      setParseError(totalR > 0 && hasS ? `⚠️ Aucune ligne "Livré/Livrée/Delivered" trouvée dans ${totalR} lignes.` : "⚠️ Aucun produit valide.");
      setPreviewProducts([]); setHasParsed(false); return;
    }
    const summaries = buildProductsFromRows(deduped);
    setPreviewProducts(summaries);
    setSelectedProductKeys(new Set(summaries.map(p => p.name)));
    setPreviewMeta({ totalRows: entries.reduce((s, e) => s + e.totalRows, 0), filteredRows: deduped.length, noStatusFilter: validEntries.every(e => e.colMap.status === "") });
    setParseError(null); setHasParsed(true);
  }

  function parseSheet(id: string, fileName: string, sheetName: string, data: any[][]): ParsedEntry {
    if (data.length < 2) return { id, fileName, sheetName, totalRows: 0, deliveredRows: 0, headers: [], rawDataRows: [], colMap: { product: "", qty: "", cod: "", status: "", shipping: "" }, rows: [], error: "Feuille vide" };
    const headers  = data[0].map((h: any) => String(h ?? "").trim());
    const dataRows = data.slice(1);
    const detected: ColMap = {
      product:  detectCol(headers, ["ref", "designation", "produit", "article", "libelle", "nom produit", "product", "name", "description"]),
      qty:      detectCol(headers, ["qte", "qty", "quantite", "quantity", "nbre", "nombre", "nbr colis"]),
      cod:      detectCol(headers, ["price", "cod", "montant cod", "prix", "montant", "amount", "valeur", "revenue", "total", "tarif"]),
      status:   detectCol(headers, ["status", "statut", "etat", "livraison", "situation"]),
      shipping: detectCol(headers, ["shipping cost", "frais livr", "frais exp", "cout livr", "shipping", "frais port", "frais transport", "delivery cost"]),
    };
    if (!detected.product) detected.product = detectProductColFromData(headers, dataRows);
    if (!detected.product) return { id, fileName, sheetName, totalRows: 0, deliveredRows: 0, headers, rawDataRows: dataRows, colMap: detected, rows: [], error: "Colonne Produit non détectée." };
    const pIdx = headers.indexOf(detected.product);
    const totalRows = dataRows.filter(r => parseRefCell(r[pIdx] ?? "").designation !== "").length;
    const rows: NormalizedRow[] = [];
    for (const row of dataRows) { const nr = normalizeRow(row, headers, detected); if (nr) rows.push(nr); }
    return { id, fileName, sheetName, totalRows, deliveredRows: rows.length, headers, rawDataRows: dataRows, colMap: detected, rows };
  }

  async function processFiles(files: File[]) {
    if (!files.length) return;
    setIsLoading(true); setParseError(null);
    const XLSX = await import("xlsx");
    const newEntries: ParsedEntry[] = [];
    const errors: { label: string; error: string }[] = [];
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      setParseProgress(`Lecture ${fi + 1}/${files.length} : ${file.name}`);
      await new Promise(r => setTimeout(r, 0));
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheets = file.name.toLowerCase().endsWith('.csv') ? [wb.SheetNames[0]] : wb.SheetNames;
        for (const sheetName of sheets) {
          const ws = wb.Sheets[sheetName]; if (!ws) continue;
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
          const entry = parseSheet(`${Date.now()}-${fi}-${sheetName}`, file.name, sheetName, data);
          if (entry.error) errors.push({ label: `${file.name} / ${sheetName}`, error: entry.error });
          else newEntries.push(entry);
        }
      } catch (e: any) { errors.push({ label: file.name, error: `Impossible de lire : ${e?.message || "format non supporté"}` }); }
    }
    setParseProgress(null); setFileErrors(prev => [...prev, ...errors]);
    setParsedEntries(prev => { const merged = [...prev, ...newEntries]; rebuildFromEntries(merged); return merged; });
    setIsLoading(false);
  }

  function removeEntry(id: string) {
    setParsedEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      if (next.length === 0) { setPreviewProducts([]); setHasParsed(false); setDupCount(0); setParseError(null); }
      else rebuildFromEntries(next);
      return next;
    });
  }

  function remapCol(field: keyof ColMap, val: string) {
    if (!singleEntry) return;
    const newCm: ColMap = { ...singleEntry.colMap, [field]: val === "__none__" ? "" : val };
    const rows: NormalizedRow[] = [];
    for (const row of singleEntry.rawDataRows) { const nr = normalizeRow(row, singleEntry.headers, newCm); if (nr) rows.push(nr); }
    const pIdx = singleEntry.headers.indexOf(newCm.product);
    const totalRows = pIdx !== -1 ? singleEntry.rawDataRows.filter(r => parseRefCell(r[pIdx] ?? "").designation !== "").length : singleEntry.totalRows;
    const updated: ParsedEntry = { ...singleEntry, colMap: newCm, rows, totalRows, deliveredRows: rows.length, error: newCm.product ? undefined : "Colonne Produit requise." };
    setParsedEntries([updated]); rebuildFromEntries([updated]);
  }

  /* ────────────────────────────────────────────────────────────
     AD SPEND IMPORT
  ──────────────────────────────────────────────────────────── */

  function buildAdCampaigns(rows: any[][], headers: string[], cm: { campaign: string; spend: string }): AdCampaignData[] {
    const campIdx  = headers.indexOf(cm.campaign);
    const spendIdx = headers.indexOf(cm.spend);
    if (campIdx === -1 || spendIdx === -1) return [];
    const map: Record<string, number> = {};
    for (const row of rows) {
      const name  = String(row[campIdx] ?? "").trim();
      const spend = parseSpendNum(row[spendIdx]);
      if (!name || spend <= 0) continue;
      map[name] = (map[name] || 0) + spend;
    }
    return Object.entries(map).map(([name, totalSpendRaw]) => ({ name, totalSpendRaw }))
      .sort((a, b) => b.totalSpendRaw - a.totalSpendRaw);
  }

  function initOrUpdateMappings(existing: CampaignMapping[], campaigns: AdCampaignData[], prods: ProductSummary[]): CampaignMapping[] {
    const existingMap = new Map(existing.map(m => [m.campaignName, m]));
    return campaigns.map(c => {
      if (existingMap.has(c.name)) return existingMap.get(c.name)!;
      const preSelected = prods.filter(p => campaignMatchesProduct(c.name, p.name)).map(p => p.name);
      return { campaignName: c.name, ignored: false, selectedProducts: preSelected, splitMode: 'prorata', manualPcts: {} };
    });
  }

  async function processAdFiles(files: File[]) {
    if (!files.length) return;
    setAdImportLoading(true); setAdImportFileErrors([]);
    const XLSX = await import("xlsx");
    const allRows: any[][] = [];
    let combinedHeaders: string[] = [];
    const errors: { label: string; error: string }[] = [];
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      setAdImportProgress(`Lecture ${fi + 1}/${files.length} : ${file.name}`);
      await new Promise(r => setTimeout(r, 0));
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheets = file.name.toLowerCase().endsWith('.csv') ? [wb.SheetNames[0]] : wb.SheetNames;
        for (const sheetName of sheets) {
          const ws = wb.Sheets[sheetName]; if (!ws) continue;
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
          if (data.length < 2) continue;
          const headers = data[0].map((h: any) => String(h ?? "").trim());
          if (combinedHeaders.length === 0) combinedHeaders = headers;
          allRows.push(...data.slice(1).filter(r => r.some((v: any) => v !== "")));
        }
      } catch (e: any) { errors.push({ label: file.name, error: `Impossible de lire : ${e?.message || "format non supporté"}` }); }
    }
    setAdImportProgress(null);
    setAdRawHeaders(combinedHeaders); setAdRawRows(allRows);
    setAdImportFileErrors(prev => [...prev, ...errors]);
    if (combinedHeaders.length > 0) {
      const { campaign, spend, isMad, ambiguous } = detectAdCols(combinedHeaders);
      setAdColMap({ campaign, spend }); setAdIsMad(isMad); setAdAmbiguous(ambiguous);
      if (!ambiguous) {
        const campaigns = buildAdCampaigns(allRows, combinedHeaders, { campaign, spend });
        setAdCampaigns(campaigns);
        setCampaignMappings(prev => initOrUpdateMappings(prev, campaigns, products));
      }
    }
    setAdImportLoading(false);
  }

  function applyAdColMap(cm: { campaign: string; spend: string }) {
    setAdColMap(cm); setAdAmbiguous(!cm.campaign || !cm.spend);
    if (cm.campaign && cm.spend) {
      const { isMad } = detectAdCols(adRawHeaders.filter(h => h === cm.campaign || h === cm.spend));
      setAdIsMad(cm.spend ? madKwCheck(cm.spend) : false);
      const campaigns = buildAdCampaigns(adRawRows, adRawHeaders, cm);
      setAdCampaigns(campaigns);
      setCampaignMappings(prev => initOrUpdateMappings(prev, campaigns, products));
    }
  }

  function madKwCheck(header: string): boolean {
    const n = norm(header);
    return n.includes("mad") || n.includes(" dh") || n.includes("dirham");
  }

  function updateMapping(campaignName: string, update: Partial<CampaignMapping>) {
    setCampaignMappings(prev => prev.map(m => m.campaignName === campaignName ? { ...m, ...update } : m));
  }

  function toggleProductForCampaign(campaignName: string, productName: string) {
    setCampaignMappings(prev => prev.map(m => {
      if (m.campaignName !== campaignName) return m;
      const selected = m.selectedProducts.includes(productName)
        ? m.selectedProducts.filter(p => p !== productName)
        : [...m.selectedProducts, productName];
      const newPcts = { ...m.manualPcts };
      if (!selected.includes(productName)) delete newPcts[productName];
      return { ...m, selectedProducts: selected, manualPcts: newPcts };
    }));
  }

  function updateManualPct(campaignName: string, productName: string, pct: number) {
    setCampaignMappings(prev => prev.map(m =>
      m.campaignName === campaignName ? { ...m, manualPcts: { ...m.manualPcts, [productName]: pct } } : m
    ));
  }

  function toggleCampaignExpand(name: string) {
    setExpandedCampaigns(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }

  /** Compute MAD spend split for one campaign mapping. Returns {productName → MAD amount}. */
  function computeSplitAmounts(mapping: CampaignMapping, totalMAD: number, prods: ProductSummary[]): Record<string, number> {
    const { selectedProducts: sp, splitMode, manualPcts } = mapping;
    if (!sp.length) return {};
    const result: Record<string, number> = {};
    if (splitMode === 'equal') {
      const per = totalMAD / sp.length;
      for (const p of sp) result[p] = per;
    } else if (splitMode === 'manual') {
      for (const p of sp) result[p] = totalMAD * ((manualPcts[p] || 0) / 100);
    } else { // prorata CA
      const caMap: Record<string, number> = {};
      for (const p of sp) { const prod = prods.find(pp => pp.name === p); caMap[p] = prod?.totalRevenue || 0; }
      const totalCA = Object.values(caMap).reduce((s, v) => s + v, 0);
      if (totalCA === 0) { const per = totalMAD / sp.length; for (const p of sp) result[p] = per; }
      else { for (const p of sp) result[p] = totalMAD * (caMap[p] / totalCA); }
    }
    return result;
  }

  const effectiveRate = parseFloat(usdRate) || 0;
  const campaignMAD = (c: AdCampaignData) => adIsMad ? c.totalSpendRaw : c.totalSpendRaw * effectiveRate;

  /** Compute total DH per product from all campaign mappings (for preview + apply). */
  function computeAllSplitAmounts(prods: ProductSummary[]): Record<string, number> {
    const rateOk = adIsMad || (effectiveRate > 0);
    if (!rateOk) return {};
    const spendByProduct: Record<string, number> = {};
    for (const mapping of campaignMappings) {
      if (mapping.ignored || !mapping.selectedProducts.length) continue;
      const c = adCampaigns.find(cc => cc.name === mapping.campaignName);
      if (!c) continue;
      const totalMAD = campaignMAD(c);
      const amounts = computeSplitAmounts(mapping, totalMAD, prods);
      for (const [p, amt] of Object.entries(amounts)) spendByProduct[p] = (spendByProduct[p] || 0) + amt;
    }
    return spendByProduct;
  }

  const manualValidationErrors = campaignMappings.filter(m =>
    !m.ignored && m.selectedProducts.length > 0 && m.splitMode === 'manual' &&
    Math.abs(m.selectedProducts.reduce((s, p) => s + (m.manualPcts[p] || 0), 0) - 100) > 0.5
  );

  const rateValid = adIsMad || (effectiveRate > 0);
  const canApplyAd = rateValid && manualValidationErrors.length === 0 && adCampaigns.length > 0;

  function applyAdMappings(force = false) {
    if (!canApplyAd) return;
    const hasExisting = products.some(p => parseFloat(p.adSpend || '0') > 0);
    if (hasExisting && !force) { setAdApplyConfirmPending(true); return; }
    setAdApplyConfirmPending(false);
    const spendByProduct = computeAllSplitAmounts(products);
    setProducts(prev => prev.map(p => ({ ...p, adSpend: String(Number((spendByProduct[p.name] || 0).toFixed(2))) })));
    setAdMode("specific");
    setAdImportOpen(false);
    toast({ title: "Dépenses pub appliquées", description: `${Object.keys(spendByProduct).length} produit(s) mis à jour.` });
  }

  // Running ad summary
  const totalImportedRaw = adCampaigns.reduce((s, c) => s + c.totalSpendRaw, 0);
  const totalImportedMAD = adIsMad ? totalImportedRaw : totalImportedRaw * effectiveRate;
  const assignedMAD = campaignMappings.filter(m => !m.ignored && m.selectedProducts.length > 0)
    .reduce((s, m) => { const c = adCampaigns.find(cc => cc.name === m.campaignName); return s + (c ? campaignMAD(c) : 0); }, 0);
  const unassignedMAD = totalImportedMAD - assignedMAD;

  /* ────────────────────────────────────────────────────────────
     Step 1→2→3 actions
  ──────────────────────────────────────────────────────────── */
  function goToStep2() {
    const filtered = previewProducts.filter(p => selectedProductKeys.has(p.name));
    setProducts(filtered.map(p => ({ ...p })));
    setStockAutoFilled({});
    // Re-initialize campaign mappings with the new product list
    if (campaignMappings.length > 0) {
      setCampaignMappings(prev => initOrUpdateMappings(prev, adCampaigns, filtered));
    }
    setStep(2);
  }

  function updateProduct(idx: number, field: keyof ProductSummary, val: string) {
    setProducts(prev => { const n = [...prev]; (n[idx] as any)[field] = val; return n; });
    // Clear the "auto (stock)" badge as soon as the user edits buyingCost manually
    if (field === 'buyingCost') {
      const name = products[idx]?.name;
      if (name) setStockAutoFilled(prev => { const n = { ...prev }; delete n[name]; return n; });
    }
  }

  function toNum(v: string) { const x = parseFloat(v); return isNaN(x) ? 0 : x; }

  function calculate() {
    const missing = products.filter(p => !p.buyingCost || p.buyingCost === "0");
    if (missing.length > 0) { toast({ title: "Coûts manquants", description: `Prix d'achat requis : ${missing.map(m => m.name).join(", ")}`, variant: "destructive" }); return; }
    const totalRevAll = products.reduce((s, p) => s + p.totalRevenue, 0);
    const globalAd = adMode === "global" ? toNum(globalAdSpend) : 0;
    const res: ProfitResult[] = products.map(p => {
      const caBrut = p.totalRevenue; const shippingFromFile = p.totalShipping; const caNet = caBrut - shippingFromFile;
      const qty = p.totalQty; const commandes = p.rowCount;
      const cogs = toNum(p.buyingCost) * qty; const packaging = toNum(p.packagingCost) * commandes; const confirmation = toNum(p.confirmationFee) * commandes;
      const adS = adMode === "specific" ? toNum(p.adSpend) : totalRevAll > 0 ? globalAd * (caBrut / totalRevAll) : globalAd / products.length;
      const totalCost = shippingFromFile + cogs + packaging + confirmation + adS;
      const netProfit = caBrut - totalCost; const roi = cogs > 0 ? (netProfit / cogs) * 100 : 0;
      return { name: p.name, qty, commandes, caBrut, shippingFromFile, caNet, cogs, packaging, confirmation, adSpend: adS, totalCost, netProfit, roi };
    });
    setResults(res); setStep(3);
  }

  function reset() {
    setStep(1); setHasParsed(false); setParseError(null);
    setParsedEntries([]); setFileErrors([]); setDupCount(0);
    setPreviewProducts([]); setProducts([]); setResults([]);
    setGlobalAdSpend("0"); setAdMode("global");
    setSelectedProductKeys(new Set()); setProductSearchQuery("");
    setCurrentReportId(null); setReportMonth(new Date().toISOString().slice(0, 7)); setReportTitle("");
    setParseProgress(null);
    // Reset ad import state too
    setAdImportOpen(false); setAdCampaigns([]); setCampaignMappings([]); setAdRawHeaders([]); setAdRawRows([]);
    setAdImportFileErrors([]); setAdApplyConfirmPending(false); setExpandedCampaigns(new Set());
    if (fileRef.current) fileRef.current.value = "";
    if (adFileRef.current) adFileRef.current.value = "";
  }

  function openReport(report: any) {
    const p = report.payload ?? report;
    setProducts(p.products ?? []); setResults(p.results ?? []);
    setAdMode(p.adMode ?? "global"); setGlobalAdSpend(String(p.globalAdSpend ?? "0"));
    setCurrentReportId(report.id); setReportMonth(report.month ?? new Date().toISOString().slice(0, 7));
    setReportTitle(report.title ?? ""); setHasParsed(true);
    if (p.fileName) setParsedEntries([{ id: `rep-${report.id}`, fileName: p.fileName, sheetName: "", totalRows: 0, deliveredRows: 0, headers: [], rawDataRows: [], rows: [], colMap: { product:"",qty:"",cod:"",status:"",shipping:"" } }]);
    setStep(3);
  }

  const fileName = parsedEntries.length === 0 ? "" : parsedEntries.length === 1 ? parsedEntries[0].fileName : `${parsedEntries.length} fichiers`;

  async function saveReport() {
    if (!results.length) return;
    setSavingReport(true);
    try {
      const totals = { caBrut: totalCaBrut, caNet: totalCaNet, netProfit: totalNet, roi: globalROI };
      const payload = { fileName, products, results, adMode, globalAdSpend, totals };
      const isUpdate = currentReportId != null;
      const url = isUpdate ? `/api/profit-reports/${currentReportId}` : '/api/profit-reports';
      const r = await fetch(url, { method: isUpdate ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: reportMonth, title: reportTitle || null, payload }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur');
      if (!isUpdate) setCurrentReportId(data.id);
      qc.invalidateQueries({ queryKey: ['/api/profit-reports'] });
      toast({ title: isUpdate ? 'Rapport mis à jour' : 'Rapport enregistré', description: `Mois : ${reportMonth}` });
    } catch (err: any) { toast({ title: 'Erreur', description: err.message, variant: 'destructive' }); }
    finally { setSavingReport(false); }
  }

  /** Attempt confident name/SKU match between an imported product name and a stock product.
   *  Returns costPrice in DH (not centimes), or null if no confident match. */
  function matchStockPrice(productName: string, stockProds: any[]): number | null {
    const active = stockProds.filter(p => !p.archivedAt && (p.costPrice ?? 0) > 0);
    // 1. Exact name
    const exact = active.find(p => p.name === productName);
    if (exact) return exact.costPrice / 100;
    // 2. Normalized name (accent-insensitive, trim, collapse whitespace, lowercase)
    const np = norm(productName).replace(/\s+/g, " ");
    const normalized = active.find(p => norm(p.name || "").replace(/\s+/g, " ") === np);
    if (normalized) return normalized.costPrice / 100;
    // 3. SKU: check if any stock product's SKU equals the imported name (exact or normalized)
    const bySku = active.find(p => p.sku && (p.sku === productName || norm(p.sku).replace(/\s+/g, " ") === np));
    if (bySku) return bySku.costPrice / 100;
    return null;  // no confident match — leave empty
  }

  function applyStockPrices(prods: any[], force = false) {
    const autoMap: Record<string, boolean> = {};
    setProducts(prev => prev.map(p => {
      const price = matchStockPrice(p.name, prods);
      if (price === null) return p;
      const alreadyFilled = p.buyingCost && p.buyingCost !== "0" && p.buyingCost !== "";
      if (alreadyFilled && !force) return p;
      autoMap[p.name] = true;
      return { ...p, buyingCost: String(price) };
    }));
    setStockAutoFilled(prev => force ? autoMap : { ...prev, ...autoMap });
  }

  useEffect(() => {
    if (step !== 2 || products.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/products", { credentials: "include" });
        if (!resp.ok || cancelled) return;
        const apiProds: any[] = await resp.json();
        if (cancelled) return;

        // ── Save stock products for the reset button ──
        setStockProducts(apiProds ?? []);

        // ── Priority 1: stock costPrice ──
        applyStockPrices(apiProds ?? []);

        // ── Priority 2 (fallback): profitDefaults from product settings ──
        const defaultsMap = new Map<string, any>();
        for (const p of apiProds || []) { const key = norm(p.name || ""); const d = (p.settings as any)?.profitDefaults; if (key && d) defaultsMap.set(key, d); }
        if (defaultsMap.size && !cancelled) {
          setProducts(prev => prev.map(p => {
            const d = defaultsMap.get(norm(p.name)); if (!d) return p;
            return { ...p,
              buyingCost:      (!p.buyingCost      || p.buyingCost      === "0") ? String(d.coutAchat      || "") : p.buyingCost,
              packagingCost:   (!p.packagingCost   || p.packagingCost   === "0") ? String(d.coutEmballage  || "") : p.packagingCost,
              confirmationFee: (!p.confirmationFee || p.confirmationFee === "0") ? String(d.coutConfirmation || "") : p.confirmationFee,
            };
          }));
        }
      } catch (err) { console.warn("[ProfitAnalyzer] Could not load product defaults:", err); }
    })();
    return () => { cancelled = true; };
  }, [step, products.length]);

  /* ── Aggregates ── */
  const totalCaBrut    = results.reduce((s, r) => s + r.caBrut, 0);
  const totalShipFile  = results.reduce((s, r) => s + r.shippingFromFile, 0);
  const totalCaNet     = results.reduce((s, r) => s + r.caNet, 0);
  const totalCost      = results.reduce((s, r) => s + r.totalCost, 0);
  const totalNet       = results.reduce((s, r) => s + r.netProfit, 0);
  const totalCOGS      = results.reduce((s, r) => s + r.cogs, 0);
  const totalPackaging = results.reduce((s, r) => s + r.packaging, 0);
  const totalConfirm   = results.reduce((s, r) => s + r.confirmation, 0);
  const totalAd        = results.reduce((s, r) => s + r.adSpend, 0);
  const globalROI      = totalCOGS > 0 ? (totalNet / totalCOGS) * 100 : 0;

  const barData = results.map(r => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    "CA Brut": Math.round(r.caBrut), "CA Net": Math.round(r.caNet), "Profit": Math.round(r.netProfit),
  }));
  const pieData = [
    { name: "Sourcing",     value: Math.round(totalCOGS),      color: "#3b82f6" },
    { name: "Livraison",    value: Math.round(totalShipFile),   color: "#f59e0b" },
    { name: "Emballage",    value: Math.round(totalPackaging),  color: "#ec4899" },
    { name: "Confirmation", value: Math.round(totalConfirm),    color: "#06b6d4" },
    { name: "Publicité",    value: Math.round(totalAd),         color: "#8b5cf6" },
    { name: "Profit net",   value: Math.max(0, Math.round(totalNet)), color: "#10b981" },
  ].filter(d => d.value > 0);

  /* ───────────────────────── RENDER ──────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #152645 55%, #1a3060 100%)` }}>

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 sticky top-0 z-10 backdrop-blur-md bg-black/20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40` }}>
              <BarChart3 className="w-4.5 h-4.5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight leading-none">Profit Analyzer Pro</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">Analyse de rentabilité par produit</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button onClick={() => setActiveTab('live')} data-testid="tab-live"
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'live' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
              style={activeTab === 'live' ? { background: `${GOLD}30`, color: GOLD } : {}}>
              📊 Par Produit (Live)
            </button>
            <button onClick={() => { if (!hasImportCsv) setUpgradeOpen(true); else setActiveTab('csv'); }} data-testid="tab-csv"
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'csv' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
              style={activeTab === 'csv' ? { background: `${GOLD}30`, color: GOLD } : {}}>
              📁 Import CSV {!hasImportCsv && <Crown className="w-3.5 h-3.5" style={{ color: GOLD }} />}
            </button>
          </div>
          {activeTab === 'csv' && (
            <div className="flex items-center gap-4">
              <StepBar current={step} />
              {(hasParsed || step > 1) && (
                <button onClick={reset} data-testid="button-reset-analyzer"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors ml-2">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ═══════════════ LIVE TAB ═══════════════ */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mr-1">Période</span>
              {[{ key: 'today', label: "Aujourd'hui" }, { key: '7days', label: '7 jours' }, { key: 'month', label: 'Ce mois' }, { key: 'lastmonth', label: 'Mois dernier' }, { key: 'all', label: 'Tout' }].map(({ key, label }) => (
                <button key={key} onClick={() => { setLiveDateRange(key); setLiveShowCustom(false); }} data-testid={`btn-preset-${key}`}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${liveDateRange === key && !liveShowCustom ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/30'}`}>
                  {label}
                </button>
              ))}
              <button onClick={() => setLiveShowCustom(v => !v)} data-testid="btn-preset-custom"
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${liveShowCustom ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:text-white'}`}>
                Personnalisé
              </button>
              {liveShowCustom && (<>
                <input type="date" value={liveDateFrom} onChange={e => setLiveDateFrom(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white" data-testid="input-live-date-from" />
                <span className="text-slate-500 text-xs">→</span>
                <input type="date" value={liveDateTo} onChange={e => setLiveDateTo(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white" data-testid="input-live-date-to" />
              </>)}
              <button onClick={() => liveRefetch()} className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg hover:border-white/30" data-testid="button-live-refresh">
                <RefreshCw className="w-3 h-3" /> Actualiser
              </button>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1" data-testid="live-range-label">{liveDateRangeLabel}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPlatformView(false)} data-testid="btn-view-product" className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all ${!platformView ? 'bg-white/10 text-white border-white/20' : 'text-slate-400 border-white/10 hover:text-white'}`}>📦 Par Produit</button>
              <button onClick={() => setPlatformView(true)} data-testid="btn-view-platform" className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all ${platformView ? 'bg-white/10 text-white border-white/20' : 'text-slate-400 border-white/10 hover:text-white'}`}>🌐 Par Plateforme</button>
            </div>
            {!liveLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'TOTAL COMMANDES', val: liveTotalOrders.toString(), sub: 'période sélectionnée', color: '#f59e0b', icon: '📦' },
                  { label: 'TOTAL LIVRÉES', val: liveTotalDelivered.toString(), sub: `${liveDeliveryRate}% taux`, color: '#06b6d4', icon: '🚚' },
                  { label: 'CA TOTAL', val: liveTotalRevenue.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) + ' DH', sub: 'revenus livrées', color: '#3b82f6', icon: '💰' },
                  { label: 'PROFIT NET TOTAL', val: liveTotalProfit.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) + ' DH', sub: liveTotalProfit >= 0 ? 'En bénéfice' : 'En perte', color: liveTotalProfit >= 0 ? '#10b981' : '#f43f5e', icon: liveTotalProfit >= 0 ? '📈' : '📉' },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <div className="flex items-center gap-2"><span className="text-xl">{kpi.icon}</span><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{kpi.label}</span></div>
                    <p className="text-2xl font-extrabold" style={{ color: kpi.color }}>{kpi.val}</p>
                    <p className="text-[10px] text-slate-500">{kpi.sub}</p>
                  </div>
                ))}
              </div>
            )}
            {liveLoading && <div className="flex items-center justify-center py-16 text-slate-400 gap-3"><RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Chargement...</span></div>}
            {!liveLoading && !platformView && liveProducts.length === 0 && <div className="text-center py-16 text-slate-500"><Package className="w-10 h-10 mx-auto mb-3 opacity-40" /><p className="text-sm">Aucune commande livrée sur cette période</p></div>}
            {!liveLoading && !platformView && liveProducts.length > 0 && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
                  <Package className="w-4 h-4" style={{ color: '#f59e0b' }} />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Rentabilité par Produit — {liveProducts.length} Produit(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs" style={{ minWidth: '1200px', width: '100%' }}>
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 text-[10px] uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5 font-semibold min-w-[200px]">Produit</th>
                        <th className="text-center px-3 py-2.5">Cmd / Unités</th>
                        <th className="text-right px-3 py-2.5"><div>CA Brut</div><div className="text-[9px] text-slate-500 normal-case font-normal">price total</div></th>
                        <th className="text-right px-3 py-2.5"><div>Frais Livr.</div><div className="text-[9px] text-slate-500 normal-case font-normal">du fichier</div></th>
                        <th className="text-right px-3 py-2.5"><div>CA Net</div></th>
                        <th className="text-right px-3 py-2.5"><div>Sourcing Total</div></th>
                        <th className="text-right px-3 py-2.5"><div>Emballage Total</div></th>
                        <th className="text-right px-3 py-2.5"><div>Commissions</div></th>
                        <th className="text-right px-3 py-2.5">Pub</th>
                        <th className="text-right px-4 py-2.5">Bénéfice Net</th>
                        <th className="text-center px-3 py-2.5">Marge</th>
                        <th className="text-center px-3 py-2.5">ROI</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Par Livr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveProducts.map((p: any, i: number) => {
                        const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const caNet = (p.revenue ?? 0) - (p.shippingCost ?? 0);
                        const profitColor = p.netProfit > 0 ? '#10b981' : p.netProfit < 0 ? '#f43f5e' : '#94a3b8';
                        const marginColor = p.margin >= 30 ? '#10b981' : p.margin >= 10 ? '#f59e0b' : '#f43f5e';
                        return (
                          <tr key={i} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${p.noData ? "opacity-50" : ""}`} data-testid={`row-live-product-${i}`}>
                            <td className="px-4 py-3 text-white font-semibold w-1/3" title={p.name} style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.3' }}>
                              {p.name}{p.noData && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 border border-slate-600 font-normal">Nouveau</span>}
                            </td>
                            {p.noData ? <td colSpan={12} className="px-3 py-3 text-center text-slate-500 text-[11px] italic">Aucune commande sur cette période</td> : (<>
                              <td className="px-3 py-3 text-center"><div className="font-bold" style={{ color: '#f59e0b' }}>{p.deliveredOrders} cmd</div>{p.deliveredUnits != null && p.deliveredUnits !== p.deliveredOrders && <div className="text-[11px] text-slate-400">{p.deliveredUnits} u</div>}</td>
                              <td className="px-3 py-3 text-right font-bold" style={{ color: '#10b981' }}>{p.revenue > 0 ? fmt(p.revenue) : <span className="text-slate-500">—</span>}</td>
                              <td className="px-3 py-3 text-right font-medium" style={{ color: p.shippingCost > 0 ? '#f43f5e' : '#475569' }}>{p.shippingCost > 0 ? `−${fmt(p.shippingCost)} DH` : '—'}</td>
                              <td className="px-3 py-3 text-right font-bold" style={{ color: '#06b6d4' }}>{fmt(caNet)} DH</td>
                              <td className="px-3 py-3 text-right text-slate-300">{p.productCost > 0 ? `−${fmt(p.productCost)} DH` : '—'}</td>
                              <td className="px-3 py-3 text-right" style={{ color: '#ec4899' }}>{`−${fmt(p.packagingCost ?? 0)} DH`}</td>
                              <td className="px-3 py-3 text-right text-slate-300">{`−${fmt(p.confirmationCost ?? 0)} DH`}</td>
                              <td className="px-3 py-3 text-right" style={{ color: p.adSpend > 0 ? '#8b5cf6' : '#475569' }}>{`−${fmt(p.adSpend ?? 0)} DH`}</td>
                              <td className="px-4 py-3 text-right font-extrabold text-sm" style={{ color: profitColor }}>{fmt(p.netProfit)} DH</td>
                              <td className="px-3 py-3 text-center"><span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: marginColor + '20', color: marginColor, border: `1px solid ${marginColor}40` }}>{p.margin.toFixed(1)}%</span></td>
                              <td className="px-3 py-3 text-center"><span className="text-[11px] font-bold" style={{ color: p.roi > 0 ? '#10b981' : '#f43f5e' }}>{p.roi.toFixed(0)}%</span></td>
                              <td className="px-3 py-3 text-right">{p.deliveredOrders > 0 ? <span className="text-[12px] font-bold" style={{ color: (p.netProfit / p.deliveredOrders) > 0 ? "#10b981" : "#f43f5e" }}>{(p.netProfit / p.deliveredOrders).toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} DH</span> : <span className="text-slate-500 text-[11px]">—</span>}</td>
                            </>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!liveLoading && platformView && livePlatforms.length === 0 && <div className="text-center py-16 text-slate-500"><Globe className="w-10 h-10 mx-auto mb-3 opacity-40" /><p className="text-sm">Aucune donnée de plateforme</p></div>}
            {!liveLoading && platformView && livePlatforms.length > 0 && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center gap-2"><Globe className="w-4 h-4" style={{ color: '#3b82f6' }} /><span className="text-xs font-bold text-white uppercase tracking-widest">Profit par Plateforme</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-white/5 text-slate-400 text-[10px] uppercase tracking-wider"><th className="text-left px-4 py-2.5">Plateforme</th><th className="text-center px-3 py-2.5">Commandes</th><th className="text-center px-3 py-2.5">Livrées</th><th className="text-right px-3 py-2.5">CA (DH)</th><th className="text-right px-3 py-2.5">Pub (DH)</th><th className="text-right px-3 py-2.5">Profit Net</th><th className="text-center px-3 py-2.5">ROAS</th><th className="text-center px-3 py-2.5">CPO</th></tr></thead>
                    <tbody>{livePlatforms.map((p: any, i: number) => {
                      const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2 });
                      const icon = p.platform.toLowerCase().includes('facebook') ? '📘' : p.platform.toLowerCase().includes('tiktok') ? '🎵' : p.platform.toLowerCase().includes('google') ? '🔍' : p.platform.toLowerCase().includes('organique') ? '🌱' : '📊';
                      return <tr key={i} className="border-b border-white/5 hover:bg-white/5" data-testid={`row-platform-${i}`}><td className="px-4 py-3 font-bold text-white"><span className="mr-2">{icon}</span>{p.platform}</td><td className="px-3 py-3 text-center text-slate-300 font-bold">{p.orders}</td><td className="px-3 py-3 text-center font-bold" style={{ color: '#10b981' }}>{p.delivered}</td><td className="px-3 py-3 text-right font-bold text-white">{fmt(p.revenue)}</td><td className="px-3 py-3 text-right" style={{ color: '#8b5cf6' }}>{fmt(p.adSpend)}</td><td className="px-3 py-3 text-right font-extrabold" style={{ color: p.netProfit >= 0 ? '#10b981' : '#f43f5e' }}>{fmt(p.netProfit)}</td><td className="px-3 py-3 text-center font-bold" style={{ color: p.roas >= 3 ? '#10b981' : p.roas >= 1.5 ? '#f59e0b' : '#f43f5e' }}>{p.roas.toFixed(2)}x</td><td className="px-3 py-3 text-center text-slate-300">{fmt(p.cpo)} DH</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ CSV TAB ═══════════════ */}
        {activeTab === 'csv' && (
          <div className="space-y-5">

            {/* Saved reports */}
            {savedReports.length > 0 && step === 1 && (
              <Card className="border-white/10 bg-white/5 text-white">
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}><FolderOpen className="w-3.5 h-3.5" /> Rapports enregistrés</CardTitle></CardHeader>
                <CardContent className="p-0 pb-2">
                  <div className="divide-y divide-white/8">
                    {savedReports.map((rep: any) => (
                      <div key={rep.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <CalendarDays className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white whitespace-normal break-words">{rep.title || rep.fileName || `Rapport ${rep.month}`}<span className="ml-2 text-xs text-slate-400 font-normal">{rep.month}</span></p>
                            {rep.totals && <p className="text-[11px]" style={{ color: rep.totals.netProfit >= 0 ? '#4ade80' : '#f87171' }}>{rep.totals.netProfit >= 0 ? '+' : ''}{(rep.totals.netProfit / 1).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH bénéfice net</p>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0 ml-3">
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] border-amber-500/30 text-amber-300 hover:bg-amber-500/15" data-testid={`button-open-report-${rep.id}`}
                            onClick={async () => { const r = await fetch(`/api/profit-reports/${rep.id}`, { credentials: 'include' }); openReport(await r.json()); }}>
                            <FolderOpen className="w-3 h-3 mr-1" /> Ouvrir
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/15" data-testid={`button-delete-report-${rep.id}`} disabled={deleteReportMutation.isPending} onClick={() => deleteReportMutation.mutate(rep.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ══ STEP 1 ══ */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Dropzone */}
                <div data-testid="dropzone-file-upload"
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name)); if (files.length) processFiles(files); }}
                  onClick={() => !isLoading && fileRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center py-10 gap-4 ${isDragging ? "border-amber-400 bg-amber-400/8" : "border-slate-600/70 hover:border-amber-500/50 bg-white/3"}`}>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" data-testid="input-file-upload"
                    onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) { processFiles(files); e.target.value = ""; } }} />
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><p className="text-amber-300 text-sm font-medium">{parseProgress ?? "Analyse en cours…"}</p></div>
                  ) : (<>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}30` }}><Upload className="w-6 h-6" style={{ color: GOLD }} /></div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-sm">{parsedEntries.length > 0 ? "➕ Ajouter d'autres fichiers" : "Déposez vos fichiers ici"}</p>
                      <p className="text-slate-500 text-xs mt-1">Plusieurs fichiers acceptés · .xlsx · .xls · .csv — Export transporteur</p>
                    </div>
                  </>)}
                </div>

                {/* File errors */}
                {fileErrors.map((fe, i) => (
                  <div key={i} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0"><p className="text-rose-300 text-xs font-semibold">{fe.label}</p><p className="text-rose-400/80 text-[11px]">{fe.error}</p></div>
                    <button onClick={() => setFileErrors(prev => prev.filter((_, j) => j !== i))} className="text-rose-400/60 hover:text-rose-300"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {parseError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" /><p className="text-rose-300 text-xs">{parseError}</p></div>}

                {/* File list */}
                {parsedEntries.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                      <div className="flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-amber-400" /><span className="text-xs font-bold text-white uppercase tracking-widest">Fichiers importés</span><span className="text-[10px] text-slate-500 ml-1">({parsedEntries.length} feuille{parsedEntries.length > 1 ? "s" : ""})</span></div>
                      {dupCount > 0 && <span className="text-[10px] text-amber-400 font-semibold">{dupCount} doublon{dupCount > 1 ? "s" : ""} ignoré{dupCount > 1 ? "s" : ""}</span>}
                    </div>
                    <div className="divide-y divide-white/5">
                      {parsedEntries.map(entry => (
                        <div key={entry.id} data-testid={`entry-row-${entry.id}`} className={`flex items-center gap-3 px-4 py-2.5 ${entry.error ? "bg-rose-500/5" : "hover:bg-white/3"} transition-colors`}>
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${entry.error ? "text-rose-400" : "text-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-white font-medium truncate max-w-[200px]" title={entry.fileName}>{entry.fileName}</span>
                              {entry.sheetName && entry.sheetName !== "CSV" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-white/10 font-mono">{entry.sheetName}</span>}
                            </div>
                            {entry.error ? <p className="text-[11px] text-rose-400 mt-0.5">{entry.error}</p> : <p className="text-[11px] text-slate-500 mt-0.5"><span className="text-emerald-400 font-semibold">{entry.deliveredRows}</span> lignes livrées <span className="text-slate-600">/ {entry.totalRows} total</span></p>}
                          </div>
                          <button onClick={() => removeEntry(entry.id)} data-testid={`button-remove-entry-${entry.id}`} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products section */}
                {hasParsed && previewProducts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 text-sm font-semibold">{previewProducts.length} produits détectés</span>
                        <span className="text-slate-500 text-xs">({previewMeta.filteredRows} / {previewMeta.totalRows} lignes{previewMeta.noStatusFilter ? " — sans filtre statut" : " livrées"}{dupCount > 0 ? ` · ${dupCount} doublons ignorés` : ""})</span>
                      </div>
                      <Button onClick={goToStep2} size="sm" disabled={selectedProductKeys.size === 0}
                        className={`gap-2 font-bold text-xs ${selectedProductKeys.size === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                        style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }} data-testid="button-next-step2">
                        Continuer <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Column mapping (single entry only) */}
                    {singleEntry && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1"><Settings2 className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Correspondance des colonnes</span></div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {(["product", "qty", "cod", "status", "shipping"] as (keyof ColMap)[]).map(field => {
                            const labels: Record<keyof ColMap, string> = { product: "Produit *", qty: "Quantité", cod: "Prix / COD", status: "Statut", shipping: "Frais livr." };
                            const isQtyConflict = field === "qty" && colMap.qty && colMap.qty === colMap.product;
                            return (
                              <div key={field} className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{labels[field]}</label>
                                <Select value={colMap[field] || "__none__"} onValueChange={v => remapCol(field, v)}>
                                  <SelectTrigger className={`h-7 text-xs bg-white/5 text-white ${isQtyConflict ? "border-amber-500/60" : "border-white/15"}`} data-testid={`select-col-${field}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">(aucune)</SelectItem>
                                    {rawHeaders.filter(h => h !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                {isQtyConflict && <p className="text-[10px] text-amber-400 leading-tight">⚠️ Même colonne que Produit</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {parsedEntries.length > 1 && (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-2">
                        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <p className="text-xs text-slate-400"><span className="font-semibold text-white">{parsedEntries.length} feuilles</span> fusionnées. Colonnes détectées automatiquement par fichier.</p>
                      </div>
                    )}

                    {/* Product selector */}
                    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                        <div><h3 className="text-sm font-bold text-white">Sélection des produits</h3><p className="text-xs text-slate-400 mt-1">Décochez les produits à exclure.</p></div>
                        <button onClick={handleToggleAll} data-testid="button-toggle-all-products" className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold transition-colors">{selectedProductKeys.size === previewProducts.length ? "✗ Tout désélectionner" : "✓ Tout sélectionner"}</button>
                      </div>
                      <input type="text" placeholder="🔍 Rechercher un produit..." value={productSearchQuery} onChange={e => setProductSearchQuery(e.target.value)} data-testid="input-product-search" className="w-full mb-3 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:border-amber-500 outline-none text-sm transition-colors" />
                      <div className="text-xs font-semibold mb-3" style={{ color: GOLD }}>{selectedProductKeys.size} / {previewProducts.length} produits · ≈ {totalSelectedLines} lignes</div>
                      <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                        {filteredPreviewProducts.map(p => {
                          const checked = selectedProductKeys.has(p.name);
                          return (
                            <label key={p.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? "bg-slate-800/60 hover:bg-slate-800" : "bg-transparent hover:bg-slate-800/40 opacity-60"}`} data-testid={`label-product-${norm(p.name)}`}>
                              <input type="checkbox" checked={checked} onChange={() => handleToggleProduct(p.name)} className="w-4 h-4 accent-amber-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white whitespace-normal break-words font-medium">{p.name}</div>
                                <div className="text-[11px] text-slate-400">{p.rowCount} livraisons{p.totalQty !== p.rowCount && <span className="text-amber-400 font-semibold"> · {p.totalQty} unités</span>} · {fmtMAD(p.totalRevenue)}</div>
                              </div>
                            </label>
                          );
                        })}
                        {filteredPreviewProducts.length === 0 && <div className="text-center text-slate-500 text-sm py-6">Aucun produit ne correspond.</div>}
                      </div>
                    </div>

                    {/* Preview table */}
                    <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
                      <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Aperçu produits fusionnés</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto max-h-72">
                          <Table>
                            <TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="text-slate-500 text-xs py-2">Produit</TableHead><TableHead className="text-slate-500 text-xs py-2 text-center">Qté</TableHead><TableHead className="text-slate-500 text-xs py-2 text-right">CA Brut</TableHead><TableHead className="text-slate-500 text-xs py-2 text-right">Frais livr.</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {previewProducts.map((p, i) => (
                                <TableRow key={i} className={`border-white/8 hover:bg-white/4 ${!selectedProductKeys.has(p.name) ? "opacity-40" : ""}`}>
                                  <TableCell className="text-white text-xs py-2 font-medium whitespace-normal break-words">{p.name}</TableCell>
                                  <TableCell className="text-center text-xs py-2 text-amber-300">{p.totalQty}</TableCell>
                                  <TableCell className="text-right text-xs py-2 text-emerald-300">{fmtMAD(p.totalRevenue)}</TableCell>
                                  <TableCell className="text-right text-xs py-2 text-slate-400">{fmtMAD(p.totalShipping)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* ══ STEP 2 ══ */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">Saisie des coûts</h2>
                  <Button variant="outline" size="sm" onClick={() => setStep(1)} className="border-white/20 text-slate-300 hover:bg-white/8 text-xs" data-testid="button-back-step-1">← Retour</Button>
                </div>

                {/* Ad spend mode */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2"><Megaphone className="w-3.5 h-3.5 text-purple-400" /><span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Dépenses Pub</span></div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={adMode === "global"} onChange={() => setAdMode("global")} className="accent-amber-400" data-testid="radio-ad-global" />
                      <span className="text-xs text-slate-300">Global (prorata CA)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={adMode === "specific"} onChange={() => setAdMode("specific")} className="accent-amber-400" data-testid="radio-ad-specific" />
                      <span className="text-xs text-slate-300">Par produit</span>
                    </label>
                    <button
                      onClick={() => setAdImportOpen(v => !v)}
                      data-testid="button-ad-import-toggle"
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${adImportOpen ? "border-purple-500/60 bg-purple-500/15 text-purple-300" : "border-white/15 text-slate-400 hover:text-purple-300 hover:border-purple-500/40"}`}>
                      <BadgeDollarSign className="w-3.5 h-3.5" />
                      {adImportOpen ? "Fermer l'import pub" : "Importer les dépenses publicitaires"}
                      {adCampaigns.length > 0 && !adImportOpen && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">{adCampaigns.length}</span>}
                    </button>
                  </div>
                  {adMode === "global" && !adImportOpen && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-400 shrink-0">Total pub (DH)</label>
                      <Input value={globalAdSpend} onChange={e => setGlobalAdSpend(e.target.value)} type="number" min="0" placeholder="0" className="h-8 w-36 text-xs bg-white/5 border-white/20 text-white" data-testid="input-global-ad-spend" />
                    </div>
                  )}

                  {/* ══ AD IMPORT PANEL ══ */}
                  {adImportOpen && (
                    <div className="mt-3 space-y-4 border-t border-white/10 pt-4">

                      {/* Ad Dropzone */}
                      <div
                        data-testid="dropzone-ad-import"
                        onDragOver={e => { e.preventDefault(); setAdIsDragging(true); }}
                        onDragLeave={() => setAdIsDragging(false)}
                        onDrop={e => { e.preventDefault(); setAdIsDragging(false); const files = Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name)); if (files.length) processAdFiles(files); }}
                        onClick={() => !adImportLoading && adFileRef.current?.click()}
                        className={`rounded-xl border-2 border-dashed cursor-pointer transition-all flex items-center justify-center gap-3 py-5 ${adIsDragging ? "border-purple-400 bg-purple-400/8" : "border-slate-600/60 hover:border-purple-500/50 bg-white/3"}`}>
                        <input ref={adFileRef} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" data-testid="input-ad-file"
                          onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) { processAdFiles(files); e.target.value = ""; } }} />
                        {adImportLoading ? (
                          <div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /><p className="text-purple-300 text-xs">{adImportProgress ?? "Lecture…"}</p></div>
                        ) : (
                          <><BadgeDollarSign className="w-5 h-5 text-purple-400 shrink-0" /><div><p className="text-white text-xs font-semibold">{adCampaigns.length > 0 ? "Ajouter / remplacer fichier pub" : "Déposez l'export Facebook Ads / TikTok Ads"}</p><p className="text-slate-500 text-[11px]">.csv · .xlsx · .xls — plusieurs fichiers acceptés, fusionnés</p></div></>
                        )}
                      </div>

                      {/* Ad file errors */}
                      {adImportFileErrors.map((fe, i) => (
                        <div key={i} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0"><p className="text-rose-300 text-[11px] font-semibold">{fe.label}</p><p className="text-rose-400/80 text-[10px]">{fe.error}</p></div>
                          <button onClick={() => setAdImportFileErrors(prev => prev.filter((_, j) => j !== i))} className="text-rose-400/60 hover:text-rose-300"><X className="w-3 h-3" /></button>
                        </div>
                      ))}

                      {/* Column ambiguity resolution */}
                      {adAmbiguous && adRawHeaders.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
                          <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /><span className="text-xs font-bold text-amber-300">Colonnes non détectées automatiquement — sélection manuelle requise</span></div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Campagne *</label>
                              <Select value={adColMap.campaign || "__none__"} onValueChange={v => applyAdColMap({ ...adColMap, campaign: v === "__none__" ? "" : v })}>
                                <SelectTrigger className="h-7 text-xs bg-white/5 text-white border-white/15" data-testid="select-ad-campaign-col"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="__none__">(choisir)</SelectItem>{adRawHeaders.filter(h => h).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Dépense (spend) *</label>
                              <Select value={adColMap.spend || "__none__"} onValueChange={v => applyAdColMap({ ...adColMap, spend: v === "__none__" ? "" : v })}>
                                <SelectTrigger className="h-7 text-xs bg-white/5 text-white border-white/15" data-testid="select-ad-spend-col"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="__none__">(choisir)</SelectItem>{adRawHeaders.filter(h => h).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* USD→MAD rate */}
                      {adCampaigns.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3">
                          {adIsMad ? (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-[11px] text-emerald-300 font-semibold">Montants déjà en DH/MAD — conversion désactivée</span>
                            </div>
                          ) : (
                            <>
                              <label className="text-xs text-slate-300 font-semibold shrink-0">Taux USD → MAD :</label>
                              <Input value={usdRate} onChange={e => setUsdRate(e.target.value)} type="number" min="0.01" step="0.01" placeholder="ex: 10.15"
                                className={`h-8 w-32 text-xs bg-white/5 border-white/20 text-white ${usdRate && effectiveRate <= 0 ? "border-rose-500" : ""}`}
                                data-testid="input-usd-rate" />
                              {usdRate && effectiveRate <= 0 && <p className="text-[11px] text-rose-400">Taux invalide — entrez un nombre positif</p>}
                              {effectiveRate > 0 && <p className="text-[11px] text-slate-400">Exemple : {fmtUSD(100)} → {fmtMAD(100 * effectiveRate)}</p>}
                            </>
                          )}
                        </div>
                      )}

                      {/* Running summary */}
                      {adCampaigns.length > 0 && (
                        <div className="rounded-lg bg-white/4 border border-white/8 px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                          <span>📥 <span className="text-white font-semibold">{fmtUSD(totalImportedRaw)}</span>{!adIsMad && effectiveRate > 0 && <span className="text-slate-400"> ≈ {fmtMAD(totalImportedMAD)}</span>} importé</span>
                          <span>✅ <span className="text-emerald-300 font-semibold">{fmtMAD(assignedMAD)}</span> assigné</span>
                          <span className={unassignedMAD > 0.01 ? "text-amber-400" : "text-slate-500"}>⚠️ <span className="font-semibold">{fmtMAD(unassignedMAD)}</span> non assigné</span>
                        </div>
                      )}

                      {/* Campaign table */}
                      {adCampaigns.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-2">
                            <BadgeDollarSign className="w-3.5 h-3.5 text-purple-400" />
                            {adCampaigns.length} campagne{adCampaigns.length > 1 ? "s" : ""} — assigner aux produits
                          </p>

                          {/* Manual validation errors */}
                          {manualValidationErrors.length > 0 && (
                            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                              <p className="text-rose-300 text-[11px]">Pourcentages invalides pour : {manualValidationErrors.map(m => m.campaignName.slice(0, 30)).join(", ")} — la somme doit être 100%.</p>
                            </div>
                          )}

                          <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
                            {campaignMappings.map(mapping => {
                              const campaign = adCampaigns.find(c => c.name === mapping.campaignName);
                              if (!campaign) return null;
                              const totalMAD = campaignMAD(campaign);
                              const isExpanded = expandedCampaigns.has(mapping.campaignName);
                              const rateReady = adIsMad || effectiveRate > 0;

                              // Compute live split preview
                              const splitPreview = rateReady ? computeSplitAmounts(mapping, totalMAD, products) : {};
                              const manualSum = mapping.selectedProducts.reduce((s, p) => s + (mapping.manualPcts[p] || 0), 0);
                              const manualOk = mapping.splitMode !== 'manual' || Math.abs(manualSum - 100) <= 0.5;

                              return (
                                <div key={mapping.campaignName} className={`${mapping.ignored ? "opacity-50" : ""}`}>
                                  {/* Campaign row header */}
                                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                                    <button onClick={() => toggleCampaignExpand(mapping.campaignName)} className="text-slate-400 hover:text-white shrink-0 transition-colors" data-testid={`btn-expand-campaign-${mapping.campaignName.slice(0,20)}`}>
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs font-semibold truncate ${mapping.ignored ? "line-through text-slate-500" : "text-white"}`} title={mapping.campaignName}>{mapping.campaignName}</p>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        {fmtUSD(campaign.totalSpendRaw)}{!adIsMad && effectiveRate > 0 && <span className="text-purple-300 ml-1">≈ {fmtMAD(totalMAD)}</span>}
                                        {mapping.selectedProducts.length > 0 && !mapping.ignored && <span className="text-slate-400 ml-2">· {mapping.selectedProducts.length} produit{mapping.selectedProducts.length > 1 ? "s" : ""}</span>}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => updateMapping(mapping.campaignName, { ignored: !mapping.ignored })}
                                      data-testid={`btn-ignore-campaign-${mapping.campaignName.slice(0,20)}`}
                                      className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-all shrink-0 ${mapping.ignored ? "border-amber-500/50 text-amber-300 bg-amber-500/10" : "border-white/10 text-slate-500 hover:text-amber-300 hover:border-amber-500/30"}`}>
                                      {mapping.ignored ? "Réactiver" : "Ignorer"}
                                    </button>
                                  </div>

                                  {/* Expanded: product selection + split mode */}
                                  {isExpanded && !mapping.ignored && (
                                    <div className="px-4 pb-4 bg-black/10 space-y-3">
                                      {/* Split mode selector */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide shrink-0">Répartition :</span>
                                        {([['prorata', 'Prorata CA'], ['equal', 'Parts égales'], ['manual', 'Manuel (%)']] as const).map(([mode, label]) => (
                                          <button key={mode} onClick={() => updateMapping(mapping.campaignName, { splitMode: mode })}
                                            data-testid={`btn-split-${mode}-${mapping.campaignName.slice(0,15)}`}
                                            className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-all ${mapping.splitMode === mode ? "border-purple-500/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-slate-400 hover:text-white"}`}>
                                            {label}
                                          </button>
                                        ))}
                                      </div>

                                      {/* Product checkboxes */}
                                      <div className="max-h-52 overflow-y-auto space-y-1">
                                        {products.map(prod => {
                                          const isSelected = mapping.selectedProducts.includes(prod.name);
                                          const shareMAD = splitPreview[prod.name] ?? 0;
                                          return (
                                            <label key={prod.name}
                                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isSelected ? "bg-purple-500/10 hover:bg-purple-500/15" : "hover:bg-white/5 opacity-60"}`}
                                              data-testid={`label-ad-product-${norm(prod.name)}`}>
                                              <input type="checkbox" checked={isSelected} onChange={() => toggleProductForCampaign(mapping.campaignName, prod.name)} className="w-3.5 h-3.5 accent-purple-500 shrink-0" />
                                              <div className="flex-1 min-w-0">
                                                <span className="text-xs text-white font-medium break-words">{prod.name}</span>
                                                {prod.totalRevenue > 0 && <span className="text-[10px] text-slate-500 ml-2">CA: {fmtMAD(prod.totalRevenue)}</span>}
                                              </div>
                                              {isSelected && rateReady && (
                                                <span className="text-[11px] font-bold text-purple-300 shrink-0">→ {fmtMAD(shareMAD)}</span>
                                              )}
                                              {/* Manual % input */}
                                              {isSelected && mapping.splitMode === 'manual' && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                  <Input
                                                    value={mapping.manualPcts[prod.name] ?? ""}
                                                    onChange={e => updateManualPct(mapping.campaignName, prod.name, parseFloat(e.target.value) || 0)}
                                                    type="number" min="0" max="100" placeholder="0"
                                                    className="h-6 w-16 text-[11px] bg-white/5 border-white/15 text-white text-right"
                                                    data-testid={`input-manual-pct-${norm(prod.name)}`}
                                                    onClick={e => e.preventDefault()}
                                                  />
                                                  <span className="text-[10px] text-slate-400">%</span>
                                                </div>
                                              )}
                                            </label>
                                          );
                                        })}
                                      </div>

                                      {/* Manual % validation */}
                                      {mapping.splitMode === 'manual' && mapping.selectedProducts.length > 0 && (
                                        <div className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold ${manualOk ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-rose-500/10 text-rose-300 border border-rose-500/20"}`}>
                                          Total : {manualSum.toFixed(1)}% {manualOk ? "✓" : `— ${(100 - manualSum).toFixed(1)}% manquant`}
                                        </div>
                                      )}

                                      {/* Prorata CA = 0 fallback notice */}
                                      {mapping.splitMode === 'prorata' && mapping.selectedProducts.length > 0 && mapping.selectedProducts.every(p => (products.find(pp => pp.name === p)?.totalRevenue ?? 0) === 0) && (
                                        <div className="text-[11px] text-amber-400 px-3">⚠️ CA = 0 pour tous les produits sélectionnés — répartition en parts égales appliquée.</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Reconciliation + Apply */}
                          {rateValid && (
                            <div className="rounded-lg bg-white/4 border border-white/8 px-4 py-2.5 text-[11px] text-slate-400">
                              {(() => {
                                const all = computeAllSplitAmounts(products);
                                const total = Object.values(all).reduce((s, v) => s + v, 0);
                                const diff = Math.abs(total - assignedMAD);
                                return (
                                  <span>
                                    Réconciliation : <span className="text-white font-semibold">{fmtMAD(total)}</span> distribuée
                                    {diff > 0.02 ? <span className="text-amber-400"> (écart: {fmtMAD(diff)} — vérifiez les % manuels)</span> : <span className="text-emerald-400"> ✓</span>}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          {/* Apply confirmation */}
                          {adApplyConfirmPending && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
                              <p className="text-xs text-amber-300 font-semibold">⚠️ Des valeurs pub ont déjà été saisies. Écraser ?</p>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => applyAdMappings(true)} className="text-xs h-7" style={{ background: GOLD, color: NAVY }} data-testid="button-ad-apply-confirm">Oui, écraser</Button>
                                <Button size="sm" variant="outline" onClick={() => setAdApplyConfirmPending(false)} className="text-xs h-7 border-white/20 text-slate-300">Annuler</Button>
                              </div>
                            </div>
                          )}

                          <Button
                            onClick={() => applyAdMappings(false)}
                            disabled={!canApplyAd || adApplyConfirmPending}
                            data-testid="button-apply-ad-spend"
                            className="w-full gap-2 font-bold text-sm"
                            style={canApplyAd ? { background: `linear-gradient(135deg, #7c3aed 0%, #9f67ff 100%)`, color: '#fff' } : {}}>
                            <CheckCircle2 className="w-4 h-4" />
                            Appliquer les dépenses pub →
                            {!adIsMad && effectiveRate <= 0 && <span className="text-[11px] font-normal opacity-70">(taux USD requis)</span>}
                          </Button>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {/* Info banner */}
                {(() => {
                  const totalCmd = products.reduce((s, p) => s + p.rowCount, 0);
                  const totalUnits = products.reduce((s, p) => s + p.totalQty, 0);
                  const hasMultiUnit = totalUnits !== totalCmd;
                  return (
                    <div className="rounded-lg border border-white/10 bg-white/4 px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                      <span>💡 <span className="text-slate-300 font-semibold">{totalCmd}</span> commandes livrées</span>
                      {hasMultiUnit && <span>· <span className="text-amber-300 font-semibold">{totalUnits}</span> unités physiques</span>}
                      {hasMultiUnit && <span className="text-slate-500">· Emballage &amp; Confirmation × commandes ; Prix achat × unités</span>}
                    </div>
                  );
                })()}

                {/* Stock auto-fill summary */}
                {products.length > 0 && (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-xs text-emerald-300 font-semibold">
                      📦 {Object.values(stockAutoFilled).filter(Boolean).length}/{products.length} produit{products.length > 1 ? "s" : ""} pré-{Object.values(stockAutoFilled).filter(Boolean).length > 1 ? "remplis" : "rempli"} depuis le stock
                    </span>
                    {stockProducts.length > 0 && (
                      resetStockConfirm ? (
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className="text-amber-300">Écraser les saisies manuelles ?</span>
                          <button onClick={() => { applyStockPrices(stockProducts, true); setResetStockConfirm(false); }}
                            className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/30" data-testid="button-reset-stock-confirm">
                            Oui
                          </button>
                          <button onClick={() => setResetStockConfirm(false)} className="px-2 py-0.5 rounded bg-white/5 border border-white/15 text-slate-400 hover:text-white" data-testid="button-reset-stock-cancel">
                            Non
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setResetStockConfirm(true)}
                          className="text-[11px] text-slate-400 hover:text-emerald-300 underline underline-offset-2 transition-colors flex items-center gap-1" data-testid="button-reset-stock-prices">
                          <RotateCcw className="w-2.5 h-2.5" /> Réinitialiser depuis le stock
                        </button>
                      )
                    )}
                  </div>
                )}

                {/* Per-product cost table */}
                <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-slate-500 text-xs py-3">Produit</TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center">Cmd / Unités</TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center">CA Brut</TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center"><div>Prix achat / unité <span style={{ color: GOLD }}>*</span></div><div className="text-[9px] font-normal text-slate-600 normal-case">× unités</div></TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center"><div>Emballage / cde</div><div className="text-[9px] font-normal text-slate-600 normal-case">× commandes</div></TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center"><div>Confirm. / cde</div><div className="text-[9px] font-normal text-slate-600 normal-case">× commandes</div></TableHead>
                            <TableHead className="text-slate-500 text-xs py-3 text-center">Pub (DH)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((p, i) => (
                            <TableRow key={i} className="border-white/8 hover:bg-white/4" data-testid={`row-cost-${i}`}>
                              <TableCell className="text-white text-xs py-2 font-medium">
                                <div className="whitespace-normal break-words" title={p.name}>{p.name}</div>
                                {p.suggestedPrice && <button className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 mt-0.5" onClick={() => updateProduct(i, "buyingCost", String(p.suggestedPrice))} data-testid={`btn-suggest-price-${i}`}><Sparkles className="w-2.5 h-2.5" /> Suggéré: {p.suggestedPrice?.toFixed(2)} DH</button>}
                              </TableCell>
                              <TableCell className="text-center py-2"><div className="text-amber-300 text-xs font-semibold">{p.rowCount} cmd</div>{p.totalQty !== p.rowCount && <div className="text-[10px] text-slate-400">{p.totalQty} u</div>}</TableCell>
                              <TableCell className="text-center text-emerald-300 text-xs py-2">{fmtMAD(p.totalRevenue)}</TableCell>
                              <TableCell className="text-center py-2">
                                <Input value={p.buyingCost} onChange={e => updateProduct(i, "buyingCost", e.target.value)} type="number" min="0" placeholder="ex: 45"
                                  className={`h-7 w-24 text-xs bg-white/5 text-white mx-auto ${stockAutoFilled[p.name] ? "border-emerald-500/50" : "border-white/20"}`}
                                  data-testid={`input-buying-cost-${i}`} />
                                {stockAutoFilled[p.name] && (
                                  <div className="text-[9px] text-emerald-400 mt-0.5 text-center font-semibold" data-testid={`badge-auto-stock-${i}`}>auto (stock)</div>
                                )}
                                {!stockAutoFilled[p.name] && !p.buyingCost && stockProducts.length > 0 && (
                                  <div className="text-[9px] text-slate-500 mt-0.5 text-center" data-testid={`hint-not-in-stock-${i}`}>non trouvé dans le stock</div>
                                )}
                              </TableCell>
                              <TableCell className="text-center py-2"><Input value={p.packagingCost} onChange={e => updateProduct(i, "packagingCost", e.target.value)} type="number" min="0" placeholder="ex: 5" className="h-7 w-24 text-xs bg-white/5 border-white/20 text-white mx-auto" data-testid={`input-packaging-cost-${i}`} /></TableCell>
                              <TableCell className="text-center py-2"><Input value={p.confirmationFee} onChange={e => updateProduct(i, "confirmationFee", e.target.value)} type="number" min="0" placeholder="ex: 8" className="h-7 w-24 text-xs bg-white/5 border-white/20 text-white mx-auto" data-testid={`input-confirm-fee-${i}`} /></TableCell>
                              <TableCell className="text-center py-2">
                                <Input value={p.adSpend} onChange={e => updateProduct(i, "adSpend", e.target.value)} type="number" min="0" placeholder="0" className={`h-7 w-24 text-xs bg-white/5 text-white mx-auto ${parseFloat(p.adSpend || '0') > 0 ? "border-purple-500/40" : "border-white/20"}`} data-testid={`input-ad-spend-${i}`} />
                                {parseFloat(p.adSpend || '0') > 0 && adCampaigns.length > 0 && <div className="text-[9px] text-purple-400 mt-0.5 text-center">pub importée</div>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={calculate} className="gap-2 font-bold px-8 text-sm" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }} data-testid="button-calculate">
                    <BarChart3 className="w-4 h-4" /> Calculer le profit
                  </Button>
                </div>
              </div>
            )}

            {/* ══ STEP 3 ══ */}
            {step === 3 && results.length > 0 && (
              <div className="space-y-5">
                {(() => {
                  const totalUnits = results.reduce((s, r) => s + r.qty, 0);
                  const uniqueProds = results.length;
                  return (
                    <div className="rounded-xl border flex flex-col sm:flex-row items-center gap-4 sm:gap-8 px-6 py-4" style={{ background: `linear-gradient(135deg, ${GOLD}12 0%, rgba(255,255,255,0.03) 100%)`, borderColor: `${GOLD}35` }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${GOLD}20` }}><Package className="w-5 h-5" style={{ color: GOLD }} /></div>
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Total unités vendues (Livrée)</p><p className="text-3xl font-extrabold leading-none" style={{ color: GOLD }}>{totalUnits.toLocaleString()}</p></div>
                      </div>
                      <div className="hidden sm:block w-px h-10 bg-white/10" />
                      <div className="flex items-center gap-6 text-center">
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest">Produits uniques</p><p className="text-xl font-bold text-white">{uniqueProds}</p></div>
                        <div><p className="text-[10px] text-slate-500 uppercase tracking-widest">Moy. unités / produit</p><p className="text-xl font-bold text-white">{uniqueProds > 0 ? (totalUnits / uniqueProds).toFixed(1) : "—"}</p></div>
                      </div>
                      <div className="sm:ml-auto text-center sm:text-right">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Formule appliquée</p>
                        <p className="text-[11px] text-slate-300 mt-0.5 font-mono">Bénéf. = CA Brut − Livr. − (Achat × u) − (Emball. × cmd) − (Conf. × cmd) − Pub</p>
                      </div>
                    </div>
                  );
                })()}

                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <KpiCard label="CA Brut (Price)" value={fmtMAD(totalCaBrut)} sub={`${results.reduce((s, r) => s + r.qty, 0)} unités livrées`} color="#10b981" icon={<DollarSign className="w-5 h-5" />} />
                  <KpiCard label="Frais livr. (fichier)" value={fmtMAD(totalShipFile)} sub="Déduit automatiquement" color="#f59e0b" icon={<Truck className="w-5 h-5" />} />
                  <KpiCard label="CA Net" value={fmtMAD(totalCaNet)} sub="Prix − Frais livr." color="#06b6d4" icon={<TrendingUp className="w-5 h-5" />} />
                  <KpiCard label="Bénéfice net" value={fmtMAD(totalNet)} sub={totalNet >= 0 ? "En bénéfice" : "En déficit"} color={totalNet >= 0 ? "#10b981" : "#ef4444"} icon={<Target className="w-5 h-5" />} />
                  <KpiCard label="ROI Global" value={`${globalROI.toFixed(1)}%`} sub="vs coût sourcing" color={globalROI >= 30 ? "#10b981" : globalROI >= 0 ? "#f59e0b" : "#ef4444"} icon={<BarChart3 className="w-5 h-5" />} />
                </div>

                {/* Per-product table */}
                <Card className="border-white/10 bg-white/5 text-white overflow-hidden">
                  <CardHeader className="pb-2 pt-4"><CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}><Package className="w-3.5 h-3.5" /> Détail par produit</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            {[
                              { label: "Produit", sub: "", cls: "" },
                              { label: "Total Unités", sub: "", cls: "text-center" },
                              { label: "CA Brut", sub: "price total", cls: "text-right text-emerald-400/80" },
                              { label: "Frais Livr.", sub: "du fichier", cls: "text-right text-amber-400/70" },
                              { label: "CA Net", sub: "brut − livr.", cls: "text-right text-cyan-400/80" },
                              { label: "Sourcing Total", sub: "achat × unités", cls: "text-right" },
                              { label: "Emballage Total", sub: "emball. × cmd", cls: "text-right text-pink-400/80" },
                              { label: "Commissions", sub: "confirm. × cmd", cls: "text-right" },
                              { label: "Pub", sub: "", cls: "text-right" },
                              { label: "Bénéfice Net", sub: "", cls: "text-right" },
                              { label: "ROI", sub: "", cls: "text-right" },
                            ].map(({ label, sub, cls }) => (
                              <TableHead key={label} className={`text-slate-500 text-xs font-semibold whitespace-nowrap ${cls}`}>
                                {label}{sub && <><br/><span className="text-[9px] text-slate-600 font-normal normal-case">{sub}</span></>}
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
                                <TableCell className="text-white font-semibold text-sm py-3 whitespace-normal break-words">{r.name}</TableCell>
                                <TableCell className="text-center py-3"><Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/8 text-xs">{r.qty}</Badge></TableCell>
                                <TableCell className="text-right text-emerald-300 font-semibold text-sm py-3">{fmtMAD(r.caBrut)}</TableCell>
                                <TableCell className="text-right text-red-400 text-sm py-3">−{fmtMAD(r.shippingFromFile)}</TableCell>
                                <TableCell className="text-right text-cyan-300 font-semibold text-sm py-3">{fmtMAD(r.caNet)}</TableCell>
                                <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtMAD(r.cogs)}</TableCell>
                                <TableCell className="text-right text-pink-300 text-sm py-3">−{fmtMAD(r.packaging)}</TableCell>
                                <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtMAD(r.confirmation)}</TableCell>
                                <TableCell className="text-right text-slate-300 text-sm py-3">−{fmtMAD(r.adSpend)}</TableCell>
                                <TableCell className={`text-right text-sm py-3 ${profCls}`}>{fmtMAD(r.netProfit)}</TableCell>
                                <TableCell className={`text-right font-bold text-sm py-3 ${roiCls}`}>{r.roi.toFixed(1)}%</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="border-t-2 border-white/20 bg-white/5">
                            <TableCell className="text-white font-extrabold text-sm py-3" colSpan={2}>TOTAL</TableCell>
                            <TableCell className="text-right text-emerald-300 font-bold text-sm py-3">{fmtMAD(totalCaBrut)}</TableCell>
                            <TableCell className="text-right text-red-400 font-bold text-sm py-3">−{fmtMAD(totalShipFile)}</TableCell>
                            <TableCell className="text-right text-cyan-300 font-bold text-sm py-3">{fmtMAD(totalCaNet)}</TableCell>
                            <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtMAD(totalCOGS)}</TableCell>
                            <TableCell className="text-right text-pink-300 font-bold text-sm py-3">−{fmtMAD(totalPackaging)}</TableCell>
                            <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtMAD(totalConfirm)}</TableCell>
                            <TableCell className="text-right text-slate-300 font-bold text-sm py-3">−{fmtMAD(totalAd)}</TableCell>
                            <TableCell className={`text-right font-extrabold text-sm py-3 ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMAD(totalNet)}</TableCell>
                            <TableCell className="text-right text-slate-400 text-sm py-3">{globalROI.toFixed(1)}%</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  <Card className="border-white/10 bg-white/5 text-white col-span-1 lg:col-span-3">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>CA Brut · CA Net · Bénéfice par produit</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                          <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                          <RechartsTooltip contentStyle={{ background: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11 }} formatter={(val: number) => fmtMAD(val)} />
                          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                          <Bar dataKey="CA Brut" fill="#10b981" radius={[3,3,0,0]} />
                          <Bar dataKey="CA Net"  fill="#06b6d4" radius={[3,3,0,0]} />
                          <Bar dataKey="Profit"  fill={GOLD}    radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="border-white/10 bg-white/5 text-white col-span-1 lg:col-span-2">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>Répartition des coûts</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="43%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                            {pieData.map((e, idx) => <Cell key={idx} fill={e.color} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ background: NAVY_MID, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 11 }} formatter={(val: number) => fmtMAD(val)} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Cost breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Sourcing", val: totalCOGS, color: "#3b82f6" },
                    { label: "Livraison (fichier)", val: totalShipFile, color: "#f59e0b" },
                    { label: "Emballage", val: totalPackaging, color: "#ec4899" },
                    { label: "Confirmation", val: totalConfirm, color: "#06b6d4" },
                    { label: "Publicité", val: totalAd, color: "#8b5cf6" },
                  ].map(item => {
                    const pct = totalCost > 0 ? (item.val / totalCost) * 100 : 0;
                    return (
                      <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                        <div className="flex items-center justify-between"><span className="text-[11px] text-slate-400 font-semibold leading-tight">{item.label}</span><span className="text-xs font-bold shrink-0 ml-1" style={{ color: item.color }}>{pct.toFixed(1)}%</span></div>
                        <p className="text-base font-extrabold text-white">{fmtMAD(item.val)}</p>
                        <div className="w-full bg-white/10 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: item.color }} /></div>
                      </div>
                    );
                  })}
                </div>

                {/* Save report */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}><Save className="w-3.5 h-3.5 inline mr-1.5" />{currentReportId ? 'Modifier le rapport' : 'Enregistrer le rapport'}</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide">Mois</label>
                      <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} data-testid="input-report-month" className="rounded-lg border border-gray-300 bg-white text-gray-900 text-sm px-3 py-1.5 focus:outline-none focus:border-amber-500 [color-scheme:light]" />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide">Titre (optionnel)</label>
                      <Input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder={`Rapport ${reportMonth}…`} data-testid="input-report-title" className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-amber-500" />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={saveReport} disabled={savingReport} data-testid="button-save-report" className="gap-2 font-bold text-sm" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }}>
                        {savingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {currentReportId ? 'Mettre à jour' : 'Enregistrer'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* Upgrade dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="border-white/10 bg-slate-900 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: GOLD }}><Crown className="w-5 h-5" /> Fonctionnalité Premium</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm mt-2">L'import CSV est disponible dans les plans Pro et supérieurs.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 border-white/20 text-slate-300" onClick={() => setUpgradeOpen(false)}>Annuler</Button>
            <Button className="flex-1 font-bold" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }} onClick={() => setUpgradeOpen(false)}><Zap className="w-4 h-4 mr-1" /> Voir les plans</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

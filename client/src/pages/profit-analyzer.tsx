import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Upload, FileSpreadsheet, CheckCircle2, ChevronRight, RotateCcw,
  TrendingUp, Package, Truck, Megaphone, DollarSign, Target,
  AlertCircle, Sparkles, ArrowRight, BarChart3, Globe, Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";
const NAVY_MID = "#1A2F4E";

/* ─── Types ─────────────────────────────────────────── */
interface ParsedRow {
  productName: string;
  quantity: number;
  codAmount: number;
  status?: string;
}

interface ProductSummary {
  name: string;
  totalQty: number;
  totalRevenue: number;
  buyingCost: string;
  shippingFee: string;
  adSpend: string;
  suggestedPrice?: number;
}

interface ParseResult {
  rows: ParsedRow[];
  products: ProductSummary[];
  rawHeaders: string[];
  detectedColumns: { product: string; qty: string; cod: string; status: string };
  sheetNames: string[];
  totalRows: number;
}

interface ProfitResult {
  name: string;
  qty: number;
  revenue: number;
  cogs: number;
  shipping: number;
  adSpend: number;
  totalCost: number;
  netProfit: number;
  roi: number;
}

/* ─── Column detection ───────────────────────────────── */
function detectColumn(headers: string[], keywords: string[]): string {
  const h = headers.map(h => String(h).toLowerCase().trim());
  for (const kw of keywords) {
    const idx = h.findIndex(c => c.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

function parseNumeric(val: any): number {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ─── Step Indicator ─────────────────────────────────── */
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Import fichier" },
    { n: 2, label: "Saisie des coûts" },
    { n: 3, label: "Rapport final" },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                current > s.n
                  ? "border-amber-500 bg-amber-500 text-white"
                  : current === s.n
                  ? "border-amber-400 bg-amber-400 text-slate-900"
                  : "border-slate-600 bg-slate-800/60 text-slate-400"
              }`}
            >
              {current > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
              current === s.n ? "text-amber-400" : current > s.n ? "text-amber-500/70" : "text-slate-500"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-16 h-0.5 mb-4 mx-1 ${current > s.n ? "bg-amber-500" : "bg-slate-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────── */
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4 border border-white/10 bg-white/5 backdrop-blur-sm flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0`} style={{ background: `${color}22` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
        <p className="text-xl font-extrabold text-white leading-none mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────── */
export default function ProfitAnalyzer() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [adMode, setAdMode] = useState<"global" | "specific">("global");
  const [globalAdSpend, setGlobalAdSpend] = useState("0");
  const [colMap, setColMap] = useState({ product: "", qty: "", cod: "", status: "" });
  const [results, setResults] = useState<ProfitResult[]>([]);
  const [fileName, setFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /* fetch product selling prices as suggestions */
  const { data: inventoryStats } = useQuery<any>({
    queryKey: ["/api/inventory/stats"],
    retry: false,
  });
  const priceMap = Object.fromEntries(
    (inventoryStats?.productStats || []).map((p: any) => [
      p.name.toLowerCase().trim(),
      p.sellingPrice,
    ])
  );

  /* ── Parse file ── */
  async function processFile(file: File) {
    setIsLoading(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

      if (rawRows.length < 2) {
        toast({ title: "Fichier vide", description: "Le fichier ne contient pas assez de données.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const headers: string[] = rawRows[0].map((h: any) => String(h).trim());
      const dataRows = rawRows.slice(1);

      /* Auto-detect columns */
      const detected = {
        product: detectColumn(headers, ["produit", "product", "article", "désignation", "designation", "nom", "libellé", "libelle", "description"]),
        qty:     detectColumn(headers, ["quantit", "qty", "qte", "qté", "nbre", "nombre", "unités", "units"]),
        cod:     detectColumn(headers, ["cod", "montant", "prix", "total", "valeur", "revenue", "ca", "chiffre", "tarif", "amount"]),
        status:  detectColumn(headers, ["statut", "status", "état", "etat", "livré", "livre"]),
      };
      setColMap(detected);

      buildProducts(dataRows, headers, detected, wb.SheetNames);
    } catch (e: any) {
      toast({ title: "Erreur de lecture", description: e?.message || "Impossible de lire ce fichier.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  function buildProducts(
    dataRows: any[][],
    headers: string[],
    map: typeof colMap,
    sheetNames: string[]
  ) {
    const pIdx = headers.indexOf(map.product);
    const qIdx = headers.indexOf(map.qty);
    const cIdx = headers.indexOf(map.cod);
    const sIdx = map.status ? headers.indexOf(map.status) : -1;

    const parsedRows: ParsedRow[] = [];
    dataRows.forEach(row => {
      if (!row[pIdx]) return;
      const statusVal = sIdx >= 0 ? String(row[sIdx] || "").toLowerCase() : "";
      parsedRows.push({
        productName: String(row[pIdx] || "").trim(),
        quantity: pIdx >= 0 ? parseNumeric(row[qIdx]) || 1 : 1,
        codAmount: cIdx >= 0 ? parseNumeric(row[cIdx]) : 0,
        status: statusVal,
      });
    });

    /* Group by product name */
    const map2: Record<string, { qty: number; rev: number }> = {};
    parsedRows.forEach(r => {
      const key = r.productName.toLowerCase().trim();
      if (!map2[key]) map2[key] = { qty: 0, rev: 0 };
      map2[key].qty += r.quantity || 1;
      map2[key].rev += r.codAmount;
    });

    const summaries: ProductSummary[] = Object.entries(map2).map(([key, d]) => {
      const rawName = parsedRows.find(r => r.productName.toLowerCase().trim() === key)?.productName || key;
      const suggested = priceMap[key] ?? priceMap[rawName.toLowerCase()] ?? 0;
      return {
        name: rawName,
        totalQty: d.qty,
        totalRevenue: d.rev,
        buyingCost: "",
        shippingFee: "40",
        adSpend: "0",
        suggestedPrice: suggested > 0 ? suggested / 100 : undefined,
      };
    });

    setParseResult({
      rows: parsedRows,
      products: summaries,
      rawHeaders: headers,
      detectedColumns: map,
      sheetNames,
      totalRows: parsedRows.length,
    });
    setProducts(summaries);
    setStep(1); /* stay on step 1 to show summary */
  }

  /* ── Drag & drop handlers ── */
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [priceMap]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  /* ── Re-map columns when user changes dropdown ── */
  function remapCol(field: keyof typeof colMap, val: string) {
    if (!parseResult) return;
    const newMap = { ...colMap, [field]: val };
    setColMap(newMap);
    const XLSX_sync = { read: null as any };
    /* Re-derive from cached raw rows — re-read headers and rebuild */
    const headers = parseResult.rawHeaders;
    const pIdx = headers.indexOf(newMap.product);
    const qIdx = headers.indexOf(newMap.qty);
    const cIdx = headers.indexOf(newMap.cod);
    const sIdx = newMap.status ? headers.indexOf(newMap.status) : -1;

    /* We already have parsed rows — re-group with new indices only if indices are valid */
    const map2: Record<string, { qty: number; rev: number }> = {};
    parseResult.rows.forEach(r => {
      const key = r.productName.toLowerCase().trim();
      if (!map2[key]) map2[key] = { qty: 0, rev: 0 };
      map2[key].qty += r.quantity || 1;
      map2[key].rev += r.codAmount;
    });
    /* Overwrite product/rev with remapped values would require re-reading raw data —
       for now just update column map and let user know to re-upload if wrong */
    setParseResult({ ...parseResult, detectedColumns: newMap });
  }

  /* ── Update a product cost field ── */
  function updateProduct(idx: number, field: keyof ProductSummary, val: string) {
    setProducts(prev => {
      const next = [...prev];
      (next[idx] as any)[field] = val;
      return next;
    });
  }

  function n(v: string) {
    const x = parseFloat(v);
    return isNaN(x) ? 0 : x;
  }

  /* ── Calculate profit ── */
  function calculate() {
    const missing = products.filter(p => p.buyingCost === "" || p.buyingCost === "0");
    if (missing.length > 0) {
      toast({ title: "Coûts manquants", description: `Entrez le prix d'achat pour : ${missing.map(m => m.name).join(", ")}`, variant: "destructive" });
      return;
    }

    const totalAdGlobal = adMode === "global" ? n(globalAdSpend) : 0;
    const totalRevenue = products.reduce((s, p) => s + p.totalRevenue, 0);

    const res: ProfitResult[] = products.map((p, i) => {
      const rev = p.totalRevenue;
      const qty = p.totalQty;
      const cogs = n(p.buyingCost) * qty;
      const ship = n(p.shippingFee) * qty;
      const adS = adMode === "specific"
        ? n(p.adSpend)
        : totalRevenue > 0 ? totalAdGlobal * (rev / totalRevenue) : totalAdGlobal / products.length;
      const totalCost = cogs + ship + adS;
      const net = rev - totalCost;
      const roi = cogs > 0 ? (net / cogs) * 100 : 0;
      return { name: p.name, qty, revenue: rev, cogs, shipping: ship, adSpend: adS, totalCost, netProfit: net, roi };
    });

    setResults(res);
    setStep(3);
  }

  function reset() {
    setStep(1);
    setParseResult(null);
    setProducts([]);
    setResults([]);
    setFileName("");
    setGlobalAdSpend("0");
    setAdMode("global");
    if (fileRef.current) fileRef.current.value = "";
  }

  function fmtDH(v: number) {
    return `${v.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
  }

  /* ── Charts data ── */
  const barData = results.map(r => ({
    name: r.name.length > 16 ? r.name.slice(0, 16) + "…" : r.name,
    Revenu: Math.round(r.revenue),
    Coûts:  Math.round(r.totalCost),
    Profit: Math.round(r.netProfit),
  }));

  const totalRev = results.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = results.reduce((s, r) => s + r.totalCost, 0);
  const totalNet = results.reduce((s, r) => s + r.netProfit, 0);
  const totalCOGS = results.reduce((s, r) => s + r.cogs, 0);
  const totalShip = results.reduce((s, r) => s + r.shipping, 0);
  const totalAd = results.reduce((s, r) => s + r.adSpend, 0);
  const globalROI = totalCOGS > 0 ? (totalNet / totalCOGS) * 100 : 0;

  const pieData = [
    { name: "Achat produit", value: Math.round(totalCOGS), color: "#3b82f6" },
    { name: "Livraison", value: Math.round(totalShip), color: "#f59e0b" },
    { name: "Publicité", value: Math.round(totalAd), color: "#8b5cf6" },
    { name: "Profit net", value: Math.max(0, Math.round(totalNet)), color: "#10b981" },
  ].filter(d => d.value > 0);

  /* ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #152645 60%, #1e3560 100%)` }}>
      {/* ── Header ── */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}44` }}>
              <BarChart3 className="w-5 h-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Profit Analyzer Pro</h1>
              <p className="text-xs text-slate-400">Importez votre fichier transporteur · Calculez votre bénéfice net en 3 étapes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator current={step} />
            {parseResult && (
              <button onClick={reset} className="ml-4 text-slate-400 hover:text-white flex items-center gap-1.5 text-xs font-medium transition-colors" data-testid="button-reset-analyzer">
                <RotateCcw className="w-3.5 h-3.5" /> Recommencer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ══════════════════════════════════════════════
            STEP 1 — File import
        ══════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Drop zone */}
            <div
              data-testid="dropzone-file-upload"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center py-14 gap-4 ${
                isDragging ? "border-amber-400 bg-amber-400/10" : "border-slate-600 hover:border-amber-500/60 bg-white/3"
              }`}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} data-testid="input-file-upload" />
              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-slate-300 font-medium">Analyse en cours…</p>
                </div>
              ) : parseResult ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <p className="text-white font-semibold text-lg">{fileName}</p>
                  <p className="text-slate-400 text-sm">{parseResult.totalRows} lignes · {parseResult.products.length} produit(s) trouvé(s)</p>
                  <p className="text-amber-400 text-xs mt-1">Cliquez pour changer de fichier</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
                    <Upload className="w-8 h-8" style={{ color: GOLD }} />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Glissez votre fichier ici</p>
                    <p className="text-slate-400 text-sm mt-1">ou cliquez pour sélectionner</p>
                    <p className="text-slate-500 text-xs mt-2">Formats supportés : <span className="text-amber-400 font-mono">XLSX · XLS · CSV</span></p>
                  </div>
                </>
              )}
            </div>

            {/* Column mapping */}
            {parseResult && (
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: GOLD }}>
                    <Settings2 className="w-4 h-4" /> Mappage des colonnes
                  </CardTitle>
                  <p className="text-xs text-slate-400">Vérifiez que chaque champ pointe vers la bonne colonne de votre fichier.</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(["product", "qty", "cod", "status"] as const).map(field => (
                      <div key={field} className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {field === "product" ? "Produit" : field === "qty" ? "Quantité" : field === "cod" ? "Montant COD" : "Statut"}
                        </label>
                        <Select value={colMap[field] || "__none__"} onValueChange={v => setColMap(c => ({ ...c, [field]: v === "__none__" ? "" : v }))}>
                          <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white" data-testid={`select-col-${field}`}>
                            <SelectValue placeholder="(aucune)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">(aucune)</SelectItem>
                            {parseResult.rawHeaders.map(h => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {colMap[field] && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Détecté
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Products found */}
            {parseResult && parseResult.products.length > 0 && (
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: GOLD }}>
                      <Package className="w-4 h-4" /> Produits détectés — {parseResult.products.length}
                    </CardTitle>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
                      {parseResult.totalRows} lignes analysées
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs">Produit</TableHead>
                          <TableHead className="text-slate-400 text-xs text-center">Quantité</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Revenu Total (COD)</TableHead>
                          <TableHead className="text-slate-400 text-xs text-center">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseResult.products.map((p, i) => (
                          <TableRow key={i} className="border-white/10 hover:bg-white/5" data-testid={`row-parsed-product-${i}`}>
                            <TableCell className="text-white font-medium text-sm">{p.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10">{p.totalQty}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-emerald-300 font-semibold text-sm">{fmtDH(p.totalRevenue)}</TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">LIVRÉ</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {parseResult && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  className="gap-2 font-bold px-6"
                  style={{ background: GOLD, color: NAVY }}
                  data-testid="button-next-step-2"
                >
                  Saisir les coûts <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 2 — Cost inputs
        ══════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Ad spend mode toggle */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white">
              <CardContent className="py-4">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="text-sm font-bold text-white">Mode dépenses pub :</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAdMode("global")}
                      data-testid="button-ad-mode-global"
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                        adMode === "global"
                          ? "border-amber-400 text-amber-400 bg-amber-400/10"
                          : "border-white/20 text-slate-400 hover:border-white/40"
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> Total global
                    </button>
                    <button
                      onClick={() => setAdMode("specific")}
                      data-testid="button-ad-mode-specific"
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                        adMode === "specific"
                          ? "border-amber-400 text-amber-400 bg-amber-400/10"
                          : "border-white/20 text-slate-400 hover:border-white/40"
                      }`}
                    >
                      <Target className="w-3.5 h-3.5" /> Par produit
                    </button>
                  </div>
                  {adMode === "global" && (
                    <div className="flex items-center gap-2 ml-auto">
                      <Label className="text-xs text-slate-400 whitespace-nowrap">Dépenses pub totales (DH)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          value={globalAdSpend}
                          onChange={e => setGlobalAdSpend(e.target.value)}
                          className="w-36 h-9 text-sm bg-white/10 border-white/20 text-white"
                          placeholder="0"
                          data-testid="input-global-ad-spend"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Per-product cost table */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: GOLD }}>
                  <Package className="w-4 h-4" /> Coûts par produit
                </CardTitle>
                <p className="text-xs text-slate-400">Remplissez les coûts pour chaque produit. Les prix suggérés viennent de votre inventaire.</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs min-w-[200px]">Produit</TableHead>
                        <TableHead className="text-slate-400 text-xs text-center">Qté</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Revenu</TableHead>
                        <TableHead className="text-slate-400 text-xs text-center min-w-[160px]">
                          Prix d'achat (DH) <span className="text-red-400">*</span>
                        </TableHead>
                        <TableHead className="text-slate-400 text-xs text-center min-w-[130px]">Frais livraison (DH)</TableHead>
                        {adMode === "specific" && (
                          <TableHead className="text-slate-400 text-xs text-center min-w-[130px]">Dép. pub (DH)</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p, i) => (
                        <TableRow key={i} className="border-white/10 hover:bg-white/5" data-testid={`row-cost-product-${i}`}>
                          <TableCell>
                            <div>
                              <p className="text-white font-semibold text-sm">{p.name}</p>
                              {p.suggestedPrice != null && (
                                <button
                                  onClick={() => updateProduct(i, "buyingCost", String(p.suggestedPrice))}
                                  className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors flex items-center gap-0.5 mt-0.5"
                                  data-testid={`button-suggest-price-${i}`}
                                >
                                  <Sparkles className="w-2.5 h-2.5" /> Prix inventaire : {p.suggestedPrice} DH
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10">{p.totalQty}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-emerald-300 font-semibold text-sm">{fmtDH(p.totalRevenue)}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              value={p.buyingCost}
                              onChange={e => updateProduct(i, "buyingCost", e.target.value)}
                              className="h-8 text-xs text-center bg-white/10 border-white/20 text-white w-full max-w-[130px] mx-auto"
                              placeholder="Ex: 85"
                              data-testid={`input-buying-cost-${i}`}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              value={p.shippingFee}
                              onChange={e => updateProduct(i, "shippingFee", e.target.value)}
                              className="h-8 text-xs text-center bg-white/10 border-white/20 text-white w-full max-w-[110px] mx-auto"
                              placeholder="40"
                              data-testid={`input-shipping-fee-${i}`}
                            />
                          </TableCell>
                          {adMode === "specific" && (
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min={0}
                                value={p.adSpend}
                                onChange={e => updateProduct(i, "adSpend", e.target.value)}
                                className="h-8 text-xs text-center bg-white/10 border-white/20 text-white w-full max-w-[110px] mx-auto"
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
              <Button variant="outline" onClick={() => setStep(1)} className="border-white/20 text-slate-300 hover:bg-white/10 hover:text-white gap-2" data-testid="button-back-step-1">
                ← Retour
              </Button>
              <Button
                onClick={calculate}
                className="gap-2 font-bold px-8 py-2.5 text-base"
                style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b96a 100%)`, color: NAVY }}
                data-testid="button-calculate"
              >
                <BarChart3 className="w-5 h-5" /> Calculer le profit
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 3 — Report
        ══════════════════════════════════════════════ */}
        {step === 3 && results.length > 0 && (
          <div className="space-y-6">
            {/* Global KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Revenu total"
                value={fmtDH(totalRev)}
                sub={`${results.reduce((s, r) => s + r.qty, 0)} unités livrées`}
                color="#10b981"
                icon={<DollarSign className="w-5 h-5" />}
              />
              <StatCard
                label="Coûts totaux"
                value={fmtDH(totalCosts)}
                sub={`Achat + livr. + pub`}
                color="#f59e0b"
                icon={<Truck className="w-5 h-5" />}
              />
              <StatCard
                label="Bénéfice net"
                value={fmtDH(totalNet)}
                sub={totalNet >= 0 ? "💚 Positif !" : "🔴 Déficit"}
                color={totalNet >= 0 ? "#10b981" : "#ef4444"}
                icon={<TrendingUp className="w-5 h-5" />}
              />
              <StatCard
                label="ROI Global"
                value={`${globalROI.toFixed(1)}%`}
                sub="vs coût d'achat"
                color={globalROI >= 30 ? "#10b981" : globalROI >= 0 ? "#f59e0b" : "#ef4444"}
                icon={<Target className="w-5 h-5" />}
              />
            </div>

            {/* Per-product breakdown table */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: GOLD }}>
                  <Package className="w-4 h-4" /> Détail par produit
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Produit</TableHead>
                        <TableHead className="text-slate-400 text-xs text-center">Qté</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Revenu</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Coût achat</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Livraison</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Pub</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">Profit net</TableHead>
                        <TableHead className="text-slate-400 text-xs text-right">ROI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r, i) => {
                        const roiColor = r.roi >= 50 ? "text-emerald-400" : r.roi >= 20 ? "text-amber-400" : "text-red-400";
                        const profitColor = r.netProfit >= 0 ? "text-emerald-400" : "text-red-400";
                        return (
                          <TableRow key={i} className="border-white/10 hover:bg-white/5" data-testid={`row-result-${i}`}>
                            <TableCell className="text-white font-medium text-sm">{r.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10">{r.qty}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-emerald-300 font-semibold text-sm">{fmtDH(r.revenue)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm">{fmtDH(r.cogs)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm">{fmtDH(r.shipping)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-sm">{fmtDH(r.adSpend)}</TableCell>
                            <TableCell className={`text-right font-extrabold text-sm ${profitColor}`}>{fmtDH(r.netProfit)}</TableCell>
                            <TableCell className={`text-right font-bold text-sm ${roiColor}`}>{r.roi.toFixed(1)}%</TableCell>
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
              {/* Bar chart */}
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white col-span-1 lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>Revenu vs Coûts vs Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        contentStyle={{ background: NAVY_MID, border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8, color: "#fff", fontSize: 12 }}
                        formatter={(val: number) => fmtDH(val)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      <Bar dataKey="Revenu" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Coûts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Profit" fill={GOLD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Pie chart */}
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white col-span-1 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>Répartition des coûts</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%" cy="45%"
                        innerRadius={55}
                        outerRadius={90}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ background: NAVY_MID, border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8, color: "#fff", fontSize: 12 }}
                        formatter={(val: number) => fmtDH(val)}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Cost breakdown summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Coût d'achat total", val: totalCOGS, color: "#3b82f6", pct: totalCosts > 0 ? (totalCOGS / totalCosts * 100) : 0 },
                { label: "Frais de livraison", val: totalShip, color: "#f59e0b", pct: totalCosts > 0 ? (totalShip / totalCosts * 100) : 0 },
                { label: "Dépenses pub", val: totalAd, color: "#8b5cf6", pct: totalCosts > 0 ? (totalAd / totalCosts * 100) : 0 },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-semibold">{item.label}</span>
                    <span className="text-xs font-bold" style={{ color: item.color }}>{item.pct.toFixed(1)}%</span>
                  </div>
                  <p className="text-lg font-extrabold text-white">{fmtDH(item.val)}</p>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(item.pct, 100)}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="border-white/20 text-slate-300 hover:bg-white/10 hover:text-white gap-2" data-testid="button-back-step-2">
                ← Modifier les coûts
              </Button>
              <Button onClick={reset} variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 gap-2" data-testid="button-new-analysis">
                <RotateCcw className="w-4 h-4" /> Nouvelle analyse
              </Button>
            </div>
          </div>
        )}

        {/* Empty state — no file yet */}
        {step === 1 && !parseResult && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: <FileSpreadsheet className="w-6 h-6" />, title: "Import intelligent", desc: "Détection automatique des colonnes Produit, Quantité et Montant COD." },
              { icon: <Settings2 className="w-6 h-6" />, title: "Coûts flexibles", desc: "Frais d'achat, livraison et pub par produit ou global en un clic." },
              { icon: <BarChart3 className="w-6 h-6" />, title: "Rapport visuel", desc: "Profit net, ROI et graphiques par produit générés instantanément." },
            ].map((card, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}15`, color: GOLD }}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{card.title}</p>
                  <p className="text-slate-400 text-xs mt-1">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

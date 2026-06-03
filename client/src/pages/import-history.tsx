import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  CloudUpload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X,
  ArrowRight, ArrowLeft, History, PackageCheck, Store,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Platform fields we can map source columns to ──────────────── */
const FIELDS: { key: string; label: string; optional?: boolean }[] = [
  { key: "customerName", label: "Nom du client" },
  { key: "customerPhone", label: "Téléphone" },
  { key: "customerAddress", label: "Adresse", optional: true },
  { key: "customerCity", label: "Ville", optional: true },
  { key: "productName", label: "Produit", optional: true },
  { key: "price", label: "Prix (DH)", optional: true },
  { key: "quantity", label: "Quantité", optional: true },
  { key: "status", label: "Statut", optional: true },
  { key: "trackingNumber", label: "N° de suivi (tracking)", optional: true },
  { key: "carrierProvider", label: "Transporteur", optional: true },
  { key: "createdAt", label: "Date de création", optional: true },
  { key: "notes", label: "Notes / Commentaire", optional: true },
];

/* ── Accent-insensitive auto-suggest aliases ───────────────────── */
const ALIASES: Record<string, string[]> = {
  customerName: ["nom", "name", "client", "destinataire", "full name", "fullname", "recipient", "customer", "nom client", "nom du client"],
  customerPhone: ["telephone", "phone", "tel", "gsm", "mobile", "numero", "tlf", "whatsapp", "contact"],
  customerAddress: ["adresse", "address", "rue", "addr"],
  customerCity: ["ville", "city", "town", "localite"],
  productName: ["produit", "product", "nom du produit", "article", "item", "designation"],
  price: ["prix", "price", "montant", "amount", "total", "tarif", "prix total"],
  quantity: ["qty", "quantite", "quantity", "qnt", "qte", "nombre"],
  status: ["statut", "status", "etat", "state"],
  trackingNumber: ["tracking", "tracking number", "code", "code colis", "package id", "tracking-number", "suivi", "numero de suivi"],
  carrierProvider: ["transporteur", "carrier", "societe livraison", "societe de livraison", "livraison", "delivery"],
  createdAt: ["date", "created", "date creation", "date de creation", "date commande", "order date"],
  notes: ["note", "notes", "remarque", "remarques", "commentaire", "comment", "message"],
};

const PLATFORM_STATUSES = [
  { value: "nouveau", label: "Nouveau" },
  { value: "confirme", label: "Confirmé" },
  { value: "rappel", label: "Rappel" },
  { value: "Pas de réponse 1", label: "Pas de réponse" },
  { value: "Injoignable", label: "Injoignable" },
  { value: "Annulé (fake)", label: "Annulé" },
  { value: "Attente De Ramassage", label: "Attente Ramassage" },
  { value: "expédié", label: "Expédié" },
  { value: "in_progress", label: "En cours de livraison" },
  { value: "delivered", label: "Livré" },
  { value: "refused", label: "Refusé" },
  { value: "retourné", label: "Retourné" },
];

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* Client-side mirror of the backend status normalizer (for preview only) */
function previewMapStatus(raw: string, fallback: string): string {
  const s = stripAccents(raw || "");
  if (!s) return fallback;
  const has = (...v: string[]) => v.some((x) => s === x || s.includes(x));
  if (has("retour", "return", "rendu", "renvoye")) return "retourné";
  if (has("refuse", "refused", "rejected")) return "refused";
  if (has("annule", "cancel", "canceled", "fake", "faux")) return "Annulé (fake)";
  if (has("livre", "delivered", "completed", "done", "termine", "recu", "recue")) return "delivered";
  if (has("ramassage", "pickup")) return "Attente De Ramassage";
  if (has("expedie", "shipped", "transit", "out for delivery", "sorti pour livraison")) return "expédié";
  if (has("en cours", "in progress", "in_progress")) return "in_progress";
  if (has("pas de reponse", "no answer", "nrp", "injoignable", "unreachable")) return "Pas de réponse 1";
  if (has("rappel", "callback", "recall")) return "rappel";
  if (has("confirme", "confirmed", "ok", "valide", "oui", "yes")) return "confirme";
  if (has("nouveau", "new", "pending", "en attente")) return "nouveau";
  return fallback;
}

const statusLabel = (v: string) =>
  PLATFORM_STATUSES.find((s) => s.value === v)?.label || v;

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export default function ImportHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: magasins = [] } = useQuery<any[]>({ queryKey: ["/api/magasins"] });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // fieldKey -> sourceHeader

  const [magasinId, setMagasinId] = useState<string>("none");
  const [defaultStatus, setDefaultStatus] = useState("nouveau");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"phone+name" | "tracking" | "both">("phone+name");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  /* ── Parse file (client-side via SheetJS) ── */
  const parseFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      toast({ title: "Format non supporté", description: "Utilisez .xlsx, .xls ou .csv", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
      if (json.length === 0) {
        toast({ title: "Fichier vide", description: "Aucune donnée trouvée.", variant: "destructive" });
        return;
      }
      const hdrs = Object.keys(json[0]);
      // Auto-map
      const auto: Record<string, string> = {};
      for (const field of FIELDS) {
        const aliases = ALIASES[field.key] || [];
        const match = hdrs.find((h) => {
          const hn = stripAccents(h);
          return aliases.some((a) => hn === stripAccents(a) || hn.includes(stripAccents(a)));
        });
        if (match) auto[field.key] = match;
      }
      setHeaders(hdrs);
      setAllRows(json);
      setMapping(auto);
      setFileName(f.name);
      setStep(2);
    } catch (err: any) {
      toast({ title: "Erreur de lecture", description: err.message || "Impossible de lire le fichier.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }, [parseFile]);

  /* ── Build mapped rows from raw rows ── */
  const buildMappedRows = useCallback(() => {
    return allRows.map((raw) => {
      const get = (field: string) => {
        const col = mapping[field];
        if (!col) return "";
        const v = raw[col];
        return v === undefined || v === null ? "" : v;
      };
      const rawStatus = String(get("status") || "").trim();
      const overridden = rawStatus && statusOverrides[rawStatus] ? statusOverrides[rawStatus] : "";
      return {
        customerName: String(get("customerName") || "").trim(),
        customerPhone: String(get("customerPhone") || "").trim(),
        customerAddress: String(get("customerAddress") || "").trim(),
        customerCity: String(get("customerCity") || "").trim(),
        productName: String(get("productName") || "").trim(),
        price: get("price"),
        quantity: get("quantity"),
        status: overridden || rawStatus,
        trackingNumber: String(get("trackingNumber") || "").trim(),
        carrierProvider: String(get("carrierProvider") || "").trim(),
        createdAt: get("createdAt"),
        notes: String(get("notes") || "").trim(),
      };
    });
  }, [allRows, mapping, statusOverrides]);

  /* ── Unique detected source statuses (for the mapping table) ── */
  const detectedStatuses = useMemo(() => {
    const col = mapping["status"];
    if (!col) return [] as string[];
    const set = new Set<string>();
    for (const r of allRows) {
      const v = String(r[col] ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).slice(0, 30);
  }, [allRows, mapping]);

  const mappedPreview = useMemo(() => buildMappedRows().slice(0, 10), [buildMappedRows]);

  const canProceedToMap = mapping.customerName || mapping.customerPhone;

  /* ── Chunked import ── */
  const runImport = async () => {
    if (!canProceedToMap) {
      toast({ title: "Mapping incomplet", description: "Associez au moins 'Nom du client' ou 'Téléphone'.", variant: "destructive" });
      return;
    }
    const rows = buildMappedRows();
    setImporting(true);
    setProgress(0);
    const totals: ImportResult = { created: 0, skipped: 0, errors: [] };
    const chunkSize = 200;
    try {
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const res = await fetch("/api/orders/import-bulk", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk,
            magasinId: magasinId !== "none" ? Number(magasinId) : null,
            defaultStatus,
            defaultSource: "import",
            skipDuplicates,
            duplicateStrategy,
            baseRowIndex: i + 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur lors de l'import");
        totals.created += data.created || 0;
        totals.skipped += data.skipped || 0;
        totals.errors.push(...(data.errors || []));
        setProgress(Math.min(100, Math.round(((i + chunkSize) / rows.length) * 100)));
      }
      setResult(totals);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setProgress(100);
    }
  };

  const reset = () => {
    setStep(1); setFileName(""); setHeaders([]); setAllRows([]); setMapping({});
    setResult(null); setProgress(0); setStatusOverrides({});
  };

  const stepMeta = [
    { n: 1, label: "Importer le fichier" },
    { n: 2, label: "Associer les colonnes" },
    { n: 3, label: "Aperçu & confirmation" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-5 text-white">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold" data-testid="text-page-title">Importer l'historique des commandes</h1>
            <p className="text-indigo-200 text-sm">Reprenez vos commandes existantes en conservant statut, suivi et dates.</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          {stepMeta.map((s, idx) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                step >= (s.n as 1 | 2 | 3) ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500",
              )} data-testid={`step-indicator-${s.n}`}>
                {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
              </div>
              <span className={cn("text-sm font-medium hidden sm:inline", step >= (s.n as 1 | 2 | 3) ? "text-slate-800" : "text-slate-400")}>{s.label}</span>
              {idx < stepMeta.length - 1 && <div className="w-8 h-px bg-slate-200" />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div className="bg-white border rounded-2xl p-6 shadow-sm">
            <div
              className={cn(
                "border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors",
                dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-file"
            >
              {parsing ? <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" /> : <CloudUpload className={cn("w-12 h-12", dragging ? "text-indigo-500" : "text-indigo-400")} />}
              <div className="text-center">
                <p className="text-base font-semibold text-slate-700">Glissez votre fichier Excel/CSV ici</p>
                <p className="text-sm text-slate-400 mt-1">ou cliquez pour parcourir</p>
              </div>
              <Button variant="outline" className="gap-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} data-testid="button-choose-file">
                <FileSpreadsheet className="w-4 h-4" /> Choisir un fichier
              </Button>
              <p className="text-xs text-slate-400">Formats supportés : .xlsx, .xls, .csv</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} data-testid="input-file" />
          </div>
        )}

        {/* ── Step 2: Mapping ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800">Associer les colonnes</h2>
                  <p className="text-xs text-slate-500 mt-0.5" data-testid="text-file-summary">{fileName} — {allRows.length} lignes, {headers.length} colonnes</p>
                </div>
                <Button variant="ghost" size="icon" onClick={reset} data-testid="button-reset"><X className="w-4 h-4" /></Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">
                        {field.label}{!field.optional && <span className="text-red-500 ml-0.5">*</span>}
                      </p>
                    </div>
                    <div className="w-48 shrink-0">
                      <Select value={mapping[field.key] || "none"} onValueChange={(v) => setMapping((prev) => ({ ...prev, [field.key]: v === "none" ? "" : v }))}>
                        <SelectTrigger className="text-xs h-8" data-testid={`select-map-${field.key}`}><SelectValue placeholder="— Ignorer —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">— Ignorer —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="bg-white border rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5"><Store className="w-3.5 h-3.5" /> Magasin</Label>
                <Select value={magasinId} onValueChange={setMagasinId}>
                  <SelectTrigger data-testid="select-magasin"><SelectValue placeholder="Aucun (compte principal)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun (compte principal)</SelectItem>
                    {magasins.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">Statut par défaut (si vide)</Label>
                <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                  <SelectTrigger data-testid="select-default-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(!!v)} data-testid="checkbox-skip-duplicates" />
                  <span className="text-sm text-slate-700">Ignorer les doublons</span>
                </label>
                {skipDuplicates && (
                  <div className="flex flex-wrap gap-2 pl-6">
                    {([
                      { v: "phone+name", l: "Téléphone + nom" },
                      { v: "tracking", l: "N° de suivi" },
                      { v: "both", l: "Les deux" },
                    ] as const).map((opt) => (
                      <button key={opt.v} type="button"
                        onClick={() => setDuplicateStrategy(opt.v)}
                        className={cn("text-xs px-3 py-1.5 rounded-full border transition-colors",
                          duplicateStrategy === opt.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-300")}
                        data-testid={`button-dupe-${opt.v}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status mapping table */}
            {detectedStatuses.length > 0 && (
              <div className="bg-white border rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-1">Correspondance des statuts</h3>
                <p className="text-xs text-slate-500 mb-4">Vérifiez comment vos statuts seront convertis. Modifiez si besoin.</p>
                <div className="space-y-2">
                  {detectedStatuses.map((src) => {
                    const auto = previewMapStatus(src, defaultStatus);
                    const current = statusOverrides[src] || auto;
                    return (
                      <div key={src} className="flex items-center gap-3" data-testid={`row-status-${src}`}>
                        <div className="flex-1 text-sm text-slate-700 truncate bg-slate-50 px-3 py-2 rounded border">{src}</div>
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="w-56 shrink-0">
                          <Select value={current} onValueChange={(v) => setStatusOverrides((prev) => ({ ...prev, [src]: v }))}>
                            <SelectTrigger className="h-9 text-sm" data-testid={`select-status-map-${src}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PLATFORM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="gap-2"><ArrowLeft className="w-4 h-4" /> Retour</Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedToMap}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-2" data-testid="button-to-preview">
                Aperçu <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            {!canProceedToMap && <p className="text-xs text-red-500 text-center">Associez au moins « Nom du client » ou « Téléphone » pour continuer.</p>}
          </div>
        )}

        {/* ── Step 3: Preview & Confirm ── */}
        {step === 3 && !result && (
          <div className="space-y-5">
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-1">Aperçu (10 premières lignes)</h2>
              <p className="text-xs text-slate-500 mb-4">
                <span className="font-semibold text-indigo-600" data-testid="text-total-count">{allRows.length}</span> commandes seront traitées
                {skipDuplicates && " · les doublons seront ignorés"}.
              </p>
              <div className="overflow-x-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      {["Nom", "Téléphone", "Ville", "Produit", "Qté", "Prix", "Statut", "Suivi", "Transporteur", "Date"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedPreview.map((r, i) => (
                      <tr key={i} className="border-t" data-testid={`row-preview-${i}`}>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.customerName || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.customerPhone || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.customerCity || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.productName || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.quantity || "1"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.price || "—"}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">
                            {statusLabel(previewMapStatus(r.status, defaultStatus))}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.trackingNumber || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.carrierProvider || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.createdAt ? String(r.createdAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {importing && (
              <div className="bg-white border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Importation en cours…</span>
                  <span className="font-semibold text-indigo-600" data-testid="text-progress">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} disabled={importing} className="gap-2"><ArrowLeft className="w-4 h-4" /> Retour</Button>
              <Button onClick={runImport} disabled={importing}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 h-11 text-base" data-testid="button-import">
                {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackageCheck className="w-5 h-5" />}
                Importer {allRows.length} commandes
              </Button>
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {step === 3 && result && (
          <div className="bg-white border rounded-2xl p-8 shadow-sm text-center space-y-5">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-800">Importation terminée</h2>
            <div className="flex justify-center gap-8">
              <div data-testid="result-created">
                <p className="text-3xl font-bold text-green-600">{result.created}</p>
                <p className="text-slate-500 text-sm mt-1">Créées</p>
              </div>
              <div data-testid="result-skipped">
                <p className="text-3xl font-bold text-amber-500">{result.skipped}</p>
                <p className="text-slate-500 text-sm mt-1">Ignorées</p>
              </div>
              <div data-testid="result-errors">
                <p className="text-3xl font-bold text-red-500">{result.errors.length}</p>
                <p className="text-slate-500 text-sm mt-1">Erreurs</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-semibold text-red-700">Erreurs ({result.errors.length})</p>
                </div>
                {result.errors.slice(0, 50).map((e, i) => <p key={i} className="text-xs text-red-600">Ligne {e.row}: {e.message}</p>)}
              </div>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={reset} data-testid="button-import-another">Importer un autre fichier</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => (window.location.href = "/orders")} data-testid="button-view-orders">
                Voir les commandes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

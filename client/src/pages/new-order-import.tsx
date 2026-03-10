import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CloudUpload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DB_FIELDS = [
  { value: "", label: "— Ignorer —" },
  { value: "customerName", label: "Nom du client" },
  { value: "customerPhone", label: "Téléphone" },
  { value: "customerAddress", label: "Adresse" },
  { value: "customerCity", label: "Ville" },
  { value: "rawProductName", label: "Nom du produit" },
  { value: "totalPrice", label: "Prix total (DH)" },
  { value: "status", label: "Status" },
  { value: "comment", label: "Commentaire" },
  { value: "sku", label: "SKU / Référence" },
  { value: "variantInfo", label: "Variant" },
  { value: "quantity", label: "Quantité" },
];

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function NewOrderImport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string[][]>([]);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const parseFile = useCallback(async (f: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
      if (rows.length < 2) {
        toast({ title: "Fichier vide", description: "Le fichier ne contient aucune donnée.", variant: "destructive" });
        return;
      }
      const h = (rows[0] as string[]).map(String);
      setHeaders(h);
      setPreview(rows.slice(1, 4) as string[][]);
      // Auto-map common column names
      const autoMap: Record<string, string> = {};
      h.forEach(col => {
        const lower = col.toLowerCase().trim();
        if (lower.includes("nom") || lower.includes("name") || lower.includes("destinataire")) autoMap[col] = "customerName";
        else if (lower.includes("tel") || lower.includes("phone") || lower.includes("mobile")) autoMap[col] = "customerPhone";
        else if (lower.includes("adresse") || lower.includes("address")) autoMap[col] = "customerAddress";
        else if (lower.includes("ville") || lower.includes("city")) autoMap[col] = "customerCity";
        else if (lower.includes("produit") || lower.includes("product")) autoMap[col] = "rawProductName";
        else if (lower.includes("prix") || lower.includes("price") || lower.includes("total")) autoMap[col] = "totalPrice";
        else if (lower.includes("status") || lower.includes("statut")) autoMap[col] = "status";
        else if (lower.includes("comment")) autoMap[col] = "comment";
        else if (lower.includes("sku") || lower.includes("ref")) autoMap[col] = "sku";
        else if (lower.includes("variant")) autoMap[col] = "variantInfo";
        else if (lower.includes("qte") || lower.includes("qty") || lower.includes("quantit")) autoMap[col] = "quantity";
      });
      setMapping(autoMap);
      setFile(f);
      setStep("map");
    } catch (err: any) {
      toast({ title: "Erreur de lecture", description: err.message || "Impossible de lire le fichier.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }, [toast]);

  const handleFileDrop = useCallback((f: File) => {
    const allowed = ["xlsx", "xls", "csv"];
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!allowed.includes(ext)) {
      toast({ title: "Format non supporté", description: "Utilisez .xlsx, .xls ou .csv", variant: "destructive" });
      return;
    }
    parseFile(f);
  }, [parseFile, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileDrop(f);
  }, [handleFileDrop]);

  const handleImport = async () => {
    const reversedMap: Record<string, string> = {};
    Object.entries(mapping).forEach(([col, field]) => { if (field) reversedMap[col] = field; });
    if (!reversedMap.customerName && !reversedMap.customerPhone) {
      toast({ title: "Mapping incomplet", description: "Associez au moins 'Nom du client' ou 'Téléphone'.", variant: "destructive" });
      return;
    }
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(reversedMap));
      const res = await fetch("/api/orders/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur import");
      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null); setHeaders([]); setMapping({}); setPreview([]); setStep("upload"); setResult(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-3">
        <h1 className="text-sm font-bold uppercase tracking-widest text-gray-700">Importer des commandes</h1>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-gray-800">Configuration d'importation des commandes</h2>
            </div>

            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors",
                dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40"
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? (
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              ) : (
                <CloudUpload className={cn("w-12 h-12", dragging ? "text-blue-500" : "text-blue-400")} />
              )}
              <div className="text-center">
                <p className="text-base font-semibold text-gray-700">Glissez-déposez votre fichier Excel/CSV ici</p>
                <p className="text-sm text-gray-400 mt-1">Ou cliquez pour parcourir</p>
              </div>
              <Button variant="outline" className="gap-2 border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <FileSpreadsheet className="w-4 h-4" /> Choisir un fichier
              </Button>
              <p className="text-xs text-gray-400">Formats supportés: xlsx, xls, csv</p>
            </div>

            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }} />
          </div>
        )}

        {/* ── Step 2: Column Mapping ── */}
        {step === "map" && (
          <div className="bg-white border rounded-lg p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="font-semibold text-gray-800">Associer les colonnes</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{file?.name} — {headers.length} colonnes détectées</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={reset}><X className="w-4 h-4" /></Button>
            </div>

            {/* Column mapping */}
            <div className="grid grid-cols-2 gap-3">
              {headers.map(col => (
                <div key={col} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-600 truncate">{col}</p>
                    {preview[0] && <p className="text-xs text-gray-400 truncate">{String(preview[0][headers.indexOf(col)] ?? "")}</p>}
                  </div>
                  <div className="w-44 shrink-0">
                    <Select value={mapping[col] || ""} onValueChange={v => setMapping(prev => ({ ...prev, [col]: v }))}>
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Ignorer" /></SelectTrigger>
                      <SelectContent>
                        {DB_FIELDS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview table */}
            {preview.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Aperçu (3 premières lignes)</p>
                <div className="overflow-x-auto rounded border text-xs">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t">
                          {headers.map((_, j) => <td key={j} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{String(row[j] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={reset} className="flex-1">Annuler</Button>
              <Button onClick={handleImport} disabled={importing} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                Importer les commandes
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {step === "done" && result && (
          <div className="bg-white border rounded-lg p-8 shadow-sm text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">Importation terminée</h2>
            <div className="flex justify-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{result.imported}</p>
                <p className="text-gray-500 mt-1">Commandes importées</p>
              </div>
              {result.skipped > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-500">{result.skipped}</p>
                  <p className="text-gray-500 mt-1">Ignorées</p>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-semibold text-red-700">Erreurs ({result.errors.length})</p>
                </div>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              </div>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={reset}>Importer un autre fichier</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.location.href = "/orders/nouveau"}>
                Voir les commandes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

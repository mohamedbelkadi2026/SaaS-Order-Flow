import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function SheetsIntegrationPage() {
  const { toast } = useToast();
  const [understood, setUnderstood] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ connected: boolean; message: string; spreadsheetName?: string | null; lastSyncAt?: string; } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: scriptText, isLoading: scriptLoading } = useQuery<string>({
    queryKey: ["/api/sheets/script"],
    queryFn: async () => {
      const r = await fetch("/api/sheets/script", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load script");
      return r.text();
    },
  });

  const handleCopy = async () => {
    if (!scriptText) return;
    try {
      await navigator.clipboard.writeText(scriptText);
      setCopied(true);
      toast({ title: "✅ Script copié", description: "Collez-le dans Apps Script." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await fetch("/api/sheets/verify", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      const data = await r.json();
      setVerifyResult(data);
      toast({ title: data.connected ? "✅ Connexion vérifiée" : "⚠️ Pas encore connecté", description: data.message, variant: data.connected ? "default" : "destructive" });
    } catch {
      setVerifyResult({ connected: false, message: "Erreur réseau." });
    } finally { setVerifying(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Guide d'intégration avec Google Sheets</h1>
          </div>
          <div className="px-8 py-6">
            <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-4">Étapes :</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              <div className="py-4 text-gray-700 dark:text-gray-300">Ouvrez votre <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">compte Google Sheets</a>.</div>
              <div className="py-4 text-gray-700 dark:text-gray-300">Allez dans <span className="font-medium">Extensions</span> &gt; <span className="font-medium">Apps Script</span>.</div>
              <div className="py-4 text-gray-700 dark:text-gray-300">Cliquez sur le bouton ci-dessous pour copier le script.</div>
              <div className="py-4 text-gray-700 dark:text-gray-300">Collez le script dans l'éditeur Apps Script.</div>
              <div className="py-4 text-gray-700 dark:text-gray-300">Enregistrez le script et exécutez la fonction <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">setup</code>.</div>
              <div className="py-4 text-gray-700 dark:text-gray-300">Accordez les autorisations à l'application pour accéder à vos données.</div>
            </div>
            <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
              <Button onClick={handleCopy} disabled={scriptLoading || !scriptText} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-copy-script">
                {scriptLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement…</>) : copied ? (<><CheckCircle2 className="w-4 h-4 mr-2" /> Copié !</>) : (<><Copy className="w-4 h-4 mr-2" /> Copy Code</>)}
              </Button>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} data-testid="checkbox-understood" />
                <span className="text-gray-700 dark:text-gray-300">I understand the steps</span>
              </label>
            </div>
            <div className="mt-6">
              <Button onClick={handleVerify} disabled={!understood || verifying} className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-medium disabled:opacity-50" data-testid="button-verify-connection">
                {verifying ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Vérification…</>) : "Verify Connection"}
              </Button>
            </div>
            {verifyResult && (
              <div className={`mt-4 p-4 rounded-lg border ${verifyResult.connected ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
                <div className="flex items-start gap-3">
                  {verifyResult.connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />}
                  <div className="flex-1">
                    <p className={`font-medium ${verifyResult.connected ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"}`}>{verifyResult.connected ? "Connecté ✅" : "Non connecté"}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{verifyResult.message}</p>
                    {verifyResult.spreadsheetName && (<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">📄 Feuille connectée : <span className="font-medium">{verifyResult.spreadsheetName}</span></p>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

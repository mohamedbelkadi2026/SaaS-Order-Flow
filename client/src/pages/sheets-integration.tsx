import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Copy, CheckCircle2, Plus, Trash2, ArrowLeft } from "lucide-react";
import { SiGooglesheets } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConnectedSheet = {
  id: number;
  spreadsheetId: string | null;
  spreadsheetName: string;
  ordersCount: number;
  isActive: boolean;
  status: string;
  lastSyncAt: string | null;
  createdAt: string | null;
};

export default function SheetsIntegrationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showGuide, setShowGuide] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: listData, isLoading: listLoading, refetch: refetchList } = useQuery<{ count: number; sheets: ConnectedSheet[] }>({
    queryKey: ["/api/sheets/list"],
    queryFn: async () => {
      const r = await fetch("/api/sheets/list", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load sheets");
      return r.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const { data: scriptText, isLoading: scriptLoading } = useQuery<string>({
    queryKey: ["/api/sheets/script"],
    queryFn: async () => {
      const r = await fetch("/api/sheets/script", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load script");
      return r.text();
    },
    enabled: showGuide || (listData?.count === 0),
  });

  const sheets = listData?.sheets || [];
  const count = listData?.count || 0;

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
    try {
      const r = await fetch("/api/sheets/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await r.json();
      await refetchList();
      if (data.connected) {
        toast({ title: "✅ Connexion vérifiée", description: data.message });
        setShowGuide(false);
        setUnderstood(false);
      } else {
        toast({ title: "⚠️ Pas encore connecté", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Vérification impossible.", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const r = await fetch(`/api/sheets/${id}/toggle`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (data.success) {
        toast({ title: data.isActive ? "✅ Activé" : "⏸️ Désactivé", description: `Synchronisation ${data.isActive ? "activée" : "désactivée"}` });
        await refetchList();
      } else {
        toast({ title: "Erreur", description: data.message || "Échec", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      const r = await fetch(`/api/sheets/${deleteId}`, { method: "DELETE", credentials: "include" });
      const data = await r.json();
      if (data.success) {
        toast({ title: "🗑️ Feuille déconnectée", description: "La connexion a été supprimée." });
        queryClient.invalidateQueries({ queryKey: ["/api/sheets/list"] });
        await refetchList();
      } else {
        toast({ title: "Erreur", description: data.message || "Échec", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  // ── LOADING STATE ──────────────────────────────────────────────────
  if (listLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── GUIDE STATE ────────────────────────────────────────────────────
  if (showGuide || count === 0) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {count > 0 && (
            <div className="mb-4">
              <Button variant="ghost" onClick={() => setShowGuide(false)} data-testid="button-back-to-list">
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour à mes feuilles connectées
              </Button>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-border">
              <h1 className="text-2xl font-bold text-foreground">Guide d'intégration avec Google Sheets</h1>
            </div>

            <div className="px-8 py-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Étapes :</h2>

              <div className="divide-y divide-border">
                <div className="py-4 text-foreground">
                  Ouvrez votre <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">compte Google Sheets</a>.
                </div>
                <div className="py-4 text-foreground">
                  Allez dans <span className="font-semibold">Extensions</span> &gt; <span className="font-semibold">Apps Script</span>.
                </div>
                <div className="py-4 text-foreground">Cliquez sur le bouton ci-dessous pour copier le script.</div>
                <div className="py-4 text-foreground">Collez le script dans l'éditeur Apps Script.</div>
                <div className="py-4 text-foreground">
                  Enregistrez le script et exécutez la fonction <code className="px-2 py-0.5 bg-muted rounded text-sm font-mono text-foreground">setup</code>.
                </div>
                <div className="py-4 text-foreground">Accordez les autorisations à l'application pour accéder à vos données.</div>
              </div>

              <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                <Button
                  onClick={handleCopy}
                  disabled={scriptLoading || !scriptText}
                  data-testid="button-copy-script"
                >
                  {scriptLoading
                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement…</>)
                    : copied
                    ? (<><CheckCircle2 className="w-4 h-4 mr-2" /> Copié !</>)
                    : (<><Copy className="w-4 h-4 mr-2" /> Copy Code</>)}
                </Button>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={understood}
                    onCheckedChange={(v) => setUnderstood(v === true)}
                    data-testid="checkbox-understood"
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="text-foreground">I understand the steps</span>
                </label>
              </div>

              <div className="mt-6">
                <Button
                  onClick={handleVerify}
                  disabled={!understood || verifying}
                  className="w-full h-12 text-base font-medium"
                  data-testid="button-verify-connection"
                >
                  {verifying
                    ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Vérification…</>)
                    : "Verify Connection"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST STATE ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Google Sheets — Intégrations</h1>
            <p className="text-muted-foreground mt-1">{count} feuille(s) connectée(s)</p>
          </div>
          <Button
            onClick={() => { setShowGuide(true); setUnderstood(false); }}
            variant="outline"
            className="border-dashed border-2 h-12 px-5"
            data-testid="button-add-new-sheet"
          >
            <Plus className="w-5 h-5 mr-2" />
            Intégrer un nouveau Google Sheet
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {sheets.map((sheet) => (
            <div
              key={sheet.id}
              className="relative bg-card border border-border rounded-xl shadow-sm p-5"
              data-testid={`card-sheet-${sheet.id}`}
            >
              <div className="absolute top-3 right-3">
                <span className={`text-xs font-medium px-3 py-1 rounded-md ${
                  sheet.isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {sheet.isActive ? "Connecté" : "Désactivé"}
                </span>
              </div>

              <div className="flex items-start gap-3 mb-3 pr-20">
                <SiGooglesheets className="w-8 h-8 text-green-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-foreground truncate" data-testid={`text-sheet-name-${sheet.id}`}>
                    {sheet.spreadsheetName}
                  </h3>
                  {sheet.spreadsheetId && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                      🔗 ...{sheet.spreadsheetId.slice(-20)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground" data-testid={`text-orders-count-${sheet.id}`}>
                  {sheet.ordersCount} commande(s)
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={sheet.isActive}
                    onCheckedChange={() => handleToggle(sheet.id)}
                    className="data-[state=checked]:bg-primary"
                    data-testid={`switch-toggle-${sheet.id}`}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setDeleteId(sheet.id)}
                    className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    data-testid={`button-delete-${sheet.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Déconnecter cette feuille ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les commandes déjà importées resteront dans la plateforme, mais aucune nouvelle commande ne sera synchronisée depuis cette feuille. Vous pouvez la reconnecter à tout moment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Déconnecter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

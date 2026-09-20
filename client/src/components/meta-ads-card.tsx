import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Link2, Unlink, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Meta Ads connection card.
 *
 * The merchant pastes an ad account id and a System User token once; spend is
 * imported automatically from then on. The token is never sent back to the
 * browser — the status endpoint only reports whether one is stored.
 */
export default function MetaAdsCard({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  // An ad account has no notion of magasin, so the merchant assigns one once
  // and every imported row inherits it.
  const [magasinId, setMagasinId] = useState<string>("");
  const { data: magasins = [] } = useQuery<any[]>({ queryKey: ["/api/magasins"] });

  const { data: status, isLoading } = useQuery<any>({ queryKey: ["/api/meta-ads/status"] });

  const connectMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/meta-ads/connect", { adAccountId, accessToken, magasinId: magasinId || null })).json(),
    onSuccess: async (r: any) => {
      toast({ title: "Meta Ads connecté", description: r?.accountName ? `Compte : ${r.accountName}` : undefined });
      setOpen(false); setAccessToken("");
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/status"] });
    },
    onError: (e: any) => toast({ title: "Connexion impossible", description: e?.message, variant: "destructive" }),
  });

  const syncMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/meta-ads/sync", { days: 30 })).json(),
    onSuccess: (r: any) => {
      const n = r?.synced ?? 0;
      toast({
        title: n > 0 ? "Import terminé" : "Aucune dépense trouvée",
        description: n > 0
          ? `${n} ligne(s) importée(s) du ${r?.since} au ${r?.until}.`
          : `Meta n'a renvoyé aucune dépense entre le ${r?.since} et le ${r?.until}. Vérifiez qu'une campagne a bien tourné sur cette période.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/status"] });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/spend"] });
    },
    onError: (e: any) => toast({ title: "Import échoué", description: e?.message, variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/meta-ads/disconnect", {})).json(),
    onSuccess: () => {
      toast({ title: "Meta Ads déconnecté" });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/status"] });
    },
  });

  if (!isAdmin || isLoading) return null;

  const connected = !!status?.connected;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0866FF]/10 flex items-center justify-center text-[#0866FF] font-bold">M</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Meta Ads</span>
              {connected
                ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Connecté</span>
                : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Non connecté</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connected
                ? <>
                    {status.accountName || status.adAccountId}
                    {status.currency ? ` · ${status.currency}` : ""}
                    {status.lastSyncAt ? ` · dernier import ${new Date(status.lastSyncAt).toLocaleString("fr-MA")}` : " · aucun import encore"}
                  </>
                : "Importez automatiquement vos dépenses publicitaires chaque jour."}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {connected && (
            <Button size="sm" variant="outline" className="gap-2" disabled={syncMut.isPending}
              onClick={() => syncMut.mutate()} data-testid="btn-meta-sync">
              <RefreshCw className={`w-3.5 h-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} />
              Importer maintenant
            </Button>
          )}
          <Button size="sm" variant={connected ? "outline" : "default"} className="gap-2"
            onClick={() => (connected ? disconnectMut.mutate() : setOpen(v => !v))}
            data-testid="btn-meta-connect">
            {connected ? <><Unlink className="w-3.5 h-3.5" />Déconnecter</> : <><Link2 className="w-3.5 h-3.5" />Connecter</>}
          </Button>
        </div>
      </div>

      {/* A revoked token fails silently otherwise: the spend column simply stops
          moving and the profit figure drifts without anyone noticing. */}
      {connected && status.lastError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Dernier import en échec : {status.lastError}</span>
        </div>
      )}

      {connected && !status.lastError && status.lastSyncRows === 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Connexion valide, mais aucune dépense sur la période — vérifiez que des campagnes ont tourné.</span>
        </div>
      )}

      {open && !connected && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border/60 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="meta_act" className="text-xs font-semibold">Identifiant du compte publicitaire</Label>
            <Input id="meta_act" value={adAccountId} onChange={e => setAdAccountId(e.target.value)}
              placeholder="act_1234567890" className="h-10 text-xs font-mono" data-testid="input-meta-account" />
            <p className="text-[10px] text-muted-foreground">Avec ou sans le préfixe act_</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta_token" className="text-xs font-semibold">Token d'accès</Label>
            <Input id="meta_token" type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
              placeholder="EAAB..." className="h-10 text-xs font-mono" data-testid="input-meta-token" />
            <p className="text-[10px] text-muted-foreground">Token d'utilisateur système avec l'autorisation ads_read</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="meta_magasin" className="text-xs font-semibold">Magasin</Label>
            <select
              id="meta_magasin"
              value={magasinId}
              onChange={e => setMagasinId(e.target.value)}
              data-testid="select-meta-magasin"
              className="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
            >
              <option value="">— Aucun —</option>
              {(magasins as any[]).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Toutes les dépenses importées de ce compte seront rattachées à ce magasin.
            </p>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" disabled={connectMut.isPending || !adAccountId.trim() || !accessToken.trim()}
              onClick={() => connectMut.mutate()} data-testid="btn-meta-save">
              {connectMut.isPending ? "Vérification…" : "Enregistrer"}
            </Button>
          </div>
          <p className="sm:col-span-2 text-[10px] text-muted-foreground">
            Les identifiants sont vérifiés auprès de Meta avant d'être enregistrés : un token invalide
            se traduirait sinon par des dépenses à zéro et un bénéfice faussé.
          </p>
        </div>
      )}
    </div>
  );
}

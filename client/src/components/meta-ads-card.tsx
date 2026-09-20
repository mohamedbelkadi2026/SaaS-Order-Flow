import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Link2, Unlink, AlertTriangle, CheckCircle2 } from "lucide-react";
import MetaCampaignMapping from "@/components/meta-campaign-mapping";

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
  // A Business Manager can hold several ad accounts. Rather than making the
  // merchant paste each id, the token is used to list them and they tick the
  // ones to import.
  const [discovered, setDiscovered] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const { data: magasins = [] } = useQuery<any[]>({ queryKey: ["/api/magasins"] });

  const { data: status, isLoading } = useQuery<any>({ queryKey: ["/api/meta-ads/status"] });

  const discoverMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/meta-ads/accounts", { accessToken })).json(),
    onSuccess: (r: any) => {
      const list = r?.accounts || [];
      setDiscovered(list);
      setPicked(list.map((a: any) => a.id));
      if (!list.length) toast({ title: "Aucun compte publicitaire visible avec ce token", variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Lecture impossible", description: e?.message, variant: "destructive" }),
  });

  const connectMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/meta-ads/connect", { adAccountId: adAccountId || picked[0], accessToken, magasinId: magasinId || null, adAccountIds: picked.length ? picked : undefined })).json(),
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
          <div className="w-9 h-9 rounded-lg bg-[#0866FF]/10 flex items-center justify-center shrink-0">
            {/* Meta's infinity mark, drawn inline so it needs no asset. */}
            <svg viewBox="0 0 36 24" className="w-6 h-6" fill="none" aria-hidden="true">
              <path d="M6.5 3.5C3.2 3.5 1 7.2 1 12s2.2 8.5 5.5 8.5c2.6 0 4.4-2 6.3-5.2l2.4-4c.6-1 1.1-1.8 1.6-2.5.6.8 1.2 1.7 1.9 2.9l2.2 3.7c2 3.4 3.8 5.1 6.3 5.1 3.3 0 5.3-3.6 5.3-8.4C32.5 7.1 30.4 3.5 27 3.5c-2.4 0-4.3 1.6-6.4 5l-1.7 2.9-1.6-2.6C15.1 5.2 13.1 3.5 10.6 3.5H6.5Zm1 3.1h2.6c1.4 0 2.7 1.1 4.5 4.1l1.4 2.3-1.9 3.1c-1.5 2.4-2.6 3.3-4 3.3-1.8 0-3.1-2.1-3.1-5.5 0-4 1.3-7.3 0.5-7.3Zm19.3 0c1.7 0 2.9 2.2 2.9 5.6 0 3.6-1.1 5.2-2.7 5.2-1.4 0-2.5-1-4.2-3.8l-2-3.4 1.4-2.3c1.8-2.6 3.1-3.3 4.6-3.3Z"
                fill="#0866FF"/>
            </svg>
          </div>
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

      {/* The campaign list belongs to this connection — keeping it in the same
          card avoids two cards both labelled Meta sitting side by side. */}
      {connected && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <MetaCampaignMapping isAdmin={isAdmin} />
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
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Comptes publicitaires à importer</Label>
              <Button size="sm" variant="outline" disabled={!accessToken.trim() || discoverMut.isPending}
                onClick={() => discoverMut.mutate()} data-testid="btn-discover-accounts">
                {discoverMut.isPending ? "Lecture…" : "Lister mes comptes"}
              </Button>
            </div>
            {discovered.length > 0 ? (
              <div className="rounded-lg border border-border divide-y max-h-48 overflow-y-auto">
                {discovered.map(a => (
                  <label key={a.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={picked.includes(a.id)}
                      onChange={e => setPicked(p => e.target.checked ? [...p, a.id] : p.filter(x => x !== a.id))}
                      data-testid={`checkbox-account-${a.id}`}
                    />
                    <span className="flex-1">{a.name || a.id}</span>
                    <span className="text-muted-foreground font-mono">{a.id}</span>
                    {a.currency && <span className="text-muted-foreground">{a.currency}</span>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Plusieurs comptes sous le même Business Manager ? Collez le token puis cliquez
                « Lister mes comptes » pour tous les importer.
              </p>
            )}
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

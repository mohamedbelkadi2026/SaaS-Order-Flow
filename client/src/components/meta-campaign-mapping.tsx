import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Link2, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Campaign → product mapping.
 *
 * Unmapped campaigns are listed first and flagged: spend that isn't attributed
 * to a product is spend missing from that product's profit, and a new campaign
 * would otherwise disappear into a total nobody checks.
 */
export default function MetaCampaignMapping({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  // Collapsed by default: the table can run to dozens of campaigns and pushed
  // the actual spend list off the screen. It is a setup step, consulted when a
  // new campaign needs linking, not something to read every visit.
  const [open, setOpen] = useState(false);
  const [rateInput, setRateInput] = useState<string>("");

  // Period selection. Defaults to the current calendar month — the same frame
  // merchants use to reconcile what they actually paid Meta.
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthRange = (offset: number) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    // Never ask for future days: Meta returns nothing and it looks like a bug.
    return { since: iso(start), until: iso(end > now ? now : end) };
  };

  const [preset, setPreset] = useState<"this_month" | "last_month" | "custom">("this_month");
  const [customSince, setCustomSince] = useState(monthRange(0).since);
  const [customUntil, setCustomUntil] = useState(monthRange(0).until);

  const range = preset === "custom"
    ? { since: customSince, until: customUntil }
    : monthRange(preset === "this_month" ? 0 : -1);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/meta-ads/campaigns", range.since, range.until],
    queryFn: async () => {
      const qs = new URLSearchParams({ since: range.since, until: range.until });
      const res = await fetch(`/api/meta-ads/campaigns?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Chargement des campagnes impossible");
      return res.json();
    },
  });

  // Import the period being viewed, rather than a rolling window: picking a
  // past month and finding it empty should be one click away from fixing.
  const importMut = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/meta-ads/sync", { since: range.since, until: range.until })).json(),
    onSuccess: (r: any) => {
      const n = r?.synced ?? 0;
      toast({
        title: n > 0 ? "Import terminé" : "Aucune dépense sur cette période",
        description: `${n} ligne(s) du ${r?.since} au ${r?.until}.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/campaigns"] });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/status"] });
    },
    onError: (e: any) => toast({ title: "Import échoué", description: e?.message, variant: "destructive" }),
  });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/products"] });

  const mapMut = useMutation({
    mutationFn: async (v: { campaignId: string; campaignName: string; productId: number | null }) =>
      (await apiRequest("POST", "/api/meta-ads/campaigns/map", v)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/meta-ads/campaigns"] }),
    onError: (e: any) => toast({ title: "Échec", description: e?.message, variant: "destructive" }),
  });

  const rateMut = useMutation({
    mutationFn: async (rate: number) => (await apiRequest("POST", "/api/meta-ads/rate", { rate })).json(),
    onSuccess: (r: any) => {
      toast({ title: "Taux enregistré", description: `1 USD = ${r.rate} DH` });
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/campaigns"] });
    },
    onError: (e: any) => toast({ title: "Taux invalide", description: e?.message, variant: "destructive" }),
  });

  if (!isAdmin || isLoading) return null;

  const campaigns: any[] = data?.campaigns || [];

  const rate = data?.rate ?? 10;
  const unmapped = data?.unmappedCount ?? 0;
  const dh = (centimes: number) => (centimes / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="btn-open-campaign-mapping"
        className="w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-sm">Campagnes Meta</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaigns.length} campagne{campaigns.length > 1 ? "s" : ""}
              {unmapped > 0 && ` · ${unmapped} sans produit`}
            </p>
          </div>
          <span className="flex items-center gap-2">
            {/* Unlinked campaigns are spend charged to no product, so the count
                stays visible even when the panel is closed. */}
            {unmapped > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {unmapped} à lier
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => setOpen(false)} className="font-semibold text-sm flex items-center gap-1.5"
            data-testid="btn-close-campaign-mapping">
            Campagnes Meta <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <p className="text-xs text-muted-foreground mt-0.5">
            Liez chaque campagne à un produit. La dépense sera ensuite imputée automatiquement, chaque jour.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <select
              value={preset}
              onChange={e => setPreset(e.target.value as any)}
              data-testid="select-meta-period"
              className="h-9 rounded-md border border-border bg-white px-2 text-xs"
            >
              <option value="this_month">Ce mois</option>
              <option value="last_month">Mois dernier</option>
              <option value="custom">Personnalisé</option>
            </select>

            {preset === "custom" && (
              <>
                <Input type="date" value={customSince} onChange={e => setCustomSince(e.target.value)}
                  className="h-9 w-[150px] text-xs" data-testid="input-meta-since" />
                <span className="text-xs text-muted-foreground">au</span>
                <Input type="date" value={customUntil} onChange={e => setCustomUntil(e.target.value)}
                  className="h-9 w-[150px] text-xs" data-testid="input-meta-until" />
              </>
            )}

            <Button size="sm" variant="outline" disabled={importMut.isPending}
              onClick={() => importMut.mutate()} data-testid="btn-import-period">
              {importMut.isPending ? "Import…" : "Importer cette période"}
            </Button>
          </div>
        </div>

        {/* The rate is the merchant's own settlement rate, not a market feed. */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="usd_rate" className="text-[10px] font-semibold">1 USD = ? DH</Label>
            <Input id="usd_rate" value={rateInput} onChange={e => setRateInput(e.target.value)}
              placeholder={String(rate)} className="h-9 w-24 text-xs" data-testid="input-usd-rate" />
          </div>
          <Button size="sm" variant="outline" disabled={rateMut.isPending || !rateInput.trim()}
            onClick={() => rateMut.mutate(Number(rateInput.replace(",", ".")))} data-testid="btn-save-rate">
            Enregistrer
          </Button>
        </div>
      </div>

      {unmapped > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {unmapped} campagne{unmapped > 1 ? "s" : ""} sans produit — leur dépense n'est imputée à aucun produit
            et manque donc dans sa rentabilité.
          </span>
        </div>
      )}

      {!campaigns.length ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Aucune dépense enregistrée du {range.since} au {range.until}.
          Cliquez « Importer cette période » pour la récupérer depuis Meta.
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/60">
              <th className="text-left font-semibold py-2">Campagne</th>
              <th className="text-right font-semibold py-2 px-3">Jours</th>
              <th className="text-right font-semibold py-2 px-3">Dépense</th>
              <th className="text-left font-semibold py-2 pl-3">Produit</th>
            </tr>
          </thead>
          <tbody>
            {/* Unmapped first: they're the ones needing a decision. */}
            {[...campaigns].sort((a, b) => (a.productId ? 1 : 0) - (b.productId ? 1 : 0)).map(c => (
              <tr key={c.campaignId} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3">
                  <div className="font-medium truncate max-w-[260px]" title={c.campaignName}>{c.campaignName}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{c.campaignId}</div>
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground">{c.days}</td>
                <td className="py-2 px-3 text-right">
                  <div className="font-semibold">{dh(c.amountMad)} DH</div>
                  {c.currency && c.currency !== "MAD" && (
                    <div className="text-[10px] text-muted-foreground">
                      {(c.totalAmount / 100).toFixed(2)} {c.currency}
                    </div>
                  )}
                </td>
                <td className="py-2 pl-3">
                  <select
                    value={c.productId ?? ""}
                    onChange={e => mapMut.mutate({
                      campaignId: c.campaignId,
                      campaignName: c.campaignName,
                      productId: e.target.value ? Number(e.target.value) : null,
                    })}
                    data-testid={`select-campaign-product-${c.campaignId}`}
                    className={`h-9 w-full max-w-[240px] rounded-md border px-2 text-xs ${
                      c.productId ? "border-border bg-white" : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    <option value="">— Non lié —</option>
                    {(products as any[]).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
        <Link2 className="w-3 h-3 shrink-0 mt-0.5" />
        Les montants sont stockés dans la devise du compte publicitaire et convertis à l'affichage avec
        le taux ci-dessus — changer le taux met à jour tout l'historique, sans réimport.
      </p>
    </div>
  );
}

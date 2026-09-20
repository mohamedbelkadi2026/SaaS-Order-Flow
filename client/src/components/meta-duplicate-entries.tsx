import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle } from "lucide-react";

/**
 * Manual Facebook entries that overlap the Meta import.
 *
 * Typing Facebook spend by hand and then connecting Meta records the same
 * money twice: the ad budget reads too high and the net profit too low, by the
 * same amount, on every page that sums them.
 *
 * Nothing is deleted automatically. Some of these entries may be deliberate —
 * a figure entered for an account that isn't connected, say — so the merchant
 * sees each one next to what Meta imported for the same day and chooses.
 */
export default function MetaDuplicateEntries({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/meta-ads/duplicates"],
    enabled: isAdmin,
  });

  const delMut = useMutation({
    mutationFn: async (ids: number[]) =>
      (await apiRequest("POST", "/api/meta-ads/duplicates/delete", { ids })).json(),
    onSuccess: (r: any) => {
      toast({ title: `${r?.deleted ?? 0} saisie(s) supprimée(s)` });
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["/api/meta-ads/duplicates"] });
      qc.invalidateQueries({ queryKey: ["/api/publicites"] });
    },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e?.message, variant: "destructive" }),
  });

  if (!isAdmin || isLoading || !rows.length) return null;

  const dh = (c: number) => (c / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <span className="font-semibold">
            {rows.length} saisie(s) Facebook en double — {dh(total)} DH.
          </span>{" "}
          Ces dépenses ont été saisies à la main sur des jours que l'import Meta couvre
          aussi : elles sont comptées deux fois, ce qui gonfle le budget pub et réduit
          d'autant le bénéfice net.
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(v => !v)}
          data-testid="btn-toggle-duplicates">
          {open ? "Masquer" : "Examiner"}
        </Button>
      </div>

      {open && (
        <>
          <div className="rounded-lg border border-amber-200 bg-white divide-y max-h-64 overflow-y-auto">
            {rows.map(r => (
              <label key={r.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-amber-50/50">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={e => setSelected(s => e.target.checked ? [...s, r.id] : s.filter(x => x !== r.id))}
                  data-testid={`checkbox-dup-${r.id}`}
                />
                <span className="w-24 text-muted-foreground">{r.date}</span>
                <span className="flex-1 text-foreground">{r.productName || "— sans produit —"}</span>
                <span className="font-semibold">{dh(r.amount)} DH</span>
                {/* What Meta imported that day, so the merchant can judge
                    whether the manual figure really is the same money. */}
                <span className="w-40 text-right text-muted-foreground">
                  Meta : {dh(r.metaAmountSameDay)} DH
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSelected(selected.length === rows.length ? [] : rows.map(r => r.id))}
              className="underline"
              data-testid="btn-select-all-duplicates"
            >
              {selected.length === rows.length ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
            <Button size="sm" variant="destructive" disabled={!selected.length || delMut.isPending}
              onClick={() => delMut.mutate(selected)} data-testid="btn-delete-duplicates">
              {delMut.isPending ? "Suppression…" : `Supprimer ${selected.length} saisie(s)`}
            </Button>
          </div>
          <p className="text-[10px]">
            Seules les saisies manuelles sont supprimées. Les dépenses importées de Meta
            restent, et seront réimportées de toute façon.
          </p>
        </>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShoppingCart, Search } from "lucide-react";
import { useState } from "react";

const GOLD = "#C5A059";
const NAVY = "#0f1e38";

const STATUS_COLOR: Record<string, string> = {
  nouveau:     "bg-slate-100 text-slate-700",
  confirmé:    "bg-green-100 text-green-700",
  expédié:     "bg-blue-100 text-blue-700",
  livré:       "bg-emerald-100 text-emerald-700",
  annulé:      "bg-red-100 text-red-700",
  refusé:      "bg-red-100 text-red-700",
};

function statusClass(status: string) {
  const lower = (status || "").toLowerCase();
  for (const [k, v] of Object.entries(STATUS_COLOR)) {
    if (lower.includes(k)) return v;
  }
  return "bg-slate-100 text-slate-700";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function TajerDropCommandes() {
  const [search, setSearch] = useState("");

  // Reuse the existing orders endpoint filtered to the seller's store automatically
  const { data: resp, isLoading } = useQuery<{ orders: any[]; total: number }>({
    queryKey: ["/api/orders", { limit: 200 }],
    queryFn: async () => {
      const res = await fetch("/api/orders?limit=200", { credentials: "include" });
      return res.json();
    },
  });

  const orders: any[] = resp?.orders || [];

  const filtered = search.trim()
    ? orders.filter(o =>
        o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
        o.customerPhone?.includes(search)
      )
    : orders;

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes commandes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{orders.length} commande{orders.length !== 1 ? "s" : ""} au total</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher (nom, n° commande, téléphone)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground text-sm">
            {search ? "Aucune commande trouvée." : "Vous n'avez pas encore de commandes."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground" style={{ background: NAVY + "06" }}>
                  <th className="text-left px-4 py-3 font-medium">N° Commande</th>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Ville</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o: any) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{o.orderNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{o.customerCity || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold hidden md:table-cell">
                      {formatCurrency(o.totalPrice || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {o.createdAt ? formatDate(o.createdAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

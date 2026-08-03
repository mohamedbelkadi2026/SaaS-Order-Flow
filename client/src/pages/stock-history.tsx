import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown, Activity, Search, X } from "lucide-react";
import { Link } from "wouter";

// ── helpers ──────────────────────────────────────────────────────────────────
function formatDate(raw: string | Date) {
  const d = new Date(raw);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  restock:    { label: "Entrée stock",  className: "bg-emerald-100 text-emerald-700 border border-emerald-400" },
  shipped:    { label: "Expédition",    className: "bg-blue-100 text-blue-700 border border-blue-400" },
  returned:   { label: "Retour",        className: "bg-orange-100 text-orange-700 border border-orange-400" },
  delivered:  { label: "Livraison",     className: "bg-teal-100 text-teal-700 border border-teal-400" },
  adjustment: { label: "Ajustement",    className: "bg-purple-100 text-purple-700 border border-purple-400" },
  manual:     { label: "Manuel",        className: "bg-slate-100 text-slate-600 border border-slate-400" },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, className: "bg-gray-100 text-gray-600 border border-gray-300" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>;
}

function QtyCell({ qty }: { qty: number }) {
  if (qty > 0) return <span className="font-bold text-emerald-600">+{qty}</span>;
  if (qty < 0) return <span className="font-bold text-red-600">{qty}</span>;
  return <span className="text-muted-foreground">0</span>;
}

function isThisMonth(raw: string | Date) {
  const d = new Date(raw);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// ── component ─────────────────────────────────────────────────────────────────
export default function StockHistory() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: movements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/stock-movements"],
    queryFn: () => fetch("/api/stock-movements", { credentials: "include" }).then(r => r.json()),
  });

  // Unique products for filter dropdown
  const products = useMemo(() => {
    const seen = new Map<number, string>();
    for (const m of movements) {
      if (m.productId && m.productName && !seen.has(m.productId)) {
        seen.set(m.productId, m.productName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [movements]);

  // Filtered movements
  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (filterType !== "all" && m.type !== filterType) return false;
      if (filterProduct !== "all" && String(m.productId) !== filterProduct) return false;
      if (dateFrom && new Date(m.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(m.createdAt) > new Date(dateTo + "T23:59:59")) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(m.productName ?? "").toLowerCase().includes(q) &&
          !(m.productSku ?? "").toLowerCase().includes(q) &&
          !(m.reason ?? "").toLowerCase().includes(q) &&
          !(String(m.orderId ?? "")).includes(q)
        ) return false;
      }
      return true;
    });
  }, [movements, filterType, filterProduct, dateFrom, dateTo, search]);

  // Summary cards — this month only
  const thisMonth = useMemo(() => movements.filter(m => isThisMonth(m.createdAt)), [movements]);
  const totalEntrees = useMemo(() => thisMonth.filter(m => m.quantity > 0).reduce((s, m) => s + m.quantity, 0), [thisMonth]);
  const totalSorties = useMemo(() => Math.abs(thisMonth.filter(m => m.quantity < 0).reduce((s, m) => s + m.quantity, 0)), [thisMonth]);

  const hasFilters = search || filterType !== "all" || filterProduct !== "all" || dateFrom || dateTo;

  function clearFilters() {
    setSearch("");
    setFilterType("all");
    setFilterProduct("all");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Historique Stock</h1>
        <p className="text-sm text-muted-foreground mt-1">Journal complet des mouvements de stock</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 rounded-2xl border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground font-medium">Entrées ce mois</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">+{totalEntrees}</div>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-muted-foreground font-medium">Sorties ce mois</span>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">-{totalSorties}</div>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground font-medium">Mouvements ce mois</span>
          </div>
          <div className="text-2xl font-bold">{thisMonth.length}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border-border/50">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Rechercher produit, raison, commande…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue placeholder="Tous les types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="restock">Entrée stock</SelectItem>
              <SelectItem value="shipped">Expédition</SelectItem>
              <SelectItem value="returned">Retour</SelectItem>
              <SelectItem value="delivered">Livraison</SelectItem>
              <SelectItem value="adjustment">Ajustement</SelectItem>
              <SelectItem value="manual">Manuel</SelectItem>
            </SelectContent>
          </Select>

          {/* Product filter */}
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="h-9 text-sm w-[200px]">
              <SelectValue placeholder="Tous les produits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les produits</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              className="h-9 text-sm w-[140px]"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input
              type="date"
              className="h-9 text-sm w-[140px]"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="w-3.5 h-3.5" /> Effacer
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {filtered.length} mouvement{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
          {hasFilters ? " (filtrés)" : ""}
        </p>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">Date & heure</TableHead>
                <TableHead className="text-xs font-semibold">Produit</TableHead>
                <TableHead className="text-xs font-semibold">Type</TableHead>
                <TableHead className="text-xs font-semibold text-right">Quantité</TableHead>
                <TableHead className="text-xs font-semibold">Raison</TableHead>
                <TableHead className="text-xs font-semibold">Commande</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    Chargement…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    {hasFilters ? "Aucun résultat pour ces filtres." : "Aucun mouvement enregistré."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m: any) => (
                  <TableRow key={m.id} className="hover:bg-muted/20">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(m.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium leading-tight">{m.productName ?? "—"}</div>
                      {m.productSku && (
                        <div className="text-xs text-muted-foreground font-mono">{m.productSku}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={m.type} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <QtyCell qty={m.quantity} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {m.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.orderId ? (
                        <Link href={`/orders?highlight=${m.orderId}`} className="text-blue-600 hover:underline font-medium">
                          #{m.orderId}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

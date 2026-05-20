import { useState, useMemo } from "react";
import { useCustomers } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, RefreshCw, MapPin, Phone, Package, LayoutList, Trophy, X } from "lucide-react";
import { Redirect } from "wouter";
import type { Customer } from "@shared/schema";

// ── Order-history popup ──────────────────────────────────────────────
function ClientOrdersDialog({ client, onClose }: { client: any; onClose: () => void }) {
  const deliveredCount = (client.orders || []).filter((o: any) => o.isDelivered).length;
  const isLoyal = deliveredCount >= 2;

  const bannerText = isLoyal
    ? `🏆 Client fidèle — ${deliveredCount} commandes livrées. Priorité haute ✅`
    : `Client — ${deliveredCount} commande(s) livrée(s) sur ${client.orders?.length || 0}`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">
                Commandes — {client.customerPhone}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {client.customerName} · {client.customerCity || "—"}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Loyalty banner */}
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
            isLoyal
              ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-muted border border-border text-muted-foreground"
          }`}>
            {bannerText}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 pb-6 mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commande</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Produits</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(client.orders || []).map((order: any, i: number) => (
                <TableRow key={i} data-testid={`row-order-${order.orderNumber}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{order.orderNumber || "—"}
                  </TableCell>
                  <TableCell>{order.city || "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {order.products.length > 0 ? order.products.map((p: any, j: number) => (
                        <div key={j} className="text-sm">
                          <span className="font-medium">{p.productName}</span>
                          {p.sku && <span className="text-muted-foreground text-xs ml-1">({p.sku})</span>}
                          <span className="text-muted-foreground text-xs ml-1">×{p.quantity}</span>
                        </div>
                      )) : <span className="text-muted-foreground text-xs italic">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.isDelivered
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {order.isDelivered ? "✓ Livré" : order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm">
                    {(order.total / 100).toFixed(2)} DH
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {order.date ? new Date(order.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/30 shrink-0 text-sm text-muted-foreground">
          Total : <strong>{client.orders?.length || 0}</strong> commande{(client.orders?.length || 0) !== 1 ? "s" : ""} ·{" "}
          <strong className="text-emerald-600">{deliveredCount}</strong> livrée{deliveredCount !== 1 ? "s" : ""}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { user } = useAuth();
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "fidele" | "loyal">("table");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: fideles, isLoading: fidelesLoading } = useQuery<any[]>({
    queryKey: ["/api/clients/fideles"],
    queryFn: async () => {
      const r = await fetch("/api/clients/fideles", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: loyalClients, isLoading: loyalLoading } = useQuery<any[]>({
    queryKey: ["/api/clients/loyal"],
    queryFn: async () => {
      const r = await fetch("/api/clients/loyal", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load loyal clients");
      return r.json();
    },
  });

  const migrateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customers/migrate"),
    onSuccess: async (res) => {
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/clients/fideles"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/clients/loyal"] });
      toast({ title: "Migration terminée", description: data.message });
    },
    onError: () => {
      toast({ title: "Erreur", description: "La migration a échoué.", variant: "destructive" });
    },
  });

  if (user?.role === "agent") return <Redirect to="/" />;

  const filteredTable = useMemo(() => {
    if (!customers) return [];
    const term = search.toLowerCase().trim();
    if (!term) return customers as Customer[];
    return (customers as Customer[]).filter(
      (c) => c.name.toLowerCase().includes(term) || c.phone.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const filteredFideles = useMemo(() => {
    if (!fideles) return [];
    const term = search.toLowerCase().trim();
    if (!term) return fideles;
    return fideles.filter(
      (c: any) =>
        (c.customerName || "").toLowerCase().includes(term) ||
        (c.customerPhone || "").toLowerCase().includes(term)
    );
  }, [fideles, search]);

  const filteredLoyal = useMemo(() => {
    if (!loyalClients) return [];
    const term = search.toLowerCase().trim();
    if (!term) return loyalClients;
    return loyalClients.filter(
      (c: any) =>
        (c.customerName || "").toLowerCase().includes(term) ||
        (c.customerPhone || "").toLowerCase().includes(term) ||
        (c.productsSummary || "").toLowerCase().includes(term)
    );
  }, [loyalClients, search]);

  const displayCount =
    view === "table" ? filteredTable.length :
    view === "fidele" ? filteredFideles.length :
    filteredLoyal.length;

  const loading =
    view === "table" ? isLoading :
    view === "fidele" ? fidelesLoading :
    loyalLoading;

  const btnBase = "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors";
  const btnActive = "bg-primary text-primary-foreground";
  const btnInactive = "text-muted-foreground hover:bg-muted";

  return (
    <div className="p-4 space-y-4">
      {selectedClient && (
        <ClientOrdersDialog client={selectedClient} onClose={() => setSelectedClient(null)} />
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Liste des Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clients ayant au moins une commande livrée
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full" data-testid="text-customer-count">
            {!loading && `${displayCount} client${displayCount !== 1 ? "s" : ""}`}
          </span>

          <div className="flex items-center border rounded-lg overflow-hidden">
            <button onClick={() => setView("table")} data-testid="button-view-table"
              className={`${btnBase} ${view === "table" ? btnActive : btnInactive}`}>
              <LayoutList className="h-3.5 w-3.5" />Tableau
            </button>
            <button onClick={() => setView("fidele")} data-testid="button-view-fidele"
              className={`${btnBase} ${view === "fidele" ? btnActive : btnInactive}`}>
              <Trophy className="h-3.5 w-3.5" />Fidèles
            </button>
            <button onClick={() => setView("loyal")} data-testid="button-view-loyal"
              className={`${btnBase} ${view === "loyal" ? btnActive : btnInactive}`}>
              🔁 Livrés
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending} data-testid="button-migrate-customers" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${migrateMutation.isPending ? "animate-spin" : ""}`} />
            {migrateMutation.isPending ? "Migration..." : "Synchroniser"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-customers"
            />
          </div>
        </CardHeader>

        {/* ── TABLEAU VIEW ── */}
        {view === "table" && (
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3" data-testid="loading-skeleton">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredTable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="text-empty-state">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Aucun client trouvé</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Les clients sont ajoutés automatiquement lorsqu'une commande passe au statut "Livré".
                  Cliquez sur "Synchroniser" pour importer les clients depuis les commandes existantes.
                </p>
              </div>
            ) : (
              <Table data-testid="table-customers">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom du Client</TableHead>
                    <TableHead><div className="flex items-center gap-1"><Phone className="h-3 w-3" />Téléphone</div></TableHead>
                    <TableHead><div className="flex items-center gap-1"><MapPin className="h-3 w-3" />Ville</div></TableHead>
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Package className="h-3 w-3" />Commandes</div></TableHead>
                    <TableHead className="text-right">Total Achat (DH)</TableHead>
                    <TableHead className="text-right">Date d'ajout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTable.map((customer) => (
                    <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                      <TableCell className="font-medium" data-testid={`text-name-${customer.id}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          {customer.name}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-phone-${customer.id}`}>
                        <span className="font-mono text-sm">{customer.phone}</span>
                      </TableCell>
                      <TableCell data-testid={`text-city-${customer.id}`}>
                        {customer.city || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-orders-${customer.id}`}>
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                          {customer.orderCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold" data-testid={`text-total-spent-${customer.id}`}>
                        {formatCurrency(customer.totalSpent)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm" data-testid={`text-date-${customer.id}`}>
                        {customer.createdAt
                          ? new Date(customer.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}

        {/* ── FIDÈLES VIEW (2+ delivered, clickable rows → popup) ── */}
        {view === "fidele" && (
          <CardContent className="pt-0">
            {fidelesLoading ? (
              <div className="space-y-2 pt-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <div className="pt-2">
                {/* Summary banner */}
                <div className="mb-4 px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-bold text-emerald-800 dark:text-emerald-300">
                      {filteredFideles.length} client{filteredFideles.length !== 1 ? "s" : ""} fidèle{filteredFideles.length !== 1 ? "s" : ""}
                    </div>
                    <div className="text-sm text-emerald-600 dark:text-emerald-500">
                      Livrés 2 fois ou plus — priorité retargeting. Cliquer pour voir l'historique.
                    </div>
                  </div>
                </div>

                {filteredFideles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Trophy className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">Aucun client fidèle pour le moment</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Les clients livrés 2 fois ou plus apparaîtront ici.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Header row */}
                    <div className="hidden md:grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr] gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                      <span>Nom du client</span>
                      <span>Téléphone</span>
                      <span>Ville</span>
                      <span className="text-center">Livraisons</span>
                      <span className="text-right">Total livré</span>
                    </div>

                    <div data-testid="list-fideles">
                      {filteredFideles.map((client: any) => (
                        <div
                          key={client.customerPhone || client.customerName}
                          onClick={() => setSelectedClient(client)}
                          className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr] gap-4 px-4 py-4 items-center border-b hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 cursor-pointer transition-colors"
                          data-testid={`row-fidele-${(client.customerPhone || "").replace(/\s/g, "-")}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                              {(client.customerName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground truncate">{client.customerName}</div>
                              <div className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">
                                🏆 Fidèle · {client.deliveredCount}× livré
                              </div>
                            </div>
                          </div>
                          <div className="text-foreground font-mono text-sm">{client.customerPhone}</div>
                          <div className="text-muted-foreground">{client.customerCity || "—"}</div>
                          <div className="text-center">
                            <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-full bg-emerald-500 text-white font-bold text-sm">
                              {client.deliveredCount}
                            </span>
                          </div>
                          <div className="text-right font-bold text-foreground">
                            {(client.totalSpentDelivered / 100).toFixed(2)} DH
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        )}

        {/* ── LIVRÉS VIEW (all delivered, card style) ── */}
        {view === "loyal" && (
          <CardContent className="pt-0">
            {loyalLoading ? (
              <div className="space-y-3 pt-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-5 py-3">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {filteredLoyal.filter((c: any) => c.isLoyal).length}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">Clients fidèles (livrés 2+ fois)</div>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
                    <div className="text-2xl font-bold text-primary">{filteredLoyal.length}</div>
                    <div className="text-xs text-primary/70 font-medium">Total clients livrés</div>
                  </div>
                </div>

                {filteredLoyal.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">Aucune livraison trouvée</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Les clients apparaissent ici dès qu'au moins une commande est marquée "Livré".
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLoyal.map((client: any) => (
                      <div
                        key={client.customerPhone || client.customerName}
                        className={`border rounded-xl p-5 transition-shadow hover:shadow-md bg-card ${
                          client.isLoyal
                            ? "border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-100 dark:ring-emerald-900/40"
                            : "border-border"
                        }`}
                        data-testid={`card-loyal-${(client.customerPhone || "").replace(/\s/g, "-")}`}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base">
                              {(client.customerName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                                <span>{client.customerName}</span>
                                {client.isLoyal && (
                                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500 text-white">
                                    🔁 Fidèle · {client.deliveredCount}× livré
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {client.customerPhone}{client.customerCity ? ` · ${client.customerCity}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-foreground">
                              {(client.totalSpent / 100).toFixed(2)} DH
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {client.deliveredCount} livraison{client.deliveredCount > 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Produits livrés</div>
                          <div className="flex flex-wrap gap-2">
                            {client.productsList.length > 0 ? client.productsList.map((p: any, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1.5 text-sm bg-muted border border-border rounded-lg px-3 py-1.5">
                                <span className="font-medium text-foreground">{p.name}</span>
                                <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5">×{p.quantity}</span>
                              </span>
                            )) : (
                              <span className="text-sm text-muted-foreground italic">Aucun produit détaillé</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Historique des livraisons</div>
                          <div className="space-y-1.5">
                            {client.deliveries.map((d: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-sm gap-2">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
                                  <span className="text-foreground truncate">
                                    {d.products.length > 0
                                      ? d.products.map((p: any) => `${p.productName} ×${p.quantity}`).join(", ")
                                      : "Commande"}
                                  </span>
                                </span>
                                <span className="text-muted-foreground text-xs whitespace-nowrap shrink-0">
                                  📅 {new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

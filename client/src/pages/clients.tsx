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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, RefreshCw, MapPin, Phone, Package, LayoutList, LayoutGrid } from "lucide-react";
import { Redirect } from "wouter";
import type { Customer } from "@shared/schema";

export default function ClientsPage() {
  const { user } = useAuth();
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clientsStats, isLoading: statsLoading } = useQuery<any[]>({
    queryKey: ["/api/clients/stats"],
    queryFn: async () => {
      const r = await fetch("/api/clients/stats", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load client stats");
      return r.json();
    },
  });

  const migrateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customers/migrate"),
    onSuccess: async (res) => {
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/clients/stats"] });
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
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const filteredStats = useMemo(() => {
    if (!clientsStats) return [];
    const term = search.toLowerCase().trim();
    if (!term) return clientsStats;
    return clientsStats.filter(
      (c: any) =>
        (c.customerName || "").toLowerCase().includes(term) ||
        (c.customerPhone || "").toLowerCase().includes(term) ||
        (c.productsSummary || "").toLowerCase().includes(term)
    );
  }, [clientsStats, search]);

  const displayCount = view === "table" ? filteredTable.length : filteredStats.length;
  const loading = view === "table" ? isLoading : statsLoading;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Liste des Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clients ayant au moins une commande livrée
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full" data-testid="text-customer-count">
            {!loading && `${displayCount} client${displayCount !== 1 ? "s" : ""}`}
          </span>

          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("table")}
              data-testid="button-view-table"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Tableau
            </button>
            <button
              onClick={() => setView("cards")}
              data-testid="button-view-cards"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                view === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Détails
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
            data-testid="button-migrate-customers"
            className="gap-2"
          >
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
              placeholder="Rechercher par nom, téléphone ou produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-customers"
            />
          </div>
        </CardHeader>

        {view === "table" ? (
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3" data-testid="loading-skeleton">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredTable.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16 px-4 text-center"
                data-testid="text-empty-state"
              >
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
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Package className="h-3 w-3" />Nombre de Commandes</div></TableHead>
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
                          ? new Date(customer.createdAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        ) : (
          <CardContent className="pt-0">
            {statsLoading ? (
              <div className="space-y-3 pt-2" data-testid="loading-skeleton-cards">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredStats.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16 px-4 text-center"
                data-testid="text-empty-state-cards"
              >
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Aucun client trouvé</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Les données apparaissent dès qu'une commande est enregistrée, quel que soit son statut.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 pt-2 sm:grid-cols-1 lg:grid-cols-2" data-testid="grid-client-cards">
                {filteredStats.map((client: any) => (
                  <div
                    key={client.customerPhone || client.customerName}
                    className="border rounded-xl p-5 hover:shadow-md transition-shadow bg-card"
                    data-testid={`card-client-${(client.customerPhone || client.customerName || "").replace(/\s/g, "-")}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base">
                          {(client.customerName || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap" data-testid={`text-client-name-${client.customerPhone}`}>
                            <span className="truncate">{client.customerName}</span>
                            {client.isRepeat && (
                              <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                                🔁 Fidèle
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground truncate" data-testid={`text-client-phone-${client.customerPhone}`}>
                            {client.customerPhone}
                            {client.customerCity ? ` · ${client.customerCity}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-foreground" data-testid={`text-client-spent-${client.customerPhone}`}>
                          {(client.totalSpent / 100).toFixed(2)} DH
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {client.orderCount} commande{client.orderCount > 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Produits commandés
                      </div>
                      <div className="flex flex-wrap gap-2" data-testid={`text-client-products-${client.customerPhone}`}>
                        {client.productsList.length > 0 ? client.productsList.map((p: any, i: number) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1.5 text-sm bg-muted border border-border rounded-lg px-3 py-1.5"
                          >
                            <span className="font-medium text-foreground">{p.name}</span>
                            <span className="text-xs font-semibold text-primary bg-primary/10 rounded px-1.5">×{p.quantity}</span>
                          </span>
                        )) : (
                          <span className="text-sm text-muted-foreground italic">Aucun produit détaillé</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span data-testid={`text-client-last-order-${client.customerPhone}`}>
                        📅 Dernière commande : {client.lastOrderDate ? new Date(client.lastOrderDate).toLocaleDateString("fr-FR") : "—"}
                      </span>
                      {client.isRepeat && client.firstOrderDate && (
                        <span>
                          🗓 Client depuis : {new Date(client.firstOrderDate).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

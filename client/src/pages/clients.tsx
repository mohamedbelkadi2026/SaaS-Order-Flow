import { useState, useMemo } from "react";
import { useCustomers } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Search, Users, RefreshCw, MapPin, Phone, Package } from "lucide-react";
import { Redirect } from "wouter";
import type { Customer } from "@shared/schema";

export default function ClientsPage() {
  const { user } = useAuth();
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const migrateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customers/migrate"),
    onSuccess: async (res) => {
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Migration terminée", description: data.message });
    },
    onError: () => {
      toast({ title: "Erreur", description: "La migration a échoué.", variant: "destructive" });
    },
  });

  if (user?.role === "agent") return <Redirect to="/" />;

  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.toLowerCase().trim();
    if (!term) return customers as Customer[];
    return (customers as Customer[]).filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term)
    );
  }, [customers, search]);

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
            {!isLoading && `${filtered.length} client${filtered.length !== 1 ? "s" : ""}`}
          </span>
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
              placeholder="Rechercher par nom ou téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-customers"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3" data-testid="loading-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
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
                {filtered.map((customer) => (
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
      </Card>
    </div>
  );
}

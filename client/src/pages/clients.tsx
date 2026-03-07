import { useState, useMemo } from "react";
import { useCustomers } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users } from "lucide-react";
import type { Customer } from "@shared/schema";

export default function ClientsPage() {
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");

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
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Liste des Clients
        </h1>
        <div className="text-sm text-muted-foreground" data-testid="text-customer-count">
          {!isLoading && `${filtered.length} client${filtered.length !== 1 ? "s" : ""}`}
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
              className="flex flex-col items-center justify-center py-12 px-4 text-center"
              data-testid="text-empty-state"
            >
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Aucun client trouvé. Les clients sont ajoutés automatiquement à partir des commandes.
              </p>
            </div>
          ) : (
            <Table data-testid="table-customers">
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead className="text-center">Commandes</TableHead>
                  <TableHead className="text-right">Total Dépensé</TableHead>
                  <TableHead className="text-right">Date d'ajout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((customer) => (
                  <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                    <TableCell className="font-medium" data-testid={`text-name-${customer.id}`}>
                      {customer.name}
                    </TableCell>
                    <TableCell data-testid={`text-phone-${customer.id}`}>
                      {customer.phone}
                    </TableCell>
                    <TableCell data-testid={`text-city-${customer.id}`}>
                      {customer.city || "—"}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-orders-${customer.id}`}>
                      {customer.orderCount}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-total-spent-${customer.id}`}>
                      {formatCurrency(customer.totalSpent)}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-date-${customer.id}`}>
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

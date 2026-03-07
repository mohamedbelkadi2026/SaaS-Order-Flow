import { useAdminStats, useAdminStores, useToggleStore } from "@/hooks/use-store-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Store, ShoppingBag, DollarSign, Loader2, ShieldAlert } from "lucide-react";

export default function AdminPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminStats();
  const { data: stores, isLoading: storesLoading, error: storesError } = useAdminStores();
  const toggleStore = useToggleStore();

  const is403 = (statsError as any)?.message?.includes("Failed to fetch admin stats") ||
    (storesError as any)?.message?.includes("Failed to fetch admin stores");

  if (is403) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" data-testid="admin-access-denied">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <h1 className="text-2xl font-bold text-destructive">Accès refusé</h1>
        <p className="text-muted-foreground">Accès refusé - Vous n'êtes pas super administrateur</p>
      </div>
    );
  }

  const isLoading = statsLoading || storesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="admin-loading">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleToggle = (storeId: number, currentlyActive: boolean) => {
    toggleStore.mutate({ storeId, isActive: currentlyActive ? 0 : 1 });
  };

  return (
    <div className="p-6 space-y-6" data-testid="admin-panel">
      <h1 className="text-2xl font-bold" data-testid="admin-title">Panel Super Admin</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="stat-total-stores">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Boutiques</CardTitle>
            <Store className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-stores-value">
              {stats?.totalStores ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-active-stores">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boutiques Actives</CardTitle>
            <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-stores-value">
              {stats?.activeStores ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-total-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenu Total</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-revenue-value">
              {((stats?.totalRevenue ?? 0) / 100).toFixed(2)} DH
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Toutes les Boutiques</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="admin-stores-table">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Email Propriétaire</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Commandes ce mois</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores && stores.length > 0 ? (
                stores.map((store: any) => {
                  const plan = store.subscription?.plan || "Aucun";
                  const monthOrders = store.subscription?.currentMonthOrders || 0;
                  const isActive = store.subscription?.isActive === 1;

                  return (
                    <TableRow key={store.id} data-testid={`store-row-${store.id}`}>
                      <TableCell data-testid={`store-id-${store.id}`}>{store.id}</TableCell>
                      <TableCell data-testid={`store-name-${store.id}`}>{store.name}</TableCell>
                      <TableCell data-testid={`store-email-${store.id}`}>{store.ownerEmail || "—"}</TableCell>
                      <TableCell data-testid={`store-plan-${store.id}`}>{plan}</TableCell>
                      <TableCell data-testid={`store-orders-${store.id}`}>{monthOrders}</TableCell>
                      <TableCell data-testid={`store-status-${store.id}`}>
                        {isActive ? (
                          <Badge className="bg-green-600 text-white no-default-hover-elevate">Actif</Badge>
                        ) : (
                          <Badge className="bg-red-600 text-white no-default-hover-elevate">Inactif</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggle(store.id, isActive)}
                            disabled={toggleStore.isPending}
                            data-testid={`toggle-store-${store.id}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            {isActive ? "Désactiver" : "Activer"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Aucune boutique trouvée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

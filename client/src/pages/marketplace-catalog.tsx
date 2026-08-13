import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, ShoppingCart, Truck, Box } from "lucide-react";

interface MarketplaceProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  suggestedPrice: number;   // centimes
  productCost: number;      // centimes
  deliveryFee: number;      // centimes (35 DH)
  packagingFee: number;     // centimes (6 DH)
  availableStock: number;
}

export default function MarketplaceCatalog() {
  const [, navigate] = useLocation();
  const { data: products = [], isLoading, error } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace/products"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Accès réservé aux comptes Seller TajerDrop.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Catalogue TajerDrop</h1>
        <p className="text-sm text-muted-foreground">
          Produits du catalogue partagé — coûts transparents. Fixez votre prix de vente client pour calculer votre marge.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Aucun produit dans le catalogue pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => {
            const totalCost = p.productCost + p.deliveryFee + p.packagingFee;
            return (
              <Card key={p.id} data-testid={`card-marketplace-product-${p.id}`} className="overflow-hidden">
                <div className="h-40 bg-muted flex items-center justify-center">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-10 h-10 text-muted-foreground/40" />
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight">{p.name}</h3>
                    <Badge variant={p.availableStock > 0 ? "secondary" : "destructive"} className="shrink-0">
                      Stock: {p.availableStock}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Coût produit</span>
                      <span className="font-medium">{formatCurrency(p.productCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Livraison</span>
                      <span className="font-medium">{formatCurrency(p.deliveryFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Box className="w-3.5 h-3.5" /> Emballage</span>
                      <span className="font-medium">{formatCurrency(p.packagingFee)}</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t">
                      <span className="text-muted-foreground">Coût total</span>
                      <span className="font-bold">{formatCurrency(totalCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prix suggéré</span>
                      <span className="font-semibold text-primary">{formatCurrency(p.suggestedPrice)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="sm"
                    disabled={p.availableStock <= 0}
                    onClick={() => navigate(`/orders/new?productId=${p.id}`)}
                    data-testid={`button-create-order-${p.id}`}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Créer une commande
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

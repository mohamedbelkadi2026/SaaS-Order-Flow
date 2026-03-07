import { useProducts } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Package } from "lucide-react";

export default function Inventory() {
  const { data: products, isLoading } = useProducts();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-inventory-title">Stock</h1>
          <p className="text-muted-foreground mt-1">Gérez les niveaux de stock synchronisés avec les commandes.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Ajouter Produit</Button>
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Nom du Produit</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Prix Coûtant</TableHead>
              <TableHead>Niveau Stock</TableHead>
              <TableHead className="text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : products?.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                   <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                   Aucun produit dans l'inventaire.
                 </TableCell>
               </TableRow>
            ) : (
              products?.map((product: any) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{product.sku}</TableCell>
                  <TableCell>{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell className="font-semibold">{product.stock} unités</TableCell>
                  <TableCell className="text-right">
                    {product.stock > 10 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">En Stock</Badge>
                    ) : product.stock > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Stock Bas</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rupture</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

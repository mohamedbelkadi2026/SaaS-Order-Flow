import { useState } from "react";
import { useOrders, useProducts, useAdSpend, useUpsertAdSpend } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, DollarSign, ArrowDownRight, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Profitability() {
  const { data: orders, isLoading } = useOrders();
  const { data: products } = useProducts();
  const { toast } = useToast();
  const upsertAdSpend = useUpsertAdSpend();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [adSpendDate, setAdSpendDate] = useState(new Date().toISOString().split('T')[0]);
  const [adSpendAmount, setAdSpendAmount] = useState("");
  const [adSpendProduct, setAdSpendProduct] = useState<string>("");

  const validOrders = (selectedProduct === "all" 
    ? orders 
    : orders?.filter((o: any) => o.items?.some((i: any) => i.productId === parseInt(selectedProduct)))
  )?.filter((o: any) => o.status === 'delivered' || o.status === 'confirmed') || [];

  const aggregate = validOrders.reduce((acc: any, order: any) => {
    const profit = order.totalPrice - order.productCost - order.shippingCost - order.adSpend;
    return {
      revenue: acc.revenue + order.totalPrice,
      productCost: acc.productCost + order.productCost,
      shippingCost: acc.shippingCost + order.shippingCost,
      adSpend: acc.adSpend + order.adSpend,
      netProfit: acc.netProfit + profit,
    };
  }, { revenue: 0, productCost: 0, shippingCost: 0, adSpend: 0, netProfit: 0 });

  const profitMargin = aggregate.revenue > 0 ? (aggregate.netProfit / aggregate.revenue) * 100 : 0;

  const handleSaveAdSpend = async () => {
    if (!adSpendAmount || !adSpendDate) {
      toast({ title: "Erreur", description: "Date et montant requis", variant: "destructive" });
      return;
    }
    try {
      await upsertAdSpend.mutateAsync({
        productId: adSpendProduct ? parseInt(adSpendProduct) : null,
        date: adSpendDate,
        amount: Math.round(parseFloat(adSpendAmount) * 100),
      });
      toast({ title: "Enregistré", description: "Dépense pub enregistrée" });
      setAdSpendAmount("");
    } catch {
      toast({ title: "Erreur", description: "Erreur d'enregistrement", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-profitability-title">Rentabilité Avancée</h1>
          <p className="text-muted-foreground mt-1">Analyse en temps réel de vos marges nettes et coûts.</p>
        </div>
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger className="w-[200px]" data-testid="select-profit-product">
            <SelectValue placeholder="Tous les produits" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les produits</SelectItem>
            {products?.map((p: any) => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 opacity-90">
              <Calculator className="w-5 h-5" />
              <h3 className="font-medium">Profit Net Total</h3>
            </div>
            <p className="text-4xl font-display font-bold" data-testid="text-net-profit">{formatCurrency(aggregate.netProfit)}</p>
            <p className="mt-2 text-primary-foreground/80 text-sm">
              Marge: {profitMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 text-muted-foreground">
              <DollarSign className="w-5 h-5" />
              <h3 className="font-medium">Revenu Total</h3>
            </div>
            <p className="text-3xl font-display font-bold text-foreground">{formatCurrency(aggregate.revenue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <ArrowDownRight className="w-5 h-5" />
              <h3 className="font-medium">Coûts Totaux</h3>
            </div>
            <p className="text-3xl font-display font-bold text-foreground">
              {formatCurrency(aggregate.productCost + aggregate.shippingCost + aggregate.adSpend)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle className="text-lg">Enregistrer une Dépense Pub</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Date</label>
              <Input
                data-testid="input-ad-date"
                type="date"
                value={adSpendDate}
                onChange={(e) => setAdSpendDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Produit</label>
              <Select value={adSpendProduct} onValueChange={setAdSpendProduct}>
                <SelectTrigger data-testid="select-ad-product">
                  <SelectValue placeholder="Tous les produits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les produits</SelectItem>
                  {products?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Montant (MAD)</label>
              <Input
                data-testid="input-ad-amount"
                type="number"
                placeholder="Ex: 500.00"
                value={adSpendAmount}
                onChange={(e) => setAdSpendAmount(e.target.value)}
              />
            </div>
            <Button
              data-testid="button-save-ad-spend"
              onClick={handleSaveAdSpend}
              disabled={upsertAdSpend.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="w-4 h-4 mr-2" />
              {upsertAdSpend.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle className="text-lg">Détail par Commande</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commande</TableHead>
                <TableHead className="text-right">Revenu</TableHead>
                <TableHead className="text-right text-destructive/80">Coût Produit</TableHead>
                <TableHead className="text-right text-destructive/80">Livraison</TableHead>
                <TableHead className="text-right text-destructive/80">Dépense Pub</TableHead>
                <TableHead className="text-right font-bold text-primary">Profit Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">Chargement...</TableCell></TableRow>
              ) : validOrders.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucune commande livrée ou confirmée.</TableCell></TableRow>
              ) : (
                validOrders.map((order: any) => {
                  const profit = order.totalPrice - order.productCost - order.shippingCost - order.adSpend;
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">#{order.orderNumber}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.totalPrice)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">-{formatCurrency(order.productCost)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">-{formatCurrency(order.shippingCost)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">-{formatCurrency(order.adSpend)}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{formatCurrency(profit)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

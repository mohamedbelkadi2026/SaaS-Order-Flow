import { useOrders } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function Profitability() {
  const { data: orders, isLoading } = useOrders();

  // Filter only completed/confirmed orders for profitability calculation to be realistic
  const validOrders = orders?.filter((o: any) => o.status === 'delivered' || o.status === 'confirmed') || [];

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold">Advanced Profitability</h1>
        <p className="text-muted-foreground mt-1">Real-time breakdown of your net margins and costs.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 opacity-90">
              <Calculator className="w-5 h-5" />
              <h3 className="font-medium">Total Net Profit</h3>
            </div>
            <p className="text-4xl font-display font-bold">{formatCurrency(aggregate.netProfit)}</p>
            <p className="mt-2 text-primary-foreground/80 text-sm">
              Margin: {profitMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 text-muted-foreground">
              <DollarSign className="w-5 h-5" />
              <h3 className="font-medium">Total Revenue</h3>
            </div>
            <p className="text-3xl font-display font-bold text-foreground">{formatCurrency(aggregate.revenue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <ArrowDownRight className="w-5 h-5" />
              <h3 className="font-medium">Total Costs</h3>
            </div>
            <p className="text-3xl font-display font-bold text-foreground">
              {formatCurrency(aggregate.productCost + aggregate.shippingCost + aggregate.adSpend)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <CardTitle className="text-lg">Order Level Breakdown</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right text-destructive/80">Product Cost</TableHead>
                <TableHead className="text-right text-destructive/80">Shipping</TableHead>
                <TableHead className="text-right text-destructive/80">Ad Spend</TableHead>
                <TableHead className="text-right font-bold text-primary">Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                 <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
              ) : validOrders.length === 0 ? (
                 <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No delivered or confirmed orders yet.</TableCell></TableRow>
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

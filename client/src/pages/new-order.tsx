import { useState } from "react";
import { useLocation } from "wouter";
import { useProducts, useCreateOrder } from "@/hooks/use-store-data";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Product } from "@shared/schema";

interface OrderLineItem {
  productId: number;
  quantity: number;
  price: number;
}

export default function NewOrder() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const createOrder = useCreateOrder();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<OrderLineItem[]>([]);

  const addItem = () => {
    setItems([...items, { productId: 0, quantity: 1, price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderLineItem, value: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleProductSelect = (index: number, productId: string) => {
    const pid = parseInt(productId);
    const product = (products as Product[]).find((p) => p.id === pid);
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: pid,
      price: product?.costPrice || 0,
    };
    setItems(updated);
  };

  const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const shippingCostCents = Math.round(parseFloat(shippingCost || "0") * 100);
  const totalPrice = itemsTotal + shippingCostCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim() || !customerPhone.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom et le téléphone du client sont obligatoires.",
        variant: "destructive",
      });
      return;
    }

    if (items.length === 0 || items.some((item) => item.productId === 0)) {
      toast({
        title: "Erreur",
        description: "Veuillez ajouter au moins un produit valide.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createOrder.mutateAsync({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim() || undefined,
        customerCity: customerCity.trim() || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        shippingCost: shippingCostCents || undefined,
        comment: comment.trim() || undefined,
      });

      toast({
        title: "Succès",
        description: "La commande a été créée avec succès.",
      });
      navigate("/orders");
    } catch (error: any) {
      if (error?.message?.includes("403") || error?.status === 403) {
        toast({
          title: "Limite atteinte",
          description:
            "Vous avez atteint la limite de commandes de votre abonnement. Veuillez mettre à niveau votre plan.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erreur",
          description:
            error?.message || "Une erreur est survenue lors de la création de la commande.",
          variant: "destructive",
        });
      }
    }
  };

  const availableProducts = (products as Product[]).filter(
    (p) => !items.some((item) => item.productId === p.id)
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">
        Nouvelle Commande
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informations Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Nom du client *</Label>
                <Input
                  id="customerName"
                  data-testid="input-customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nom complet"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Téléphone *</Label>
                <Input
                  id="customerPhone"
                  data-testid="input-customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="06XXXXXXXX"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerAddress">Adresse</Label>
                <Input
                  id="customerAddress"
                  data-testid="input-customer-address"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Adresse de livraison"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerCity">Ville</Label>
                <Input
                  id="customerCity"
                  data-testid="input-customer-city"
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  placeholder="Ville"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Produits</CardTitle>
            <Button
              type="button"
              size="sm"
              onClick={addItem}
              data-testid="button-add-product"
              disabled={productsLoading || availableProducts.length === 0}
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {productsLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Chargement des produits...
                </span>
              </div>
            )}

            {items.length === 0 && !productsLoading && (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-products">
                Aucun produit ajouté. Cliquez sur "Ajouter" pour commencer.
              </p>
            )}

            {items.map((item, index) => {
              const selectedProduct = (products as Product[]).find(
                (p) => p.id === item.productId
              );
              const selectableProducts = [
                ...(selectedProduct ? [selectedProduct] : []),
                ...availableProducts,
              ];

              return (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-3 p-3 border rounded-md"
                  data-testid={`row-product-${index}`}
                >
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label>Produit</Label>
                    <Select
                      value={item.productId ? String(item.productId) : ""}
                      onValueChange={(val) => handleProductSelect(index, val)}
                    >
                      <SelectTrigger data-testid={`select-product-${index}`}>
                        <SelectValue placeholder="Choisir un produit" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableProducts.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} (Stock: {p.stock})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label>Quantité</Label>
                    <Input
                      type="number"
                      min={1}
                      data-testid={`input-quantity-${index}`}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, "quantity", parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label>Prix (DH)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      data-testid={`input-price-${index}`}
                      value={(item.price / 100).toFixed(2)}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "price",
                          Math.round(parseFloat(e.target.value || "0") * 100)
                        )
                      }
                    />
                  </div>
                  <div className="w-28 text-sm font-medium self-end pb-2" data-testid={`text-line-total-${index}`}>
                    {formatCurrency(item.quantity * item.price)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    data-testid={`button-remove-product-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shippingCost">Frais de livraison (DH)</Label>
                <Input
                  id="shippingCost"
                  type="number"
                  min={0}
                  step="0.01"
                  data-testid="input-shipping-cost"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <div className="space-y-1">
                  <Label>Total</Label>
                  <p className="text-xl font-bold" data-testid="text-total-price">
                    {formatCurrency(totalPrice)}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="comment">Commentaire</Label>
              <Textarea
                id="comment"
                data-testid="input-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Notes ou instructions spéciales..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/orders")}
            data-testid="button-cancel"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={createOrder.isPending}
            data-testid="button-submit-order"
          >
            {createOrder.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Créer la commande
          </Button>
        </div>
      </form>
    </div>
  );
}

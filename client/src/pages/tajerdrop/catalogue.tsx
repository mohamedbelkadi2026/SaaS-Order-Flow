import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, Package, ShoppingCart, Truck, Box, ChevronRight,
  TrendingUp, Search, ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const GOLD = "#C5A059";
const NAVY = "#0f1e38";

interface Variant {
  id: number; name: string; sku: string; stock: number;
  costPrice: number; sellingPrice: number; imageUrl: string | null;
}
interface MarketplaceProduct {
  id: number; name: string; description: string | null; imageUrl: string | null;
  images: string[]; category: string | null;
  suggestedPrice: number; productCost: number; deliveryFee: number; packagingFee: number;
  availableStock: number; hasVariants: boolean; variants: Variant[];
}

function MarginBadge({ margin }: { margin: number }) {
  const color = margin >= 40 ? "#16a34a" : margin >= 20 ? "#ca8a04" : "#dc2626";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: color + "18", color }}>
      <TrendingUp className="w-3 h-3" />
      {margin}% marge
    </span>
  );
}

function ProductCard({ p, onSelect, requested, onRequest }: { p: MarketplaceProduct; onSelect: () => void; requested?: boolean; onRequest: () => void }) {
  const totalCost = p.productCost + p.deliveryFee + p.packagingFee;
  const margin = p.suggestedPrice > 0
    ? Math.round(((p.suggestedPrice - totalCost) / p.suggestedPrice) * 100)
    : 0;

  return (
    <Card className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onSelect}>
      <div className="h-44 bg-muted relative overflow-hidden">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}
        {p.category && (
          <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
            {p.category}
          </span>
        )}
        {p.availableStock <= 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-semibold">Rupture de stock</span>
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{p.name}</h3>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>

        {margin > 0 && <MarginBadge margin={margin} />}

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-1"><Package className="w-3 h-3" /> Produit</span>
            <span>{formatCurrency(p.productCost)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> Livraison</span>
            <span>{formatCurrency(p.deliveryFee)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-1"><Box className="w-3 h-3" /> Emballage</span>
            <span>{formatCurrency(p.packagingFee)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t font-medium">
            <span>Coût total</span>
            <span>{formatCurrency(totalCost)}</span>
          </div>
          <div className="flex justify-between text-base font-bold" style={{ color: GOLD }}>
            <span>Prix suggéré</span>
            <span>{formatCurrency(p.suggestedPrice)}</span>
          </div>
        </div>

        <Button
          className="w-full text-white"
          size="sm"
          style={{ background: NAVY }}
          disabled={p.availableStock <= 0}
           onClick={(e) => { e.stopPropagation(); requested ? onSelect() : onRequest(); }}
        >
          <ShoppingCart className="w-4 h-4 mr-2" />
           {requested ? "Voir le produit" : "Demander l'accès"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProductDetail({ p, onBack }: { p: MarketplaceProduct; onBack: () => void }) {
  const [, navigate] = useLocation();
  const [sellingPrice, setSellingPrice] = useState(String(Math.round(p.suggestedPrice / 100)));
  const totalCost = p.productCost + p.deliveryFee + p.packagingFee;
  const priceVal  = Number(sellingPrice) * 100;
  const margin    = priceVal > totalCost ? priceVal - totalCost : 0;
  const marginPct = priceVal > 0 ? Math.round((margin / priceVal) * 100) : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={onBack} className="text-sm flex items-center gap-1 text-muted-foreground hover:text-foreground">
        ← Retour au catalogue
      </button>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Image */}
        <div className="aspect-square rounded-xl overflow-hidden bg-muted">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">{p.name}</h2>
            {p.category && <Badge variant="secondary" className="mt-1">{p.category}</Badge>}
            {p.description && <p className="text-sm text-muted-foreground mt-2">{p.description}</p>}
          </div>

          {/* Margin calculator */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: NAVY + "08", border: `1px solid ${NAVY}15` }}>
            <h3 className="text-sm font-semibold">Calculateur de marge</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Coût produit</span><span>{formatCurrency(p.productCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Livraison</span><span>{formatCurrency(p.deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Emballage</span><span>{formatCurrency(p.packagingFee)}</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-1.5">
                <span>Coût total</span><span>{formatCurrency(totalCost)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Votre prix de vente (DH)</label>
              <Input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="mt-1"
                min={0}
                step={1}
              />
            </div>

            {priceVal > 0 && (
              <div className="rounded-lg p-3" style={{ background: margin > 0 ? "#16a34a18" : "#dc262618" }}>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Votre marge</span>
                  <span style={{ color: margin > 0 ? "#16a34a" : "#dc2626" }}>
                    {formatCurrency(margin)} ({marginPct}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          <Button
            className="w-full text-white font-semibold"
            style={{ background: GOLD }}
            disabled={p.availableStock <= 0}
            onClick={() => navigate(`/orders/new?productId=${p.id}`)}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Créer une commande
          </Button>

          {p.availableStock <= 5 && p.availableStock > 0 && (
            <p className="text-xs text-center text-amber-600">
              Plus que {p.availableStock} unité(s) disponible(s)
            </p>
          )}
          {p.availableStock <= 0 && (
            <p className="text-xs text-center text-red-500">Produit en rupture de stock</p>
          )}
        </div>
      </div>

      {/* Variants */}
      {p.hasVariants && p.variants.length > 0 && (
        <div className="rounded-xl border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Variantes disponibles</h3>
          <div className="space-y-2">
            {p.variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <span>{v.name}</span>
                <span className={v.stock > 0 ? "text-green-600" : "text-red-500"}>
                  {v.stock > 0 ? `${v.stock} en stock` : "Épuisé"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TajerDropCatalogue() {
  const [selected, setSelected] = useState<MarketplaceProduct | null>(null);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: products = [], isLoading, error } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace/products"],
  });
  const { data: requests = [] } = useQuery<any[]>({ queryKey: ["/api/marketplace/offer-requests"] });
  const requestMutation = useMutation({
    mutationFn: (productId: number) => apiRequest("POST", "/api/marketplace/offer-requests", { productId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketplace/offer-requests"] }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  if (error) return (
    <div className="p-6 text-center text-sm text-red-500">
      Erreur de chargement du catalogue.
    </div>
  );

  if (selected) return <ProductDetail p={selected} onBack={() => setSelected(null)} />;

  const filtered = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(search.toLowerCase())
      )
    : products;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Catalogue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {products.length} produit{products.length !== 1 ? "s" : ""} disponible{products.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground text-sm">
            {search ? "Aucun produit trouvé." : "Aucun produit dans le catalogue pour le moment."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
           {filtered.map((p) => (
             <ProductCard key={p.id} p={p} requested={requests.some((r:any) => r.productId === p.id && r.status !== "rejected")} onRequest={() => requestMutation.mutate(p.id)} onSelect={() => setSelected(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

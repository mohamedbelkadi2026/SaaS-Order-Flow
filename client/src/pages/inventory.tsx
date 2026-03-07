import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package, Pencil, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Inventory() {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const [form, setForm] = useState({ name: "", sku: "", stock: "", costPrice: "", reference: "" });

  const resetForm = () => setForm({ name: "", sku: "", stock: "", costPrice: "", reference: "" });

  const handleCreate = async () => {
    if (!form.name || !form.sku) {
      toast({ title: "Erreur", description: "Nom et SKU requis", variant: "destructive" });
      return;
    }
    try {
      await createProduct.mutateAsync({
        name: form.name,
        sku: form.sku,
        stock: form.stock ? parseInt(form.stock) : 0,
        costPrice: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : 0,
        reference: form.reference || undefined,
      });
      toast({ title: "Produit ajout\u00e9", description: `${form.name} a \u00e9t\u00e9 ajout\u00e9` });
      setAddOpen(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const handleEdit = async () => {
    if (!editingProduct) return;
    try {
      await updateProduct.mutateAsync({
        id: editingProduct.id,
        name: form.name || undefined,
        sku: form.sku || undefined,
        stock: form.stock ? parseInt(form.stock) : undefined,
        costPrice: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : undefined,
        reference: form.reference || undefined,
      });
      toast({ title: "Produit mis \u00e0 jour", description: `${form.name} a \u00e9t\u00e9 modifi\u00e9` });
      setEditOpen(false);
      setEditingProduct(null);
      resetForm();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (product: any) => {
    if (!confirm(`Supprimer ${product.name} ?`)) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      toast({ title: "Supprim\u00e9", description: `${product.name} a \u00e9t\u00e9 supprim\u00e9` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      stock: String(product.stock),
      costPrice: (product.costPrice / 100).toFixed(2),
      reference: product.reference || "",
    });
    setEditOpen(true);
  };

  const filtered = products?.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const ProductForm = ({ onSubmit, isPending, buttonText }: { onSubmit: () => void; isPending: boolean; buttonText: string }) => (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Nom du produit</label>
          <Input data-testid="input-product-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">SKU</label>
          <Input data-testid="input-product-sku" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Stock</label>
          <Input data-testid="input-product-stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Prix co\u00fbtant (MAD)</label>
          <Input data-testid="input-product-cost" type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">R\u00e9f\u00e9rence</label>
        <Input data-testid="input-product-reference" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button data-testid="button-save-product" onClick={onSubmit} disabled={isPending}>
          {isPending ? "Enregistrement..." : buttonText}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-inventory-title">Stock</h1>
          <p className="text-muted-foreground mt-1">G\u00e9rez les niveaux de stock synchronis\u00e9s avec les commandes.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20" data-testid="button-add-product"><Plus className="w-4 h-4 mr-2" /> Ajouter Produit</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajouter un produit</DialogTitle></DialogHeader>
            <ProductForm onSubmit={handleCreate} isPending={createProduct.isPending} buttonText="Ajouter" />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input data-testid="input-search-products" placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Nom du Produit</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Prix Co\u00fbtant</TableHead>
              <TableHead>Niveau Stock</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Aucun produit dans l'inventaire.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product: any) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{product.sku}</TableCell>
                  <TableCell>{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell className="font-semibold">{product.stock} unit\u00e9s</TableCell>
                  <TableCell>
                    {product.stock > 10 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">En Stock</Badge>
                    ) : product.stock > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Stock Bas</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rupture</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="w-8 h-8" data-testid={`button-edit-product-${product.id}`} onClick={() => openEdit(product)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700" data-testid={`button-delete-product-${product.id}`} onClick={() => handleDelete(product)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingProduct(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
          <ProductForm onSubmit={handleEdit} isPending={updateProduct.isPending} buttonText="Mettre \u00e0 jour" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

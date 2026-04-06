import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useInventoryStats } from "@/hooks/use-store-data";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Package, Pencil, Trash2, Search, AlertTriangle, TrendingUp, Boxes, PackageX, BarChart3, X, History, Brain, Sparkles, ImageUp, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VariantForm {
  name: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stock: string;
}

export default function Inventory() {
  const { data: inventoryData, isLoading: statsLoading } = useInventoryStats();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();
  const [logsProductId, setLogsProductId] = useState<number | null>(null);
  const [logsProductName, setLogsProductName] = useState<string>("");

  // Quick AI description edit state
  const [aiEditProduct, setAiEditProduct] = useState<any | null>(null);
  const [aiDescription, setAiDescription] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  const openAiEdit = (product: any) => {
    setAiEditProduct(product);
    setAiDescription(product.descriptionDarija || "");
  };

  const handleAiSave = async () => {
    if (!aiEditProduct) return;
    setAiSaving(true);
    try {
      await updateProduct.mutateAsync({ id: aiEditProduct.id, descriptionDarija: aiDescription || null });
      toast({ title: "✅ Description AI sauvegardée", description: `Le produit "${aiEditProduct.name}" est prêt pour l'IA.` });
      setAiEditProduct(null);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    } finally {
      setAiSaving(false);
    }
  };

  const { data: stockLogsData, isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ["/api/stock-logs", logsProductId],
    enabled: logsProductId !== null,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<VariantForm[]>([]);

  const [form, setForm] = useState({
    name: "", sku: "", stock: "", costPrice: "", sellingPrice: "",
    description: "", reference: "",
    descriptionDarija: "", aiFeatures: "", imageUrl: "",
  });

  // File upload state — shared between Add and Edit dialogs (only one open at a time)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setPendingFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  }, []);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  };

  // Upload pending file to server and return the URL
  const uploadFile = async (): Promise<string | null> => {
    if (!pendingFile) return null;
    const fd = new FormData();
    fd.append("image", pendingFile);
    const res = await fetch("/api/upload/product-image", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) throw new Error("Échec de l'upload de l'image");
    const data = await res.json();
    return data.url as string;
  };

  const resetForm = () => {
    setForm({ name: "", sku: "", stock: "", costPrice: "", sellingPrice: "", description: "", reference: "", descriptionDarija: "", aiFeatures: "", imageUrl: "" });
    setHasVariants(false);
    setVariants([]);
    clearFile();
  };

  const addVariant = () => {
    setVariants(v => [...v, { name: "", sku: "", costPrice: "", sellingPrice: "", stock: "" }]);
  };

  const removeVariant = (idx: number) => {
    setVariants(v => v.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, field: keyof VariantForm, value: string) => {
    setVariants(v => v.map((vr, i) => i === idx ? { ...vr, [field]: value } : vr));
  };

  const handleCreate = async () => {
    if (!form.name || !form.sku) {
      toast({ title: "Erreur", description: "Nom et SKU requis", variant: "destructive" });
      return;
    }
    if (hasVariants && variants.length === 0) {
      toast({ title: "Erreur", description: "Ajoutez au moins une variante", variant: "destructive" });
      return;
    }
    try {
      // Upload image first if a file was selected
      let resolvedImageUrl: string | null = null;
      if (pendingFile) {
        resolvedImageUrl = await uploadFile();
        clearFile();
      }

      const payload: any = {
        name: form.name,
        sku: form.sku,
        stock: form.stock ? parseInt(form.stock) : 0,
        costPrice: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : 0,
        sellingPrice: form.sellingPrice ? Math.round(parseFloat(form.sellingPrice) * 100) : 0,
        description: form.description || null,
        reference: form.reference || null,
        imageUrl: resolvedImageUrl,
      };
      if (hasVariants && variants.length > 0) {
        payload.hasVariants = 1;
        payload.variants = variants.map(v => ({
          name: v.name,
          sku: v.sku,
          costPrice: v.costPrice ? Math.round(parseFloat(v.costPrice) * 100) : 0,
          sellingPrice: v.sellingPrice ? Math.round(parseFloat(v.sellingPrice) * 100) : 0,
          stock: v.stock ? parseInt(v.stock) : 0,
        }));
      }
      await createProduct.mutateAsync(payload);
      toast({ title: "Produit ajouté", description: `${form.name} a été ajouté` });
      setAddOpen(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const handleEdit = async () => {
    if (!editingProduct) return;
    try {
      // Upload new image if one was selected
      let resolvedImageUrl: string | null | undefined = undefined; // undefined = don't change
      if (pendingFile) {
        resolvedImageUrl = await uploadFile();
        clearFile();
      } else if (form.imageUrl !== (editingProduct.imageUrl || "")) {
        // User may have cleared the existing image
        resolvedImageUrl = form.imageUrl || null;
      }

      // Build AI features as JSON array if provided (comma-separated input)
      let aiFeaturesParsed: string | null = null;
      if (form.aiFeatures.trim()) {
        const featuresArr = form.aiFeatures.split(",").map(f => f.trim()).filter(Boolean);
        aiFeaturesParsed = JSON.stringify(featuresArr);
      }
      const updatePayload: any = {
        id: editingProduct.id,
        name: form.name || undefined,
        sku: form.sku || undefined,
        stock: form.stock ? parseInt(form.stock) : undefined,
        costPrice: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : undefined,
        sellingPrice: form.sellingPrice ? Math.round(parseFloat(form.sellingPrice) * 100) : undefined,
        description: form.description || null,
        reference: form.reference || undefined,
        descriptionDarija: form.descriptionDarija || null,
        aiFeatures: aiFeaturesParsed,
      };
      if (resolvedImageUrl !== undefined) updatePayload.imageUrl = resolvedImageUrl;
      await updateProduct.mutateAsync(updatePayload);
      toast({ title: "Produit mis à jour", description: `${form.name} a été modifié` });
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
      toast({ title: "Supprimé", description: `${product.name} a été supprimé` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    // Parse AI features from JSON array back to comma-separated string for display
    let aiFeaturesDisplay = "";
    if (product.aiFeatures) {
      try {
        const arr = JSON.parse(product.aiFeatures);
        aiFeaturesDisplay = Array.isArray(arr) ? arr.join(", ") : product.aiFeatures;
      } catch {
        aiFeaturesDisplay = product.aiFeatures;
      }
    }
    setForm({
      name: product.name,
      sku: product.sku,
      stock: String(product.hasVariants ? product.baseStock : product.stock),
      costPrice: (product.costPrice / 100).toFixed(2),
      sellingPrice: ((product.sellingPrice || 0) / 100).toFixed(2),
      description: product.description || "",
      reference: product.reference || "",
      descriptionDarija: product.descriptionDarija || "",
      aiFeatures: aiFeaturesDisplay,
      imageUrl: product.imageUrl || "",
    });
    setEditOpen(true);
  };

  const stats = inventoryData || { totalProducts: 0, totalQuantity: 0, lowStock: 0, outOfStock: 0, newProducts: 0, productStats: [] };
  const productStats: any[] = stats.productStats || [];

  const filtered = productStats.filter((p: any) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "in_stock" && p.stock > 10) ||
      (statusFilter === "low_stock" && p.stock > 0 && p.stock <= 10) ||
      (statusFilter === "out_of_stock" && p.stock === 0);
    return matchesSearch && matchesStatus;
  });

  const statCards = [
    { label: "Total Produits", value: stats.totalProducts, icon: Package, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950" },
    { label: "Quantité totale", value: stats.totalQuantity, icon: Boxes, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950" },
    { label: "Stock bas", value: stats.lowStock, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950" },
    { label: "Rupture de stock", value: stats.outOfStock, icon: PackageX, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
    { label: "Nouveaux ce mois", value: stats.newProducts, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-inventory-title">Inventaire</h1>
          <p className="text-muted-foreground mt-1">Gestion complète des produits et niveaux de stock.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20" data-testid="button-add-product" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nouveau Produit
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((s, i) => (
          <Card key={i} className="p-4 rounded-2xl border-border/50" data-testid={`stat-card-${i}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-products" placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="in_stock">En Stock</SelectItem>
            <SelectItem value="low_stock">Stock Bas</SelectItem>
            <SelectItem value="out_of_stock">Rupture</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="min-w-[180px]">Produit</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-center">Variantes</TableHead>
              <TableHead className="text-right">Prix Coûtant</TableHead>
              <TableHead className="text-right">Prix de Vente</TableHead>
              <TableHead className="text-center">Reçu</TableHead>
              <TableHead className="text-center">Sortie (Livrées)</TableHead>
              <TableHead className="text-center">En Cours</TableHead>
              <TableHead className="text-center">Disponible</TableHead>
              <TableHead className="text-center">Conf. %</TableHead>
              <TableHead className="text-center">Taux de Livr. %</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statsLoading ? (
              <TableRow><TableCell colSpan={13} className="h-32 text-center text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="h-48 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Aucun produit trouvé.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product: any) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-lg object-cover border" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{product.name}</p>
                        {product.reference && <p className="text-xs text-muted-foreground">{product.reference}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">{product.sku}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{product.variantCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(product.sellingPrice)}</TableCell>
                  <TableCell className="text-center text-sm">{product.recu}</TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{product.sortie}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    {product.inTransit > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        {product.inTransit}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-semibold text-sm">{product.available}</TableCell>
                  <TableCell className="text-center">
                    <span className={`text-sm font-medium ${product.confirmRate >= 50 ? 'text-green-600' : product.confirmRate >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                      {product.confirmRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center min-w-[110px]">
                    {(() => {
                      const rate = product.deliverRate ?? 0;
                      const color = rate >= 60 ? 'text-emerald-600' : rate >= 40 ? 'text-amber-500' : 'text-red-500';
                      const barColor = rate >= 60 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-400' : 'bg-red-400';
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold text-sm ${color}`}>{rate}%</span>
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {product.stock > 10 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800 text-xs">En Stock</Badge>
                    ) : product.stock > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-xs">Stock Bas</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800 text-xs">Rupture</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8"
                        style={{ color: "#C5A059" }}
                        title="Modifier les infos AI"
                        data-testid={`button-ai-edit-product-${product.id}`}
                        onClick={() => openAiEdit(product)}
                      >
                        <Brain className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-blue-500 hover:text-blue-700" data-testid={`button-logs-product-${product.id}`} title="Historique stock" onClick={() => { setLogsProductId(product.id); setLogsProductName(product.name); }}>
                        <History className="w-4 h-4" />
                      </Button>
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

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-sm">Stock Réel (Coûtant)</h3>
            </div>
            <p className="text-2xl font-bold" data-testid="text-stock-reel">
              {formatCurrency(filtered.reduce((s: number, p: any) => s + p.stockReel, 0))}
            </p>
          </Card>
          <Card className="p-4 rounded-2xl border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <h3 className="font-semibold text-sm">Stock Réel (Vente)</h3>
            </div>
            <p className="text-2xl font-bold" data-testid="text-stock-vente">
              {formatCurrency(filtered.reduce((s: number, p: any) => s + p.stockTotal, 0))}
            </p>
          </Card>
          <Card className="p-4 rounded-2xl border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="w-4 h-4 text-purple-500" />
              <h3 className="font-semibold text-sm">Marge Potentielle</h3>
            </div>
            <p className="text-2xl font-bold" data-testid="text-marge-potentielle">
              {formatCurrency(filtered.reduce((s: number, p: any) => s + p.stockTotal - p.stockReel, 0))}
            </p>
          </Card>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau Produit</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du produit *</Label>
                <Input data-testid="input-product-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: T-shirt Premium" />
              </div>
              <div className="space-y-2">
                <Label>SKU *</Label>
                <Input data-testid="input-product-sku" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="ex: TSH-001" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Prix coûtant (DH)</Label>
                <Input data-testid="input-product-cost" type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Prix de vente (DH)</Label>
                <Input data-testid="input-product-selling" type="number" step="0.01" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Stock initial</Label>
                <Input data-testid="input-product-stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea data-testid="input-product-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description du produit..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Référence</Label>
              <Input data-testid="input-product-reference" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Référence interne" />
            </div>
            <div className="space-y-2">
              <Label>Photo du produit</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="input-product-image-file"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
              />
              {previewUrl ? (
                <div className="relative w-fit">
                  <img src={previewUrl} alt="Aperçu" className="w-28 h-28 rounded-xl object-cover border-2 border-primary/30" />
                  <button
                    type="button"
                    onClick={clearFile}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[9px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                    {pendingFile?.name?.substring(0, 22)}
                  </div>
                </div>
              ) : (
                <div
                  data-testid="dropzone-product-image"
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors ${isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={e => { e.preventDefault(); setIsDraggingOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                >
                  <ImageUp className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-center">Glissez une photo ici<br /><span className="text-xs text-muted-foreground font-normal">ou cliquez pour choisir (JPG, PNG, WEBP)</span></p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Switch id="has-variants" checked={hasVariants} onCheckedChange={setHasVariants} data-testid="switch-has-variants" />
              <Label htmlFor="has-variants" className="font-medium">Ce produit a des variantes</Label>
            </div>

            {hasVariants && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/30 border">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Variantes</h4>
                  <Button size="sm" variant="outline" onClick={addVariant} data-testid="button-add-variant">
                    <Plus className="w-3 h-3 mr-1" /> Ajouter
                  </Button>
                </div>
                {variants.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune variante. Cliquez sur "Ajouter" pour commencer.</p>
                )}
                {variants.map((v, idx) => (
                  <div key={idx} className="grid grid-cols-6 gap-2 items-end p-3 bg-background rounded-lg border" data-testid={`variant-row-${idx}`}>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Nom</Label>
                      <Input size={1} value={v.name} onChange={e => updateVariant(idx, 'name', e.target.value)} placeholder="ex: Rouge / L" data-testid={`input-variant-name-${idx}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SKU</Label>
                      <Input size={1} value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} placeholder="SKU" data-testid={`input-variant-sku-${idx}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Coûtant</Label>
                      <Input size={1} type="number" step="0.01" value={v.costPrice} onChange={e => updateVariant(idx, 'costPrice', e.target.value)} placeholder="0" data-testid={`input-variant-cost-${idx}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vente</Label>
                      <Input size={1} type="number" step="0.01" value={v.sellingPrice} onChange={e => updateVariant(idx, 'sellingPrice', e.target.value)} placeholder="0" data-testid={`input-variant-selling-${idx}`} />
                    </div>
                    <div className="flex items-end gap-1">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Stock</Label>
                        <Input size={1} type="number" value={v.stock} onChange={e => updateVariant(idx, 'stock', e.target.value)} placeholder="0" data-testid={`input-variant-stock-${idx}`} />
                      </div>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700 shrink-0" onClick={() => removeVariant(idx)} data-testid={`button-remove-variant-${idx}`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Annuler</Button>
              <Button data-testid="button-save-product" onClick={handleCreate} disabled={createProduct.isPending}>
                {createProduct.isPending ? "Enregistrement..." : "Créer le produit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingProduct(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du produit</Label>
                <Input data-testid="input-edit-product-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input data-testid="input-edit-product-sku" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Prix coûtant (DH)</Label>
                <Input data-testid="input-edit-product-cost" type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix de vente (DH)</Label>
                <Input data-testid="input-edit-product-selling" type="number" step="0.01" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Stock</Label>
                <Input data-testid="input-edit-product-stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea data-testid="input-edit-product-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Référence</Label>
              <Input data-testid="input-edit-product-reference" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>

            {/* AI Knowledge Base Section */}
            <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">Enrichir les infos AI</span>
                <Sparkles className="w-3 h-3 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ces informations sont injectées dans le prompt de l'agent IA pour qu'il réponde aux questions des clients avec précision.
              </p>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Description Darija (pitch de vente)</Label>
                <Textarea
                  data-testid="input-edit-product-darija"
                  value={form.descriptionDarija}
                  onChange={e => setForm(f => ({ ...f, descriptionDarija: e.target.value }))}
                  placeholder="مثلاً: جلد طبيعي 100%، خفيف وراحة فائقة، تصميم مغربي أصيل، توصيل فابور..."
                  rows={3}
                  dir="rtl"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Caractéristiques produit (séparées par virgule)</Label>
                <Input
                  data-testid="input-edit-product-features"
                  value={form.aiFeatures}
                  onChange={e => setForm(f => ({ ...f, aiFeatures: e.target.value }))}
                  placeholder="مثلاً: جلد طبيعي، مريح، مقاوم للماء، ضمان 6 أشهر"
                  dir="rtl"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Chaque caractéristique séparée par une virgule sera une puce dans le prompt AI.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Photo du produit (envoyée par l'IA sur demande)</Label>
                {/* Show existing or new preview */}
                {(previewUrl || form.imageUrl) ? (
                  <div className="relative w-fit">
                    <img
                      src={previewUrl || form.imageUrl}
                      alt="Aperçu"
                      className="w-28 h-28 rounded-xl object-cover border-2 border-primary/30"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <button
                      type="button"
                      onClick={() => { clearFile(); setForm(f => ({ ...f, imageUrl: "" })); }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {pendingFile && (
                      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[9px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                        {pendingFile.name.substring(0, 22)}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-2 underline flex items-center gap-1"
                    >
                      <ImageUp className="w-3 h-3" /> Changer la photo
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid="dropzone-edit-product-image"
                    className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={e => { e.preventDefault(); setIsDraggingOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                  >
                    <ImageUp className="w-6 h-6 text-muted-foreground" />
                    <p className="text-xs font-medium text-center">Glissez une photo ici<br /><span className="text-muted-foreground font-normal">ou cliquez pour choisir</span></p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="input-edit-product-image-file"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingProduct(null); resetForm(); }}>Annuler</Button>
              <Button data-testid="button-update-product" onClick={handleEdit} disabled={updateProduct.isPending}>
                {updateProduct.isPending ? "Enregistrement..." : "Mettre à jour"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick AI Description Edit Dialog */}
      <Dialog open={!!aiEditProduct} onOpenChange={(v) => { if (!v) setAiEditProduct(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" style={{ color: "#C5A059" }} />
              Modifier les infos AI
              {aiEditProduct && <span className="text-sm font-normal text-muted-foreground">— {aiEditProduct.name}</span>}
            </DialogTitle>
            <DialogDescription>
              Écrivez tout ce que l'IA doit savoir sur ce produit pour répondre aux clients en Darija.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea
              data-testid="input-ai-description"
              value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              placeholder="مثلاً: حذاء أناكيو: جلد طبيعي 100%، صناعة يدوية بفاس، الثمن 379 درهم، التوصيل فابور، ضمان 6 أشهر، مريح وخفيف، مقاسات من 38 لـ 46..."
              rows={6}
              dir="rtl"
              className="text-sm"
              style={{ borderColor: "#C5A059", borderWidth: 1.5 }}
            />
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ces informations sont injectées dans chaque réponse de l'IA pour qu'elle réponde avec précision aux questions des clients.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAiEditProduct(null)}>Annuler</Button>
              <Button
                data-testid="button-save-ai-description"
                onClick={handleAiSave}
                disabled={aiSaving}
                style={{ background: "#C5A059", color: "#fff" }}
              >
                {aiSaving ? "Sauvegarde..." : "💾 Sauvegarder pour l'IA"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Logs Audit Trail Dialog */}
      <Dialog open={logsProductId !== null} onOpenChange={(v) => { if (!v) setLogsProductId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-500" />
              Historique Stock — {logsProductName}
            </DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Chargement...</div>
          ) : !stockLogsData || stockLogsData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Aucun mouvement enregistré pour ce produit.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead className="text-center">Mouvement</TableHead>
                  <TableHead>Raison</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockLogsData.map((log: any) => (
                  <TableRow key={log.id} data-testid={`row-stock-log-${log.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.orderId ? `#${log.orderId}` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={log.changeAmount < 0 ? "text-red-600 border-red-200 bg-red-50 dark:bg-red-950 dark:text-red-400" : "text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400"}>
                        {log.changeAmount > 0 ? `+${log.changeAmount}` : log.changeAmount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Package, PackagePlus, Pencil, Trash2, Search, AlertTriangle, TrendingUp, Boxes, PackageX, BarChart3, X, History, Brain, Sparkles, ImageUp, CheckCircle2, MapPin, AlertCircle, ArrowUpCircle, ArrowDownCircle, RotateCcw, Archive, Filter, ShieldAlert, CheckSquare, Link2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VariantForm {
  name: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stock: string;
}

/* ── Smart Cleanup Modal ──────────────────────────────────────────────────── */
function CleanupModal({
  open, onClose, cleanupType, setCleanupType, cleanupSelectedIds, setCleanupSelectedIds, onBulkDelete,
}: {
  open: boolean;
  onClose: () => void;
  cleanupType: "no_orders" | "duplicates" | "archived";
  setCleanupType: (t: "no_orders" | "duplicates" | "archived") => void;
  cleanupSelectedIds: Set<number>;
  setCleanupSelectedIds: (s: Set<number>) => void;
  onBulkDelete: (ids: number[], force: boolean) => Promise<void>;
}) {
  const { data, isLoading, refetch } = useQuery<{ type: string; count: number; products: any[] }>({
    queryKey: ["/api/products/cleanup-suggestions", cleanupType],
    queryFn: () => fetch(`/api/products/cleanup-suggestions?type=${cleanupType}`, { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const prods = data?.products ?? [];
  const allChecked = cleanupSelectedIds.size === prods.length && prods.length > 0;

  const toggleOne = (id: number) => {
    setCleanupSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setCleanupSelectedIds(allChecked ? new Set() : new Set(prods.map((p: any) => p.id)));
  };

  const handleRun = async (force: boolean) => {
    if (cleanupSelectedIds.size === 0) {
      toast({ title: "Aucun produit sélectionné", variant: "destructive" }); return;
    }
    setRunning(true);
    await onBulkDelete(Array.from(cleanupSelectedIds), force);
    setCleanupSelectedIds(new Set());
    refetch();
    setRunning(false);
  };

  const typeLabels: Record<string, string> = {
    no_orders: "Sans commandes",
    duplicates: "Doublons",
    archived: "Archivés",
  };
  const typeDesc: Record<string, string> = {
    no_orders: "Produits qui n'ont jamais été commandés — sans risque de suppression.",
    duplicates: "Produits avec le même nom normalisé — gardez le plus récent, supprimez les copies.",
    archived: "Produits déjà archivés (liés à des commandes) — vous pouvez les supprimer définitivement si nécessaire.",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-orange-500" />
            Nettoyage intelligent de l'inventaire
          </DialogTitle>
          <DialogDescription>
            Identifiez et supprimez rapidement les produits obsolètes, doublons ou non utilisés.
          </DialogDescription>
        </DialogHeader>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["no_orders", "duplicates", "archived"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setCleanupType(t); setCleanupSelectedIds(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                cleanupType === t
                  ? "bg-orange-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid={`cleanup-tab-${t}`}
            >
              {typeLabels[t]}
              {data?.type === t && ` (${data.count})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{typeDesc[cleanupType]}</p>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto border rounded-xl min-h-[200px]">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Analyse en cours...</div>
          ) : prods.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
              Aucun produit à nettoyer dans cette catégorie.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 sticky top-0">
                <tr>
                  <th className="w-10 pl-4 py-2 text-left">
                    <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Produit</th>
                  <th className="text-left py-2 font-medium text-muted-foreground pr-3">SKU</th>
                  {cleanupType === "duplicates" && (
                    <th className="text-left py-2 font-medium text-muted-foreground pr-3">Groupe</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {prods.map((p: any) => (
                  <tr key={p.id} className={`border-t border-border/30 ${cleanupSelectedIds.has(p.id) ? "bg-orange-50/40 dark:bg-orange-950/20" : ""}`}>
                    <td className="pl-4 py-2">
                      <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={cleanupSelectedIds.has(p.id)} onChange={() => toggleOne(p.id)} />
                    </td>
                    <td className="py-2 font-medium max-w-[240px] truncate">{p.name}</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground pr-3">{p.sku}</td>
                    {cleanupType === "duplicates" && (
                      <td className="py-2 text-xs text-muted-foreground pr-3 max-w-[180px] truncate">{p.duplicateGroup}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
          <span className="text-sm text-muted-foreground flex-1">
            {cleanupSelectedIds.size > 0 ? `${cleanupSelectedIds.size} sélectionné${cleanupSelectedIds.size > 1 ? "s" : ""}` : "Cochez les produits à traiter"}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
          {cleanupType === "archived" ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={cleanupSelectedIds.size === 0 || running}
              onClick={() => handleRun(true)}
              className="gap-1.5"
              data-testid="button-cleanup-delete-archived"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              disabled={cleanupSelectedIds.size === 0 || running}
              onClick={() => handleRun(false)}
              data-testid="button-cleanup-delete"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer la sélection
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Nuclear Delete Modal ─────────────────────────────────────────────────── */
function NuclearDeleteModal({
  open, onClose, selectedCount, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (opts: { archiveIfHasOrders: boolean; confirmText: string }) => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [archiveIfHasOrders, setArchiveIfHasOrders] = useState(true);
  const [running, setRunning] = useState(false);

  const isConfirmed = confirmText === "SUPPRIMER TOUT";

  const handleSubmit = async () => {
    if (!isConfirmed || running) return;
    setRunning(true);
    try {
      await onConfirm({ archiveIfHasOrders, confirmText });
    } finally {
      setRunning(false);
      setConfirmText("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !running) { onClose(); setConfirmText(""); } }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            Action irréversible
          </DialogTitle>
          <DialogDescription>
            Vous êtes sur le point de traiter <strong>{selectedCount}</strong> produit{selectedCount > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="font-bold mb-1.5">Ce qui va se passer :</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Produits <strong>sans commandes</strong> → supprimés définitivement</li>
              <li>Produits <strong>avec commandes</strong> → archivés (historique préservé)</li>
            </ul>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={archiveIfHasOrders}
              onChange={(e) => setArchiveIfHasOrders(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            Archiver les produits liés à des commandes (recommandé)
          </label>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Tapez <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-red-700 dark:text-red-400">SUPPRIMER TOUT</span> pour confirmer :
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-red-500 outline-none text-sm font-mono bg-white dark:bg-gray-900 dark:text-white"
              placeholder="SUPPRIMER TOUT"
              disabled={running}
              data-testid="input-nuclear-confirm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => { onClose(); setConfirmText(""); }} disabled={running} data-testid="button-nuclear-cancel">
            Annuler
          </Button>
          <Button
            disabled={!isConfirmed || running}
            onClick={handleSubmit}
            className="bg-red-600 hover:bg-red-700 text-white font-bold"
            data-testid="button-nuclear-submit"
          >
            {running ? (
              <span className="flex items-center gap-2"><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> En cours…</span>
            ) : (
              <span className="flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Confirmer la suppression</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { data: inventoryData, isLoading: statsLoading, refetch: refetchStats } = useInventoryStats();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();
  const [logsProductId, setLogsProductId] = useState<number | null>(null);
  const [logsProductName, setLogsProductName] = useState<string>("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Nuclear delete modal
  const [nuclearOpen, setNuclearOpen] = useState(false);

  // Historical linking dialog (shown when adding a product that has existing orders)
  const [historicalCheck, setHistoricalCheck] = useState<{ total: number; confirmed: number; delivered: number; confirmRate: number; deliveryRate: number } | null>(null);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [rattachingId, setRattachingId] = useState<number | null>(null);

  // Safe-delete confirmation dialog (single product)
  const [deleteDialog, setDeleteDialog] = useState<{ product: any; usage: any } | null>(null);
  const [deleteDialogLoading, setDeleteDialogLoading] = useState(false);

  // Smart cleanup modal
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupType, setCleanupType] = useState<"no_orders" | "duplicates" | "archived">("no_orders");
  const [cleanupSelectedIds, setCleanupSelectedIds] = useState<Set<number>>(new Set());

  // Insights side-sheet
  const [insightsProductId, setInsightsProductId] = useState<number | null>(null);

  // Restock dialog
  const [restockProduct, setRestockProduct] = useState<any | null>(null);
  const [restockQty, setRestockQty] = useState<string>("");
  const [restockReason, setRestockReason] = useState<string>("");
  const [restockSaving, setRestockSaving] = useState(false);

  const handleRestockSave = async () => {
    if (!restockProduct) return;
    const n = Number(restockQty);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: "Quantité invalide", description: "Entrez un nombre positif.", variant: "destructive" });
      return;
    }
    setRestockSaving(true);
    try {
      await apiRequest("POST", `/api/products/${restockProduct.id}/restock`, {
        quantity: n,
        reason: restockReason.trim() || undefined,
      });
      toast({ title: "✅ Stock mis à jour", description: `+${n} unités ajoutées à "${restockProduct.name}".` });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      if (insightsProductId === restockProduct.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/products', restockProduct.id, 'insights'] });
      }
      setRestockProduct(null);
      setRestockQty("");
      setRestockReason("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    } finally {
      setRestockSaving(false);
    }
  };

  // Insights query (only fires when sheet open)
  const { data: insightsData, isLoading: insightsLoading } = useQuery<any>({
    queryKey: ['/api/products', insightsProductId, 'insights'],
    enabled: insightsProductId !== null,
  });

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
    coutAchat: "", prixVente: "", coutEmballage: "", coutLivraison: "", coutConfirmation: "",
  });

  // File upload state — shared between Add and Edit dialogs (only one open at a time)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image trop grande (max 2 MB)."); return; }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreviewUrl(base64);
      setForm(f => ({ ...f, imageUrl: base64 }));
    };
    reader.readAsDataURL(file);
  }, []);

  const clearFile = () => {
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
    setForm({ name: "", sku: "", stock: "", costPrice: "", sellingPrice: "", description: "", reference: "", descriptionDarija: "", aiFeatures: "", imageUrl: "", coutAchat: "", prixVente: "", coutEmballage: "", coutLivraison: "", coutConfirmation: "" });
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
    const payload: any = {
      name: form.name,
      sku: form.sku,
      stock: form.stock ? parseInt(form.stock) : 0,
      costPrice: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : 0,
      sellingPrice: form.sellingPrice ? Math.round(parseFloat(form.sellingPrice) * 100) : 0,
      description: form.description || null,
      reference: form.reference || null,
      imageUrl: form.imageUrl || null,
      coutAchat: parseFloat(form.coutAchat) || 0,
      prixVente: parseFloat(form.prixVente) || 0,
      coutEmballage: parseFloat(form.coutEmballage) || 0,
      coutLivraison: parseFloat(form.coutLivraison) || 0,
      coutConfirmation: parseFloat(form.coutConfirmation) || 0,
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
    // Check BEFORE creating — if historical orders exist, ask the user
    try {
      const check = await fetch(
        `/api/products/name-check?name=${encodeURIComponent(form.name)}`,
        { credentials: 'include' }
      ).then(r => r.json());
      if (check.found && check.total > 0) {
        setPendingPayload(payload);
        setHistoricalCheck(check);
        return;
      }
    } catch {}
    // No historical match → create directly without dialog
    await doCreateProduct(payload, false);
  };

  const doCreateProduct = async (payload: any, shouldLink: boolean) => {
    try {
      const created = await createProduct.mutateAsync(payload);
      if (shouldLink && created?.id) {
        try {
          await fetch(`/api/products/${created.id}/link-historical`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: payload.name }),
          });
        } catch {}
      }
      toast({ title: "Produit ajouté", description: `${payload.name} a été ajouté au stock` });
      setAddOpen(false);
      resetForm();
      setHistoricalCheck(null);
      setPendingPayload(null);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const handleLinkHistorical = async (product: any) => {
    setRattachingId(product.id);
    try {
      const r = await fetch(`/api/products/${product.id}/link-historical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: product.name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur');
      toast({ title: 'Rattachement effectué', description: `${data.linked} ligne(s) rattachée(s) à « ${product.name} »` });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setRattachingId(null);
    }
  };

  const handleEdit = async () => {
    if (!editingProduct) return;
    try {
      // Image is stored as base64 in form.imageUrl — no separate upload step needed
      const imageChanged = (form.imageUrl || null) !== (editingProduct.imageUrl || null);
      clearFile();

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
        coutAchat: parseFloat(form.coutAchat) || 0,
        prixVente: parseFloat(form.prixVente) || 0,
        coutEmballage: parseFloat(form.coutEmballage) || 0,
        coutLivraison: parseFloat(form.coutLivraison) || 0,
        coutConfirmation: parseFloat(form.coutConfirmation) || 0,
      };
      if (imageChanged) updatePayload.imageUrl = form.imageUrl || null;
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
    setDeleteDialogLoading(true);
    try {
      const usage = await apiRequest("GET", `/api/products/${product.id}/usage`);
      setDeleteDialog({ product, usage });
    } catch {
      setDeleteDialog({ product, usage: { ordersCount: 0, deliveredCount: 0, inStockOrders: 0, totalRevenue: 0 } });
    } finally {
      setDeleteDialogLoading(false);
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!deleteDialog) return;
    try {
      const qs = force ? "?force=true" : "";
      await apiRequest("DELETE", `/api/products/${deleteDialog.product.id}${qs}`);
      toast({
        title: force ? "📦 Archivé" : "🗑️ Supprimé",
        description: force
          ? `"${deleteDialog.product.name}" a été archivé (commandes conservées).`
          : `"${deleteDialog.product.name}" a été supprimé définitivement.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    } finally {
      setDeleteDialog(null);
    }
  };

  const handleBulkDelete = async (force: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const result = await apiRequest("POST", "/api/products/bulk-delete", {
        productIds: Array.from(selectedIds),
        force,
      });
      toast({
        title: "Opération terminée",
        description: `${result.deleted} supprimés · ${result.archived} archivés · ${result.skipped} ignorés`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const selectAllAcrossPages = async () => {
    try {
      const resp = await fetch("/api/products/all-ids", { credentials: "include" });
      const data = await resp.json();
      setSelectedIds(new Set(data.ids));
    } catch {
      toast({ title: "Erreur", description: "Impossible de récupérer tous les IDs", variant: "destructive" });
    }
  };

  const handleNuclearConfirm = async ({ archiveIfHasOrders, confirmText }: { archiveIfHasOrders: boolean; confirmText: string }) => {
    try {
      const resp = await fetch("/api/products/bulk-delete-all", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "selected_ids",
          productIds: Array.from(selectedIds),
          archiveIfHasOrders,
          confirmText,
        }),
      });
      const r = await resp.json();
      if (!resp.ok) throw new Error(r.message || "Erreur");
      toast({
        title: "✅ Nettoyage terminé",
        description: `${r.deleted} supprimés · ${r.archived} archivés · ${r.skipped} ignorés`,
      });
      setNuclearOpen(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      refetchStats();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p: any) => p.id)));
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
    const pd = (product.settings as any)?.profitDefaults || {};
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
      coutAchat: pd.coutAchat ? String(pd.coutAchat) : "",
      prixVente: pd.prixVente ? String(pd.prixVente) : "",
      coutEmballage: pd.coutEmballage ? String(pd.coutEmballage) : "",
      coutLivraison: pd.coutLivraison ? String(pd.coutLivraison) : "",
      coutConfirmation: pd.coutConfirmation ? String(pd.coutConfirmation) : "",
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
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
          onClick={() => { setCleanupType("no_orders"); setCleanupSelectedIds(new Set()); setCleanupOpen(true); }}
          data-testid="button-open-cleanup"
        >
          <Filter className="w-4 h-4" /> Nettoyage intelligent
        </Button>
      </div>

      {/* "Select all across pages" banner */}
      {selectedIds.size > 0 && selectedIds.size === filtered.length && filtered.length < (productStats.length) && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 text-sm text-indigo-700 dark:text-indigo-300">
          <span>{filtered.length} produits filtrés sélectionnés.</span>
          <button
            onClick={selectAllAcrossPages}
            className="font-bold underline hover:text-indigo-900 dark:hover:text-indigo-100"
            data-testid="button-select-all-pages"
          >
            Sélectionner les {productStats.length} produits
          </button>
        </div>
      )}

      {/* Bulk action bar — visible when items are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 animate-in slide-in-from-top-2 flex-wrap">
          <CheckSquare className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-300">
            {selectedIds.size} produit{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-400 gap-1.5"
            disabled={bulkDeleting}
            onClick={() => handleBulkDelete(false)}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer sans commandes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 gap-1.5"
            disabled={bulkDeleting}
            onClick={() => handleBulkDelete(true)}
            data-testid="button-bulk-archive"
          >
            <Archive className="w-3.5 h-3.5" />
            Archiver tous
          </Button>
          {selectedIds.size >= 100 && (
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5"
              disabled={bulkDeleting}
              onClick={() => setNuclearOpen(true)}
              data-testid="button-bulk-nuclear"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              TOUT supprimer / archiver
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-bulk-cancel"
          >
            Annuler
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-red-500 cursor-pointer"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={handleToggleAll}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
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
                <TableRow key={product.id} data-testid={`row-product-${product.id}`} className={selectedIds.has(product.id) ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                  <TableCell className="pl-4">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-red-500 cursor-pointer"
                      checked={selectedIds.has(product.id)}
                      onChange={() => handleToggleSelect(product.id)}
                      data-testid={`checkbox-product-${product.id}`}
                    />
                  </TableCell>
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
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8 text-emerald-600 hover:text-emerald-700"
                        title="Réapprovisionner"
                        data-testid={`button-restock-product-${product.id}`}
                        onClick={() => { setRestockProduct(product); setRestockQty(""); setRestockReason(""); }}
                      >
                        <PackagePlus className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8 text-blue-500 hover:text-blue-700"
                        title="Voir les insights"
                        data-testid={`button-insights-product-${product.id}`}
                        onClick={() => setInsightsProductId(product.id)}
                      >
                        <BarChart3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8 text-violet-500 hover:text-violet-700"
                        title="Rattacher les commandes historiques"
                        data-testid={`button-link-historical-${product.id}`}
                        disabled={rattachingId === product.id}
                        onClick={() => handleLinkHistorical(product)}
                      >
                        <Link2 className="w-4 h-4" />
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
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Nouveau Produit</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du produit *</Label>
                <Input data-testid="input-product-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: T-shirt Premium" />
              </div>
              <div className="space-y-2">
                <Label>SKU *</Label>
                <Input data-testid="input-product-sku" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="ex: TSH-001" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <Label className="text-xs font-medium">📦 Frais d'emballage (DH / commande)</Label>
              <Input type="number" min="0" step="0.01" placeholder="ex: 3" value={form.coutEmballage} onChange={e => setForm(f => ({ ...f, coutEmballage: e.target.value }))} data-testid="input-cout-emballage" />
              <p className="text-xs text-muted-foreground">Utilisé automatiquement dans l'Analyseur de profit</p>
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
                    onClick={() => { clearFile(); setForm(f => ({ ...f, imageUrl: "" })); }}
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

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Annuler</Button>
              <Button data-testid="button-save-product" onClick={handleCreate} disabled={createProduct.isPending}>
                {createProduct.isPending ? "Enregistrement..." : "Créer le produit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingProduct(null); resetForm(); } }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du produit</Label>
                <Input data-testid="input-edit-product-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input data-testid="input-edit-product-sku" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <Label className="text-xs font-medium">📦 Frais d'emballage (DH / commande)</Label>
              <Input type="number" min="0" step="0.01" placeholder="ex: 3" value={form.coutEmballage} onChange={e => setForm(f => ({ ...f, coutEmballage: e.target.value }))} data-testid="input-edit-cout-emballage" />
              <p className="text-xs text-muted-foreground">Utilisé automatiquement dans l'Analyseur de profit</p>
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

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
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

      {/* ── Insights side-sheet ─────────────────────────────────────────── */}
      <Sheet open={insightsProductId !== null} onOpenChange={(v) => { if (!v) setInsightsProductId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" style={{ color: "#1E1B4B" }} />
              Insights produit
            </SheetTitle>
          </SheetHeader>

          {insightsLoading || !insightsData ? (
            <div className="py-12 text-center text-muted-foreground text-sm" data-testid="insights-loading">
              Chargement...
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* Header card */}
              <div className="flex gap-3 items-center p-3 rounded-xl border border-border/50 bg-muted/30">
                {insightsData.product.imageUrl && (
                  <img src={insightsData.product.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" data-testid="text-insights-product-name">{insightsData.product.name}</div>
                  <div className="text-xs text-muted-foreground">SKU: {insightsData.product.sku}</div>
                </div>
                <Button
                  size="sm"
                  style={{ background: "#C5A059", color: "#fff" }}
                  data-testid="button-insights-restock"
                  onClick={() => {
                    setRestockProduct(insightsData.product);
                    setRestockQty("");
                    setRestockReason("");
                  }}
                >
                  <PackagePlus className="w-4 h-4 mr-1" /> Réapprovisionner
                </Button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Boxes className="w-3 h-3" /> Stock actuel</div>
                  <div className="text-xl font-bold" data-testid="kpi-current-stock">{insightsData.kpis.currentStock}</div>
                </Card>
                <Card className="p-3 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3 text-emerald-600" /> Reçu (lifetime)</div>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="kpi-recu">{insightsData.kpis.recu}</div>
                </Card>
                <Card className="p-3 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ArrowDownCircle className="w-3 h-3 text-blue-600" /> Livré</div>
                  <div className="text-xl font-bold text-blue-700 dark:text-blue-400" data-testid="kpi-sortie">{insightsData.kpis.sortie}</div>
                </Card>
                <Card className="p-3 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><RotateCcw className="w-3 h-3 text-amber-600" /> Retournés</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400" data-testid="kpi-returned">{insightsData.kpis.returned}</div>
                </Card>
                <Card className="p-3 rounded-xl col-span-2">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-600" /> Taux de refus</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-xl font-bold text-red-700 dark:text-red-400" data-testid="kpi-refusal-rate">{insightsData.kpis.refusalRate}%</div>
                    <div className="text-xs text-muted-foreground">
                      ({insightsData.kpis.totalRefused} / {insightsData.kpis.totalOrdered} commandes)
                    </div>
                  </div>
                </Card>
              </div>

              {/* Top cities */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" /> Top 5 villes (livraisons)
                </h3>
                {insightsData.topCities.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucune livraison enregistrée.</p>
                ) : (
                  <div className="space-y-1">
                    {insightsData.topCities.map((c: any, i: number) => (
                      <div key={c.city} className="flex justify-between items-center text-sm py-1.5 px-2 rounded hover:bg-muted/50" data-testid={`row-top-city-${i}`}>
                        <span className="truncate">{c.city}</span>
                        <Badge variant="outline" className="ml-2">{c.qty}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top refusal reasons */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" /> Top raisons de refus
                </h3>
                {insightsData.topRefusalReasons.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun refus enregistré.</p>
                ) : (
                  <div className="space-y-1">
                    {insightsData.topRefusalReasons.map((r: any, i: number) => (
                      <div key={i} className="flex justify-between items-start gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50" data-testid={`row-refusal-reason-${i}`}>
                        <span className="break-words flex-1">{r.reason}</span>
                        <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 dark:bg-red-950 dark:text-red-400 shrink-0">{r.qty}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Movement ledger */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <History className="w-4 h-4 text-muted-foreground" /> Derniers mouvements
                </h3>
                {insightsData.movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun mouvement enregistré.</p>
                ) : (
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs text-right">Qté</TableHead>
                          <TableHead className="text-xs">Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {insightsData.movements.map((m: any) => {
                          const isPositive = m.quantity > 0;
                          const typeLabels: Record<string, string> = {
                            restock: "Réappro",
                            delivered: "Livré",
                            returned: "Retour",
                            adjustment: "Ajust.",
                            reservation: "Réserv.",
                            release: "Libér.",
                          };
                          return (
                            <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {new Date(m.createdAt).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className="text-[10px]">{typeLabels[m.type] || m.type}</Badge>
                              </TableCell>
                              <TableCell className={`text-xs text-right font-semibold ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                {isPositive ? `+${m.quantity}` : m.quantity}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {m.orderId ? <span className="font-mono">#{m.orderId}</span> : ''}
                                {m.orderId && m.reason ? ' · ' : ''}
                                {m.reason || (m.orderId ? '' : '—')}
                                {m.userName && <div className="text-[10px] opacity-60">par {m.userName}</div>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Safe-delete confirmation dialog ─────────────────────────────── */}
      <Dialog open={!!deleteDialog} onOpenChange={(v) => { if (!v) setDeleteDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="w-5 h-5" />
              Supprimer le produit
            </DialogTitle>
          </DialogHeader>
          {deleteDialog && (
            <div className="space-y-4 py-2">
              <p className="font-semibold text-sm">{deleteDialog.product.name}</p>
              {deleteDialog.usage.ordersCount > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Ce produit est lié à des commandes
                  </div>
                  <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 pl-6 list-disc">
                    <li>{deleteDialog.usage.ordersCount} commande{deleteDialog.usage.ordersCount > 1 ? "s" : ""} au total</li>
                    <li>{deleteDialog.usage.deliveredCount} livrée{deleteDialog.usage.deliveredCount > 1 ? "s" : ""}</li>
                    {deleteDialog.usage.inStockOrders > 0 && (
                      <li className="text-red-600 dark:text-red-400 font-semibold">{deleteDialog.usage.inStockOrders} commande{deleteDialog.usage.inStockOrders > 1 ? "s" : ""} encore en cours !</li>
                    )}
                  </ul>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                    Vous pouvez <strong>archiver</strong> ce produit — il sera masqué de l'inventaire mais les commandes liées restent intactes.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                  Ce produit n'a aucune commande liée. La suppression est définitive et irréversible.
                </div>
              )}
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setDeleteDialog(null)} className="flex-1">
                  Annuler
                </Button>
                {deleteDialog.usage.ordersCount > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 gap-1.5"
                    onClick={() => confirmDelete(true)}
                    data-testid="button-confirm-archive"
                  >
                    <Archive className="w-4 h-4" /> Archiver
                  </Button>
                )}
                {deleteDialog.usage.ordersCount === 0 && (
                  <Button
                    variant="destructive"
                    className="flex-1 gap-1.5"
                    onClick={() => confirmDelete(false)}
                    data-testid="button-confirm-delete"
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer définitivement
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Smart Cleanup modal ──────────────────────────────────────────── */}
      <CleanupModal
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        cleanupType={cleanupType}
        setCleanupType={setCleanupType}
        cleanupSelectedIds={cleanupSelectedIds}
        setCleanupSelectedIds={setCleanupSelectedIds}
        onBulkDelete={async (ids, force) => {
          setBulkDeleting(true);
          try {
            const result = await apiRequest("POST", "/api/products/bulk-delete", { productIds: ids, force });
            toast({
              title: "Nettoyage terminé",
              description: `${result.deleted} supprimés · ${result.archived} archivés · ${result.skipped} ignorés`,
            });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory/stats'] });
            queryClient.invalidateQueries({ queryKey: ['/api/products'] });
          } catch (err: any) {
            toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
          } finally {
            setBulkDeleting(false);
          }
        }}
      />

      {/* ── Nuclear delete modal ─────────────────────────────────────────── */}
      <NuclearDeleteModal
        open={nuclearOpen}
        onClose={() => setNuclearOpen(false)}
        selectedCount={selectedIds.size}
        onConfirm={handleNuclearConfirm}
      />

      {/* ── Restock dialog ──────────────────────────────────────────────── */}
      <Dialog open={restockProduct !== null} onOpenChange={(v) => { if (!v && !restockSaving) setRestockProduct(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-emerald-600" />
              Réapprovisionner
            </DialogTitle>
            <DialogDescription>
              {restockProduct ? `Ajouter du stock à "${restockProduct.name}" (actuel: ${restockProduct.stock ?? '—'})` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="restock-qty">Quantité ajoutée *</Label>
              <Input
                id="restock-qty"
                type="number"
                min="1"
                step="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="ex. 50"
                data-testid="input-restock-quantity"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="restock-reason">Note (optionnel)</Label>
              <Textarea
                id="restock-reason"
                value={restockReason}
                onChange={(e) => setRestockReason(e.target.value)}
                placeholder="ex. Commande fournisseur #123, livraison 1er Mai"
                rows={3}
                data-testid="input-restock-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockProduct(null)} disabled={restockSaving}>
              Annuler
            </Button>
            <Button
              onClick={handleRestockSave}
              disabled={restockSaving || !restockQty}
              style={{ background: "#C5A059", color: "#fff" }}
              data-testid="button-confirm-restock"
            >
              {restockSaving ? "Sauvegarde..." : "Ajouter au stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Historical link choice dialog ── */}
      <Dialog open={!!historicalCheck} onOpenChange={(v) => { if (!v) { setHistoricalCheck(null); setPendingPayload(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Données historiques trouvées</DialogTitle>
            <DialogDescription>
              Des commandes existent déjà pour « <strong>{pendingPayload?.name}</strong> »
            </DialogDescription>
          </DialogHeader>
          {historicalCheck && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total commandes</span><span className="font-semibold">{historicalCheck.total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Confirmées</span><span className="font-semibold text-blue-600">{historicalCheck.confirmed} ({historicalCheck.confirmRate}%)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Livrées</span><span className="font-semibold text-emerald-600">{historicalCheck.delivered} ({historicalCheck.deliveryRate}%)</span></div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Voulez-vous rattacher ces commandes à ce produit ? Le coût, le stock et le profit seront calculés automatiquement.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              data-testid="button-link-historical-no"
              onClick={() => pendingPayload && doCreateProduct(pendingPayload, false)}
            >
              Non, créer sans rattacher
            </Button>
            <Button
              style={{ background: "#C5A059", color: "#fff" }}
              data-testid="button-link-historical-yes"
              onClick={() => pendingPayload && doCreateProduct(pendingPayload, true)}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Oui, rattacher les données
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

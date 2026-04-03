import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAgents, useProducts, useStore, useAgentStoreSettings } from "@/hooks/use-store-data";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Save, Upload } from "lucide-react";
import { CityCombobox } from "@/components/city-combobox";
import { MOROCCAN_CITIES } from "@/lib/carrier-cities";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

const ORDER_STATUSES = [
  { value: "nouveau", label: "Nouveau" },
  { value: "confirme", label: "Confirmé" },
  { value: "Injoignable", label: "Injoignable" },
  { value: "Annulé (fake)", label: "Annulé (fake)" },
  { value: "boite vocale", label: "Boite vocale" },
  { value: "in_progress", label: "En cours" },
  { value: "delivered", label: "Livré" },
  { value: "refused", label: "Refusé" },
];

interface LineItem {
  id: string;
  productId: number | null;
  rawProductName: string;
  baseProductName: string;   // product title without variant — used for auto-combine
  sku: string;
  variantInfo: string;
  price: number;
  quantity: number;
}

function newItem(): LineItem {
  return { id: `item-${Date.now()}-${Math.random()}`, productId: null, rawProductName: "", baseProductName: "", sku: "", variantInfo: "", price: 0, quantity: 1 };
}

export default function NewOrderAdd() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAgent = user?.role === 'agent';
  const { data: agents = [] } = useAgents();
  const { data: allProducts = [] } = useProducts();
  const { data: storeData } = useStore();
  const { data: agentSettings = [] } = useAgentStoreSettings();

  const myAgentSetting = (agentSettings as any[]).find((s: any) => s.agentId === user?.id);
  const allowedProductIds: number[] = useMemo(() => {
    try { return JSON.parse(myAgentSetting?.allowedProductIds || '[]'); } catch { return []; }
  }, [myAgentSetting]);

  const products = useMemo(() => {
    if (!isAgent || allowedProductIds.length === 0) return allProducts as any[];
    return (allProducts as any[]).filter((p: any) => allowedProductIds.includes(p.id));
  }, [isAgent, allProducts, allowedProductIds]);

  const [saving, setSaving] = useState(false);
  const [canOpen, setCanOpen] = useState(true);
  const [isStock, setIsStock] = useState(false);
  const [replace, setReplace] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [selectedCarrierProvider, setSelectedCarrierProvider] = useState<string>("");
  const [status, setStatus] = useState("nouveau");
  const [agentId, setAgentId] = useState(isAgent ? String(user?.id || "") : "");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<LineItem[]>([newItem()]);

  // ── Carrier city lists ─────────────────────────────────────────────
  const { data: allCarriers = [], isLoading: citiesLoading } = useQuery<{
    id: number; provider: string; isActive: number; cities: string[]; logo: string | null; source: string;
  }[]>({
    queryKey: ["/api/carriers/cities/all"],
    staleTime: 3 * 60 * 1000,
  });

  const activeCarriers = useMemo(() => (allCarriers as any[]).filter((c: any) => c.isActive === 1), [allCarriers]);

  const activeCarrier = useMemo(() => {
    if (selectedCarrierProvider)
      return (allCarriers as any[]).find((c: any) => c.provider === selectedCarrierProvider) ?? null;
    return activeCarriers[0] ?? null;
  }, [selectedCarrierProvider, allCarriers, activeCarriers]);

  const activeCities = useMemo(() => {
    if (!activeCarrier) return MOROCCAN_CITIES;
    const list = activeCarrier.cities as string[];
    return list && list.length > 0 ? list : MOROCCAN_CITIES;
  }, [activeCarrier]);

  const activeCarrierLogo: string | null = (activeCarrier as any)?.logo ?? null;
  const isCarrierSpecific = !!activeCarrier && activeCities !== MOROCCAN_CITIES && activeCities.length > 0;

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, [field]: value };
      // Auto-combine: when variantInfo changes, update rawProductName to "Product - Variant"
      if (field === 'variantInfo') {
        const base = it.baseProductName || it.rawProductName;
        const v = String(value).trim();
        next.rawProductName = v ? `${base} - ${v}` : base;
      }
      // When rawProductName is manually changed (free-text, no product selected), reset base too
      if (field === 'rawProductName' && !it.productId) {
        next.baseProductName = String(value);
      }
      return next;
    }));
  };

  const handleProductSelect = (id: string, p: ProductOption) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const v = it.variantInfo.trim();
      const combinedName = v ? `${p.name} - ${v}` : p.name;
      return { ...it, productId: p.id, rawProductName: combinedName, baseProductName: p.name, sku: p.sku || "", price: (p.sellingPrice || p.costPrice || 0) / 100 };
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const handleSubmit = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      toast({ title: "Erreur", description: "Nom et téléphone sont obligatoires.", variant: "destructive" });
      return;
    }
    if (items.every(it => !it.rawProductName.trim())) {
      toast({ title: "Erreur", description: "Ajoutez au moins un produit.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/orders/manual", {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerCity: customerCity.trim(),
        status,
        canOpen: canOpen ? 1 : 0,
        isStock: isStock ? 1 : 0,
        replace: replace ? 1 : 0,
        agentId: agentId ? parseInt(agentId) : null,
        comment: comment.trim() || null,
        totalPrice: itemsTotal,
        items: items
          .filter(it => it.rawProductName.trim())
          .map(it => ({
            productId: it.productId ?? null,
            rawProductName: it.rawProductName,
            sku: it.sku || null,
            variantInfo: it.variantInfo || null,
            price: Math.round(it.price * 100),
            quantity: it.quantity,
          })),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur serveur");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Commande créée", description: "La commande a été enregistrée avec succès." });
      navigate("/orders/nouveau");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur lors de la création", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-sm font-bold uppercase tracking-widest text-gray-700">Ajouter une commande</h1>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Commandes</span>
          <span>/</span>
          <span className="text-gray-700">Ajouter une commande</span>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Card 1: Settings + toggles */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Ajouter une Commande</h2>
            <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => navigate("/orders/import")}>
              <Upload className="w-3.5 h-3.5" /> Importer
            </Button>
          </div>

          {/* Boutique + toggles */}
          <div className="flex flex-wrap items-end gap-8 mb-6">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs mb-1.5 block">Boutique *</Label>
              <Input value={storeData?.name || ""} readOnly className="bg-gray-50 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Ouvrable:</Label>
              <Switch checked={canOpen} onCheckedChange={setCanOpen} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">En Stock:</Label>
              <Switch checked={isStock} onCheckedChange={setIsStock} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Remplacement:</Label>
              <Switch checked={replace} onCheckedChange={setReplace} />
            </div>
          </div>

          {/* Customer info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs mb-1.5 block">Destinataire</Label>
              <Input placeholder="Nom complet" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Téléphone</Label>
              <Input placeholder="06XXXXXXXX" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Adresse</Label>
              <Input placeholder="Adresse complète" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
            </div>
            {activeCarriers.length > 1 && (
              <div>
                <Label className="text-xs mb-1.5 block">Transporteur</Label>
                <Select value={selectedCarrierProvider} onValueChange={v => { setSelectedCarrierProvider(v); setCustomerCity(""); }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Transporteur par défaut" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCarriers.map((c: any) => (
                      <SelectItem key={c.provider} value={c.provider}>{c.provider}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs mb-1.5 block">
                Ville
                {isCarrierSpecific && (
                  <span className="ml-1.5 text-[9px] font-normal text-gray-400 normal-case">
                    ({selectedCarrierProvider || activeCarriers[0]?.provider})
                  </span>
                )}
              </Label>
              <CityCombobox
                value={customerCity}
                onChange={setCustomerCity}
                cities={activeCities}
                isCarrierSpecific={isCarrierSpecific}
                carrierLogo={activeCarrierLogo}
                isLoading={citiesLoading}
                data-testid="select-city"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Sélectionnez une Status" /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isAgent && (
            <div>
              <Label className="text-xs mb-1.5 block">Equipe</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Sélectionnez une équipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assigné</SelectItem>
                  {(agents as any[]).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Commentaire</Label>
            <Textarea placeholder="Entrez le commentaire" value={comment} onChange={e => setComment(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>

        {/* Card 2: Products */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Produits de la commande</h2>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs"
              onClick={() => setItems(prev => [...prev, newItem()])}>
              <Plus className="w-3.5 h-3.5" /> Ajouter un produit
            </Button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_0.75fr_1fr_auto] gap-2 px-2 py-2 bg-gray-50 rounded text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            <span>Produit</span>
            <span>Reference (SKU)</span>
            <span>Variant</span>
            <span>Prix (U)</span>
            <span>Qte</span>
            <span>Total</span>
            <span></span>
          </div>

          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_0.75fr_1fr_auto] gap-2 items-center">
                <div>
                  <ProductCombobox
                    products={products as ProductOption[]}
                    value={item.rawProductName}
                    onChange={p => handleProductSelect(item.id, p)}
                    placeholder="Rechercher dans le stock..."
                  />
                </div>
                <Input className="text-xs h-9" placeholder="Référence" value={item.sku} onChange={e => updateItem(item.id, "sku", e.target.value)} />
                <Input
                  className="text-xs h-9"
                  placeholder="ex: 42, Rouge, XL..."
                  value={item.variantInfo}
                  title={item.rawProductName ? `Nom affiché: ${item.rawProductName}` : undefined}
                  onChange={e => updateItem(item.id, "variantInfo", e.target.value)}
                />
                <Input
                  type="number" className="text-xs h-9" placeholder="0"
                  value={item.price || ""}
                  onChange={e => updateItem(item.id, "price", parseFloat(e.target.value) || 0)}
                />
                <Input
                  type="number" min={1} className="text-xs h-9"
                  value={item.quantity}
                  onChange={e => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                />
                <Input
                  readOnly
                  className="text-xs h-9 bg-gray-50 font-semibold"
                  value={(item.price * item.quantity).toFixed(2)}
                />
                <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => removeItem(item.id)}
                  disabled={items.length === 1}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Total box */}
          <div className="flex justify-end mt-5">
            <div className="w-64">
              <Label className="text-xs mb-1.5 block text-gray-600">Prix Total de la Commande (DH)</Label>
              <div className="border-2 border-gray-200 rounded-lg px-4 py-3 bg-gray-50 text-right">
                <span className="text-2xl font-bold text-gray-800">{itemsTotal.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-gray-400 text-right mt-1">Le total est calculé automatiquement.</p>
            </div>
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer la Commande
        </Button>
      </div>
    </div>
  );
}

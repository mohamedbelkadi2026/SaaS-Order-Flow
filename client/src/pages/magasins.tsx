import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useAgents, useStore, useMagasins, useCreateMagasin,
  useUpdateMagasin, useDeleteMagasin, useUploadLogo,
  useActiveCarrierAccounts, useIntegrations,
} from "@/hooks/use-store-data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Store, User, Truck, Globe, Plus, Pencil, Loader2,
  X, Home, Users, Tag, Trash2, Package, ChevronDown,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const WHATSAPP_VARIABLES = [
  { label: "*{Nom_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" },
  { label: "*{Ville_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" },
  { label: "*{Address_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" },
  { label: "*{Phone_Client}*", color: "text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800" },
  { label: "*{Date_Commande}*", color: "text-red-500 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" },
  { label: "*{Heure}*", color: "text-gray-700 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700" },
  { label: "*{Nom_Produit}*", color: "text-gray-700 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700" },
  { label: "*{Transporteur}*", color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" },
  { label: "*{Date_Livraison}*", color: "text-red-500 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" },
];

const SERVICES_OPTIONS = [
  { value: "confirmation", label: "Confirmation" },
  { value: "suivi", label: "Suivi" },
];

interface StoreForm {
  name: string;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  canOpen: boolean;
  isStock: boolean;
  isRamassage: boolean;
  whatsappTemplate: string;
  packagingCost: number;
}

const defaultForm: StoreForm = {
  name: "", phone: "0600000000", website: "https://example.com",
  facebook: "", instagram: "", canOpen: true, isStock: false, isRamassage: true,
  whatsappTemplate: "", packagingCost: 0,
};

// ---- Reusable inline multi-select dropdown ----
function InlineMultiSelect({
  placeholder, items, selected, onToggle, getLabel, getId, searchable = true,
}: {
  placeholder: string;
  items: any[];
  selected: (string | number)[];
  onToggle: (id: string | number) => void;
  getLabel: (item: any) => string;
  getId: (item: any) => string | number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = items.filter(item =>
    !search || getLabel(item).toLowerCase().includes(search.toLowerCase())
  );
  const selectedItems = items.filter(item => selected.includes(getId(item)));

  return (
    <div className="relative">
      <div
        className="flex items-center flex-wrap gap-1.5 min-h-[40px] px-3 py-2 border rounded-lg bg-background cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {selectedItems.length > 0 ? (
          <>
            {selectedItems.map(item => (
              <Badge key={getId(item)} variant="secondary" className="text-xs gap-1 pr-1 h-6">
                {getLabel(item)}
                <button type="button" onClick={e => { e.stopPropagation(); onToggle(getId(item)); }} className="ml-0.5 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">{placeholder}</span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-card border rounded-lg shadow-xl max-h-52 overflow-y-auto">
            {searchable && (
              <div className="p-2 border-b">
                <Input
                  className="h-8 text-sm"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat</p>
            ) : filtered.map(item => {
              const id = getId(item);
              const isChecked = selected.includes(id);
              return (
                <label
                  key={id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Checkbox checked={isChecked} onCheckedChange={() => onToggle(id)} />
                  <span className="text-sm">{getLabel(item)}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- WhatsApp live preview ----
function WhatsAppPreview({ storeName, message }: { storeName: string; message: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Aperçu du message</p>
      <div className="bg-[#e5ddd5] dark:bg-[#1a1a2e] rounded-2xl overflow-hidden">
        <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-400 flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-white">{storeName || "Boutique"}</p>
            <p className="text-xs text-green-300">en ligne</p>
          </div>
        </div>
        <div className="p-3 min-h-[120px]">
          {(message || "Hello 👋") && (
            <div className="max-w-[90%]">
              <div className="bg-[#dcf8c6] dark:bg-green-900 rounded-lg rounded-tl-none px-3 py-2 shadow-sm inline-block">
                <p className="text-sm whitespace-pre-wrap break-words">{message || "Hello 👋"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Store Modal ----
function StoreModal({
  isOpen, onClose, title, form, setForm, onSave, isPending,
  agents, carrierAccounts, storeIntegrationsList,
  logoUrl, onLogoUpload, isUploadingLogo,
  selectedAgentIds, setSelectedAgentIds,
  selectedServices, setSelectedServices,
  selectedCarriers, setSelectedCarriers,
  selectedPlatforms, setSelectedPlatforms,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  form: StoreForm;
  setForm: (f: StoreForm | ((prev: StoreForm) => StoreForm)) => void;
  onSave: () => void;
  isPending: boolean;
  agents: any[];
  carrierAccounts: any[];
  storeIntegrationsList: any[];
  logoUrl?: string | null;
  onLogoUpload?: (base64: string) => void;
  isUploadingLogo?: boolean;
  selectedAgentIds: number[];
  setSelectedAgentIds: (v: number[]) => void;
  selectedServices: string[];
  setSelectedServices: (v: string[]) => void;
  selectedCarriers: string[];
  setSelectedCarriers: (v: string[]) => void;
  selectedPlatforms: string[];
  setSelectedPlatforms: (v: string[]) => void;
}) {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const toggleAgent = (id: string | number) => {
    const nid = Number(id);
    setSelectedAgentIds(
      selectedAgentIds.includes(nid)
        ? selectedAgentIds.filter(x => x !== nid)
        : [...selectedAgentIds, nid]
    );
  };
  const toggleService = (v: string | number) => {
    const val = String(v);
    setSelectedServices(
      selectedServices.includes(val)
        ? selectedServices.filter(x => x !== val)
        : [...selectedServices, val]
    );
  };
  const toggleCarrier = (v: string | number) => {
    const val = String(v);
    setSelectedCarriers(
      selectedCarriers.includes(val)
        ? selectedCarriers.filter(x => x !== val)
        : [...selectedCarriers, val]
    );
  };
  const togglePlatform = (v: string | number) => {
    const val = String(v);
    setSelectedPlatforms(
      selectedPlatforms.includes(val)
        ? selectedPlatforms.filter(x => x !== val)
        : [...selectedPlatforms, val]
    );
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { alert("Image trop volumineuse (max 500KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => { if (onLogoUpload) onLogoUpload(reader.result as string); };
    reader.readAsDataURL(file);
  };

  const insertVariable = (variable: string) => {
    const textarea = templateRef.current;
    if (!textarea) {
      setForm(f => ({ ...f, whatsappTemplate: f.whatsappTemplate + variable }));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.whatsappTemplate;
    const newText = text.substring(0, start) + variable + text.substring(end);
    setForm(f => ({ ...f, whatsappTemplate: newText }));
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  };

  const agentItems = (agents || []).filter((a: any) => a.role === 'agent');

  const carrierItems = (carrierAccounts || []).map((acc: any) => ({
    value: acc.carrierName,
    label: acc.connectionName
      ? `${acc.connectionName} (${acc.carrierName})`
      : acc.carrierName,
  }));
  const uniqueCarrierItems = carrierItems.filter(
    (c, i, arr) => arr.findIndex(x => x.value === c.value) === i
  );

  const platformItems = (storeIntegrationsList || []).map((s: any) => ({
    value: s.provider,
    label: s.provider,
  }));

  const isCreate = !title.includes("Modifier");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[940px] max-h-[92vh] overflow-hidden p-0 rounded-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-card">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        <div className="flex overflow-hidden" style={{ height: "calc(92vh - 130px)" }}>
          {/* LEFT COLUMN */}
          <div className="w-[260px] shrink-0 border-r flex flex-col gap-5 p-5 overflow-y-auto bg-gray-50/50 dark:bg-muted/5">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">Photo du business (Logo)</p>
              <div className="w-[150px] h-[150px] border-2 border-dashed border-border rounded-xl flex items-center justify-center bg-white dark:bg-card overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <p className="text-sm text-muted-foreground">150 × 150</p>
                )}
              </div>
              <input type="file" ref={logoInputRef} accept="image/*" className="hidden" onChange={handleLogoSelect} data-testid="input-logo-file" />
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-gray-100 dark:bg-muted border-gray-300"
                disabled={isUploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                data-testid="button-change-logo"
              >
                {isUploadingLogo ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Changer l'image
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prix emballage (DH/pièce)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 3.00"
                  value={form.packagingCost}
                  onChange={e => setForm(f => ({ ...f, packagingCost: parseFloat(e.target.value) || 0 }))}
                  className="w-full h-8 text-sm px-3 border border-border rounded-md bg-background"
                  data-testid="input-packaging-cost"
                />
                <p className="text-[10px] text-muted-foreground">Coût d'emballage par commande, déduit du profit net.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Peut ouvrir</span>
                <Switch checked={form.canOpen} onCheckedChange={v => setForm(f => ({ ...f, canOpen: v }))} data-testid="switch-can-open" />
              </div>
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="stock-mode-modal" checked={form.isStock && !form.isRamassage}
                    onChange={() => setForm(f => ({ ...f, isStock: true, isRamassage: false }))} className="accent-primary" />
                  <span className="text-sm">Stock</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="stock-mode-modal" checked={form.isRamassage}
                    onChange={() => setForm(f => ({ ...f, isRamassage: true, isStock: false }))} className="accent-green-500" />
                  <span className="text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Ramassage
                  </span>
                </label>
              </div>
            </div>

            <WhatsAppPreview storeName={form.name} message={form.whatsappTemplate} />
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

            {/* Business Info */}
            <section>
              <div className="flex items-center gap-2 text-blue-600 mb-4">
                <Home className="w-4 h-4" />
                <h3 className="font-semibold text-base">Informations du business</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Nom du business*</Label>
                  <Input data-testid="input-store-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du business" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Téléphone de l'auteur*</Label>
                  <Input data-testid="input-store-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0600000000" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Site web</Label>
                  <Input data-testid="input-store-website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Facebook</Label>
                  <Input data-testid="input-store-facebook" value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} placeholder="Lien Facebook" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Instagram</Label>
                  <Input data-testid="input-store-instagram" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="Lien Instagram" />
                </div>
              </div>
            </section>

            {/* Team */}
            <section>
              <div className="flex items-center gap-2 text-blue-600 mb-4">
                <Users className="w-4 h-4" />
                <h3 className="font-semibold text-base">Ajouter votre équipe au magasin</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sélectionnez une ou plusieurs équipes</Label>
                  <InlineMultiSelect
                    placeholder="Sélectionnez une ou plusieurs équipes"
                    items={agentItems}
                    selected={selectedAgentIds}
                    onToggle={toggleAgent}
                    getId={(a: any) => a.id}
                    getLabel={(a: any) => a.username}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Choisissez les services disponibles</Label>
                  <InlineMultiSelect
                    placeholder="Choisissez les services disponibles"
                    items={SERVICES_OPTIONS}
                    selected={selectedServices}
                    onToggle={toggleService}
                    getId={(s: any) => s.value}
                    getLabel={(s: any) => s.label}
                    searchable={false}
                  />
                </div>
              </div>
            </section>

            {/* Delivery */}
            <section>
              <div className="flex items-center gap-2 text-blue-600 mb-4">
                <Truck className="w-4 h-4" />
                <h3 className="font-semibold text-base">Configuration de livraison</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Société de livraison</Label>
                  {uniqueCarrierItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Aucune société active. Connectez-en une dans Intégrations → Transporteurs.
                    </p>
                  ) : (
                    <InlineMultiSelect
                      placeholder="Choisir une ou plusieurs sociétés"
                      items={uniqueCarrierItems}
                      selected={selectedCarriers}
                      onToggle={toggleCarrier}
                      getId={(s: any) => s.value}
                      getLabel={(s: any) => s.label}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Choisir la plateforme</Label>
                  <InlineMultiSelect
                    placeholder="Choisir une ou plusieurs plateformes"
                    items={platformItems}
                    selected={selectedPlatforms}
                    onToggle={togglePlatform}
                    getId={(s: any) => s.value}
                    getLabel={(s: any) => s.label}
                  />
                </div>
              </div>
            </section>

            {/* WhatsApp */}
            <section>
              <div className="flex items-center gap-2 text-blue-600 mb-4">
                <SiWhatsapp className="w-4 h-4" />
                <h3 className="font-semibold text-base">Configuration de WhatsApp</h3>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Message WhatsApp</Label>
                  <Textarea
                    ref={templateRef}
                    data-testid="input-whatsapp-template"
                    value={form.whatsappTemplate}
                    onChange={e => setForm(f => ({ ...f, whatsappTemplate: e.target.value }))}
                    placeholder="Saisissez votre message ici..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Variables disponibles:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {WHATSAPP_VARIABLES.map(v => (
                      <button
                        key={v.label}
                        type="button"
                        onClick={() => insertVariable(v.label)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${v.color}`}
                        data-testid={`tag-${v.label.replace(/[*{}]/g, '')}`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={onClose} className="px-6">Annuler</Button>
              <Button
                data-testid="button-save-store"
                onClick={onSave}
                disabled={isPending}
                className="px-6 bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isCreate ? "Créer boutique" : "Sauvegarder"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Magasins() {
  const { user } = useAuth();
  const { data: agents } = useAgents();
  const { data: storeIntegrations } = useIntegrations("store");
  const { data: storeData } = useStore();
  const { data: magasins } = useMagasins();
  const { data: activeCarrierAccounts = [] } = useActiveCarrierAccounts();
  const createMagasin = useCreateMagasin();
  const updateMagasin = useUpdateMagasin();
  const deleteMagasin = useDeleteMagasin();
  const uploadLogo = useUploadLogo();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<any>(null);
  const [form, setForm] = useState<StoreForm>({ ...defaultForm });
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);

  // ── Multi-select state lifted to parent so it persists across modal opens ──
  const [selectedAgentIds, setSelectedAgentIds]   = useState<number[]>([]);
  const [selectedServices, setSelectedServices]   = useState<string[]>([]);
  const [selectedCarriers, setSelectedCarriers]   = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const resetSelections = () => {
    setSelectedAgentIds([]);
    setSelectedServices([]);
    setSelectedCarriers([]);
    setSelectedPlatforms([]);
  };

  const resetForm = () => {
    setForm({ ...defaultForm });
    resetSelections();
  };

  const storeToForm = (store: any): StoreForm => ({
    name: store.name || "",
    phone: store.phone || "",
    website: store.website || "",
    facebook: store.facebook || "",
    instagram: store.instagram || "",
    canOpen: store.canOpen !== 0,
    isStock: store.isStock === 1,
    isRamassage: store.isRamassage === 1,
    whatsappTemplate: store.whatsappTemplate || "",
    packagingCost: Math.round((store.packagingCost || 0) / 100),
  });

  // Build payload including multi-select state
  const buildPayload = (f: StoreForm) => ({
    name: f.name,
    phone: f.phone || null,
    website: f.website || null,
    facebook: f.facebook || null,
    instagram: f.instagram || null,
    canOpen: f.canOpen ? 1 : 0,
    isStock: f.isStock ? 1 : 0,
    isRamassage: f.isRamassage ? 1 : 0,
    whatsappTemplate: f.whatsappTemplate || null,
    packagingCost: Math.round((f.packagingCost || 0) * 100),
    agentIds: selectedAgentIds,
    services: selectedServices,
    linkedCarriers: selectedCarriers,
    linkedPlatforms: selectedPlatforms,
  });

  const handleLogoUpload = async (storeId: number, base64: string) => {
    try {
      await uploadLogo.mutateAsync({ id: storeId, logoData: base64 });
      setNewLogoPreview(base64);
      toast({ title: "Logo mis à jour" });
    } catch (err: any) {
      toast({ title: "Erreur logo", description: err.message || "Impossible de télécharger", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: "Erreur", description: "Nom du magasin requis", variant: "destructive" });
      return;
    }
    try {
      const newStore = await createMagasin.mutateAsync(buildPayload(form));
      if (newLogoPreview && newStore?.id) {
        try { await uploadLogo.mutateAsync({ id: newStore.id, logoData: newLogoPreview }); } catch {}
      }
      toast({ title: "Boutique créée", description: `${form.name} a été ajouté` });
      resetForm();
      setNewLogoPreview(null);
      setAddOpen(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de créer", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editStore || !form.name.trim()) return;
    try {
      await updateMagasin.mutateAsync({ id: editStore.id, ...buildPayload(form) });
      toast({ title: "Mis à jour", description: "Magasin modifié avec succès" });
      setEditStore(null);
      resetForm();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (store: any) => {
    if (store.id === storeData?.id) {
      toast({ title: "Erreur", description: "Impossible de supprimer votre magasin actuel", variant: "destructive" });
      return;
    }
    if (!confirm(`Supprimer ${store.name} ?`)) return;
    try {
      await deleteMagasin.mutateAsync(store.id);
      toast({ title: "Supprimé", description: `${store.name} a été supprimé` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    }
  };

  // ── openEdit: populate form AND multi-select state from store data ──
  const openEdit = (store: any) => {
    setEditStore(store);
    setForm(storeToForm(store));
    setSelectedAgentIds(Array.isArray(store.agentIds) ? store.agentIds.map(Number) : []);
    setSelectedServices(Array.isArray(store.services) ? store.services : []);
    setSelectedCarriers(Array.isArray(store.linkedCarriers) ? store.linkedCarriers : []);
    setSelectedPlatforms(Array.isArray(store.linkedPlatforms) ? store.linkedPlatforms : []);
    setNewLogoPreview(null);
  };

  const agentList = agents || [];
  const platformList = storeIntegrations || [];

  const sharedModalProps = {
    agents: agentList,
    carrierAccounts: activeCarrierAccounts,
    storeIntegrationsList: platformList,
    selectedAgentIds, setSelectedAgentIds,
    selectedServices, setSelectedServices,
    selectedCarriers, setSelectedCarriers,
    selectedPlatforms, setSelectedPlatforms,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase">Mes Magasins</h1>
          <p className="text-muted-foreground mt-1">Gérez vos boutiques, équipes et configurations.</p>
        </div>
        <Button
          className="gap-2 bg-primary hover:bg-primary/90"
          data-testid="button-create-store"
          onClick={() => { resetForm(); setNewLogoPreview(null); setAddOpen(true); }}
        >
          <Plus className="w-4 h-4" /> Ajouter un magasin
        </Button>
      </div>

      {/* Store cards */}
      {(!magasins || magasins.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Store className="w-14 h-14 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-semibold text-muted-foreground">Aucun magasin</p>
          <p className="text-sm text-muted-foreground mt-1">Créez votre première boutique pour commencer</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {magasins.map((store: any) => {
            // Resolve agent names from saved agentIds
            const storeAgentNames = (Array.isArray(store.agentIds) ? store.agentIds : [])
              .map((id: number) => agentList.find((a: any) => a.id === id)?.username)
              .filter(Boolean);

            return (
              <Card key={store.id} className="p-5 border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Store className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-base" data-testid="text-store-name">{store.name}</p>
                      {storeData?.id === store.id && (
                        <Badge className="text-[10px] bg-primary/10 text-primary border-none mt-0.5">Boutique active</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-muted" onClick={() => openEdit(store)} data-testid={`button-edit-store-${store.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(store)} data-testid={`button-delete-store-${store.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  {store.phone && <p>📞 {store.phone}</p>}
                  {store.website && <p>🌐 <a href={store.website} target="_blank" className="hover:text-primary">{store.website}</a></p>}
                </div>

                <div className="flex gap-2 flex-wrap mt-3">
                  <Badge variant="outline" className={cn("text-[10px]", store.canOpen ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200")}>
                    {store.canOpen ? "Ouvert" : "Fermé"}
                  </Badge>
                  {store.isRamassage ? (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Ramassage</Badge>
                  ) : store.isStock ? (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Stock</Badge>
                  ) : null}
                  {Array.isArray(store.linkedCarriers) && store.linkedCarriers.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                      <Truck className="w-2.5 h-2.5 mr-1" />
                      {store.linkedCarriers.join(", ")}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  <span className="font-semibold">Agents:</span>{" "}
                  <span data-testid="text-agent-list">
                    {storeAgentNames.length > 0 ? storeAgentNames.join(", ") : "Aucun agent"}
                  </span>
                </div>

                {Array.isArray(store.services) && store.services.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-semibold">Services:</span>{" "}
                    {store.services.join(", ")}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <StoreModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); resetSelections(); }}
        title="Ajouter un nouveau business"
        form={form}
        setForm={setForm}
        onSave={handleCreate}
        isPending={createMagasin.isPending}
        logoUrl={newLogoPreview}
        onLogoUpload={(b64) => setNewLogoPreview(b64)}
        isUploadingLogo={uploadLogo.isPending}
        {...sharedModalProps}
      />

      {/* Edit Modal */}
      {editStore && (
        <StoreModal
          isOpen={!!editStore}
          onClose={() => { setEditStore(null); resetSelections(); }}
          title={`Modifier — ${editStore.name}`}
          form={form}
          setForm={setForm}
          onSave={handleUpdate}
          isPending={updateMagasin.isPending}
          logoUrl={newLogoPreview || editStore.logoUrl}
          onLogoUpload={(b64) => handleLogoUpload(editStore.id, b64)}
          isUploadingLogo={uploadLogo.isPending}
          {...sharedModalProps}
        />
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAgents, useIntegrations, useStore, useMagasins, useCreateMagasin, useUpdateMagasin, useDeleteMagasin, useUploadLogo } from "@/hooks/use-store-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Store, User, CheckCircle2, Truck, Globe, Plus, Pencil, Save, Loader2, X, Home, Users, MessageCircle, Tag, Trash2, Package } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_VARIABLES = [
  { label: "*{Nom_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "*{Ville_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "*{Address_Client}*", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "*{Phone_Client}*", color: "text-red-500 bg-red-50 border-red-200" },
  { label: "*{Date_Commande}*", color: "text-red-500 bg-red-50 border-red-200" },
  { label: "*{Heure}*", color: "text-gray-700 bg-gray-50 border-gray-200" },
  { label: "*{Nom_Produit}*", color: "text-gray-700 bg-gray-50 border-gray-200" },
  { label: "*{Transporteur}*", color: "text-green-600 bg-green-50 border-green-200" },
  { label: "*{Date_Livraison}*", color: "text-red-500 bg-red-50 border-red-200" },
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
}

const defaultForm: StoreForm = {
  name: "", phone: "0600000000", website: "https://example.com",
  facebook: "", instagram: "", canOpen: true, isStock: false, isRamassage: true,
  whatsappTemplate: "",
};

function WhatsAppPreview({ storeName, message }: { storeName: string; message: string }) {
  const preview = message || "Hello";
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Aperçu du message</p>
      <div className="bg-[#e5ddd5] dark:bg-[#1a1a2e] rounded-2xl p-4 min-h-[200px] relative" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" fill=\"none\"%3E%3Cpath d=\"M0 0h200v200H0z\" fill=\"%23e5ddd5\"/%3E%3C/svg%3E')" }}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
              <Package className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{storeName || "Boutique"}</p>
              <p className="text-xs text-green-600">en ligne</p>
            </div>
            <div className="text-muted-foreground">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </div>
          </div>
        </div>
        <div className="max-w-[85%]">
          <div className="bg-[#dcf8c6] dark:bg-green-900 rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
            <p className="text-sm whitespace-pre-wrap break-words">{preview}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreModal({ isOpen, onClose, title, form, setForm, onSave, isPending, agents, shippingIntegrations, storeIntegrationsList, logoUrl, onLogoUpload, isUploadingLogo }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  form: StoreForm;
  setForm: (f: StoreForm | ((prev: StoreForm) => StoreForm)) => void;
  onSave: () => void;
  isPending: boolean;
  agents: any[];
  shippingIntegrations: any[];
  storeIntegrationsList: any[];
  logoUrl?: string | null;
  onLogoUpload?: (base64: string) => void;
  isUploadingLogo?: boolean;
}) {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) {
      alert("Image trop volumineuse (max 500KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (onLogoUpload) onLogoUpload(base64);
    };
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[900px] max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="px-6 pt-5 text-lg font-bold">{title}</DialogTitle>
        <div className="flex flex-col md:flex-row gap-0 md:gap-6 px-6 pb-6">
          <div className="md:w-[240px] shrink-0 space-y-5 py-4">
            <div className="flex flex-col items-center">
              <p className="text-sm text-muted-foreground mb-2">Photo du business (Logo)</p>
              <div className="w-[150px] h-[150px] border-2 border-dashed border-border rounded-xl flex items-center justify-center bg-muted/30 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                ) : form.name ? (
                  <div className="text-center">
                    <Package className="w-10 h-10 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs font-semibold text-muted-foreground">{form.name}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">150 x 150</p>
                )}
              </div>
              <input type="file" ref={logoInputRef} accept="image/*" className="hidden" onChange={handleLogoSelect} data-testid="input-logo-file" />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                disabled={isUploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                data-testid="button-change-logo"
              >
                {isUploadingLogo ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                {logoUrl ? "Changer l'image" : "Ajouter une image"}
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Peut ouvrir</Label>
                <Switch checked={form.canOpen} onCheckedChange={v => setForm(f => ({ ...f, canOpen: v }))} data-testid="switch-can-open" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="stock-mode" checked={form.isStock && !form.isRamassage} onChange={() => setForm(f => ({ ...f, isStock: true, isRamassage: false }))} className="accent-primary" />
                  <span className="text-sm">Stock</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="stock-mode" checked={form.isRamassage} onChange={() => setForm(f => ({ ...f, isRamassage: true, isStock: false }))} className="accent-green-500" />
                  <span className="text-sm flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                    Ramassage
                  </span>
                </label>
              </div>
            </div>

            <WhatsAppPreview storeName={form.name} message={form.whatsappTemplate} />
          </div>

          <div className="flex-1 space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <Home className="w-4 h-4" />
                <h3 className="font-semibold text-base">Informations du business</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nom du business*</Label>
                  <Input data-testid="input-store-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du business" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Téléphone de l'auteur*</Label>
                  <Input data-testid="input-store-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0600000000" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Site web</Label>
                  <Input data-testid="input-store-website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Facebook</Label>
                  <Input data-testid="input-store-facebook" value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} placeholder="Lien vers la page Facebook" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Instagram</Label>
                  <Input data-testid="input-store-instagram" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="Lien Instagram" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <Users className="w-4 h-4" />
                <h3 className="font-semibold text-base">Ajouter votre équipe au magasin</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sélectionnez une ou plusieurs équipes</Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[40px] bg-background">
                    {agents.length > 0 ? agents.map((a: any) => (
                      <Badge key={a.id} variant="secondary" className="text-xs gap-1 px-2 py-1">
                        {a.username}
                      </Badge>
                    )) : (
                      <span className="text-sm text-muted-foreground">Sélectionnez une ou plusieurs équipes</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Choisissez les services disponibles</Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[40px] bg-background">
                    <Badge variant="secondary" className="text-xs gap-1 px-2 py-1">
                      Confirmation
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <Truck className="w-4 h-4" />
                <h3 className="font-semibold text-base">Configuration de livraison</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Société de livraison</Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[40px] bg-background">
                    {shippingIntegrations.length > 0 ? shippingIntegrations.map((s: any) => (
                      <Badge key={s.id} variant="secondary" className="text-xs gap-1 px-2 py-1">
                        <Truck className="w-3 h-3" />
                        {s.provider}
                      </Badge>
                    )) : (
                      <span className="text-sm text-muted-foreground">Choisir une ou plusieurs sociétés</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Choisir la plateforme</Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[40px] bg-background">
                    {storeIntegrationsList.length > 0 ? storeIntegrationsList.map((s: any) => (
                      <Badge key={s.id} variant="secondary" className="text-xs gap-1 px-2 py-1">
                        <Globe className="w-3 h-3" />
                        {s.provider}
                      </Badge>
                    )) : (
                      <span className="text-sm text-muted-foreground">Choisir une ou plusieurs plateformes</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <MessageCircle className="w-4 h-4" />
                <h3 className="font-semibold text-base">Configuration de WhatsApp</h3>
              </div>
              <div className="space-y-2">
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
                  <Label className="text-sm font-semibold">Variables disponibles:</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {WHATSAPP_VARIABLES.map((v) => (
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

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button data-testid="button-save-store" onClick={onSave} disabled={isPending} className="gap-2 bg-blue-600 hover:bg-blue-700">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {title.includes("Modifier") ? "Sauvegarder" : "Créer boutique"}
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
  const { data: shippingIntegrations } = useIntegrations("shipping");
  const { data: storeData } = useStore();
  const { data: magasins } = useMagasins();
  const createMagasin = useCreateMagasin();
  const updateMagasin = useUpdateMagasin();
  const deleteMagasin = useDeleteMagasin();
  const uploadLogo = useUploadLogo();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<any>(null);
  const [form, setForm] = useState<StoreForm>({ ...defaultForm });
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);

  const resetForm = () => setForm({ ...defaultForm });

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
  });

  const formToPayload = (f: StoreForm) => ({
    name: f.name,
    phone: f.phone || null,
    website: f.website || null,
    facebook: f.facebook || null,
    instagram: f.instagram || null,
    canOpen: f.canOpen ? 1 : 0,
    isStock: f.isStock ? 1 : 0,
    isRamassage: f.isRamassage ? 1 : 0,
    whatsappTemplate: f.whatsappTemplate || null,
  });

  const handleLogoUpload = async (storeId: number, base64: string) => {
    try {
      await uploadLogo.mutateAsync({ id: storeId, logoData: base64 });
      setNewLogoPreview(base64);
      toast({ title: "Logo mis à jour", description: "L'image a été enregistrée" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de télécharger le logo", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: "Erreur", description: "Nom du magasin requis", variant: "destructive" });
      return;
    }
    try {
      const newStore = await createMagasin.mutateAsync(formToPayload(form));
      if (newLogoPreview && newStore?.id) {
        try {
          await uploadLogo.mutateAsync({ id: newStore.id, logoData: newLogoPreview });
        } catch {
          toast({ title: "Magasin créé", description: `${form.name} ajouté mais le logo n'a pas pu être enregistré.`, variant: "default" });
          resetForm();
          setNewLogoPreview(null);
          setAddOpen(false);
          return;
        }
      }
      toast({ title: "Magasin créé", description: `${form.name} a été ajouté` });
      resetForm();
      setNewLogoPreview(null);
      setAddOpen(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de créer le magasin", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editStore || !form.name.trim()) return;
    try {
      await updateMagasin.mutateAsync({ id: editStore.id, ...formToPayload(form) });
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

  const openEdit = (store: any) => {
    setEditStore(store);
    setForm(storeToForm(store));
    setNewLogoPreview(null);
  };

  const openAdd = () => {
    resetForm();
    setAddOpen(true);
  };

  const storeName = storeData?.name || "Ma Boutique";
  const ownerName = user?.username || "Propriétaire";
  const connectedStores = storeIntegrations?.filter((i: any) => i.isActive) || [];
  const agentList = agents || [];
  const shippingList = shippingIntegrations?.filter((i: any) => i.isActive) || [];
  const platformList = storeIntegrations?.filter((i: any) => i.isActive) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-magasins-title">Mes magasins</h1>
          <p className="text-muted-foreground mt-1">Gérez vos boutiques, équipes et configurations.</p>
        </div>
        <Button data-testid="button-add-magasin" className="gap-2 shadow-lg shadow-primary/20" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Ajouter un magasin
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid="card-store-main">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden border">
                  {storeData?.logoUrl ? (
                    <img src={storeData.logoUrl} alt={storeName} className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg uppercase tracking-tight" data-testid="text-store-name">{storeName}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {ownerName}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(storeData)} data-testid="button-edit-store">
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 px-3 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                </div>
                Actif
              </Badge>
              <Badge variant="outline" className="text-xs">Magasin principal</Badge>
              {storeData?.whatsappTemplate && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">
                  <SiWhatsapp className="w-3 h-3 mr-1" /> WhatsApp
                </Badge>
              )}
            </div>

            <div className="bg-muted/30 rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">ÉQUIPE DE TRAITEMENT</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold">Agents:</span>
                  <span className="text-muted-foreground" data-testid="text-agent-list">
                    {agentList.length > 0 ? agentList.map((a: any) => a.username).join(", ") : "Aucun agent"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">Livraison:</span>
                  <span className="text-muted-foreground">
                    {shippingList.length > 0 ? shippingList.map((s: any) => s.provider).join(", ") : "Aucun transporteur"}
                  </span>
                </div>
              </div>
            </div>

            {storeData?.phone && (
              <p className="text-xs text-muted-foreground mb-4">Tel: {storeData.phone}</p>
            )}

            <div className="flex justify-between items-center">
              <div className="flex gap-2 flex-wrap">
                {connectedStores.length > 0 ? connectedStores.map((s: any) => (
                  <div key={s.id} className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground" title={s.provider}>
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                )) : (
                  <span className="text-xs text-muted-foreground">Aucune intégration connectée</span>
                )}
              </div>
              <div className="flex items-center h-6 w-10 bg-green-500 rounded-full relative px-1">
                <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {magasins?.filter((m: any) => m.id !== storeData?.id).map((store: any) => (
          <Card key={store.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid={`card-store-${store.id}`}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center border overflow-hidden">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
                    ) : (
                      <Store className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg uppercase tracking-tight">{store.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {store.phone || `ID: ${store.id}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(store)} data-testid={`button-edit-store-${store.id}`}>
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(store)} data-testid={`button-delete-store-${store.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {store.canOpen !== 0 && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">Peut ouvrir</Badge>
                )}
                {store.isRamassage === 1 && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">Ramassage</Badge>
                )}
                {store.whatsappTemplate && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">
                    <SiWhatsapp className="w-3 h-3 mr-1" /> WhatsApp
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  Créé le {store.createdAt ? new Date(store.createdAt).toLocaleDateString('fr-MA') : '-'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <StoreModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); resetForm(); setNewLogoPreview(null); }}
        title="Ajouter un nouveau business"
        form={form}
        setForm={setForm}
        onSave={handleCreate}
        isPending={createMagasin.isPending}
        agents={agentList}
        shippingIntegrations={shippingList}
        storeIntegrationsList={platformList}
        logoUrl={newLogoPreview}
        onLogoUpload={(base64) => setNewLogoPreview(base64)}
        isUploadingLogo={false}
      />

      <StoreModal
        isOpen={!!editStore}
        onClose={() => { setEditStore(null); resetForm(); setNewLogoPreview(null); }}
        title="Modifier le magasin"
        form={form}
        setForm={setForm}
        onSave={handleUpdate}
        isPending={updateMagasin.isPending}
        agents={agentList}
        shippingIntegrations={shippingList}
        storeIntegrationsList={platformList}
        logoUrl={newLogoPreview || editStore?.logoUrl}
        onLogoUpload={(base64) => editStore && handleLogoUpload(editStore.id, base64)}
        isUploadingLogo={uploadLogo.isPending}
      />
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Link2, Settings, CheckCircle, Unlink, Loader2, RotateCcw,
  ExternalLink, Eye, EyeOff, MapPin, Video, Home, ChevronRight,
  Plus, Copy, Check, Trash2, Pencil, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from "@/hooks/use-store-data";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

const SHIPPING_PROVIDERS = [
  { id: "digylog",        name: "Digylog",          cities: 581, logo: "/carriers/digylog.svg",   tutorialUrl: "https://youtu.be/digylog" },
  { id: "onessta",        name: "Onessta",           cities: 378, logo: "/carriers/onessta.svg",   tutorialUrl: "https://youtu.be/onessta" },
  { id: "ozoneexpress",   name: "Ozone Express",     cities: 628, logo: "/carriers/ozon.svg",      tutorialUrl: "https://youtu.be/ozone" },
  { id: "sendit",         name: "Sendit",            cities: 500, logo: "/carriers/sendit.svg",    tutorialUrl: "https://youtu.be/sendit" },
  { id: "ameex",          name: "Ameex",             cities: 420, logo: "/carriers/ameex.svg",     tutorialUrl: "https://youtu.be/ameex" },
  { id: "cathedis",       name: "Cathedis",          cities: 520, logo: "/carriers/cathidis.svg",  tutorialUrl: "https://youtu.be/cathedis" },
  { id: "speedex",        name: "Speedex",           cities: 439, logo: "/carriers/speedx.png",    tutorialUrl: "https://youtu.be/speedex" },
  { id: "kargoexpress",   name: "KargoExpress",      cities: 335, logo: "/carriers/cargo.svg",     tutorialUrl: "https://youtu.be/kargo" },
  { id: "forcelog",       name: "ForceLog",          cities: 468, logo: "/carriers/forcelog.png",  tutorialUrl: "https://youtu.be/forcelog" },
  { id: "livo",           name: "Livo",              cities: 369, logo: "/carriers/ol.svg",        tutorialUrl: "https://youtu.be/livo" },
  { id: "quicklivraison", name: "Quick Livraison",   cities: 404, logo: "/carriers/ql.svg",        tutorialUrl: "https://youtu.be/ql" },
  { id: "codinafrica",    name: "Codinafrica",       cities: 312, logo: "/carriers/cargo.svg",     tutorialUrl: "https://youtu.be/codinafrica" },
  { id: "olivraison",     name: "Olivraison",        cities: 280, logo: null,                      tutorialUrl: "https://youtu.be/olivraison" },
  { id: "livreego",       name: "Livreego",          cities: 295, logo: null,                      tutorialUrl: "https://youtu.be/livreego" },
  { id: "powerdelivery",  name: "PowerDelivery",     cities: 350, logo: null,                      tutorialUrl: "https://youtu.be/powerdelivery" },
  { id: "caledex",        name: "Caledex",           cities: 270, logo: null,                      tutorialUrl: "https://youtu.be/caledex" },
  { id: "oscario",        name: "Oscario",           cities: 390, logo: null,                      tutorialUrl: "https://youtu.be/oscario" },
  { id: "colisspeed",     name: "Colisspeed",        cities: 445, logo: null,                      tutorialUrl: "https://youtu.be/colisspeed" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ProviderLogo({ logo, name }: { logo: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);
  if (logo && !imgError) {
    return (
      <img src={logo} alt={name} onError={() => setImgError(true)}
        style={{ maxHeight: 40 }} className="w-full object-contain p-1.5" />
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-zinc-600 flex items-center justify-center">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-300">{name.slice(0, 2).toUpperCase()}</span>
      </div>
      <span className="text-[8px] text-gray-400 text-center leading-tight max-w-[48px] truncate">{name}</span>
    </div>
  );
}

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard.writeText(text).then(onDone);
}

// ─── Carrier Accounts Hooks ───────────────────────────────────────────────────

function useCarrierAccounts(provider: string) {
  return useQuery<any[]>({
    queryKey: ["/api/carrier-accounts", provider],
    queryFn: () => fetch(`/api/carrier-accounts?provider=${provider}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!provider,
  });
}

function useCreateCarrierAccount() {
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/carrier-accounts", data),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts", vars.carrierName] });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
    },
  });
}

function useUpdateCarrierAccount() {
  return useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/carrier-accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
    },
  });
}

function useDeleteCarrierAccount() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/carrier-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
    },
  });
}

// ─── Connection Modal (Add / Edit) ────────────────────────────────────────────

interface ConnectModalProps {
  providerId: string;
  providerName: string;
  editAccount?: any;
  onClose: () => void;
}

function ConnectModal({ providerId, providerName, editAccount, onClose }: ConnectModalProps) {
  const { toast } = useToast();
  const create = useCreateCarrierAccount();
  const update = useUpdateCarrierAccount();

  const origin = typeof window !== "undefined" ? window.location.origin : "https://tajergrow.com";
  const webhookUrl = editAccount
    ? `${origin}/api/webhook/carrier/${editAccount.webhookToken}`
    : `${origin}/api/webhooks/shipping/${providerId}`;

  const [storeName, setStoreName]           = useState(editAccount?.storeName || "");
  const [apiKey, setApiKey]                 = useState("");
  const [showKey, setShowKey]               = useState(false);
  const [assignDefault, setAssignDefault]   = useState<boolean>(editAccount ? editAccount.assignmentRule === "default" || editAccount.isDefault === 1 : true);
  const [assignCity, setAssignCity]         = useState<boolean>(editAccount?.assignmentRule === "city");
  const [assignProduct, setAssignProduct]   = useState<boolean>(editAccount?.assignmentRule === "product");
  const [copiedWebhook, setCopiedWebhook]   = useState(false);

  const resolvedRule = assignCity ? "city" : assignProduct ? "product" : "default";

  const handleSubmit = async () => {
    if (!editAccount && !apiKey.trim()) {
      toast({ title: "Champ requis", description: "Entrez votre token d'autorisation", variant: "destructive" });
      return;
    }
    try {
      if (editAccount) {
        await update.mutateAsync({
          id: editAccount.id,
          storeName,
          assignmentRule: resolvedRule,
          isDefault: assignDefault ? 1 : 0,
          ...(apiKey.trim() && { apiKey }),
        });
        toast({ title: "Mis à jour ✅" });
      } else {
        await create.mutateAsync({
          carrierName: providerId,
          apiKey,
          storeName,
          assignmentRule: resolvedRule,
          isDefault: assignDefault ? 1 : 0,
        });
        toast({ title: "Connecté ✅", description: `${providerName} ajouté avec succès` });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ color: NAVY }}>
            {editAccount ? `Modifier — ${editAccount.connectionName}` : `Connexion avec ${providerName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Store label */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Boutique <span className="text-red-500">*</span></Label>
            <Input
              data-testid="input-carrier-storename"
              placeholder="Nom de votre boutique"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>

          {/* Authorization */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Authorization {editAccount && <span className="text-muted-foreground font-normal">(laisser vide pour conserver)</span>}</Label>
            <div className="relative">
              <Input
                data-testid="input-carrier-apikey"
                type={showKey ? "text" : "password"}
                placeholder="Authorization token..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* WebHook */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">WebHook</Label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/30">
              <code className="flex-1 text-[11px] font-mono text-foreground truncate">{webhookUrl}</code>
              <button type="button"
                data-testid="button-copy-webhook"
                onClick={() => copyToClipboard(webhookUrl, () => { setCopiedWebhook(true); setTimeout(() => setCopiedWebhook(false), 2000); })}
                className="shrink-0 p-1.5 rounded-lg hover:bg-border/60 transition-colors">
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Collez cette URL dans les paramètres webhook du transporteur.</p>
          </div>

          {/* Assignment rule */}
          <div className="space-y-2 pt-1">
            <p className="text-sm font-semibold text-foreground">Pourquoi connectez-vous cette société ?</p>
            <div className="flex flex-col gap-2">
              {[
                { label: "Connecter par Défaut", active: assignDefault, set: () => { setAssignDefault(true); setAssignCity(false); setAssignProduct(false); } },
                { label: "Connecter par Ville",  active: assignCity,    set: () => { setAssignDefault(false); setAssignCity(true); setAssignProduct(false); } },
                { label: "Connecter par Produit",active: assignProduct,  set: () => { setAssignDefault(false); setAssignCity(false); setAssignProduct(true); } },
              ].map(opt => (
                <label key={opt.label} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div
                    onClick={opt.set}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${opt.active ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}
                  >
                    {opt.active && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-connect">
            Fermer
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="text-white font-bold px-8"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" }}
            data-testid="button-confirm-connect"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
            {isPending ? "..." : editAccount ? "Enregistrer" : "Connecter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credentials View Modal ───────────────────────────────────────────────────

interface CredentialsModalProps {
  providerId: string;
  providerName: string;
  onClose: () => void;
  onAddNew: () => void;
}

function CredentialsModal({ providerId, providerName, onClose, onAddNew }: CredentialsModalProps) {
  const { toast } = useToast();
  const { data: accounts = [], isLoading } = useCarrierAccounts(providerId);
  const updateAcct   = useUpdateCarrierAccount();
  const deleteAcct   = useDeleteCarrierAccount();

  const [activeTab, setActiveTab]     = useState(0);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [copiedId, setCopiedId]       = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://tajergrow.com";

  const handleToggle = async (acct: any) => {
    try {
      await updateAcct.mutateAsync({ id: acct.id, isActive: acct.isActive === 1 ? 0 : 1 });
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAcct.mutateAsync(id);
      queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      setConfirmDeleteId(null);
      if (activeTab >= accounts.length - 1) setActiveTab(Math.max(0, accounts.length - 2));
      toast({ title: "Supprimé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ color: NAVY }}>
            Credentials for {providerName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-muted-foreground text-sm">Aucune connexion trouvée.</p>
            <Button onClick={() => { onClose(); onAddNew(); }} className="text-white font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}>
              <Plus className="w-4 h-4 mr-2" /> Ajouter une connexion
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-muted/40 rounded-xl overflow-x-auto">
              {accounts.map((acct, i) => (
                <button
                  key={acct.id}
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                    activeTab === i
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-connection-${i}`}
                >
                  {acct.connectionName || `Connection ${i + 1}`}
                </button>
              ))}
            </div>

            {/* Account detail */}
            {accounts[activeTab] && (() => {
              const acct = accounts[activeTab];
              const webhookUrl = `${origin}/api/webhook/carrier/${acct.webhookToken}`;
              return (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-base text-foreground">{acct.connectionName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(acct.createdAt).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {acct.isDefault === 1 && (
                      <Badge className="text-[10px] font-bold bg-blue-100 text-blue-700 border-blue-200">Défaut</Badge>
                    )}
                  </div>

                  {/* Info block */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 border-b border-border/40">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Connection Information</p>
                    </div>
                    <div className="divide-y divide-border/30">
                      {[
                        ["Store", acct.storeName || "N/A"],
                        ["Status", acct.isActive === 1 ? "Active" : "Inactive"],
                        ["Règle", acct.assignmentRule === "city" ? "Par Ville" : acct.assignmentRule === "product" ? "Par Produit" : "Défaut"],
                        ["Created At", new Date(acct.createdAt).toLocaleString("fr-FR")],
                      ].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-muted-foreground">{label}:</span>
                          <span className={`text-sm font-medium ${val === "Active" ? "text-emerald-600" : val === "Inactive" ? "text-red-500" : "text-foreground"}`}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => setEditingId(acct.id)} data-testid={`button-edit-account-${acct.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(acct.id)} data-testid={`button-delete-account-${acct.id}`}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={acct.isActive === 1}
                        onCheckedChange={() => handleToggle(acct)}
                        data-testid={`switch-account-${acct.id}`}
                      />
                      <span className={`text-sm font-medium ${acct.isActive === 1 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {acct.isActive === 1 ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  {/* Credential table */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/40">
                          <th className="text-left px-4 py-2.5 font-bold text-muted-foreground text-xs uppercase tracking-wide">Credential</th>
                          <th className="text-left px-4 py-2.5 font-bold text-muted-foreground text-xs uppercase tracking-wide">Value</th>
                          <th className="text-right px-4 py-2.5 font-bold text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/20 last:border-0">
                          <td className="px-4 py-3 font-medium text-foreground">Authorization</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                            {acct.apiKeyMasked || `${(acct.apiKey || "").slice(0, 8)}••••••••`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              data-testid={`button-copy-key-${acct.id}`}
                              onClick={() => {
                                copyToClipboard(acct.apiKeyMasked || "", () => {
                                  setCopiedId(acct.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                });
                                toast({ title: "Copié ✅", description: "Token copié dans le presse-papier" });
                              }}
                              className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                            >
                              {copiedId === acct.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 font-medium text-foreground">WebHook URL</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">{webhookUrl}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                copyToClipboard(webhookUrl, () => {
                                  setCopiedId(-acct.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                });
                                toast({ title: "Copié ✅" });
                              }}
                              className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                            >
                              {copiedId === -acct.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Add new account button */}
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => { onClose(); onAddNew(); }}
                className="text-white font-semibold"
                style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
                data-testid="button-add-account-from-credentials"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Ajouter une connexion
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Edit sub-modal */}
      {editingId !== null && (() => {
        const acct = accounts.find(a => a.id === editingId);
        if (!acct) return null;
        return (
          <ConnectModal
            providerId={providerId}
            providerName={providerName}
            editAccount={acct}
            onClose={() => { setEditingId(null); queryClient.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] }); }}
          />
        );
      })()}

      {/* Confirm delete */}
      {confirmDeleteId !== null && (
        <Dialog open onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <DialogContent className="sm:max-w-xs rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-red-600">Supprimer cette connexion ?</DialogTitle>
              <DialogDescription>Cette action est irréversible.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDelete(confirmDeleteId!)}
                disabled={deleteAcct.isPending}
                data-testid="button-confirm-delete-account"
              >
                {deleteAcct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />} Supprimer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShippingIntegrations() {
  const { toast } = useToast();
  const { data: integrations, isLoading: integrationsLoading } = useIntegrations("shipping");
  const deleteIntegration = useDeleteIntegration();

  // All carrier accounts (for connected status)
  const { data: allAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/carrier-accounts"],
    queryFn: () => fetch("/api/carrier-accounts", { credentials: "include" }).then(r => r.json()),
  });

  const [viewingCredentials, setViewingCredentials] = useState<string | null>(null);
  const [addingAccount, setAddingAccount]           = useState<string | null>(null);

  /* ── Open Retour ────────────────────────────────────────────── */
  const [orDialog, setOrDialog]       = useState(false);
  const [orApiKey, setOrApiKey]       = useState("");
  const [orClientId, setOrClientId]   = useState("");
  const [orShowKey, setOrShowKey]     = useState(false);

  const { data: orSettings, isLoading: orLoading } = useQuery<any>({
    queryKey: ["/api/open-retour/settings"],
    queryFn: () => fetch("/api/open-retour/settings", { credentials: "include" }).then(r => r.json()),
  });

  const saveOrMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/open-retour/settings", { apiKey: orApiKey, clientId: orClientId }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-retour/settings"] });
      if (data.success) { toast({ title: "Open Retour connecté ✅", description: data.message }); setOrDialog(false); }
      else toast({ title: "Erreur", description: data.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const disconnectOrMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/open-retour/settings"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/open-retour/settings"] }); toast({ title: "Open Retour déconnecté" }); },
  });

  // Determine connected state per provider:
  // connected = has active carrier account OR legacy storeIntegrations entry
  const legacyMap = new Map((integrations || []).map((i: any) => [i.provider, i]));
  const accountsByProvider = new Map<string, any[]>();
  for (const a of allAccounts) {
    if (!accountsByProvider.has(a.carrierName)) accountsByProvider.set(a.carrierName, []);
    accountsByProvider.get(a.carrierName)!.push(a);
  }

  const isConnected = (providerId: string) => {
    const accts = accountsByProvider.get(providerId) || [];
    return accts.some(a => a.isActive === 1) || !!legacyMap.get(providerId);
  };

  const getAccountCount = (providerId: string) => (accountsByProvider.get(providerId) || []).length;

  const viewingMeta = SHIPPING_PROVIDERS.find(p => p.id === viewingCredentials);
  const addingMeta  = SHIPPING_PROVIDERS.find(p => p.id === addingAccount);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Home className="w-3 h-3" /><span>Accueil</span>
          <ChevronRight className="w-3 h-3" /><span>Intégrations</span>
          <ChevronRight className="w-3 h-3" /><span className="font-medium text-foreground">Sociétés de Livraison</span>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }} data-testid="text-shipping-title">
              SOCIÉTÉS DE LIVRAISON
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connectez vos transporteurs marocains · Multi-comptes · Dispatch intelligent par ville
            </p>
          </div>
        </div>
      </div>

      {/* ── Open Retour ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Gestion des Retours</h2>
        </div>
        {orLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
        ) : (
          <Card className="relative overflow-hidden rounded-2xl border-2 transition-shadow hover:shadow-md"
            style={{ borderColor: orSettings?.connected ? "rgba(197,160,89,0.4)" : "rgba(0,0,0,0.07)" }}>
            {orSettings?.connected && (
              <div className="absolute top-3.5 right-3.5 z-10">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-sm">
                  <CheckCircle className="w-3 h-3" /> Connecté
                </span>
              </div>
            )}
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d2a7a 100%)` }}>
                  <RotateCcw className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-lg font-bold" style={{ color: NAVY }}>Open Retour</h3>
                    <Badge className="text-[10px] font-bold border-0" style={{ background: `rgba(197,160,89,0.12)`, color: GOLD }}>Maroc</Badge>
                    <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Plateforme marocaine de gestion des retours COD. Créez des tickets, tracez les colis et gérez les remboursements.
                  </p>
                  {orSettings?.connected ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <button onClick={() => { setOrApiKey(""); setOrClientId(orSettings?.clientId || ""); setOrDialog(true); }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 hover:opacity-80 transition-all"
                        style={{ borderColor: GOLD, color: GOLD }}>
                        <Settings className="w-3.5 h-3.5" /> Modifier
                      </button>
                      <button onClick={() => disconnectOrMutation.mutate()} disabled={disconnectOrMutation.isPending}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                        {disconnectOrMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />} Déconnecter
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setOrApiKey(""); setOrClientId(""); setOrDialog(true); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 shadow-md transition-all"
                      style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}>
                      <Link2 className="w-4 h-4" /> Connecter Open Retour
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Carriers Grid ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Transporteurs</h2>
          <span className="ml-auto text-xs text-muted-foreground">{SHIPPING_PROVIDERS.length} transporteurs disponibles</span>
        </div>

        {integrationsLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SHIPPING_PROVIDERS.map((provider) => {
              const connected = isConnected(provider.id);
              const accountCount = getAccountCount(provider.id);

              return (
                <Card
                  key={provider.id}
                  data-testid={`card-shipping-${provider.id}`}
                  className="relative overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-lg"
                  style={{
                    borderColor: connected ? "rgba(16,185,129,0.5)" : "rgba(0,0,0,0.08)",
                    borderWidth: connected ? 2 : 1,
                  }}
                >
                  {/* Connected ribbon (diagonal banner, top-right) */}
                  {connected && (
                    <div className="absolute top-0 right-0 z-10 overflow-hidden w-24 h-24 pointer-events-none">
                      <div className="absolute top-5 -right-6 w-28 flex items-center justify-center gap-1 rotate-45 bg-emerald-500 text-white text-[9px] font-bold py-1 shadow">
                        <CheckCircle className="w-2.5 h-2.5 shrink-0" /> Connected
                      </div>
                    </div>
                  )}

                  <CardContent className="p-5 flex flex-col gap-4">
                    {/* Top: logo + name + cities */}
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl border border-border/40 bg-gray-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                        <ProviderLogo logo={provider.logo} name={provider.name} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[15px] leading-tight text-foreground">{provider.name}</h3>
                        <a href={`#${provider.id}`} onClick={e => e.preventDefault()}
                          className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                          <Link2 className="w-3 h-3" /> {provider.name} Link
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{provider.cities} villes</span>
                          </div>
                          {accountCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                              {accountCount} connexion{accountCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2">
                      {connected ? (
                        <div className="flex gap-2">
                          {/* Eye: view credentials */}
                          <button
                            data-testid={`button-view-credentials-${provider.id}`}
                            onClick={() => setViewingCredentials(provider.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-muted/40"
                            style={{ borderColor: "rgba(0,0,0,0.15)", color: "inherit" }}
                            title="Voir les credentials"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Plus: add new account */}
                          <button
                            data-testid={`button-add-account-${provider.id}`}
                            onClick={() => setAddingAccount(provider.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-emerald-50"
                            style={{ borderColor: "rgba(16,185,129,0.5)", color: "#10b981" }}
                            title="Ajouter une connexion"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          data-testid={`button-connect-shipping-${provider.id}`}
                          onClick={() => setAddingAccount(provider.id)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm"
                        >
                          <Link2 className="w-4 h-4" /> Connecter
                        </button>
                      )}

                      <a
                        href={provider.tutorialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-tutorial-${provider.id}`}
                        className="flex items-center justify-center gap-1.5 text-[12px] font-medium hover:opacity-80 transition-opacity py-1"
                        style={{ color: GOLD }}
                      >
                        <Video className="w-3.5 h-3.5" /> Comment connecter ?
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}

      {/* Add / first connection */}
      {addingAccount && addingMeta && (
        <ConnectModal
          providerId={addingAccount}
          providerName={addingMeta.name}
          onClose={() => setAddingAccount(null)}
        />
      )}

      {/* Credentials view */}
      {viewingCredentials && viewingMeta && (
        <CredentialsModal
          providerId={viewingCredentials}
          providerName={viewingMeta.name}
          onClose={() => setViewingCredentials(null)}
          onAddNew={() => setAddingAccount(viewingCredentials)}
        />
      )}

      {/* ── Open Retour Dialog ─────────────────────────────── */}
      <Dialog open={orDialog} onOpenChange={setOrDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
              {orSettings?.connected ? "Modifier" : "Connecter"} Open Retour
            </DialogTitle>
            <DialogDescription>
              Obtenez vos identifiants sur{" "}
              <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GOLD }}>openretour.ma</a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-semibold">Client ID</Label>
              <Input placeholder="Votre Client ID..." value={orClientId} onChange={e => setOrClientId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">API Key (Secret)</Label>
              <div className="relative">
                <Input type={orShowKey ? "text" : "password"} placeholder="Votre clé API secrète..." value={orApiKey} onChange={e => setOrApiKey(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setOrShowKey(!orShowKey)}>
                  {orShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOrDialog(false)}>Annuler</Button>
            <Button onClick={() => saveOrMutation.mutate()} disabled={saveOrMutation.isPending || !orApiKey.trim() || !orClientId.trim()}
              className="text-white font-bold" style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}>
              {saveOrMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {saveOrMutation.isPending ? "Connexion..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

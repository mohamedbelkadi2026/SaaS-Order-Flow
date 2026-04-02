import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Link2, CheckCircle, Loader2, Eye, EyeOff,
  MapPin, Video, Home, ChevronRight,
  Plus, Copy, Check, Trash2, Pencil, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/* ─── Constants ─────────────────────────────────────────────── */
const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

const PROVIDERS = [
  { id: "digylog",        name: "Digylog",          cities: 581, logo: "/carriers/digylog.svg"  },
  { id: "onessta",        name: "Onessta",           cities: 378, logo: "/carriers/onessta.svg"  },
  { id: "ozoneexpress",   name: "Ozone Express",     cities: 628, logo: "/carriers/ozon.svg"     },
  { id: "sendit",         name: "Sendit",            cities: 500, logo: "/carriers/sendit.svg"   },
  { id: "ameex",          name: "Ameex",             cities: 420, logo: "/carriers/ameex.svg"    },
  { id: "cathedis",       name: "Cathedis",          cities: 520, logo: "/carriers/cathidis.svg" },
  { id: "speedex",        name: "Speedex",           cities: 439, logo: "/carriers/speedx.png"   },
  { id: "kargoexpress",   name: "KargoExpress",      cities: 335, logo: "/carriers/cargo.svg"    },
  { id: "forcelog",       name: "ForceLog",          cities: 468, logo: "/carriers/forcelog.png" },
  { id: "livo",           name: "Livo",              cities: 369, logo: "/carriers/ol.svg"       },
  { id: "quicklivraison", name: "Quick Livraison",   cities: 404, logo: "/carriers/ql.svg"       },
  { id: "codinafrica",    name: "Codinafrica",       cities: 312, logo: "/carriers/cargo.svg"    },
  { id: "olivraison",     name: "Olivraison",        cities: 280, logo: null                     },
  { id: "livreego",       name: "Livreego",          cities: 295, logo: null                     },
  { id: "powerdelivery",  name: "PowerDelivery",     cities: 350, logo: null                     },
  { id: "caledex",        name: "Caledex",           cities: 270, logo: null                     },
  { id: "oscario",        name: "Oscario",           cities: 390, logo: null                     },
  { id: "colisspeed",     name: "Colisspeed",        cities: 445, logo: null                     },
];

/* ─── Webhook domain ─────────────────────────────────────────── */
function getWebhookDomain(): string {
  if (typeof window === "undefined") return "https://www.tajergrow.com";
  const { origin } = window.location;
  // Replit dev domains → substitute the real production domain
  if (origin.includes("replit") || origin.includes("repl.co") || origin.includes("garean")) {
    return "https://www.tajergrow.com";
  }
  return origin;
}

/* ─── Logo ───────────────────────────────────────────────────── */
function ProviderLogo({ logo, name }: { logo: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (logo && !err) {
    return (
      <img
        src={logo} alt={name}
        onError={() => setErr(true)}
        className="w-full h-full object-contain p-1.5"
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-300">
        {name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

/* ─── API hooks ──────────────────────────────────────────────── */
function useCarrierAccounts(provider?: string) {
  const url = provider
    ? `/api/carrier-accounts?provider=${provider}`
    : "/api/carrier-accounts";
  return useQuery<any[]>({
    queryKey: provider
      ? ["/api/carrier-accounts", provider]
      : ["/api/carrier-accounts"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function useStores() {
  return useQuery<any[]>({
    queryKey: ["/api/magasins"],
    queryFn: async () => {
      const res = await fetch("/api/magasins", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

/* ─── ConnectModal ───────────────────────────────────────────── */
interface ConnectModalProps {
  providerId: string;
  providerName: string;
  existingAccount?: any;
  onClose: () => void;
}
function ConnectModal({ providerId, providerName, existingAccount, onClose }: ConnectModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stores = [] } = useStores();

  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    existingAccount?.storeName
      ? stores.find((s: any) => s.name === existingAccount.storeName)?.id?.toString() || "__manual__"
      : ""
  );
  const [apiKey,        setApiKey]        = useState("");
  const [showKey,       setShowKey]       = useState(false);
  const [rule,          setRule]          = useState<"default" | "city" | "product">(
    existingAccount?.assignmentRule || "default"
  );
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);

  const domain = getWebhookDomain();
  const webhookUrl = existingAccount?.webhookToken
    ? `${domain}/api/webhook/carrier/${existingAccount.webhookToken}`
    : `${domain}/api/webhooks/shipping/${providerId}`;

  /* Resolve display name for the selected store */
  const selectedStore = stores.find((s: any) => s.id?.toString() === selectedStoreId);
  const resolvedStoreName = selectedStore?.name || existingAccount?.storeName || "";

  const mutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      if (existingAccount) {
        const body: any = { storeName: resolvedStoreName, assignmentRule: rule };
        if (apiKey.trim()) body.apiKey = apiKey;
        const res = await apiRequest("PATCH", `/api/carrier-accounts/${existingAccount.id}`, body);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
        return data;
      } else {
        const res = await apiRequest("POST", "/api/carrier-accounts", {
          carrierName: providerId,
          apiKey,
          storeName: resolvedStoreName,
          assignmentRule: rule,
          isDefault: rule === "default" ? 1 : 0,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
      qc.invalidateQueries({ queryKey: ["/api/shipping/active-accounts"] });
      toast({
        title: existingAccount ? "Mis à jour ✅" : "Connecté ✅",
        description: `${providerName} ${existingAccount ? "mis à jour" : "ajouté"} avec succès`,
      });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.message || "Une erreur est survenue";
      setSubmitError(msg);
      toast({ title: "Erreur de connexion", description: msg, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    setSubmitError(null);
    if (!existingAccount && !apiKey.trim()) {
      setSubmitError("Le token d'autorisation est requis.");
      return;
    }
    if (!existingAccount && !selectedStoreId) {
      setSubmitError("Veuillez sélectionner une boutique.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            {existingAccount
              ? `Modifier — ${existingAccount.connectionName}`
              : `Connexion avec ${providerName}`}
          </DialogTitle>
          {!existingAccount && (
            <DialogDescription className="text-sm text-muted-foreground">
              Liez un compte <strong>{providerName}</strong> à l'une de vos boutiques.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Boutique dropdown ── */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">
              Boutique <span className="text-red-500">*</span>
            </Label>
            {stores.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des boutiques...
              </div>
            ) : (
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger data-testid="select-boutique" className="w-full">
                  <SelectValue placeholder="Sélectionnez votre boutique..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Authorization token ── */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">
              Authorization Token{" "}
              {existingAccount && (
                <span className="text-muted-foreground font-normal text-xs">
                  (laisser vide pour conserver)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                data-testid="input-carrier-apikey"
                type={showKey ? "text" : "password"}
                placeholder="Entrez votre token d'autorisation..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className={!existingAccount && !apiKey.trim() && submitError ? "border-red-400" : ""}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── WebHook URL ── */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">WebHook URL</Label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border bg-muted/30">
              <code className="flex-1 text-[11px] font-mono truncate text-foreground">
                {webhookUrl}
              </code>
              <button
                type="button"
                data-testid="button-copy-webhook"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setWebhookCopied(true);
                  setTimeout(() => setWebhookCopied(false), 2000);
                }}
                className="p-1.5 rounded-lg hover:bg-border/60 transition-colors shrink-0"
              >
                {webhookCopied
                  ? <Check className="w-3.5 h-3.5 text-green-500" />
                  : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Collez cette URL dans les paramètres webhook du transporteur.
            </p>
          </div>

          {/* ── Assignment rule ── */}
          <div className="space-y-2 pt-1">
            <p className="text-sm font-semibold">Pourquoi connectez-vous cette société ?</p>
            {(["default", "city", "product"] as const).map(r => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setRule(r)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
                    rule === r ? "border-blue-500 bg-blue-500" : "border-gray-300"
                  }`}
                >
                  {rule === r && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-sm">
                  {r === "default" ? "Connexion par Défaut" : r === "city" ? "Connexion par Ville" : "Connexion par Produit"}
                </span>
              </label>
            ))}
          </div>

          {/* ── Error banner ── */}
          {submitError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{submitError}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-connect" disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="text-white font-bold px-8 min-w-[130px]"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
            data-testid="button-confirm-connect"
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connexion...</>
            ) : (
              <><Link2 className="w-4 h-4 mr-2" />{existingAccount ? "Enregistrer" : "Connecter"}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CredentialsModal ───────────────────────────────────────── */
interface CredentialsModalProps {
  providerId: string;
  providerName: string;
  onClose: () => void;
  onAddNew: () => void;
}
function CredentialsModal({ providerId, providerName, onClose, onAddNew }: CredentialsModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useCarrierAccounts(providerId);

  const [activeTab,       setActiveTab]       = useState(0);
  const [editAccount,     setEditAccount]     = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [copiedKey,       setCopiedKey]       = useState<string | null>(null);

  const domain = getWebhookDomain();

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({ title: "Copié ✅" });
  };

  const toggleMutation = useMutation({
    mutationFn: (acct: any) =>
      apiRequest("PATCH", `/api/carrier-accounts/${acct.id}`, {
        isActive: acct.isActive === 1 ? 0 : 1,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/shipping/active-accounts"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/carrier-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
      qc.invalidateQueries({ queryKey: ["/api/shipping/active-accounts"] });
      setConfirmDeleteId(null);
      setActiveTab(0);
      toast({ title: "Supprimé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const safeTab = Math.min(activeTab, Math.max(0, accounts.length - 1));
  const acct = accounts[safeTab] || null;

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Credentials — {providerName}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-muted-foreground text-sm">Aucune connexion configurée.</p>
              <Button
                onClick={() => { onClose(); onAddNew(); }}
                className="text-white font-bold"
                style={{ background: `linear-gradient(135deg,${GOLD},#b8904a)` }}
              >
                <Plus className="w-4 h-4 mr-2" /> Ajouter une connexion
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {/* Tab bar */}
              <div className="flex gap-1 p-1 bg-muted/40 rounded-xl overflow-x-auto">
                {accounts.map((a: any, i: number) => (
                  <button
                    key={a.id}
                    onClick={() => setActiveTab(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                      safeTab === i
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`tab-connection-${i}`}
                  >
                    {a.connectionName || `Connection ${i + 1}`}
                  </button>
                ))}
              </div>

              {acct && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-base">{acct.connectionName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(acct.createdAt).toLocaleDateString("fr-FR", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    </div>
                    {acct.isDefault === 1 && (
                      <Badge className="text-[10px] font-bold bg-blue-100 text-blue-700 border-blue-200">
                        Défaut
                      </Badge>
                    )}
                  </div>

                  {/* Info rows */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 border-b border-border/40">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Connection Information
                      </p>
                    </div>
                    <div className="divide-y divide-border/30">
                      {[
                        ["Boutique",  acct.storeName || "—"],
                        ["Statut",    acct.isActive === 1 ? "Active" : "Inactive"],
                        ["Règle",     acct.assignmentRule === "city" ? "Par Ville" : acct.assignmentRule === "product" ? "Par Produit" : "Défaut"],
                        ["Créé le",   new Date(acct.createdAt).toLocaleDateString("fr-FR")],
                      ].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-muted-foreground">{label} :</span>
                          <span className={`text-sm font-medium ${
                            val === "Active" ? "text-emerald-600"
                            : val === "Inactive" ? "text-red-500"
                            : ""
                          }`}>
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => setEditAccount(acct)} data-testid={`button-edit-account-${acct.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(acct.id)} data-testid={`button-delete-account-${acct.id}`}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Supprimer
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={acct.isActive === 1}
                        onCheckedChange={() => toggleMutation.mutate(acct)}
                        disabled={toggleMutation.isPending}
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
                          <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Credential</th>
                          <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Valeur</th>
                          <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Copier</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/20">
                          <td className="px-4 py-3 font-medium">Authorization</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                            {acct.apiKeyMasked || `${(acct.apiKey || "").slice(0, 8)}••••••••`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              data-testid={`button-copy-key-${acct.id}`}
                              onClick={() => copyText(acct.apiKeyMasked || "", `key-${acct.id}`)}
                              className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                            >
                              {copiedKey === `key-${acct.id}`
                                ? <Check className="w-3.5 h-3.5 text-green-500" />
                                : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 font-medium">WebHook URL</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                            {`${domain}/api/webhook/carrier/${acct.webhookToken}`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => copyText(`${domain}/api/webhook/carrier/${acct.webhookToken}`, `wh-${acct.id}`)}
                              className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                            >
                              {copiedKey === `wh-${acct.id}`
                                ? <Check className="w-3.5 h-3.5 text-green-500" />
                                : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Add new */}
              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={() => { onClose(); onAddNew(); }}
                  className="text-white font-semibold"
                  style={{ background: `linear-gradient(135deg,${GOLD},#b8904a)` }}
                  data-testid="button-add-account-from-credentials">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Ajouter une connexion
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit sub-modal */}
      {editAccount && (
        <ConnectModal
          providerId={providerId}
          providerName={providerName}
          existingAccount={editAccount}
          onClose={() => {
            setEditAccount(null);
            qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteId !== null && (
        <Dialog open onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
          <DialogContent className="sm:max-w-xs rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-red-600">Supprimer cette connexion ?</DialogTitle>
              <DialogDescription>Cette action est irréversible.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => deleteMutation.mutate(confirmDeleteId!)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-account"
              >
                {deleteMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4 mr-1" />}
                Supprimer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function ShippingIntegrations() {
  const { data: allAccounts = [] } = useCarrierAccounts();

  const [viewingProvider, setViewingProvider] = useState<string | null>(null);
  const [addingProvider,  setAddingProvider]  = useState<string | null>(null);

  /* Build provider → accounts map */
  const accountsByProvider = new Map<string, any[]>();
  for (const a of allAccounts) {
    if (!accountsByProvider.has(a.carrierName)) accountsByProvider.set(a.carrierName, []);
    accountsByProvider.get(a.carrierName)!.push(a);
  }

  const isConnected  = (id: string) => (accountsByProvider.get(id) || []).some((a: any) => a.isActive === 1);
  const accountCount = (id: string) => (accountsByProvider.get(id) || []).length;

  const viewingMeta = PROVIDERS.find(p => p.id === viewingProvider) || null;
  const addingMeta  = PROVIDERS.find(p => p.id === addingProvider)  || null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Breadcrumb + title */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Home className="w-3 h-3" />
          <span>Accueil</span>
          <ChevronRight className="w-3 h-3" />
          <span>Intégrations</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-foreground">Sociétés de Livraison</span>
        </div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: NAVY }}
          data-testid="text-shipping-title"
        >
          SOCIÉTÉS DE LIVRAISON
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connectez vos transporteurs marocains · Multi-comptes · Dispatch intelligent par ville
        </p>
      </div>

      {/* Carriers grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Transporteurs disponibles
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {PROVIDERS.length} transporteurs
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROVIDERS.map(provider => {
            const connected = isConnected(provider.id);
            const count     = accountCount(provider.id);

            return (
              <Card
                key={provider.id}
                data-testid={`card-shipping-${provider.id}`}
                className="relative overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-lg"
                style={{
                  borderColor: connected ? "rgba(16,185,129,0.5)" : "rgba(0,0,0,0.08)",
                  borderWidth:  connected ? 2 : 1,
                }}
              >
                {/* Connected ribbon */}
                {connected && (
                  <div className="absolute top-0 right-0 z-10 overflow-hidden w-24 h-24 pointer-events-none">
                    <div
                      className="absolute top-5 -right-6 w-28 flex items-center justify-center gap-1 rotate-45 text-white text-[9px] font-bold py-1 shadow"
                      style={{ background: "#10b981" }}
                    >
                      <CheckCircle className="w-2.5 h-2.5 shrink-0" /> Connected
                    </div>
                  </div>
                )}

                <CardContent className="p-5 flex flex-col gap-4">
                  {/* Logo + info */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl border border-border/40 bg-gray-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                      <ProviderLogo logo={provider.logo} name={provider.name} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[15px] leading-tight text-foreground">
                        {provider.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{provider.cities} villes</span>
                        </div>
                        {count > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                            {count} connexion{count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col gap-2">
                    {connected ? (
                      <div className="flex gap-2">
                        <button
                          data-testid={`button-view-credentials-${provider.id}`}
                          onClick={() => setViewingProvider(provider.id)}
                          title="Voir les credentials"
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-muted/40"
                          style={{ borderColor: "rgba(0,0,0,0.12)" }}
                        >
                          <Eye className="w-4 h-4" />
                          <span className="text-xs">Voir</span>
                        </button>
                        <button
                          data-testid={`button-add-account-${provider.id}`}
                          onClick={() => setAddingProvider(provider.id)}
                          title="Ajouter une connexion"
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-emerald-50"
                          style={{ borderColor: "rgba(16,185,129,0.5)", color: "#10b981" }}
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-xs">Ajouter</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        data-testid={`button-connect-shipping-${provider.id}`}
                        onClick={() => setAddingProvider(provider.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm"
                      >
                        <Link2 className="w-4 h-4" /> Connecter
                      </button>
                    )}

                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(provider.name + " livraison Maroc intégration")}`}
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
      </div>

      {/* Modals */}
      {addingProvider && addingMeta && (
        <ConnectModal
          providerId={addingProvider}
          providerName={addingMeta.name}
          onClose={() => setAddingProvider(null)}
        />
      )}

      {viewingProvider && viewingMeta && (
        <CredentialsModal
          providerId={viewingProvider}
          providerName={viewingMeta.name}
          onClose={() => setViewingProvider(null)}
          onAddNew={() => {
            setViewingProvider(null);
            setAddingProvider(viewingProvider);
          }}
        />
      )}
    </div>
  );
}

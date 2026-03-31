import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Link2, Settings, CheckCircle, Unlink, Loader2, RotateCcw,
  ExternalLink, Eye, EyeOff, MapPin, Video, Home, ChevronRight,
  Plus, Copy, Check, Trash2, Pencil,
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

/* ─── Copy helper ────────────────────────────────────────────── */
function useCopyText() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };
  return { copiedKey, copy };
}

/* ─── Carrier accounts API hooks ─────────────────────────────── */
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

/* ─── ConnectModal (add / edit a carrier account) ────────────── */
interface ConnectModalProps {
  providerId: string;
  providerName: string;
  existingAccount?: any;
  onClose: () => void;
}
function ConnectModal({ providerId, providerName, existingAccount, onClose }: ConnectModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [storeName,       setStoreName]       = useState<string>(existingAccount?.storeName || "");
  const [apiKey,          setApiKey]          = useState<string>("");
  const [showKey,         setShowKey]         = useState(false);
  const [rule,            setRule]            = useState<"default"|"city"|"product">(
    existingAccount?.assignmentRule || "default"
  );
  const [webhookCopied,   setWebhookCopied]   = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = existingAccount?.webhookToken
    ? `${origin}/api/webhook/carrier/${existingAccount.webhookToken}`
    : `${origin}/api/webhooks/shipping/${providerId}`;

  const mutation = useMutation({
    mutationFn: async () => {
      if (existingAccount) {
        const body: any = { storeName, assignmentRule: rule };
        if (apiKey.trim()) body.apiKey = apiKey;
        const res = await apiRequest("PATCH", `/api/carrier-accounts/${existingAccount.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/carrier-accounts", {
          carrierName: providerId, apiKey, storeName, assignmentRule: rule,
          isDefault: rule === "default" ? 1 : 0,
        });
        return res.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
      toast({ title: existingAccount ? "Mis à jour ✅" : "Connecté ✅", description: `${providerName} ${existingAccount ? "mis à jour" : "ajouté"} avec succès` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e.message || "Une erreur est survenue", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!existingAccount && !apiKey.trim()) {
      toast({ title: "Champ requis", description: "Entrez votre token d'autorisation", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            {existingAccount ? `Modifier — ${existingAccount.connectionName}` : `Connexion avec ${providerName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Store name */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">
              Boutique <span className="text-red-500">*</span>
            </Label>
            <Input
              data-testid="input-carrier-storename"
              placeholder="Nom de votre boutique"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>

          {/* Authorization token */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">
              Authorization{" "}
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
                placeholder="Authorization token..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
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

          {/* WebHook URL */}
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">WebHook</Label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border bg-muted/30">
              <code className="flex-1 text-[11px] font-mono truncate">{webhookUrl}</code>
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

          {/* Assignment rule */}
          <div className="space-y-2 pt-1">
            <p className="text-sm font-semibold">Pourquoi connectez-vous cette société ?</p>
            {(["default", "city", "product"] as const).map(r => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer">
                <div
                  onClick={() => setRule(r)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                    rule === r ? "border-blue-500 bg-blue-500" : "border-gray-300"
                  }`}
                >
                  {rule === r && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-sm">
                  {r === "default" ? "Connecter par Défaut" : r === "city" ? "Connecter par Ville" : "Connecter par Produit"}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-connect">
            Fermer
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="text-white font-bold px-8"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
            data-testid="button-confirm-connect"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mutation.isPending ? "..." : existingAccount ? "Enregistrer" : "Connecter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CredentialsModal (view / manage accounts for a carrier) ─ */
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
  const { copiedKey, copy } = useCopyText();

  const [activeTab,       setActiveTab]       = useState(0);
  const [editAccount,     setEditAccount]     = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const toggleMutation = useMutation({
    mutationFn: (acct: any) =>
      apiRequest("PATCH", `/api/carrier-accounts/${acct.id}`, {
        isActive: acct.isActive === 1 ? 0 : 1,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] }),
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/carrier-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
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
            <DialogTitle style={{ color: NAVY }}>
              Credentials — {providerName}
            </DialogTitle>
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
                {accounts.map((a, i) => (
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

              {/* Account detail */}
              {acct && (
                <div className="space-y-4">
                  {/* Header row */}
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

                  {/* Info table */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 border-b border-border/40">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Connection Information
                      </p>
                    </div>
                    <div className="divide-y divide-border/30">
                      {[
                        ["Store",     acct.storeName || "—"],
                        ["Status",    acct.isActive === 1 ? "Active" : "Inactive"],
                        ["Règle",     acct.assignmentRule === "city" ? "Par Ville" : acct.assignmentRule === "product" ? "Par Produit" : "Défaut"],
                        ["Créé le",   new Date(acct.createdAt).toLocaleDateString("fr-FR")],
                      ].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-muted-foreground">{label} :</span>
                          <span className={`text-sm font-medium ${
                            val === "Active" ? "text-emerald-600" : val === "Inactive" ? "text-red-500" : ""
                          }`}>
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => setEditAccount(acct)} data-testid={`button-edit-account-${acct.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(acct.id)} data-testid={`button-delete-account-${acct.id}`}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
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

                  {/* Credentials table */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/40">
                          <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Credential</th>
                          <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Value</th>
                          <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Copy</th>
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
                              onClick={() => { copy(acct.apiKeyMasked || "", `key-${acct.id}`); toast({ title: "Copié ✅" }); }}
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
                            {`${origin}/api/webhook/carrier/${acct.webhookToken}`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => { copy(`${origin}/api/webhook/carrier/${acct.webhookToken}`, `wh-${acct.id}`); toast({ title: "Copié ✅" }); }}
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
          onClose={() => { setEditAccount(null); qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] }); }}
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
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Supprimer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ─── Open Retour section ────────────────────────────────────── */
function OpenRetourSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialog,    setDialog]    = useState(false);
  const [apiKey,    setApiKey]    = useState("");
  const [clientId,  setClientId]  = useState("");
  const [showKey,   setShowKey]   = useState(false);

  const { data: orSettings, isLoading } = useQuery<any>({
    queryKey: ["/api/open-retour/settings"],
    queryFn: async () => {
      const res = await fetch("/api/open-retour/settings", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/open-retour/settings", { apiKey, clientId });
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/open-retour/settings"] });
      if (data?.success) {
        toast({ title: "Open Retour connecté ✅" });
        setDialog(false);
      } else {
        toast({ title: "Erreur", description: data?.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/open-retour/settings"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/open-retour/settings"] });
      toast({ title: "Open Retour déconnecté" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const connected = orSettings?.connected;

  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Gestion des Retours
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
          </div>
        ) : (
          <Card
            className="relative overflow-hidden rounded-2xl border-2 transition-shadow hover:shadow-md"
            style={{ borderColor: connected ? "rgba(197,160,89,0.4)" : "rgba(0,0,0,0.07)" }}
          >
            {connected && (
              <div className="absolute top-3.5 right-3.5 z-10">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-sm">
                  <CheckCircle className="w-3 h-3" /> Connecté
                </span>
              </div>
            )}
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: `linear-gradient(135deg,${NAVY},#2d2a7a)` }}
                >
                  <RotateCcw className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-lg font-bold" style={{ color: NAVY }}>Open Retour</h3>
                    <Badge className="text-[10px] font-bold border-0" style={{ background: `rgba(197,160,89,0.12)`, color: GOLD }}>
                      Maroc
                    </Badge>
                    <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Plateforme marocaine de gestion des retours COD. Créez des tickets, tracez les colis et gérez les remboursements.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {connected ? (
                      <>
                        <button
                          onClick={() => { setApiKey(""); setClientId(orSettings?.clientId || ""); setDialog(true); }}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 hover:opacity-80 transition-all"
                          style={{ borderColor: GOLD, color: GOLD }}
                        >
                          <Settings className="w-3.5 h-3.5" /> Modifier
                        </button>
                        <button
                          onClick={() => disconnectMutation.mutate()}
                          disabled={disconnectMutation.isPending}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          {disconnectMutation.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Unlink className="w-3.5 h-3.5" />}
                          Déconnecter
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setApiKey(""); setClientId(""); setDialog(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 shadow-md transition-all"
                        style={{ background: `linear-gradient(135deg,${GOLD},#b8904a)` }}
                      >
                        <Link2 className="w-4 h-4" /> Connecter Open Retour
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Open Retour dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: GOLD }} />
              {connected ? "Modifier" : "Connecter"} Open Retour
            </DialogTitle>
            <DialogDescription>
              Obtenez vos identifiants sur{" "}
              <a href="https://openretour.ma" target="_blank" rel="noopener noreferrer"
                className="underline" style={{ color: GOLD }}>
                openretour.ma
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-semibold">Client ID</Label>
              <Input placeholder="Votre Client ID..." value={clientId} onChange={e => setClientId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">API Key (Secret)</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="Votre clé API secrète..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
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
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialog(false)}>Annuler</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !apiKey.trim() || !clientId.trim()}
              className="text-white font-bold"
              style={{ background: `linear-gradient(135deg,${GOLD},#b8904a)` }}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {saveMutation.isPending ? "Connexion..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

  const isConnected    = (id: string) => (accountsByProvider.get(id) || []).some(a => a.isActive === 1);
  const accountCount   = (id: string) => (accountsByProvider.get(id) || []).length;

  const viewingMeta = PROVIDERS.find(p => p.id === viewingProvider) || null;
  const addingMeta  = PROVIDERS.find(p => p.id === addingProvider)  || null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Breadcrumb */}
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

      {/* Open Retour */}
      <OpenRetourSection />

      {/* Carriers grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Transporteurs
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {PROVIDERS.length} transporteurs disponibles
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
                  borderWidth: connected ? 2 : 1,
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
                        </button>
                        <button
                          data-testid={`button-add-account-${provider.id}`}
                          onClick={() => setAddingProvider(provider.id)}
                          title="Ajouter une connexion"
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-emerald-50"
                          style={{ borderColor: "rgba(16,185,129,0.5)", color: "#10b981" }}
                        >
                          <Plus className="w-4 h-4" />
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
                      href={`https://youtu.be/${provider.id}`}
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

      {/* Modals — rendered at page root to avoid nesting issues */}
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
          onAddNew={() => { setViewingProvider(null); setAddingProvider(viewingProvider); }}
        />
      )}
    </div>
  );
}

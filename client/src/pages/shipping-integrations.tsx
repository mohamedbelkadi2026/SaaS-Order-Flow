import { useState, useEffect } from "react";
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
  Plus, Copy, Check, Trash2, Pencil, AlertCircle, RefreshCw, ShieldCheck,
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
  const [apiKey,           setApiKey]           = useState("");
  const [isEditingToken,   setIsEditingToken]   = useState(false);
  const [showKey,          setShowKey]           = useState(false);
  const [apiUrl,           setApiUrl]            = useState<string>(existingAccount?.apiUrl || "");
  const [showAdvanced,     setShowAdvanced]      = useState(false);
  const [rule,             setRule]              = useState<"default" | "city" | "product">(
    existingAccount?.assignmentRule || "default"
  );
  const [webhookCopied,    setWebhookCopied]     = useState(false);
  const [submitError,      setSubmitError]       = useState<string | null>(null);

  // ── Ameex-specific fields ─────────────────────────────────────────────────
  const isAmeex  = providerId === "ameex";
  const [ameexStoreName, setAmeexStoreName] = useState<string>(existingAccount?.carrierStoreName || "");
  const [ameexApiId,     setAmeexApiId]     = useState<string>("");
  const [showAmeexKey,   setShowAmeexKey]   = useState(false);

  // ── Digylog store + network pickers ──────────────────────────────────────
  const isDigylog = providerId === "digylog";
  const [digylogStores,     setDigylogStores]    = useState<Array<{ id: number | string; name: string }>>([]);
  const [carrierStoreName,  setCarrierStoreName] = useState<string>(existingAccount?.carrierStoreName || "");
  const [isFetchingStores,  setIsFetchingStores] = useState(false);
  const [digylogNetworks,   setDigylogNetworks]  = useState<Array<{ id: number | string; name: string }>>([]);
  const [networkId,         setNetworkId]        = useState<string>(
    String(existingAccount?.settings?.digylogNetworkId ?? existingAccount?.settings?.networkId ?? "")
  );
  const [isFetchingNetworks,setIsFetchingNetworks] = useState(false);

  const fetchDigylogStores = async (silent = false) => {
    const hasToken = apiKey.trim() || existingAccount?.hasApiKey;
    if (!hasToken) {
      if (!silent) toast({ title: "Token requis", description: "Entrez votre token Digylog avant de charger les magasins.", variant: "destructive" });
      return;
    }
    setIsFetchingStores(true);
    try {
      const params = new URLSearchParams();
      if (apiKey.trim()) {
        // User typed a new token — send it directly
        params.set("token", apiKey.trim());
      } else if (existingAccount?.id) {
        // Editing an existing account — let backend look up the key securely by ID
        params.set("accountId", String(existingAccount.id));
      }
      if (apiUrl.trim()) params.set("apiUrl", apiUrl.trim());
      const res = await fetch(`/api/carrier-accounts/digylog/stores?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      const list: Array<{ id: number | string; name: string }> = data.stores || [];
      setDigylogStores(list);

      // Bug 4 — Auto-select the store that matches the saved carrierStoreName
      if (list.length === 1) {
        setCarrierStoreName(list[0].name);
      } else if (existingAccount?.carrierStoreName) {
        const match = list.find(s => s.name === existingAccount.carrierStoreName);
        if (match) setCarrierStoreName(match.name);
      }

      if (!silent) {
        if (list.length === 0) {
          toast({ title: "Aucun magasin trouvé", description: "Aucun magasin trouvé pour ce token Digylog.", variant: "destructive" });
        } else {
          toast({ title: `${list.length} magasin(s) chargé(s) ✅`, description: "Sélectionnez votre magasin Digylog ci-dessous." });
        }
      }
    } catch (e: any) {
      if (!silent) toast({ title: "Erreur Digylog", description: e?.message || "Impossible de charger les magasins.", variant: "destructive" });
    } finally {
      setIsFetchingStores(false);
    }
  };

  const fetchDigylogNetworks = async (silent = false) => {
    const hasToken = apiKey.trim() || existingAccount?.hasApiKey;
    if (!hasToken) {
      if (!silent) toast({ title: "Token requis", description: "Entrez votre token Digylog avant de charger les réseaux.", variant: "destructive" });
      return;
    }
    setIsFetchingNetworks(true);
    try {
      const params = new URLSearchParams();
      if (apiKey.trim()) {
        params.set("token", apiKey.trim());
      } else if (existingAccount?.id) {
        params.set("accountId", String(existingAccount.id));
      }
      if (apiUrl.trim()) params.set("apiUrl", apiUrl.trim());
      const res = await fetch(`/api/carrier-accounts/digylog/networks?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      const list: Array<{ id: number | string; name: string }> = data.networks || [];
      setDigylogNetworks(list);

      // Auto-select the network that matches the saved networkId (check both key names)
      if (list.length === 1) {
        setNetworkId(String(list[0].id));
      } else {
        const saved = String(
          existingAccount?.settings?.digylogNetworkId ?? existingAccount?.settings?.networkId ?? ""
        );
        if (saved) {
          const match = list.find(n => String(n.id) === saved);
          if (match) setNetworkId(String(match.id));
        }
      }

      if (!silent) {
        if (list.length === 0) {
          toast({ title: "Aucun réseau trouvé", description: "Aucun réseau trouvé pour ce token Digylog.", variant: "destructive" });
        } else {
          toast({ title: `${list.length} réseau(x) chargé(s) ✅`, description: "Sélectionnez votre point de collecte Digylog." });
        }
      }
    } catch (e: any) {
      if (!silent) toast({ title: "Erreur Digylog", description: e?.message || "Impossible de charger les réseaux.", variant: "destructive" });
    } finally {
      setIsFetchingNetworks(false);
    }
  };

  // Auto-fetch stores + networks on open when editing an existing Digylog account
  useEffect(() => {
    if (isDigylog && existingAccount) {
      fetchDigylogStores(true);
      fetchDigylogNetworks(true);
    }
  }, []);

  const domain = getWebhookDomain();
  // Permanent webhook URL — based on storeId + carrierName, never changes
  // even if the token or API key is updated.
  const resolvedStoreId = existingAccount?.storeId || selectedStoreId;
  const webhookUrl = resolvedStoreId
    ? `${domain}/api/webhooks/carrier/${resolvedStoreId}/${providerId}`
    : `${domain}/api/webhooks/carrier/{STORE_ID}/${providerId}`;

  /* Resolve display name for the selected store */
  const selectedStore = stores.find((s: any) => s.id?.toString() === selectedStoreId);
  const resolvedStoreName = selectedStore?.name || existingAccount?.storeName || "";

  const mutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      if (existingAccount) {
        const body: any = { storeName: resolvedStoreName, assignmentRule: rule };
        if (isAmeex) {
          if (apiKey.trim())        body.apiKey          = apiKey;
          if (ameexApiId.trim())    body.apiSecret       = ameexApiId;
          body.carrierStoreName = ameexStoreName.trim() || null;
        } else {
          if (apiKey.trim()) body.apiKey = apiKey;
          if (apiUrl.trim()) body.apiUrl = apiUrl.trim();
          body.carrierStoreName = carrierStoreName || null;
          if (isDigylog && networkId) body.networkId = Number(networkId);
        }
        const res = await apiRequest("PATCH", `/api/carrier-accounts/${existingAccount.id}`, body);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
        return data;
      } else {
        const payload: any = {
          carrierName: providerId,
          apiKey,
          assignmentRule: rule,
          isDefault: rule === "default" ? 1 : 0,
        };
        if (isAmeex) {
          payload.apiSecret       = ameexApiId.trim() || undefined;
          payload.carrierStoreName = ameexStoreName.trim() || undefined;
          payload.storeName       = resolvedStoreName;
        } else {
          payload.apiUrl           = apiUrl.trim() || undefined;
          payload.storeName        = resolvedStoreName;
          payload.carrierStoreName = carrierStoreName || undefined;
          if (isDigylog && networkId) payload.networkId = Number(networkId);
        }
        const res = await apiRequest("POST", "/api/carrier-accounts", payload);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
        return data;
      }
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", providerId] });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts"] });
      qc.invalidateQueries({ queryKey: ["/api/shipping/active-accounts"] });
      if (existingAccount) {
        if (data?.tokenUpdated) {
          toast({
            title: "Token mis à jour et sauvegardé ✅",
            description: "Votre nouveau token Digylog a été enregistré de façon permanente.",
          });
        } else {
          toast({
            title: "Paramètres mis à jour ✅",
            description: `${providerName} a été mis à jour avec succès.`,
          });
        }
      } else {
        toast({
          title: "Connecté ✅",
          description: `${providerName} ajouté avec succès.`,
        });
      }
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
    if (!existingAccount && !selectedStoreId) {
      setSubmitError("Veuillez sélectionner une boutique.");
      return;
    }
    if (isAmeex) {
      if (!existingAccount && !apiKey.trim()) {
        setSubmitError("Le C-Api-Key est requis.");
        return;
      }
      if (!existingAccount && !ameexApiId.trim()) {
        setSubmitError("Le C-Api-Id est requis.");
        return;
      }
      if (!ameexStoreName.trim()) {
        setSubmitError("Le Store Name est requis.");
        return;
      }
    } else {
      if (!existingAccount && !apiKey.trim()) {
        setSubmitError("Le token d'autorisation est requis.");
        return;
      }
      if (isDigylog && !carrierStoreName.trim()) {
        const msg = "Le nom du magasin Digylog est obligatoire";
        setSubmitError(msg);
        toast({ title: "Champ requis", description: "Copiez exactement le nom depuis votre compte Digylog → onglet Magasins.", variant: "destructive" });
        return;
      }
    }
    mutation.mutate();
  };

  // ── EDIT MODE: simplified focused view ────────────────────────────────────
  if (existingAccount) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white overflow-hidden">
          <DialogHeader className="pb-2">
            <DialogTitle style={{ color: NAVY }} className="text-lg font-bold">
              Modifier — {existingAccount.connectionName}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {isAmeex
                ? "Mettez à jour vos identifiants Ameex ou copiez l'URL WebHook."
                : "Mettez à jour le token, le nom du magasin Digylog ou copiez l'URL WebHook."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto pr-1">

            {/* ══════════════ AMEEX EDIT FIELDS ══════════════ */}
            {isAmeex ? (
              <>
                {/* Store Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="ameex_store_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                    Store Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ameex_store_edit"
                    data-testid="input-ameex-store-name"
                    placeholder="Nom de votre boutique Ameex"
                    value={ameexStoreName}
                    onChange={e => setAmeexStoreName(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                {/* C-Api-Key + C-Api-Id side by side */}
                <div className="grid grid-cols-2 gap-3">
                  {/* C-Api-Key */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ameex_ckey_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                      C-Api-Key
                    </Label>
                    {existingAccount?.hasApiKey && !isEditingToken ? (
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-green-200 bg-green-50">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        <span className="text-[11px] font-semibold text-green-700 truncate flex-1">Enregistrée</span>
                        <button
                          type="button"
                          data-testid="button-edit-token"
                          onClick={() => { setIsEditingToken(true); setApiKey(""); }}
                          className="shrink-0 text-[10px] font-bold text-blue-600 hover:text-blue-800 underline"
                        >
                          Modifier
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          id="ameex_ckey_edit"
                          data-testid="input-ameex-apikey"
                          data-lpignore="true"
                          data-form-type="other"
                          autoComplete="new-password"
                          type={showAmeexKey ? "text" : "password"}
                          placeholder="Nouvelle clé..."
                          value={apiKey}
                          onChange={e => { setApiKey(e.target.value); setIsEditingToken(true); }}
                          className="pr-8 h-10 text-xs font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAmeexKey(v => !v)}
                        >
                          {showAmeexKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* C-Api-Id */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ameex_cid_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                      C-Api-Id
                    </Label>
                    <Input
                      id="ameex_cid_edit"
                      data-testid="input-ameex-apiid"
                      placeholder="Votre C-Api-Id"
                      value={ameexApiId}
                      onChange={e => setAmeexApiId(e.target.value)}
                      className="h-10 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Laissez vide pour conserver l'actuel</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── Generic: Authorization Token ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="carrier_token_input"
                      className="font-semibold text-sm"
                      style={{ color: NAVY }}
                    >
                      Authorization Token
                    </Label>
                    <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                      Clé API
                    </span>
                  </div>

                  {existingAccount?.hasApiKey && !isEditingToken ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-[12px] font-semibold text-green-700">Token actuel enregistré</span>
                        <code className="text-[11px] font-mono text-gray-500 truncate ml-1">
                          {existingAccount.apiKeyMasked}
                        </code>
                      </div>
                      <button
                        type="button"
                        data-testid="button-edit-token"
                        onClick={() => { setIsEditingToken(true); setApiKey(""); }}
                        className="shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                      >
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        id="carrier_token_input"
                        name="carrier_token_input"
                        data-testid="input-carrier-apikey"
                        data-lpignore="true"
                        data-form-type="other"
                        autoComplete="new-password"
                        type={showKey ? "text" : "password"}
                        placeholder={existingAccount?.hasApiKey ? "Entrez un nouveau token pour remplacer l'actuel" : "Coller votre token API ici"}
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setIsEditingToken(true); }}
                        className="pr-20 h-11 text-sm font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 placeholder:text-muted-foreground/60"
                        autoFocus={isEditingToken}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {existingAccount?.hasApiKey && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingToken(false); setApiKey(""); }}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/50 transition-colors"
                            title="Annuler la modification"
                          >
                            ✕
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowKey(v => !v)}
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isEditingToken || !existingAccount?.hasApiKey
                      ? <>Entrez votre <strong>clé API transporteur</strong>. Laissez vide pour conserver le token actuel.</>
                      : <>Token sauvegardé de façon permanente. Cliquez sur <strong>Modifier</strong> pour le remplacer.</>
                    }
                  </p>
                </div>

                {/* ── Digylog store name (edit mode) ── */}
                {isDigylog && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="carrier_store_name_edit"
                      className="font-semibold text-sm flex items-center gap-1.5"
                      style={{ color: NAVY }}
                    >
                      Nom du magasin (Digylog)
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="carrier_store_name_edit"
                      data-testid="input-digylog-store-name"
                      placeholder="Ex: Boutique Atlas"
                      value={carrierStoreName}
                      onChange={e => setCarrierStoreName(e.target.value)}
                      className="h-11 text-sm"
                    />
                    <div className="space-y-2">
                      {digylogStores.length > 0 ? (
                        <Select value={carrierStoreName} onValueChange={setCarrierStoreName}>
                          <SelectTrigger className="h-11 text-sm">
                            <SelectValue placeholder="Sélectionnez votre magasin Digylog..." />
                          </SelectTrigger>
                          <SelectContent>
                            {digylogStores.map(s => (
                              <SelectItem key={String(s.id)} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-gray-400 hover:text-foreground transition-colors"
                          onClick={fetchDigylogStores}
                          disabled={isFetchingStores}
                        >
                          {isFetchingStores
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des magasins...</>
                            : <><RefreshCw className="w-3.5 h-3.5" /> Charger les magasins depuis Digylog</>}
                        </button>
                      )}
                      {digylogStores.length > 0 && (
                        <button type="button" className="text-[11px] text-blue-500 hover:underline" onClick={fetchDigylogStores} disabled={isFetchingStores}>
                          {isFetchingStores ? "Actualisation…" : "↺ Actualiser la liste"}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Copiez exactement le nom depuis votre compte Digylog <strong>→ Magasins</strong>.
                    </p>
                  </div>
                )}

                {/* ── Digylog: network (point de collecte) ── */}
                {isDigylog && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-1.5" style={{ color: NAVY }}>
                      Point de collecte (Réseau Digylog)
                    </Label>
                    {digylogNetworks.length > 0 ? (
                      <Select value={networkId} onValueChange={setNetworkId}>
                        <SelectTrigger data-testid="select-digylog-network-edit" className="h-11 text-sm">
                          <SelectValue placeholder="Sélectionnez votre réseau Digylog..." />
                        </SelectTrigger>
                        <SelectContent>
                          {digylogNetworks.map(n => (
                            <SelectItem key={String(n.id)} value={String(n.id)}>{n.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-gray-400 hover:text-foreground transition-colors"
                        onClick={() => fetchDigylogNetworks()}
                        disabled={isFetchingNetworks}
                      >
                        {isFetchingNetworks
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des réseaux...</>
                          : <><RefreshCw className="w-3.5 h-3.5" /> Charger les réseaux depuis Digylog</>}
                      </button>
                    )}
                    {digylogNetworks.length > 0 && (
                      <button type="button" className="text-[11px] text-blue-500 hover:underline" onClick={() => fetchDigylogNetworks()} disabled={isFetchingNetworks}>
                        {isFetchingNetworks ? "Actualisation…" : "↺ Actualiser la liste"}
                      </button>
                    )}
                    {networkId && (
                      <p className="text-[11px] text-muted-foreground">Réseau sélectionné : <strong>{digylogNetworks.find(n => String(n.id) === networkId)?.name || `#${networkId}`}</strong></p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── WebHook URL (permanent) — shared for all carriers ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-800 leading-snug">
                  ⚠️ Copiez cette URL dans vos paramètres {isAmeex ? "Ameex" : "API"} pour activer le tracking en temps réel.
                </p>
              </div>
              <Label className="font-semibold text-sm flex items-center gap-2" style={{ color: NAVY }}>
                WebHook URL
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                  Permanente
                </span>
              </Label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-amber-200 bg-amber-50/50 overflow-hidden">
                <code className="flex-1 text-[10px] font-mono text-gray-700 truncate min-w-0">
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
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    webhookCopied
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-amber-500 text-white border border-amber-600 hover:bg-amber-600 shadow-sm"
                  }`}
                >
                  {webhookCopied
                    ? <><Check className="w-3.5 h-3.5" /> Copié!</>
                    : <><Copy className="w-3.5 h-3.5" /> Copier</>}
                </button>
              </div>
            </div>

            {/* ── Assignment rule (edit mode, all carriers) ── */}
            <div className="space-y-2 pt-1">
              <p className="text-sm font-semibold" style={{ color: NAVY }}>Règle d'affectation</p>
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
            <Button
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
              data-testid="button-cancel-connect"
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="flex-1 text-white font-bold"
              style={{ background: `linear-gradient(135deg,${GOLD},#b8904a)` }}
              data-testid="button-confirm-connect"
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enregistrement...</>
                : <><Check className="w-4 h-4 mr-2" /> Enregistrer</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── CREATE MODE: full form ─────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            Connexion avec {providerName}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Liez un compte <strong>{providerName}</strong> à l'une de vos boutiques.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto pr-1">

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

          {/* ══════════════ AMEEX CREATE FIELDS ══════════════ */}
          {isAmeex ? (
            <>
              {/* Store Name */}
              <div className="space-y-1.5">
                <Label htmlFor="ameex_store_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                  Store Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ameex_store_create"
                  data-testid="input-ameex-store-name"
                  placeholder="Nom de votre boutique Ameex"
                  value={ameexStoreName}
                  onChange={e => setAmeexStoreName(e.target.value)}
                  className={`h-10 text-sm ${!ameexStoreName.trim() && submitError ? "border-red-400" : ""}`}
                />
              </div>

              {/* C-Api-Key + C-Api-Id — side by side */}
              <div className="grid grid-cols-2 gap-3">
                {/* C-Api-Key */}
                <div className="space-y-1.5">
                  <Label htmlFor="ameex_ckey_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                    C-Api-Key <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="ameex_ckey_create"
                      data-testid="input-ameex-apikey"
                      data-lpignore="true"
                      data-form-type="other"
                      autoComplete="new-password"
                      type={showAmeexKey ? "text" : "password"}
                      placeholder="Votre C-Api-Key"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className={`pr-8 h-10 text-xs font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 ${!apiKey.trim() && submitError ? "border-red-400" : ""}`}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAmeexKey(v => !v)}
                    >
                      {showAmeexKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* C-Api-Id */}
                <div className="space-y-1.5">
                  <Label htmlFor="ameex_cid_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                    C-Api-Id <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ameex_cid_create"
                    data-testid="input-ameex-apiid"
                    placeholder="Votre C-Api-Id"
                    value={ameexApiId}
                    onChange={e => setAmeexApiId(e.target.value)}
                    className={`h-10 text-xs font-mono ${!ameexApiId.trim() && submitError ? "border-red-400" : ""}`}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── Generic: Authorization token (API Key) ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="carrier_token_create" className="font-semibold text-sm">
                    Authorization Token <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    Clé API
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="carrier_token_create"
                    name="carrier_token_create"
                    data-testid="input-carrier-apikey"
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    type={showKey ? "text" : "password"}
                    placeholder="Entrez votre token d'autorisation..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className={`font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 ${!apiKey.trim() && submitError ? "border-red-400" : ""}`}
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
            </>
          )}

          {/* ── Digylog: store name ── */}
          {isDigylog && (
            <div className="space-y-2">
              <Label htmlFor="carrier_store_name_create" className="font-semibold text-sm flex items-center gap-1.5">
                Nom du magasin (Digylog) <span className="text-red-500">*</span>
              </Label>

              {/* Text input — always visible for direct typing/pasting */}
              <Input
                id="carrier_store_name_create"
                data-testid="input-digylog-store-name"
                placeholder="Ex: Boutique Atlas"
                value={carrierStoreName}
                onChange={e => setCarrierStoreName(e.target.value)}
                className="h-11 text-sm"
              />

              {/* Optional store picker — loads live list from Digylog API */}
              <div className="space-y-2">
                {digylogStores.length > 0 ? (
                  <Select value={carrierStoreName} onValueChange={setCarrierStoreName}>
                    <SelectTrigger data-testid="select-digylog-store" className="w-full">
                      <SelectValue placeholder="Ou sélectionnez depuis Digylog..." />
                    </SelectTrigger>
                    <SelectContent>
                      {digylogStores.map(s => (
                        <SelectItem key={String(s.id)} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <button
                    type="button"
                    data-testid="button-fetch-digylog-stores"
                    onClick={fetchDigylogStores}
                    disabled={isFetchingStores}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-gray-400 hover:text-foreground transition-colors disabled:opacity-50 w-full justify-center"
                  >
                    {isFetchingStores
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement...</>
                      : <><RefreshCw className="w-3.5 h-3.5" /> Charger la liste depuis Digylog</>}
                  </button>
                )}
                {digylogStores.length > 0 && (
                  <button
                    type="button"
                    onClick={fetchDigylogStores}
                    disabled={isFetchingStores}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Rafraîchir la liste
                  </button>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Copiez exactement le nom depuis votre compte Digylog <strong>→ onglet Magasins</strong>.
              </p>
            </div>
          )}

          {/* ── Digylog: network (point de collecte) ── */}
          {isDigylog && (
            <div className="space-y-2">
              <Label className="font-semibold text-sm flex items-center gap-1.5">
                Point de collecte (Réseau Digylog)
              </Label>
              {digylogNetworks.length > 0 ? (
                <Select value={networkId} onValueChange={setNetworkId}>
                  <SelectTrigger data-testid="select-digylog-network-create" className="w-full">
                    <SelectValue placeholder="Sélectionnez votre réseau Digylog..." />
                  </SelectTrigger>
                  <SelectContent>
                    {digylogNetworks.map(n => (
                      <SelectItem key={String(n.id)} value={String(n.id)}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <button
                  type="button"
                  data-testid="button-fetch-digylog-networks"
                  onClick={() => fetchDigylogNetworks()}
                  disabled={isFetchingNetworks}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-gray-400 hover:text-foreground transition-colors disabled:opacity-50 w-full justify-center"
                >
                  {isFetchingNetworks
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des réseaux...</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> Charger les réseaux depuis Digylog</>}
                </button>
              )}
              {digylogNetworks.length > 0 && (
                <button
                  type="button"
                  onClick={() => fetchDigylogNetworks()}
                  disabled={isFetchingNetworks}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Rafraîchir la liste
                </button>
              )}
              {networkId && (
                <p className="text-[11px] text-muted-foreground">Réseau sélectionné : <strong>{digylogNetworks.find(n => String(n.id) === networkId)?.name || `#${networkId}`}</strong></p>
              )}
            </div>
          )}

          {/* ── Advanced: API Base URL (hidden for Ameex — fixed endpoint) ── */}
          {!isAmeex && (
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced(v => !v)}
                data-testid="button-toggle-advanced-url"
              >
                <span>{showAdvanced ? "▾" : "▸"}</span>
                <span>Paramètres avancés (URL API personnalisée)</span>
              </button>
              {showAdvanced && (
                <div className="space-y-1.5 pt-1">
                  <Label className="font-semibold text-sm">
                    URL API Base{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      (optionnel — remplace l'URL par défaut)
                    </span>
                  </Label>
                  <Input
                    data-testid="input-carrier-apiurl"
                    type="url"
                    placeholder="ex: https://api.digylog.ma/v1/orders"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Laisser vide pour utiliser l'URL par défaut.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── WebHook URL (permanent) ── */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-[11px] font-semibold text-amber-800 leading-snug">
                ⚠️ Copiez cette URL dans vos paramètres {isAmeex ? "Ameex" : "API"} pour activer le tracking en temps réel.
              </p>
            </div>
            <Label className="font-semibold text-sm flex items-center gap-1.5">
              WebHook URL
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Permanente</span>
            </Label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border-2 border-amber-200 bg-amber-50/40 overflow-hidden">
              <code className="flex-1 text-[10px] font-mono truncate min-w-0 text-foreground">
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
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  webhookCopied
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-amber-500 text-white border border-amber-600 hover:bg-amber-600 shadow-sm"
                }`}
              >
                {webhookCopied
                  ? <><Check className="w-3.5 h-3.5" /> Copié!</>
                  : <><Copy className="w-3.5 h-3.5" /> Copier</>}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Cette URL est <strong>permanente</strong> — elle ne change jamais. Collez-la dans les réglages webhook {isAmeex ? "Ameex" : "de votre transporteur"}.
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
              <><Link2 className="w-4 h-4 mr-2" /> Connecter</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── DigylogPrefsModal ──────────────────────────────────────── */
function DigylogPrefsModal({ open, onClose, initialStoreName, initialNetworkId }: {
  open: boolean;
  onClose: () => void;
  initialStoreName?: string;
  initialNetworkId?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stores, setStores]           = useState<{ id: number; name: string }[]>([]);
  const [networks, setNetworks]       = useState<{ id: number; name: string }[]>([]);
  const [selectedStore, setSelectedStore]   = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [loadingStores, setLoadingStores]   = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedStore(initialStoreName || "");
    setSelectedNetwork(initialNetworkId ? String(initialNetworkId) : "");
    setLoadingStores(true);
    setLoadingNetworks(true);
    fetch("/api/digylog/stores")
      .then(r => r.json())
      .then(d => setStores(Array.isArray(d) ? d : []))
      .finally(() => setLoadingStores(false));
    fetch("/api/digylog/networks")
      .then(r => r.json())
      .then(d => setNetworks(Array.isArray(d) ? d : []))
      .finally(() => setLoadingNetworks(false));
  }, [open]);

  const save = async () => {
    if (!selectedStore || !selectedNetwork) {
      toast({ title: "Champs requis", description: "Sélectionnez un magasin et un réseau.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/digylog/preferences", {
        digylogStoreName: selectedStore,
        digylogNetworkId: Number(selectedNetwork),
      });
      qc.invalidateQueries({ queryKey: ["/api/carrier-accounts", "digylog"] });
      toast({ title: "Préférences sauvegardées ✅" });
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message || "Échec de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Préférences Digylog</DialogTitle>
          <DialogDescription>
            Configurez le magasin et le réseau de livraison utilisés pour vos expéditions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Magasin</Label>
            {loadingStores ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement des magasins…
              </div>
            ) : stores.length === 0 ? (
              <p className="text-sm text-red-500">Aucun magasin trouvé. Vérifiez votre token Digylog.</p>
            ) : (
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger data-testid="select-digylog-store">
                  <SelectValue placeholder="Choisir un magasin" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Réseau de livraison</Label>
            {loadingNetworks ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement des réseaux…
              </div>
            ) : networks.length === 0 ? (
              <p className="text-sm text-red-500">Aucun réseau trouvé. Vérifiez votre token Digylog.</p>
            ) : (
              <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                <SelectTrigger data-testid="select-digylog-network">
                  <SelectValue placeholder="Choisir un réseau" />
                </SelectTrigger>
                <SelectContent>
                  {networks.map(n => (
                    <SelectItem key={n.id} value={String(n.id)}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button
            onClick={save}
            disabled={saving || loadingStores || loadingNetworks}
            className="text-white font-bold px-6"
            style={{ background: GOLD }}
            data-testid="button-save-digylog-prefs"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Enregistrer
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

  const [activeTab,         setActiveTab]         = useState(0);
  const [editAccount,       setEditAccount]       = useState<any>(null);
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<number | null>(null);
  const [copiedKey,         setCopiedKey]         = useState<string | null>(null);
  const [digylogPrefsOpen,  setDigylogPrefsOpen]  = useState(false);
  const [digylogPrefsAcct,  setDigylogPrefsAcct]  = useState<any>(null);

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

  const syncCitiesMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/carrier-accounts/${id}/sync-cities`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/carriers/cities"] });
      toast({
        title: "✅ Villes synchronisées",
        description: `${data?.count ?? "?"} villes importées depuis ${providerName}.`,
      });
    },
    onError: (e: any) => toast({
      title: "Échec de la synchronisation",
      description: e.message,
      variant: "destructive",
    }),
  });

  const [ameexSyncPending, setAmeexSyncPending] = useState(false);
  const handleAmeexSync = async () => {
    setAmeexSyncPending(true);
    try {
      const res = await apiRequest("POST", "/api/shipping/ameex/sync", {});
      const data = await res.json();
      toast({
        title: "✅ Statuts synchronisés",
        description: `${data.synced ?? 0} commande(s) vérifiées, ${data.updated ?? 0} mise(s) à jour.`,
      });
    } catch (e: any) {
      toast({ title: "Erreur de synchronisation", description: e.message, variant: "destructive" });
    } finally {
      setAmeexSyncPending(false);
    }
  };

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
                        ...(acct.carrierName === "digylog" && acct.carrierStoreName
                          ? [["Magasin Digylog", acct.carrierStoreName]] : []),
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
                    {providerId === "digylog" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 font-semibold"
                        style={{ color: NAVY, borderColor: GOLD + "88" }}
                        onClick={() => { setDigylogPrefsAcct(acct); setDigylogPrefsOpen(true); }}
                        data-testid={`button-digylog-prefs-${acct.id}`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Préférences
                      </Button>
                    )}
                    {providerId === "ameex" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={handleAmeexSync}
                        disabled={ameexSyncPending}
                        data-testid={`button-ameex-sync-statuses-${acct.id}`}
                      >
                        {ameexSyncPending
                          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Synchroniser les statuts
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-200 hover:bg-amber-50 font-semibold"
                      style={{ color: GOLD, borderColor: GOLD + "55" }}
                      onClick={() => syncCitiesMutation.mutate(acct.id)}
                      disabled={syncCitiesMutation.isPending}
                      data-testid={`button-sync-cities-${acct.id}`}
                    >
                      {syncCitiesMutation.isPending
                        ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                      Synchroniser les villes
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

      <DigylogPrefsModal
        open={digylogPrefsOpen}
        onClose={() => { setDigylogPrefsOpen(false); setDigylogPrefsAcct(null); }}
        initialStoreName={digylogPrefsAcct?.settings?.digylogStoreName || digylogPrefsAcct?.carrierStoreName}
        initialNetworkId={digylogPrefsAcct?.settings?.digylogNetworkId}
      />
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

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
import { Textarea } from "@/components/ui/textarea";
import {
  Link2, CheckCircle, Loader2, Eye, EyeOff,
  MapPin, Video, Home, ChevronRight,
  Plus, Copy, Check, Trash2, Pencil, AlertCircle, RefreshCw, ShieldCheck, Upload, FileJson,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/* ─── Constants ─────────────────────────────────────────────── */
const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

const PROVIDERS = [
  { id: "digylog",        name: "Digylog",          cities: 581, logo: "/carriers/digylog.svg"  },
  { id: "onessta",        name: "Onessta",           cities: 378, logo: "/carriers/onessta.svg"  },
  { id: "ozonexpress",    name: "Ozon Express",      cities: 628, logo: "/carriers/ozonexpress.png" },
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
  { id: "colisspeed",     name: "Colisspeed",        cities: 445, logo: null                             },
  { id: "expresscoursier", name: "Express Coursier", cities: 450, logo: "/carriers/expresscoursier.png" },
  { id: "custom",         name: "➕ Autre transporteur", cities: 0, logo: null                         },
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

type WebhookLog = {
  id: number;
  provider?: string;
  action: string;
  status: string;
  message?: string;
  createdAt?: string;
};

const WEBHOOK_ACTIONS = ['status_update', 'webhook_received', 'webhook_no_match'];

function normalizeCarrierName(value?: string | null) {
  return (value || "").toLowerCase().replace(/[\s_-]/g, "");
}

function getProviderLabel(provider?: string) {
  const normalized = normalizeCarrierName(provider);
  return PROVIDERS.find((p) => normalizeCarrierName(p.id) === normalized || normalizeCarrierName(p.name) === normalized)?.name || provider || "Transporteur";
}

function getWebhookIndicator(providerId: string, logs: WebhookLog[], connectedProviderIds: Set<string>) {
  // No active account → always show "En attente", regardless of leftover logs
  if (!connectedProviderIds.has(normalizeCarrierName(providerId))) {
    return { label: "🟡 En attente", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  const providerLogs = logs.filter((log) => normalizeCarrierName(log.provider) === normalizeCarrierName(providerId));
  const lastLog = providerLogs[0];
  if (lastLog?.status === "fail") {
    return {
      label: "🔴 Erreur",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const hasRecentStatusUpdate = providerLogs.some((log) =>
    log.action === "status_update" &&
    new Date(log.createdAt || 0).getTime() >= since
  );
  if (hasRecentStatusUpdate) {
    return {
      label: "🟢 Webhook actif",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  return {
    label: "🟡 En attente",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  };
}

function formatWebhookMessage(log: WebhookLog) {
  const provider = getProviderLabel(log.provider);
  const icon = log.action === "webhook_no_match" || log.status === "fail" ? "⚠️" : "📦";
  const result = log.status === "fail" ? "❌" : "✅";
  return `${icon} [${provider}] ${log.message || log.action.replace(/_/g, " ")} ${result}`;
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

  // ── Express Coursier-specific fields ─────────────────────────────────────
  const isExpressCoursier = providerId === "expresscoursier";
  const [ecStoreId, setEcStoreId] = useState<string>(
    String(existingAccount?.settings?.expressCoursierStoreId ?? "")
  );

  // ── Ozon Express-specific fields ─────────────────────────────────────────
  const isOzonExpress = providerId === "ozonexpress";
  const [ozonCustomerId, setOzonCustomerId] = useState<string>(
    String(existingAccount?.settings?.ozonExpressCustomerId ?? "")
  );
  const [ozonParcelStock, setOzonParcelStock] = useState<string>(
    (existingAccount?.settings as any)?.ozonParcelStock === "1" ? "1" : "0"
  );

  // ── Custom carrier fields ─────────────────────────────────────────────────
  const isCustom = providerId === "custom";
  const [customCarrierName, setCustomCarrierName] = useState<string>("");

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

  // ── Delivery fee (stored in centimes, edited in DH) ───────────────────────
  const [deliveryFee, setDeliveryFee] = useState<string>(
    existingAccount?.deliveryFee ? String((existingAccount.deliveryFee / 100).toFixed(2)) : ""
  );

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
  // Permanent webhook URL — no token needed for Ameex (Ameex posts to a plain URL;
  // safety comes from CODE-based order matching on the backend).
  const webhookUrl = resolvedStoreId
    ? (providerId === "expresscoursier"
        ? `${domain}/api/webhooks/shipping/expresscoursier/${resolvedStoreId}`
        : `${domain}/api/webhooks/carrier/${resolvedStoreId}/${providerId}`)
    : (providerId === "expresscoursier"
        ? `${domain}/api/webhooks/shipping/expresscoursier/{STORE_ID}`
        : `${domain}/api/webhooks/carrier/{STORE_ID}/${providerId}`);

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
        } else if (isExpressCoursier) {
          const ecStoreIdNum = Number(ecStoreId.trim());
          if (!ecStoreIdNum || ecStoreIdNum <= 0) {
            throw new Error("Le Store ID Express Coursier est obligatoire. Trouvez-le dans votre tableau de bord EC (Paramètres → API).");
          }
          if (apiKey.trim()) body.apiKey = apiKey;
          body.settings = { ...((existingAccount?.settings as object) || {}), expressCoursierStoreId: ecStoreIdNum };
        } else if (isOzonExpress) {
          const cid = ozonCustomerId.trim();
          if (!/^\d+$/.test(cid)) {
            throw new Error("Le Customer ID Ozon Express est obligatoire (numérique).");
          }
          if (apiKey.trim()) body.apiKey = apiKey;
          body.settings = { ...((existingAccount?.settings as object) || {}), ozonExpressCustomerId: cid, ozonParcelStock: ozonParcelStock === "1" ? "1" : "0" };
        } else {
          if (apiKey.trim()) body.apiKey = apiKey;
          if (apiUrl.trim()) body.apiUrl = apiUrl.trim();
          body.carrierStoreName = carrierStoreName || null;
          if (isDigylog && networkId) body.networkId = Number(networkId);
        }
        body.deliveryFee = Math.round(parseFloat(deliveryFee || "0") * 100);
        const res = await apiRequest("PATCH", `/api/carrier-accounts/${existingAccount.id}`, body);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
        return data;
      } else {
        const payload: any = {
          carrierName: isCustom ? customCarrierName.trim() : providerId,
          apiKey,
          assignmentRule: rule,
          isDefault: rule === "default" ? 1 : 0,
        };
        if (isAmeex) {
          payload.apiSecret       = ameexApiId.trim() || undefined;
          payload.carrierStoreName = ameexStoreName.trim() || undefined;
          payload.storeName       = resolvedStoreName;
        } else if (isExpressCoursier) {
          const ecStoreIdNum = Number(ecStoreId.trim());
          if (!ecStoreIdNum || ecStoreIdNum <= 0) {
            throw new Error("Le Store ID Express Coursier est obligatoire. Trouvez-le dans votre tableau de bord EC (Paramètres → API).");
          }
          payload.storeName = resolvedStoreName;
          payload.settings  = { expressCoursierStoreId: ecStoreIdNum };
        } else if (isOzonExpress) {
          const cid = ozonCustomerId.trim();
          if (!/^\d+$/.test(cid)) {
            throw new Error("Le Customer ID Ozon Express est obligatoire (numérique).");
          }
          payload.storeName = resolvedStoreName;
          payload.settings  = { ozonExpressCustomerId: cid, ozonParcelStock: ozonParcelStock === "1" ? "1" : "0" };
        } else if (isCustom) {
          payload.apiUrl    = apiUrl.trim() || undefined;
          payload.storeName = resolvedStoreName;
        } else {
          payload.apiUrl           = apiUrl.trim() || undefined;
          payload.storeName        = resolvedStoreName;
          payload.carrierStoreName = carrierStoreName || undefined;
          if (isDigylog && networkId) payload.networkId = Number(networkId);
        }
        if (selectedStoreId && selectedStoreId !== "__manual__") {
          payload.magasinId = Number(selectedStoreId);
        }
        payload.deliveryFee = Math.round(parseFloat(deliveryFee || "0") * 100);
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
    if (isCustom) {
      if (!customCarrierName.trim()) {
        setSubmitError("Le nom du transporteur est requis.");
        return;
      }
      if (!existingAccount && !apiKey.trim()) {
        setSubmitError("La clé API est requise.");
        return;
      }
    } else if (isExpressCoursier) {
      if (!existingAccount && !apiKey.trim()) {
        setSubmitError("Le Token Express Coursier est requis.");
        return;
      }
    } else if (isAmeex) {
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

            {/* ══════════ EXPRESS COURSIER EDIT FIELDS ══════════ */}
            {isExpressCoursier ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ec_token_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                    Token API
                  </Label>
                  {existingAccount?.hasApiKey && !isEditingToken ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50">
                      <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-[12px] font-semibold text-green-700 flex-1">Token enregistré</span>
                      <button
                        type="button"
                        data-testid="button-edit-ec-token"
                        onClick={() => { setIsEditingToken(true); setApiKey(""); }}
                        className="shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
                      >
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        id="ec_token_edit"
                        data-testid="input-ec-token"
                        data-lpignore="true"
                        data-form-type="other"
                        autoComplete="new-password"
                        type={showKey ? "text" : "password"}
                        placeholder="Nouveau token..."
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setIsEditingToken(true); }}
                        className="pr-8 h-10 text-xs font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowKey(v => !v)}
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ec_store_id_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                    Store ID Express Coursier <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ec_store_id_edit"
                    data-testid="input-ec-store-id"
                    inputMode="numeric"
                    placeholder="ex: 1234"
                    value={ecStoreId}
                    onChange={e => setEcStoreId(e.target.value.replace(/\D/g, ""))}
                    className={`h-10 text-sm ${isExpressCoursier && !ecStoreId.trim() && submitError ? "border-red-400" : ""}`}
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">Trouvez votre Store ID dans votre tableau de bord Express Coursier (Paramètres → API)</p>
                </div>
              </>
            ) : isOzonExpress ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ozon_token_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                    API Key
                  </Label>
                  {existingAccount?.hasApiKey && !isEditingToken ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50">
                      <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-[12px] font-semibold text-green-700 flex-1">Clé API enregistrée</span>
                      <button
                        type="button"
                        data-testid="button-edit-ozon-token"
                        onClick={() => { setIsEditingToken(true); setApiKey(""); }}
                        className="shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
                      >
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        id="ozon_token_edit"
                        data-testid="input-ozon-token"
                        data-lpignore="true"
                        data-form-type="other"
                        autoComplete="new-password"
                        type={showKey ? "text" : "password"}
                        placeholder="Nouvelle clé API..."
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setIsEditingToken(true); }}
                        className="pr-8 h-10 text-xs font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowKey(v => !v)}
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ozon_customer_id_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                    Customer ID Ozon Express <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ozon_customer_id_edit"
                    data-testid="input-ozon-customer-id"
                    inputMode="numeric"
                    placeholder="ex: 123456"
                    value={ozonCustomerId}
                    onChange={e => setOzonCustomerId(e.target.value.replace(/\D/g, ""))}
                    className={`h-10 text-sm ${isOzonExpress && !ozonCustomerId.trim() && submitError ? "border-red-400" : ""}`}
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">Trouvez votre Customer ID et API Key dans votre tableau de bord Ozon Express.</p>
                </div>
                {/* ── Ozon parcel-stock mode toggle ── */}
                <div className="space-y-2">
                  <label className="font-semibold text-sm" style={{ color: "#1e293b" }}>
                    Mode d'expédition
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${ozonParcelStock !== "1" ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}>
                    <input
                      type="radio"
                      name="ozonParcelStockEdit"
                      value="0"
                      checked={ozonParcelStock !== "1"}
                      onChange={() => setOzonParcelStock("0")}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold text-sm text-gray-800">📦 Pickup (Ramassage) — Recommandé</div>
                      <div className="text-xs text-gray-500 mt-0.5">Ozon vient récupérer les colis chez vous. Idéal pour COD / Dropshipping.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${ozonParcelStock === "1" ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}>
                    <input
                      type="radio"
                      name="ozonParcelStockEdit"
                      value="1"
                      checked={ozonParcelStock === "1"}
                      onChange={() => setOzonParcelStock("1")}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold text-sm text-gray-800">🏬 Stock chez Ozon</div>
                      <div className="text-xs text-gray-500 mt-0.5">Produits stockés dans les entrepôts Ozon. Chaque SKU doit être pré-enregistré dans votre portail Ozon.</div>
                    </div>
                  </label>
                </div>
              </>
            ) : (
            <>
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
            </>
            )}

            {/* ── Frais de livraison (edit mode, all carriers) ── */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery_fee_edit" className="font-semibold text-sm" style={{ color: NAVY }}>
                Frais de livraison (DH)
              </Label>
              <Input
                id="delivery_fee_edit"
                data-testid="input-delivery-fee-edit"
                type="number"
                min="0"
                step="0.5"
                placeholder="Ex: 25"
                value={deliveryFee}
                onChange={e => setDeliveryFee(e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Montant facturé par la société de livraison par colis livré
              </p>
            </div>

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

          {/* ══════════════ CUSTOM / AMEEX / EC / GENERIC CREATE FIELDS ══════════════ */}
          {isExpressCoursier ? (
            <>
              {/* ── Express Coursier: Token + Store ID ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ec_token_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                    Token API <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    Clé API
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="ec_token_create"
                    data-testid="input-ec-token"
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    type={showKey ? "text" : "password"}
                    placeholder="Entrez votre token Express Coursier..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className={`pr-8 font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 ${!apiKey.trim() && submitError ? "border-red-400" : ""}`}
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
              <div className="space-y-1.5">
                <Label htmlFor="ec_store_id_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                  Store ID Express Coursier <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ec_store_id_create"
                  data-testid="input-ec-store-id"
                  inputMode="numeric"
                  placeholder="ex: 1234"
                  value={ecStoreId}
                  onChange={e => setEcStoreId(e.target.value.replace(/\D/g, ""))}
                  className={`h-10 text-sm ${isExpressCoursier && !ecStoreId.trim() && submitError ? "border-red-400" : ""}`}
                  required
                />
                <p className="text-[10px] text-muted-foreground">Trouvez votre Store ID dans votre tableau de bord Express Coursier (Paramètres → API)</p>
              </div>
            </>
          ) : isOzonExpress ? (
            <>
              {/* ── Ozon Express: API Key + Customer ID ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ozon_token_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                    API Key <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    Clé API
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="ozon_token_create"
                    data-testid="input-ozon-token"
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    type={showKey ? "text" : "password"}
                    placeholder="Entrez votre API Key Ozon Express..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className={`pr-8 font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 ${!apiKey.trim() && submitError ? "border-red-400" : ""}`}
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
              <div className="space-y-1.5">
                <Label htmlFor="ozon_customer_id_create" className="font-semibold text-sm" style={{ color: NAVY }}>
                  Customer ID Ozon Express <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ozon_customer_id_create"
                  data-testid="input-ozon-customer-id"
                  inputMode="numeric"
                  placeholder="ex: 123456"
                  value={ozonCustomerId}
                  onChange={e => setOzonCustomerId(e.target.value.replace(/\D/g, ""))}
                  className={`h-10 text-sm ${isOzonExpress && !ozonCustomerId.trim() && submitError ? "border-red-400" : ""}`}
                  required
                />
                <p className="text-[10px] text-muted-foreground">Trouvez votre Customer ID et API Key dans votre tableau de bord Ozon Express.</p>
              </div>
              {/* ── Ozon parcel-stock mode toggle ── */}
              <div className="space-y-2">
                <label className="font-semibold text-sm" style={{ color: "#1e293b" }}>
                  Mode d'expédition
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${ozonParcelStock !== "1" ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}>
                  <input
                    type="radio"
                    name="ozonParcelStockCreate"
                    value="0"
                    checked={ozonParcelStock !== "1"}
                    onChange={() => setOzonParcelStock("0")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">📦 Pickup (Ramassage) — Recommandé</div>
                    <div className="text-xs text-gray-500 mt-0.5">Ozon vient récupérer les colis chez vous. Idéal pour COD / Dropshipping.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${ozonParcelStock === "1" ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}>
                  <input
                    type="radio"
                    name="ozonParcelStockCreate"
                    value="1"
                    checked={ozonParcelStock === "1"}
                    onChange={() => setOzonParcelStock("1")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">🏬 Stock chez Ozon</div>
                    <div className="text-xs text-gray-500 mt-0.5">Produits stockés dans les entrepôts Ozon. Chaque SKU doit être pré-enregistré dans votre portail Ozon.</div>
                  </div>
                </label>
              </div>
            </>
          ) : isAmeex ? (
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
          ) : isCustom ? (
            <>
              {/* ── Custom carrier: nom, URL, clé API ── */}
              <div className="space-y-1.5">
                <Label htmlFor="custom_carrier_name" className="font-semibold text-sm">
                  Nom du transporteur <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="custom_carrier_name"
                  data-testid="input-custom-carrier-name"
                  placeholder="Ex: MonTransporteur"
                  value={customCarrierName}
                  onChange={e => setCustomCarrierName(e.target.value)}
                  className={`h-10 text-sm ${!customCarrierName.trim() && submitError ? "border-red-400" : ""}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom_carrier_url" className="font-semibold text-sm">
                  URL API <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="custom_carrier_url"
                  data-testid="input-custom-carrier-url"
                  placeholder="https://api.montransporteur.ma/orders"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  className="h-10 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom_carrier_key" className="font-semibold text-sm">
                  Clé API <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="custom_carrier_key"
                    data-testid="input-custom-carrier-apikey"
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    type={showKey ? "text" : "password"}
                    placeholder="Votre clé API..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className={`pr-8 h-10 text-xs font-mono bg-amber-50/40 border-amber-200 focus-visible:ring-amber-300 ${!apiKey.trim() && submitError ? "border-red-400" : ""}`}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey(v => !v)}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
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

          {/* ── Frais de livraison (create mode, all carriers) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="delivery_fee_create" className="font-semibold text-sm" style={{ color: NAVY }}>
              Frais de livraison (DH)
            </Label>
            <Input
              id="delivery_fee_create"
              data-testid="input-delivery-fee-create"
              type="number"
              min="0"
              step="0.5"
              placeholder="Ex: 25"
              value={deliveryFee}
              onChange={e => setDeliveryFee(e.target.value)}
              className="h-10 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Montant facturé par la société de livraison par colis livré (optionnel)
            </p>
          </div>

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

  // ── Seed-cities (manual JSON import) ─────────────────────────────────────
  const [seedModalOpen,  setSeedModalOpen]  = useState(false);
  const [seedAccountId,  setSeedAccountId]  = useState<number | null>(null);
  const [seedJson,       setSeedJson]       = useState("");
  const [seedLoading,    setSeedLoading]    = useState(false);
  const isSeedCarrier = providerId === "ozonexpress" || providerId === "expresscoursier";

  const handleSeedCities = async () => {
    if (!seedAccountId) return;
    setSeedLoading(true);
    try {
      let parsed: any;
      try { parsed = JSON.parse(seedJson.trim()); } catch {
        toast({ title: "JSON invalide", description: "Vérifiez la syntaxe du JSON.", variant: "destructive" });
        setSeedLoading(false);
        return;
      }
      const body = Array.isArray(parsed) ? parsed : (parsed?.cities ?? parsed);
      const result = await apiRequest("POST", `/api/carriers/${providerId}/seed-cities/${seedAccountId}`, body);
      toast({
        title: "✅ Villes importées",
        description: result?.message || `${result?.inserted ?? 0} villes importées.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/carriers/cities"] });
      setSeedModalOpen(false);
      setSeedJson("");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSeedLoading(false);
    }
  };

  // Generic single-button sync — works for any carrier the dispatcher supports.
  // Refreshes order lists & dashboard stats so KPIs reflect the new statuses without a manual reload.
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const syncCarrier = async (provider: string, opts?: { endpoint?: string; successTitle?: string; errorTitle?: string; suppressErrorSpamIfMessage?: boolean }) => {
    const endpoint = opts?.endpoint || `/api/shipping/${provider}/sync`;
    setSyncingProvider(provider);
    try {
      const res = await apiRequest("POST", endpoint, {});
      const data = await res.json();

      // Carrier API outage (3+ HTTP-5xx in a row) → show a clear destructive toast.
      if (data.apiDown) {
        toast({
          title: `⚠️ API ${provider} indisponible`,
          description: data.message || `Le transporteur renvoie des erreurs. Réessayez plus tard.`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: opts?.successTitle || `✅ ${provider} synchronisé`,
        description: data.message || `${data.synced ?? 0} commande(s) vérifiées, ${data.updated ?? 0} mise(s) à jour.`,
      });
      // Some carriers (e.g. Express Coursier, which has no public tracking API —
      // statuses arrive via webhook only) return a calm informational `message`
      // instead of a per-order errors[] array. Don't also spam N error toasts
      // on top of that single calm message.
      const suppressErrorSpam = !!opts?.suppressErrorSpamIfMessage && !!data.message;
      if (!suppressErrorSpam && Array.isArray(data.errors) && data.errors.length > 0) {
        toast({
          title: `⚠️ ${data.errors.length} erreur(s) lors de la synchro`,
          description: data.errors.slice(0, 3).map((e: any) => `#${e.orderId}: ${e.message}`).join('\n'),
        });
      }
      // Refresh dashboards & order lists so the cards & tables show new statuses immediately.
      qc.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      qc.invalidateQueries({ queryKey: ["/api/orders/all"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      qc.invalidateQueries({ queryKey: ["/api/agents/my-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/orders"] });
    } catch (e: any) {
      toast({ title: opts?.errorTitle || `Erreur ${provider}`, description: e.message, variant: "destructive" });
    } finally {
      setSyncingProvider(null);
    }
  };

  // Ameex now uses the new generic endpoint (gains 200ms throttle + per-order errors[] toast).
  const ameexSyncPending = syncingProvider === "ameex";
  const handleAmeexSync = () => syncCarrier("ameex", {
    successTitle: "✅ Statuts synchronisés",
    errorTitle: "Erreur de synchronisation",
  });

  // Digylog stays on its specific endpoint — that route also persists driver info
  // and delivery cost, which the generic endpoint doesn't do.
  const digylogSyncPending = syncingProvider === "digylog";
  const handleDigylogSync = () => syncCarrier("digylog", {
    endpoint: "/api/shipping/digylog/sync",
    successTitle: "✅ Statuts Digylog synchronisés",
    errorTitle: "Erreur de synchronisation Digylog",
  });


  const ozonSyncPending = syncingProvider === "ozonexpress";
  const handleOzonSync = () => syncCarrier("ozonexpress", {
    successTitle: "✅ Statuts Ozon Express synchronisés",
    errorTitle: "Erreur de synchronisation Ozon Express",
  });

  const ecSyncPending = syncingProvider === "expresscoursier";
  const handleEcSync = () => syncCarrier("expresscoursier", {
    successTitle: "✅ Statuts Express Coursier synchronisés",
    errorTitle: "Erreur de synchronisation Express Coursier",
    // EC has no public tracking-by-API endpoint — statuses arrive via webhook
    // only. The backend already returns one calm message instead of per-order
    // errors in that case; don't pile a second "N erreurs" toast on top of it.
    suppressErrorSpamIfMessage: true,
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
                    {providerId === "digylog" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={handleDigylogSync}
                        disabled={digylogSyncPending}
                        data-testid={`button-digylog-sync-statuses-${acct.id}`}
                      >
                        {digylogSyncPending
                          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Synchroniser Digylog
                      </Button>
                    )}
                    {providerId === "ozonexpress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={handleOzonSync}
                        disabled={ozonSyncPending}
                        data-testid={`button-ozon-sync-statuses-${acct.id}`}
                      >
                        {ozonSyncPending
                          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Synchroniser Ozon Express
                      </Button>
                    )}
                    {providerId === "expresscoursier" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                        onClick={handleEcSync}
                        disabled={ecSyncPending}
                        data-testid={`button-ec-sync-statuses-${acct.id}`}
                      >
                        {ecSyncPending
                          ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Synchroniser Express Coursier
                      </Button>
                    )}
                    {providerId === "digylog" && (
                      <>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          style={{ display: "none" }}
                          id={`digylog-csv-input-${acct.id}`}
                          data-testid={`input-digylog-csv-${acct.id}`}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            // Reset input so re-uploading the same file fires onChange again.
                            e.target.value = '';
                            if (!file) return;
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              fd.append('provider', 'digylog');
                              const res = await fetch('/api/shipping/import-csv', {
                                method: 'POST',
                                body: fd,
                                credentials: 'include',
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
                              toast({
                                title: "✅ Import CSV terminé",
                                description: `${data.created ?? 0} créée(s), ${data.skipped ?? 0} déjà présente(s), ${data.errors ?? 0} erreur(s).`,
                              });
                              qc.invalidateQueries({ queryKey: ["/api/orders/all"] });
                              qc.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
                              qc.invalidateQueries({ queryKey: ["/api/orders"] });
                              qc.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
                              qc.invalidateQueries({ queryKey: ["/api/agents/my-stats"] });
                            } catch (err: any) {
                              toast({
                                title: "Erreur d'import CSV",
                                description: err.message,
                                variant: "destructive",
                              });
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-semibold"
                          onClick={() => document.getElementById(`digylog-csv-input-${acct.id}`)?.click()}
                          data-testid={`button-digylog-import-csv-${acct.id}`}
                          title="Exportez vos commandes depuis le tableau de bord Digylog en CSV, puis importez-les ici."
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          Importer commandes (CSV)
                        </Button>
                      </>
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
                    {isSeedCarrier && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold"
                        onClick={() => { setSeedAccountId(acct.id); setSeedJson(""); setSeedModalOpen(true); }}
                        data-testid={`button-seed-cities-${acct.id}`}
                      >
                        <FileJson className="w-3.5 h-3.5 mr-1" />
                        Importer villes (JSON)
                      </Button>
                    )}
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

                  {/* EC per-city delivery pricing */}
                  {(acct.carrierName || "").toLowerCase() === "expresscoursier" && (
                    <EcCityPricingSection accountId={acct.id} />
                  )}

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
                        {/* Ozon Express: show Customer ID with warning if missing */}
                        {(acct.carrierName || "").toLowerCase() === "ozonexpress" && (() => {
                          const cid = (acct.settings as any)?.ozonExpressCustomerId || (acct.settings as any)?.ozonCustomerId || "";
                          return (
                            <tr className="border-b border-border/20">
                              <td className="px-4 py-3 font-medium">Customer ID</td>
                              <td className="px-4 py-3">
                                {cid ? (
                                  <span className="font-mono text-xs text-muted-foreground">{cid}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    Manquant — cliquez Modifier
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {cid && (
                                  <button
                                    onClick={() => copyText(cid, `cid-${acct.id}`)}
                                    className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                                    data-testid={`button-copy-cid-${acct.id}`}
                                  >
                                    {copiedKey === `cid-${acct.id}`
                                      ? <Check className="w-3.5 h-3.5 text-green-500" />
                                      : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })()}
                        {/* Ozon Express: show Mode d'expédition */}
                        {(acct.carrierName || "").toLowerCase() === "ozonexpress" && (
                          <tr className="border-b border-border/20">
                            <td className="px-4 py-3 font-medium">Mode d'expédition</td>
                            <td className="px-4 py-3 col-span-2">
                              <span className="text-xs text-muted-foreground">
                                {(acct.settings as any)?.ozonParcelStock === "1" ? "🏬 Stock chez Ozon" : "📦 Pickup (Ramassage)"}
                              </span>
                            </td>
                            <td />
                          </tr>
                        )}
                        {/* Express Coursier: show Store ID */}
                        {(acct.carrierName || "").toLowerCase() === "expresscoursier" && (() => {
                          const sid = String((acct.settings as any)?.expressCoursierStoreId || "");
                          return (
                            <tr className="border-b border-border/20">
                              <td className="px-4 py-3 font-medium">Store ID</td>
                              <td className="px-4 py-3">
                                {sid ? (
                                  <span className="font-mono text-xs text-muted-foreground">{sid}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    Manquant — cliquez Modifier
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {sid && (
                                  <button
                                    onClick={() => copyText(sid, `sid-${acct.id}`)}
                                    className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors"
                                    data-testid={`button-copy-sid-${acct.id}`}
                                  >
                                    {copiedKey === `sid-${acct.id}`
                                      ? <Check className="w-3.5 h-3.5 text-green-500" />
                                      : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })()}
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
                            {`${domain}/api/webhooks/carrier/${acct.storeId}/${(acct.carrierName || providerId).toLowerCase()}`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => copyText(`${domain}/api/webhooks/carrier/${acct.storeId}/${(acct.carrierName || providerId).toLowerCase()}`, `wh-${acct.id}`)}
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

      {/* ── Seed-cities (manual JSON) modal ─────────────────────────────── */}
      <Dialog open={seedModalOpen} onOpenChange={(v) => { if (!v && !seedLoading) { setSeedModalOpen(false); setSeedJson(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-blue-500" />
              Importer villes (JSON) — {providerName}
            </DialogTitle>
            <DialogDescription>
              Collez un tableau JSON de villes avec leurs identifiants numériques.
              Format accepté : <code className="bg-muted px-1 rounded text-xs">[{"{"}"cityId": "1", "cityName": "Casablanca"{"}"}]</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder={`[\n  {"cityId": "1", "cityName": "Casablanca"},\n  {"cityId": "2", "cityName": "Rabat"}\n]`}
              className="font-mono text-xs min-h-[200px] resize-y"
              value={seedJson}
              onChange={e => setSeedJson(e.target.value)}
              data-testid="textarea-seed-cities-json"
            />
            <p className="text-xs text-muted-foreground">
              Clés acceptées : <code className="bg-muted px-0.5 rounded">cityId</code> / <code className="bg-muted px-0.5 rounded">id</code> et <code className="bg-muted px-0.5 rounded">cityName</code> / <code className="bg-muted px-0.5 rounded">name</code>. L'identifiant doit être numérique.
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => { setSeedModalOpen(false); setSeedJson(""); }}>
              Annuler
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={!seedJson.trim() || seedLoading}
              onClick={handleSeedCities}
              data-testid="button-confirm-seed-cities"
            >
              {seedLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              Importer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
// ── EC per-city delivery pricing section ────────────────────────────────────
function EcCityPricingSection({ accountId, storeId }: { accountId: number; storeId?: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({}); // cityNorm → draft DH value

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/carriers/expresscoursier/city-pricing"],
    queryFn: () => apiRequest("GET", "/api/carriers/expresscoursier/city-pricing").then(r => r.json ? r.json() : r),
    staleTime: 30_000,
  });

  const importMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/carriers/expresscoursier/import-city-pricing", {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/carriers/expresscoursier/city-pricing"] });
      toast({ title: "✅ Tarifs importés", description: `${data?.count ?? "?"} villes importées depuis l'historique.` });
    },
    onError: (e: any) => toast({ title: "Erreur import", description: e.message, variant: "destructive" }),
  });

  const savePriceMutation = useMutation({
    mutationFn: ({ cityName, priceDh }: { cityName: string; priceDh: number }) =>
      apiRequest("POST", "/api/carriers/expresscoursier/city-pricing", { cityName, priceDh }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/carriers/expresscoursier/city-pricing"] });
    },
    onError: (e: any) => toast({ title: "Erreur sauvegarde", description: e.message, variant: "destructive" }),
  });

  const handleBlur = (cityName: string, cityNorm: string) => {
    const draft = editing[cityNorm];
    if (draft === undefined) return;
    const val = parseFloat(draft.replace(",", "."));
    if (isNaN(val) || val < 0) {
      toast({ title: "Valeur invalide", description: "Entrez un prix en DH (ex : 35)", variant: "destructive" });
      return;
    }
    setEditing(e => { const c = { ...e }; delete c[cityNorm]; return c; });
    savePriceMutation.mutate({ cityName, priceDh: val });
  };

  const filtered = search.trim()
    ? rows.filter((r: any) => r.cityName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="mt-4 rounded-xl border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-200/60 dark:border-amber-800/40">
        <div>
          <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Tarifs de livraison par ville</span>
          <span className="ml-2 text-xs text-muted-foreground">({rows.length} villes)</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 font-semibold text-xs h-7 px-2.5"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          data-testid="button-import-ec-city-pricing"
        >
          {importMutation.isPending
            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            : <RefreshCw className="w-3 h-3 mr-1" />}
          Importer tarifs historiques
        </Button>
      </div>

      {/* Default price row */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/60 dark:bg-slate-800/20 border-b border-border/30 text-sm">
        <span className="text-muted-foreground flex-1">Tarif par défaut (villes absentes de la liste)</span>
        <div className="flex items-center gap-1.5">
          {(() => {
            const def = rows.find((r: any) => r.cityName === "__default__");
            const norm = "__default__";
            const draft = editing[norm];
            const currentDh = def ? (def.priceDh / 100).toFixed(0) : "35";
            return (
              <>
                <input
                  type="number"
                  min="0"
                  step="5"
                  className="w-16 text-right border border-border/60 rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={draft !== undefined ? draft : currentDh}
                  onChange={e => setEditing(ed => ({ ...ed, [norm]: e.target.value }))}
                  onBlur={() => handleBlur("__default__", norm)}
                  onKeyDown={e => e.key === "Enter" && handleBlur("__default__", norm)}
                />
                <span className="text-xs text-muted-foreground">DH</span>
              </>
            );
          })()}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/20 bg-background">
        <input
          type="text"
          placeholder="Rechercher une ville…"
          className="w-full text-sm border border-border/50 rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-amber-400"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* City rows */}
      <div className="max-h-72 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "Aucun tarif importé — cliquez « Importer tarifs historiques »"
              : "Aucune ville correspondante"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 border-b border-border/30 z-10">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Ville</th>
                <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Prix (DH)</th>
                <th className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .filter((r: any) => r.cityName !== "__default__")
                .map((row: any) => {
                  const draft = editing[row.cityNorm];
                  const displayDh = (row.priceDh / 100).toFixed(0);
                  return (
                    <tr key={row.cityNorm} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 font-medium">{row.cityName}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="5"
                            className="w-16 text-right border border-border/50 rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-amber-400"
                            value={draft !== undefined ? draft : displayDh}
                            onChange={e => setEditing(ed => ({ ...ed, [row.cityNorm]: e.target.value }))}
                            onBlur={() => handleBlur(row.cityName, row.cityNorm)}
                            onKeyDown={e => e.key === "Enter" && handleBlur(row.cityName, row.cityNorm)}
                          />
                          <span className="text-xs text-muted-foreground">DH</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          row.source === "import_historique"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
                        }`}>
                          {row.source === "import_historique" ? "historique" : "manuel"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ShippingIntegrations() {
  const { data: allAccounts = [] } = useCarrierAccounts();
  const { data: logs = [], isLoading: logsLoading } = useQuery<WebhookLog[]>({
    queryKey: ["/api/integration-logs", "carrier-webhooks"],
    queryFn: async () => {
      const res = await fetch("/api/integration-logs?limit=200", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const [viewingProvider, setViewingProvider] = useState<string | null>(null);
  const [addingProvider,  setAddingProvider]  = useState<string | null>(null);
  const carrierLogs = logs.filter(l =>
    WEBHOOK_ACTIONS.includes(l.action)
  );

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
            const connectedProviderIds = new Set(
              Array.from(accountsByProvider.keys())
                .filter(k => (accountsByProvider.get(k) || []).some((a: any) => a.isActive === 1))
                .map(k => normalizeCarrierName(k))
            );
            const webhookIndicator = getWebhookIndicator(provider.id, carrierLogs, connectedProviderIds);

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
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${webhookIndicator.className}`}
                          data-testid={`status-webhook-${provider.id}`}
                        >
                          {webhookIndicator.label}
                        </span>
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

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid="card-webhook-activity">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Activité Webhook
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Statuts transporteurs reçus en temps réel, actualisés toutes les 30 secondes.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold">
              {carrierLogs.length} événement{carrierLogs.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : carrierLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-5 text-center text-sm text-muted-foreground">
              Aucun webhook transporteur reçu pour le moment.
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 divide-y divide-border/40 overflow-hidden">
              {carrierLogs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                  data-testid={`row-webhook-log-${log.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground break-words">
                      {formatWebhookMessage(log)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Date inconnue"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${
                      log.status === "fail"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {log.action.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

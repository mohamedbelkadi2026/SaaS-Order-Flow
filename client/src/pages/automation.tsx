import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Megaphone, Wifi, Check, X, Copy, Send, Loader2, RefreshCw, Phone,
  MessageCircle, Zap, Users, Clock, CheckCircle2, AlertCircle, Eye, EyeOff,
  Radio, UserCheck, UserX, Play, TrendingUp, ShoppingCart, DollarSign, Timer,
  Lock, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const DEFAULT_SYSTEM_PROMPT = `أنت وكيل خدمة عملاء محترف مغربي. تتحدث بالدارجة المغربية فقط.
مهمتك هي تأكيد تفاصيل الطلب (المقاس، اللون، المدينة) مع الزبون على واتساب،
والإجابة على أسئلتهم بشكل طبيعي.
إذا أكد الزبون طلبه، أخبره أن الطلب في الطريق إليه.`;

type Tab = "retargeting" | "ai" | "whatsapp" | "monitoring" | "recovery";

/* ── Pill tabs ─────────────────────────────────────────────────── */
function TabPill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all", active ? "text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/10")}
      style={active ? { background: `linear-gradient(135deg, ${GOLD}, #d4aa60)` } : {}}
    >
      {icon}
      {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════ */
export default function AutomationPage() {
  const [tab, setTab] = useState<Tab>("retargeting");

  return (
    <div className="min-h-screen" style={{ background: "#f4f4f5" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d2a7a 100%)` }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${GOLD}, #d4aa60)` }}>
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Automation & AI</h1>
              <p className="text-white/50 text-xs">Marketing intelligent · Confirmation automatique · WhatsApp</p>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <TabPill active={tab === "retargeting"} onClick={() => setTab("retargeting")} icon={<Megaphone className="w-4 h-4" />} label="Retargeting" />
            <TabPill active={tab === "ai"} onClick={() => setTab("ai")} icon={<Bot className="w-4 h-4" />} label="IA Confirmation" />
            <TabPill active={tab === "whatsapp"} onClick={() => setTab("whatsapp")} icon={<Wifi className="w-4 h-4" />} label="Connexion WhatsApp" />
            <TabPill active={tab === "monitoring"} onClick={() => setTab("monitoring")} icon={<Radio className="w-4 h-4" />} label="Live Monitoring" />
            <TabPill active={tab === "recovery"} onClick={() => setTab("recovery")} icon={<TrendingUp className="w-4 h-4" />} label="Récupération IA" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {tab === "retargeting" && <RetargetingTab />}
        {tab === "ai" && <AiConfirmationTab />}
        {tab === "whatsapp" && <WhatsappTab />}
        {tab === "monitoring" && <LiveMonitoringTab />}
        {tab === "recovery" && <RecoveryTab />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 1 — RETARGETING
════════════════════════════════════════════════════════════════ */
function RetargetingTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"delivered" | "injoignable">("delivered");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("مرحبا {nom}، عندنا عرض خاص ليك اليوم! 🎁");
  const [productLink, setProductLink] = useState("");
  const [campaignName, setCampaignName] = useState("");

  const { data: clientsRaw, isLoading } = useQuery<any>({
    queryKey: ["/api/automation/clients", filter],
    queryFn: () => fetch(`/api/automation/clients?status=${filter}`, { credentials: "include" }).then(r => r.json()),
  });
  const clients: any[] = Array.isArray(clientsRaw) ? clientsRaw : [];

  const { data: campaigns = [] } = useQuery<any[]>({ queryKey: ["/api/automation/campaigns"] });

  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/automation/campaigns", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName || `Campagne ${new Date().toLocaleDateString("fr-MA")}`, message, productLink, targetFilter: filter, totalTargets: selected.size }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/campaigns"] }); toast({ title: "Campagne enregistrée !" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const selectedClients = clients.filter((c: any) => selected.has(c.id));

  const buildWaLink = (client: any) => {
    const phone = client.customerPhone?.replace(/\D/g, "");
    let msg = message.replace("{nom}", client.customerName || "");
    if (productLink) msg += `\n\n🔗 ${productLink}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const sendAll = () => {
    if (selected.size === 0) { toast({ title: "Sélectionnez des clients", variant: "destructive" }); return; }
    selectedClients.forEach((c, i) => {
      setTimeout(() => { window.open(buildWaLink(c), "_blank", "noopener"); }, i * 800);
    });
    saveCampaignMutation.mutate();
    toast({ title: `${selected.size} messages envoyés via WhatsApp !` });
  };

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-100 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-zinc-600">Cibler :</span>
        {([["delivered", "✅ Clients Livrés"], ["injoignable", "📵 Injoignables"]] as const).map(([val, lbl]) => (
          <button key={val} onClick={() => { setFilter(val); setSelected(new Set()); }}
            className={cn("px-4 py-1.5 rounded-xl text-sm font-bold transition-all", filter === val ? "text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}
            style={filter === val ? { background: NAVY } : {}}
          >{lbl}</button>
        ))}
        <span className="ml-auto text-xs text-zinc-400">{clients.length} clients trouvés</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Client list */}
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-700">Liste des clients</span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(clients.map((c: any) => c.id)))} className="text-xs text-blue-600 hover:underline">Tout sélectionner</button>
              <span className="text-zinc-300">|</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:underline">Désélectionner</button>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400"><Users className="w-8 h-8 mb-2 opacity-30" /><p className="text-sm">Aucun client trouvé</p></div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto divide-y divide-zinc-50">
              {clients.map((c: any) => (
                <label key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors", selected.has(c.id) && "bg-blue-50")} data-testid={`client-row-${c.id}`}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => {
                    const s = new Set(selected);
                    e.target.checked ? s.add(c.id) : s.delete(c.id);
                    setSelected(s);
                  }} className="rounded border-zinc-300" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{c.customerName}</p>
                    <p className="text-xs text-zinc-400">{c.customerPhone} · {c.customerCity}</p>
                  </div>
                  <a href={buildWaLink(c)} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition-colors" onClick={e => e.stopPropagation()}>
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </label>
              ))}
            </div>
          )}
          {selected.size > 0 && (
            <div className="px-4 py-2 border-t border-zinc-100 text-xs text-zinc-500">
              <strong className="text-zinc-700">{selected.size}</strong> client(s) sélectionné(s)
            </div>
          )}
        </div>

        {/* Message composer */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-4">
            <p className="text-sm font-bold text-zinc-700">Composer le message</p>
            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1 block">Nom de la campagne</label>
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Promo Novembre" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" data-testid="input-campaign-name" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1 block">Message <span className="text-zinc-400">(utilisez {"{nom}"} pour personnaliser)</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 resize-none" data-testid="input-campaign-message" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1 block">Lien produit (optionnel)</label>
              <input value={productLink} onChange={e => setProductLink(e.target.value)} placeholder="https://votre-boutique.com/produit" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" data-testid="input-product-link" />
            </div>

            {/* Preview */}
            <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.2)" }}>
              <p className="font-semibold text-green-700 mb-1">Aperçu WhatsApp :</p>
              <p className="text-zinc-600 whitespace-pre-wrap">{message.replace("{nom}", "Mohammed")}{productLink && `\n\n🔗 ${productLink}`}</p>
            </div>

            <button
              onClick={sendAll}
              disabled={selected.size === 0 || saveCampaignMutation.isPending}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, #25D366, #128C7E)` }}
              data-testid="button-send-bulk"
            >
              {saveCampaignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer via WhatsApp ({selected.size})
            </button>
          </div>

          {/* Campaign history */}
          {campaigns.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <p className="text-sm font-bold text-zinc-700 mb-3">Historique des campagnes</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {campaigns.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50">
                    <div>
                      <p className="text-xs font-semibold text-zinc-700">{c.name}</p>
                      <p className="text-[11px] text-zinc-400">{c.totalSent} envois · {new Date(c.createdAt).toLocaleDateString("fr-MA")}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "#25D366" }}>{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 2 — AI CONFIRMATION AGENT
════════════════════════════════════════════════════════════════ */
function AiConfirmationTab() {
  const { toast } = useToast();
  const [aiMsgMap, setAiMsgMap] = useState<Record<number, string>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/automation/ai-settings"],
    queryFn: () => fetch("/api/automation/ai-settings", { credentials: "include" }).then(r => r.json()),
  });

  const { data: nouveauOrders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery<any[]>({
    queryKey: ["/api/automation/nouveau-orders"],
    queryFn: () => fetch("/api/automation/nouveau-orders", { credentials: "include" }).then(r => r.json()),
  });

  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const { data: aiLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/automation/ai-logs"],
    queryFn: () => fetch("/api/automation/ai-logs", { credentials: "include" }).then(r => r.json()),
  });

  const [localSettings, setLocalSettings] = useState<any>(null);
  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
      if (settings.aiModel) setSelectedModel(settings.aiModel);
    }
  }, [settings]);

  const [orKeyInput, setOrKeyInput] = useState("");
  const [showOrKey, setShowOrKey] = useState(false);
  const [clearingOrKey, setClearingOrKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-4o-mini");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/automation/ai-settings", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/ai-settings"] }); toast({ title: "Paramètres IA sauvegardés !" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async (orderId: number) => {
      setLoadingId(orderId);
      const res = await fetch("/api/automation/ai-generate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setAiMsgMap(prev => ({ ...prev, [data.orderId]: data.message }));
      setLoadingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/automation/ai-logs"] });
    },
    onError: (e: any) => { setLoadingId(null); toast({ title: "Erreur IA", description: e.message, variant: "destructive" }); },
  });

  const confirmMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/automation/ai-confirm/${orderId}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { refetchOrders(); queryClient.invalidateQueries({ queryKey: ["/api/automation/ai-logs"] }); toast({ title: "Commande confirmée !" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const s = localSettings ?? settings;

  const hasOrKey = s?.hasOpenRouterKey;

  const MODEL_OPTIONS = [
    { value: "openai/gpt-4o-mini",          label: "GPT-4o Mini",       badge: "Rapide & économique" },
    { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", badge: "Meilleure qualité" },
    { value: "deepseek/deepseek-chat",      label: "DeepSeek Chat",     badge: "Excellent Darija" },
  ];
  const currentModel = MODEL_OPTIONS.find(m => m.value === selectedModel) ?? MODEL_OPTIONS[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Config panel */}
        <div className="space-y-4">

          {/* ── Paramètres AI — OpenRouter ───────────────── */}
          <div className="bg-white rounded-2xl border-2 p-5 space-y-4" style={{ borderColor: hasOrKey ? "rgba(34,197,94,0.3)" : "rgba(197,160,89,0.35)" }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}>
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-800">Paramètres AI — OpenRouter</p>
                  <p className="text-xs text-zinc-400">Clé API + modèle pour votre magasin</p>
                </div>
              </div>
              {hasOrKey ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                  <Check className="w-3 h-3" /> Clé configurée
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  <AlertCircle className="w-3 h-3" /> Clé manquante
                </div>
              )}
            </div>

            {/* Warning banner when no key */}
            {!hasOrKey && (
              <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-600 font-medium">
                  Configurez votre clé API OpenRouter pour activer la confirmation automatique en Darija.
                </p>
              </div>
            )}

            {/* OpenRouter API Key input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-600 block">
                {hasOrKey ? "Remplacer la clé OpenRouter" : "Clé API OpenRouter"}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOrKey ? "text" : "password"}
                    placeholder={hasOrKey ? "sk-or-••••••••••••••••••••" : "sk-or-v1-..."}
                    value={orKeyInput}
                    onChange={e => setOrKeyInput(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 font-mono pr-10"
                    data-testid="input-openrouter-api-key"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    onClick={() => setShowOrKey(!showOrKey)}
                  >
                    {showOrKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!orKeyInput.trim()) {
                      toast({ title: "Clé vide", description: "Entrez une clé OpenRouter valide", variant: "destructive" });
                      return;
                    }
                    if (!orKeyInput.startsWith("sk-")) {
                      toast({ title: "Format invalide", description: "La clé OpenRouter doit commencer par sk-", variant: "destructive" });
                      return;
                    }
                    await saveSettingsMutation.mutateAsync({ ...s, openrouterApiKey: orKeyInput, aiModel: selectedModel });
                    setOrKeyInput("");
                  }}
                  disabled={saveSettingsMutation.isPending || !orKeyInput.trim()}
                  className="px-4 py-2 rounded-xl text-white text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}
                  data-testid="button-save-openrouter-key"
                >
                  {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sauvegarder"}
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                🔒 Stockée de façon sécurisée, isolée par magasin. Obtenez votre clé sur{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline text-violet-500">openrouter.ai/keys</a>
              </p>
            </div>

            {/* Model selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-600 block">Choisir le Modèle</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="w-full flex items-center justify-between border border-zinc-200 rounded-xl px-4 py-2.5 text-sm bg-white hover:border-violet-300 transition-colors"
                  data-testid="select-ai-model"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-800">{currentModel.label}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">{currentModel.badge}</span>
                  </div>
                  <svg className={cn("w-4 h-4 text-zinc-400 transition-transform", showModelDropdown && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showModelDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {MODEL_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={async () => {
                          setSelectedModel(opt.value);
                          setShowModelDropdown(false);
                          await saveSettingsMutation.mutateAsync({ ...s, aiModel: opt.value });
                          toast({ title: `Modèle changé : ${opt.label}` });
                        }}
                        className={cn("w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-violet-50 transition-colors text-left", selectedModel === opt.value && "bg-violet-50")}
                        data-testid={`model-option-${opt.value}`}
                      >
                        <div className="flex items-center gap-2">
                          {selectedModel === opt.value && <Check className="w-3.5 h-3.5 text-violet-600" />}
                          {selectedModel !== opt.value && <span className="w-3.5 h-3.5" />}
                          <span className={cn("font-medium", selectedModel === opt.value ? "text-violet-700" : "text-zinc-700")}>{opt.label}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">{opt.badge}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Clear key */}
            {hasOrKey && (
              <button
                onClick={async () => {
                  setClearingOrKey(true);
                  try {
                    await saveSettingsMutation.mutateAsync({ ...s, openrouterApiKey: "" });
                    toast({ title: "Clé supprimée", description: "La clé OpenRouter a été retirée de votre magasin." });
                  } finally { setClearingOrKey(false); }
                }}
                disabled={clearingOrKey || saveSettingsMutation.isPending}
                className="text-xs text-red-500 hover:text-red-700 underline transition-colors"
                data-testid="button-clear-openrouter-key"
              >
                {clearingOrKey ? "Suppression..." : "Supprimer la clé OpenRouter"}
              </button>
            )}
          </div>

          {/* AI Toggle */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}>
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-800">Agent IA — {currentModel.label}</p>
                  <p className="text-xs text-zinc-400">Confirmation automatique en Darija</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const updated = { ...s, enabled: s?.enabled ? 0 : 1 };
                  setLocalSettings(updated);
                  saveSettingsMutation.mutate(updated);
                }}
                className={cn("relative w-12 h-6 rounded-full transition-all", s?.enabled ? "" : "bg-zinc-200")}
                style={s?.enabled ? { background: GOLD } : {}}
                data-testid="toggle-ai-enabled"
              >
                <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all", s?.enabled ? "left-6" : "left-0.5")} />
              </button>
            </div>

            <div className="rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: s?.enabled ? "rgba(197,160,89,0.08)" : "rgba(239,68,68,0.05)", border: `1px solid ${s?.enabled ? "rgba(197,160,89,0.2)" : "rgba(239,68,68,0.15)"}` }}>
              {s?.enabled ? <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: GOLD }} /> : <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
              <p className={s?.enabled ? "text-amber-700" : "text-red-500"}>
                {s?.enabled ? "L'agent IA est actif. Il génère des messages de confirmation en Darija pour les nouvelles commandes." : "L'agent IA est désactivé. Activez-le pour la confirmation automatique."}
              </p>
            </div>
          </div>

          {/* Products selector */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <p className="text-sm font-bold text-zinc-700 mb-3">Produits activés pour l'IA</p>
            {products.length === 0 ? (
              <p className="text-xs text-zinc-400">Aucun produit trouvé.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {products.map((p: any) => {
                  const enabled = (s?.enabledProductIds ?? []).includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-3 cursor-pointer" data-testid={`product-toggle-${p.id}`}>
                      <input type="checkbox" checked={enabled} onChange={() => {
                        const ids: number[] = s?.enabledProductIds ?? [];
                        const next = enabled ? ids.filter((x: number) => x !== p.id) : [...ids, p.id];
                        const updated = { ...s, enabledProductIds: next };
                        setLocalSettings(updated);
                      }} className="rounded border-zinc-300" />
                      <span className="text-sm text-zinc-700">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <button onClick={() => saveSettingsMutation.mutate(localSettings)} disabled={saveSettingsMutation.isPending} className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90" style={{ background: NAVY }} data-testid="button-save-products">
              {saveSettingsMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>

          {/* System prompt */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <p className="text-sm font-bold text-zinc-700 mb-2">Prompt Système (Darija)</p>
            <textarea
              value={s?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT}
              onChange={e => setLocalSettings({ ...s, systemPrompt: e.target.value })}
              rows={6}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 resize-none font-mono"
              dir="rtl"
              data-testid="textarea-system-prompt"
            />
            <button onClick={() => saveSettingsMutation.mutate(localSettings)} disabled={saveSettingsMutation.isPending} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90" style={{ background: NAVY }}>
              {saveSettingsMutation.isPending ? "..." : "Sauvegarder le prompt"}
            </button>
          </div>
        </div>

        {/* Recent AI logs */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <p className="text-sm font-bold text-zinc-700 mb-3">Journal IA récent</p>
          {aiLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
              <MessageCircle className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">Aucune conversation IA pour l'instant.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {[...aiLogs].reverse().slice(0, 20).map((log: any) => (
                <div key={log.id} className={cn("rounded-xl p-3 text-xs", log.role === "assistant" ? "bg-blue-50 border border-blue-100" : log.role === "system" ? "bg-green-50 border border-green-100" : "bg-zinc-50 border border-zinc-100")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("font-bold capitalize", log.role === "assistant" ? "text-blue-600" : log.role === "system" ? "text-green-600" : "text-zinc-500")}>{log.role}</span>
                    {log.orderId && <span className="text-zinc-400">Cmd #{log.orderId}</span>}
                  </div>
                  <p className="text-zinc-600 whitespace-pre-wrap" dir={log.role === "assistant" ? "rtl" : "ltr"}>{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nouveau orders list */}
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-bold text-zinc-700">Commandes Nouvelles ({nouveauOrders.length})</span>
          </div>
          <button onClick={() => refetchOrders()} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors" data-testid="button-refresh-orders">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        {ordersLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
        ) : nouveauOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-400"><CheckCircle2 className="w-8 h-8 mb-2 opacity-20" /><p className="text-sm">Aucune commande nouvelle en attente.</p></div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {nouveauOrders.map((order: any) => (
              <div key={order.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ background: NAVY }}>
                    #{order.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-zinc-800">{order.customerName}</p>
                      <span className="text-xs text-zinc-400">{order.customerPhone}</span>
                      <span className="text-xs text-zinc-400">· {order.customerCity}</span>
                    </div>
                    {aiMsgMap[order.id] && (
                      <div className="mt-2 rounded-xl p-3 text-xs" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                        <p className="font-semibold text-blue-600 mb-1">Message IA généré :</p>
                        <p className="text-zinc-600 whitespace-pre-wrap" dir="rtl">{aiMsgMap[order.id]}</p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { navigator.clipboard.writeText(aiMsgMap[order.id]); }} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors">
                            <Copy className="w-3 h-3" /> Copier
                          </button>
                          <a href={`https://wa.me/${order.customerPhone?.replace(/\D/g, "")}?text=${encodeURIComponent(aiMsgMap[order.id])}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-800 transition-colors">
                            <MessageCircle className="w-3 h-3" /> Envoyer WA
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => generateMutation.mutate(order.id)}
                      disabled={loadingId === order.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}
                      data-testid={`button-generate-ai-${order.id}`}
                    >
                      {loadingId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                      Générer IA
                    </button>
                    <button
                      onClick={() => confirmMutation.mutate(order.id)}
                      disabled={confirmMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: "#22c55e" }}
                      data-testid={`button-confirm-order-${order.id}`}
                    >
                      <Check className="w-3 h-3" /> Confirmer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 3 — WHATSAPP CONNECTION (Green API — no Puppeteer)
════════════════════════════════════════════════════════════════ */
function WhatsappTab() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhooks/whatsapp-incoming`;

  /* ── Poll Green API connection status every 5 s ─────────────── */
  const statusQuery = useQuery<{ status: string }>({
    queryKey: ["/api/automation/whatsapp/green-status"],
    queryFn: () => fetch("/api/automation/whatsapp/green-status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 5000,
  });

  /* ── Fetch QR from Green API — only when notAuthorized ─────── */
  const qrQuery = useQuery<{ qrCode: string | null }>({
    queryKey: ["/api/automation/whatsapp/green-qr"],
    queryFn: () => fetch("/api/automation/whatsapp/green-qr", { credentials: "include" }).then(r => r.json()),
    enabled: statusQuery.data?.status === "notAuthorized",
    refetchInterval: 30000,
  });

  const apiStatus = statusQuery.data?.status ?? "loading";
  const qrBase64 = qrQuery.data?.qrCode ?? null;

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "URL copiée !" });
  }

  /* ── Render: NOT CONFIGURED ─────────────────────────────────── */
  if (apiStatus === "not_configured" || apiStatus === "loading") {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        {/* Status banner */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "3px solid #ef4444" }}>
            {apiStatus === "loading" ? <Loader2 className="w-9 h-9 animate-spin text-zinc-400" /> : <Wifi className="w-9 h-9 text-red-400" />}
          </div>
          <h2 className="text-lg font-bold text-zinc-800 mb-1">
            {apiStatus === "loading" ? "Vérification..." : "Green API non configuré"}
          </h2>
          <p className="text-sm text-zinc-400">
            {apiStatus === "loading"
              ? "Connexion à Green API en cours..."
              : "Ajoutez vos identifiants Green API dans les Secrets Replit pour activer l'envoi WhatsApp automatique."}
          </p>
        </div>

        {apiStatus === "not_configured" && (
          <>
            {/* Setup Steps */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-sm font-bold text-zinc-700 mb-4">Configuration Green API — 4 étapes</p>
              <div className="space-y-4">
                {[
                  {
                    step: "1",
                    title: "Créer un compte Green API",
                    desc: "Rendez-vous sur green-api.com et créez un compte gratuit (500 messages/mois inclus).",
                    link: "https://green-api.com",
                    linkLabel: "Ouvrir green-api.com →",
                  },
                  {
                    step: "2",
                    title: "Créer une instance WhatsApp",
                    desc: "Dans le tableau de bord Green API, cliquez sur « Créer une instance ». Choisissez le plan gratuit ou payant.",
                    link: null,
                    linkLabel: null,
                  },
                  {
                    step: "3",
                    title: "Copier vos identifiants",
                    desc: "Sur la page de votre instance, copiez le « idInstance » (ex: 7103123456) et le « apiTokenInstance ».",
                    link: null,
                    linkLabel: null,
                  },
                  {
                    step: "4",
                    title: "Ajouter dans les Secrets Replit",
                    desc: "Dans Replit, allez dans Secrets (icône cadenas) et ajoutez : GREENAPI_INSTANCE_ID et GREENAPI_API_TOKEN, puis redémarrez l'application.",
                    link: null,
                    linkLabel: null,
                  },
                ].map(({ step, title, desc, link, linkLabel }) => (
                  <div key={step} className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5" style={{ background: NAVY }}>{step}</div>
                    <div>
                      <p className="text-xs font-bold text-zinc-700">{title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold mt-1 inline-block" style={{ color: GOLD }}>{linkLabel}</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Secrets to add */}
              <div className="mt-5 rounded-xl p-4 space-y-2" style={{ background: "rgba(30,27,75,0.04)", border: `1px solid rgba(30,27,75,0.12)` }}>
                <p className="text-xs font-bold text-zinc-700 mb-2">Secrets à ajouter dans Replit :</p>
                {[
                  { key: "GREENAPI_INSTANCE_ID", example: "ex: 7103123456" },
                  { key: "GREENAPI_API_TOKEN", example: "ex: abc123xyz..." },
                ].map(({ key, example }) => (
                  <div key={key} className="flex items-center gap-2">
                    <code className="text-xs font-mono px-2 py-1 rounded-lg font-bold" style={{ background: "rgba(30,27,75,0.08)", color: NAVY }}>{key}</code>
                    <span className="text-xs text-zinc-400">{example}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Webhook URL */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-bold text-zinc-700 mb-2">URL Webhook à configurer dans Green API</p>
              <p className="text-xs text-zinc-400 mb-3">Dans votre tableau de bord Green API → Paramètres de l'instance → Webhook URL :</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono px-3 py-2 rounded-xl truncate" style={{ background: "rgba(30,27,75,0.05)", color: NAVY, border: "1px solid rgba(30,27,75,0.1)" }}>
                  {webhookUrl}
                </code>
                <button onClick={copyWebhook} className="shrink-0 p-2 rounded-xl border transition-colors hover:bg-zinc-50" style={{ borderColor: "rgba(30,27,75,0.15)" }} data-testid="button-copy-webhook-wa">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── Render: NEEDS QR SCAN ──────────────────────────────────── */
  if (apiStatus === "notAuthorized") {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(197,160,89,0.1)", border: `3px solid ${GOLD}` }}>
            <Wifi className="w-9 h-9" style={{ color: GOLD }} />
          </div>
          <h2 className="text-lg font-bold text-zinc-800 mb-1">Scanner le QR Code</h2>
          <p className="text-sm text-zinc-400 mb-5">Green API est configuré. Scannez ce QR avec WhatsApp pour connecter votre numéro.</p>

          {/* Real QR from Green API */}
          <div className="flex flex-col items-center gap-4 my-4">
            {qrQuery.isLoading ? (
              <div className="w-[220px] h-[220px] flex items-center justify-center rounded-2xl border-2 border-zinc-100">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
              </div>
            ) : qrBase64 ? (
              <div className="p-3 bg-white rounded-2xl shadow-lg border-2 border-zinc-100" data-testid="img-whatsapp-qr">
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="QR Code WhatsApp"
                  width={220}
                  height={220}
                  className="rounded-xl"
                />
              </div>
            ) : (
              <div className="w-[220px] h-[220px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200">
                <Wifi className="w-8 h-8 text-zinc-300" />
                <p className="text-xs text-zinc-400 text-center px-4">QR non disponible.<br />Vérifiez que votre instance Green API est active.</p>
              </div>
            )}

            <div className="space-y-1 text-center">
              <p className="text-xs font-semibold text-zinc-600">Ouvrez WhatsApp → Paramètres → Appareils connectés → Scanner</p>
              <p className="text-xs text-zinc-400">Le QR expire toutes les 30 secondes — il se rafraîchit automatiquement.</p>
            </div>

            <button
              onClick={() => { statusQuery.refetch(); qrQuery.refetch(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-500 border border-zinc-200 hover:bg-zinc-50 transition-colors"
              data-testid="button-refresh-qr"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir le QR
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-500" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-semibold text-zinc-700 mb-1">Comment scanner ?</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Ouvrez WhatsApp sur votre téléphone</li>
            <li>Allez dans <strong>Paramètres → Appareils connectés</strong></li>
            <li>Appuyez sur <strong>Ajouter un appareil</strong></li>
            <li>Pointez l'appareil photo sur le QR ci-dessus</li>
          </ol>
        </div>
      </div>
    );
  }

  /* ── Render: CONNECTED ──────────────────────────────────────── */
  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(34,197,94,0.1)", border: "3px solid #22c55e" }}>
          <Wifi className="w-9 h-9 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-zinc-800 mb-1">WhatsApp Connecté ✅</h2>
        <p className="text-sm text-zinc-400 mb-4">Votre numéro WhatsApp est lié à Green API. L'envoi automatique est actif.</p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-green-700 mb-5" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }} data-testid="status-wa-connected">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Actif — Messages envoyés automatiquement
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => statusQuery.refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-500 border border-zinc-200 hover:bg-zinc-50 transition-colors"
            data-testid="button-refresh-status"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Vérifier le statut
          </button>
        </div>
      </div>

      {/* Webhook URL reminder */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-4">
        <p className="text-xs font-bold text-zinc-700 mb-2">Webhook configuré dans Green API</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono px-3 py-2 rounded-xl truncate" style={{ background: "rgba(30,27,75,0.05)", color: NAVY, border: "1px solid rgba(30,27,75,0.1)" }}>
            {webhookUrl}
          </code>
          <button onClick={copyWebhook} className="shrink-0 p-2 rounded-xl border transition-colors hover:bg-zinc-50" style={{ borderColor: "rgba(30,27,75,0.15)" }} data-testid="button-copy-webhook-connected">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-2">Si vous recevez des messages entrants dans le Live Monitoring, ce webhook est bien actif.</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 4 — LIVE MONITORING
════════════════════════════════════════════════════════════════ */
function LiveMonitoringTab() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [manualMsg, setManualMsg] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [typingConvId, setTypingConvId] = useState<number | null>(null);
  const [attentionIds, setAttentionIds] = useState<Set<number>>(new Set());
  const messagesEndRef = { current: null as HTMLDivElement | null };

  /* ── Request browser notification permission ────────────────── */
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /* ── Poll Green API status every 60s — browser notify on disconnect ── */
  useEffect(() => {
    let lastStatus: string | null = null;
    const check = async () => {
      try {
        const r = await fetch("/api/automation/whatsapp/green-status", { credentials: "include" });
        const { status } = await r.json();
        if (lastStatus === "authorized" && status !== "authorized") {
          toast({ title: "⚠️ WhatsApp Déconnecté", description: "La connexion WhatsApp a été perdue. Reconnectez depuis l'onglet WhatsApp.", variant: "destructive" });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("TajerGrow — WhatsApp Déconnecté", {
              body: "La connexion WhatsApp est perdue. Reconnectez-vous pour continuer.",
              icon: "/favicon.ico",
            });
          }
        }
        lastStatus = status;
      } catch {}
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  /* ── Poll conversations list ────────────────────────────────── */
  const { data: conversations = [], refetch: refetchConvs } = useQuery<any[]>({
    queryKey: ["/api/automation/conversations"],
    queryFn: () => fetch("/api/automation/conversations", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 8000,
  });

  // Sync attention state from server data on load
  useEffect(() => {
    if (conversations.length > 0) {
      const ids = new Set<number>(conversations.filter((c: any) => c.needsAttention).map((c: any) => c.id as number));
      setAttentionIds(ids);
    }
  }, [conversations]);

  /* ── Load messages for selected conversation ────────────────── */
  const { data: historyMsgs = [] } = useQuery<any[]>({
    queryKey: ["/api/automation/conversations", selectedId, "messages"],
    queryFn: () => fetch(`/api/automation/conversations/${selectedId}/messages`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedId,
  });

  /* ── Load order context (product + stock) for selected conv ─── */
  const { data: convCtx } = useQuery<any>({
    queryKey: ["/api/automation/conversations", selectedId, "context"],
    queryFn: () => fetch(`/api/automation/conversations/${selectedId}/context`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (historyMsgs.length > 0) {
      setMessages(historyMsgs.map((l: any) => ({ role: l.role, content: l.message, ts: new Date(l.createdAt).getTime() })));
    }
  }, [historyMsgs]);

  /* ── SSE connection ─────────────────────────────────────────── */
  useEffect(() => {
    const es = new EventSource("/api/automation/events", { withCredentials: true });

    es.addEventListener("new_conversation", () => {
      refetchConvs();
    });

    es.addEventListener("message", (e) => {
      const data = JSON.parse(e.data);
      if (data.conversationId === selectedId || !selectedId) {
        setMessages(prev => [...prev, { role: data.role, content: data.content, ts: data.ts }]);
        if (data.conversationId !== selectedId) refetchConvs();
      }
    });

    es.addEventListener("confirmed", (e) => {
      const data = JSON.parse(e.data);
      refetchConvs();
      if (data.conversationId === selectedId) {
        setMessages(prev => [...prev, { role: "system", content: "✅ Commande confirmée automatiquement", ts: data.ts }]);
      }
    });

    es.addEventListener("cancelled", (e) => {
      const data = JSON.parse(e.data);
      refetchConvs();
      if (data.conversationId === selectedId) {
        setMessages(prev => [...prev, { role: "system", content: "❌ Commande annulée", ts: data.ts }]);
      }
    });

    es.addEventListener("takeover", (e) => {
      const data = JSON.parse(e.data);
      if (data.conversationId === selectedId) refetchConvs();
    });

    es.addEventListener("typing", (e) => {
      const data = JSON.parse(e.data);
      setTypingConvId(data.conversationId);
    });

    es.addEventListener("typing_stop", (e) => {
      const data = JSON.parse(e.data);
      setTypingConvId((prev) => (prev === data.conversationId ? null : prev));
    });

    es.addEventListener("ai_error", (e) => {
      const data = JSON.parse(e.data);
      setTypingConvId((prev) => (prev === data.conversationId ? null : prev));
      if (data.conversationId === selectedId) {
        toast({ title: "Erreur IA", description: data.error, variant: "destructive" });
      }
    });

    es.addEventListener("needs_attention", (e) => {
      const data = JSON.parse(e.data);
      setAttentionIds(prev => new Set([...prev, data.conversationId]));
      refetchConvs();
      toast({
        title: "🔴 Attention Requise",
        description: "Un client demande à parler à un humain.",
        variant: "destructive",
      });
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("TajerGrow — Client demande assistance", {
          body: "Un client a besoin d'un agent humain.",
          icon: "/favicon.ico",
        });
      }
    });

    return () => es.close();
  }, [selectedId]);

  /* ── Scroll to bottom when messages or typing changes ──────── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingConvId]);

  const selectedConv = conversations.find((c: any) => c.id === selectedId);

  /* ── Mutations ──────────────────────────────────────────────── */
  const takeoverMutation = useMutation({
    mutationFn: (isManual: boolean) => fetch(`/api/automation/conversations/${selectedId}/takeover`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isManual }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/conversations"] });
      // Clear attention flag when admin takes control
      if (selectedId) setAttentionIds(prev => { const n = new Set(prev); n.delete(selectedId); return n; });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (msg: string) => fetch(`/api/automation/conversations/${selectedId}/send`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    }).then(r => r.json()),
    onSuccess: () => {
      setMessages(prev => [...prev, { role: "admin", content: manualMsg, ts: Date.now() }]);
      setManualMsg("");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const triggerMutation = useMutation({
    mutationFn: (orderId: number) => fetch(`/api/automation/conversations/trigger/${orderId}`, {
      method: "POST", credentials: "include",
    }).then(r => r.json()),
    onSuccess: (_, orderId) => toast({ title: `IA déclenchée pour commande #${orderId}` }),
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const statusColor = (s: string, needsAttn?: boolean) => {
    if (needsAttn) return "#ef4444";
    if (s === "confirmed") return "#22c55e";
    if (s === "cancelled") return "#ef4444";
    if (s === "manual") return GOLD;
    return "#3b82f6";
  };

  const statusLabel = (s: string, needsAttn?: boolean) => {
    if (needsAttn) return "Attention 🔴";
    if (s === "confirmed") return "Confirmé ✅";
    if (s === "cancelled") return "Annulé ❌";
    if (s === "manual") return "Manuel 👤";
    return "En cours 🤖";
  };

  const bubbleStyle = (role: string) => {
    if (role === "user") return { background: "#f3f4f6", alignSelf: "flex-start", borderRadius: "16px 16px 16px 4px" };
    if (role === "admin") return { background: `rgba(197,160,89,0.15)`, alignSelf: "flex-end", borderRadius: "16px 16px 4px 16px", border: `1px solid rgba(197,160,89,0.3)` };
    if (role === "system") return { background: "rgba(59,130,246,0.06)", alignSelf: "center", borderRadius: "12px", border: "1px solid rgba(59,130,246,0.15)" };
    return { background: `rgba(30,27,75,0.08)`, alignSelf: "flex-end", borderRadius: "16px 16px 4px 16px" };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 h-[calc(100vh-220px)] min-h-[540px]">
      {/* ── Left: Conversation list ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-100 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-sm font-bold text-zinc-700">Conversations IA</span>
            {attentionIds.size > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                {attentionIds.size}
              </span>
            )}
          </div>
          <button onClick={() => refetchConvs()} className="p-1 rounded-lg hover:bg-zinc-100 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-400 p-4">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-xs text-center">Aucune conversation IA.<br />Créez une commande avec l'IA activée.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
            {[...conversations].sort((a: any, b: any) => (attentionIds.has(b.id) ? 1 : 0) - (attentionIds.has(a.id) ? 1 : 0)).map((conv: any) => {
              const needsAttn = attentionIds.has(conv.id);
              return (
              <button
                key={conv.id}
                onClick={() => { setSelectedId(conv.id); setMessages([]); }}
                className={cn("w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors",
                  selectedId === conv.id && "bg-blue-50",
                  needsAttn && "bg-red-50 border-l-4 border-red-400"
                )}
                data-testid={`conv-item-${conv.id}`}
              >
                <div className="flex items-center justify-between mb-1 gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {needsAttn ? (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Attention requise" />
                    ) : typingConvId === conv.id ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" title="IA en train d'écrire..." />
                    ) : conv.status === "active" ? (
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    ) : null}
                    <p className="text-sm font-semibold text-zinc-800 truncate">{conv.customerName || conv.customerPhone}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: statusColor(conv.status, needsAttn) }}>
                    {statusLabel(conv.status, needsAttn)}
                  </span>
                </div>
                {typingConvId === conv.id ? (
                  <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    IA en train d'écrire...
                  </p>
                ) : (
                  <p className={cn("text-xs truncate", needsAttn ? "text-red-500 font-medium" : "text-zinc-400")}>
                    {needsAttn ? "⚠️ Client demande assistance humaine" : (conv.lastMessage || "...")}
                  </p>
                )}
                <p className="text-[10px] text-zinc-300 mt-0.5">{conv.customerPhone}</p>
              </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: Chat window ────────────────────────────────── */}
      {!selectedConv ? (
        <div className="bg-white rounded-2xl border border-zinc-100 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Eye className="w-10 h-10 opacity-20" />
          <p className="text-sm">Sélectionnez une conversation pour voir le chat en temps réel</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-zinc-800">{selectedConv.customerName || selectedConv.customerPhone}</p>
                {convCtx?.productName && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(30,27,75,0.07)", color: NAVY }}>
                    {convCtx.productName}{convCtx.productVariant ? ` · ${convCtx.productVariant}` : ""}
                  </span>
                )}
                {convCtx?.stockQty !== null && convCtx?.stockQty !== undefined && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                    style={convCtx.stockQty <= 0
                      ? { background: "rgba(239,68,68,0.1)", color: "#ef4444" }
                      : convCtx.stockQty <= 5
                      ? { background: "rgba(245,158,11,0.1)", color: "#d97706" }
                      : { background: "rgba(34,197,94,0.1)", color: "#16a34a" }
                    }
                  >
                    {convCtx.stockQty <= 0 ? "⚠️ Stock épuisé" : convCtx.stockQty <= 5 ? `⚡ ${convCtx.stockQty} restants` : `✓ Stock: ${convCtx.stockQty}`}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{selectedConv.customerPhone} · Cmd #{selectedConv.orderId}{convCtx?.totalPrice ? ` · ${(convCtx.totalPrice / 100).toFixed(0)} DH` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedConv.orderId && (
                <button
                  onClick={() => triggerMutation.mutate(selectedConv.orderId)}
                  disabled={triggerMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}
                  data-testid="button-trigger-ai"
                >
                  <Play className="w-3 h-3" /> Relancer IA
                </button>
              )}
              {selectedConv.status === "active" || selectedConv.status === "manual" ? (
                <button
                  onClick={() => takeoverMutation.mutate(selectedConv.isManual ? false : true)}
                  disabled={takeoverMutation.isPending}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all")}
                  style={selectedConv.isManual
                    ? { background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }
                    : { background: `rgba(197,160,89,0.1)`, color: GOLD, border: `1px solid rgba(197,160,89,0.3)` }
                  }
                  data-testid="button-takeover"
                >
                  {selectedConv.isManual ? <><UserCheck className="w-3 h-3" /> Rendre à l'IA</> : <><UserX className="w-3 h-3" /> Prendre la main</>}
                </button>
              ) : null}
            </div>
          </div>

          {/* Status banner */}
          {selectedId && attentionIds.has(selectedId) ? (
            <div className="px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> 🔴 Client demande assistance humaine — prenez la main dès que possible.</span>
              <button
                onClick={() => { takeoverMutation.mutate(true); }}
                className="text-[10px] font-black px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors whitespace-nowrap"
              >Prendre la main</button>
            </div>
          ) : selectedConv.isManual ? (
            <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: `rgba(197,160,89,0.08)`, color: GOLD, borderBottom: `1px solid rgba(197,160,89,0.15)` }}>
              <UserX className="w-3.5 h-3.5" /> Mode manuel actif — l'IA ne répond plus. Vous contrôlez la conversation.
            </div>
          ) : typingConvId === selectedConv.id ? (
            <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(34,197,94,0.06)", color: "#16a34a", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              IA en train de rédiger une réponse en Darija...
            </div>
          ) : selectedConv.status === "active" ? (
            <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(59,130,246,0.05)", color: "#3b82f6", borderBottom: "1px solid rgba(59,130,246,0.1)" }}>
              <Bot className="w-3.5 h-3.5" /> L'IA gère cette conversation automatiquement en Darija.
            </div>
          ) : null}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-zinc-300 text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement des messages...
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className="flex flex-col max-w-[78%]" style={{ alignSelf: msg.role === "user" ? "flex-start" : "flex-end" }}>
                <div className="px-4 py-2.5 text-sm" style={bubbleStyle(msg.role)} dir={msg.role !== "user" ? "rtl" : "ltr"}>
                  {msg.content}
                </div>
                <span className="text-[10px] text-zinc-300 mt-0.5 px-1 flex items-center gap-1"
                  style={{ justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}
                >
                  {msg.role === "user" ? "Client" : msg.role === "admin" ? "Vous" : msg.role === "system" ? "Système" : "IA"}
                  {msg.role === "assistant" && msg.model && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 border border-violet-200">
                      {msg.model === "deepseek/deepseek-chat" ? "DeepSeek" : msg.model === "anthropic/claude-3.5-sonnet" ? "Claude 3.5" : "GPT-4o Mini"}
                    </span>
                  )}
                  {" · "}{new Date(msg.ts || Date.now()).toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}

            {/* ── AI Typing Bubble ─────────────────────────── */}
            {typingConvId === selectedId && (
              <div className="flex flex-col max-w-[60%]" style={{ alignSelf: "flex-end" }}>
                <div className="px-4 py-3 flex items-center gap-1.5 rounded-2xl rounded-br-sm"
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-xs text-green-600 font-medium ml-1">IA</span>
                </div>
                <span className="text-[10px] text-zinc-300 mt-0.5 px-1 text-right">en train d'écrire...</span>
              </div>
            )}

            <div ref={(el) => { messagesEndRef.current = el; }} />
          </div>

          {/* Manual message input */}
          {(selectedConv.isManual || selectedConv.status === "active") && selectedConv.status !== "confirmed" && selectedConv.status !== "cancelled" && (
            <div className="px-4 py-3 border-t border-zinc-100">
              <div className="flex gap-2">
                <input
                  value={manualMsg}
                  onChange={e => setManualMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && manualMsg.trim()) sendMutation.mutate(manualMsg); }}
                  placeholder={selectedConv.isManual ? "Écrivez votre message (vous contrôlez)..." : "L'IA répond automatiquement..."}
                  disabled={!selectedConv.isManual && selectedConv.status === "active"}
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  dir="rtl"
                  data-testid="input-manual-msg"
                />
                <button
                  onClick={() => { if (manualMsg.trim()) sendMutation.mutate(manualMsg); }}
                  disabled={!manualMsg.trim() || sendMutation.isPending || (!selectedConv.isManual && selectedConv.status === "active")}
                  className="px-4 py-2 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "#25D366" }}
                  data-testid="button-send-manual"
                >
                  {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {!selectedConv.isManual && (
                <p className="text-[11px] text-zinc-400 mt-1.5 text-center">Cliquez <strong>Prendre la main</strong> pour écrire manuellement.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 5 — RÉCUPÉRATION IA (Pro Plan Only)
════════════════════════════════════════════════════════════════ */
function RecoveryTab() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState(30);
  const [isPro, setIsPro] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading: loadingSettings } = useQuery<any>({
    queryKey: ["/api/automation/recovery-settings"],
    queryFn: async () => {
      const r = await fetch("/api/automation/recovery-settings", { credentials: "include" });
      if (r.status === 403) { setIsPro(false); return null; }
      setIsPro(true);
      return r.json();
    },
    retry: false,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<any>({
    queryKey: ["/api/automation/recovery-stats"],
    queryFn: async () => {
      const r = await fetch("/api/automation/recovery-stats", { credentials: "include" });
      if (!r.ok) return { total: 0, recovered: 0, revenueRecovered: 0 };
      return r.json();
    },
    refetchInterval: 60000,
    enabled: isPro,
  });

  const { data: sub } = useQuery<any>({ queryKey: ["/api/subscription"] });
  const webhookKey = useQuery<any>({ queryKey: ["/api/store"] }).data?.webhookKey;

  useEffect(() => {
    if (settings) {
      setEnabled(!!settings.enabled);
      setWaitMinutes(settings.waitMinutes ?? 30);
    }
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/automation/recovery-settings", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, waitMinutes }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      queryClient.invalidateQueries({ queryKey: ["/api/automation/recovery-settings"] });
      toast({ title: enabled ? "Récupération activée ✅" : "Récupération désactivée", description: `Délai d'attente: ${waitMinutes} minutes` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${GOLD}, #d4aa60)` }}>
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Fonctionnalité Pro</h2>
        <p className="text-zinc-500 max-w-md mb-6">
          Le système de Récupération IA est réservé aux abonnés du plan Pro. Passez au Pro pour récupérer automatiquement vos leads abandonnés et augmenter votre CA pendant que vous dormez.
        </p>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 max-w-sm w-full mb-6">
          <div className="text-3xl font-bold mb-1" style={{ color: GOLD }}>400 DH<span className="text-sm font-normal text-zinc-400">/mois</span></div>
          <div className="text-sm text-zinc-500 mb-4">Plan Pro — Commandes illimitées</div>
          <ul className="text-left space-y-2 text-sm text-zinc-600">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Récupération IA abandonnés</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Commandes illimitées</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Toutes les fonctionnalités IA</li>
          </ul>
        </div>
        <p className="text-xs text-zinc-400">Contactez le Super Admin pour upgrader votre plan.</p>
      </div>
    );
  }

  const statCards = [
    { label: "Leads Abandonnés", value: stats?.total ?? 0, icon: <ShoppingCart className="w-5 h-5" />, color: "#6366f1" },
    { label: "Leads Récupérés", value: stats?.recovered ?? 0, icon: <TrendingUp className="w-5 h-5" />, color: "#22c55e" },
    { label: "CA Récupéré", value: `${((stats?.revenueRecovered ?? 0) / 100).toFixed(0)} DH`, icon: <DollarSign className="w-5 h-5" />, color: GOLD },
  ];

  const recoveryRate = stats?.total > 0 ? Math.round((stats.recovered / stats.total) * 100) : 0;

  const currentHost = window.location.origin;
  const abandonedWebhookUrl = webhookKey ? `${currentHost}/api/webhooks/abandoned-checkout/${webhookKey}` : "...en chargement";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-500 font-medium">{c.label}</span>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: c.color }}>
                {c.icon}
              </div>
            </div>
            <div className="text-3xl font-bold" style={{ color: c.color }}>
              {loadingStats ? <Loader2 className="w-6 h-6 animate-spin" /> : c.value}
            </div>
            {c.label === "Leads Récupérés" && (
              <div className="mt-2">
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${recoveryRate}%`, background: "#22c55e" }} />
                </div>
                <span className="text-xs text-zinc-400 mt-1">{recoveryRate}% taux de récupération</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Money Machine Card */}
      {stats?.revenueRecovered > 0 && (
        <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <div className="font-bold text-lg">TajerGrow a récupéré <span style={{ color: GOLD }}>{((stats.revenueRecovered) / 100).toFixed(0)} DH</span> pour vous 💰</div>
              <div className="text-white/60 text-sm">pendant que vous dormiez — l'IA travaille 24h/24</div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
        <h3 className="text-base font-bold mb-5" style={{ color: NAVY }}>Configuration de la Récupération Automatique</h3>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: enabled ? "#22c55e" : "#e4e4e7" }}>
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-zinc-800">Activer la récupération automatique</div>
              <div className="text-xs text-zinc-400">L'IA contacte les leads abandonnés par WhatsApp</div>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={cn("relative w-12 h-6 rounded-full transition-all", enabled ? "bg-green-500" : "bg-zinc-300")}
            data-testid="toggle-recovery-enabled"
          >
            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", enabled ? "left-6" : "left-0.5")} />
          </button>
        </div>

        {/* Wait Time */}
        <div className="p-4 rounded-xl bg-zinc-50 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-4 h-4 text-zinc-500" />
            <span className="text-sm font-semibold text-zinc-700">Délai avant contact</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[15, 30, 60, 120].map(m => (
              <button
                key={m}
                onClick={() => setWaitMinutes(m)}
                className={cn("py-2 rounded-xl text-sm font-bold border-2 transition-all", waitMinutes === m ? "text-white border-transparent" : "text-zinc-500 border-zinc-200 bg-white hover:border-zinc-300")}
                style={waitMinutes === m ? { background: `linear-gradient(135deg, ${GOLD}, #d4aa60)`, borderColor: "transparent" } : {}}
                data-testid={`btn-wait-${m}`}
              >
                {m < 60 ? `${m} min` : `${m / 60}h`}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2">L'IA attend {waitMinutes} minutes après l'abandon avant d'envoyer le premier message.</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}
          data-testid="button-save-recovery"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Enregistrer les paramètres
        </button>
      </div>

      {/* Webhook Setup Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
        <h3 className="text-base font-bold mb-1" style={{ color: NAVY }}>Webhook d'Abandon (Shopify / YouCan)</h3>
        <p className="text-sm text-zinc-500 mb-4">Configurez cette URL dans Shopify → Paramètres → Notifications → Webhooks → Paiements abandonnés</p>
        <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
          <code className="text-xs text-zinc-700 flex-1 break-all">{abandonedWebhookUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(abandonedWebhookUrl); toast({ title: "URL copiée !" }); }}
            className="shrink-0 p-2 rounded-lg hover:bg-zinc-200 transition-colors"
            data-testid="button-copy-webhook"
          >
            <Copy className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
        <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(197, 160, 89, 0.08)", border: "1px solid rgba(197, 160, 89, 0.2)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: GOLD }}>Comment ça marche:</p>
          <ol className="text-xs text-zinc-600 space-y-1">
            <li>1. Un client remplit son numéro mais ne finalise pas l'achat</li>
            <li>2. Shopify envoie les données à TajerGrow via ce webhook</li>
            <li>3. Après {waitMinutes} min, l'IA envoie un message WhatsApp en Darija</li>
            <li>4. L'IA répond aux objections et guide le client vers la confirmation</li>
            <li>5. Le statut passe à "Confirmé" et votre dashboard se met à jour ✅</li>
          </ol>
        </div>
      </div>

      {/* Recovery Message Preview */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
        <h3 className="text-base font-bold mb-4" style={{ color: NAVY }}>Aperçu du Message de Récupération</h3>
        <div className="bg-[#ECE5DD] rounded-2xl p-4">
          <div className="max-w-xs bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm text-sm" dir="rtl" style={{ fontFamily: "sans-serif" }}>
            السلام عليكم سيدي/لالة، شلنا باللي كنتي باغي تاخد "Nom_Produit" ولكن وقع شي مشكل؟
            <br />واش عندك شي تساؤل نقدر نجاوبك عليه؟ راه بقى لينا غير 5 حبات فـ السطوك. 🛍️
            <div className="text-[10px] text-zinc-400 mt-1 text-left">IA · TajerGrow</div>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-3">Le message est envoyé automatiquement. L'IA répond ensuite aux questions du client en Darija marocaine.</p>
      </div>
    </div>
  );
}

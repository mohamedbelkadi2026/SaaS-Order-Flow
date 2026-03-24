import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Megaphone, Wifi, Check, X, Copy, Send, Loader2, RefreshCw, Phone,
  MessageCircle, Zap, Users, Clock, CheckCircle2, AlertCircle, Eye, EyeOff,
  Radio, UserCheck, UserX, Play, TrendingUp, ShoppingCart, DollarSign, Timer,
  Lock, ChevronDown, Pause, Square, Package, Target, BarChart3, CheckSquare,
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
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {tab === "retargeting" && <RetargetingTab />}
        {tab === "ai" && <AiConfirmationTab />}
        {tab === "whatsapp" && <WhatsappTab />}
        {tab === "monitoring" && <LiveMonitoringTab />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TAB 1 — RETARGETING (Bulk WhatsApp via Baileys, anti-ban queue)
════════════════════════════════════════════════════════════════ */
function RetargetingTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"delivered" | "injoignable">("delivered");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("مرحبا *{Nom_Client}*، عندنا عرض خاص ليك اليوم على *{Dernier_Produit}* 🎁");
  const [productLink, setProductLink] = useState("");
  const [campaignName, setCampaignName] = useState("");

  // Live campaign progress state
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number; status: string; currentIndex: number } | null>(null);

  const { data: clientsRaw, isLoading } = useQuery<any>({
    queryKey: ["/api/automation/clients", filter],
    queryFn: () => fetch(`/api/automation/clients?status=${filter}`, { credentials: "include" }).then(r => r.json()),
  });
  const clients: any[] = Array.isArray(clientsRaw) ? clientsRaw : [];

  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery<any[]>({ queryKey: ["/api/automation/campaigns"] });

  /* ── On mount: check if there's already a running campaign ─── */
  useEffect(() => {
    fetch("/api/automation/retargeting/active", { credentials: "include" })
      .then(r => r.json())
      .then((runs: any[]) => {
        if (runs.length > 0) {
          const run = runs[0];
          setActiveCampaignId(run.campaignId);
          setProgress({ sent: run.sent, failed: run.failed, total: run.total, status: run.status, currentIndex: run.currentIndex });
        }
      }).catch(() => {});
  }, []);

  /* ── SSE listener for campaign progress ─────────────────────── */
  useEffect(() => {
    const es = new EventSource("/api/automation/events", { withCredentials: true });
    es.addEventListener("campaign_progress", (e) => {
      const data = JSON.parse(e.data);
      if (!activeCampaignId || data.campaignId === activeCampaignId) {
        setActiveCampaignId(data.campaignId);
        setProgress({ sent: data.sent, failed: data.failed, total: data.total, status: data.status, currentIndex: data.currentIndex });
        if (data.status === "completed" || data.status === "stopped") {
          refetchCampaigns();
          setTimeout(() => { setActiveCampaignId(null); setProgress(null); }, 3000);
        }
      }
    });
    return () => es.close();
  }, [activeCampaignId]);

  /* ── Select all/none helpers ─────────────────────────────────── */
  const allSelected = clients.length > 0 && clients.every((c: any) => selected.has(c.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(clients.map((c: any) => c.id)));
  };
  const toggleOne = (id: number, checked: boolean) => {
    const s = new Set(selected);
    checked ? s.add(id) : s.delete(id);
    setSelected(s);
  };

  /* ── Variable insertion ──────────────────────────────────────── */
  const insertVar = (v: string) => setMessage(prev => prev + v);

  /* ── Launch campaign ─────────────────────────────────────────── */
  const launchMutation = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error("Sélectionnez au moins un client.");
      const selectedClients = clients.filter((c: any) => selected.has(c.id));
      const recipients = selectedClients.map((c: any) => ({
        phone: c.customerPhone,
        name: c.customerName || "",
        lastProduct: c.lastProductName || "",
      }));
      const res = await fetch("/api/automation/retargeting/send", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName || `Campagne ${new Date().toLocaleDateString("fr-MA")}`,
          message, productLink, targetFilter: filter, recipients,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setActiveCampaignId(data.campaignId);
      setProgress({ sent: 0, failed: 0, total: data.total, status: "running", currentIndex: 0 });
      setSelected(new Set());
      toast({ title: `🚀 Campagne lancée — ${data.total} messages en file d'attente` });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Pause / Resume ──────────────────────────────────────────── */
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/automation/retargeting/${activeCampaignId}/pause`, { method: "PATCH", credentials: "include" });
      return res.json();
    },
    onSuccess: (data) => {
      setProgress(p => p ? { ...p, status: data.status } : p);
      toast({ title: data.status === "paused" ? "⏸ Campagne suspendue" : "▶ Campagne reprise" });
    },
  });

  /* ── Stop ────────────────────────────────────────────────────── */
  const stopMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/automation/retargeting/${activeCampaignId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      toast({ title: "🛑 Campagne arrêtée" });
      setActiveCampaignId(null);
      setProgress(null);
      refetchCampaigns();
    },
  });

  /* ── Preview text ────────────────────────────────────────────── */
  const previewText = message
    .replace(/\*?\{Nom_Client\}\*?/gi, "Mohammed")
    .replace(/\*?\{Dernier_Produit\}\*?/gi, "Mocassins ANAKIO");

  const progressPct = progress ? Math.round((progress.currentIndex / Math.max(progress.total, 1)) * 100) : 0;
  const isCampaignRunning = !!activeCampaignId && !!progress && progress.status !== "completed" && progress.status !== "stopped";

  return (
    <div className="space-y-5">
      {/* ── Live Progress Bar (shown while campaign is active) ─── */}
      {isCampaignRunning && progress && (
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-5 space-y-3" style={{ boxShadow: "0 0 0 1px rgba(197,160,89,0.2)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: progress.status === "paused" ? "#d97706" : "#22c55e" }} />
              <span className="text-sm font-bold text-zinc-800">
                {progress.status === "paused" ? "⏸ Campagne suspendue" : "🚀 Envoi en cours..."}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                data-testid="button-pause-campaign"
              >
                {progress.status === "paused" ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {progress.status === "paused" ? "Reprendre" : "Pause"}
              </button>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                data-testid="button-stop-campaign"
              >
                <Square className="w-3 h-3" />
                Arrêter
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span>Envoi en cours : <strong className="text-zinc-800">{progress.currentIndex}/{progress.total}</strong></span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${GOLD}, #d4aa60)` }} />
            </div>
          </div>
          {/* Counters */}
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1 text-green-600 font-bold">
              <Check className="w-3.5 h-3.5" /> {progress.sent} envoyés
            </span>
            <span className="flex items-center gap-1 text-red-500 font-bold">
              <X className="w-3.5 h-3.5" /> {progress.failed} échoués
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Clock className="w-3.5 h-3.5" /> {progress.total - progress.currentIndex} restants · délai 8–15s/msg
            </span>
          </div>
        </div>
      )}

      {/* Completed banner */}
      {progress?.status === "completed" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div>
            <p className="text-sm font-bold text-green-700">Campagne terminée !</p>
            <p className="text-xs text-green-600">{progress.sent} messages envoyés · {progress.failed} échoués</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-100 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-zinc-600">Cibler :</span>
        {([["delivered", "✅ Clients Livrés"], ["confirme", "🟢 Commandes Confirmées"], ["injoignable", "📵 Injoignables"]] as const).map(([val, lbl]) => (
          <button key={val} onClick={() => { setFilter(val as any); setSelected(new Set()); }}
            className={cn("px-4 py-1.5 rounded-xl text-sm font-bold transition-all", filter === val ? "text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}
            style={filter === val ? { background: NAVY } : {}}
          >{lbl}</button>
        ))}
        <span className="ml-auto text-xs text-zinc-400">{clients.length} clients trouvés</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* ── Client table ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-3">
            {/* Select-all checkbox */}
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-zinc-300 cursor-pointer"
              data-testid="checkbox-select-all"
            />
            <span className="text-sm font-bold text-zinc-700 flex-1">Liste des clients</span>
            {selected.size > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: GOLD }}>
                {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Table header */}
          {clients.length > 0 && (
            <div className="grid grid-cols-[32px_1fr_140px_1fr] gap-2 px-4 py-2 bg-zinc-50 border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
              <div />
              <div>Nom</div>
              <div>Téléphone</div>
              <div className="flex items-center gap-1"><Package className="w-3 h-3" /> Dernier produit</div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400"><Users className="w-8 h-8 mb-2 opacity-30" /><p className="text-sm">Aucun client trouvé</p></div>
          ) : (
            <div className="max-h-[440px] overflow-y-auto divide-y divide-zinc-50">
              {clients.map((c: any) => (
                <label key={c.id}
                  className={cn("grid grid-cols-[32px_1fr_140px_1fr] gap-2 items-center px-4 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors",
                    selected.has(c.id) && "bg-blue-50")}
                  data-testid={`client-row-${c.id}`}
                >
                  <input type="checkbox" checked={selected.has(c.id)} onChange={e => toggleOne(c.id, e.target.checked)} className="rounded border-zinc-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{c.customerName || "—"}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{c.customerCity || ""}</p>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono truncate">{c.customerPhone}</p>
                  <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                    {c.lastProductName ? <><Package className="w-3 h-3 shrink-0 opacity-50" />{c.lastProductName}</> : <span className="text-zinc-300">—</span>}
                  </p>
                </label>
              ))}
            </div>
          )}
          {selected.size > 0 && (
            <div className="px-4 py-2 border-t border-zinc-100 flex items-center justify-between">
              <span className="text-xs text-zinc-500"><strong className="text-zinc-700">{selected.size}</strong> client(s) sélectionné(s)</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:text-zinc-600">Tout désélectionner</button>
            </div>
          )}
        </div>

        {/* ── Message composer ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-3">
            <p className="text-sm font-bold text-zinc-700">Composer le message</p>

            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1 block">Nom de la campagne</label>
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Promo Ramadan 2025"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
                data-testid="input-campaign-name" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-500 font-medium">Message</label>
                {/* Variable insertion buttons */}
                <div className="flex gap-1">
                  <button onClick={() => insertVar("*{Nom_Client}*")}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-lg text-white transition-opacity hover:opacity-80"
                    style={{ background: NAVY }} data-testid="btn-var-nom">
                    + Nom
                  </button>
                  <button onClick={() => insertVar("*{Dernier_Produit}*")}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-lg text-white transition-opacity hover:opacity-80"
                    style={{ background: GOLD }} data-testid="btn-var-produit">
                    + Produit
                  </button>
                </div>
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} dir="rtl"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 resize-none"
                data-testid="input-campaign-message" />
              <p className="text-[10px] text-zinc-400 mt-1">Variables : <code>*{"{Nom_Client}*"}</code> et <code>*{"{Dernier_Produit}*"}</code> sont remplacées automatiquement</p>
            </div>

            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1 block">Lien produit (optionnel)</label>
              <input value={productLink} onChange={e => setProductLink(e.target.value)} placeholder="https://votre-boutique.com/produit"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
                data-testid="input-product-link" />
            </div>

            {/* Live preview */}
            <div className="rounded-xl p-3" style={{ background: "rgba(30,27,75,0.04)", border: "1px solid rgba(30,27,75,0.12)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>Aperçu (Mohammed · Mocassins ANAKIO)</p>
              <p className="text-xs text-zinc-600 whitespace-pre-wrap" dir="rtl">
                {previewText}{productLink && `\n\n🔗 ${productLink}`}
              </p>
            </div>

            {/* Anti-ban notice */}
            <div className="rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 flex items-start gap-2">
              <Timer className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700">Délai anti-ban : 8–15 secondes entre chaque message pour protéger votre compte WhatsApp.</p>
            </div>

            {/* Launch button */}
            <button
              onClick={() => launchMutation.mutate()}
              disabled={selected.size === 0 || launchMutation.isPending || isCampaignRunning}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #d4aa60)` }}
              data-testid="button-launch-campaign"
            >
              {launchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              {isCampaignRunning ? "Campagne en cours..." : `Lancer la Campagne (${selected.size})`}
            </button>
          </div>

          {/* ── Campaign history ──────────────────────────────────── */}
          {campaigns.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <p className="text-sm font-bold text-zinc-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: GOLD }} />
                Historique des campagnes
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {campaigns.map((c: any) => {
                  const successRate = c.totalTargets > 0 ? Math.round((c.totalSent / c.totalTargets) * 100) : 0;
                  const statusColor = c.status === "completed" ? "#22c55e" : c.status === "running" ? GOLD : c.status === "stopped" ? "#ef4444" : NAVY;
                  return (
                    <div key={c.id} className="rounded-xl bg-zinc-50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-zinc-800 truncate">{c.name}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shrink-0" style={{ background: statusColor }}>{c.status}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />{c.totalSent} envoyés</span>
                        {c.totalFailed > 0 && <span className="flex items-center gap-1 text-red-400"><X className="w-3 h-3" />{c.totalFailed}</span>}
                        <span>·</span>
                        <span>{successRate}% succès</span>
                        <span>·</span>
                        <span>{new Date(c.createdAt).toLocaleDateString("fr-MA")}</span>
                      </div>
                    </div>
                  );
                })}
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
    { value: "openai/gpt-4o",               label: "GPT-4o",            badge: "Le plus puissant" },
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
          <div className="bg-white rounded-2xl border-2 p-5 space-y-4" style={{ borderColor: hasOrKey ? "rgba(197,160,89,0.5)" : "rgba(197,160,89,0.25)" }}>
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
                <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: GOLD, background: "rgba(197,160,89,0.1)", border: "1px solid rgba(197,160,89,0.3)" }}>
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
                <div key={log.id} className={cn("rounded-xl p-3 text-xs", log.role === "assistant" ? "border" : log.role === "system" ? "border" : "bg-zinc-50 border border-zinc-100")} style={log.role === "assistant" ? { background: "rgba(30,27,75,0.05)", borderColor: "rgba(30,27,75,0.15)" } : log.role === "system" ? { background: "rgba(197,160,89,0.06)", borderColor: "rgba(197,160,89,0.2)" } : {}}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold capitalize" style={{ color: log.role === "assistant" ? NAVY : log.role === "system" ? GOLD : "#71717a" }}>{log.role}</span>
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
                      <div className="mt-2 rounded-xl p-3 text-xs" style={{ background: "rgba(30,27,75,0.04)", border: "1px solid rgba(30,27,75,0.12)" }}>
                        <p className="font-semibold mb-1" style={{ color: NAVY }}>Message IA généré :</p>
                        <p className="text-zinc-600 whitespace-pre-wrap" dir="rtl">{aiMsgMap[order.id]}</p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { navigator.clipboard.writeText(aiMsgMap[order.id]); }} className="flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: NAVY }}>
                            <Copy className="w-3 h-3" /> Copier
                          </button>
                          <a href={`https://wa.me/${order.customerPhone?.replace(/\D/g, "")}?text=${encodeURIComponent(aiMsgMap[order.id])}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: GOLD }}>
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
                      style={{ background: GOLD }}
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
   TAB 3 — WHATSAPP CONNECTION (Baileys — direct QR, no browser)
════════════════════════════════════════════════════════════════ */
function WhatsappTab() {
  const { toast } = useToast();

  /* ── Real-time state (from SSE + polling fallback) ─────────── */
  const [waState, setWaState] = useState<string>("idle");
  const [phone, setPhone]     = useState<string | null>(null);
  const [qrUrl, setQrUrl]     = useState<string | null>(null);
  const [sseOk, setSseOk]     = useState(false);

  /* Subscribe to SSE for instant QR / status updates */
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource("/api/automation/whatsapp/events", { withCredentials: true });

      es.addEventListener("wa_status", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setWaState(d.state ?? "idle");
          setPhone(d.phone ?? null);
          setQrUrl(d.qr ?? null);
          setSseOk(true);
        } catch { /* ignore parse error */ }
      });

      es.onerror = () => {
        es?.close();
        setSseOk(false);
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  /* Polling fallback — 2s interval, keeps UI in sync even without SSE */
  const statusQuery = useQuery<{ state: string; phone: string | null; qr: string | null }>({
    queryKey: ["/api/automation/whatsapp/status"],
    queryFn: () => fetch("/api/automation/whatsapp/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: sseOk ? 8000 : 2000, // slower polling when SSE is working
  });

  useEffect(() => {
    if (statusQuery.data) {
      setWaState(statusQuery.data.state ?? "idle");
      setPhone(statusQuery.data.phone ?? null);
      if (statusQuery.data.qr) setQrUrl(statusQuery.data.qr);
    }
  }, [statusQuery.data]);

  /* ── Mutations ─────────────────────────────────────────────── */
  const connectMutation = useMutation({
    mutationFn: () => fetch("/api/automation/whatsapp/connect", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      setWaState("connecting");
      statusQuery.refetch();
    },
    onError: () => toast({ title: "Erreur de connexion", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => fetch("/api/automation/whatsapp/reset", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      setWaState("connecting");
      setQrUrl(null);
      toast({ title: "🔄 Réinitialisation en cours", description: "Un nouveau QR Code sera généré dans quelques secondes." });
      statusQuery.refetch();
    },
    onError: () => toast({ title: "Erreur de réinitialisation", variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => fetch("/api/automation/whatsapp/disconnect", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      setWaState("idle");
      setPhone(null);
      setQrUrl(null);
      toast({ title: "WhatsApp déconnecté. Session effacée." });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: () => fetch("/api/automation/whatsapp/test", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => toast({ title: "✅ Message de test envoyé !", description: data.message ?? "Vérifiez votre WhatsApp." }),
    onError: () => toast({ title: "Échec du test", description: "La connexion WhatsApp est peut-être instable.", variant: "destructive" }),
  });

  /* ── Force Restart button (available in all non-connected states) */
  const ForceRestartBtn = ({ size = "sm" }: { size?: "sm" | "lg" }) => (
    <button
      onClick={() => {
        if (confirm("Voulez-vous forcer un redémarrage ? La session actuelle sera effacée et un nouveau QR Code sera généré.")) {
          resetMutation.mutate();
        }
      }}
      disabled={resetMutation.isPending}
      data-testid="button-force-restart-whatsapp"
      className={`flex items-center gap-2 rounded-xl font-medium transition-all disabled:opacity-50 ${size === "lg" ? "px-6 py-3 text-sm" : "px-4 py-2 text-xs"}`}
      style={{ color: GOLD, border: `1.5px solid ${GOLD}`, background: "rgba(197,160,89,0.06)" }}
    >
      {resetMutation.isPending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <RefreshCw className="w-3.5 h-3.5" />}
      Forcer le Redémarrage
    </button>
  );

  /* ── IDLE — show connect button ────────────────────────────── */
  if (waState === "idle") {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center space-y-5">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(30,27,75,0.06)", border: `2px dashed rgba(30,27,75,0.2)` }}>
            <Wifi className="w-9 h-9" style={{ color: NAVY, opacity: 0.4 }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-800 mb-2">WhatsApp non connecté</h2>
            <p className="text-sm text-zinc-400">
              Cliquez sur le bouton ci-dessous pour générer un QR Code.<br />
              Scannez-le avec votre téléphone pour lier TajerGrow AI à WhatsApp.
            </p>
          </div>
          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="flex items-center gap-2 px-7 py-3 rounded-xl text-white font-bold text-sm mx-auto transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: NAVY }}
            data-testid="button-connect-whatsapp"
          >
            {connectMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Initialisation...</>
              : <><Wifi className="w-4 h-4" /> Générer QR Code</>}
          </button>
          <div className="flex justify-center pt-1">
            <ForceRestartBtn />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-500" style={{ borderLeft: `3px solid ${NAVY}` }}>
          <p className="font-semibold text-zinc-700 mb-1">Connexion directe WhatsApp</p>
          <p>Protocole WhatsApp Web natif. Aucune application tierce requise. La session se reconnecte automatiquement après un redémarrage.</p>
        </div>
      </div>
    );
  }

  /* ── CONNECTING — loading spinner ──────────────────────────── */
  if (waState === "connecting") {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-10 text-center space-y-5">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(30,27,75,0.06)", border: `2px solid ${NAVY}` }}>
            <Loader2 className="w-9 h-9 animate-spin" style={{ color: NAVY }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-800 mb-2">Connexion en cours...</h2>
            <p className="text-sm text-zinc-400">Le QR Code apparaîtra dans quelques secondes. Ne fermez pas cette page.</p>
          </div>
          <div className="flex justify-center gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
        <div className="flex justify-center">
          <ForceRestartBtn />
        </div>
      </div>
    );
  }

  /* ── QR READY — show scan screen ───────────────────────────── */
  if (waState === "qr") {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: NAVY }}>Scanner le QR Code</h2>
            <p className="text-sm text-zinc-400">Ouvrez WhatsApp → Paramètres → Appareils connectés → Ajouter un appareil</p>
          </div>

          {/* QR Image */}
          <div className="flex justify-center py-2">
            {qrUrl ? (
              <div className="p-4 bg-white rounded-2xl shadow-md" style={{ border: `4px solid ${GOLD}` }} data-testid="img-whatsapp-qr">
                <img src={qrUrl} alt="QR Code WhatsApp" width={250} height={250} className="rounded-xl block" />
              </div>
            ) : (
              <div className="w-[250px] h-[250px] flex flex-col items-center justify-center gap-3 rounded-2xl" style={{ border: `4px dashed ${GOLD}` }}>
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: GOLD }} />
                <p className="text-sm font-medium text-zinc-500">Génération du QR...</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(197,160,89,0.12)", color: GOLD }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />
              QR se rafraîchit automatiquement
            </div>
          </div>

          {/* Force restart inside QR view */}
          <div className="pt-1 flex justify-center">
            <ForceRestartBtn />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-4 text-xs" style={{ borderLeft: `3px solid ${GOLD}` }}>
          <p className="font-bold text-zinc-700 mb-2">Instructions :</p>
          <ol className="space-y-1.5 text-zinc-500 list-decimal list-inside">
            <li>Ouvrez <strong>WhatsApp</strong> sur votre téléphone</li>
            <li>Allez dans <strong>Paramètres → Appareils connectés</strong></li>
            <li>Appuyez sur <strong>"Ajouter un appareil"</strong></li>
            <li>Pointez l'appareil photo sur le QR ci-dessus</li>
          </ol>
        </div>
      </div>
    );
  }

  /* ── CONNECTED — success state ─────────────────────────────── */
  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-white rounded-2xl p-7 text-center space-y-4" style={{ border: `2px solid ${NAVY}` }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: `rgba(197,160,89,0.12)`, border: `3px solid ${GOLD}` }}>
          <Wifi className="w-9 h-9" style={{ color: GOLD }} />
        </div>

        <div>
          <h2 className="text-lg font-bold text-zinc-800 mb-1">WhatsApp Connecté ✅</h2>
          {phone && (
            <p className="text-sm font-bold mb-1" style={{ color: NAVY }}>+{phone}</p>
          )}
          <p className="text-sm text-zinc-400">TajerGrow AI confirme automatiquement vos commandes en Darija.</p>
        </div>

        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: GOLD, color: "#fff" }} data-testid="status-wa-connected">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          TajerGrow AI Active
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => testSendMutation.mutate()}
            disabled={testSendMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: GOLD, color: "#fff", border: `1.5px solid ${GOLD}` }}
            data-testid="button-test-whatsapp-send"
          >
            {testSendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Tester l'envoi
          </button>
          <button
            onClick={() => statusQuery.refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ color: NAVY, border: `1px solid ${NAVY}`, background: "white" }}
            data-testid="button-refresh-status"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button
            onClick={() => {
              if (confirm("Voulez-vous déconnecter WhatsApp et effacer la session ?")) {
                disconnectMutation.mutate();
              }
            }}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
            data-testid="button-disconnect-whatsapp"
          >
            {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Déconnecter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-500">
        <p className="font-semibold text-zinc-700 mb-1">Reconnexion automatique</p>
        <p>La session est sauvegardée sur le serveur. En cas de redémarrage, la connexion se rétablit automatiquement sans rescanner le QR.</p>
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
  const selectedIdRef = useRef<number | null>(null);
  const [manualMsg, setManualMsg] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [typingConvId, setTypingConvId] = useState<number | null>(null);
  const [attentionIds, setAttentionIds] = useState<Set<number>>(new Set());
  const [longChatIds, setLongChatIds] = useState<Set<number>>(new Set());
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Keep ref in sync with state so SSE handlers always read the latest value
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

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

  /* ── Persistent SSE connection ───────────────────────────────
     Uses selectedIdRef so the connection NEVER closes/reopens
     when the user switches conversations — zero message gaps.
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource("/api/automation/events", { withCredentials: true });

      es.addEventListener("new_conversation", (e) => {
        refetchConvs();
        // If there's a first message in the event, add it to chat if this conv is selected
        try {
          const data = JSON.parse(e.data);
          if (data?.message && data?.conversation?.id) {
            const convId = data.conversation.id;
            // Update conversations list immediately with the new conv
            queryClient.setQueryData(["/api/automation/conversations"], (old: any) => {
              if (!Array.isArray(old)) return old;
              const exists = old.some((c: any) => c.id === convId);
              if (!exists) return [...old, { ...data.conversation }];
              return old;
            });
            if (convId === selectedIdRef.current) {
              setMessages(prev => [...prev, { role: data.message.role, content: data.message.content, ts: data.message.ts }]);
            } else {
              setUnreadIds(prev => new Set([...prev, convId]));
            }
          }
        } catch (_) {}
      });

      es.addEventListener("message", (e) => {
        const data = JSON.parse(e.data);
        const convId: number = data.conversationId;

        // Instantly update the conv list's lastMessage without waiting for HTTP poll
        queryClient.setQueryData(["/api/automation/conversations"], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((c: any) =>
            c.id === convId
              ? { ...c, lastMessage: data.content, updatedAt: new Date().toISOString() }
              : c
          );
        });

        if (convId === selectedIdRef.current) {
          // ── Add message to open chat view ──
          setMessages(prev => [...prev, { role: data.role, content: data.content, ts: data.ts }]);
        } else {
          // ── Mark conv as having new unread messages (green dot on list) ──
          setUnreadIds(prev => new Set([...prev, convId]));

          // ── Toast notification for customer messages in non-selected convs ──
          if (data.role === "user") {
            const preview = (data.content || "").substring(0, 60);
            toast({
              title: "💬 Message client reçu",
              description: preview || "Nouveau message WhatsApp",
              duration: 5000,
            });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("TajerGrow — Nouveau message", {
                body: preview || "Un client vous a envoyé un message WhatsApp",
                icon: "/favicon.ico",
              });
            }
          }
        }
      });

      es.addEventListener("confirmed", (e) => {
        const data = JSON.parse(e.data);
        refetchConvs();
        if (data.conversationId === selectedIdRef.current) {
          setMessages(prev => [...prev, { role: "system", content: "✅ Commande confirmée automatiquement", ts: data.ts }]);
        }
      });

      es.addEventListener("cancelled", (e) => {
        const data = JSON.parse(e.data);
        refetchConvs();
        if (data.conversationId === selectedIdRef.current) {
          setMessages(prev => [...prev, { role: "system", content: "❌ Commande annulée", ts: data.ts }]);
        }
      });

      es.addEventListener("post_confirm_cancel", (e) => {
        const data = JSON.parse(e.data);
        refetchConvs();
        toast({
          title: "⚠️ Annulation Post-Confirmation",
          description: data.message || "Un client a annulé sa commande confirmée via WhatsApp",
          variant: "destructive",
          duration: 10000,
        });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("TajerGrow — Annulation urgente", {
            body: data.message || "Un client a annulé sa commande confirmée via WhatsApp",
            icon: "/favicon.ico",
          });
        }
      });

      es.addEventListener("takeover", (e) => {
        const data = JSON.parse(e.data);
        refetchConvs();
        // Update local conv status immediately
        queryClient.setQueryData(["/api/automation/conversations"], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((c: any) =>
            c.id === data.conversationId
              ? { ...c, isManual: data.isManual ? 1 : 0, status: data.isManual ? "manual" : "active" }
              : c
          );
        });
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
        if (data.isKeyError) {
          // Show sticky API key warning banner
          setApiKeyMissing(true);
          toast({
            title: "🔑 Clé OpenRouter Invalide",
            description: "L'IA ne peut pas répondre. Ajoutez une clé valide dans IA Confirmation → Paramètres.",
            variant: "destructive",
          });
        } else {
          // Always show error toast regardless of selected conv
          const who = data.customerName || data.customerPhone || "Client";
          toast({
            title: "❌ Erreur IA",
            description: `${who} : ${(data.error || "Erreur inconnue").substring(0, 100)}`,
            variant: "destructive",
          });
        }
      });

      es.addEventListener("needs_attention", (e) => {
        const data = JSON.parse(e.data);
        setAttentionIds(prev => new Set([...prev, data.conversationId]));
        refetchConvs();
        const who = data.customerName || data.customerPhone || "Client";
        const trigger = data.trigger && data.trigger !== "AI generation failed"
          ? `"${data.trigger.substring(0, 50)}"`
          : "demande d'assistance";
        toast({
          title: "🔴 Intervention Requise",
          description: `${who} : ${trigger} — Cliquez sur 'Prendre la main'.`,
          variant: "destructive",
        });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`TajerGrow — ${who} demande assistance`, {
            body: trigger,
            icon: "/favicon.ico",
          });
        }
      });

      es.addEventListener("long_chat", (e) => {
        const data = JSON.parse(e.data);
        setLongChatIds(prev => new Set([...prev, data.conversationId]));
        refetchConvs();
        toast({
          title: "🕐 Conversation Longue",
          description: `${data.messageCount} messages — التدخل مطلوب. Vérifiez si le client est sérieux.`,
        });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("TajerGrow — Conversation longue", {
            body: `${data.customerName || "Client"} : ${data.messageCount} messages sans décision.`,
            icon: "/favicon.ico",
          });
        }
      });

      es.addEventListener("lead_confirmed", (e) => {
        const data = JSON.parse(e.data);
        refetchConvs();
        toast({
          title: "🎉 Commande Lead Créée !",
          description: `${data.customerName || "Lead"} — Commande #${data.orderNumber} confirmée via FB Ads 🎯`,
        });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("TajerGrow — Nouveau client via Ads 🎯", {
            body: `${data.customerName || "Lead"} vient de confirmer sa commande #${data.orderNumber}`,
            icon: "/favicon.ico",
          });
        }
      });

      es.addEventListener("audio_received", (e) => {
        const data = JSON.parse(e.data);
        if (data.status === "done" && data.transcription) {
          if (data.conversationId === selectedIdRef.current) {
            setMessages(prev => [...prev, {
              role: "system",
              content: `🎤 رسالة صوتية: "${data.transcription}"`,
              ts: data.ts || Date.now(),
            }]);
          }
        } else if (data.status === "failed") {
          toast({
            title: "🎤 رسالة صوتية",
            description: "تعذّر التفريغ — تأكد من إعداد OPENAI_API_KEY",
            variant: "destructive",
          });
        }
      });

      // Auto-reconnect if the SSE connection drops
      es.onerror = () => {
        es?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onSuccess: (data, sentMsg) => {
      // Use the sent message arg (not stale closure) to add to chat immediately
      setMessages(prev => [...prev, { role: "admin", content: sentMsg, ts: Date.now() }]);
      setManualMsg("");
      // If AI was auto-paused, refresh conv list to show "Manuel" status
      if (data?.autopaused) {
        queryClient.invalidateQueries({ queryKey: ["/api/automation/conversations"] });
        toast({ title: "⏸️ IA en pause 10 min", description: "L'IA reprendra automatiquement dans 10 minutes." });
      }
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

  const statusColor = (s: string, needsAttn?: boolean, isLong?: boolean) => {
    if (needsAttn) return "#ef4444";
    if (isLong) return "#d97706"; // amber — long conv
    if (s === "confirmed") return "#22c55e";
    if (s === "cancelled") return "#ef4444";
    if (s === "manual") return GOLD;
    return NAVY;
  };

  const statusLabel = (s: string, needsAttn?: boolean, isLong?: boolean) => {
    if (needsAttn) return "Attention 🔴";
    if (isLong) return "Long 🕐";
    if (s === "confirmed") return "Confirmé ✅";
    if (s === "cancelled") return "Annulé ❌";
    if (s === "manual") return "Manuel 👤";
    return "En cours 🤖";
  };

  const bubbleStyle = (role: string) => {
    if (role === "user") return { background: "#f0f0f5", alignSelf: "flex-start", borderRadius: "16px 16px 16px 4px", border: "1px solid rgba(30,27,75,0.08)" };
    if (role === "admin") return { background: `rgba(197,160,89,0.12)`, alignSelf: "flex-end", borderRadius: "16px 16px 4px 16px", border: `1px solid rgba(197,160,89,0.35)` };
    if (role === "system") return { background: "rgba(30,27,75,0.05)", alignSelf: "center", borderRadius: "12px", border: "1px solid rgba(30,27,75,0.12)" };
    return { background: `rgba(30,27,75,0.09)`, alignSelf: "flex-end", borderRadius: "16px 16px 4px 16px" };
  };

  return (
    <div className="flex flex-col gap-3">
    {/* ── API Key missing sticky banner ─────────────────────── */}
    {apiKeyMissing && (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className="text-base">🔑</span>
          <span>L'IA est <b>bloquée</b> — Clé OpenRouter invalide ou sans crédits. Allez dans <b>IA Confirmation → Paramètres</b> et ajoutez une clé valide.</span>
        </div>
        <button onClick={() => setApiKeyMissing(false)} className="shrink-0 text-red-400 hover:text-red-600 font-bold text-lg leading-none" aria-label="Fermer">×</button>
      </div>
    )}
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
            {[...conversations]
              .sort((a: any, b: any) => {
                const priority = (c: any) =>
                  attentionIds.has(c.id) ? 4 :
                  unreadIds.has(c.id) ? 3 :
                  longChatIds.has(c.id) ? 2 : 0;
                const pa = priority(a), pb = priority(b);
                if (pa !== pb) return pb - pa;
                return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
              })
            .map((conv: any) => {
              const needsAttn = attentionIds.has(conv.id);
              const isLong = longChatIds.has(conv.id) && !needsAttn;
              return (
              <button
                key={conv.id}
                onClick={() => { setSelectedId(conv.id); setMessages([]); setUnreadIds(prev => { const n = new Set(prev); n.delete(conv.id); return n; }); }}
                className={cn("w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors",
                  needsAttn && "bg-red-50 border-l-4 border-red-400",
                  isLong && "bg-amber-50 border-l-4 border-amber-400"
                )}
                style={selectedId === conv.id && !needsAttn && !isLong ? { background: "rgba(30,27,75,0.05)", borderLeft: `3px solid ${NAVY}` } : undefined}
                data-testid={`conv-item-${conv.id}`}
              >
                <div className="flex items-center justify-between mb-1 gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {needsAttn ? (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Attention requise" />
                    ) : isLong ? (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" title="Conversation longue" />
                    ) : typingConvId === conv.id ? (
                      <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: GOLD }} title="IA en train d'écrire..." />
                    ) : unreadIds.has(conv.id) ? (
                      <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 animate-pulse" title="Nouveau message" />
                    ) : conv.status === "active" ? (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NAVY, opacity: 0.6 }} />
                    ) : null}
                    <p className="text-sm font-semibold text-zinc-800 truncate">{conv.customerName || conv.customerPhone}</p>
                    {unreadIds.has(conv.id) && selectedId !== conv.id && (
                      <span className="ml-auto shrink-0 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center">N</span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ background: needsAttn ? "#ef4444" : isLong ? "#d97706" : statusColor(conv.status) }}>
                    {statusLabel(conv.status, needsAttn, isLong)}
                  </span>
                </div>
                {typingConvId === conv.id ? (
                  <p className="text-xs font-medium flex items-center gap-1" style={{ color: GOLD }}>
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "300ms" }} />
                    </span>
                    IA en train d'écrire...
                  </p>
                ) : (
                  <p className={cn("text-xs truncate",
                    needsAttn ? "text-red-500 font-medium" :
                    isLong ? "text-amber-600 font-medium" :
                    "text-zinc-400"
                  )}>
                    {needsAttn ? "⚠️ Client demande assistance humaine" :
                     isLong ? "🕐 Conversation longue: التدخل مطلوب" :
                     (conv.lastMessage || "...")}
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
                      : { background: "rgba(30,27,75,0.07)", color: NAVY }
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
                    ? { background: "rgba(30,27,75,0.07)", color: NAVY, border: `1px solid rgba(30,27,75,0.2)` }
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
            <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(197,160,89,0.07)", color: GOLD, borderBottom: `1px solid rgba(197,160,89,0.18)` }}>
              <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: GOLD }} />
              TajerGrow AI — en train de rédiger une réponse en Darija...
            </div>
          ) : selectedConv.status === "active" ? (
            <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(30,27,75,0.04)", color: NAVY, borderBottom: "1px solid rgba(30,27,75,0.1)" }}>
              <Bot className="w-3.5 h-3.5" /> TajerGrow AI gère cette conversation automatiquement en Darija.
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
                  style={{ background: "rgba(197,160,89,0.1)", border: `1px solid rgba(197,160,89,0.25)` }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: GOLD, animationDelay: "300ms" }} />
                  <span className="text-xs font-bold ml-1" style={{ color: GOLD }}>AI</span>
                </div>
                <span className="text-[10px] text-zinc-300 mt-0.5 px-1 text-right">en train d'écrire...</span>
              </div>
            )}

            <div ref={(el) => { messagesEndRef.current = el; }} />
          </div>

          {/* Manual message input — always available; auto-pauses AI 10 min if sent during active mode */}
          {selectedConv.status !== "confirmed" && selectedConv.status !== "cancelled" && (
            <div className="px-4 py-3 border-t border-zinc-100">
              <div className="flex gap-2">
                <input
                  value={manualMsg}
                  onChange={e => setManualMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && manualMsg.trim()) sendMutation.mutate(manualMsg); }}
                  placeholder={selectedConv.isManual ? "Écrivez votre message (vous contrôlez)..." : "Écrire un message (l'IA sera pausée 10 min)..."}
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
                  dir="rtl"
                  data-testid="input-manual-msg"
                />
                <button
                  onClick={() => { if (manualMsg.trim()) sendMutation.mutate(manualMsg); }}
                  disabled={!manualMsg.trim() || sendMutation.isPending}
                  className="px-4 py-2 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: NAVY }}
                  data-testid="button-send-manual"
                >
                  {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {!selectedConv.isManual && (
                <p className="text-[11px] text-zinc-400 mt-1.5 text-center">
                  Envoyer un message met l'IA en <strong>pause 10 min</strong> automatiquement.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}


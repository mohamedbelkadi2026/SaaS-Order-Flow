import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Globe, Loader2, CheckCircle2, Copy,
  Trash2, Eye, Plus, ArrowRight, Zap, Smartphone,
  ShoppingBag, ExternalLink, Settings, X, Key,
  Download, Languages,
} from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";

const LANGUAGES = [
  { value: "darija",  label: "Moroccan Darija 🇲🇦" },
  { value: "french",  label: "Français 🇫🇷" },
  { value: "arabic",  label: "العربية 🇸🇦" },
  { value: "english", label: "English 🇬🇧" },
];

/* ── Helpers ─────────────────────────────────────────────── */
function apiRequest(method: string, url: string, body?: any) {
  return fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Erreur serveur");
    return j;
  });
}

/* ── Image upload slot ───────────────────────────────────── */
function ImageSlot({ label, desc, value, onChange }: {
  label: string; desc: string; value: string; onChange(url: string): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch("/api/lp-builder/upload-image", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      onChange(j.url);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>
      <p className="text-[11px] text-slate-500">{desc}</p>
      <div
        onClick={() => !uploading && ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        className="relative rounded-xl border-2 border-dashed border-white/15 cursor-pointer hover:border-amber-500/40 transition-colors overflow-hidden"
        style={{ minHeight: 120 }}
        data-testid={`slot-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="w-full h-36 object-cover" />
            <button
              onClick={e => { e.stopPropagation(); onChange(""); }}
              className="absolute top-2 right-2 rounded-full bg-red-500 p-1 hover:bg-red-600"
              data-testid={`button-remove-${label}`}>
              <Trash2 className="w-3 h-3 text-white" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-6">
            {uploading
              ? <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
              : <Upload className="w-6 h-6 text-slate-500" />}
            <span className="text-xs text-slate-500">{uploading ? "Upload en cours…" : "Cliquez ou glissez une image"}</span>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

/* ── Settings Modal ──────────────────────────────────────── */
function SettingsModal({ onClose }: { onClose(): void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  const { data: settingsData } = useQuery<any>({
    queryKey: ["/api/lp-builder/settings"],
  });

  const saveKey = useMutation({
    mutationFn: (k: string) => apiRequest("POST", "/api/lp-builder/settings", { openrouterApiKey: k }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lp-builder/settings"] });
      toast({ title: "Clé API sauvegardée !" });
      setKey("");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5" style={{ color: GOLD }} />
            Clé API OpenRouter
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: settingsData?.hasKey ? "#10b981" : "#ef444444", background: settingsData?.hasKey ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)" }}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${settingsData?.hasKey ? "bg-green-500" : "bg-red-500"}`} />
            <p className="text-sm font-semibold" style={{ color: settingsData?.hasKey ? "#10b981" : "#ef4444" }}>
              {settingsData?.hasKey ? "Clé API configurée ✓" : "Aucune clé API configurée"}
            </p>
          </div>
          {settingsData?.hasStoreKey && (
            <p className="text-xs text-slate-500">Clé personnalisée de votre boutique active</p>
          )}
          {!settingsData?.hasStoreKey && settingsData?.hasKey && (
            <p className="text-xs text-slate-500">Utilise la clé par défaut du serveur</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block">
            Entrez votre clé OpenRouter
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={show ? "text" : "password"}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full rounded-lg bg-white/10 border border-white/15 text-white text-sm p-3 pr-10 focus:outline-none focus:border-amber-500/50"
                data-testid="input-api-key"
              />
              <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs">
                {show ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Obtenez votre clé sur{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
              openrouter.ai/keys
            </a>
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-white/15 text-slate-400">
            Annuler
          </Button>
          <Button
            onClick={() => saveKey.mutate(key)}
            disabled={!key.trim() || saveKey.isPending}
            className="flex-1 font-bold"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }}
            data-testid="button-save-api-key">
            {saveKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Phone preview ───────────────────────────────────────── */
function PhonePreview({ page }: { page: any }) {
  const copy: any = page.copy || {};
  const theme = page.theme || "navy";
  const custom = page.customColor || "";

  const T = theme === "gold"
    ? { bg: "#C5A059", accent: "#0F1F3D", text: "#0F1F3D", btn: "#0F1F3D", btnTxt: "#fff" }
    : theme === "custom" && custom
    ? { bg: custom, accent: "#fff", text: "#fff", btn: "#fff", btnTxt: custom }
    : { bg: "#0F1F3D", accent: "#C5A059", text: "#fff", btn: "#C5A059", btnTxt: "#0F1F3D" };

  return (
    <div className="relative mx-auto" style={{ width: 220 }}>
      <div className="rounded-3xl overflow-hidden border-4 border-slate-700 shadow-2xl" style={{ background: T.bg }}>
        <div className="flex justify-center pt-2 pb-1" style={{ background: "#1a1a1a" }}>
          <div className="w-16 h-4 bg-black rounded-full" />
        </div>
        <div style={{ height: 400, overflow: "hidden", background: T.bg }}>
          <div style={{ position: "relative", height: 180 }}>
            {page.heroImageUrl ? (
              <>
                <img src={page.heroImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 30%, ${T.bg} 100%)` }} />
              </>
            ) : (
              <div style={{ height: "100%", background: `linear-gradient(135deg, ${T.accent}22, ${T.accent}44)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 28 }}>🖼️</span>
              </div>
            )}
            <div style={{ position: "absolute", bottom: 8, left: 10, right: 10 }}>
              <div style={{ background: T.accent, display: "inline-block", padding: "2px 8px", borderRadius: 100, fontSize: 7, fontWeight: 800, color: T.btnTxt, marginBottom: 4 }}>
                🔥 Offre Limitée
              </div>
              <div style={{ color: T.text, fontWeight: 900, fontSize: 11, lineHeight: 1.2 }}>
                {copy.headline || page.productName || "Titre du produit"}
              </div>
            </div>
          </div>
          <div style={{ padding: "8px 10px" }}>
            <div style={{ color: T.accent, fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{page.priceDH || 0} DH</div>
            <div style={{ background: T.btn, borderRadius: 8, padding: "7px 0", textAlign: "center", fontSize: 9, fontWeight: 900, color: T.btnTxt }}>
              {copy.cta || "Commander Maintenant"} →
            </div>
          </div>
          {(copy.solution || []).slice(0, 2).map((b: string, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px" }}>
              <span style={{ color: T.accent, fontSize: 9 }}>✅</span>
              <span style={{ color: T.text, fontSize: 8, lineHeight: 1.3, opacity: 0.85 }}>{b.substring(0, 40)}{b.length > 40 ? "…" : ""}</span>
            </div>
          ))}
          <div style={{ margin: "8px 10px", background: "#ef4444", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
            <div style={{ color: "#fff", fontSize: 7, fontWeight: 800 }}>⚠️ {copy.scarcity || "Stock limité !"}</div>
          </div>
          <div style={{ margin: "0 10px", background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px" }}>
            <div style={{ color: T.text, fontSize: 8, fontWeight: 700, marginBottom: 6 }}>Commander maintenant</div>
            {["Votre nom", "Téléphone", "Ville"].map(p => (
              <div key={p} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 6px", marginBottom: 4, color: "rgba(255,255,255,0.4)", fontSize: 7 }}>
                {p}…
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: T.btn, padding: "8px 10px", textAlign: "center", fontSize: 8, fontWeight: 900, color: T.btnTxt }}>
          🛒 {copy.cta || "Commander Maintenant"}
        </div>
      </div>
    </div>
  );
}

/* ── Step indicator ──────────────────────────────────────── */
function StepBar({ current }: { current: number }) {
  const steps = ["Produit", "Copywriting", "Design & Publier"];
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
              current > i + 1 ? "bg-amber-500 border-amber-500 text-white"
              : current === i + 1 ? "border-amber-400 bg-amber-400/20 text-amber-300"
              : "border-slate-600 bg-slate-800/50 text-slate-500"
            }`}>
              {current > i + 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 whitespace-nowrap ${
              current === i + 1 ? "text-amber-400" : current > i + 1 ? "text-amber-600" : "text-slate-600"
            }`}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-10 h-px mx-1 mb-4 ${current > i + 1 ? "bg-amber-500" : "bg-slate-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function LpBuilder() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"list" | 1 | 2 | 3 | "done">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  /* Form state */
  const [productName, setProductName] = useState("");
  const [priceDH, setPriceDH] = useState("");
  const [description, setDescription] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [featuresImageUrl, setFeaturesImageUrl] = useState("");
  const [proofImageUrl, setProofImageUrl] = useState("");

  /* Copy state */
  const [copy, setCopy] = useState<any>({});
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [language, setLanguage] = useState("darija");

  /* Design state */
  const [theme, setTheme] = useState("navy");
  const [customColor, setCustomColor] = useState("#8b5cf6");
  const [slug, setSlug] = useState("");

  /* Published */
  const [publishedSlug, setPublishedSlug] = useState("");
  const [publishedId, setPublishedId] = useState<number | null>(null);

  const { data: pages = [], isLoading: pagesLoading } = useQuery<any[]>({
    queryKey: ["/api/lp-builder/pages"],
  });
  const { data: settingsData } = useQuery<any>({
    queryKey: ["/api/lp-builder/settings"],
    enabled: step !== "list" || true,
  });

  const deletePage = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lp-builder/pages/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lp-builder/pages"] }); toast({ title: "Page supprimée." }); },
  });

  const savePage = useMutation({
    mutationFn: (body: any) => editingId
      ? apiRequest("PATCH", `/api/lp-builder/pages/${editingId}`, body)
      : apiRequest("POST", "/api/lp-builder/pages", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/lp-builder/pages"] });
      setPublishedSlug(data.slug);
      setPublishedId(data.id);
      setStep("done");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setEditingId(null);
    setProductName(""); setPriceDH(""); setDescription("");
    setHeroImageUrl(""); setFeaturesImageUrl(""); setProofImageUrl("");
    setCopy({}); setTheme("navy"); setCustomColor("#8b5cf6"); setSlug("");
    setPublishedSlug(""); setPublishedId(null); setLanguage("darija");
    setStep(1);
  }

  function loadPageForEdit(p: any) {
    setEditingId(p.id);
    setProductName(p.productName || ""); setPriceDH(String(p.priceDH || ""));
    setDescription(p.description || ""); setHeroImageUrl(p.heroImageUrl || "");
    setFeaturesImageUrl(p.featuresImageUrl || ""); setProofImageUrl(p.proofImageUrl || "");
    setCopy(p.copy || {}); setTheme(p.theme || "navy"); setCustomColor(p.customColor || "#8b5cf6");
    setSlug(p.slug || "");
    setStep(1);
  }

  async function generateCopy() {
    if (!productName) { toast({ title: "Entrez le nom du produit d'abord.", variant: "destructive" }); return; }
    if (!settingsData?.hasKey) {
      setShowSettings(true);
      toast({ title: "⚠️ Clé API requise", description: "Configurez votre clé OpenRouter pour activer la génération IA.", variant: "destructive" });
      return;
    }
    setGeneratingCopy(true);
    try {
      const result = await apiRequest("POST", "/api/lp-builder/generate-copy", {
        productName, priceDH: parseFloat(priceDH) || 0, description, language,
      });
      setCopy(result);
      toast({ title: "✨ Copy générée avec succès !" });
    } catch (e: any) {
      if (e.message?.includes("Clé API")) {
        setShowSettings(true);
      }
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingCopy(false);
    }
  }

  function updateCopy(field: string, val: any) {
    setCopy((p: any) => ({ ...p, [field]: val }));
  }

  function handlePublish() {
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      toast({ title: "Slug invalide", description: "Utilisez uniquement des lettres minuscules, chiffres et tirets.", variant: "destructive" });
      return;
    }
    savePage.mutate({
      slug, productName, priceDH: parseFloat(priceDH) || 0, description,
      heroImageUrl, featuresImageUrl, proofImageUrl, copy, theme, customColor,
    });
  }

  function downloadZip(id: number) {
    window.open(`/api/lp-builder/pages/${id}/export`, "_blank");
  }

  const currentPagePreview = {
    productName, priceDH: parseFloat(priceDH) || 0,
    heroImageUrl, copy, theme, customColor,
  };

  const publicUrl = `${window.location.origin}/lp/${publishedSlug}`;

  /* ── PAGE: List ───────────────────────────────────── */
  if (step === "list") return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#0a1628" }}>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Zap className="w-6 h-6" style={{ color: GOLD }} />
              LP Builder
            </h1>
            <p className="text-slate-400 text-sm mt-1">Pages de vente Reel-style qui convertissent — en 1 clic</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-2 border-white/15 text-slate-400 hover:text-white" data-testid="button-settings-lp">
              <Settings className="w-4 h-4" />
              {!settingsData?.hasKey && <span className="w-2 h-2 rounded-full bg-red-500" />}
              Paramètres
            </Button>
            <Button onClick={resetForm} className="gap-2 font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }}
              data-testid="button-new-lp">
              <Plus className="w-4 h-4" /> Nouvelle Page
            </Button>
          </div>
        </div>

        {!settingsData?.hasKey && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-red-400 font-bold text-sm">Clé API non configurée</p>
              <p className="text-slate-500 text-xs mt-1">La génération IA est désactivée. Ajoutez votre clé OpenRouter dans les paramètres.</p>
              <button onClick={() => setShowSettings(true)} className="text-amber-400 text-xs font-semibold mt-2 hover:underline">
                Configurer maintenant →
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pages actives", val: (pages as any[]).filter(p => p.isActive).length },
            { label: "Commandes générées", val: (pages as any[]).reduce((s: number, p: any) => s + (p.orderCount || 0), 0) },
            { label: "Taux conv. moy.", val: "~3.2%" },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xl font-extrabold text-white">{val}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {pagesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        ) : (pages as any[]).length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Globe className="w-14 h-14 text-slate-600 mx-auto mb-4" />
            <p className="text-white font-bold text-lg mb-2">Aucune page encore</p>
            <p className="text-slate-500 text-sm mb-6">Créez votre première landing page Reel-style en moins de 5 minutes</p>
            <Button onClick={resetForm} style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }} className="font-bold gap-2">
              <Plus className="w-4 h-4" /> Créer ma première page
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(pages as any[]).map((p: any) => (
              <Card key={p.id} className="border-white/10 bg-white/5 text-white overflow-hidden" data-testid={`card-lp-${p.id}`}>
                <div className="flex gap-0">
                  {p.heroImageUrl ? (
                    <img src={p.heroImageUrl} alt={p.productName} className="w-24 h-full object-cover shrink-0" style={{ minHeight: 100 }} />
                  ) : (
                    <div className="w-24 shrink-0 flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                      <ShoppingBag className="w-8 h-8" style={{ color: GOLD }} />
                    </div>
                  )}
                  <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{p.productName}</p>
                        <p className="text-amber-400 font-bold text-base">{p.priceDH} DH</p>
                      </div>
                      <Badge className="text-[10px] shrink-0" style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}>
                        {p.orderCount || 0} cmd
                      </Badge>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 font-mono truncate">/{p.slug}</p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-white/15 text-slate-300 hover:bg-white/10 gap-1" onClick={() => loadPageForEdit(p)} data-testid={`button-edit-lp-${p.id}`}>
                        <Eye className="w-3 h-3" /> Éditer
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-white/15 text-slate-300 hover:bg-white/10 gap-1" asChild>
                        <a href={`/lp/${p.slug}`} target="_blank" rel="noreferrer" data-testid={`button-view-lp-${p.id}`}>
                          <ExternalLink className="w-3 h-3" /> Voir
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1"
                        onClick={() => downloadZip(p.id)} data-testid={`button-download-lp-${p.id}`}>
                        <Download className="w-3 h-3" /> ZIP
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1 ml-auto"
                        onClick={() => { if (confirm("Supprimer cette page ?")) deletePage.mutate(p.id); }}
                        data-testid={`button-delete-lp-${p.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── PAGE: Done ───────────────────────────────────── */
  if (step === "done") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0a1628" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-7xl">🎉</div>
        <h2 className="text-3xl font-extrabold text-white">Page publiée !</h2>
        <p className="text-slate-400">Votre landing page Reel-style est en ligne et prête à convertir.</p>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Lien public</p>
          <p className="text-amber-400 font-mono text-sm break-all">{publicUrl}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 gap-1"
              onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: "Lien copié !" }); }}
              data-testid="button-copy-link">
              <Copy className="w-3 h-3" /> Copier
            </Button>
            <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 gap-1" asChild>
              <a href={`/lp/${publishedSlug}`} target="_blank" rel="noreferrer" data-testid="button-open-lp">
                <ExternalLink className="w-3 h-3" /> Ouvrir
              </a>
            </Button>
            {publishedId && (
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 gap-1"
                onClick={() => downloadZip(publishedId)} data-testid="button-download-done">
                <Download className="w-3 h-3" /> Télécharger ZIP
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="border-white/15 text-slate-300" onClick={() => setStep("list")} data-testid="button-back-list">
            Mes pages
          </Button>
          <Button onClick={resetForm} style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }} className="font-bold gap-1">
            <Plus className="w-3.5 h-3.5" /> Nouvelle page
          </Button>
        </div>
      </div>
    </div>
  );

  /* ── Builder Steps 1–3 ───────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "#0a1628" }}>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="max-w-6xl mx-auto p-4 md:p-8">

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white gap-1"
            onClick={() => setStep("list")} data-testid="button-back-to-list">
            ← Mes pages
          </Button>
          <div className="text-slate-600">·</div>
          <span className="text-slate-400 text-sm">{editingId ? "Modifier la page" : "Nouvelle landing page"}</span>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} className="gap-1 text-slate-500 hover:text-white">
              <Settings className="w-3.5 h-3.5" />
              {!settingsData?.hasKey && <span className="text-red-400 text-xs">⚠ Clé API</span>}
            </Button>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <StepBar current={step as number} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8">
          <div className="space-y-5">

            {/* ══ STEP 1: Product Info ══ */}
            {step === 1 && (
              <>
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <ShoppingBag className="w-4 h-4" /> Informations produit
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">Nom du produit <span className="text-red-400">*</span></label>
                      <Input value={productName} onChange={e => setProductName(e.target.value)}
                        className="bg-white/10 border-white/15 text-white" placeholder="Ex: Montre Automatique Premium"
                        data-testid="input-product-name" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">Prix de vente (DH) <span className="text-red-400">*</span></label>
                      <Input value={priceDH} onChange={e => setPriceDH(e.target.value)} type="number" min={0}
                        className="bg-white/10 border-white/15 text-white" placeholder="Ex: 299"
                        data-testid="input-price" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">Description courte (pour l'IA)</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                        className="w-full rounded-md bg-white/10 border border-white/15 text-white text-sm p-3 resize-none focus:outline-none focus:border-amber-500/50"
                        placeholder="Décrivez votre produit, ses bénéfices, votre cible client…"
                        data-testid="input-description" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <Upload className="w-4 h-4" /> Images Reel (3 sections)
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Chaque image devient une section plein écran dans votre page · JPG/PNG/WEBP max 10MB</p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ImageSlot label="Image Hero" desc="Section 1 — plein écran avec le headline" value={heroImageUrl} onChange={setHeroImageUrl} />
                    <ImageSlot label="Image Features" desc="Section 2 — produit en usage/situation" value={featuresImageUrl} onChange={setFeaturesImageUrl} />
                    <ImageSlot label="Image Proof" desc="Section 3 — résultats, avant/après, unboxing" value={proofImageUrl} onChange={setProofImageUrl} />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={() => {
                    if (!productName || !priceDH) { toast({ title: "Remplissez le nom et le prix.", variant: "destructive" }); return; }
                    setStep(2);
                  }} className="gap-2 font-bold px-8" style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }}
                    data-testid="button-next-step-2">
                    Copywriting IA <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ══ STEP 2: Copy ══ */}
            {step === 2 && (
              <>
                {!settingsData?.hasKey && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
                    <span className="text-xl">🔑</span>
                    <div>
                      <p className="text-red-400 font-bold text-sm">Clé API OpenRouter requise</p>
                      <p className="text-slate-500 text-xs mt-1">Configurez votre clé pour activer la génération IA en Darija/Français/Arabe/Anglais.</p>
                      <button onClick={() => setShowSettings(true)} className="text-amber-400 text-xs font-semibold mt-2 hover:underline">
                        Configurer maintenant →
                      </button>
                    </div>
                  </div>
                )}

                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <Wand2 className="w-4 h-4" /> Génération IA du texte de vente
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Language selector */}
                    <div className="mb-5">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-2 flex items-center gap-1">
                        <Languages className="w-3.5 h-3.5" /> Langue de la copy
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {LANGUAGES.map(l => (
                          <button key={l.value} onClick={() => setLanguage(l.value)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border-2 transition-all text-center ${language === l.value ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 text-slate-400 hover:border-white/25"}`}
                            data-testid={`button-lang-${l.value}`}>
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button onClick={generateCopy} disabled={generatingCopy} className="w-full gap-2 font-bold mb-5"
                      style={{ background: generatingCopy ? "#333" : `linear-gradient(135deg, #7c3aed, #6d28d9)`, color: "#fff" }}
                      data-testid="button-generate-copy">
                      {generatingCopy ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</> : <><Wand2 className="w-4 h-4" /> ✨ Générer la Copy IA ({LANGUAGES.find(l => l.value === language)?.label})</>}
                    </Button>

                    {[
                      { key: "headline", label: "Titre principal", placeholder: "Titre accrocheur court…" },
                      { key: "subheadline", label: "Sous-titre", placeholder: "Bénéfice principal en une phrase…" },
                      { key: "hook", label: "Phrase d'accroche (Hook)", placeholder: "Touche la douleur du client…" },
                      { key: "problem", label: "Le problème", placeholder: "Décris le problème que résout ton produit…" },
                      { key: "scarcity", label: "Urgence / Rareté", placeholder: "Stock limité ! Offre expire ce soir…" },
                      { key: "cta", label: "Bouton CTA", placeholder: "Commander Maintenant" },
                      { key: "guarantee", label: "Garantie", placeholder: "Livraison rapide + Satisfait ou remboursé" },
                    ].map(f => (
                      <div key={f.key} className="mb-4">
                        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">{f.label}</label>
                        <textarea rows={f.key === "problem" ? 3 : 2}
                          value={copy[f.key] || ""}
                          onChange={e => updateCopy(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className="w-full rounded-md bg-white/10 border border-white/15 text-white text-sm p-3 resize-none focus:outline-none focus:border-amber-500/50"
                          data-testid={`input-copy-${f.key}`}
                        />
                      </div>
                    ))}

                    <div className="mb-4">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">Bénéfices (1 par ligne)</label>
                      <textarea rows={5}
                        value={(copy.solution || []).join("\n")}
                        onChange={e => updateCopy("solution", e.target.value.split("\n").filter(Boolean))}
                        placeholder={"Bénéfice 1\nBénéfice 2\nBénéfice 3\nBénéfice 4"}
                        className="w-full rounded-md bg-white/10 border border-white/15 text-white text-sm p-3 resize-none focus:outline-none focus:border-amber-500/50"
                        data-testid="input-copy-solution"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-2">Témoignages clients</label>
                      {(copy.testimonials || []).map((t: any, i: number) => (
                        <div key={i} className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={t.name || ""} onChange={e => updateCopy("testimonials", copy.testimonials.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))}
                              className="h-7 text-xs bg-white/10 border-white/15 text-white" placeholder="Nom" data-testid={`input-testimonial-name-${i}`} />
                            <Input value={t.city || ""} onChange={e => updateCopy("testimonials", copy.testimonials.map((x: any, j: number) => j === i ? { ...x, city: e.target.value } : x))}
                              className="h-7 text-xs bg-white/10 border-white/15 text-white" placeholder="Ville" data-testid={`input-testimonial-city-${i}`} />
                          </div>
                          <textarea rows={2} value={t.text || ""} onChange={e => updateCopy("testimonials", copy.testimonials.map((x: any, j: number) => j === i ? { ...x, text: e.target.value } : x))}
                            className="w-full rounded-md bg-white/10 border border-white/15 text-white text-xs p-2 resize-none focus:outline-none"
                            placeholder="Témoignage…" data-testid={`input-testimonial-text-${i}`} />
                        </div>
                      ))}
                      {(!copy.testimonials || copy.testimonials.length < 5) && (
                        <Button size="sm" variant="outline" className="border-white/15 text-slate-400 gap-1 text-xs"
                          onClick={() => updateCopy("testimonials", [...(copy.testimonials || []), { name: "", city: "", text: "", rating: 5 }])}
                          data-testid="button-add-testimonial">
                          <Plus className="w-3 h-3" /> Ajouter un témoignage
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="border-white/15 text-slate-300" data-testid="button-back-step-1">← Retour</Button>
                  <Button onClick={() => setStep(3)} className="gap-2 font-bold px-8" style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }} data-testid="button-next-step-3">
                    Design & Publier <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}

            {/* ══ STEP 3: Theme & Publish ══ */}
            {step === 3 && (
              <>
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <Smartphone className="w-4 h-4" /> Design & Thème
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-2">Thème de couleur</label>
                      <div className="flex gap-3 flex-wrap">
                        {[
                          { val: "navy", label: "Navy & Gold", preview: ["#0F1F3D", "#C5A059"] },
                          { val: "gold", label: "Gold & Navy", preview: ["#C5A059", "#0F1F3D"] },
                          { val: "custom", label: "Personnalisé", preview: [customColor, "#ffffff"] },
                        ].map(t => (
                          <button key={t.val} onClick={() => setTheme(t.val)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${theme === t.val ? "border-amber-400" : "border-white/10"}`}
                            data-testid={`button-theme-${t.val}`}>
                            <div className="flex gap-1">
                              {t.preview.map((c, i) => <div key={i} className="w-6 h-6 rounded-full" style={{ background: c }} />)}
                            </div>
                            <span className="text-xs text-slate-300 font-semibold">{t.label}</span>
                          </button>
                        ))}
                      </div>
                      {theme === "custom" && (
                        <div className="mt-3 flex items-center gap-3">
                          <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)}
                            className="w-12 h-10 rounded border-0 cursor-pointer" data-testid="input-custom-color" />
                          <span className="text-sm text-slate-400 font-mono">{customColor}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
                        URL de la page <span className="text-red-400">*</span>
                      </label>
                      <div className="flex items-center gap-0">
                        <span className="px-3 py-2 rounded-l-md text-xs text-slate-400 border border-white/15 border-r-0 bg-white/5 whitespace-nowrap">{window.location.origin}/lp/</span>
                        <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          className="rounded-l-none bg-white/10 border-white/15 text-white font-mono text-sm"
                          placeholder="mon-produit-premium" data-testid="input-slug" />
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Lettres minuscules, chiffres et tirets uniquement</p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => setStep(2)} className="border-white/15 text-slate-300" data-testid="button-back-step-2">← Retour</Button>
                  <Button onClick={handlePublish} disabled={savePage.isPending} className="gap-2 font-bold px-8"
                    style={{ background: `linear-gradient(135deg, #10b981, #059669)`, color: "#fff" }}
                    data-testid="button-publish">
                    {savePage.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Publication…</> : <><Globe className="w-4 h-4" /> {editingId ? "Mettre à jour" : "Publier la Page"}</>}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Right: phone preview */}
          <div className="hidden lg:block">
            <div className="sticky top-8">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold text-center mb-4 flex items-center justify-center gap-1.5">
                <Smartphone className="w-3 h-3" /> Aperçu mobile live
              </p>
              <PhonePreview page={currentPagePreview} />
              <p className="text-[10px] text-slate-600 text-center mt-4">Reel-style · Full-screen sections</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

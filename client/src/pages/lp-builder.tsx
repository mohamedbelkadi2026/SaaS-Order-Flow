import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Loader2, CheckCircle2, Copy,
  Trash2, Eye, Plus, Zap, ExternalLink,
  Settings, X, Key, Download, ImageIcon,
  ArrowRight, Star, ShoppingBag,
} from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";
const INFOGRAPHIC_WIDTH = 480;

const LANGUAGES = [
  { value: "darija",  label: "Darija 🇲🇦" },
  { value: "french",  label: "Français 🇫🇷" },
  { value: "arabic",  label: "العربية 🇸🇦" },
  { value: "english", label: "English 🇬🇧" },
];

/* ── Helpers ──────────────────────────────────────────────── */
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

/* ── Color extraction from File object (before upload) ─────── */
async function extractColorFromFile(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 80;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const buckets: Record<string, { r: number; g: number; b: number; n: number }> = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          if (r > 235 && g > 235 && b > 235) continue;
          if (r < 20  && g < 20  && b < 20)  continue;
          if (sat < 0.18) continue;
          const rq = Math.round(r / 32) * 32;
          const gq = Math.round(g / 32) * 32;
          const bq = Math.round(b / 32) * 32;
          const k = `${rq},${gq},${bq}`;
          if (!buckets[k]) buckets[k] = { r: 0, g: 0, b: 0, n: 0 };
          buckets[k].r += r; buckets[k].g += g; buckets[k].b += b; buckets[k].n++;
        }
        const top = Object.values(buckets).sort((a, b) => b.n - a.n)[0];
        URL.revokeObjectURL(url);
        if (top) {
          resolve(`rgb(${Math.round(top.r / top.n)},${Math.round(top.g / top.n)},${Math.round(top.b / top.n)})`);
        } else {
          resolve(GOLD);
        }
      } catch { URL.revokeObjectURL(url); resolve(GOLD); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(GOLD); };
    img.src = url;
  });
}

/* ── Image upload slot with color extraction ─────────────── */
function ProductImageUpload({ value, onChange, onColorExtracted }: {
  value: string;
  onChange(url: string): void;
  onColorExtracted(color: string): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handle(file: File) {
    setUploading(true);
    try {
      const color = await extractColorFromFile(file);
      onColorExtracted(color);
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
    <div>
      <div
        onClick={() => !uploading && ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        className="relative rounded-2xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden"
        style={{ minHeight: 180, borderColor: value ? "#C5A059" : "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
        data-testid="slot-product-image"
      >
        {value ? (
          <>
            <img src={value} alt="Product" className="w-full object-cover" style={{ height: 220 }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.7))" }} />
            <button
              onClick={e => { e.stopPropagation(); onChange(""); }}
              className="absolute top-3 right-3 rounded-full p-1.5 bg-red-500 hover:bg-red-600"
              data-testid="button-remove-image">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <div className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "rgba(0,0,0,0.6)" }}>
                ✅ Image uploadée
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            {uploading
              ? <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              : <ImageIcon className="w-10 h-10 text-slate-600" />}
            <div className="text-center">
              <p className="text-white font-semibold text-sm">
                {uploading ? "Analyse de la couleur dominante…" : "Cliquez ou glissez votre photo produit"}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {uploading ? "Upload en cours…" : "La couleur dominante sera extraite automatiquement ✨"}
              </p>
            </div>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
    </div>
  );
}

/* ── Infographic Canvas ─────────────────────────────────────
   All styles INLINE — required for html-to-image capture
─────────────────────────────────────────────────────────── */
interface InfographicProps {
  copy: any;
  themeColor: string;
  productName: string;
  priceDH: number;
  heroImageUrl: string;
  language: string;
}

const InfographicCanvas = ({ copy, themeColor, productName, priceDH, heroImageUrl, language }: InfographicProps) => {
  const c = copy || {};
  const isRtl = language === "arabic";
  const dir = isRtl ? "rtl" : "ltr";

  const textStyle = (size: number, weight: number | string, color: string, extra: any = {}) => ({
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: size,
    fontWeight: weight,
    color,
    margin: 0,
    padding: 0,
    lineHeight: 1.4,
    direction: dir as any,
    ...extra,
  });

  return (
    <div style={{ width: INFOGRAPHIC_WIDTH, background: "#ffffff", fontFamily: "'Segoe UI', Arial, sans-serif", direction: dir as any }}>

      {/* ── SECTION 1: HERO ─────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={productName}
            crossOrigin="anonymous"
            style={{ width: "100%", height: 290, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ height: 290, background: `linear-gradient(135deg, ${themeColor}44, ${themeColor}88)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 64 }}>🛍️</span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%)` }} />
        <div style={{ position: "absolute", top: 16, left: 16 }}>
          <div style={{ background: themeColor, borderRadius: 100, padding: "5px 14px", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>⚡ OFFRE LIMITÉE</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 20px 22px" }}>
          <p style={textStyle(26, 900, "#fff", { textShadow: "0 2px 12px rgba(0,0,0,0.8)", marginBottom: 6 })}>
            {c.headline || productName}
          </p>
          <p style={textStyle(13, 400, "rgba(255,255,255,0.85)", { textShadow: "0 1px 6px rgba(0,0,0,0.6)" })}>
            {c.subheadline || ""}
          </p>
        </div>
      </div>

      {/* ── PRICE RIBBON ────────────────────────────────────── */}
      <div style={{ background: themeColor, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={textStyle(13, 700, "#fff")}>🛒 {c.cta || "Commander"}</span>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 100, padding: "4px 16px" }}>
          <span style={textStyle(20, 900, "#fff")}>{priceDH} DH</span>
        </div>
      </div>

      {/* ── SECTION 2: BEFORE / AFTER ───────────────────────── */}
      <div style={{ background: "#f8f9fa", padding: "24px 20px" }}>
        <p style={textStyle(15, 800, "#1e293b", { textAlign: "center", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 })}>
          Avant / Après
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Before */}
          <div style={{ flex: 1, background: "#fff0f0", borderRadius: 12, padding: "14px 12px", border: "1.5px solid #fecaca" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>😔</span>
              <span style={textStyle(11, 800, "#ef4444", { textTransform: "uppercase", letterSpacing: 0.5 })}>Avant</span>
            </div>
            {(c.before || ["Sans ce produit…", "Résultats décevants", "Temps perdu"]).map((b: string, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>❌</span>
                <span style={textStyle(11, 500, "#374151")}>{b}</span>
              </div>
            ))}
          </div>
          {/* After */}
          <div style={{ flex: 1, background: `${themeColor}12`, borderRadius: 12, padding: "14px 12px", border: `1.5px solid ${themeColor}50` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🌟</span>
              <span style={textStyle(11, 800, themeColor, { textTransform: "uppercase", letterSpacing: 0.5 })}>Après</span>
            </div>
            {(c.after || ["Résultats visibles", "Satisfaction totale", "Économies réalisées"]).map((a: string, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>✅</span>
                <span style={textStyle(11, 500, "#374151")}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: EXPERT QUOTE ─────────────────────────── */}
      <div style={{ background: "#ffffff", padding: "24px 20px", borderTop: `3px solid ${themeColor}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: `linear-gradient(135deg, ${themeColor}, ${NAVY})`, display: "flex", alignItems: "center", justifyContent: "center", border: `3px solid ${themeColor}` }}>
              <span style={{ fontSize: 26 }}>👨‍⚕️</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", marginBottom: 6 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 13, color: "#f59e0b" }}>★</span>)}
            </div>
            <p style={textStyle(12, 400, "#374151", { fontStyle: "italic", marginBottom: 8, lineHeight: 1.5 })}>
              "{c.expertQuote || "Ce produit est remarquable. Je le recommande fortement à tous mes patients qui cherchent des résultats rapides et durables."}"
            </p>
            <p style={textStyle(12, 700, "#1e293b")}>{c.expertName || "Dr. Khalid M."}</p>
            <p style={textStyle(10, 400, "#64748b")}>{c.expertTitle || "Expert en santé et bien-être"}</p>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: FEATURES GRID ────────────────────────── */}
      <div style={{ background: "#fffbf5", padding: "24px 20px" }}>
        <p style={textStyle(14, 800, "#1e293b", { textAlign: "center", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.8 })}>
          Pourquoi ce produit ?
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {(c.features || [
            { icon: "⚡", title: "Rapide", desc: "Résultats visibles rapidement" },
            { icon: "🎯", title: "Efficace", desc: "Formule premium testée" },
            { icon: "✅", title: "Garanti", desc: "Satisfait ou remboursé" },
          ]).map((f: any, i: number) => (
            <div key={i} style={{ flex: 1, background: "#ffffff", borderRadius: 12, padding: "14px 10px", textAlign: "center", border: `1.5px solid ${themeColor}30`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{f.icon}</div>
              <p style={textStyle(11, 800, "#1e293b", { marginBottom: 4 })}>{f.title}</p>
              <p style={textStyle(9.5, 400, "#64748b", { lineHeight: 1.4 })}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 5: HOW IT WORKS ─────────────────────────── */}
      <div style={{ background: "#f0f4ff", padding: "24px 20px" }}>
        <p style={textStyle(14, 800, "#1e293b", { textAlign: "center", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.8 })}>
          Comment ça marche ?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(c.steps || [
            { title: "Commandez en ligne", desc: "Remplissez le formulaire en 30 secondes" },
            { title: "Livraison rapide", desc: "Livré chez vous en 24-48h partout au Maroc" },
            { title: "Profitez des résultats", desc: "Ressentez la différence dès la première utilisation" },
          ]).map((s: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "#ffffff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: themeColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={textStyle(15, 900, "#fff")}>{i + 1}</span>
              </div>
              <div>
                <p style={textStyle(12, 700, "#1e293b")}>{s.title}</p>
                <p style={textStyle(10.5, 400, "#64748b")}>{s.desc}</p>
              </div>
              {i < 2 && <div style={{ marginLeft: "auto", color: themeColor, fontSize: 16 }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 6: CTA ──────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a6e 100%)`, padding: "28px 20px", textAlign: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 16px", border: "1px solid rgba(255,255,255,0.15)" }}>
          <p style={textStyle(12, 600, "rgba(255,255,255,0.7)", { marginBottom: 4 })}>Prix spécial aujourd'hui</p>
          <p style={textStyle(38, 900, "#fff", { marginBottom: 2, letterSpacing: -1 })}>{priceDH} <span style={{ fontSize: 20 }}>DH</span></p>
          <p style={textStyle(10, 400, themeColor, { marginBottom: 16 })}>{c.scarcity || "⚠️ Stock limité — dépêchez-vous !"}</p>
          <div style={{ background: themeColor, borderRadius: 100, padding: "14px 24px", display: "inline-block", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", cursor: "pointer" }}>
            <span style={textStyle(14, 900, "#fff")}>🛒 {c.cta || "Commander Maintenant"} →</span>
          </div>
          <p style={textStyle(10, 400, "rgba(255,255,255,0.55)", { marginTop: 12 })}>
            {c.guarantee || "🚚 Livraison rapide · 💯 Satisfait ou remboursé"}
          </p>
        </div>
      </div>

      {/* ── FOOTER BRAND ────────────────────────────────────── */}
      <div style={{ background: "#0a0f1e", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={textStyle(9, 500, "rgba(255,255,255,0.3)")}>Créé avec TajerGrow · tajergrow.com</span>
      </div>
    </div>
  );
};

/* ── Settings Modal ──────────────────────────────────────── */
function SettingsModal({ onClose }: { onClose(): void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  const { data: settingsData } = useQuery<any>({ queryKey: ["/api/lp-builder/settings"] });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5" style={{ color: GOLD }} /> Clé API OpenRouter
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: settingsData?.hasKey ? "#10b981" : "#ef444444", background: settingsData?.hasKey ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)" }}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${settingsData?.hasKey ? "bg-green-500" : "bg-red-500"}`} />
            <p className="text-sm font-semibold" style={{ color: settingsData?.hasKey ? "#10b981" : "#ef4444" }}>
              {settingsData?.hasKey ? "Clé API configurée ✓" : "Aucune clé API configurée"}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block">Votre clé OpenRouter</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={show ? "text" : "password"} value={key} onChange={e => setKey(e.target.value)}
                placeholder="sk-or-v1-..." data-testid="input-api-key"
                className="w-full rounded-lg bg-white/10 border border-white/15 text-white text-sm p-3 pr-10 focus:outline-none focus:border-amber-500/50" />
              <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs">
                {show ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-600">Obtenez votre clé sur{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-white/15 text-slate-400">Annuler</Button>
          <Button onClick={() => saveKey.mutate(key)} disabled={!key.trim() || saveKey.isPending} className="flex-1 font-bold"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }} data-testid="button-save-api-key">
            {saveKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Step Bar ────────────────────────────────────────────── */
function StepBar({ current }: { current: number }) {
  const steps = ["Produit & Image", "Générer & Télécharger"];
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
          {i < steps.length - 1 && <div className={`w-14 h-px mx-1 mb-4 ${current > i + 1 ? "bg-amber-500" : "bg-slate-700"}`} />}
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function LpBuilder() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"list" | 1 | 2 | "done">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  /* Form state */
  const [productName, setProductName]   = useState("");
  const [priceDH, setPriceDH]           = useState("");
  const [description, setDescription]   = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [language, setLanguage]         = useState("darija");
  const [themeColor, setThemeColor]     = useState(GOLD);

  /* Copy state */
  const [copy, setCopy]                   = useState<any>({});
  const [generatingCopy, setGeneratingCopy] = useState(false);

  /* Download state */
  const infographicRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  /* Saved state */
  const [savedId, setSavedId] = useState<number | null>(null);

  const { data: pages = [], isLoading: pagesLoading } = useQuery<any[]>({ queryKey: ["/api/lp-builder/pages"] });
  const { data: settingsData } = useQuery<any>({ queryKey: ["/api/lp-builder/settings"] });

  const deletePage = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lp-builder/pages/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lp-builder/pages"] }); toast({ title: "Infographique supprimé." }); },
  });

  const savePage = useMutation({
    mutationFn: (body: any) => editingId
      ? apiRequest("PATCH", `/api/lp-builder/pages/${editingId}`, body)
      : apiRequest("POST", "/api/lp-builder/pages", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/lp-builder/pages"] });
      setSavedId(data.id);
      toast({ title: "✅ Infographique sauvegardé !" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setEditingId(null);
    setProductName(""); setPriceDH(""); setDescription("");
    setHeroImageUrl(""); setLanguage("darija"); setThemeColor(GOLD);
    setCopy({}); setSavedId(null);
    setStep(1);
  }

  function loadForEdit(p: any) {
    setEditingId(p.id);
    setProductName(p.productName || ""); setPriceDH(String(p.priceDH || ""));
    setDescription(p.description || ""); setHeroImageUrl(p.heroImageUrl || "");
    setCopy(p.copy || {}); setThemeColor(p.customColor || GOLD);
    setLanguage("darija");
    setStep(1);
  }

  async function generateCopy() {
    if (!productName) { toast({ title: "Entrez le nom du produit d'abord.", variant: "destructive" }); return; }
    if (!settingsData?.hasKey) {
      setShowSettings(true);
      toast({ title: "⚠️ Clé API requise", description: "Ajoutez votre clé OpenRouter pour activer l'IA.", variant: "destructive" });
      return;
    }
    setGeneratingCopy(true);
    try {
      const result = await apiRequest("POST", "/api/lp-builder/generate-copy", {
        productName, priceDH: parseFloat(priceDH) || 0, description, language,
      });
      setCopy(result);
      toast({ title: "✨ Infographique généré avec succès !" });
    } catch (e: any) {
      if (e.message?.includes("Clé API")) setShowSettings(true);
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingCopy(false);
    }
  }

  async function downloadAsPng() {
    if (!infographicRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(infographicRef.current, {
        pixelRatio: 2,
        quality: 1,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `infographic-${productName.toLowerCase().replace(/\s+/g, "-")}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "📥 Image téléchargée !", description: "L'infographique est prêt à être partagé." });
    } catch (e: any) {
      toast({ title: "Erreur export", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  function handleSave() {
    const slug = `ig-${productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40)}-${Date.now()}`.substring(0, 80);
    savePage.mutate({
      slug, productName, priceDH: parseFloat(priceDH) || 0, description,
      heroImageUrl, copy, customColor: themeColor, theme: "custom",
    });
  }

  const infographicProps: InfographicProps = {
    copy, themeColor, productName: productName || "Votre Produit",
    priceDH: parseFloat(priceDH) || 0, heroImageUrl, language,
  };

  /* ── PAGE: List ─────────────────────────────────────────── */
  if (step === "list") return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#0a1628" }}>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <ImageIcon className="w-6 h-6" style={{ color: GOLD }} />
              AI Infographic Generator
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Téléchargez une photo → obtenez une infographie professionnelle prête à l'emploi
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings(true)}
              className="gap-2 border-white/15 text-slate-400 hover:text-white" data-testid="button-settings-lp">
              <Settings className="w-4 h-4" />
              {!settingsData?.hasKey && <span className="w-2 h-2 rounded-full bg-red-500" />}
              API
            </Button>
            <Button onClick={resetForm} className="gap-2 font-bold"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #e8b56a 100%)`, color: NAVY }}
              data-testid="button-new-lp">
              <Plus className="w-4 h-4" /> Nouvelle Infographie
            </Button>
          </div>
        </div>

        {/* API warning */}
        {!settingsData?.hasKey && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-amber-400 font-bold text-sm">Clé API OpenRouter requise</p>
              <p className="text-slate-500 text-xs mt-1">Nécessaire pour la génération de texte IA. L'upload d'image et la mise en forme fonctionnent sans clé.</p>
              <button onClick={() => setShowSettings(true)} className="text-amber-400 text-xs font-semibold mt-2 hover:underline">
                Configurer →
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Infographies créées", val: (pages as any[]).length },
            { label: "Commandes générées", val: (pages as any[]).reduce((s: number, p: any) => s + (p.orderCount || 0), 0) },
            { label: "Langues supportées", val: "4" },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xl font-extrabold text-white">{val}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Pages list */}
        {pagesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        ) : (pages as any[]).length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-14 text-center">
            <ImageIcon className="w-14 h-14 text-slate-600 mx-auto mb-4" />
            <p className="text-white font-bold text-lg mb-2">Aucune infographie encore</p>
            <p className="text-slate-500 text-sm mb-6">
              Uploadez une photo produit → l'IA génère une infographie pro en 30 secondes
            </p>
            <Button onClick={resetForm} style={{ background: `linear-gradient(135deg, ${GOLD}, #e8b56a)`, color: NAVY }} className="font-bold gap-2">
              <Wand2 className="w-4 h-4" /> Créer ma première infographie
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(pages as any[]).map((p: any) => (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden" data-testid={`card-lp-${p.id}`}>
                <div className="flex gap-0">
                  {p.heroImageUrl ? (
                    <img src={p.heroImageUrl} alt={p.productName} className="w-24 object-cover shrink-0" style={{ height: 110 }} />
                  ) : (
                    <div className="w-24 shrink-0 flex items-center justify-center" style={{ background: `${p.customColor || GOLD}20`, height: 110 }}>
                      <ShoppingBag className="w-8 h-8" style={{ color: p.customColor || GOLD }} />
                    </div>
                  )}
                  <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-white truncate">{p.productName}</p>
                        <p className="font-bold text-base" style={{ color: p.customColor || GOLD }}>{p.priceDH} DH</p>
                      </div>
                      {p.customColor && (
                        <div className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                          style={{ background: p.customColor }} title="Couleur extraite" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-white/15 text-slate-300 hover:bg-white/10 gap-1"
                        onClick={() => loadForEdit(p)} data-testid={`button-edit-lp-${p.id}`}>
                        <Eye className="w-3 h-3" /> Éditer
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1 ml-auto"
                        onClick={() => { if (confirm("Supprimer ?")) deletePage.mutate(p.id); }}
                        data-testid={`button-delete-lp-${p.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── STEP 1: Product Info ───────────────────────────────── */
  if (step === 1) return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#0a1628" }}>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("list")} className="text-slate-500 hover:text-white transition-colors">
            ← Retour
          </button>
          <div className="flex-1"><StepBar current={1} /></div>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}
            className="text-slate-500 hover:text-white gap-1">
            <Settings className="w-3.5 h-3.5" />
            {!settingsData?.hasKey && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-white mb-1">📸 Photo produit</h2>
            <p className="text-slate-400 text-sm">La couleur dominante sera extraite automatiquement pour harmoniser l'infographie</p>
          </div>

          <ProductImageUpload
            value={heroImageUrl}
            onChange={setHeroImageUrl}
            onColorExtracted={setThemeColor}
          />

          {/* Color preview */}
          {themeColor !== GOLD && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
              <div className="w-8 h-8 rounded-full border border-white/20" style={{ background: themeColor }} />
              <div>
                <p className="text-sm font-semibold text-white">Couleur dominante extraite</p>
                <p className="text-xs text-slate-500">Utilisée pour les accents de l'infographie</p>
              </div>
              <button onClick={() => setThemeColor(GOLD)} className="ml-auto text-xs text-slate-500 hover:text-white">
                Réinitialiser
              </button>
            </div>
          )}

          {/* Product info */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">📝 Informations produit</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-1.5">
                  Nom du produit *
                </label>
                <input value={productName} onChange={e => setProductName(e.target.value)}
                  placeholder="ex: Crème Anti-Rides Premium" data-testid="input-product-name"
                  className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-600 text-sm p-3 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-1.5">
                  Prix (DH) *
                </label>
                <input type="number" value={priceDH} onChange={e => setPriceDH(e.target.value)}
                  placeholder="ex: 199" data-testid="input-price"
                  className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-600 text-sm p-3 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-1.5">
                  Description / Points clés (optionnel)
                </label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="ex: Sérum concentré, formule coréenne, résultats en 7 jours…" rows={2}
                  className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-600 text-sm p-3 focus:outline-none focus:border-amber-500/50 resize-none" />
              </div>
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-widest block mb-2">
              Langue du texte IA
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map(l => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className="rounded-xl border p-2.5 text-sm font-semibold transition-all"
                  style={{
                    borderColor: language === l.value ? themeColor : "rgba(255,255,255,0.1)",
                    background: language === l.value ? `${themeColor}20` : "rgba(255,255,255,0.03)",
                    color: language === l.value ? themeColor : "#64748b",
                  }}
                  data-testid={`button-lang-${l.value}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button
          onClick={() => setStep(2)}
          disabled={!productName || !priceDH}
          className="w-full py-4 text-base font-extrabold gap-2 rounded-2xl"
          style={{ background: productName && priceDH ? `linear-gradient(135deg, ${themeColor}, ${GOLD})` : undefined, color: NAVY }}
          data-testid="button-next-step">
          Générer l'Infographie <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );

  /* ── STEP 2: Generate + Preview + Download ──────────────── */
  if (step === 2) return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#0a1628" }}>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button onClick={() => setStep(1)} className="text-slate-500 hover:text-white transition-colors">
            ← Retour
          </button>
          <div className="flex-1"><StepBar current={2} /></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

          {/* LEFT: Controls */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Wand2 className="w-5 h-5" style={{ color: themeColor }} />
                  Génération IA
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  L'IA va écrire le texte de chaque section en <strong className="text-white">{LANGUAGES.find(l => l.value === language)?.label}</strong>
                </p>
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="w-8 h-8 rounded-full border-2 border-white/30 overflow-hidden cursor-pointer relative">
                  <input type="color" value={themeColor.startsWith("rgb") ? GOLD : themeColor}
                    onChange={e => setThemeColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  <div className="w-full h-full rounded-full" style={{ background: themeColor }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Couleur thème</p>
                  <p className="text-xs text-slate-500">Extraite automatiquement • personnalisable</p>
                </div>
              </div>

              <Button
                onClick={generateCopy}
                disabled={generatingCopy}
                className="w-full py-3 font-extrabold gap-2 rounded-xl"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${GOLD})`, color: NAVY }}
                data-testid="button-generate-copy">
                {generatingCopy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                  : <><Wand2 className="w-4 h-4" /> {Object.keys(copy).length > 0 ? "Régénérer le texte" : "Générer le texte IA"}</>
                }
              </Button>

              {!settingsData?.hasKey && (
                <button onClick={() => setShowSettings(true)} className="w-full text-center text-xs text-amber-400 hover:underline">
                  ⚠️ Configurer la clé API OpenRouter d'abord
                </button>
              )}
            </div>

            {/* Download + Save */}
            {Object.keys(copy).length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Exporter</h3>
                <Button
                  onClick={downloadAsPng}
                  disabled={downloading}
                  className="w-full py-3 font-extrabold gap-2 rounded-xl"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff" }}
                  data-testid="button-download-png">
                  {downloading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération de l'image…</>
                    : <><Download className="w-4 h-4" /> Télécharger en format IMAGE (PNG)</>
                  }
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={savePage.isPending}
                  variant="outline"
                  className="w-full py-2.5 font-semibold gap-2 rounded-xl border-white/15 text-slate-300 hover:bg-white/10"
                  data-testid="button-save-infographic">
                  {savePage.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde…</>
                    : savedId
                    ? <><CheckCircle2 className="w-4 h-4 text-green-400" /> Sauvegardé ✓</>
                    : <>💾 Sauvegarder dans mes infographies</>
                  }
                </Button>
              </div>
            )}

            {/* Infographic details summary */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-3">Résumé</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-xs">Produit</span>
                  <span className="text-white text-xs font-semibold truncate max-w-[60%]">{productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-xs">Prix</span>
                  <span className="text-white text-xs font-semibold">{priceDH} DH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-xs">Langue</span>
                  <span className="text-white text-xs font-semibold">{LANGUAGES.find(l => l.value === language)?.label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Couleur</span>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: themeColor }} />
                    <span className="text-white text-xs font-semibold">Auto-extraite</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Infographic Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white uppercase tracking-wider">Aperçu de l'infographie</p>
              <span className="text-xs text-slate-500">{INFOGRAPHIC_WIDTH}px × auto</span>
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#111" }}>
              {/* Scrollable preview */}
              <div style={{ maxHeight: "75vh", overflowY: "auto" }}>
                <div ref={infographicRef} style={{ width: INFOGRAPHIC_WIDTH, margin: "0 auto" }}>
                  <InfographicCanvas {...infographicProps} />
                </div>
              </div>
            </div>
            {Object.keys(copy).length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                <Wand2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Cliquez sur "Générer le texte IA" pour remplir l'infographie</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}

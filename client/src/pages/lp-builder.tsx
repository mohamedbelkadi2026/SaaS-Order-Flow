import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Loader2, X, Key, Download,
  ImageIcon, Settings, CheckCircle2, RefreshCw,
} from "lucide-react";

const GOLD   = "#C5A059";
const NAVY   = "#0F1F3D";
const W      = 480; // infographic pixel width

const LANGS  = [
  { v: "darija",  l: "Darija 🇲🇦"  },
  { v: "french",  l: "Français 🇫🇷" },
  { v: "arabic",  l: "العربية 🇸🇦"  },
  { v: "english", l: "English 🇬🇧"  },
];

/* ── Utilities ────────────────────────────────────────────── */
async function extractColor(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const S = 80;
        const cv = document.createElement("canvas");
        cv.width = S; cv.height = S;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        const bk: Record<string, { r:number; g:number; b:number; n:number }> = {};
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
          if (r>235&&g>235&&b>235) continue;
          if (r<20&&g<20&&b<20) continue;
          if (mx===0||(mx-mn)/mx<0.18) continue;
          const k = `${Math.round(r/40)*40},${Math.round(g/40)*40},${Math.round(b/40)*40}`;
          if (!bk[k]) bk[k]={r:0,g:0,b:0,n:0};
          bk[k].r+=r; bk[k].g+=g; bk[k].b+=b; bk[k].n++;
        }
        const t = Object.values(bk).sort((a,b)=>b.n-a.n)[0];
        URL.revokeObjectURL(url);
        resolve(t ? `rgb(${Math.round(t.r/t.n)},${Math.round(t.g/t.n)},${Math.round(t.b/t.n)})` : GOLD);
      } catch { URL.revokeObjectURL(url); resolve(GOLD); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(GOLD); };
    img.src = url;
  });
}

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const r = await fetch("/api/lp-builder/upload-image", { method:"POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message);
  return j.url as string;
}

/* ── Infographic Canvas (all inline styles for html-to-image) */
interface IProps {
  copy: any; color: string;
  name: string; price: number; img: string;
}

function Infographic({ copy:c, color, name, price, img }: IProps) {
  if (!c) return null;

  const txt = (sz:number, fw:number|string, cl:string, ex:any={}): any => ({
    fontFamily:"'Segoe UI',Arial,sans-serif", fontSize:sz,
    fontWeight:fw, color:cl, margin:0, padding:0, lineHeight:1.45, ...ex,
  });

  /* ── 1. HERO ────────────────────────────────────────────── */
  return (
    <div style={{ width:W, background:"#fff", fontFamily:"'Segoe UI',Arial,sans-serif" }}>

      {/* Header strip */}
      <div style={{ background:color, padding:"10px 20px", textAlign:"center" }}>
        <p style={txt(11,800,"#fff",{ textTransform:"uppercase", letterSpacing:2 })}>
          ⚡ OFFRE EXCLUSIVE · ÉDITION LIMITÉE ⚡
        </p>
      </div>

      {/* Hero image */}
      <div style={{ position:"relative", overflow:"hidden" }}>
        {img ? (
          <img src={img} alt={name} crossOrigin="anonymous"
            style={{ width:"100%", height:300, objectFit:"cover", display:"block" }} />
        ) : (
          <div style={{ height:300, background:`linear-gradient(135deg,${color}55,${color}99)`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:72 }}>🛍️</span>
          </div>
        )}
        {/* Dark overlay gradient */}
        <div style={{ position:"absolute", inset:0,
          background:"linear-gradient(to bottom,rgba(0,0,0,0) 30%,rgba(0,0,0,0.82) 100%)" }} />
        {/* Headline over image */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"18px 22px" }}>
          <p style={txt(28,900,"#fff",{
            textShadow:"0 2px 16px rgba(0,0,0,0.9)", marginBottom:6,
            lineHeight:1.2, letterSpacing:-0.5,
          })}>
            {c.headline || name}
          </p>
          <p style={txt(13,400,"rgba(255,255,255,0.85)",{
            textShadow:"0 1px 8px rgba(0,0,0,0.7)",
          })}>
            {c.subheadline || ""}
          </p>
        </div>
      </div>

      {/* Price ribbon */}
      <div style={{ background:NAVY, padding:"13px 22px",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <p style={txt(12,600,"rgba(255,255,255,0.7)")}>🛒 {c.cta || "Commander maintenant"}</p>
        <div style={{ background:color, borderRadius:100, padding:"5px 20px" }}>
          <p style={txt(22,900,"#fff")}>{price} <span style={{ fontSize:14 }}>DH</span></p>
        </div>
      </div>

      {/* ── 2. BEFORE / AFTER ──────────────────────────────── */}
      <div style={{ background:"#f7f8fa", padding:"26px 20px" }}>
        <p style={txt(13,800,"#1e293b",{
          textAlign:"center", marginBottom:18,
          textTransform:"uppercase", letterSpacing:1.2,
        })}>
          😔 Avant → 🌟 Après
        </p>
        <div style={{ display:"flex", gap:10 }}>
          {/* BEFORE */}
          <div style={{ flex:1, background:"#fff0f0", borderRadius:14, padding:"16px 14px",
            border:"2px solid #fecaca" }}>
            <p style={txt(10,800,"#ef4444",{
              textTransform:"uppercase", letterSpacing:0.8, marginBottom:12,
            })}>❌ Sans ce produit</p>
            {(c.before||["Résultats décevants","Perte de temps et d'argent","Frustration quotidienne"])
              .map((b:string,i:number)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:9 }}>
                <span style={{ fontSize:13, flexShrink:0 }}>✗</span>
                <p style={txt(11,500,"#374151",{ lineHeight:1.4 })}>{b}</p>
              </div>
            ))}
          </div>
          {/* AFTER */}
          <div style={{ flex:1, background:`${color}14`, borderRadius:14, padding:"16px 14px",
            border:`2px solid ${color}55` }}>
            <p style={txt(10,800,color,{
              textTransform:"uppercase", letterSpacing:0.8, marginBottom:12,
            })}>✅ Avec ce produit</p>
            {(c.after||["Résultats rapides et visibles","Satisfaction garantie","Confiance retrouvée"])
              .map((a:string,i:number)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:9 }}>
                <span style={{ fontSize:13, flexShrink:0, color }}>✓</span>
                <p style={txt(11,500,"#374151",{ lineHeight:1.4 })}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3. FEATURES ────────────────────────────────────── */}
      <div style={{ background:"#fffbf4", padding:"26px 20px" }}>
        <p style={txt(13,800,"#1e293b",{
          textAlign:"center", marginBottom:6,
          textTransform:"uppercase", letterSpacing:1.2,
        })}>Pourquoi choisir ce produit ?</p>
        <p style={txt(11,400,"#64748b",{ textAlign:"center", marginBottom:18 })}>
          3 avantages qui font la différence
        </p>
        <div style={{ display:"flex", gap:10 }}>
          {(c.features||[
            {icon:"⚡",title:"Ultra rapide",desc:"Des résultats visibles en quelques jours"},
            {icon:"🎯",title:"Ciblé & Efficace",desc:"Formule premium testée et approuvée"},
            {icon:"💎",title:"Qualité premium",desc:"Matériaux de haute qualité durables"},
          ]).map((f:any,i:number)=>(
            <div key={i} style={{ flex:1, background:"#fff", borderRadius:14, padding:"16px 12px",
              textAlign:"center", border:`1.5px solid ${color}35`,
              boxShadow:"0 3px 12px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize:30, marginBottom:8 }}>{f.icon}</div>
              <p style={txt(11,800,"#1e293b",{ marginBottom:5 })}>{f.title}</p>
              <p style={txt(9.5,400,"#64748b",{ lineHeight:1.45 })}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. TRUST / EXPERT ──────────────────────────────── */}
      <div style={{ background:"#fff", padding:"26px 20px",
        borderTop:`4px solid ${color}`, borderBottom:`1px solid #f1f5f9` }}>
        <p style={txt(13,800,"#1e293b",{
          textAlign:"center", marginBottom:18,
          textTransform:"uppercase", letterSpacing:1.2,
        })}>L'avis d'un expert</p>
        <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
          {/* Avatar */}
          <div style={{ flexShrink:0 }}>
            <div style={{ width:66, height:66, borderRadius:"50%",
              background:`linear-gradient(135deg,${color},${NAVY})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              border:`3px solid ${color}`, boxShadow:`0 4px 14px ${color}55` }}>
              <span style={{ fontSize:30 }}>👨‍⚕️</span>
            </div>
            <div style={{ display:"flex", justifyContent:"center", marginTop:5 }}>
              {[0,1,2,3,4].map(i=>(
                <span key={i} style={{ fontSize:11, color:"#f59e0b" }}>★</span>
              ))}
            </div>
          </div>
          {/* Quote */}
          <div style={{ flex:1 }}>
            <p style={txt(12,400,"#374151",{
              fontStyle:"italic", lineHeight:1.55, marginBottom:10,
              background:"#f8fafc", padding:"12px 14px", borderRadius:10,
              borderLeft:`3px solid ${color}`,
            })}>
              "{c.expertQuote||"Ce produit est remarquable. Je le recommande vivement à tous mes patients pour des résultats rapides et durables."}"
            </p>
            <p style={txt(12,700,"#1e293b")}>{c.expertName||"Dr. Khalid M."}</p>
            <p style={txt(10,400,"#64748b")}>{c.expertTitle||"Expert en santé et bien-être"}</p>
          </div>
        </div>
      </div>

      {/* ── 5. HOW IT WORKS ────────────────────────────────── */}
      <div style={{ background:"#f0f4ff", padding:"26px 20px" }}>
        <p style={txt(13,800,"#1e293b",{
          textAlign:"center", marginBottom:18,
          textTransform:"uppercase", letterSpacing:1.2,
        })}>Comment ça marche ?</p>
        {(c.steps||[
          {title:"Commandez facilement",desc:"Remplissez le formulaire en 30 secondes"},
          {title:"Livraison express",desc:"Livré chez vous en 24–48h partout au Maroc"},
          {title:"Profitez des résultats",desc:"Ressentez la différence dès la première utilisation"},
        ]).map((s:any,i:number)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:14,
            background:"#fff", borderRadius:12, padding:"12px 16px", marginBottom:10,
            boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ width:38, height:38, borderRadius:"50%", background:color,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <p style={txt(16,900,"#fff")}>{i+1}</p>
            </div>
            <div>
              <p style={txt(12,700,"#1e293b")}>{s.title}</p>
              <p style={txt(10.5,400,"#64748b")}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 6. OFFER / CTA ─────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg,${NAVY} 0%,#1a2f5a 100%)`,
        padding:"30px 22px", textAlign:"center" }}>
        <p style={txt(11,600,"rgba(255,255,255,0.55)",{ marginBottom:4 })}>
          🔥 PRIX SPÉCIAL AUJOURD'HUI
        </p>
        <p style={txt(48,900,"#fff",{
          letterSpacing:-1.5, marginBottom:0,
          textShadow:`0 0 30px ${color}99`,
        })}>
          {price} <span style={{ fontSize:22 }}>DH</span>
        </p>
        <p style={txt(11,500,color,{ marginBottom:20 })}>
          {c.scarcity||"⚠️ Stock limité — dépêchez-vous !"}
        </p>
        <div style={{ background:color, borderRadius:100, padding:"16px 32px",
          display:"inline-block", boxShadow:`0 6px 24px ${color}88` }}>
          <p style={txt(15,900,"#fff")}>🛒 {c.cta||"Commander Maintenant"} →</p>
        </div>
        <div style={{ marginTop:18, display:"flex", justifyContent:"center", gap:20 }}>
          {["🚚 Livraison rapide","💯 Satisfait ou remboursé","🔒 Paiement à la livraison"]
            .map((t,i)=>(
            <p key={i} style={txt(9,500,"rgba(255,255,255,0.45)")}>{t}</p>
          ))}
        </div>
      </div>

      {/* Footer brand */}
      <div style={{ background:"#07101f", padding:"8px 20px", textAlign:"center" }}>
        <p style={txt(8,400,"rgba(255,255,255,0.2)")}>
          Créé avec TajerGrow · tajergrow.com
        </p>
      </div>

    </div>
  );
}

/* ── Settings Modal ──────────────────────────────────────── */
function SettingsModal({ onClose }: { onClose(): void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const { data: sd } = useQuery<any>({ queryKey: ["/api/lp-builder/settings"] });

  const save = useMutation({
    mutationFn: (k:string) => fetch("/api/lp-builder/settings",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({openrouterApiKey:k}),
    }).then(r=>r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey:["/api/lp-builder/settings"] });
      toast({ title:"Clé API sauvegardée !" });
      setKey("");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:"rgba(0,0,0,0.8)", backdropFilter:"blur(10px)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-5"
        style={{ background:"#0e1c35" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5" style={{ color:GOLD }} /> Clé API OpenRouter
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-xl border p-3"
          style={{ borderColor: sd?.hasKey ? "#10b98150" : "#ef444450",
            background: sd?.hasKey ? "#10b98110" : "#ef444410" }}>
          <div className={`w-2.5 h-2.5 rounded-full ${sd?.hasKey ? "bg-green-500" : "bg-red-500"}`} />
          <p className="text-sm font-semibold" style={{ color: sd?.hasKey ? "#10b981" : "#ef4444" }}>
            {sd?.hasKey ? "Clé API configurée ✓" : "Aucune clé configurée"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-bold uppercase tracking-widest block">
            Votre clé OpenRouter
          </label>
          <div className="relative">
            <input type={show ? "text" : "password"} value={key} onChange={e=>setKey(e.target.value)}
              placeholder="sk-or-v1-..." data-testid="input-api-key"
              className="w-full rounded-xl border border-white/15 text-white text-sm p-3 pr-10 focus:outline-none focus:border-amber-500/50"
              style={{ background:"rgba(255,255,255,0.08)" }} />
            <button onClick={()=>setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">
              {show ? "🙈" : "👁️"}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Obtenez votre clé sur{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
              className="text-amber-400 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-white/15 text-slate-400">
            Annuler
          </Button>
          <Button onClick={()=>save.mutate(key)} disabled={!key.trim()||save.isPending}
            className="flex-1 font-bold" data-testid="button-save-api-key"
            style={{ background:`linear-gradient(135deg,${GOLD},#e8b56a)`, color:NAVY }}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */
export default function LpBuilder() {
  const { toast } = useToast();

  /* Form state */
  const [name, setName]           = useState("");
  const [price, setPrice]         = useState("");
  const [desc, setDesc]           = useState("");
  const [lang, setLang]           = useState("darija");
  const [imgUrl, setImgUrl]       = useState("");
  const [color, setColor]         = useState(GOLD);
  const [uploading, setUploading] = useState(false);

  /* Generation state */
  const [copy, setCopy]           = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  const { data: sd } = useQuery<any>({ queryKey:["/api/lp-builder/settings"] });

  /* Upload image + extract color ─────────────────────────── */
  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const [col, url] = await Promise.all([extractColor(file), uploadImage(file)]);
      setColor(col);
      setImgUrl(url);
    } catch (e:any) {
      toast({ title:"Erreur upload", description:e.message, variant:"destructive" });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  /* Generate copy + auto-download ────────────────────────── */
  async function generate() {
    if (!name) {
      toast({ title:"Nom du produit requis", variant:"destructive" }); return;
    }
    if (!sd?.hasKey) {
      setShowSettings(true);
      toast({ title:"⚠️ Clé API requise",
        description:"Configurez votre clé OpenRouter pour activer la génération IA.",
        variant:"destructive" }); return;
    }

    setGenerating(true);
    setCopy(null);

    try {
      const res = await fetch("/api/lp-builder/generate-copy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ productName:name, priceDH:parseFloat(price)||0, description:desc, language:lang }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Erreur génération");
      setCopy(j);

      /* Wait one paint then auto-download */
      await new Promise(r => setTimeout(r, 250));
      await downloadPng(j);
    } catch (e:any) {
      if (e.message?.includes("Clé API")) setShowSettings(true);
      toast({ title:"Erreur IA", description:e.message, variant:"destructive" });
    } finally {
      setGenerating(false);
    }
  }

  /* PNG download ─────────────────────────────────────────── */
  async function downloadPng(forcedCopy?: any) {
    if (!previewRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(previewRef.current, {
        pixelRatio: 2.5,
        quality: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.download = `infographic-${name.toLowerCase().replace(/\s+/g,"-") || "produit"}.png`;
      a.href = dataUrl;
      a.click();
      toast({ title:"📥 Image téléchargée !", description:"L'infographique prêt-à-utiliser est dans vos téléchargements." });
    } catch (e:any) {
      toast({ title:"Erreur export", description:e.message, variant:"destructive" });
    }
  }

  const infographicReady = copy !== null;

  /* ─────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background:"#080f1e" }}>
      {showSettings && <SettingsModal onClose={()=>setShowSettings(false)} />}

      {/* ── Top Bar ─────────────────────────────────────── */}
      <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between"
        style={{ background:"#0c1729" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background:`linear-gradient(135deg,${GOLD},#e8b56a)` }}>
            <ImageIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white">AI Infographic Generator</h1>
            <p className="text-[10px] text-slate-500">
              Photo + IA → Image professionnelle prête à l'emploi
            </p>
          </div>
        </div>
        <button onClick={()=>setShowSettings(true)} data-testid="button-settings-lp"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20">
          <Settings className="w-3.5 h-3.5" />
          API
          {!sd?.hasKey && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        </button>
      </div>

      {/* ── Main layout ─────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row min-h-[calc(100vh-57px)]">

        {/* ══ LEFT PANEL: Controls ════════════════════════ */}
        <div className="xl:w-96 xl:min-h-full border-r border-white/8 p-5 space-y-5 overflow-y-auto"
          style={{ background:"#0c1729" }}>

          {/* API key warning */}
          {!sd?.hasKey && (
            <button onClick={()=>setShowSettings(true)}
              className="w-full text-left rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 space-y-1 hover:border-amber-500/40 transition-colors">
              <p className="text-amber-400 font-bold text-xs">⚠️ Clé API requise pour l'IA</p>
              <p className="text-slate-500 text-[11px]">Cliquez pour configurer OpenRouter →</p>
            </button>
          )}

          {/* ── Image Upload ─────────────────────────────── */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              📸 Photo du produit
            </label>
            <DropZone value={imgUrl} uploading={uploading} onFile={handleFile} onClear={()=>{setImgUrl(""); setColor(GOLD);}} />
            {color !== GOLD && (
              <div className="mt-2.5 flex items-center gap-2.5 p-2 rounded-lg border border-white/8"
                style={{ background:"rgba(255,255,255,0.03)" }}>
                <div className="w-5 h-5 rounded-full border border-white/20 flex-shrink-0"
                  style={{ background:color }} />
                <p className="text-[11px] text-slate-400">Couleur extraite automatiquement</p>
                <button onClick={()=>setColor(GOLD)}
                  className="ml-auto text-[10px] text-slate-600 hover:text-slate-400">reset</button>
              </div>
            )}
          </div>

          {/* ── Product Info ─────────────────────────────── */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              📝 Produit
            </label>
            <input value={name} onChange={e=>setName(e.target.value)}
              placeholder="Nom du produit *" data-testid="input-product-name"
              className="w-full rounded-xl border border-white/12 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
              style={{ background:"rgba(255,255,255,0.06)" }} />
            <input type="number" value={price} onChange={e=>setPrice(e.target.value)}
              placeholder="Prix en DH *" data-testid="input-price"
              className="w-full rounded-xl border border-white/12 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
              style={{ background:"rgba(255,255,255,0.06)" }} />
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
              placeholder="Points clés / description (optionnel)"
              className="w-full rounded-xl border border-white/12 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/50 placeholder-slate-600 resize-none"
              style={{ background:"rgba(255,255,255,0.06)" }} />
          </div>

          {/* ── Language ─────────────────────────────────── */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              🌐 Langue du texte
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map(l=>(
                <button key={l.v} onClick={()=>setLang(l.v)}
                  className="rounded-xl border py-2 text-xs font-semibold transition-all"
                  style={{
                    borderColor: lang===l.v ? color : "rgba(255,255,255,0.1)",
                    background: lang===l.v ? `${color}20` : "rgba(255,255,255,0.04)",
                    color: lang===l.v ? color : "#64748b",
                  }}
                  data-testid={`button-lang-${l.v}`}>
                  {l.l}
                </button>
              ))}
            </div>
          </div>

          {/* ── Manual color override ────────────────────── */}
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              🎨 Couleur thème
            </label>
            <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white/20 cursor-pointer ml-auto">
              <input type="color" value={color.startsWith("rgb") ? GOLD : color}
                onChange={e=>setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              <div className="w-full h-full rounded-full" style={{ background:color }} />
            </div>
          </div>

          {/* ── MAIN GENERATE BUTTON ─────────────────────── */}
          <Button onClick={generate} disabled={generating||uploading||!name||!price}
            className="w-full py-5 text-base font-extrabold gap-3 rounded-2xl shadow-lg"
            style={{
              background: (name&&price&&!generating) ? `linear-gradient(135deg,${color} 0%,${GOLD} 100%)` : undefined,
              color: NAVY,
              opacity: (!name||!price) ? 0.5 : 1,
              boxShadow: (name&&price) ? `0 8px 32px ${color}55` : undefined,
            }}
            data-testid="button-generate-infographic">
            {generating
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Génération en cours…</>
              : <><Wand2 className="w-5 h-5" /> Générer l'Infographie IA</>
            }
          </Button>

          {/* Download again (after first generation) */}
          {infographicReady && !generating && (
            <Button onClick={()=>downloadPng()} variant="outline"
              className="w-full gap-2 border-white/15 text-slate-300 hover:bg-white/8 font-semibold"
              data-testid="button-redownload">
              <Download className="w-4 h-4" /> Retélécharger l'image
            </Button>
          )}

          {/* Status */}
          {infographicReady && !generating && (
            <div className="flex items-center gap-2 justify-center py-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <p className="text-green-400 text-xs font-semibold">Image prête · 480×auto px · Résolution 2.5×</p>
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL: Infographic Preview ═══════════ */}
        <div className="flex-1 flex flex-col items-center overflow-auto py-8 px-4"
          style={{ background:"#080f1e" }}>

          {!infographicReady && !generating && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto space-y-5 py-20">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center border-2 border-dashed border-white/10"
                style={{ background:"rgba(255,255,255,0.02)" }}>
                <ImageIcon className="w-10 h-10 text-slate-700" />
              </div>
              <div>
                <p className="text-white font-bold text-lg">Votre infographie apparaîtra ici</p>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  Remplissez le formulaire à gauche, uploadez une photo produit et cliquez sur{" "}
                  <strong className="text-amber-400">"Générer l'Infographie IA"</strong>.<br />
                  L'image sera téléchargée automatiquement.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[
                  { n:"1", t:"Uploadez une photo", i:"📸" },
                  { n:"2", t:"Cliquez Générer", i:"🤖" },
                  { n:"3", t:"Image téléchargée", i:"📥" },
                ].map(s=>(
                  <div key={s.n} className="rounded-xl border border-white/8 p-3 text-center"
                    style={{ background:"rgba(255,255,255,0.03)" }}>
                    <p className="text-2xl mb-1">{s.i}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">{s.t}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-white/5" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
                  style={{ borderTopColor: color }} />
                <div className="absolute inset-3 rounded-full flex items-center justify-center"
                  style={{ background:`${color}20` }}>
                  <Wand2 className="w-6 h-6" style={{ color }} />
                </div>
              </div>
              <p className="text-white font-bold text-lg">L'IA crée votre infographie…</p>
              <div className="space-y-1.5 text-center">
                {["Analyse du produit","Génération du texte IA","Mise en page automatique","Téléchargement immédiat"].map((t,i)=>(
                  <p key={i} className="text-slate-500 text-xs">✦ {t}</p>
                ))}
              </div>
            </div>
          )}

          {infographicReady && (
            <div className="w-full max-w-xl mx-auto space-y-4">
              {/* Preview header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm">Aperçu de l'infographie</p>
                  <p className="text-slate-500 text-xs">{W}px × auto · prêt à télécharger</p>
                </div>
                <button onClick={generate} disabled={generating}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Régénérer
                </button>
              </div>

              {/* Preview box */}
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                style={{ background:"#111" }}>
                {/* Scrollable preview container */}
                <div style={{ maxHeight:"80vh", overflowY:"auto" }}>
                  {/* The div we capture for the PNG */}
                  <div ref={previewRef} style={{ width:W, margin:"0 auto" }}>
                    <Infographic copy={copy} color={color} name={name}
                      price={parseFloat(price)||0} img={imgUrl} />
                  </div>
                </div>
              </div>

              {/* Download button below preview */}
              <Button onClick={()=>downloadPng()}
                className="w-full py-4 text-base font-extrabold gap-2 rounded-2xl"
                style={{ background:"linear-gradient(135deg,#10b981,#059669)", color:"#fff",
                  boxShadow:"0 6px 24px rgba(16,185,129,0.4)" }}
                data-testid="button-download-png">
                <Download className="w-5 h-5" /> Télécharger en format IMAGE (PNG)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Drop Zone ───────────────────────────────────────────── */
function DropZone({ value, uploading, onFile, onClear }: {
  value:string; uploading:boolean;
  onFile(f:File):void; onClear():void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={()=>!uploading&&ref.current?.click()}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)onFile(f);}}
      className="relative rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden"
      style={{ minHeight:160, borderColor:value?"#C5A05980":"rgba(255,255,255,0.1)",
        background:"rgba(255,255,255,0.03)" }}
      data-testid="slot-product-image">
      {value ? (
        <>
          <img src={value} alt="Product" className="w-full object-cover" style={{ height:200 }} />
          <div style={{ position:"absolute", inset:0,
            background:"linear-gradient(to bottom,transparent 55%,rgba(0,0,0,0.65))" }} />
          <button onClick={e=>{e.stopPropagation();onClear();}}
            className="absolute top-2.5 right-2.5 rounded-full p-1.5 bg-red-500 hover:bg-red-600"
            data-testid="button-remove-image">
            <X className="w-3 h-3 text-white" />
          </button>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background:"rgba(0,0,0,0.65)" }}>
            <CheckCircle2 className="w-3 h-3 text-green-400" />
            <span className="text-xs text-white font-semibold">Photo uploadée</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8">
          {uploading
            ? <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            : <Upload className="w-8 h-8 text-slate-600" />}
          <div className="text-center">
            <p className="text-white text-sm font-semibold">
              {uploading ? "Analyse + Upload…" : "Cliquez ou glissez une image"}
            </p>
            <p className="text-slate-600 text-xs mt-1">
              {uploading ? "Extraction de la couleur dominante…" : "La couleur du thème sera extraite auto ✨"}
            </p>
          </div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);}} />
    </div>
  );
}

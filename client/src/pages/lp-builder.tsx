import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Loader2, X, Key, Download,
  ImageIcon, Settings, CheckCircle2, RefreshCw,
} from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "#0F1F3D";
const W    = 480;

const LANGS = [
  { v: "darija",  l: "Darija 🇲🇦"  },
  { v: "french",  l: "Français 🇫🇷" },
  { v: "arabic",  l: "العربية 🇸🇦"  },
  { v: "english", l: "English 🇬🇧"  },
];

/* ══════════════════════════════════════════════════════════
   COLOR PALETTE  — from extracted dominant color
══════════════════════════════════════════════════════════ */
interface Palette {
  primary: string; primaryDark: string; primaryDeep: string;
  primaryLight: string; primaryMuted: string;
  dark: string; darkMid: string; light: string;
  text: string; textMid: string; textMuted: string;
}

function buildPalette(base: string): Palette {
  let r = 197, g = 160, b = 89;
  const m = base.match(/\d+/g);
  if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }

  const rn = r/255, gn = g/255, bn = b/255;
  const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
  const lv = (max+min)/2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max-min;
    s = lv > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case rn: h = ((gn-bn)/d+(gn<bn?6:0))/6; break;
      case gn: h = ((bn-rn)/d+2)/6; break;
      case bn: h = ((rn-gn)/d+4)/6; break;
    }
  }
  const hd = h*360, sd = s*100, ld = lv*100;

  function hsl(hh:number, ss:number, ll:number): string {
    hh/=360; ss/=100; ll/=100;
    if (ss===0) { const v=Math.round(ll*255); return `rgb(${v},${v},${v})`; }
    const q = ll<0.5 ? ll*(1+ss) : ll+ss-ll*ss, p2 = 2*ll-q;
    const hue = (v:number) => {
      v=((v%1)+1)%1;
      if(v<1/6) return p2+(q-p2)*6*v;
      if(v<1/2) return q;
      if(v<2/3) return p2+(q-p2)*(2/3-v)*6;
      return p2;
    };
    return `rgb(${Math.round(hue(hh+1/3)*255)},${Math.round(hue(hh)*255)},${Math.round(hue(hh-1/3)*255)})`;
  }

  return {
    primary:       base,
    primaryDark:   hsl(hd, Math.min(sd*1.15,100), Math.max(ld*0.58,14)),
    primaryDeep:   hsl(hd, Math.min(sd*1.25,100), Math.max(ld*0.33,9)),
    primaryLight:  hsl(hd, Math.min(sd*0.5,100),  Math.min(ld*1.5,92)),
    primaryMuted:  hsl(hd, Math.min(sd*0.2,100),  Math.min(ld*1.75,97)),
    dark:    "#07101f",
    darkMid: "#0f1e38",
    light:   "#f8f7f4",
    text:    "#0f172a",
    textMid: "#334155",
    textMuted:"#64748b",
  };
}

/* ══════════════════════════════════════════════════════════
   SVG ICONS  — all inline, zero external dependencies
══════════════════════════════════════════════════════════ */
const IconCheck = ({ sz=18, bg="#10b981" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill={bg} />
    <path d="M7 12.5l3.5 3.5L17 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconX = ({ sz=18 }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill="#e2e8f0" />
    <path d="M8 8l8 8M16 8l-8 8" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
const IconStar = ({ sz=16, c="#f59e0b" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
  </svg>
);
const IconShield = ({ sz=22, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);
const IconZap = ({ sz=22, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <polygon points="13,2 4.5,13.5 11,13.5 11,22 19.5,10.5 13,10.5"/>
  </svg>
);
const IconLeaf = ({ sz=22, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
  </svg>
);
const IconTruck = ({ sz=20, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
    <rect x="1" y="3" width="15" height="13" rx="1"/>
    <path d="M16 8h4l3 3v5h-7z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);
const IconRefund = ({ sz=20, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
  </svg>
);
const IconLock = ({ sz=20, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconQuote = ({ sz=36, c="rgba(255,255,255,0.12)" }) => (
  <svg width={sz} height={sz} viewBox="0 0 36 36" fill={c}>
    <path d="M0 21c0-8.284 6.716-15 15-15v6c-4.971 0-9 4.029-9 9h9v15H0V21zm21 0c0-8.284 6.716-15 15-15v6c-4.971 0-9 4.029-9 9h9v15H21V21z"/>
  </svg>
);
const IconAward = ({ sz=20, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
  </svg>
);
const IconPackage = ({ sz=20, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconSparkle = ({ sz=22, c="#fff" }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
);

/* ══════════════════════════════════════════════════════════
   WAVE DIVIDERS
══════════════════════════════════════════════════════════ */
const Wave1 = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 480 50" preserveAspectRatio="none"
    style={{ display:"block", width:W, height:50, marginTop:-1 }}>
    <path d="M0,30 C80,60 180,0 280,30 C360,55 430,10 480,28 L480,50 L0,50 Z" fill={fill} />
  </svg>
);
const Wave2 = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 480 50" preserveAspectRatio="none"
    style={{ display:"block", width:W, height:50, marginTop:-1 }}>
    <path d="M0,22 C100,55 220,0 360,35 C410,48 450,20 480,30 L480,50 L0,50 Z" fill={fill} />
  </svg>
);
const AngleCut = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 480 36" preserveAspectRatio="none"
    style={{ display:"block", width:W, height:36, marginTop:-1 }}>
    <polygon points="0,36 480,0 480,36" fill={fill} />
  </svg>
);
const AngleCutTop = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 480 36" preserveAspectRatio="none"
    style={{ display:"block", width:W, height:36, marginBottom:-1 }}>
    <polygon points="0,0 480,36 0,36" fill={fill} />
  </svg>
);

/* ══════════════════════════════════════════════════════════
   DOCTOR AVATAR  — CSS + SVG, no emojis
══════════════════════════════════════════════════════════ */
function DoctorAvatar({ p }: { p: Palette }) {
  return (
    <div style={{ position:"relative", display:"inline-block" }}>
      <div style={{
        width:76, height:76, borderRadius:"50%",
        background:`linear-gradient(150deg, ${p.primaryLight} 0%, ${p.primary} 45%, ${p.primaryDeep} 100%)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:`0 0 0 3px white, 0 0 0 6px ${p.primary}50, 0 12px 28px ${p.primaryDeep}80`,
        position:"relative", overflow:"hidden",
      }}>
        {/* Lab coat silhouette */}
        <svg width="48" height="52" viewBox="0 0 48 52" fill="none">
          <circle cx="24" cy="14" r="10" fill="rgba(255,255,255,0.95)" />
          <path d="M8 52C8 40 14 36 24 36C34 36 40 40 40 52Z" fill="rgba(255,255,255,0.95)" />
          <rect x="20" y="30" width="8" height="14" fill="rgba(255,255,255,0.95)" />
        </svg>
      </div>
      {/* Verified MD badge */}
      <div style={{
        position:"absolute", bottom:-3, right:-3,
        width:26, height:26, borderRadius:"50%",
        background:`linear-gradient(135deg, ${p.primary}, ${p.primaryDark})`,
        border:"3px solid white", display:"flex", alignItems:"center",
        justifyContent:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <span style={{ fontSize:7.5, fontWeight:900, color:"#fff",
          fontFamily:"'Montserrat',sans-serif", letterSpacing:0.5 }}>MD</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   INFOGRAPHIC CANVAS  — Professional marketing poster
══════════════════════════════════════════════════════════ */
interface IProps { copy:any; color:string; name:string; price:number; img:string; }

function Infographic({ copy:c, color, name, price, img }: IProps) {
  if (!c) return null;
  const p = buildPalette(color);

  const F = (family: string, sz: number, fw: number|string, cl: string, ex: any={}): any => ({
    fontFamily: family, fontSize: sz, fontWeight: fw, color: cl,
    margin:0, padding:0, lineHeight:1.3, ...ex,
  });
  const MONT = "'Montserrat','Segoe UI',Arial,sans-serif";
  const INTER = "'Inter','Segoe UI',Arial,sans-serif";

  /* ── HERO ─────────────────────────────────────────────── */
  return (
    <div style={{ width:W, background:p.dark, fontFamily:INTER, overflow:"hidden" }}>

      {/* Top brand strip */}
      <div style={{ background:p.primary, padding:"7px 20px", textAlign:"center" }}>
        <span style={F(MONT,9,800,"rgba(255,255,255,0.9)",{ textTransform:"uppercase", letterSpacing:3 })}>
          EDITION LIMITÉE · OFFRE EXCLUSIVE
        </span>
      </div>

      {/* HERO SECTION */}
      <div style={{ position:"relative", background:`linear-gradient(160deg, ${p.dark} 0%, ${p.darkMid} 55%, ${p.primaryDeep} 100%)` }}>

        {/* Glassmorphism badge */}
        <div style={{ position:"absolute", top:18, left:"50%", transform:"translateX(-50%)", zIndex:2 }}>
          <div style={{
            background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)",
            borderRadius:100, padding:"6px 18px", display:"flex", alignItems:"center", gap:7,
            backdropFilter:"blur(8px)",
          }}>
            <IconAward sz={13} c={p.primaryLight} />
            <span style={F(MONT,9,800,p.primaryLight,{ textTransform:"uppercase", letterSpacing:1.8 })}>
              Produit N°1 au Maroc
            </span>
          </div>
        </div>

        {/* Product image with overlay */}
        <div style={{ position:"relative", height:280, overflow:"hidden" }}>
          {img ? (
            <>
              <img src={img} alt={name} crossOrigin="anonymous"
                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", opacity:0.85 }} />
              {/* Multi-layer overlay */}
              <div style={{ position:"absolute", inset:0,
                background:`linear-gradient(to bottom, rgba(7,16,31,0.3) 0%, rgba(7,16,31,0) 40%, rgba(7,16,31,0.9) 100%)` }} />
              <div style={{ position:"absolute", inset:0,
                background:`radial-gradient(circle at 50% 60%, transparent 30%, ${p.primaryDeep}60 100%)` }} />
            </>
          ) : (
            <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
              background:`radial-gradient(circle, ${p.primaryDark}44 0%, ${p.dark} 100%)` }}>
              <div style={{ textAlign:"center" }}>
                <IconPackage sz={60} c={`${p.primaryLight}`} />
              </div>
            </div>
          )}
        </div>

        {/* Headline overlay */}
        <div style={{ padding:"0 24px 28px", marginTop:-80, position:"relative", zIndex:1 }}>
          <div style={{ background:p.primary, borderRadius:100, padding:"4px 14px",
            display:"inline-flex", alignItems:"center", gap:6, marginBottom:12 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:"white" }} />
            <span style={F(MONT,8.5,800,"#fff",{ textTransform:"uppercase", letterSpacing:1.5 })}>
              {name}
            </span>
          </div>
          <p style={F(MONT,30,900,"#fff",{
            letterSpacing:-0.8, lineHeight:1.15, textShadow:"0 2px 20px rgba(0,0,0,0.8)",
            marginBottom:8, display:"block",
          })}>
            {c.headline || name}
          </p>
          <p style={F(INTER,13,400,"rgba(255,255,255,0.72)",{ lineHeight:1.5 })}>
            {c.subheadline || "Découvrez la solution naturelle qui change la vie"}
          </p>
        </div>

        {/* Price pill */}
        <div style={{ margin:"0 24px 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
          background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
          borderRadius:14, padding:"14px 20px", backdropFilter:"blur(8px)" }}>
          <div>
            <p style={F(INTER,10,500,"rgba(255,255,255,0.5)",{ letterSpacing:0.5 })}>PRIX SPÉCIAL</p>
            <p style={F(MONT,32,900,p.primaryLight,{ letterSpacing:-1 })}>
              {price} <span style={{ fontSize:16, fontWeight:600 }}>DH</span>
            </p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={F(INTER,10,500,"rgba(255,255,255,0.5)")}>PAIEMENT</p>
            <p style={F(INTER,12,700,"rgba(255,255,255,0.85)")}>
              <IconLock sz={12} c="rgba(255,255,255,0.7)" /> À la livraison
            </p>
          </div>
        </div>

        <Wave1 fill={p.light} />
      </div>

      {/* ── STATS BAR ─────────────────────────────────────── */}
      <div style={{ background:p.light, padding:"24px 20px" }}>
        <div style={{ display:"flex", gap:0 }}>
          {[
            { n:"97%",  l:"Clients satisfaits", icon:<IconCheck sz={18} bg={p.primary}/> },
            { n:"24h",  l:"Livraison express",  icon:<IconTruck sz={18} c={p.primary}/> },
            { n:"5★",   l:"Note moyenne",        icon:<IconStar  sz={16} c={p.primary}/> },
          ].map((s,i)=>(
            <div key={i} style={{ flex:1, textAlign:"center",
              borderRight: i<2 ? `1.5px solid ${p.primaryMuted}` : "none",
              padding:"0 8px" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}>{s.icon}</div>
              <p style={F(MONT,20,900,p.text,{ letterSpacing:-0.5 })}>{s.n}</p>
              <p style={F(INTER,9.5,500,p.textMuted)}>{s.l}</p>
            </div>
          ))}
        </div>
        <Wave2 fill={p.white} />
      </div>

      {/* ── BEFORE / AFTER ────────────────────────────────── */}
      <div style={{ background:p.white, padding:"30px 20px 20px" }}>
        {/* Section header */}
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <span style={{ display:"inline-block", background:p.primaryMuted,
            borderRadius:100, padding:"3px 14px", marginBottom:8 }}>
            <span style={F(MONT,8.5,700,p.primary,{ textTransform:"uppercase", letterSpacing:1.5 })}>
              Transformation
            </span>
          </span>
          <p style={F(MONT,18,800,p.text,{ letterSpacing:-0.4 })}>Avant vs. Après</p>
          <div style={{ width:40, height:3, background:p.primary, margin:"8px auto 0", borderRadius:10 }} />
        </div>

        <div style={{ display:"flex", gap:10 }}>
          {/* BEFORE */}
          <div style={{ flex:1, background:p.light, borderRadius:16, padding:"18px 14px",
            border:"1.5px solid #e2e8f0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14,
              borderBottom:"1px solid #e2e8f0", paddingBottom:10 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#fee2e2",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <IconX sz={14} />
              </div>
              <p style={F(MONT,10,700,"#94a3b8",{ textTransform:"uppercase", letterSpacing:1 })}>
                Sans ce produit
              </p>
            </div>
            {(c.before||["Résultats décevants","Temps et argent perdus","Frustration persistante"])
              .map((b:string,i:number)=>(
              <div key={i} style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ marginTop:2, flexShrink:0 }}><IconX sz={14} /></div>
                <p style={F(INTER,11,500,p.textMid,{ lineHeight:1.45 })}>{b}</p>
              </div>
            ))}
          </div>

          {/* AFTER */}
          <div style={{ flex:1, background:`linear-gradient(150deg, ${p.primaryDeep} 0%, ${p.primaryDark} 100%)`,
            borderRadius:16, padding:"18px 14px", border:`1.5px solid ${p.primary}40`,
            boxShadow:`0 8px 24px ${p.primaryDeep}50` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14,
              borderBottom:"1px solid rgba(255,255,255,0.12)", paddingBottom:10 }}>
              <div style={{ width:28, height:28, borderRadius:"50%",
                background:"rgba(255,255,255,0.12)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <IconCheck sz={14} bg="transparent" />
              </div>
              <p style={F(MONT,10,700,p.primaryLight,{ textTransform:"uppercase", letterSpacing:1 })}>
                Avec ce produit
              </p>
            </div>
            {(c.after||["Résultats visibles rapidement","100% satisfaction garantie","Confiance retrouvée"])
              .map((a:string,i:number)=>(
              <div key={i} style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ marginTop:2, flexShrink:0 }}>
                  <IconCheck sz={14} bg={p.primaryLight} />
                </div>
                <p style={F(INTER,11,500,"rgba(255,255,255,0.88)",{ lineHeight:1.45 })}>{a}</p>
              </div>
            ))}
          </div>
        </div>
        <AngleCut fill={p.primaryDeep} />
      </div>

      {/* ── FEATURES ──────────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg, ${p.primaryDeep} 0%, ${p.darkMid} 100%)`, padding:"32px 20px 20px" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <p style={F(MONT,14,800,"rgba(255,255,255,0.45)",{
            textTransform:"uppercase", letterSpacing:2.5, marginBottom:8 })}>
            Pourquoi choisir ce produit
          </p>
          <p style={F(MONT,20,900,"#fff",{ letterSpacing:-0.4 })}>3 Avantages Clés</p>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          {(c.features||[
            {icon:"zap",   title:"Ultra Efficace",  desc:"Résultats visibles dès les premiers jours d'utilisation"},
            {icon:"leaf",  title:"100% Naturel",    desc:"Formule premium certifiée, sans effets secondaires"},
            {icon:"shield",title:"Qualité Garantie",desc:"Testée et approuvée par des experts reconnus"},
          ]).map((f:any,i:number)=>(
            <div key={i} style={{ flex:1, background:"rgba(255,255,255,0.07)",
              border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:"18px 12px",
              textAlign:"center" }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:`linear-gradient(135deg, ${p.primary}, ${p.primaryDark})`,
                display:"flex", alignItems:"center", justifyContent:"center",
                margin:"0 auto 12px",
                boxShadow:`0 6px 18px ${p.primaryDeep}99` }}>
                {f.icon==="zap"    ? <IconZap    sz={20} c="#fff" />
                :f.icon==="leaf"   ? <IconLeaf   sz={20} c="#fff" />
                :f.icon==="shield" ? <IconShield sz={20} c="#fff" />
                :f.icon==="spark"  ? <IconSparkle sz={20} c="#fff" />
                :                   <IconCheck   sz={20} bg="rgba(255,255,255,0.3)" />}
              </div>
              <p style={F(MONT,11,800,"#fff",{ marginBottom:5 })}>{f.title}</p>
              <p style={F(INTER,9.5,400,"rgba(255,255,255,0.58)",{ lineHeight:1.5 })}>{f.desc}</p>
            </div>
          ))}
        </div>
        <Wave1 fill={p.white} />
      </div>

      {/* ── EXPERT AUTHORITY ──────────────────────────────── */}
      <div style={{ background:p.white, padding:"32px 20px 20px" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6,
            background:p.primaryMuted, borderRadius:100, padding:"4px 14px", marginBottom:10 }}>
            <IconAward sz={12} c={p.primary} />
            <span style={F(MONT,8.5,700,p.primary,{ textTransform:"uppercase", letterSpacing:1.5 })}>
              Validé par un expert
            </span>
          </span>
          <p style={F(MONT,18,800,p.text,{ letterSpacing:-0.3 })}>L'Avis Médical</p>
        </div>

        {/* Expert card */}
        <div style={{ background:p.light, borderRadius:18, padding:"24px 20px",
          border:`1.5px solid ${p.primaryMuted}`,
          boxShadow:"0 4px 24px rgba(0,0,0,0.07)", position:"relative" }}>
          {/* Large decorative quote */}
          <div style={{ position:"absolute", top:14, right:18, opacity:0.6 }}>
            <IconQuote sz={44} c={p.primaryMuted} />
          </div>

          {/* Stars */}
          <div style={{ display:"flex", gap:3, marginBottom:14 }}>
            {[0,1,2,3,4].map(i=><IconStar key={i} sz={15} c="#f59e0b" />)}
            <span style={F(INTER,10,600,p.textMuted,{ marginLeft:4 })}>5.0 / 5</span>
          </div>

          {/* Quote */}
          <p style={F(INTER,13,400,p.textMid,{
            fontStyle:"italic", lineHeight:1.6, marginBottom:18,
            borderLeft:`3px solid ${p.primary}`, paddingLeft:14,
          })}>
            "{c.expertQuote||"Ce produit représente une avancée remarquable. Ses résultats cliniques sont impressionnants et je le recommande vivement à mes patients cherchant des solutions efficaces et durables."}"
          </p>

          {/* Expert identity */}
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <DoctorAvatar p={p} />
            <div>
              <p style={F(MONT,13,800,p.text,{ marginBottom:2 })}>{c.expertName||"Dr. Khalid Benali"}</p>
              <p style={F(INTER,10.5,500,p.textMuted)}>{c.expertTitle||"Médecin spécialiste, 15 ans d'expérience"}</p>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4,
                  background:`${p.primary}18`, borderRadius:100, padding:"3px 10px" }}>
                  <IconShield sz={11} c={p.primary} />
                  <span style={F(INTER,9,600,p.primary)}>Certifié</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4,
                  background:`${p.primary}18`, borderRadius:100, padding:"3px 10px" }}>
                  <IconAward sz={11} c={p.primary} />
                  <span style={F(INTER,9,600,p.primary)}>Expert validé</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <AngleCutTop fill={p.dark} />
      </div>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <div style={{ background:p.dark, padding:"32px 20px 20px" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <p style={F(MONT,12,700,"rgba(255,255,255,0.4)",{
            textTransform:"uppercase", letterSpacing:2.5, marginBottom:8 })}>
            Processus simplifié
          </p>
          <p style={F(MONT,20,900,"#fff",{ letterSpacing:-0.4 })}>Comment ça marche ?</p>
        </div>

        {(c.steps||[
          {title:"Passez commande", desc:"Remplissez le formulaire de commande en 30 secondes. Paiement uniquement à la réception."},
          {title:"Livraison express",desc:"Votre colis part sous 24h. Livré chez vous en 1 à 3 jours ouvrables partout au Maroc."},
          {title:"Profitez des résultats",desc:"Utilisez le produit et observez les changements. Résultats visibles dès la première semaine."},
        ]).map((s:any,i:number)=>(
          <div key={i} style={{ display:"flex", gap:16, marginBottom:i<2?16:0 }}>
            {/* Number + connector */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ width:40, height:40, borderRadius:"50%", flexShrink:0,
                background:`linear-gradient(135deg, ${p.primary}, ${p.primaryDark})`,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:`0 6px 20px ${p.primaryDeep}80, 0 0 0 3px ${p.primary}30` }}>
                <span style={F(MONT,15,900,"#fff")}>{i+1}</span>
              </div>
              {i<2 && (
                <div style={{ width:2, flex:1, marginTop:4,
                  background:`linear-gradient(to bottom, ${p.primary}60, transparent)`,
                  minHeight:20 }} />
              )}
            </div>
            {/* Content */}
            <div style={{ flex:1, paddingBottom:i<2?0:0,
              background:"rgba(255,255,255,0.05)", borderRadius:14,
              padding:"14px 16px", border:"1px solid rgba(255,255,255,0.08)",
              marginBottom:0 }}>
              <p style={F(MONT,12,800,"#fff",{ marginBottom:4 })}>{s.title}</p>
              <p style={F(INTER,10.5,400,"rgba(255,255,255,0.55)",{ lineHeight:1.55 })}>{s.desc}</p>
            </div>
          </div>
        ))}
        <Wave2 fill={p.primary} />
      </div>

      {/* ── OFFER / CTA ───────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg, ${p.primary} 0%, ${p.primaryDark} 100%)`, padding:"30px 24px" }}>
        {/* Scarcity */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          background:"rgba(0,0,0,0.18)", borderRadius:100, padding:"7px 16px",
          marginBottom:20, border:"1px solid rgba(255,255,255,0.2)" }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444",
            boxShadow:"0 0 8px #ef4444" }} />
          <span style={F(MONT,10,700,"#fff",{ textTransform:"uppercase", letterSpacing:1.2 })}>
            {c.scarcity||"Stock limité — Commandez maintenant !"}
          </span>
        </div>

        {/* Price display */}
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <p style={F(MONT,13,600,"rgba(255,255,255,0.6)",{ marginBottom:2, textTransform:"uppercase", letterSpacing:1 })}>
            Votre prix aujourd'hui
          </p>
          <p style={F(MONT,60,900,"#fff",{
            letterSpacing:-2, lineHeight:1,
            textShadow:"0 4px 24px rgba(0,0,0,0.3)",
          })}>
            {price}<span style={{ fontSize:26, fontWeight:600, letterSpacing:0 }}> DH</span>
          </p>
          <p style={F(INTER,11,500,"rgba(255,255,255,0.55)",{ marginTop:2 })}>
            {c.guarantee||"Livraison gratuite · Satisfait ou remboursé"}
          </p>
        </div>

        {/* CTA Button */}
        <div style={{
          background:"#fff", borderRadius:100, padding:"16px 28px", textAlign:"center",
          boxShadow:`0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)`,
          marginBottom:22,
        }}>
          <p style={F(MONT,16,900,p.primaryDark,{ letterSpacing:0.3 })}>
            Commander Maintenant →
          </p>
        </div>

        {/* Trust badges */}
        <div style={{ display:"flex", justifyContent:"center", gap:0 }}>
          {[
            { icon:<IconTruck  sz={16} c="rgba(255,255,255,0.7)"/>, label:"Livraison 24–48h" },
            { icon:<IconRefund sz={16} c="rgba(255,255,255,0.7)"/>, label:"Remboursé si insatisfait" },
            { icon:<IconLock   sz={16} c="rgba(255,255,255,0.7)"/>, label:"Paiement livraison" },
          ].map((b,i)=>(
            <div key={i} style={{ flex:1, textAlign:"center",
              borderRight:i<2?"1px solid rgba(255,255,255,0.15)":"none",
              padding:"0 6px" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:4 }}>{b.icon}</div>
              <p style={F(INTER,8.5,500,"rgba(255,255,255,0.55)",{ lineHeight:1.35 })}>{b.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:"#040a14", padding:"9px 20px", textAlign:"center" }}>
        <p style={F(INTER,8,400,"rgba(255,255,255,0.18)",{ letterSpacing:0.5 })}>
          Créé avec TajerGrow · tajergrow.com · Tous droits réservés
        </p>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
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
  const r = await fetch("/api/lp-builder/upload-image", { method:"POST", body:fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message);
  return j.url as string;
}

/* ══════════════════════════════════════════════════════════
   DROP ZONE
══════════════════════════════════════════════════════════ */
function DropZone({ value, uploading, onFile, onClear }: {
  value:string; uploading:boolean; onFile(f:File):void; onClear():void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={()=>!uploading&&ref.current?.click()}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)onFile(f);}}
      className="relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all"
      style={{ minHeight:160, borderColor:value?"#C5A05980":"rgba(255,255,255,0.08)",
        background:"rgba(255,255,255,0.02)" }}
      data-testid="slot-product-image">
      {value ? (
        <>
          <img src={value} alt="" className="w-full object-cover" style={{ height:200 }} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,transparent 50%,rgba(0,0,0,0.65))" }} />
          <button onClick={e=>{e.stopPropagation();onClear();}}
            className="absolute top-2.5 right-2.5 rounded-full p-1.5 bg-red-500/90 hover:bg-red-500"
            data-testid="button-remove-image"><X className="w-3 h-3 text-white" /></button>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{ background:"rgba(0,0,0,0.7)" }}>
            <CheckCircle2 className="w-3 h-3 text-green-400" />
            <span className="text-xs font-semibold text-white">Photo prête</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-10 px-6">
          {uploading ? <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
                     : <Upload className="w-7 h-7 text-slate-700" />}
          <div className="text-center">
            <p className="text-white text-sm font-semibold">
              {uploading ? "Analyse de la couleur…" : "Glissez votre photo produit ici"}
            </p>
            <p className="text-slate-600 text-xs mt-1">
              {uploading ? "Upload en cours…" : "La palette de couleurs sera extraite automatiquement"}
            </p>
          </div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);}} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SETTINGS MODAL
══════════════════════════════════════════════════════════ */
function SettingsModal({ onClose }: { onClose():void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const { data: sd } = useQuery<any>({ queryKey:["/api/lp-builder/settings"] });

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
      style={{ background:"rgba(0,0,0,0.85)", backdropFilter:"blur(12px)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-5"
        style={{ background:"#0c1628" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4" style={{ color:GOLD }} /> Clé API OpenRouter
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3 rounded-xl border p-3"
          style={{ borderColor:sd?.hasKey?"#10b98140":"#ef444440",
            background:sd?.hasKey?"#10b98110":"#ef444410" }}>
          <div className={`w-2 h-2 rounded-full ${sd?.hasKey?"bg-green-500":"bg-red-500"}`} />
          <p className="text-sm font-semibold" style={{ color:sd?.hasKey?"#10b981":"#ef4444" }}>
            {sd?.hasKey?"Clé configurée ✓":"Aucune clé API"}
          </p>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
            Votre clé OpenRouter
          </label>
          <div className="relative">
            <input type={show?"text":"password"} value={key} onChange={e=>setKey(e.target.value)}
              placeholder="sk-or-v1-..." data-testid="input-api-key"
              className="w-full rounded-xl border border-white/12 text-white text-sm p-3 pr-10 focus:outline-none focus:border-amber-500/50"
              style={{ background:"rgba(255,255,255,0.07)" }} />
            <button onClick={()=>setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">
              {show?"🙈":"👁️"}
            </button>
          </div>
          <p className="text-xs text-slate-700 mt-1.5">
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
            {save.isPending?<Loader2 className="w-4 h-4 animate-spin"/>:"Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function LpBuilder() {
  const { toast } = useToast();

  const [name, setName]         = useState("");
  const [price, setPrice]       = useState("");
  const [desc, setDesc]         = useState("");
  const [lang, setLang]         = useState("darija");
  const [imgUrl, setImgUrl]     = useState("");
  const [color, setColor]       = useState(GOLD);
  const [uploading, setUploading] = useState(false);

  const [copy, setCopy]           = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const { data: sd } = useQuery<any>({ queryKey:["/api/lp-builder/settings"] });
  const p = buildPalette(color);

  /* ── File handler ─────────────────────────────────────── */
  const handleFile = useCallback(async (file:File) => {
    setUploading(true);
    try {
      const [col, url] = await Promise.all([extractColor(file), uploadImage(file)]);
      setColor(col); setImgUrl(url);
    } catch(e:any) {
      toast({ title:"Erreur upload", description:e.message, variant:"destructive" });
    } finally { setUploading(false); }
  }, [toast]);

  /* ── Generate + auto-download ─────────────────────────── */
  async function generate() {
    if (!name) { toast({ title:"Nom du produit requis", variant:"destructive" }); return; }
    if (!sd?.hasKey) {
      setShowSettings(true);
      toast({ title:"Clé API requise", description:"Configurez OpenRouter pour activer l'IA.",
        variant:"destructive" }); return;
    }
    setGenerating(true); setCopy(null);
    try {
      const res = await fetch("/api/lp-builder/generate-copy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ productName:name, priceDH:parseFloat(price)||0, description:desc, language:lang }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message||"Erreur génération");
      setCopy(j);
      await new Promise(r=>setTimeout(r,300));
      await downloadPng();
    } catch(e:any) {
      if (e.message?.includes("Clé")) setShowSettings(true);
      toast({ title:"Erreur IA", description:e.message, variant:"destructive" });
    } finally { setGenerating(false); }
  }

  /* ── PNG download ─────────────────────────────────────── */
  async function downloadPng() {
    if (!previewRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(previewRef.current, {
        pixelRatio:2.5, quality:1, backgroundColor:"#07101f", cacheBust:true,
      });
      const a = document.createElement("a");
      a.download = `infographic-${name.toLowerCase().replace(/\s+/g,"-")||"produit"}.png`;
      a.href = dataUrl; a.click();
      toast({ title:"Image téléchargée !", description:"Fichier PNG haute résolution prêt à l'emploi." });
    } catch(e:any) {
      toast({ title:"Erreur export", description:e.message, variant:"destructive" });
    }
  }

  const palette = p;
  const ready   = copy !== null;

  /* ─────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background:"#070e1c" }}>
      {showSettings && <SettingsModal onClose={()=>setShowSettings(false)} />}

      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="border-b border-white/6 px-5 py-3.5 flex items-center justify-between"
        style={{ background:"#0b1525" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background:`linear-gradient(135deg,${color},${p.primaryDark})` }}>
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white" style={{ fontFamily:"'Montserrat',sans-serif" }}>
              AI Infographic Generator
            </p>
            <p className="text-[10px] text-slate-600">Design agence · Résolution 2.5× · Export PNG</p>
          </div>
        </div>
        <button onClick={()=>setShowSettings(true)} data-testid="button-settings-lp"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-all px-3 py-1.5 rounded-xl border border-white/8 hover:border-white/20">
          <Settings className="w-3.5 h-3.5" />
          API Key
          {!sd?.hasKey && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        </button>
      </div>

      {/* ── Two-panel layout ──────────────────────────────── */}
      <div className="flex flex-col xl:flex-row" style={{ minHeight:"calc(100vh - 57px)" }}>

        {/* ══ LEFT: Form panel ════════════════════════════ */}
        <div className="xl:w-[340px] xl:min-h-full border-r border-white/6 p-5 space-y-4 overflow-y-auto"
          style={{ background:"#0b1525" }}>

          {/* API warning */}
          {!sd?.hasKey && (
            <button onClick={()=>setShowSettings(true)} className="w-full text-left rounded-xl border border-amber-500/20 bg-amber-500/6 p-3 hover:border-amber-500/35 transition-colors">
              <p className="text-amber-400 font-semibold text-xs">Clé API non configurée</p>
              <p className="text-slate-600 text-[11px] mt-0.5">Requis pour la génération IA → Cliquez ici</p>
            </button>
          )}

          {/* Image upload */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Photo produit
            </p>
            <DropZone value={imgUrl} uploading={uploading} onFile={handleFile}
              onClear={()=>{setImgUrl(""); setColor(GOLD);}} />
            {color !== GOLD && (
              <div className="mt-2 flex items-center gap-2.5 p-2 rounded-xl border border-white/6"
                style={{ background:"rgba(255,255,255,0.02)" }}>
                <div className="w-6 h-6 rounded-full border border-white/15 flex-shrink-0"
                  style={{ background:color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white font-semibold">Palette extraite</p>
                  <div className="flex gap-1 mt-1">
                    {[palette.primary, palette.primaryDark, palette.primaryLight, palette.primaryDeep, palette.primaryMuted]
                      .map((c,i)=>(
                      <div key={i} className="w-4 h-4 rounded-full border border-white/10"
                        style={{ background:c }} />
                    ))}
                  </div>
                </div>
                <button onClick={()=>setColor(GOLD)} className="text-[10px] text-slate-600 hover:text-slate-400">
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Produit</p>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nom du produit *"
              data-testid="input-product-name"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700"
              style={{ background:"rgba(255,255,255,0.05)", fontFamily:"'Inter',sans-serif" }} />
            <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Prix (DH) *"
              data-testid="input-price"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700"
              style={{ background:"rgba(255,255,255,0.05)", fontFamily:"'Inter',sans-serif" }} />
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
              placeholder="Description / points clés (optionnel)"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700 resize-none"
              style={{ background:"rgba(255,255,255,0.05)", fontFamily:"'Inter',sans-serif" }} />
          </div>

          {/* Language */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Langue IA</p>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGS.map(l=>(
                <button key={l.v} onClick={()=>setLang(l.v)}
                  className="rounded-xl border py-2 text-xs font-semibold transition-all"
                  style={{ borderColor:lang===l.v?color:"rgba(255,255,255,0.08)",
                    background:lang===l.v?`${color}18`:"rgba(255,255,255,0.03)",
                    color:lang===l.v?color:"#475569",
                    fontFamily:"'Inter',sans-serif" }}
                  data-testid={`button-lang-${l.v}`}>{l.l}</button>
              ))}
            </div>
          </div>

          {/* Color override */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-white/6"
            style={{ background:"rgba(255,255,255,0.02)" }}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">
              Couleur thème
            </p>
            <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white/20 cursor-pointer">
              <input type="color" value={color.startsWith("rgb")?GOLD:color}
                onChange={e=>setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              <div className="w-full h-full rounded-full" style={{ background:color }} />
            </div>
          </div>

          {/* GENERATE BUTTON */}
          <Button onClick={generate} disabled={generating||uploading||!name||!price}
            data-testid="button-generate-infographic"
            className="w-full py-5 text-sm font-extrabold gap-2.5 rounded-2xl transition-all"
            style={{
              background: (name&&price&&!generating)?`linear-gradient(135deg,${color} 0%,${p.primaryDark} 100%)`:undefined,
              color:"#fff", letterSpacing:0.5,
              boxShadow:(name&&price)?`0 8px 32px ${color}50`:"none",
              opacity:(!name||!price)?0.4:1,
              fontFamily:"'Montserrat',sans-serif",
            }}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération IA en cours…</>
              : <><Wand2 className="w-4 h-4" /> Générer l'Infographie</>}
          </Button>

          {ready && !generating && (
            <>
              <Button onClick={downloadPng} variant="outline"
                className="w-full gap-2 border-white/12 text-slate-300 hover:text-white hover:bg-white/6 font-semibold"
                data-testid="button-redownload">
                <Download className="w-4 h-4" /> Retélécharger l'image PNG
              </Button>
              <p className="text-center text-[10px] text-slate-600">
                Résolution: {W*2.5}×auto px · Format: PNG
              </p>
            </>
          )}
        </div>

        {/* ══ RIGHT: Preview panel ════════════════════════ */}
        <div className="flex-1 overflow-auto py-8 px-6 flex flex-col items-center"
          style={{ background:"#070e1c" }}>

          {!ready && !generating && (
            <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto text-center space-y-6 py-20">
              <div className="w-24 h-24 rounded-3xl border border-white/6 flex items-center justify-center"
                style={{ background:"rgba(255,255,255,0.02)" }}>
                <ImageIcon className="w-10 h-10 text-slate-800" />
              </div>
              <div>
                <p className="text-white font-bold text-xl" style={{ fontFamily:"'Montserrat',sans-serif" }}>
                  Aperçu de l'infographie
                </p>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  Remplissez le formulaire et cliquez{" "}
                  <span className="font-semibold" style={{ color }}>
                    "Générer l'Infographie"
                  </span>
                  .<br />L'image PNG haute résolution sera téléchargée automatiquement.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[
                  { n:"01", t:"Photo produit",    d:"PNG/JPG recommendé" },
                  { n:"02", t:"IA génère le texte",d:"6 sections auto" },
                  { n:"03", t:"PNG téléchargé",   d:"2.5× haute résolution" },
                ].map(s=>(
                  <div key={s.n} className="rounded-2xl border border-white/6 p-4 text-center"
                    style={{ background:"rgba(255,255,255,0.02)" }}>
                    <p className="text-2xl font-black mb-1"
                      style={{ color, fontFamily:"'Montserrat',sans-serif" }}>{s.n}</p>
                    <p className="text-xs font-bold text-white">{s.t}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center h-full space-y-5 py-20">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-white/5" />
                <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
                  style={{ borderTopColor:"transparent", borderColor:`${color} transparent transparent transparent` }} />
                <div className="absolute inset-3 rounded-full flex items-center justify-center"
                  style={{ background:`${color}15` }}>
                  <Wand2 className="w-6 h-6" style={{ color }} />
                </div>
              </div>
              <p className="text-white font-bold text-xl" style={{ fontFamily:"'Montserrat',sans-serif" }}>
                Design en cours…
              </p>
              <div className="space-y-2 text-center">
                {["Analyse du produit","Rédaction IA multilingue","Génération de la palette","Mise en page professionnelle","Export haute résolution"].map((t,i)=>(
                  <p key={i} className="text-xs text-slate-600">· {t}</p>
                ))}
              </div>
            </div>
          )}

          {ready && (
            <div className="w-full max-w-lg mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm" style={{ fontFamily:"'Montserrat',sans-serif" }}>
                    Aperçu · {W}px
                  </p>
                  <p className="text-slate-600 text-xs">Export final: {W*2.5}px · PNG</p>
                </div>
                <button onClick={generate} disabled={generating}
                  className="flex items-center gap-1.5 text-xs border border-white/10 hover:border-white/20 text-slate-500 hover:text-white rounded-xl px-3 py-1.5 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" /> Régénérer
                </button>
              </div>

              {/* Preview container */}
              <div className="rounded-2xl overflow-hidden border border-white/8"
                style={{ boxShadow:"0 24px 64px rgba(0,0,0,0.6)", maxHeight:"78vh", overflowY:"auto" }}>
                <div ref={previewRef} style={{ width:W, margin:"0 auto" }}>
                  <Infographic copy={copy} color={color} name={name}
                    price={parseFloat(price)||0} img={imgUrl} />
                </div>
              </div>

              <Button onClick={downloadPng}
                className="w-full py-4 text-sm font-extrabold gap-2 rounded-2xl"
                style={{ background:"linear-gradient(135deg,#10b981,#059669)",
                  color:"#fff", boxShadow:"0 8px 28px rgba(16,185,129,0.35)",
                  fontFamily:"'Montserrat',sans-serif" }}
                data-testid="button-download-png">
                <Download className="w-5 h-5" /> Télécharger l'image (PNG haute résolution)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

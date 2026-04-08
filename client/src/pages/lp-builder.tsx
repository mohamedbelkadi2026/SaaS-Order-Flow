import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2, Upload, Loader2, X, Key, Download,
  ImageIcon, Settings, CheckCircle2, RefreshCw, Circle,
  ToggleLeft, ToggleRight,
} from "lucide-react";

/* ── Constants ───────────────────────────────────────────── */
const GOLD  = "#C5A059";
const NAVY  = "#0F1F3D";
const W     = 500;

const PLAYFAIR  = "'Playfair Display', Georgia, serif";
const CAIRO     = "'Cairo', 'Segoe UI', Arial, sans-serif";
const MONTSERRAT= "'Montserrat', 'Segoe UI', Arial, sans-serif";

const LANGS = [
  { v: "darija",  l: "Darija 🇲🇦"  },
  { v: "french",  l: "Français 🇫🇷" },
  { v: "arabic",  l: "العربية 🇸🇦"  },
  { v: "english", l: "English 🇬🇧"  },
];

const GEN_STEPS = [
  { id: "copy",      label: "Copywriting AIDA",           sub: "Claude 3.7 Sonnet" },
  { id: "hero",      label: "Studio Hero Shot HD",        sub: "Flux 1 Pro" },
  { id: "lifestyle", label: "Lifestyle Scene HD",         sub: "Flux 1 Pro" },
  { id: "avatar",    label: "Expert Portrait HD",         sub: "Flux 1 Pro" },
  { id: "colors",    label: "Extraction de la palette",   sub: "Canvas API" },
  { id: "export",    label: "Export 3× haute résolution", sub: "html-to-image" },
];

/* ── Color Palette ───────────────────────────────────────── */
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
  const rn=r/255, gn=g/255, bn=b/255;
  const max=Math.max(rn,gn,bn), min=Math.min(rn,gn,bn);
  const lv=(max+min)/2;
  let h=0, s=0;
  if (max!==min) {
    const d=max-min;
    s=lv>0.5?d/(2-max-min):d/(max+min);
    switch(max){case rn:h=((gn-bn)/d+(gn<bn?6:0))/6;break;case gn:h=((bn-rn)/d+2)/6;break;case bn:h=((rn-gn)/d+4)/6;break;}
  }
  const hd=h*360, sd=s*100, ld=lv*100;
  function hsl(hh:number,ss:number,ll:number):string{
    hh/=360;ss/=100;ll/=100;
    if(ss===0){const v=Math.round(ll*255);return `rgb(${v},${v},${v})`;}
    const q=ll<0.5?ll*(1+ss):ll+ss-ll*ss,p2=2*ll-q;
    const hue=(v:number)=>{v=((v%1)+1)%1;if(v<1/6)return p2+(q-p2)*6*v;if(v<1/2)return q;if(v<2/3)return p2+(q-p2)*(2/3-v)*6;return p2;};
    return `rgb(${Math.round(hue(hh+1/3)*255)},${Math.round(hue(hh)*255)},${Math.round(hue(hh-1/3)*255)})`;
  }
  return {
    primary:      base,
    primaryDark:  hsl(hd,Math.min(sd*1.15,100),Math.max(ld*0.58,14)),
    primaryDeep:  hsl(hd,Math.min(sd*1.25,100),Math.max(ld*0.33,9)),
    primaryLight: hsl(hd,Math.min(sd*0.5,100), Math.min(ld*1.5,92)),
    primaryMuted: hsl(hd,Math.min(sd*0.2,100), Math.min(ld*1.75,97)),
    dark:"#07101f", darkMid:"#0f1e38", light:"#f8f7f4",
    text:"#0f172a", textMid:"#334155", textMuted:"#64748b",
  };
}

/* ── SVG Icons ───────────────────────────────────────────── */
const ICheck=({sz=16,bg="#10b981"}:{sz?:number;bg?:string})=>(
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill={bg}/>
    <path d="M7 12.5l3.5 3.5L17 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const IX=({sz=16}:{sz?:number})=>(
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="12" fill="#e2e8f0"/>
    <path d="M8 8l8 8M16 8l-8 8" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>);
const IStar=({sz=14,c="#f59e0b"}:{sz?:number;c?:string})=>(
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
  </svg>);
const IZap=({sz=20,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}><polygon points="13,2 4.5,13.5 11,13.5 11,22 19.5,10.5 13,10.5"/></svg>);
const ILeaf=({sz=20,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>);
const IShield=({sz=20,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>);
const IShield2=({sz=18,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const ITruck=({sz=18,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>);
const ILock=({sz=18,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
const IQuote=({sz=32,c="rgba(255,255,255,0.1)"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 32 32" fill={c}><path d="M0 17c0-6.627 5.373-12 12-12v5c-3.86 0-7 3.14-7 7h7v12H0V17zm17 0c0-6.627 5.373-12 12-12v5c-3.86 0-7 3.14-7 7h7v12H17V17z"/></svg>);
const IRefund=({sz=18,c="#fff"}:{sz?:number;c?:string})=>(<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>);

/* ── Wave / Angle Dividers ───────────────────────────────── */
const WaveDown=({fill}:{fill:string})=>(<svg viewBox="0 0 500 52" preserveAspectRatio="none" style={{display:"block",width:W,height:52,marginTop:-1}}><path d="M0,28 C100,60 200,0 300,32 C380,56 440,12 500,28 L500,52 L0,52 Z" fill={fill}/></svg>);
const WaveUp=({fill}:{fill:string})=>(<svg viewBox="0 0 500 52" preserveAspectRatio="none" style={{display:"block",width:W,height:52,marginBottom:-1}}><path d="M0,52 C100,20 220,60 340,28 C420,8 460,40 500,24 L500,0 L0,0 Z" fill={fill}/></svg>);
const Angle=({fill}:{fill:string})=>(<svg viewBox="0 0 500 38" preserveAspectRatio="none" style={{display:"block",width:W,height:38,marginTop:-1}}><polygon points="0,38 500,0 500,38" fill={fill}/></svg>);

/* ── Expert Avatar ───────────────────────────────────────── */
function ExpertAvatar({p,src}:{p:Palette;src?:string|null}) {
  if (src) return (
    <div style={{position:"relative",display:"inline-block"}}>
      <img src={src} alt="Expert" crossOrigin="anonymous"
        style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",display:"block",
          border:`3px solid ${p.primary}`,
          boxShadow:`0 0 0 4px rgba(255,255,255,0.1), 0 10px 28px rgba(0,0,0,0.4)`}}/>
      <div style={{position:"absolute",bottom:-3,right:-3,width:24,height:24,borderRadius:"50%",
        background:`linear-gradient(135deg,${p.primary},${p.primaryDark})`,
        border:"3px solid white",display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
        <span style={{fontSize:7,fontWeight:900,color:"#fff",fontFamily:MONTSERRAT,letterSpacing:0.5}}>MD</span>
      </div>
    </div>
  );
  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <div style={{width:80,height:80,borderRadius:"50%",
        background:`linear-gradient(150deg,${p.primaryLight} 0%,${p.primary} 45%,${p.primaryDeep} 100%)`,
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:`0 0 0 3px white, 0 0 0 6px ${p.primary}40, 0 12px 28px ${p.primaryDeep}80`,overflow:"hidden"}}>
        <svg width="52" height="56" viewBox="0 0 52 56" fill="none">
          <circle cx="26" cy="15" r="11" fill="rgba(255,255,255,0.95)"/>
          <path d="M6 56C6 42 14 38 26 38C38 38 46 42 46 56Z" fill="rgba(255,255,255,0.95)"/>
        </svg>
      </div>
      <div style={{position:"absolute",bottom:-3,right:-3,width:24,height:24,borderRadius:"50%",
        background:`linear-gradient(135deg,${p.primary},${p.primaryDark})`,
        border:"3px solid white",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:7,fontWeight:900,color:"#fff",fontFamily:MONTSERRAT}}>MD</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   INFOGRAPHIC CANVAS — Full AIDA Template
══════════════════════════════════════════════════════════ */
interface InfProps {
  copy: any; color: string; name: string; price: number;
  productImg: string; heroImg: string|null; lifestyleImg: string|null; avatarImg: string|null;
}

function Infographic({ copy:c, color, name, price, productImg, heroImg, lifestyleImg, avatarImg }: InfProps) {
  if (!c) return null;
  const p = buildPalette(color);

  const F=(fam:string,sz:number,fw:number|string,cl:string,ex:any={})=>({
    fontFamily:fam, fontSize:sz, fontWeight:fw, color:cl, margin:0, padding:0, lineHeight:1.35, ...ex,
  });
  const glass=(extra:any={})=>({
    background:"rgba(255,255,255,0.1)",
    border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:16, ...extra,
  });

  const heroSrc = heroImg || productImg;

  return (
    <div style={{width:W, background:p.dark, fontFamily:CAIRO, overflow:"hidden"}}>

      {/* ── ACCENT BAR ── */}
      <div style={{height:5, background:`linear-gradient(90deg,${p.primary},${p.primaryLight},${p.primary})`}}/>

      {/* ── HEADER ── */}
      <div style={{background:p.dark, padding:"10px 22px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:p.primary}}/>
          <span style={F(MONTSERRAT,8.5,700,p.primaryLight,{textTransform:"uppercase",letterSpacing:2.5})}>
            Infographie Produit
          </span>
        </div>
        <div style={{background:p.primary,borderRadius:100,padding:"3px 12px"}}>
          <span style={F(MONTSERRAT,8,800,"#fff",{textTransform:"uppercase",letterSpacing:1.5})}>
            Offre Exclusive
          </span>
        </div>
      </div>

      {/* ── A: ATTENTION — HERO ── */}
      <div style={{position:"relative",background:`linear-gradient(180deg,${p.dark} 0%,${p.primaryDeep} 100%)`}}>
        {/* Hero image */}
        <div style={{position:"relative",height:320,overflow:"hidden"}}>
          {heroSrc ? (
            <>
              <img src={heroSrc} alt={name} crossOrigin="anonymous"
                style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              <div style={{position:"absolute",inset:0,
                background:`linear-gradient(to bottom,rgba(7,16,31,0.25) 0%,rgba(7,16,31,0.02) 40%,rgba(7,16,31,0.88) 100%)`}}/>
              <div style={{position:"absolute",inset:0,
                background:`radial-gradient(ellipse at center bottom,${p.primaryDeep}60 0%,transparent 70%)`}}/>
            </>
          ) : (
            <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",
              background:`radial-gradient(circle,${p.primaryDark}55,${p.dark})`}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:`${p.primary}30`,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <ImageIcon style={{width:40,height:40,color:p.primaryLight,opacity:0.5}} />
              </div>
            </div>
          )}
        </div>

        {/* Headline overlay */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 24px 26px"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,
            ...glass({padding:"4px 14px",borderRadius:100}), marginBottom:12}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:p.primaryLight}}/>
            <span style={F(MONTSERRAT,8.5,700,p.primaryLight,{textTransform:"uppercase",letterSpacing:1.8})}>
              {name}
            </span>
          </div>
          <p style={F(PLAYFAIR,31,900,"#fff",{
            letterSpacing:-0.5, lineHeight:1.18, textShadow:"0 2px 24px rgba(0,0,0,0.9)",
            display:"block", marginBottom:10,
          })}>
            {c.headline || name}
          </p>
          <p style={F(CAIRO,13,400,"rgba(255,255,255,0.72)",{lineHeight:1.55})}>
            {c.subheadline}
          </p>
        </div>

        {/* Price ribbon */}
        <div style={{margin:"0 22px 28px", ...glass({padding:"13px 18px",display:"flex",
          alignItems:"center",justifyContent:"space-between"})}}>
          <div>
            <p style={F(CAIRO,9.5,500,"rgba(255,255,255,0.48)",{textTransform:"uppercase",letterSpacing:0.8})}>
              Prix exclusif
            </p>
            <p style={F(MONTSERRAT,34,900,p.primaryLight,{letterSpacing:-1})}>
              {price} <span style={{fontSize:16,fontWeight:600}}>DH</span>
            </p>
          </div>
          <div style={{textAlign:"right"}}>
            <ILock sz={14} c="rgba(255,255,255,0.5)"/>
            <p style={F(CAIRO,11.5,600,"rgba(255,255,255,0.8)",{marginTop:3})}>Paiement livraison</p>
          </div>
        </div>

        <WaveDown fill={p.light}/>
      </div>

      {/* ── I: INTEREST — BEFORE / AFTER ── */}
      <div style={{background:p.light, padding:"30px 20px 20px"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <span style={{display:"inline-block",background:p.primaryMuted,borderRadius:100,
            padding:"3px 14px",marginBottom:8}}>
            <span style={F(MONTSERRAT,8,700,p.primary,{textTransform:"uppercase",letterSpacing:1.8})}>
              Transformation
            </span>
          </span>
          <p style={F(PLAYFAIR,19,700,p.text,{letterSpacing:-0.3})}>
            Avant vs. Après
          </p>
          <div style={{width:36,height:3,background:p.primary,margin:"8px auto 0",borderRadius:10}}/>
        </div>

        <div style={{display:"flex",gap:10}}>
          {/* BEFORE */}
          <div style={{flex:1,background:"#fff",borderRadius:16,padding:"18px 14px",
            border:"1.5px solid #e2e8f0",boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,
              paddingBottom:10,borderBottom:"1px solid #f1f5f9"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#fee2e2",
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <IX sz={14}/>
              </div>
              <p style={F(MONTSERRAT,9.5,700,"#94a3b8",{textTransform:"uppercase",letterSpacing:0.8})}>
                Sans ce produit
              </p>
            </div>
            {(c.before||["Résultats insuffisants","Temps et argent gaspillés","Frustration quotidienne"])
              .map((b:string,i:number)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{marginTop:1,flexShrink:0}}><IX sz={14}/></div>
                <p style={F(CAIRO,11,500,p.textMid,{lineHeight:1.5})}>{b}</p>
              </div>
            ))}
          </div>

          {/* AFTER */}
          <div style={{flex:1,background:`linear-gradient(160deg,${p.primaryDeep},${p.primaryDark})`,
            borderRadius:16,padding:"18px 14px",
            border:`1.5px solid ${p.primary}40`,
            boxShadow:`0 6px 20px ${p.primaryDeep}55`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,
              paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,0.12)",
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <ICheck sz={14} bg="transparent"/>
              </div>
              <p style={F(MONTSERRAT,9.5,700,p.primaryLight,{textTransform:"uppercase",letterSpacing:0.8})}>
                Avec ce produit
              </p>
            </div>
            {(c.after||["Résultats visibles rapidement","Satisfaction totale garantie","Vie transformée"])
              .map((a:string,i:number)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{marginTop:1,flexShrink:0}}><ICheck sz={14} bg={p.primaryLight}/></div>
                <p style={F(CAIRO,11,500,"rgba(255,255,255,0.88)",{lineHeight:1.5})}>{a}</p>
              </div>
            ))}
          </div>
        </div>
        <Angle fill={p.darkMid}/>
      </div>

      {/* ── D: DESIRE — FEATURES ── */}
      <div style={{background:`linear-gradient(160deg,${p.darkMid},${p.dark})`, padding:"32px 20px 20px"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <p style={F(MONTSERRAT,10,700,"rgba(255,255,255,0.4)",{
            textTransform:"uppercase",letterSpacing:3,marginBottom:7})}>
            Pourquoi c'est différent
          </p>
          <p style={F(PLAYFAIR,20,700,"#fff",{letterSpacing:-0.3})}>3 Avantages Exclusifs</p>
        </div>

        <div style={{display:"flex",gap:10}}>
          {(c.features||[
            {icon:"zap",   title:"Ultra Rapide",    desc:"Résultats visibles dès les premiers jours."},
            {icon:"leaf",  title:"100% Naturel",    desc:"Formule certifiée sans effets secondaires."},
            {icon:"shield",title:"Qualité Certifiée",desc:"Testé et approuvé par des spécialistes."},
          ]).map((f:any,i:number)=>(
            <div key={i} style={{flex:1,...glass({padding:"18px 12px",textAlign:"center",
              boxShadow:"0 4px 20px rgba(0,0,0,0.25)"})}}>
              <div style={{width:46,height:46,borderRadius:14,
                background:`linear-gradient(135deg,${p.primary},${p.primaryDark})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                margin:"0 auto 12px",boxShadow:`0 6px 18px ${p.primaryDeep}99`}}>
                {f.icon==="zap"    ? <IZap    sz={20}/> :
                 f.icon==="leaf"   ? <ILeaf   sz={20}/> :
                 f.icon==="shield" ? <IShield sz={20}/> :
                 <ICheck sz={20} bg="rgba(255,255,255,0.3)"/>}
              </div>
              <p style={F(PLAYFAIR,11.5,700,"#fff",{marginBottom:5})}>{f.title}</p>
              <p style={F(CAIRO,9.5,400,"rgba(255,255,255,0.58)",{lineHeight:1.55})}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Lifestyle image or aspirational text */}
        {lifestyleImg ? (
          <>
            <div style={{marginTop:24,borderRadius:16,overflow:"hidden",position:"relative",
              boxShadow:"0 12px 40px rgba(0,0,0,0.5)"}}>
              <img src={lifestyleImg} alt="Lifestyle" crossOrigin="anonymous"
                style={{width:"100%",height:220,objectFit:"cover",display:"block"}}/>
              <div style={{position:"absolute",inset:0,
                background:"linear-gradient(to bottom,transparent 40%,rgba(7,16,31,0.8) 100%)"}}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px 20px"}}>
                <p style={F(PLAYFAIR,14,600,"rgba(255,255,255,0.85)",{fontStyle:"italic",lineHeight:1.5})}>
                  "{c.lifestyleLine||"La vie que vous méritez, enfin à votre portée."}"
                </p>
              </div>
            </div>
          </>
        ) : c.lifestyleLine ? (
          <div style={{marginTop:24,...glass({padding:"18px 20px",textAlign:"center"})}}>
            <p style={F(PLAYFAIR,14,600,"rgba(255,255,255,0.8)",{fontStyle:"italic",lineHeight:1.6})}>
              "{c.lifestyleLine}"
            </p>
          </div>
        ) : null}

        <WaveDown fill="#ffffff"/>
      </div>

      {/* ── D: DESIRE — EXPERT AUTHORITY ── */}
      <div style={{background:"#fff", padding:"30px 20px 20px"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:6,
            background:p.primaryMuted,borderRadius:100,padding:"4px 16px",marginBottom:10}}>
            <IShield2 sz={11} c={p.primary}/>
            <span style={F(MONTSERRAT,8,700,p.primary,{textTransform:"uppercase",letterSpacing:1.8})}>
              Validé par un expert
            </span>
          </span>
          <p style={F(PLAYFAIR,18,700,p.text,{letterSpacing:-0.3})}>L'Avis Médical</p>
        </div>

        <div style={{background:p.light,borderRadius:18,padding:"24px 20px",
          border:`1.5px solid ${p.primaryMuted}`,boxShadow:"0 4px 24px rgba(0,0,0,0.06)",
          position:"relative"}}>
          {/* Decorative quote */}
          <div style={{position:"absolute",top:14,right:16,opacity:0.7}}>
            <IQuote sz={40} c={p.primaryMuted}/>
          </div>

          {/* Stars */}
          <div style={{display:"flex",gap:3,marginBottom:14}}>
            {[0,1,2,3,4].map(i=><IStar key={i} sz={15}/>)}
            <span style={F(CAIRO,10,600,p.textMuted,{marginLeft:5})}>5.0 / 5</span>
          </div>

          {/* Quote */}
          <p style={F(CAIRO,12.5,400,p.textMid,{
            fontStyle:"italic",lineHeight:1.65,marginBottom:18,
            borderLeft:`3px solid ${p.primary}`,paddingLeft:14,
          })}>
            "{c.expertQuote||"Ce produit représente une avancée clinique remarquable. Ses résultats sont constants et je le recommande avec confiance à l'ensemble de mes patients."}"
          </p>

          {/* Identity */}
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <ExpertAvatar p={p} src={avatarImg}/>
            <div>
              <p style={F(PLAYFAIR,13.5,700,p.text,{marginBottom:2})}>{c.expertName||"Dr. Khalid Benali"}</p>
              <p style={F(CAIRO,10.5,500,p.textMuted)}>{c.expertTitle||"Médecin spécialiste — 15 ans d'expérience"}</p>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7}}>
                {["Certifié","Expert validé"].map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:4,
                    background:`${p.primary}15`,borderRadius:100,padding:"3px 10px"}}>
                    <IShield2 sz={10} c={p.primary}/>
                    <span style={F(CAIRO,8.5,600,p.primary)}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <WaveUp fill={p.primary}/>
      </div>

      {/* ── A: ACTION — OFFER / CTA ── */}
      <div style={{background:`linear-gradient(160deg,${p.primary} 0%,${p.primaryDark} 100%)`,
        padding:"28px 24px"}}>

        {/* Scarcity badge */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          background:"rgba(0,0,0,0.2)",borderRadius:100,padding:"7px 18px",
          marginBottom:22,border:"1px solid rgba(255,255,255,0.18)"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",
            boxShadow:"0 0 8px #ef4444aa"}}/>
          <span style={F(MONTSERRAT,9.5,700,"#fff",{textTransform:"uppercase",letterSpacing:1})}>
            {c.scarcity||"Stock limité — Commandez maintenant"}
          </span>
        </div>

        {/* Price */}
        <div style={{textAlign:"center",marginBottom:22}}>
          <p style={F(MONTSERRAT,10.5,600,"rgba(255,255,255,0.6)",{
            textTransform:"uppercase",letterSpacing:1.5,marginBottom:3})}>
            Votre prix aujourd'hui
          </p>
          <p style={F(MONTSERRAT,64,900,"#fff",{
            letterSpacing:-2,lineHeight:1,textShadow:`0 4px 24px rgba(0,0,0,0.25)`,
          })}>
            {price}<span style={{fontSize:26,fontWeight:600,letterSpacing:0}}> DH</span>
          </p>
          <p style={F(CAIRO,11,500,"rgba(255,255,255,0.55)",{marginTop:3})}>
            {c.guarantee||"Livraison rapide · Satisfait ou remboursé"}
          </p>
        </div>

        {/* CTA button */}
        <div style={{background:"#fff",borderRadius:100,padding:"16px 28px",textAlign:"center",
          boxShadow:"0 10px 36px rgba(0,0,0,0.3)",marginBottom:22}}>
          <p style={F(MONTSERRAT,16,900,p.primaryDark,{letterSpacing:0.4})}>
            {c.cta||"Commander Maintenant"} →
          </p>
        </div>

        {/* Trust row */}
        <div style={{display:"flex",justifyContent:"center",gap:0}}>
          {[
            {icon:<ITruck sz={15} c="rgba(255,255,255,0.65)"/>, label:"Livraison 24–48h"},
            {icon:<IRefund sz={15} c="rgba(255,255,255,0.65)"/>, label:"Remboursé si insatisfait"},
            {icon:<ILock sz={15} c="rgba(255,255,255,0.65)"/>, label:"Paiement à la livraison"},
          ].map((t,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",
              borderRight:i<2?"1px solid rgba(255,255,255,0.15)":"none",padding:"0 7px"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{t.icon}</div>
              <p style={F(CAIRO,8.5,500,"rgba(255,255,255,0.5)",{lineHeight:1.4})}>{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{background:"#030810",padding:"8px 20px",textAlign:"center"}}>
        <p style={F(CAIRO,8,400,"rgba(255,255,255,0.15)",{letterSpacing:0.5})}>
          Créé avec TajerGrow · tajergrow.com
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
        const S=80, cv=document.createElement("canvas");
        cv.width=S; cv.height=S;
        const ctx=cv.getContext("2d")!;
        ctx.drawImage(img,0,0,S,S);
        const d=ctx.getImageData(0,0,S,S).data;
        const bk:Record<string,{r:number;g:number;b:number;n:number}>={};
        for(let i=0;i<d.length;i+=4){
          const r=d[i],g=d[i+1],b=d[i+2];
          const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
          if(r>235&&g>235&&b>235)continue;if(r<20&&g<20&&b<20)continue;
          if(mx===0||(mx-mn)/mx<0.18)continue;
          const k=`${Math.round(r/40)*40},${Math.round(g/40)*40},${Math.round(b/40)*40}`;
          if(!bk[k])bk[k]={r:0,g:0,b:0,n:0};
          bk[k].r+=r;bk[k].g+=g;bk[k].b+=b;bk[k].n++;
        }
        const t=Object.values(bk).sort((a,b)=>b.n-a.n)[0];
        URL.revokeObjectURL(url);
        resolve(t?`rgb(${Math.round(t.r/t.n)},${Math.round(t.g/t.n)},${Math.round(t.b/t.n)})`:GOLD);
      } catch { URL.revokeObjectURL(url); resolve(GOLD); }
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(GOLD);};
    img.src=url;
  });
}

async function extractColorFromUrl(url: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const S=80, cv=document.createElement("canvas");
        cv.width=S; cv.height=S;
        const ctx=cv.getContext("2d")!;
        ctx.drawImage(img,0,0,S,S);
        const d=ctx.getImageData(0,0,S,S).data;
        const bk:Record<string,{r:number;g:number;b:number;n:number}>={};
        for(let i=0;i<d.length;i+=4){
          const r=d[i],g=d[i+1],b=d[i+2];
          const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
          if(r>235&&g>235&&b>235)continue;if(r<20&&g<20&&b<20)continue;
          if(mx===0||(mx-mn)/mx<0.18)continue;
          const k=`${Math.round(r/40)*40},${Math.round(g/40)*40},${Math.round(b/40)*40}`;
          if(!bk[k])bk[k]={r:0,g:0,b:0,n:0};
          bk[k].r+=r;bk[k].g+=g;bk[k].b+=b;bk[k].n++;
        }
        const t=Object.values(bk).sort((a,b)=>b.n-a.n)[0];
        resolve(t?`rgb(${Math.round(t.r/t.n)},${Math.round(t.g/t.n)},${Math.round(t.b/t.n)})`:GOLD);
      } catch { resolve(GOLD); }
    };
    img.onerror=()=>resolve(GOLD);
    img.src=url;
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

async function generateFluxImage(prompt: string, type: string): Promise<string|null> {
  try {
    const r = await fetch("/api/lp-builder/generate-image", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ prompt, type }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message);
    return j.url as string;
  } catch(e:any) {
    console.warn(`[Flux] ${type} failed:`, e.message);
    return null;
  }
}

/* ── Drop Zone ───────────────────────────────────────────── */
function DropZone({ value, uploading, onFile, onClear }:{
  value:string; uploading:boolean; onFile(f:File):void; onClear():void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div onClick={()=>!uploading&&ref.current?.click()}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)onFile(f);}}
      className="relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all"
      style={{minHeight:150,borderColor:value?"#C5A05970":"rgba(255,255,255,0.07)",
        background:"rgba(255,255,255,0.02)"}}
      data-testid="slot-product-image">
      {value ? (
        <>
          <img src={value} alt="" className="w-full object-cover" style={{height:180}}/>
          <div style={{position:"absolute",inset:0,
            background:"linear-gradient(to bottom,transparent 50%,rgba(0,0,0,0.65))"}}/>
          <button onClick={e=>{e.stopPropagation();onClear();}}
            className="absolute top-2.5 right-2.5 rounded-full p-1.5 bg-red-500/90 hover:bg-red-500"
            data-testid="button-remove-image"><X className="w-3 h-3 text-white"/></button>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{background:"rgba(0,0,0,0.7)"}}>
            <CheckCircle2 className="w-3 h-3 text-green-400"/>
            <span className="text-xs font-semibold text-white">Produit prêt</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
          {uploading ? <Loader2 className="w-7 h-7 text-amber-400 animate-spin"/>
                     : <Upload className="w-7 h-7 text-slate-800"/>}
          <div className="text-center">
            <p className="text-white text-sm font-semibold">
              {uploading?"Analyse couleur…":"Glissez votre photo produit"}
            </p>
            <p className="text-slate-700 text-xs mt-1">
              {uploading?"Upload en cours…":"JPG / PNG — couleur extraite automatiquement"}
            </p>
          </div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);}}/>
    </div>
  );
}

/* ── Settings Modal ──────────────────────────────────────── */
function SettingsModal({ onClose }:{ onClose():void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const { data:sd } = useQuery<any>({ queryKey:["/api/lp-builder/settings"] });

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
      style={{background:"rgba(0,0,0,0.88)",backdropFilter:"blur(12px)"}}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-5"
        style={{background:"#0c1628"}}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4" style={{color:GOLD}}/> Clé API OpenRouter
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="flex items-center gap-3 rounded-xl border p-3"
          style={{borderColor:sd?.hasKey?"#10b98140":"#ef444440",
            background:sd?.hasKey?"#10b98110":"#ef444410"}}>
          <div className={`w-2 h-2 rounded-full ${sd?.hasKey?"bg-green-500":"bg-red-500"}`}/>
          <p className="text-sm font-semibold" style={{color:sd?.hasKey?"#10b981":"#ef4444"}}>
            {sd?.hasKey?"Clé configurée ✓":"Aucune clé API"}
          </p>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
            Votre clé OpenRouter (utilisée pour Claude 3.7 + Flux 1 Pro)
          </label>
          <div className="relative">
            <input type={show?"text":"password"} value={key} onChange={e=>setKey(e.target.value)}
              placeholder="sk-or-v1-..." data-testid="input-api-key"
              className="w-full rounded-xl border border-white/12 text-white text-sm p-3 pr-10 focus:outline-none focus:border-amber-500/40"
              style={{background:"rgba(255,255,255,0.06)"}}/>
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
            style={{background:`linear-gradient(135deg,${GOLD},#e8b56a)`,color:NAVY}}>
            {save.isPending?<Loader2 className="w-4 h-4 animate-spin"/>:"Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP PROGRESS PANEL
══════════════════════════════════════════════════════════ */
type StepId = "copy"|"hero"|"lifestyle"|"avatar"|"colors"|"export";

function StepProgress({ current, done, color }:{ current:StepId|null; done:Set<StepId>; color:string }) {
  return (
    <div className="space-y-3 py-8 max-w-xs mx-auto">
      {GEN_STEPS.map(step => {
        const isDone    = done.has(step.id as StepId);
        const isActive  = current === step.id;
        const isPending = !isDone && !isActive;
        return (
          <div key={step.id} className="flex items-center gap-4">
            <div className="flex-shrink-0">
              {isDone   ? <CheckCircle2 className="w-5 h-5" style={{color:"#10b981"}}/>
              :isActive ? <Loader2  className="w-5 h-5 animate-spin" style={{color}}/>
              :           <Circle   className="w-5 h-5 text-slate-800"/>}
            </div>
            <div className={isPending?"opacity-35":""}>
              <p className={`text-sm font-semibold ${isDone?"text-white":isActive?"text-white":"text-slate-600"}`}>
                {step.label}
              </p>
              <p className="text-[10px] text-slate-600">{step.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function LpBuilder() {
  const { toast } = useToast();

  /* Form */
  const [name,       setName]       = useState("");
  const [price,      setPrice]      = useState("");
  const [desc,       setDesc]       = useState("");
  const [lang,       setLang]       = useState("darija");
  const [imgUrl,     setImgUrl]     = useState("");
  const [color,      setColor]      = useState(GOLD);
  const [uploading,  setUploading]  = useState(false);
  const [useFlux,    setUseFlux]    = useState(true);

  /* Generation */
  const [copy,       setCopy]       = useState<any>(null);
  const [heroImg,    setHeroImg]    = useState<string|null>(null);
  const [lifestyleImg, setLifestyleImg] = useState<string|null>(null);
  const [avatarImg,  setAvatarImg]  = useState<string|null>(null);
  const [currentStep, setCurrentStep] = useState<StepId|null>(null);
  const [doneSteps,  setDoneSteps]  = useState<Set<StepId>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const { data: sd } = useQuery<any>({ queryKey:["/api/lp-builder/settings"] });
  const p = buildPalette(color);
  const ready = copy !== null;

  function markDone(step: StepId) {
    setDoneSteps(prev => new Set([...prev, step]));
  }

  /* Upload */
  const handleFile = useCallback(async (file:File) => {
    setUploading(true);
    try {
      const [col, url] = await Promise.all([extractColor(file), uploadImage(file)]);
      setColor(col); setImgUrl(url);
    } catch(e:any) {
      toast({ title:"Erreur upload", description:e.message, variant:"destructive" });
    } finally { setUploading(false); }
  }, [toast]);

  /* Main generation flow */
  async function generate() {
    if (!name)  { toast({ title:"Nom du produit requis", variant:"destructive" }); return; }
    if (!price) { toast({ title:"Prix requis",          variant:"destructive" }); return; }
    if (!sd?.hasKey) {
      setShowSettings(true);
      toast({ title:"Clé API requise", variant:"destructive" }); return;
    }

    setGenerating(true);
    setCopy(null); setHeroImg(null); setLifestyleImg(null); setAvatarImg(null);
    setDoneSteps(new Set());

    try {
      /* ── Step 1: Claude AIDA copy ── */
      setCurrentStep("copy");
      const copyRes = await fetch("/api/lp-builder/generate-copy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ productName:name, priceDH:parseFloat(price)||0, description:desc, language:lang }),
      });
      const copyData = await copyRes.json();
      if (!copyRes.ok) throw new Error(copyData.message||"Erreur Claude");
      setCopy(copyData);
      markDone("copy");

      let finalColor = color;
      let fluxHero: string|null = null;
      let fluxLifestyle: string|null = null;
      let fluxAvatar: string|null = null;

      if (useFlux) {
        /* ── Step 2: Flux Hero Shot ── */
        setCurrentStep("hero");
        fluxHero = await generateFluxImage(
          copyData.heroImagePrompt || `Hyper-realistic 4K studio product photography of ${name}. Perfect white infinity background, professional 3-point lighting, ultra-sharp focus, luxury retail aesthetic, no text, no watermark, photorealistic`,
          "hero"
        );
        if (fluxHero) setHeroImg(fluxHero);
        markDone("hero");

        /* ── Step 3: Flux Lifestyle ── */
        setCurrentStep("lifestyle");
        fluxLifestyle = await generateFluxImage(
          copyData.lifestyleImagePrompt || `Cinematic lifestyle photography, elegant Moroccan interior, warm golden hour light, ${name} being used naturally, luxury magazine editorial style, no text, photorealistic`,
          "lifestyle"
        );
        if (fluxLifestyle) setLifestyleImg(fluxLifestyle);
        markDone("lifestyle");

        /* ── Step 4: Flux Avatar ── */
        setCurrentStep("avatar");
        fluxAvatar = await generateFluxImage(
          copyData.expertImagePrompt || `Professional portrait photograph of a distinguished Moroccan medical specialist, 45 years old, white lab coat, confident warm expression, studio lighting, hyperrealistic, DSLR portrait photography`,
          "avatar"
        );
        if (fluxAvatar) setAvatarImg(fluxAvatar);
        markDone("avatar");

        /* ── Step 5: Extract color from Flux hero ── */
        setCurrentStep("colors");
        if (fluxHero) {
          const extracted = await extractColorFromUrl(fluxHero);
          setColor(extracted);
          finalColor = extracted;
        }
        markDone("colors");
      } else {
        // Skip Flux steps — mark as done immediately
        (["hero","lifestyle","avatar","colors"] as StepId[]).forEach(s=>markDone(s));
      }

      /* ── Step 6: Finalize + export ── */
      setCurrentStep("export");
      markDone("export");

      // Flip to preview mode FIRST so previewRef mounts on the full-size div
      setGenerating(false);
      setCurrentStep(null);

      // Wait two frames for React + DOM paint
      await new Promise(r => setTimeout(r, 600));
      await downloadJpg();

    } catch(e:any) {
      if (e.message?.includes("Clé")) setShowSettings(true);
      toast({ title:"Erreur de génération", description:e.message, variant:"destructive" });
      setCurrentStep(null);
      setGenerating(false);
    }
  }

  /* JPG download at 3x */
  async function downloadJpg(
    forceCopy?:any, fHero?:string|null, fLifestyle?:string|null, fAvatar?:string|null
  ) {
    if (!previewRef.current) return;
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(previewRef.current, {
        pixelRatio: 3, quality: 0.96,
        backgroundColor: "#07101f", cacheBust: true,
      });
      const a = document.createElement("a");
      a.download = `infographic-${(name||"produit").toLowerCase().replace(/\s+/g,"-")}.jpg`;
      a.href = dataUrl; a.click();
      toast({ title:"Image téléchargée !", description:"JPG haute résolution (3×) prêt à l'emploi." });
    } catch(e:any) {
      toast({ title:"Erreur export", description:e.message, variant:"destructive" });
    }
  }

  /* ─────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{background:"#070e1c"}}>
      {showSettings && <SettingsModal onClose={()=>setShowSettings(false)}/>}

      {/* Top bar */}
      <div className="border-b border-white/6 px-5 py-3 flex items-center justify-between"
        style={{background:"#0b1525"}}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{background:`linear-gradient(135deg,${color},${p.primaryDark})`}}>
            <Wand2 className="w-4 h-4 text-white"/>
          </div>
          <div>
            <p className="text-sm font-bold text-white" style={{fontFamily:MONTSERRAT}}>
              AI Infographic Generator
            </p>
            <p className="text-[10px] text-slate-600">
              Claude 3.7 · Flux 1 Pro · AIDA · Export JPG 3×
            </p>
          </div>
        </div>
        <button onClick={()=>setShowSettings(true)} data-testid="button-settings-lp"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-all px-3 py-1.5 rounded-xl border border-white/8 hover:border-white/20">
          <Settings className="w-3.5 h-3.5"/>
          API
          {!sd?.hasKey && <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>}
        </button>
      </div>

      {/* Two-panel */}
      <div className="flex flex-col xl:flex-row" style={{minHeight:"calc(100vh - 53px)"}}>

        {/* ══ LEFT PANEL ══ */}
        <div className="xl:w-[330px] xl:min-h-full border-r border-white/6 p-4 space-y-4 overflow-y-auto"
          style={{background:"#0b1525"}}>

          {!sd?.hasKey && (
            <button onClick={()=>setShowSettings(true)}
              className="w-full text-left rounded-xl border border-amber-500/20 bg-amber-500/6 p-3 hover:border-amber-500/30 transition-colors">
              <p className="text-amber-400 font-semibold text-xs">Clé API requise</p>
              <p className="text-slate-600 text-[11px] mt-0.5">Claude 3.7 + Flux 1 Pro → Configurer →</p>
            </button>
          )}

          {/* Image upload */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Photo produit (base)
            </p>
            <DropZone value={imgUrl} uploading={uploading} onFile={handleFile}
              onClear={()=>{setImgUrl("");setColor(GOLD);}}/>
            {color !== GOLD && (
              <div className="mt-2 flex items-center gap-2.5 p-2 rounded-xl border border-white/6"
                style={{background:"rgba(255,255,255,0.02)"}}>
                <div className="w-5 h-5 rounded-full border border-white/15 flex-shrink-0"
                  style={{background:color}}/>
                <div className="flex-1">
                  <p className="text-[11px] text-white font-semibold">Palette extraite</p>
                  <div className="flex gap-1 mt-1">
                    {[p.primary,p.primaryDark,p.primaryLight,p.primaryDeep,p.primaryMuted].map((c,i)=>(
                      <div key={i} className="w-4 h-4 rounded-full border border-white/10"
                        style={{background:c}}/>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setColor(GOLD)}
                  className="text-[10px] text-slate-700 hover:text-slate-400">Reset</button>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Produit</p>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nom du produit *"
              data-testid="input-product-name"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700"
              style={{background:"rgba(255,255,255,0.05)"}}/>
            <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Prix (DH) *"
              data-testid="input-price"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700"
              style={{background:"rgba(255,255,255,0.05)"}}/>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
              placeholder="Points clés du produit (optionnel)"
              className="w-full rounded-xl border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-amber-500/40 placeholder-slate-700 resize-none"
              style={{background:"rgba(255,255,255,0.05)"}}/>
          </div>

          {/* Language */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Langue IA</p>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGS.map(l=>(
                <button key={l.v} onClick={()=>setLang(l.v)}
                  className="rounded-xl border py-2 text-xs font-semibold transition-all"
                  style={{borderColor:lang===l.v?color:"rgba(255,255,255,0.08)",
                    background:lang===l.v?`${color}18`:"rgba(255,255,255,0.03)",
                    color:lang===l.v?color:"#475569"}}
                  data-testid={`button-lang-${l.v}`}>{l.l}</button>
              ))}
            </div>
          </div>

          {/* Flux toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-white/6"
            style={{background:"rgba(255,255,255,0.02)"}}>
            <div className="flex-1">
              <p className="text-xs font-bold text-white">Visuels IA (Flux 1 Pro)</p>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {useFlux ? "Hero + Lifestyle + Avatar générés par IA" : "Utilise votre photo uploadée uniquement"}
              </p>
            </div>
            <button onClick={()=>setUseFlux(!useFlux)} className="text-slate-400 hover:text-white transition-colors">
              {useFlux
                ? <ToggleRight className="w-7 h-7" style={{color}}/>
                : <ToggleLeft className="w-7 h-7"/>}
            </button>
          </div>

          {/* Color override */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-white/6"
            style={{background:"rgba(255,255,255,0.02)"}}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">Couleur thème</p>
            <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white/20 cursor-pointer">
              <input type="color" value={color.startsWith("rgb")?GOLD:color}
                onChange={e=>setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
              <div className="w-full h-full rounded-full" style={{background:color}}/>
            </div>
          </div>

          {/* GENERATE button */}
          <Button onClick={generate} disabled={generating||uploading||!name||!price}
            data-testid="button-generate-infographic"
            className="w-full py-5 text-sm font-extrabold gap-2.5 rounded-2xl transition-all"
            style={{
              background:(name&&price&&!generating)?`linear-gradient(135deg,${color},${p.primaryDark})`:undefined,
              color:"#fff", letterSpacing:0.5,
              boxShadow:(name&&price&&!generating)?`0 8px 32px ${color}45`:"none",
              opacity:(!name||!price)?0.4:1,
              fontFamily:MONTSERRAT,
            }}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin"/> Génération en cours…</>
              : <><Wand2 className="w-4 h-4"/> Générer l'Infographie</>}
          </Button>

          {ready && !generating && (
            <Button onClick={()=>downloadJpg()} variant="outline"
              className="w-full gap-2 border-white/12 text-slate-300 hover:text-white hover:bg-white/5 font-semibold"
              data-testid="button-redownload">
              <Download className="w-4 h-4"/> Retélécharger (JPG 3×)
            </Button>
          )}

          {ready && !generating && (
            <p className="text-center text-[10px] text-slate-700">
              Résolution: {W*3}px · Format: JPG · Qualité: 96%
            </p>
          )}
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="flex-1 overflow-auto py-8 px-5 flex flex-col items-center"
          style={{background:"#070e1c"}}>

          {/* Empty state */}
          {!ready && !generating && (
            <div className="flex flex-col items-center justify-center h-full max-w-sm text-center space-y-6 py-16">
              <div className="w-24 h-24 rounded-3xl border border-white/5 flex items-center justify-center"
                style={{background:"rgba(255,255,255,0.02)"}}>
                <ImageIcon className="w-10 h-10 text-slate-800"/>
              </div>
              <div>
                <p className="text-white font-bold text-xl" style={{fontFamily:PLAYFAIR}}>
                  Votre chef-d'œuvre ici
                </p>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  Remplissez le formulaire, uploadez une photo, activez{" "}
                  <span style={{color}}>Flux 1 Pro</span>, puis cliquez{" "}
                  <strong style={{color}}>"Générer l'Infographie"</strong>.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[
                  {n:"01",t:"Photo produit",d:"Palette auto"},
                  {n:"02",t:"Claude 3.7 + Flux",d:"AIDA + visuels HD"},
                  {n:"03",t:"JPG 3× prêt",d:"1500px de largeur"},
                ].map(s=>(
                  <div key={s.n} className="rounded-2xl border border-white/5 p-4 text-center"
                    style={{background:"rgba(255,255,255,0.02)"}}>
                    <p className="text-2xl font-black mb-1" style={{color,fontFamily:MONTSERRAT}}>{s.n}</p>
                    <p className="text-xs font-bold text-white">{s.t}</p>
                    <p className="text-[10px] text-slate-700 mt-0.5">{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step progress */}
          {generating && (
            <div className="flex flex-col items-center justify-start w-full max-w-sm pt-8">
              <div className="mb-8 text-center">
                <p className="text-white font-bold text-xl" style={{fontFamily:PLAYFAIR}}>
                  Création en cours…
                </p>
                <p className="text-slate-600 text-sm mt-1">
                  {useFlux ? "Claude 3.7 + Flux 1 Pro · Veuillez patienter" : "Claude 3.7 · Génération du texte"}
                </p>
              </div>
              <StepProgress current={currentStep} done={doneSteps} color={color}/>
              {/* Live preview as content arrives — scaled, no ref (capture uses full-size div) */}
              {copy && (
                <div className="mt-8 rounded-2xl overflow-hidden border border-white/8"
                  style={{maxHeight:"52vh",overflowY:"auto",opacity:0.75,
                    width:Math.round(W*0.54), position:"relative"}}>
                  <div style={{width:W, transformOrigin:"top left",
                    transform:`scale(0.54)`, display:"block"}}>
                    <Infographic copy={copy} color={color} name={name}
                      price={parseFloat(price)||0}
                      productImg={imgUrl} heroImg={heroImg}
                      lifestyleImg={lifestyleImg} avatarImg={avatarImg}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Final preview */}
          {ready && !generating && (
            <div className="w-full max-w-lg mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm" style={{fontFamily:MONTSERRAT}}>
                    Aperçu · {W}px
                  </p>
                  <p className="text-slate-600 text-xs">Export final: {W*3}px · JPG 96%</p>
                </div>
                <button onClick={generate} disabled={generating}
                  className="flex items-center gap-1.5 text-xs border border-white/10 hover:border-white/20 text-slate-500 hover:text-white rounded-xl px-3 py-1.5 transition-all">
                  <RefreshCw className="w-3.5 h-3.5"/> Régénérer
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/8"
                style={{boxShadow:"0 24px 64px rgba(0,0,0,0.6)",maxHeight:"80vh",overflowY:"auto"}}>
                <div ref={previewRef} style={{width:W,margin:"0 auto"}}>
                  <Infographic copy={copy} color={color} name={name}
                    price={parseFloat(price)||0}
                    productImg={imgUrl} heroImg={heroImg}
                    lifestyleImg={lifestyleImg} avatarImg={avatarImg}/>
                </div>
              </div>

              <Button onClick={()=>downloadJpg()}
                className="w-full py-4 text-sm font-extrabold gap-2 rounded-2xl"
                style={{background:"linear-gradient(135deg,#10b981,#059669)",
                  color:"#fff",boxShadow:"0 8px 28px rgba(16,185,129,0.35)",
                  fontFamily:MONTSERRAT}}
                data-testid="button-download-jpg">
                <Download className="w-5 h-5"/> Télécharger l'image JPG (3× haute résolution)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

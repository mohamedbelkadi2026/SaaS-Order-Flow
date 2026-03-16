import { useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Printer, MapPin, RefreshCw, Zap } from "lucide-react";

/* ── Shared brand tokens ───────────────────────────────── */
const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

/* ── Scroll animation ──────────────────────────────────── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(28px)", transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Carrier data ──────────────────────────────────────── */
type BadgeType = "API Ready" | "Instant Sync";
type Feature = "pickup" | "tracking" | "labels";

interface Carrier {
  name: string;
  short: string;
  color: string;
  bg: string;
  badge: BadgeType;
  premium?: boolean;
  features: Feature[];
  desc: string;
}

const CARRIERS: Carrier[] = [
  {
    name: "Digylog",
    short: "DG",
    color: "#1d4ed8",
    bg: "#dbeafe",
    badge: "API Ready",
    premium: true,
    features: ["pickup", "tracking", "labels"],
    desc: "Partenaire Premium TajerGrow",
  },
  {
    name: "Cathedis",
    short: "CA",
    color: "#ea580c",
    bg: "#ffedd5",
    badge: "API Ready",
    features: ["pickup", "tracking", "labels"],
    desc: "Livraison nationale express",
  },
  {
    name: "Onessta",
    short: "ON",
    color: "#16a34a",
    bg: "#dcfce7",
    badge: "Instant Sync",
    features: ["tracking", "labels"],
    desc: "Réseau de livraison rapide",
  },
  {
    name: "Speedex",
    short: "SX",
    color: "#dc2626",
    bg: "#fee2e2",
    badge: "API Ready",
    features: ["pickup", "tracking", "labels"],
    desc: "Expédition express J+1",
  },
  {
    name: "KargoExpress",
    short: "KE",
    color: "#7c3aed",
    bg: "#ede9fe",
    badge: "Instant Sync",
    features: ["pickup", "tracking"],
    desc: "Livraison COD spécialisée",
  },
  {
    name: "Ozone Express",
    short: "OZ",
    color: "#0891b2",
    bg: "#cffafe",
    badge: "API Ready",
    features: ["pickup", "labels"],
    desc: "Couverture inter-villes",
  },
  {
    name: "ForceLog",
    short: "FL",
    color: "#0f172a",
    bg: "#e2e8f0",
    badge: "Instant Sync",
    features: ["tracking", "labels"],
    desc: "Logistique B2C avancée",
  },
  {
    name: "Livo",
    short: "LV",
    color: "#db2777",
    bg: "#fce7f3",
    badge: "API Ready",
    features: ["pickup", "tracking", "labels"],
    desc: "Livraison urbaine express",
  },
  {
    name: "Ameex",
    short: "AM",
    color: "#b45309",
    bg: "#fef3c7",
    badge: "Instant Sync",
    features: ["tracking", "labels"],
    desc: "Solutions logistiques flexibles",
  },
];

const FEATURE_META: Record<Feature, { icon: React.ReactNode; label: string }> = {
  pickup: { icon: <MapPin className="w-3 h-3" />, label: "Ramassage auto" },
  tracking: { icon: <RefreshCw className="w-3 h-3" />, label: "Suivi temps réel" },
  labels: { icon: <Printer className="w-3 h-3" />, label: "Impression étiquettes" },
};

/* ── Carrier Card ─────────────────────────────────────── */
function CarrierCard({ carrier, delay }: { carrier: Carrier; delay: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <FadeIn delay={delay}>
      <div
        className="relative bg-white rounded-2xl p-5 flex flex-col gap-3 cursor-default transition-all duration-300"
        style={{
          boxShadow: hovered ? "0 12px 32px rgba(30,27,75,0.14)" : "0 2px 12px rgba(0,0,0,0.06)",
          border: hovered ? `1px solid ${carrier.premium ? GOLD : "rgba(30,27,75,0.15)"}` : "1px solid rgba(30,27,75,0.07)",
          transform: hovered ? "translateY(-3px)" : "translateY(0)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Premium ribbon */}
        {carrier.premium && (
          <div
            className="absolute -top-2.5 -right-2.5 text-[9px] font-black px-2 py-0.5 rounded-full text-white"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 2px 8px rgba(197,160,89,0.5)" }}
          >
            ★ PREMIUM
          </div>
        )}

        {/* Logo area */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 transition-all duration-300"
            style={{
              background: hovered ? carrier.bg : "#f1f5f9",
              color: hovered ? carrier.color : "#94a3b8",
              filter: hovered ? "none" : "grayscale(100%)",
              boxShadow: hovered ? `0 4px 12px ${carrier.color}30` : "none",
            }}
          >
            {carrier.short}
          </div>
          <div className="min-w-0">
            <p
              className="font-black text-sm leading-tight transition-colors duration-300"
              style={{ color: hovered ? NAVY : "#64748b" }}
            >
              {carrier.name}
            </p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "#94a3b8" }}>
              {carrier.desc}
            </p>
          </div>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-1.5">
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
            style={{
              background: carrier.badge === "API Ready" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)",
              color: carrier.badge === "API Ready" ? "#16a34a" : "#2563eb",
              border: `1px solid ${carrier.badge === "API Ready" ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.3)"}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
              style={{ background: carrier.badge === "API Ready" ? "#22c55e" : "#3b82f6" }}
            />
            {carrier.badge}
          </div>
        </div>

        {/* Feature tags */}
        <div className="flex flex-wrap gap-1">
          {carrier.features.map((f) => (
            <div
              key={f}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium"
              style={{ background: "#f8f7ff", color: "#6366f1", border: "1px solid rgba(99,102,241,0.15)" }}
            >
              {FEATURE_META[f].icon}
              {FEATURE_META[f].label}
            </div>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}

/* ── Main Section (reusable) ───────────────────────────── */
interface ShippingPartnersSectionProps {
  dark?: boolean;
  standalone?: boolean;
}

export default function ShippingPartnersSection({ dark = false, standalone = false }: ShippingPartnersSectionProps) {
  const bg = dark ? NAVY : "#f8f7ff";
  const headingColor = dark ? "#fff" : NAVY;
  const subColor = dark ? "rgba(255,255,255,0.55)" : "#64748b";
  const labelColor = dark ? GOLD : GOLD;

  return (
    <section
      id="shipping-partners"
      className={standalone ? "min-h-screen flex flex-col justify-center" : ""}
      style={{ background: bg, padding: standalone ? "80px 0 60px" : "80px 0" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <FadeIn className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-5"
            style={{ background: dark ? "rgba(197,160,89,0.15)" : "rgba(197,160,89,0.1)", border: `1px solid ${GOLD}`, color: GOLD }}
          >
            <Zap className="w-3.5 h-3.5" />
            Partenaires de Livraison
          </div>

          <h2
            className="text-3xl sm:text-4xl font-black mb-4"
            style={{ fontFamily: "'Playfair Display', serif", color: headingColor, lineHeight: 1.15 }}
          >
            Intégré à la plupart des sociétés
            <br />
            <span style={{ color: GOLD }}>de livraison marocaines</span>
          </h2>

          <p className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: subColor }}>
            Expédiez vos colis en un clic. TajerGrow est compatible avec les leaders de la logistique au Maroc — sans configuration manuelle.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-8">
            {[
              { val: "9+", label: "Transporteurs partenaires" },
              { val: "100%", label: "Synchronisation automatique" },
              { val: "< 1s", label: "Délai de création d'étiquette" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-black" style={{ color: GOLD, fontFamily: "'Playfair Display', serif" }}>{s.val}</p>
                <p className="text-xs mt-0.5" style={{ color: subColor }}>{s.label}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
          {/* Digylog takes double width on desktop as premium */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 xl:col-span-2">
            <CarrierCard carrier={CARRIERS[0]} delay={0} />
          </div>
          {CARRIERS.slice(1).map((c, i) => (
            <CarrierCard key={c.name} carrier={c} delay={(i + 1) * 60} />
          ))}
        </div>

        {/* Legend */}
        <FadeIn delay={300} className="flex flex-wrap items-center justify-center gap-6 mb-10">
          <div className="flex items-center gap-2 text-xs" style={{ color: subColor }}>
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span><strong style={{ color: headingColor }}>API Ready</strong> — Intégration directe via API</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: subColor }}>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span><strong style={{ color: headingColor }}>Instant Sync</strong> — Synchronisation en temps réel</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: subColor }}>
            <span className="w-2 h-2 rounded-full" style={{ background: GOLD }} />
            <span><strong style={{ color: headingColor }}>★ PREMIUM</strong> — Partenaire officiel TajerGrow</span>
          </div>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={350} className="text-center">
          <Link href="/auth">
            <button
              className="inline-flex items-center gap-3 px-9 py-4 rounded-xl font-black text-white text-sm transition-all hover:brightness-110 hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
                boxShadow: "0 8px 28px rgba(197,160,89,0.4)",
              }}
              data-testid="shipping-cta-button"
            >
              Connecter mon transporteur
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <p className="mt-3 text-xs" style={{ color: subColor }}>
            Configuration en 2 minutes · Aucun frais supplémentaire
          </p>
        </FadeIn>

      </div>
    </section>
  );
}

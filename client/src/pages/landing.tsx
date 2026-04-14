import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import adminDashboardImg from "@assets/admin_dashaboard_1776178471898.png";
import agentConfirmationImg from "@assets/agent_confmation_1776178471899.png";
import agentMediaBuyerImg from "@assets/agent_media_buyer_1776178471899.png";
import {
  BarChart3, Package, Smartphone, Truck, Target, TrendingUp,
  Check, ChevronRight, Star, Zap, Shield, Crown,
  ShoppingCart, Users, Activity, ArrowRight, Menu, X,
  Mail, MapPin,
} from "lucide-react";
import { SiShopify, SiWoocommerce, SiGooglesheets, SiFacebook, SiInstagram, SiWhatsapp } from "react-icons/si";

/* ── Scroll Animation Hook ─────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ── Animated Section Wrapper ──────────────────────────────────── */
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Constants ─────────────────────────────────────────────────── */
const NAVY = "#1e1b4b";
const GOLD = "#C5A059";
const GOLD_LIGHT = "#d4b06a";

const FEATURES = [
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Dashboard Bénéfice Net",
    titleAr: "ربح صافٍ مباشر",
    desc: "Chaque commande affiche son bénéfice net en temps réel : produit, pub, livraison, emballage — tout calculé automatiquement.",
  },
  {
    icon: <Smartphone className="w-6 h-6" />,
    title: "Interface de Confirmation",
    titleAr: "تأكيد بـ WhatsApp أو مكالمة",
    desc: "Boutons WhatsApp et Appel directement dans la fiche commande. Vos agents confirment 3× plus vite depuis leur mobile.",
  },
  {
    icon: <Target className="w-6 h-6" />,
    title: "Tracking UTM Complet",
    titleAr: "تتبع UTM لكل مسوّق",
    desc: "Première plateforme marocaine avec tracking UTM profond. ROI, ROAS et bénéfice par campagne et par media buyer.",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Expédition Automatisée",
    titleAr: "شحن تلقائي مع Digylog",
    desc: "Intégration directe avec Digylog et les transporteurs marocains. Créez vos bons d'expédition en un clic.",
  },
  {
    icon: <Package className="w-6 h-6" />,
    title: "Inventaire Synchronisé",
    titleAr: "مزامنة المخزون",
    desc: "Le stock se décrémente automatiquement à chaque confirmation. Alertes de rupture en temps réel. Zéro saisie manuelle.",
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: "Rentabilité Multi-Boutiques",
    titleAr: "ربحية متعددة المتاجر",
    desc: "Gérez plusieurs boutiques depuis un tableau de bord unifié. P&L par boutique, par produit, et par période.",
  },
];

const PLANS = [
  {
    name: "Trial",
    nameAr: "تجريبي",
    price: "0",
    period: "",
    desc: "Parfait pour démarrer",
    limit: "60 commandes",
    popular: false,
    features: ["60 commandes offertes", "Dashboard complet", "1 agent inclus", "Support communauté"],
    cta: "Commencer Gratuitement",
    planKey: "trial",
  },
  {
    name: "Starter",
    nameAr: "المبتدئ",
    price: "200",
    period: "/mois",
    desc: "Pour les boutiques actives",
    limit: "1 500 commandes/mois",
    popular: true,
    features: ["1 500 commandes/mois", "Agents illimités", "Intégration Shopify & YouCan", "Export Excel avancé", "Support prioritaire"],
    cta: "Choisir Starter",
    planKey: "starter",
  },
  {
    name: "Pro",
    nameAr: "الاحترافي",
    price: "400",
    period: "/mois",
    desc: "Pour les grandes opérations",
    limit: "Illimité",
    popular: false,
    features: ["Commandes illimitées", "Tout de Starter", "Media Buyer Workspace", "Analytics avancées", "Support VIP 24/7", "Personnalisation"],
    cta: "Choisir Pro",
    planKey: "pro",
  },
];

/* ── Dashboard Mockup ──────────────────────────────────────────── */
function DashboardMockup() {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl border"
      style={{ borderColor: "rgba(197,160,89,0.3)", background: "#0f172a" }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1e293b" }}>
        <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
        <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-80" />
        <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
        <span className="ml-3 text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>tajergrow.com — Dashboard</span>
      </div>
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Stat cards row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Commandes", val: "1,247", change: "+12%", color: "#C5A059" },
            { label: "Confirmées", val: "68.4%", change: "+3.2%", color: "#22c55e" },
            { label: "Revenu Net", val: "34,800 DH", change: "+8%", color: "#60a5fa" },
            { label: "Bénéfice", val: "11,230 DH", change: "+15%", color: "#a78bfa" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[9px] opacity-50 text-white">{s.label}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.val}</p>
              <p className="text-[8px] text-green-400">{s.change}</p>
            </div>
          ))}
        </div>
        {/* Chart placeholder */}
        <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-end gap-1 h-16">
            {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h}%`,
                  background: i === 10 || i === 11 ? GOLD : "rgba(197,160,89,0.35)",
                }}
              />
            ))}
          </div>
          <p className="text-[8px] opacity-40 text-white mt-1">Commandes — 12 derniers jours</p>
        </div>
        {/* Order list */}
        <div className="space-y-1.5">
          {[
            { name: "Fatima Zahra", city: "Casablanca", status: "confirme", amount: "320 DH" },
            { name: "Ahmed Benali", city: "Marrakech", status: "nouveau", amount: "185 DH" },
            { name: "Sara Idrissi", city: "Rabat", status: "delivered", amount: "450 DH" },
          ].map((o) => (
            <div key={o.name} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: NAVY }}>{o.name[0]}</div>
                <div>
                  <p className="text-[9px] text-white font-medium">{o.name}</p>
                  <p className="text-[8px] opacity-40 text-white">{o.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: o.status === "confirme" ? "rgba(34,197,94,0.15)" : o.status === "nouveau" ? "rgba(197,160,89,0.15)" : "rgba(96,165,250,0.15)",
                    color: o.status === "confirme" ? "#22c55e" : o.status === "nouveau" ? GOLD : "#60a5fa",
                  }}
                >
                  {o.status === "confirme" ? "Confirmé" : o.status === "nouveau" ? "Nouveau" : "Livré"}
                </span>
                <span className="text-[9px] font-bold" style={{ color: GOLD }}>{o.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Tool logos data ───────────────────────────────────────────── */
const TOOLS = [
  { name: "Shopify",       icon: <SiShopify className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: "#95BF47" }} /> },
  { name: "YouCan",        icon: <span className="font-black text-lg sm:text-xl" style={{ color: "#FF6B35", fontFamily: "'Playfair Display', serif" }}>YouCan</span> },
  { name: "WooCommerce",   icon: <SiWoocommerce className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: "#7F54B3" }} /> },
  { name: "Google Sheets", icon: <SiGooglesheets className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: "#0F9D58" }} /> },
  { name: "Digylog",       icon: <Truck className="w-7 h-7 sm:w-9 sm:h-9" style={{ color: "#1d4ed8" }} /> },
];

const CARRIERS_MARQUEE = [
  { name: "Digylog",          logo: "/carriers/digylog.svg",   premium: true },
  { name: "Cathedis",         logo: "/carriers/cathidis.svg",  premium: false },
  { name: "Onessta",          logo: "/carriers/onessta.svg",   premium: false },
  { name: "Speedex",          logo: "/carriers/speedx.png",    premium: false },
  { name: "Kargo Express",    logo: "/carriers/cargo.svg",     premium: false },
  { name: "Ozone Express",    logo: "/carriers/ozon.svg",      premium: false },
  { name: "ForceLog",         logo: "/carriers/forcelog.png",  premium: false },
  { name: "Ameex",            logo: "/carriers/ameex.svg",     premium: false },
  { name: "Sendit",           logo: "/carriers/sendit.svg",    premium: false },
  { name: "Quick Livraison",  logo: "/carriers/ql.svg",        premium: false },
  { name: "Ozone Livraison",  logo: "/carriers/ol.svg",        premium: false },
];

/* ── Marquee Track (generic) ───────────────────────────────────── */
function MarqueeTrack({ children, direction = "left", speed = 30 }: {
  children: React.ReactNode[];
  direction?: "left" | "right";
  speed?: number;
}) {
  const [paused, setPaused] = useState(false);
  const items = [...children, ...children]; // duplicate for seamless loop

  return (
    <div
      className="relative overflow-hidden"
      style={{ maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)" }}
    >
      <div
        className="flex items-center gap-4 sm:gap-6"
        style={{
          width: "max-content",
          animation: `${direction === "left" ? "marquee-left" : "marquee-right"} ${speed}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {items.map((child, i) => (
          <div key={i} className="flex-shrink-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Marquee 1: Outils Favoris ─────────────────────────────────── */
function MarqueeTools() {
  const toolCards = TOOLS.map((t) => (
    <div
      key={t.name}
      className="flex flex-col items-center gap-2 sm:gap-3 px-1"
    >
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105"
        style={{
          background: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid rgba(30,27,75,0.06)",
        }}
      >
        {t.icon}
      </div>
      <span className="text-xs sm:text-sm font-semibold whitespace-nowrap" style={{ color: NAVY }}>
        {t.name}
      </span>
    </div>
  ));

  return (
    <section id="trust" className="py-16 sm:py-20" style={{ background: "#f8fafc" }}>
      <div className="text-center mb-10 px-4">
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Intégrations
        </p>
        <h2
          className="text-2xl sm:text-3xl font-black"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Compatible avec vos outils favoris
        </h2>
      </div>
      <MarqueeTrack speed={22} direction="left">
        {toolCards}
      </MarqueeTrack>
    </section>
  );
}

/* ── Carrier Logo Card (real images) ──────────────────────────── */
function CarrierMarqueeCard({ c }: { c: typeof CARRIERS_MARQUEE[0] }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 mx-3 sm:mx-4 cursor-default"
      style={{
        filter: hovered ? "grayscale(0%)" : "grayscale(100%)",
        opacity: hovered ? 1 : 0.6,
        transform: hovered ? "scale(1.1)" : "scale(1)",
        transition: "filter 0.35s ease, opacity 0.35s ease, transform 0.35s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Premium badge */}
      {c.premium && (
        <span
          className="absolute -top-2 -right-2 z-10 text-[8px] font-black px-1.5 py-0.5 rounded-full text-white"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 2px 6px rgba(197,160,89,0.5)" }}
        >
          ★
        </span>
      )}

      {/* White card */}
      <div
        className="flex items-center justify-center px-5 sm:px-7 rounded-xl"
        style={{
          background: "#fff",
          height: "64px",
          minWidth: "120px",
          boxShadow: hovered
            ? "0 8px 28px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)"
            : "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
          border: `1px solid ${hovered ? "rgba(30,27,75,0.15)" : "rgba(30,27,75,0.07)"}`,
          transition: "box-shadow 0.35s ease, border-color 0.35s ease",
        }}
      >
        {imgError ? (
          <span className="text-xs font-black whitespace-nowrap" style={{ color: "#64748b" }}>
            {c.name}
          </span>
        ) : (
          <img
            src={c.logo}
            alt={c.name}
            className="object-contain w-auto"
            style={{ maxHeight: "38px", maxWidth: "110px" }}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}

/* ── Marquee 2: Partenaires de Livraison ───────────────────────── */
function MarqueeCarriers() {
  const carrierCards = CARRIERS_MARQUEE.map((c) => (
    <CarrierMarqueeCard key={c.name} c={c} />
  ));

  return (
    <section id="shipping-partners" className="py-16 sm:py-20 border-t" style={{ background: "#f8fafc", borderColor: "rgba(30,27,75,0.06)" }}>
      <div className="text-center mb-10 px-4">
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Partenaires de Livraison
        </p>
        <h2
          className="text-2xl sm:text-3xl font-black mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Intégré à la plupart des sociétés
          <br className="hidden sm:block" />
          {" "}de livraison marocaines
        </h2>
        <p className="text-sm sm:text-base max-w-xl mx-auto leading-relaxed" style={{ color: "#64748b" }}>
          Expédiez vos colis en un clic. TajerGrow est compatible avec les leaders
          de la logistique au Maroc — sans configuration manuelle.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-center gap-8 mt-8">
          {[
            { val: "11+",   label: "Transporteurs" },
            { val: "100%",  label: "Sync automatique" },
            { val: "< 1s",  label: "Délai étiquette" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-black" style={{ color: GOLD, fontFamily: "'Playfair Display', serif" }}>{s.val}</p>
              <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <MarqueeTrack speed={30} direction="right">
        {carrierCards}
      </MarqueeTrack>

      {/* Primary CTA */}
      <div className="text-center mt-10 px-4">
        <a href="/auth">
          <button
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-black text-white text-sm transition-all hover:brightness-110 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
              boxShadow: "0 8px 24px rgba(197,160,89,0.35)",
            }}
            data-testid="carriers-cta-button"
          >
            Connecter mon transporteur
            <ArrowRight className="w-4 h-4" />
          </button>
        </a>
        <p className="mt-2.5 text-xs" style={{ color: "#94a3b8" }}>
          Configuration en 2 minutes · Aucun frais supplémentaire
        </p>
      </div>

      {/* Custom integration request box */}
      <div className="max-w-2xl mx-auto mt-8 mb-2 px-4">
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl px-6 py-5"
          style={{
            background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)",
            border: "1.5px solid #bfdbfe",
          }}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: "#dbeafe" }}>
            🔗
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black mb-0.5" style={{ color: NAVY }}>
              Votre transporteur manque لـ القائمة ؟
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#475569" }}>
              Nous ajoutons de nouvelles intégrations chaque semaine. Demandez l'ajout de votre société de livraison — notre équipe technique l'intègre gratuitement en moins de 24h.
            </p>
          </div>
          <a
            href="https://wa.me/212688959768"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-white text-xs whitespace-nowrap transition-all hover:brightness-110 hover:scale-105"
            style={{ background: "#1d4ed8", boxShadow: "0 4px 14px rgba(29,78,216,0.3)" }}
            data-testid="custom-carrier-request-button"
          >
            Demander une intégration
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Main Component ────────────────────────────────────────────── */
export default function LandingPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Smart CTA: Trial always → /register. Starter/Pro → /checkout?plan=... if logged in, else /register
  const getPlanHref = (planKey: string) => {
    if (planKey === "trial") return "/register";
    return user ? `/checkout?plan=${planKey}` : "/register";
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(30,27,75,0.97)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(197,160,89,0.15)" : "none",
          boxShadow: scrolled ? "0 4px 24px rgba(0,0,0,0.25)" : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo — links to dashboard for verified users, landing page for everyone else */}
            <Link href="/" data-testid="link-logo-nav">
              <div className="flex items-center gap-2.5 cursor-pointer group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity group-hover:opacity-80" style={{ background: GOLD }}>
                  <Crown className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white transition-opacity group-hover:opacity-80" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em" }}>
                  TajerGrow
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {[["Fonctionnalités", "features"], ["Tarifs", "pricing"], ["Transporteurs", "shipping-partners"], ["Intégrations", "trust"]].map(([label, id]) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="text-sm font-medium transition-colors hover:text-amber-300 whitespace-nowrap"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* Desktop CTAs — adapt to auth state */}
            <div className="hidden md:flex items-center gap-3">
              {user && !user.isEmailVerified ? (
                // Logged in but unverified → prompt to verify
                <Link href="/verify-email">
                  <button
                    className="text-sm font-bold px-5 py-2.5 rounded-lg transition-all hover:brightness-110 shadow-lg animate-pulse"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: "#fff" }}
                    data-testid="header-verify-button"
                  >
                    Vérifier mon compte
                  </button>
                </Link>
              ) : user ? (
                // Logged in and verified → go to dashboard
                <Link href="/dashboard">
                  <button
                    className="text-sm font-bold px-5 py-2.5 rounded-lg transition-all hover:brightness-110 shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: "#fff" }}
                    data-testid="header-dashboard-button"
                  >
                    Mon tableau de bord
                  </button>
                </Link>
              ) : (
                // Not logged in → standard CTAs
                <>
                  <Link href="/login">
                    <button
                      className="text-sm font-medium px-4 py-2 rounded-lg transition-all hover:bg-white/10"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      data-testid="header-login-button"
                    >
                      Connexion
                    </button>
                  </Link>
                  <Link href="/register">
                    <button
                      className="text-sm font-bold px-5 py-2.5 rounded-lg transition-all hover:brightness-110 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: "#fff" }}
                      data-testid="header-trial-button"
                    >
                      Essai Gratuit
                    </button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t px-4 py-4 space-y-3" style={{ borderColor: "rgba(197,160,89,0.2)", background: "rgba(30,27,75,0.98)" }}>
            {[["Fonctionnalités", "features"], ["Tarifs", "pricing"], ["Transporteurs", "shipping-partners"], ["Intégrations", "trust"]].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left text-sm text-white/80 py-2">
                {label}
              </button>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              {user && !user.isEmailVerified ? (
                <Link href="/verify-email">
                  <button className="w-full py-2.5 rounded-lg text-sm font-bold text-white animate-pulse" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }} data-testid="mobile-verify-button">
                    Vérifier mon compte
                  </button>
                </Link>
              ) : user ? (
                <Link href="/dashboard">
                  <button className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }} data-testid="mobile-dashboard-button">
                    Mon tableau de bord
                  </button>
                </Link>
              ) : (
                <>
                  <Link href="/login"><button className="w-full py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white">Connexion</button></Link>
                  <Link href="/register">
                    <button className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}>
                      Essai Gratuit
                    </button>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d1b69 50%, #1a1040 100%)` }}
      >
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(rgba(197,160,89,1) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: GOLD }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: "#a78bfa" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left — Text */}
            <div className="space-y-8">
              {/* Badge */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
                style={{ background: "rgba(197,160,89,0.15)", border: `1px solid ${GOLD}`, color: GOLD }}
              >
                <Zap className="w-3.5 h-3.5" />
                60 Premières Commandes GRATUITES
              </div>

              {/* Headline */}
              <div className="space-y-1">
                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl font-black leading-none"
                  style={{ fontFamily: "'Playfair Display', serif", color: GOLD }}
                >
                  TajerGrow
                </h1>
                <div dir="rtl" className="space-y-0">
                  <h2
                    className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-snug"
                    style={{ fontFamily: "'Playfair Display', serif", textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
                  >
                    نظّم تجارتك،
                  </h2>
                  <h2
                    className="text-3xl sm:text-4xl lg:text-5xl font-black leading-snug"
                    style={{ fontFamily: "'Playfair Display', serif", color: GOLD_LIGHT }}
                  >
                    ضاعف أرباحك
                  </h2>
                </div>
              </div>

              {/* Subheadline */}
              <p className="text-lg text-white/70 leading-relaxed max-w-md">
                La plateforme tout-en-un des e-commerçants marocains. +1,499 commandes traitées, 60% de taux de confirmation.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/register">
                  <button
                    className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-base transition-all hover:brightness-110 hover:scale-105 shadow-xl"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, boxShadow: `0 8px 32px rgba(197,160,89,0.4)` }}
                    data-testid="hero-cta-primary"
                  >
                    Commencer mon essai gratuit (60 commandes)
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
                <button
                  onClick={() => scrollTo("features")}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10"
                  style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)" }}
                  data-testid="hero-cta-secondary"
                >
                  Voir les fonctionnalités
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-6">
                <div className="flex -space-x-2">
                  {["F", "A", "S", "Y", "M"].map((l, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white/20 flex items-center justify-center text-xs font-bold text-white" style={{ background: [NAVY, "#2d1b69", "#4338ca", "#6d28d9", "#7c3aed"][i] }}>{l}</div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: GOLD }} />)}
                  </div>
                  <p className="text-xs text-white/50 mt-0.5">Utilisé par +200 e-commerçants marocains</p>
                </div>
              </div>
            </div>

            {/* Right — Dashboard Screenshot */}
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-20"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #a78bfa)` }}
              />
              <div className="relative">
                <DashboardMockup />
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <div className="w-px h-8 bg-white/20" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────── */}
      <section className="py-10 border-b" style={{ background: NAVY, borderColor: "rgba(197,160,89,0.2)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: "+1,499", label: "Commandes traitées" },
              { val: "60%",   label: "Taux de confirmation moyen" },
              { val: "+200",  label: "Marchands actifs" },
              { val: "24/7",  label: "Support dédié" },
            ].map((s) => (
              <FadeIn key={s.label}>
                <div>
                  <p className="text-3xl font-black" style={{ fontFamily: "'Playfair Display', serif", color: GOLD }}>{s.val}</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>{s.label}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORM SCREENSHOTS ──────────────────────────────── */}
      <section className="py-20" style={{ background: "#f8f7ff" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-14">
            <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Aperçu de la plateforme
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}>
              Une interface pensée pour
              <span style={{ color: GOLD }}> chaque membre de votre équipe</span>
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "#64748b" }}>
              Dashboard admin, agent de confirmation, media buyer — chacun a son espace optimisé.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Dashboard Admin",
                desc: "Vue globale: commandes, profit net, taux de confirmation, statut des colis en temps réel.",
                img: adminDashboardImg,
                badge: "Administrateur",
                stats: ["113 commandes", "191 DH profit net", "100% livraison"],
                popular: false,
              },
              {
                title: "Agent de Confirmation",
                desc: "Interface dédiée pour confirmer rapidement les commandes avec WhatsApp intégré.",
                img: agentConfirmationImg,
                badge: "Agent",
                stats: ["Portefeuille 8 DH", "1 livraison ce mois", "Statistiques 15j"],
                popular: true,
              },
              {
                title: "Media Buyer",
                desc: "Suivi ROI, taux de confirmation par campagne, profit net par produit et ville.",
                img: agentMediaBuyerImg,
                badge: "Media Buyer",
                stats: ["ROI en temps réel", "Stats par campagne", "Générateur UTM"],
                popular: false,
              },
            ].map((screen, i) => (
              <FadeIn key={screen.title} delay={i * 100}>
                <div
                  className="relative rounded-2xl overflow-hidden border bg-white transition-all duration-300 hover:-translate-y-2"
                  style={{
                    borderColor: screen.popular ? "rgba(197,160,89,0.6)" : "rgba(30,27,75,0.08)",
                    boxShadow: screen.popular
                      ? "0 8px 40px rgba(197,160,89,0.2)"
                      : "0 2px 16px rgba(0,0,0,0.06)",
                  }}
                >
                  {screen.popular && (
                    <div
                      className="absolute top-3 right-3 z-10 text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: GOLD, color: NAVY }}
                    >
                      Le plus utilisé
                    </div>
                  )}
                  <div className="relative overflow-hidden" style={{ height: "220px", background: NAVY }}>
                    <img
                      src={screen.img}
                      alt={screen.title}
                      className="w-full h-full object-cover object-top opacity-90"
                    />
                    <div className="absolute bottom-3 left-3">
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: "rgba(197,160,89,0.9)", color: NAVY }}
                      >
                        {screen.badge}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-bold text-lg mb-2" style={{ color: NAVY }}>{screen.title}</h3>
                    <p className="text-sm mb-4" style={{ color: "#64748b" }}>{screen.desc}</p>
                    <div className="space-y-1.5">
                      {screen.stats.map(stat => (
                        <div key={stat} className="flex items-center gap-2 text-xs" style={{ color: "#475569" }}>
                          <span style={{ color: GOLD }}>✓</span>
                          {stat}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────── */}
      <section id="features" className="py-24" style={{ background: "#f8f7ff" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: GOLD }}>Fonctionnalités</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}>
              Tout ce dont vous avez besoin,
              <span style={{ color: GOLD }}> en un seul endroit</span>
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "#64748b" }}>
              De la première commande à la livraison finale, TajerGrow gère tout votre flux opérationnel avec une précision chirurgicale.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <FadeIn key={f.title} delay={i * 80}>
                <div
                  className="group relative p-7 rounded-2xl bg-white border transition-all duration-300 hover:-translate-y-1"
                  style={{
                    borderColor: "rgba(30,27,75,0.08)",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px rgba(197,160,89,0.18)`; (e.currentTarget as HTMLDivElement).style.borderColor = `rgba(197,160,89,0.4)`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(30,27,75,0.08)"; }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ background: `rgba(197,160,89,0.1)`, color: GOLD }}>
                    {f.icon}
                  </div>
                  <p className="text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.4)" }} dir="rtl">{f.titleAr}</p>
                  <h3 className="text-lg font-bold mb-2" style={{ color: NAVY, fontFamily: "'Playfair Display', serif" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ─────────────────────────────────── */}
      <section className="py-24" style={{ background: NAVY }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <FadeIn>
              <div className="space-y-6">
                <p className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>Le problème réel</p>
                <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Vous perdez des commandes sans<br />
                  <span style={{ color: GOLD }}>le savoir.</span>
                </h2>
                <div className="space-y-4">
                  {[
                    "Vos agents confirment par appel sans outil structuré",
                    "Aucun tracking UTM : vous ne savez pas quelle pub est rentable",
                    "L'expédition est manuelle : copier-coller vers Digylog chaque jour",
                    "Votre stock se désynchronise après chaque livraison",
                    "Vous calculez votre bénéfice manuellement sur Excel",
                  ].map((pain) => (
                    <div key={pain} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)" }}>
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{pain}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
            <FadeIn delay={150}>
              <div className="space-y-6">
                <p className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>La solution TajerGrow</p>
                <h2 className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Tout sous contrôle,
                  <br /><span style={{ color: GOLD }}>en temps réel.</span>
                </h2>
                <div className="space-y-4">
                  {[
                    "Interface agent mobile pour confirmer 3× plus vite (WhatsApp & Appel)",
                    "Tracking UTM profond : ROAS, ROI et bénéfice net par campagne",
                    "Expédition automatisée vers Digylog et tous les transporteurs",
                    "Inventaire synchronisé automatiquement à chaque confirmation",
                    "P&L automatique : coût produit, pub, livraison, emballage",
                  ].map((sol) => (
                    <div key={sol} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)" }}>
                        <Check className="w-3 h-3 text-green-400" />
                      </div>
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{sol}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: GOLD }}>Tarification</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}>
              Des prix simples,{" "}
              <span style={{ color: GOLD }}>sans surprise</span>
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
              Commencez gratuitement avec 60 commandes. Upgradez quand vous êtes prêt.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <FadeIn key={plan.name} delay={i * 100}>
                <div
                  className="relative rounded-2xl p-7 h-full flex flex-col"
                  style={{
                    background: plan.popular ? `linear-gradient(135deg, ${NAVY}, #2d1b69)` : "#fff",
                    border: plan.popular ? `2px solid ${GOLD}` : "1px solid rgba(30,27,75,0.1)",
                    boxShadow: plan.popular ? `0 16px 48px rgba(30,27,75,0.25)` : "0 2px 16px rgba(0,0,0,0.04)",
                  }}
                >
                  {plan.popular && (
                    <div
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-black text-white"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})` }}
                    >
                      ⭐ Populaire
                    </div>
                  )}

                  <div className="mb-6">
                    <p className="text-xs font-medium mb-1" style={{ color: plan.popular ? "rgba(255,255,255,0.45)" : "rgba(30,27,75,0.4)" }} dir="rtl">{plan.nameAr}</p>
                    <h3 className="text-xl font-black mb-1" style={{ fontFamily: "'Playfair Display', serif", color: plan.popular ? "#fff" : NAVY }}>{plan.name}</h3>
                    <p className="text-sm mb-4" style={{ color: plan.popular ? "rgba(255,255,255,0.55)" : "#64748b" }}>{plan.desc}</p>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black" style={{ fontFamily: "'Playfair Display', serif", color: plan.popular ? GOLD : NAVY }}>
                        {plan.price}
                      </span>
                      {plan.price !== "0" && <span className="text-base font-medium mb-1" style={{ color: plan.popular ? "rgba(255,255,255,0.5)" : "#94a3b8" }}>DH{plan.period}</span>}
                      {plan.price === "0" && <span className="text-base font-medium mb-1" style={{ color: plan.popular ? "rgba(255,255,255,0.5)" : "#94a3b8" }}>DH</span>}
                    </div>
                    <div
                      className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        background: plan.popular ? "rgba(197,160,89,0.15)" : "rgba(30,27,75,0.06)",
                        color: plan.popular ? GOLD : NAVY,
                      }}
                    >
                      {plan.limit}
                    </div>
                  </div>

                  <ul className="space-y-3 flex-1 mb-7">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: plan.popular ? "rgba(255,255,255,0.75)" : "#475569" }}>
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: plan.popular ? GOLD : "#22c55e" }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link href={getPlanHref(plan.planKey)}>
                    <button
                      className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:brightness-110"
                      style={plan.popular
                        ? { background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: "#fff", boxShadow: `0 4px 16px rgba(197,160,89,0.4)` }
                        : { background: "transparent", color: NAVY, border: `2px solid ${NAVY}` }
                      }
                      data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
                    >
                      {plan.cta}
                    </button>
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARQUEE 1: Outils Favoris ──────────────────────────── */}
      <MarqueeTools />

      {/* ── MARQUEE 2: Partenaires de Livraison ────────────────── */}
      <MarqueeCarriers />

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="py-24" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d1b69 100%)` }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-8"
              style={{ background: "rgba(197,160,89,0.15)", border: `1px solid ${GOLD}`, color: GOLD }}
            >
              <Shield className="w-3.5 h-3.5" />
              Sans carte bancaire · Aucun engagement
            </div>
            <h2
              className="text-3xl sm:text-5xl font-black text-white mb-6"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Prêt à faire passer<br />
              <span style={{ color: GOLD }}>votre business au niveau supérieur ?</span>
            </h2>
            <p className="text-lg mb-10" style={{ color: "rgba(255,255,255,0.6)" }}>
              Rejoignez +200 marchands marocains qui gèrent leurs commandes avec TajerGrow. Commencez avec 60 commandes gratuites.
            </p>
            <Link href="/register">
              <button
                className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-black text-lg transition-all hover:brightness-110 hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                  boxShadow: `0 16px 48px rgba(197,160,89,0.4)`,
                }}
                data-testid="final-cta-button"
              >
                Démarrer l'Essai Gratuit
                <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
            <p className="mt-5 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              Installation en 2 minutes · Support en français et arabe
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer style={{ background: NAVY, borderTop: "1px solid rgba(197,160,89,0.15)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">

          {/* ── Main grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">

            {/* Brand column (spans 2 on lg) */}
            <div className="lg:col-span-2 text-center sm:text-left">
              <Link href="/" className="inline-flex items-center gap-2.5 mb-4 group" data-testid="link-logo-footer">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-opacity group-hover:opacity-80"
                  style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 4px 12px rgba(197,160,89,0.4)" }}
                >
                  <Crown className="w-4 h-4 text-white" />
                </div>
                <span
                  className="text-2xl font-bold text-white transition-opacity group-hover:opacity-80"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  TajerGrow
                </span>
              </Link>
              <p className="text-sm leading-relaxed max-w-xs mx-auto sm:mx-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                TajerGrow : La solution n°1 pour la gestion des commandes COD au Maroc. Optimisez votre confirmation, suivez vos colis et maîtrisez votre rentabilité.
              </p>

              {/* Contact info */}
              <div className="mt-6 space-y-3">
                {[
                  {
                    icon: <Mail className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />,
                    label: "contact@tajergrow.com",
                    href: "mailto:contact@tajergrow.com",
                  },
                  {
                    icon: <SiWhatsapp className="w-4 h-4 flex-shrink-0" style={{ color: "#25D366" }} />,
                    label: "06 88 95 97 68",
                    href: "https://wa.me/212688959768",
                  },
                  {
                    icon: <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />,
                    label: "Agadir, Maroc",
                    href: null,
                  },
                ].map(({ icon, label, href }) => (
                  <div key={label} className="flex items-center gap-2.5 justify-center sm:justify-start">
                    {icon}
                    {href ? (
                      <a
                        href={href}
                        target={href.startsWith("http") ? "_blank" : undefined}
                        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="text-sm transition-colors duration-200"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                      >
                        {label}
                      </a>
                    ) : (
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Plateforme */}
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-5" style={{ color: GOLD }}>
                Plateforme
              </h4>
              <ul className="space-y-2.5">
                {([
                  ["Dashboard", user ? "/" : "/register", false],
                  ["Mes Commandes", user ? "/orders" : "/register", false],
                  ["Stock", user ? "/inventory" : "/register", false],
                  ["Intégrations", "trust", true],
                ] as [string, string, boolean][]).map(([label, dest, isScroll]) => (
                  <li key={label}>
                    {isScroll ? (
                      <button
                        onClick={() => scrollTo(dest)}
                        className="text-sm transition-colors duration-200"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                      >
                        {label}
                      </button>
                    ) : (
                      <Link href={dest}>
                        <span
                          className="text-sm transition-colors duration-200 cursor-pointer"
                          style={{ color: "rgba(255,255,255,0.5)" }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = GOLD)}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)")}
                        >
                          {label}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Liens Utiles */}
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-5" style={{ color: GOLD }}>
                Liens Utiles
              </h4>
              <ul className="space-y-2.5">
                {([
                  ["Tarifs", "/tarifs"],
                  ["FAQ", "/faq"],
                  ["Blog", "/blog"],
                  ["Témoignages", "/temoignages"],
                ] as [string, string][]).map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}>
                      <span
                        className="text-sm transition-colors duration-200 cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = GOLD)}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)")}
                      >
                        {label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Légal */}
            <div className="text-center sm:text-left">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-5" style={{ color: GOLD }}>
                Légal
              </h4>
              <ul className="space-y-2.5">
                {([
                  ["Conditions d'utilisation", "/terms"],
                  ["Politique de confidentialité", "/privacy"],
                ] as [string, string][]).map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}>
                      <span
                        className="text-sm transition-colors duration-200 cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = GOLD)}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)")}
                      >
                        {label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-5 pt-7"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs order-2 sm:order-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              © 2026 TajerGrow.com. Tous droits réservés.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-4 order-1 sm:order-2">
              {[
                {
                  icon: <SiFacebook className="w-4 h-4" />,
                  href: "https://facebook.com/tajergrow",
                  label: "Facebook",
                },
                {
                  icon: <SiInstagram className="w-4 h-4" />,
                  href: "https://instagram.com/tajergrow",
                  label: "Instagram",
                },
                {
                  icon: <SiWhatsapp className="w-4 h-4" />,
                  href: "https://wa.me/212688959768",
                  label: "WhatsApp",
                },
              ].map(({ icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = `rgba(197,160,89,0.18)`;
                    (e.currentTarget as HTMLElement).style.color = GOLD;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
                  }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}

import { Link } from "wouter";
import { Crown, Check, ArrowRight, Zap, Star } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const plans = [
  {
    name: "Essai Gratuit",
    price: "0",
    unit: "DH",
    period: "",
    highlight: "Pour démarrer sans risque",
    description: "Testez toutes les fonctionnalités sans carte bancaire.",
    badge: null,
    cta: "Commencer gratuitement",
    ctaHref: "/auth",
    features: [
      "60 premières commandes incluses",
      "Dashboard & statistiques",
      "1 boutique connectée",
      "Confirmation automatique",
      "Support par email",
    ],
    accent: "#64748b",
    cardStyle: { background: "#fff", border: "1.5px solid rgba(30,27,75,0.1)" },
    textColor: NAVY,
  },
  {
    name: "Starter",
    price: "200",
    unit: "DH",
    period: "/mois",
    highlight: "Pour les commerçants actifs",
    description: "Gérez jusqu'à 1500 commandes par mois avec toutes les intégrations.",
    badge: "Populaire",
    cta: "Choisir Starter",
    ctaHref: "/auth",
    features: [
      "Jusqu'à 1 500 commandes/mois",
      "Toutes les intégrations (YouCan, Shopify…)",
      "3 boutiques connectées",
      "Suivi colis en temps réel",
      "Tracking UTM avancé",
      "Support prioritaire WhatsApp",
    ],
    accent: GOLD,
    cardStyle: {
      background: NAVY,
      border: `2px solid ${GOLD}`,
      boxShadow: `0 20px 60px rgba(30,27,75,0.25)`,
    },
    textColor: "#fff",
  },
  {
    name: "Pro",
    price: "400",
    unit: "DH",
    period: "/mois",
    highlight: "Pour les grandes équipes",
    description: "Commandes illimitées, équipe complète et support VIP dédié.",
    badge: null,
    cta: "Choisir Pro",
    ctaHref: "/auth",
    features: [
      "Commandes illimitées",
      "Boutiques illimitées",
      "Gestion multi-équipes & agents",
      "API complète",
      "Rapports avancés & export",
      "Support VIP — Manager dédié",
      "Onboarding personnalisé",
    ],
    accent: GOLD,
    cardStyle: { background: "#fff", border: "1.5px solid rgba(30,27,75,0.1)" },
    textColor: NAVY,
  },
];

export default function TarifsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      {/* SEO meta via document title */}
      {typeof document !== "undefined" && (document.title = "TajerGrow — Tarifs & Abonnements | Gestion COD Maroc")}

      {/* Nav */}
      <nav
        className="sticky top-0 z-50 px-4 sm:px-8 py-4 flex items-center justify-between"
        style={{ background: NAVY, borderBottom: "1px solid rgba(197,160,89,0.15)" }}
      >
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)` }}
            >
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              TajerGrow
            </span>
          </div>
        </Link>
        <Link href="/">
          <span
            className="text-sm font-medium transition-colors duration-200 cursor-pointer"
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          >
            ← Retour à l'accueil
          </span>
        </Link>
      </nav>

      {/* Hero */}
      <div className="text-center px-4 pt-16 pb-12">
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Tarifs & Abonnements
        </p>
        <h1
          className="text-3xl sm:text-5xl font-black mb-4"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Des prix transparents,
          <br />
          <span style={{ color: GOLD }}>pensés pour le Maroc</span>
        </h1>
        <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
          Commencez gratuitement. Évoluez à votre rythme. Aucun frais caché, aucun engagement annuel.
        </p>
        <div
          className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "rgba(197,160,89,0.12)", color: GOLD, border: "1px solid rgba(197,160,89,0.25)" }}
        >
          <Zap className="w-3.5 h-3.5" /> 60 premières commandes GRATUITES pour tout nouveau compte
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-5xl mx-auto px-4 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="relative rounded-2xl p-7 flex flex-col"
            style={plan.cardStyle}
          >
            {plan.badge && (
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-black px-4 py-1 rounded-full text-white"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 4px 12px rgba(197,160,89,0.4)" }}
              >
                ⭐ {plan.badge}
              </span>
            )}

            <div className="mb-6">
              <p
                className="text-xs font-black uppercase tracking-[0.18em] mb-1"
                style={{ color: plan.name === "Starter" ? GOLD : GOLD }}
              >
                {plan.name}
              </p>
              <div className="flex items-end gap-1 mb-1">
                <span
                  className="text-4xl font-black"
                  style={{ fontFamily: "'Playfair Display', serif", color: plan.textColor }}
                >
                  {plan.price}
                </span>
                <span className="text-lg font-bold mb-1" style={{ color: plan.name === "Starter" ? "rgba(255,255,255,0.7)" : "#94a3b8" }}>
                  {plan.unit}{plan.period}
                </span>
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: plan.name === "Starter" ? "rgba(255,255,255,0.9)" : "#475569" }}>
                {plan.highlight}
              </p>
              <p className="text-xs" style={{ color: plan.name === "Starter" ? "rgba(255,255,255,0.55)" : "#94a3b8" }}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    style={{ color: plan.name === "Starter" ? GOLD : GOLD }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: plan.name === "Starter" ? "rgba(255,255,255,0.8)" : "#475569" }}
                  >
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            <Link href={plan.ctaHref}>
              <button
                className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 hover:scale-[1.02]"
                style={
                  plan.name === "Starter"
                    ? { background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, color: "#fff", boxShadow: "0 8px 24px rgba(197,160,89,0.4)" }
                    : { background: "rgba(30,27,75,0.07)", color: NAVY, border: "1.5px solid rgba(30,27,75,0.15)" }
                }
                data-testid={`plan-cta-${plan.name.toLowerCase()}`}
              >
                {plan.cta} <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        ))}
      </div>

      {/* FAQ teaser */}
      <div
        className="text-center py-10 border-t"
        style={{ background: NAVY, borderColor: "rgba(197,160,89,0.15)" }}
      >
        <p className="text-white text-sm mb-2">Une question sur les tarifs ?</p>
        <Link href="/faq">
          <span
            className="text-sm font-bold cursor-pointer transition-colors duration-200"
            style={{ color: GOLD }}
            onMouseEnter={e => (e.currentTarget.style.color = "#d4b06a")}
            onMouseLeave={e => (e.currentTarget.style.color = GOLD)}
          >
            Consultez notre FAQ →
          </span>
        </Link>
        <p className="mt-6 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          © 2026 TajerGrow.com. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}

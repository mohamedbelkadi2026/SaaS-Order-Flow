import { Link } from "wouter";
import { Crown, Star, ArrowRight, Quote } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const testimonials = [
  {
    name: "Youssef B.",
    city: "Casablanca",
    store: "Boutique Mode & Lifestyle",
    avatar: "Y",
    stars: 5,
    quote: "Avant TajerGrow, je perdais 30% de mes commandes faute de suivi. Maintenant mon taux de confirmation est à 72% et je sais exactement d'où vient chaque vente.",
    metric: "+32% taux de confirmation",
    soon: true,
  },
  {
    name: "Sanaa M.",
    city: "Marrakech",
    store: "Cosmétiques Bio Maroc",
    avatar: "S",
    stars: 5,
    quote: "La connexion avec Digylog est magique — mes étiquettes se créent automatiquement. J'économise 2h par jour que j'investis dans mes publicités.",
    metric: "2h gagnées/jour",
    soon: true,
  },
  {
    name: "Khalid T.",
    city: "Agadir",
    store: "Tech & Gadgets",
    avatar: "K",
    stars: 5,
    quote: "Le tracking UTM m'a révélé que 80% de mes profits venaient de 2 ad sets. J'ai doublé mon budget sur ces ad sets et mes bénéfices ont triplé.",
    metric: "ROI publicité ×3",
    soon: true,
  },
  {
    name: "Fatima Z.",
    city: "Rabat",
    store: "Maison & Déco",
    avatar: "F",
    stars: 5,
    quote: "Je gère 3 boutiques en même temps depuis un seul dashboard. C'est impossible à imaginer sans TajerGrow.",
    metric: "3 boutiques, 1 dashboard",
    soon: true,
  },
  {
    name: "Omar A.",
    city: "Fès",
    store: "Sport & Fitness",
    avatar: "O",
    stars: 5,
    quote: "Le support sur WhatsApp est incroyable — ils répondent en moins d'une heure. Ce niveau de service n'existe nulle part ailleurs au Maroc.",
    metric: "Support < 1h",
    soon: true,
  },
  {
    name: "Amina R.",
    city: "Tanger",
    store: "Bijoux Artisanaux",
    avatar: "A",
    stars: 5,
    quote: "Grâce aux statistiques de rentabilité, j'ai découvert que certains produits me faisaient perdre de l'argent. J'ai recentré ma gamme et ma marge nette a doublé.",
    metric: "Marge nette ×2",
    soon: true,
  },
];

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: GOLD }} />
      ))}
    </div>
  );
}

export default function TemoignagesPage() {
  if (typeof document !== "undefined") {
    document.title = "Témoignages — E-commerçants marocains font confiance à TajerGrow";
  }

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
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
      <div className="text-center px-4 pt-14 pb-10">
        <div className="flex items-center justify-center gap-1 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-current" style={{ color: GOLD }} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Témoignages
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Ils ont transformé leur e-commerce
          <br />
          <span style={{ color: GOLD }}>grâce à TajerGrow</span>
        </h1>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "#64748b" }}>
          Plus de 200 e-commerçants marocains nous font confiance. Voici leurs histoires.
        </p>
        <div
          className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "rgba(197,160,89,0.1)", color: GOLD, border: "1px solid rgba(197,160,89,0.2)" }}
        >
          📸 Témoignages vidéo à venir — partagez le vôtre
        </div>
      </div>

      {/* Testimonial grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {testimonials.map((t) => (
          <div
            key={t.name}
            className="rounded-xl p-6 flex flex-col"
            style={{ background: "#fff", border: "1px solid rgba(30,27,75,0.08)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}
          >
            {/* Quote icon */}
            <Quote className="w-6 h-6 mb-3" style={{ color: "rgba(197,160,89,0.3)" }} />

            <p className="text-sm leading-relaxed flex-1 italic mb-4" style={{ color: "#475569" }}>
              "{t.quote}"
            </p>

            {/* Metric badge */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black mb-4 self-start"
              style={{ background: "rgba(30,27,75,0.05)", color: NAVY, border: "1px solid rgba(30,27,75,0.1)" }}
            >
              📈 {t.metric}
            </div>

            {/* Author */}
            <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "rgba(30,27,75,0.06)" }}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a6e)` }}
              >
                {t.avatar}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: NAVY }}>{t.name}</p>
                <p className="text-xs" style={{ color: "#94a3b8" }}>{t.store} — {t.city}</p>
              </div>
              <div className="ml-auto">
                <StarRow count={t.stars} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        className="text-center py-14 px-4"
        style={{ background: NAVY, borderTop: "1px solid rgba(197,160,89,0.15)" }}
      >
        <h2 className="text-2xl font-black text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Votre success story commence ici
        </h2>
        <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.55)" }}>
          60 premières commandes gratuites. Aucune carte bancaire requise.
        </p>
        <Link href="/auth">
          <button
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-black text-white text-sm transition-all hover:brightness-110 hover:scale-105"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 8px 24px rgba(197,160,89,0.4)" }}
            data-testid="temoignages-cta"
          >
            Commencer gratuitement <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
        <p className="mt-8 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          © 2026 TajerGrow.com. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}

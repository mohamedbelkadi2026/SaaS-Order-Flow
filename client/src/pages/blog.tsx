import { Link } from "wouter";
import { Crown, ArrowRight, BookOpen } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const placeholderPosts = [
  {
    category: "Stratégie COD",
    title: "Comment passer de 40% à 70% de taux de confirmation en 30 jours",
    excerpt: "Découvrez les scripts et techniques utilisés par les meilleurs e-commerçants marocains pour booster leur taux de confirmation.",
    readTime: "8 min",
    soon: true,
  },
  {
    category: "UTM & Publicité",
    title: "Guide complet du tracking UTM pour Facebook Ads au Maroc",
    excerpt: "Arrêtez de dépenser en aveugle. Apprenez à identifier précisément quelle publicité génère vos commandes livrées.",
    readTime: "12 min",
    soon: true,
  },
  {
    category: "Livraison",
    title: "Comparatif 2026 : Quel transporteur COD choisir au Maroc ?",
    excerpt: "Digylog, Cathedis, Onessta, Speedex… Analyse complète des tarifs, délais et taux de livraison de chaque partenaire.",
    readTime: "10 min",
    soon: true,
  },
  {
    category: "Gestion",
    title: "Automatiser la confirmation de commandes : le guide TajerGrow",
    excerpt: "Passez de la confirmation manuelle à un système automatisé qui tourne 24h/24 pendant que vous dormez.",
    readTime: "6 min",
    soon: true,
  },
  {
    category: "Rentabilité",
    title: "Calculer votre vraie marge nette COD : la méthode exacte",
    excerpt: "Produit + Livraison + Publicité + Retours = Vrai bénéfice. La formule que tout e-commerçant marocain doit connaître.",
    readTime: "7 min",
    soon: true,
  },
  {
    category: "Intégrations",
    title: "Connecter YouCan à TajerGrow : guide pas à pas",
    excerpt: "Intégration en 1 clic, imports automatiques, mise à jour des statuts — tout ce que vous devez savoir.",
    readTime: "5 min",
    soon: true,
  },
];

export default function BlogPage() {
  if (typeof document !== "undefined") {
    document.title = "Blog TajerGrow — Conseils E-commerce & Gestion COD au Maroc";
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
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5"
          style={{ background: "rgba(197,160,89,0.1)", border: "1.5px solid rgba(197,160,89,0.2)" }}
        >
          <BookOpen className="w-6 h-6" style={{ color: GOLD }} />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Blog & Ressources
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Conseils pour l'e-commerce marocain
        </h1>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "#64748b" }}>
          Stratégies COD, tracking UTM, gestion des transporteurs — tout ce qu'il faut savoir pour développer votre boutique au Maroc.
        </p>
        <div
          className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "rgba(197,160,89,0.1)", color: GOLD, border: "1px solid rgba(197,160,89,0.2)" }}
        >
          🚀 Articles à venir — Inscrivez-vous pour être notifié
        </div>
      </div>

      {/* Article grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {placeholderPosts.map((post) => (
          <div
            key={post.title}
            className="relative rounded-xl overflow-hidden flex flex-col"
            style={{ background: "#fff", border: "1px solid rgba(30,27,75,0.08)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}
          >
            {/* Category banner */}
            <div
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ background: "rgba(30,27,75,0.03)", borderBottom: "1px solid rgba(30,27,75,0.06)" }}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: GOLD }}>
                {post.category}
              </span>
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>{post.readTime} de lecture</span>
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col flex-1">
              <h2 className="text-sm font-black leading-snug mb-2" style={{ color: NAVY, fontFamily: "'Playfair Display', serif" }}>
                {post.title}
              </h2>
              <p className="text-xs leading-relaxed flex-1" style={{ color: "#64748b" }}>
                {post.excerpt}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(197,160,89,0.1)", color: GOLD }}
                >
                  Bientôt disponible <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Newsletter CTA */}
      <div
        className="text-center py-12 px-4"
        style={{ background: NAVY, borderTop: "1px solid rgba(197,160,89,0.15)" }}
      >
        <p className="font-bold text-white mb-1">Recevez nos articles en avant-première</p>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
          Rejoignez +200 e-commerçants marocains qui lisent notre newsletter hebdomadaire.
        </p>
        <a
          href="mailto:contact@tajergrow.com?subject=Newsletter TajerGrow"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-black text-white text-sm transition-all hover:brightness-110 hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, boxShadow: "0 8px 24px rgba(197,160,89,0.35)" }}
          data-testid="blog-newsletter-cta"
        >
          S'inscrire à la newsletter <ArrowRight className="w-4 h-4" />
        </a>
        <p className="mt-8 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          © 2026 TajerGrow.com. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}

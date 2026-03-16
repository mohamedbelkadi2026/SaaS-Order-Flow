import { Link } from "wouter";
import { Crown, Shield, Lock, Eye, UserX, Database, Mail } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const commitments = [
  {
    icon: <UserX className="w-5 h-5" />,
    title: "Zéro partage avec des tiers",
    text: "TajerGrow ne vend, ne loue et ne partage JAMAIS vos données clients avec des tiers — ni annonceurs, ni partenaires, ni concurrents. Vos leads sont exclusivement à vous.",
  },
  {
    icon: <Database className="w-5 h-5" />,
    title: "Base de données isolée par boutique",
    text: "Chaque boutique dispose de sa propre base de données cryptée, totalement isolée des autres comptes. Aucun accès croisé n'est possible entre marchands.",
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: "Données cryptées de bout en bout",
    text: "Toutes les données sont stockées avec un chiffrement AES-256 et transmises via HTTPS/TLS. Nos serveurs sont hébergés dans des datacenters sécurisés conformes aux normes ISO 27001.",
  },
  {
    icon: <Eye className="w-5 h-5" />,
    title: "Accès interne strictement limité",
    text: "Seule une équipe technique restreinte peut accéder aux données en cas de support technique critique, avec traçabilité complète de chaque accès. Ces accès sont journalisés et audités.",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Conformité loi 09-08 (Maroc)",
    text: "TajerGrow est conforme à la loi marocaine n° 09-08 sur la protection des données personnelles. Vous disposez d'un droit d'accès, de rectification et de suppression de vos données à tout moment.",
  },
  {
    icon: <Mail className="w-5 h-5" />,
    title: "Droit à l'oubli",
    text: "Sur simple demande à contact@tajergrow.com, toutes vos données et celles de vos clients sont définitivement et irréversiblement supprimées de nos serveurs dans un délai de 72 heures.",
  },
];

const sections = [
  {
    title: "Quelles données collectons-nous ?",
    content: `TajerGrow collecte uniquement les données strictement nécessaires au fonctionnement du service : vos informations de compte (nom, email, numéro de téléphone), les données de vos commandes (noms, adresses, téléphones de vos clients pour la livraison), les données d'utilisation anonymisées (pages visitées, fonctionnalités utilisées) pour améliorer l'expérience utilisateur, et les données de facturation (mode de paiement, historique d'abonnement).`,
  },
  {
    title: "Comment utilisons-nous vos données ?",
    content: `Vos données sont utilisées exclusivement pour : fournir et améliorer les fonctionnalités de TajerGrow, vous envoyer des notifications importantes (factures, alertes système, mises à jour), vous contacter pour le support client, et analyser les performances de la plateforme de manière agrégée et anonymisée. Nous n'utilisons JAMAIS vos données à des fins publicitaires ou commerciales sans votre consentement explicite.`,
  },
  {
    title: "Durée de conservation",
    content: `Les données actives sont conservées pendant toute la durée de votre abonnement. En cas de résiliation, vos données sont conservées 30 jours puis supprimées définitivement. Vous pouvez demander la suppression immédiate à tout moment par email à contact@tajergrow.com. Les données de facturation sont conservées 5 ans conformément aux obligations comptables marocaines.`,
  },
  {
    title: "Vos droits (loi 09-08)",
    content: `Conformément à la loi marocaine 09-08, vous disposez des droits suivants : droit d'accès à vos données personnelles, droit de rectification des données inexactes, droit d'opposition au traitement, droit à la suppression (droit à l'oubli), droit à la portabilité de vos données. Pour exercer ces droits, contactez-nous à : contact@tajergrow.com. Nous répondons sous 48 heures ouvrables.`,
  },
  {
    title: "Cookies & Tracking",
    content: `TajerGrow utilise uniquement des cookies fonctionnels essentiels au bon fonctionnement du service (session, préférences utilisateur). Nous n'utilisons pas de cookies publicitaires tiers. Vous pouvez contrôler les cookies via les paramètres de votre navigateur sans affecter l'utilisation du service.`,
  },
];

export default function PrivacyPage() {
  if (typeof document !== "undefined") {
    document.title = "Politique de Confidentialité — TajerGrow.com | Protection des Données Maroc";
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
      <div
        className="text-center px-4 py-14"
        style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #2d2a6e 100%)` }}
      >
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
          style={{ background: "rgba(197,160,89,0.15)", border: "1.5px solid rgba(197,160,89,0.3)" }}
        >
          <Shield className="w-7 h-7" style={{ color: GOLD }} />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          Confidentialité & Protection
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black mb-3 text-white"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Politique de Confidentialité
        </h1>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
          Vos données et celles de vos clients ne nous appartiennent pas. Elles vous appartiennent à vous — et uniquement à vous.
        </p>
      </div>

      {/* Commitment cards */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-xl font-black text-center mb-8" style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}>
          Nos 6 engagements de protection
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
          {commitments.map((c) => (
            <div
              key={c.title}
              className="rounded-xl p-5"
              style={{ background: "#fff", border: "1px solid rgba(30,27,75,0.08)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: "rgba(197,160,89,0.1)", color: GOLD }}
              >
                {c.icon}
              </div>
              <h3 className="text-sm font-black mb-2" style={{ color: NAVY }}>{c.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>{c.text}</p>
            </div>
          ))}
        </div>

        {/* Detailed sections */}
        <div className="space-y-5">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-xl p-6 sm:p-8"
              style={{ background: "#fff", border: "1px solid rgba(30,27,75,0.07)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <h2 className="text-base font-black mb-3" style={{ color: NAVY, fontFamily: "'Playfair Display', serif" }}>
                {s.title}
              </h2>
              <p
                className="text-sm leading-[1.85] text-justify"
                style={{ color: "#475569", fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {s.content}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            Dernière mise à jour : Mars 2026 — Conforme à la loi marocaine 09-08.{" "}
            <a href="mailto:contact@tajergrow.com" className="underline" style={{ color: GOLD }}>
              contact@tajergrow.com
            </a>
          </p>
        </div>
      </div>

      <div
        className="text-center py-6 border-t"
        style={{ background: NAVY, borderColor: "rgba(197,160,89,0.1)" }}
      >
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          © 2026 TajerGrow.com. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}

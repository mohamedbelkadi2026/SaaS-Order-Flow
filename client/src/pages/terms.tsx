import { Link } from "wouter";
import { Crown } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const sections = [
  {
    title: "1. Objet des présentes conditions",
    content: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme TajerGrow.com, un service SaaS de gestion de commandes COD (Cash On Delivery) destiné aux commerçants en ligne marocains. En créant un compte, vous acceptez pleinement et sans réserve les présentes conditions.`,
  },
  {
    title: "2. Respect de la vie privée des clients finaux",
    content: `L'utilisateur s'engage à utiliser TajerGrow dans le strict respect de la vie privée de ses clients finaux. Les données collectées via la plateforme (nom, adresse, numéro de téléphone, historique de commandes) doivent être utilisées exclusivement à des fins de gestion, de livraison et de service client. Toute utilisation commerciale non consentie de ces données est strictement interdite et constitue une violation des présentes CGU ainsi que de la loi marocaine 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel.`,
  },
  {
    title: "3. Responsabilité de l'utilisateur",
    content: `L'utilisateur est seul responsable de ses activités commerciales sur la plateforme TajerGrow. Cela inclut : la conformité de ses produits à la législation marocaine en vigueur, la véracité des informations fournies à ses clients, le respect des délais de livraison et la gestion des retours et réclamations. TajerGrow est un outil de gestion et ne saurait être tenu responsable des litiges commerciaux entre le marchand et ses clients.`,
  },
  {
    title: "4. Politique d'annulation d'abonnement",
    content: `L'utilisateur peut résilier son abonnement à tout moment depuis son espace personnel, rubrique « Facturation ». La résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement partiel n'est accordé pour les jours non utilisés. En cas d'annulation, l'accès à la plateforme est maintenu jusqu'à la date d'expiration de l'abonnement. Les données de l'utilisateur sont conservées pendant 30 jours après la résiliation, puis définitivement supprimées sur demande.`,
  },
  {
    title: "5. Conformité avec la loi marocaine 09-08",
    content: `TajerGrow se conforme pleinement à la loi n° 09-08 du 18 février 2009 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, promulguée au Maroc. En tant que responsable du traitement, TajerGrow s'engage à : collecter uniquement les données nécessaires au fonctionnement du service, assurer la sécurité et la confidentialité des données stockées, ne pas transférer les données à des tiers sans le consentement explicite des utilisateurs, et permettre à tout utilisateur d'exercer ses droits d'accès, de rectification et de suppression de ses données.`,
  },
  {
    title: "6. Propriété intellectuelle",
    content: `L'ensemble des éléments constituant TajerGrow (logo, design, code source, textes, fonctionnalités) est la propriété exclusive de TajerGrow.com. Toute reproduction, représentation ou exploitation non autorisée est strictement interdite et constitue une contrefaçon passible de sanctions.`,
  },
  {
    title: "7. Modification des conditions",
    content: `TajerGrow se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés de toute modification substantielle par email. La continuation de l'utilisation du service après notification vaut acceptation des nouvelles conditions.`,
  },
  {
    title: "8. Droit applicable & juridiction compétente",
    content: `Les présentes CGU sont soumises au droit marocain. Tout litige relatif à leur interprétation ou leur exécution sera soumis à la compétence exclusive des tribunaux de commerce marocains.`,
  },
];

export default function TermsPage() {
  if (typeof document !== "undefined") {
    document.title = "Conditions d'utilisation — TajerGrow.com";
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

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-10">
          <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
            Légal
          </p>
          <h1
            className="text-3xl sm:text-4xl font-black mb-3"
            style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
          >
            Conditions Générales d'Utilisation
          </h1>
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            Dernière mise à jour : Mars 2026 — Valable pour TajerGrow.com
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-xl p-6 sm:p-8"
              style={{ background: "#fff", border: "1px solid rgba(30,27,75,0.07)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <h2
                className="text-base font-black mb-3"
                style={{ color: NAVY, fontFamily: "'Playfair Display', serif" }}
              >
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
            Pour toute question légale :{" "}
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

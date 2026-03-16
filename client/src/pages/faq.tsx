import { useState } from "react";
import { Link } from "wouter";
import { Crown, ChevronDown } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const faqs = [
  {
    q: "Est-ce que TajerGrow est compatible avec YouCan et Shopify ?",
    a: "Oui, TajerGrow est compatible avec YouCan, Shopify, WooCommerce et Google Sheets. L'intégration se fait en 1 clic depuis votre tableau de bord, sans aucune configuration technique. Vos commandes sont importées automatiquement en temps réel.",
  },
  {
    q: "Mes données de leads sont-elles sécurisées ?",
    a: "Absolument. Chaque boutique bénéficie d'une base de données isolée et cryptée. Vos données clients (leads, commandes, contacts) sont votre propriété exclusive — TajerGrow ne les partage jamais avec des tiers, des concurrents ou des partenaires publicitaires. Nous sommes conformes à la loi marocaine 09-08 sur la protection des données personnelles.",
  },
  {
    q: "Puis-je connecter mon compte Digylog ?",
    a: "Oui, TajerGrow est partenaire officiel de Digylog. La connexion est directe depuis l'onglet Intégrations de votre dashboard. Une fois connecté, vos expéditions sont créées automatiquement, les étiquettes sont générées en moins d'une seconde et le suivi est mis à jour en temps réel.",
  },
  {
    q: "Comment payer mon abonnement ?",
    a: "Plusieurs modes de paiement sont disponibles au Maroc : virement bancaire, dépôt via CIH, ou paiement via Wafacash. Après confirmation de votre paiement, votre abonnement est activé dans les 2 heures ouvrables. Aucun paiement par carte internationale n'est requis.",
  },
  {
    q: "Combien de commandes puis-je gérer avec l'offre gratuite ?",
    a: "L'offre gratuite inclut vos 60 premières commandes, sans limite de temps. Elle vous permet de tester toutes les fonctionnalités de la plateforme. Une fois ces 60 commandes utilisées, vous pouvez passer à l'offre Starter (200 DH/mois) ou Pro (400 DH/mois).",
  },
  {
    q: "Puis-je gérer plusieurs boutiques avec un seul compte ?",
    a: "Oui. L'offre Starter permet de connecter jusqu'à 3 boutiques. L'offre Pro offre un nombre illimité de boutiques. Chaque boutique dispose de son propre tableau de bord, ses propres statistiques et sa propre configuration d'intégrations.",
  },
  {
    q: "Est-ce qu'il y a un engagement annuel ?",
    a: "Non, aucun engagement. Nos abonnements sont mensuels et résiliables à tout moment. Vous ne payez que ce que vous utilisez, sans frais de résiliation ni pénalité.",
  },
  {
    q: "Comment fonctionne le suivi UTM ?",
    a: "TajerGrow intègre un système de tracking UTM avancé qui vous permet d'identifier la source exacte de chaque commande (Facebook Ads, TikTok, Google, Instagram…). Vous visualisez directement dans votre dashboard quel ad set ou quelle campagne génère le plus de commandes confirmées et livrées.",
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: "#fff",
        border: open ? `1.5px solid ${GOLD}` : "1.5px solid rgba(30,27,75,0.08)",
        boxShadow: open ? `0 8px 32px rgba(197,160,89,0.12)` : "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <button
        className="w-full text-left px-6 py-5 flex items-start justify-between gap-4 transition-colors duration-200"
        onClick={() => setOpen(!open)}
        data-testid={`faq-toggle-${q.slice(0, 20).replace(/\s/g, "-")}`}
      >
        <span className="text-sm sm:text-base font-bold leading-snug pr-2" style={{ color: NAVY }}>
          {q}
        </span>
        <ChevronDown
          className="w-5 h-5 flex-shrink-0 mt-0.5 transition-transform duration-300"
          style={{ color: GOLD, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <div className="px-6 pb-6">
          <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
            {a}
          </p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  if (typeof document !== "undefined") {
    document.title = "TajerGrow FAQ — Tout savoir sur la gestion COD au Maroc";
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
        <p className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
          FAQ
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: NAVY }}
        >
          Questions Fréquentes
        </h1>
        <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: "#64748b" }}>
          Tout ce que vous devez savoir sur TajerGrow, la plateforme de gestion COD n°1 au Maroc.
        </p>
      </div>

      {/* Accordion */}
      <div className="max-w-3xl mx-auto px-4 pb-16 space-y-3">
        {faqs.map((item) => (
          <AccordionItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>

      {/* CTA */}
      <div
        className="text-center py-12 px-4"
        style={{ background: NAVY, borderTop: "1px solid rgba(197,160,89,0.15)" }}
      >
        <p className="text-white font-semibold mb-1">Vous n'avez pas trouvé votre réponse ?</p>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Notre équipe répond en moins de 2h sur WhatsApp.
        </p>
        <a
          href="https://wa.me/212688959768"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-black text-white text-sm transition-all hover:brightness-110 hover:scale-105"
          style={{ background: "#25D366", boxShadow: "0 8px 24px rgba(37,211,102,0.3)" }}
          data-testid="faq-whatsapp-cta"
        >
          Contacter le support WhatsApp
        </a>
        <p className="mt-8 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          © 2026 TajerGrow.com. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}

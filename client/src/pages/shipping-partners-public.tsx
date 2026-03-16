import { Link } from "wouter";
import { Crown, ArrowLeft } from "lucide-react";
import ShippingPartnersSection from "@/components/shipping-partners-section";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";

export default function ShippingPartnersPublicPage() {
  return (
    <div style={{ background: "#f8f7ff", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>

      {/* Minimal nav */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(30,27,75,0.97)", backdropFilter: "blur(16px)", borderColor: "rgba(197,160,89,0.15)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between py-3">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: GOLD }}>
                <Crown className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                TajerGrow
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/">
              <button
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all hover:bg-white/10"
                style={{ color: "rgba(255,255,255,0.75)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Accueil
              </button>
            </Link>
            <Link href="/auth">
              <button
                className="text-sm font-bold px-5 py-2 rounded-lg transition-all hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`, color: "#fff" }}
                data-testid="nav-cta-shipping"
              >
                Essai Gratuit
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Page hero */}
      <div
        className="py-16 text-center"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d1b69 100%)` }}
      >
        <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
          Nos Partenaires de Livraison
        </p>
        <h1
          className="text-3xl sm:text-5xl font-black text-white px-4"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          La logistique au cœur<br />
          <span style={{ color: GOLD }}>de TajerGrow</span>
        </h1>
        <p className="text-base mt-4 max-w-xl mx-auto px-4" style={{ color: "rgba(255,255,255,0.6)" }}>
          Nous avons intégré les meilleurs transporteurs marocains pour que vous n'ayez jamais à quitter votre tableau de bord.
        </p>
      </div>

      {/* Shipping Partners Section */}
      <ShippingPartnersSection dark={false} standalone />

      {/* Footer */}
      <footer className="border-t py-8 text-center" style={{ borderColor: "rgba(30,27,75,0.1)", background: "#0f0d2a" }}>
        <Link href="/">
          <div className="flex items-center justify-center gap-2 mb-3 cursor-pointer">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-base font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>TajerGrow</span>
          </div>
        </Link>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          © 2026 TajerGrow.com — Tous droits réservés. Conçu au Maroc 🇲🇦
        </p>
      </footer>
    </div>
  );
}

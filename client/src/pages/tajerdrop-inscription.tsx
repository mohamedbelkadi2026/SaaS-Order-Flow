import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Package, CheckCircle, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";
const NAVY2 = "#162847";

const EXPERIENCE_OPTIONS = [
  { value: "debutant",          label: "Débutant",                     desc: "Je commence, aucune expérience en vente" },
  { value: "vendu_en_ligne",    label: "J'ai déjà vendu en ligne",      desc: "J'ai de l'expérience en e-commerce / COD" },
  { value: "equipe_confirmation", label: "J'ai une équipe de confirmation", desc: "J'ai une équipe de callcenter ou d'agents" },
];

export default function TajerDropInscriptionPage() {
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    city: "",
    experience: "" as "" | "debutant" | "vendu_en_ligne" | "equipe_confirmation",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.fullName.trim()) return setError("Le nom complet est requis.");
    if (!form.phone.trim()) return setError("Le téléphone est requis.");
    // Moroccan phone: starts with +212 or 0, followed by 5/6/7, then 8 digits
    if (!/^(\+212|0)[5-7][0-9]{8}$/.test(form.phone.trim())) {
      return setError("Numéro de téléphone invalide. Format accepté : 06XXXXXXXX, 07XXXXXXXX, ou +212XXXXXXXXX");
    }
    if (!form.email.trim()) return setError("L'email est requis.");
    if (form.password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (!/[A-Z]/.test(form.password)) return setError("Le mot de passe doit contenir au moins une lettre majuscule.");
    if (!/[a-z]/.test(form.password)) return setError("Le mot de passe doit contenir au moins une lettre minuscule.");
    if (!/[0-9]/.test(form.password)) return setError("Le mot de passe doit contenir au moins un chiffre.");
    if (!form.city.trim()) return setError("La ville est requise.");

    setLoading(true);
    try {
      const payload: any = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
        city: form.city.trim(),
      };
      if (form.experience) payload.experience = form.experience;

      const res = await fetch("/api/auth/tajerdrop/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Erreur lors de l'inscription");
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: NAVY }}>
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(197,160,89,0.15)" }}>
            <CheckCircle className="w-10 h-10" style={{ color: GOLD }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Demande envoyée ✓</h1>
          <p className="text-white/60 mb-6 leading-relaxed">
            Votre demande de compte Seller TajerDrop a bien été enregistrée.
            Notre équipe va examiner votre dossier et vous contacter par email sous 24–48h.
          </p>
          <div className="rounded-2xl p-5 mb-6 text-left" style={{ background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.25)" }}>
            <p className="text-white/70 text-sm leading-relaxed">
              <strong className="text-white">Prochaines étapes :</strong><br />
              1. Validation de votre dossier par notre équipe<br />
              2. Email de confirmation avec vos accès<br />
              3. Accès au catalogue TajerDrop et création de commandes
            </p>
          </div>
          <Link href="/">
            <button
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #a07840)` }}
            >
              Retour à l'accueil
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: NAVY }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b px-4 py-4 flex items-center gap-4" style={{ background: "rgba(30,27,75,0.97)", borderColor: "rgba(197,160,89,0.2)", backdropFilter: "blur(12px)" }}>
        <Link href="/">
          <button className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(197,160,89,0.15)" }}>
            <Package className="w-4 h-4" style={{ color: GOLD }} />
          </div>
          <span className="font-bold text-white text-sm">TajerDrop</span>
          <span className="text-white/30 text-sm">— Inscription Seller</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-12">

        {/* Hero block */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(197,160,89,0.12)", border: "1px solid rgba(197,160,89,0.3)", color: GOLD }}
          >
            <Package className="w-3.5 h-3.5" />
            Dropshipping sans stock au Maroc
          </div>
          <h1 className="text-3xl font-black text-white mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Devenez Seller<br />
            <span style={{ color: GOLD }}>TajerDrop</span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed">
            Apportez vos leads, nous gérons le stock, la confirmation et la livraison.
            Aucun investissement produit requis.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: NAVY2, border: "1px solid rgba(197,160,89,0.15)" }}>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Error — top of form so it's always visible without scrolling */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }}>
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm leading-snug">{error}</p>
              </div>
            )}

            {/* Full name */}
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Nom complet *</label>
              <input
                type="text"
                value={form.fullName}
                onChange={e => handleChange("fullName", e.target.value)}
                placeholder="Votre nom et prénom"
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                onFocus={e => (e.target.style.borderColor = "rgba(197,160,89,0.5)")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
              />
            </div>

            {/* Phone + City in row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Téléphone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => handleChange("phone", e.target.value)}
                  placeholder="+212 6XX XXX XXX"
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(197,160,89,0.5)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Ville *</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => handleChange("city", e.target.value)}
                  placeholder="Casablanca..."
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(197,160,89,0.5)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => handleChange("email", e.target.value)}
                placeholder="vous@exemple.com"
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                onFocus={e => (e.target.style.borderColor = "rgba(197,160,89,0.5)")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Mot de passe *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => handleChange("password", e.target.value)}
                  placeholder="Minimum 8 caractères"
                  required
                  className="w-full px-4 py-3 pr-11 rounded-xl text-white text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(197,160,89,0.5)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Experience */}
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                Expérience e-commerce <span className="text-white/30 normal-case font-normal">(optionnel)</span>
              </label>
              <div className="space-y-2">
                {EXPERIENCE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: form.experience === opt.value ? "rgba(197,160,89,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${form.experience === opt.value ? "rgba(197,160,89,0.4)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="experience"
                      value={opt.value}
                      checked={form.experience === opt.value}
                      onChange={() => handleChange("experience", opt.value)}
                      className="mt-0.5 accent-amber-500 flex-shrink-0"
                    />
                    <div>
                      <p className="text-white text-sm font-semibold">{opt.label}</p>
                      <p className="text-white/40 text-xs mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #a07840)`, boxShadow: `0 6px 24px rgba(197,160,89,0.3)` }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...</>
              ) : (
                "Envoyer ma demande"
              )}
            </button>

            <p className="text-center text-white/40 text-xs leading-relaxed">
              Votre compte sera activé après validation manuelle par notre équipe.
              Vous recevrez un email de confirmation.
            </p>

          </form>
        </div>

        {/* Already have account */}
        <p className="text-center mt-6 text-white/40 text-sm">
          Vous avez déjà un compte SaaS ?{" "}
          <Link href="/login">
            <span className="text-amber-400 hover:text-amber-300 cursor-pointer font-medium transition-colors">Se connecter</span>
          </Link>
        </p>
      </div>
    </div>
  );
}

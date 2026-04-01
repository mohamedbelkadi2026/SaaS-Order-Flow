import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Store, Lock, Mail, User, ShieldAlert, Crown, Check } from "lucide-react";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

export default function AuthPage({ initialTab = "login" }: { initialTab?: "login" | "register" }) {
  const [isLogin, setIsLogin] = useState(initialTab === "login");
  const { login, signup, loginMutation, signupMutation } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [storeName, setStoreName] = useState("");
  const [suspendedMsg, setSuspendedMsg] = useState<string | null>(null);

  useEffect(() => {
    const msg = localStorage.getItem("suspended_message");
    if (msg) {
      setSuspendedMsg(msg);
      localStorage.removeItem("suspended_message");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, password);
        setLocation("/");
      } else {
        await signup(storeName, username, email, password);
        setLocation("/verify-email");
      }
    } catch {}
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  const inputClass = `
    w-full pl-10 pr-4 h-12 rounded-xl border text-sm font-medium
    bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400
    focus:outline-none focus:ring-2 focus:border-transparent transition-all
  `;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `radial-gradient(ellipse at center, ${NAVY} 0%, #0f0d2a 100%)`,
      }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(197,160,89,1) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">

        {/* ── Left Panel (desktop only) ─────────────────────── */}
        <div className="hidden lg:flex flex-col gap-8 px-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              TajerGrow
            </span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1
              className="text-4xl xl:text-5xl font-black text-white leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Gérez vos commandes
              <br />
              <span style={{ color: GOLD }}>comme un pro.</span>
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              La première plateforme SaaS marocaine avec tracking UTM avancé et expédition automatisée pour le COD.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              "Calcul de bénéfice net en temps réel",
              "Confirmation WhatsApp & Appel intégrés",
              "Tracking UTM par media buyer",
              "Intégration directe Digylog & transporteurs",
              "60 premières commandes gratuites",
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(197,160,89,0.2)", border: `1px solid ${GOLD}` }}>
                  <Check className="w-3 h-3" style={{ color: GOLD }} />
                </div>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Domain */}
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            tajergrow.com · Conçu au Maroc 🇲🇦
          </p>
        </div>

        {/* ── Right Panel — Form ────────────────────────────── */}
        <div className="flex flex-col gap-4 w-full">
          {/* Suspension alert */}
          {suspendedMsg && (
            <div
              className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}
              data-testid="alert-suspended"
            >
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
              <p className="text-sm font-medium text-red-300">{suspendedMsg}</p>
            </div>
          )}

          {/* Mobile logo (only visible on mobile) */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              TajerGrow
            </span>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#fff",
              boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(197,160,89,0.15)",
            }}
            data-testid="auth-card"
          >
            {/* Card header band */}
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${NAVY}, ${GOLD})` }} />

            <div className="p-8">
              {/* Title */}
              <div className="text-center mb-7">
                <h2
                  className="text-2xl font-black mb-1"
                  style={{ color: NAVY, fontFamily: "'Playfair Display', serif" }}
                  data-testid="auth-title"
                >
                  {isLogin ? "Connexion" : "Créer un compte"}
                </h2>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  {isLogin
                    ? "Bienvenue ! Connectez-vous à votre espace."
                    : "Lancez votre business en quelques secondes."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: NAVY }}>
                        Nom de la boutique
                      </label>
                      <div className="relative">
                        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          data-testid="input-store-name"
                          placeholder="Ma Boutique"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className={inputClass}
                          style={{ "--tw-ring-color": GOLD } as React.CSSProperties}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: NAVY }}>
                        Nom complet
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          data-testid="input-username"
                          placeholder="Mohamed"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: NAVY }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      data-testid="input-email"
                      type="email"
                      placeholder="email@tajergrow.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: NAVY }}>
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      data-testid="input-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      required
                      minLength={4}
                    />
                  </div>
                </div>

                <button
                  data-testid="button-submit"
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl font-black text-white text-sm tracking-wide transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 mt-1 flex items-center justify-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
                    boxShadow: `0 8px 24px rgba(197,160,89,0.4)`,
                  }}
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isLogin ? "Se connecter" : "Créer mon compte"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <button
                  data-testid="button-toggle-auth"
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm font-semibold transition-colors hover:opacity-80"
                  style={{ color: GOLD }}
                >
                  {isLogin
                    ? "Pas encore de compte ? Inscrivez-vous"
                    : "Déjà un compte ? Connectez-vous"}
                </button>
              </div>

              <p className="text-center text-xs mt-5" style={{ color: "#cbd5e1" }}>
                En continuant, vous acceptez les{" "}
                <span style={{ color: GOLD }} className="cursor-pointer hover:underline">conditions d'utilisation</span>
                {" "}de TajerGrow.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

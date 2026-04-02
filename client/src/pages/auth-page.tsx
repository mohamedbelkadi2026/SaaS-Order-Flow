import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Store, Lock, Mail, User, ShieldAlert, Crown, Check } from "lucide-react";
import { setLanguage } from "@/i18n";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const LANGS: { code: "fr" | "ar" | "en"; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "العربية", flag: "🇲🇦" },
];

export default function AuthPage({ initialTab = "login" }: { initialTab?: "login" | "register" }) {
  const { t, i18n } = useTranslation();
  const [isLogin, setIsLogin] = useState(initialTab === "login");
  const { login, signup, loginMutation, signupMutation } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [storeName, setStoreName] = useState("");
  const [suspendedMsg, setSuspendedMsg] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<"fr" | "ar" | "en">(
    (localStorage.getItem("tajer_lang") as "fr" | "ar" | "en") || "fr"
  );

  const isRtl = selectedLang === "ar";
  const isArabic = selectedLang === "ar";

  const fontFamily = isArabic
    ? "'Cairo', 'Playfair Display', sans-serif"
    : "'Playfair Display', serif";

  useEffect(() => {
    const msg = localStorage.getItem("suspended_message");
    if (msg) {
      setSuspendedMsg(msg);
      localStorage.removeItem("suspended_message");
    }
  }, []);

  const handleLangChange = (lang: "fr" | "ar" | "en") => {
    setSelectedLang(lang);
    setLanguage(lang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, password);
        setLocation("/");
      } else {
        await signup(storeName, username, email, password, selectedLang);
        setLocation("/verify-email");
      }
    } catch {}
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  const labelClass = "block text-xs font-bold mb-1.5 uppercase tracking-wide";

  const inputClass = `
    w-full h-12 rounded-xl border text-sm font-medium
    bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400
    focus:outline-none focus:ring-2 focus:border-transparent transition-all
    ltr:pl-10 ltr:pr-4 rtl:pr-10 rtl:pl-4
  `;

  const heroFeatures = [
    t("auth.heroF1"),
    t("auth.heroF2"),
    t("auth.heroF3"),
    t("auth.heroF4"),
    t("auth.heroF5"),
  ];

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `radial-gradient(ellipse at center, ${NAVY} 0%, #0f0d2a 100%)`,
        fontFamily: isArabic ? "'Cairo', sans-serif" : undefined,
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

      {/* Two-column layout — columns flip automatically in RTL */}
      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">

        {/* ── Panel A: Features (desktop) ─────────────────── */}
        <div className="hidden lg:flex flex-col gap-8 px-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-5 h-5 text-white" />
            </div>
            <span
              className="text-2xl font-black text-white"
              style={{ fontFamily }}
            >
              TajerGrow
            </span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1
              className="text-4xl xl:text-5xl font-black text-white leading-tight"
              style={{ fontFamily }}
            >
              {t("auth.heroHeadline1")}
              <br />
              <span style={{ color: GOLD }}>{t("auth.heroHeadline2")}</span>
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("auth.heroSub")}
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {heroFeatures.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(197,160,89,0.2)", border: `1px solid ${GOLD}` }}
                >
                  <Check className="w-3 h-3" style={{ color: GOLD }} />
                </div>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            {t("auth.heroFooter")}
          </p>
        </div>

        {/* ── Panel B: Auth Form ────────────────────────── */}
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

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span
              className="text-xl font-black text-white"
              style={{ fontFamily }}
            >
              TajerGrow
            </span>
          </div>

          {/* Auth card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#fff",
              boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(197,160,89,0.15)",
            }}
            data-testid="auth-card"
          >
            {/* Accent band */}
            <div className="h-1.5" style={{ background: `linear-gradient(${isRtl ? "270deg" : "90deg"}, ${NAVY}, ${GOLD})` }} />

            <div className="p-8">
              {/* Title */}
              <div className="text-center mb-7">
                <h2
                  className="text-2xl font-black mb-1"
                  style={{ color: NAVY, fontFamily }}
                  data-testid="auth-title"
                >
                  {isLogin ? t("auth.loginTitle") : t("auth.registerTitle")}
                </h2>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  {isLogin ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Register-only fields */}
                {!isLogin && (
                  <>
                    {/* Store name */}
                    <div>
                      <label className={labelClass} style={{ color: NAVY }}>
                        {t("auth.storeName")}
                      </label>
                      <div className="relative">
                        <Store
                          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3"
                        />
                        <input
                          data-testid="input-store-name"
                          placeholder={t("auth.storeNamePlaceholder")}
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>

                    {/* Full name */}
                    <div>
                      <label className={labelClass} style={{ color: NAVY }}>
                        {t("auth.fullName")}
                      </label>
                      <div className="relative">
                        <User
                          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3"
                        />
                        <input
                          data-testid="input-username"
                          placeholder={t("auth.fullNamePlaceholder")}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Email */}
                <div>
                  <label className={labelClass} style={{ color: NAVY }}>
                    {t("auth.email")}
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3"
                    />
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

                {/* Password */}
                <div>
                  <label className={labelClass} style={{ color: NAVY }}>
                    {t("auth.password")}
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3"
                    />
                    <input
                      data-testid="input-password"
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      required
                      minLength={4}
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  data-testid="button-submit"
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl font-black text-white text-sm tracking-wide transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 mt-1 flex items-center justify-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
                    boxShadow: `0 8px 24px rgba(197,160,89,0.4)`,
                    fontFamily: isArabic ? "'Cairo', sans-serif" : undefined,
                  }}
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isLogin ? t("auth.loginBtn") : t("auth.registerBtn")}
                </button>
              </form>

              {/* Toggle login/register */}
              <div className="mt-5 text-center">
                <button
                  data-testid="button-toggle-auth"
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm font-semibold transition-colors hover:opacity-80"
                  style={{ color: GOLD }}
                >
                  {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
                </button>
              </div>

              {/* Terms */}
              <p className="text-center text-xs mt-4" style={{ color: "#cbd5e1" }}>
                {t("auth.terms")}{" "}
                <span style={{ color: GOLD }} className="cursor-pointer hover:underline">
                  {t("auth.termsLink")}
                </span>{" "}
                {t("auth.termsEnd")}
              </p>

              {/* ── Language Switcher ── */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-1 flex-wrap">
                <span className="text-xs text-slate-400 ltr:mr-1 rtl:ml-1">
                  {t("auth.switchLang")}
                </span>
                {LANGS.map(({ code, label }, idx) => (
                  <span key={code} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => handleLangChange(code)}
                      data-testid={`lang-btn-${code}`}
                      className="text-xs font-semibold transition-all px-1 py-0.5 rounded"
                      style={{
                        color: selectedLang === code ? NAVY : "#94a3b8",
                        fontWeight: selectedLang === code ? 800 : 600,
                        textDecoration: selectedLang === code ? "underline" : "none",
                        textUnderlineOffset: "3px",
                        fontFamily: code === "ar" ? "'Cairo', sans-serif" : undefined,
                      }}
                    >
                      {label}
                    </button>
                    {idx < LANGS.length - 1 && (
                      <span className="text-slate-200 text-xs mx-0.5">|</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Loader2, Store, Lock, Mail, User, ShieldAlert, Crown, Check,
  Eye, EyeOff, Phone,
} from "lucide-react";
import { setLanguage } from "@/i18n";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";
const TEAL = "#0ea5e9";

const LANGS: { code: "fr" | "ar" | "en"; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
];

/* ─── Shared label class ─────────────────────────────── */
const labelCls = "block text-xs font-bold mb-1.5 uppercase tracking-wide";

/* ─── Shared input class ─────────────────────────────── */
const inputCls = `
  w-full h-12 rounded-xl border text-sm font-medium
  bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400
  focus:outline-none focus:ring-2 focus:border-transparent transition-all
  ltr:pl-10 ltr:pr-4 rtl:pr-10 rtl:pl-4
`.trim();

/* ─── Input with left icon ───────────────────────────── */
function IconInput({
  icon: Icon,
  testId,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  minLength,
  rightSlot,
}: {
  icon: React.ElementType;
  testId?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3 pointer-events-none" />
      <input
        data-testid={testId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className={inputCls}
      />
      {rightSlot && (
        <div className="absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

/* ─── Password input with eye toggle ────────────────── */
function PasswordInput({
  testId,
  placeholder,
  value,
  onChange,
  required,
}: {
  testId?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3 pointer-events-none" />
      <input
        data-testid={testId}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={4}
        className={inputCls + " ltr:pr-10 rtl:pl-10"}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3 text-slate-400 hover:text-slate-600 transition-colors"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ─── Phone input (+212) ─────────────────────────────── */
function PhoneInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden h-12 bg-slate-50 focus-within:ring-2 focus-within:ring-sky-400 transition-all">
      <div className="flex items-center gap-1.5 ltr:pl-3 rtl:pr-3 ltr:pr-2.5 rtl:pl-2.5 ltr:border-r rtl:border-l border-slate-200 bg-white shrink-0">
        <span className="text-base leading-none">🇲🇦</span>
        <span className="text-xs font-bold text-slate-600 whitespace-nowrap">+212</span>
      </div>
      <input
        data-testid="input-phone"
        type="tel"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
        className="flex-1 ltr:pl-3 rtl:pr-3 ltr:pr-3 rtl:pl-3 text-sm font-medium bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none"
      />
      <div className="flex items-center ltr:pr-3 rtl:pl-3">
        <Phone className="w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page Component
══════════════════════════════════════════════════════════ */
export default function AuthPage({ initialTab = "login" }: { initialTab?: "login" | "register" }) {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(initialTab === "login");
  const { login, signup, loginMutation, signupMutation } = useAuth();
  const [, setLocation] = useLocation();

  /* ── Shared fields ── */
  const [email, setEmail] = useState("");

  /* ── Login fields ── */
  const [loginPassword, setLoginPassword] = useState("");

  /* ── Register fields ── */
  const [username, setUsername] = useState("");
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* ── UI state ── */
  const [suspendedMsg, setSuspendedMsg] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<"fr" | "ar" | "en">(
    (localStorage.getItem("tajer_lang") as "fr" | "ar" | "en") || "fr"
  );

  const isRtl = selectedLang === "ar";
  const isArabic = selectedLang === "ar";
  const fontFamily = isArabic ? "'Cairo', sans-serif" : "'Inter', 'DM Sans', sans-serif";

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

  /* ── Validation ── */
  const pwMismatch = !isLogin && password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  const registerDisabled =
    !storeName || !username || !email || !password || !confirmPassword ||
    password !== confirmPassword || !termsAccepted || signupMutation.isPending;

  const loginDisabled = !email || !loginPassword || loginMutation.isPending;

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, loginPassword);
        setLocation("/");
      } else {
        const fullPhone = phone ? `+212${phone}` : undefined;
        await signup(storeName, username, email, password, selectedLang, fullPhone);
        setLocation("/verify-email");
      }
    } catch {}
  };

  /* ── Left-panel hero features ── */
  const heroFeatures = [
    t("auth.heroF1"), t("auth.heroF2"), t("auth.heroF3"),
    t("auth.heroF4"), t("auth.heroF5"),
  ];

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen flex items-start lg:items-center justify-center p-4 py-8"
      style={{
        background: `radial-gradient(ellipse at center, ${NAVY} 0%, #0f0d2a 100%)`,
        fontFamily,
      }}
    >
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(197,160,89,1) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Two-column container — columns flip in RTL automatically */}
      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 items-start lg:items-center">

        {/* ── Left panel: Features (desktop only) ─────────── */}
        <div className="hidden lg:flex flex-col gap-8 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-black text-white" style={{ fontFamily: isArabic ? "'Cairo',sans-serif" : "'Playfair Display',serif" }}>
              TajerGrow
            </span>
          </div>

          <div className="space-y-3">
            <h1
              className="text-4xl xl:text-5xl font-black text-white leading-tight"
              style={{ fontFamily: isArabic ? "'Cairo',sans-serif" : "'Playfair Display',serif" }}
            >
              {t("auth.heroHeadline1")}
              <br />
              <span style={{ color: GOLD }}>{t("auth.heroHeadline2")}</span>
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("auth.heroSub")}
            </p>
          </div>

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

          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            {t("auth.heroFooter")}
          </p>
        </div>

        {/* ── Right panel: Auth card ───────────────────────── */}
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
          <div className="flex lg:hidden items-center justify-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: GOLD }}>
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-white" style={{ fontFamily: isArabic ? "'Cairo',sans-serif" : "'Playfair Display',serif" }}>
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
            {/* Accent top band */}
            <div
              className="h-1.5"
              style={{
                background: isLogin
                  ? `linear-gradient(${isRtl ? "270deg" : "90deg"}, ${NAVY}, ${GOLD})`
                  : `linear-gradient(${isRtl ? "270deg" : "90deg"}, ${NAVY}, ${TEAL})`,
              }}
            />

            <div className="p-6 sm:p-8">
              {/* ── Card title ── */}
              <div className="text-center mb-6">
                <h2
                  className="text-2xl font-black mb-1"
                  style={{ color: NAVY, fontFamily: isArabic ? "'Cairo',sans-serif" : "'Inter','DM Sans',sans-serif" }}
                  data-testid="auth-title"
                >
                  {isLogin ? t("auth.loginTitle") : t("auth.registerTitle")}
                </h2>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  {isLogin ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {/* ════════════════════════════════
                    LOGIN FIELDS
                ════════════════════════════════ */}
                {isLogin && (
                  <div className="space-y-4">
                    <div>
                      <label className={labelCls} style={{ color: NAVY }}>{t("auth.email")}</label>
                      <IconInput
                        icon={Mail}
                        testId="input-email"
                        type="email"
                        placeholder="email@tajergrow.com"
                        value={email}
                        onChange={setEmail}
                        required
                      />
                    </div>

                    <div>
                      <label className={labelCls} style={{ color: NAVY }}>{t("auth.password")}</label>
                      <PasswordInput
                        testId="input-password"
                        placeholder={t("auth.passwordPlaceholder")}
                        value={loginPassword}
                        onChange={setLoginPassword}
                        required
                      />
                    </div>

                    <button
                      data-testid="button-submit"
                      type="submit"
                      disabled={loginDisabled}
                      className="w-full h-12 rounded-xl font-black text-white text-sm tracking-wide transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                      style={{
                        background: `linear-gradient(135deg, ${GOLD}, #d4b06a)`,
                        boxShadow: `0 8px 24px rgba(197,160,89,0.35)`,
                        fontFamily,
                      }}
                    >
                      {loginMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t("auth.loginBtn")}
                    </button>
                  </div>
                )}

                {/* ════════════════════════════════
                    REGISTER FIELDS
                ════════════════════════════════ */}
                {!isLogin && (
                  <div className="space-y-4">
                    {/* Row 1: Full name + Store name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls} style={{ color: NAVY }}>{t("auth.fullName")}</label>
                        <IconInput
                          icon={User}
                          testId="input-username"
                          placeholder={t("auth.fullNamePlaceholder")}
                          value={username}
                          onChange={setUsername}
                          required
                        />
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: NAVY }}>{t("auth.storeName")}</label>
                        <IconInput
                          icon={Store}
                          testId="input-store-name"
                          placeholder={t("auth.storeNamePlaceholder")}
                          value={storeName}
                          onChange={setStoreName}
                          required
                        />
                      </div>
                    </div>

                    {/* Row 2: Email */}
                    <div>
                      <label className={labelCls} style={{ color: NAVY }}>{t("auth.email")}</label>
                      <IconInput
                        icon={Mail}
                        testId="input-email"
                        type="email"
                        placeholder="email@tajergrow.com"
                        value={email}
                        onChange={setEmail}
                        required
                      />
                    </div>

                    {/* Row 3: Phone */}
                    <div>
                      <label className={labelCls} style={{ color: NAVY }}>{t("auth.phone")}</label>
                      <PhoneInput
                        value={phone}
                        onChange={setPhone}
                        placeholder={t("auth.phonePlaceholder")}
                      />
                      {/* WhatsApp info box */}
                      <div
                        className="mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-medium leading-snug"
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          color: "#166534",
                        }}
                      >
                        <span className="mt-px flex-shrink-0">🟢</span>
                        <span>{t("auth.whatsappNote")}</span>
                      </div>
                    </div>

                    {/* Row 4: Password + Confirm (2 cols) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls} style={{ color: NAVY }}>{t("auth.password")}</label>
                        <PasswordInput
                          testId="input-password"
                          placeholder={t("auth.passwordPlaceholder")}
                          value={password}
                          onChange={setPassword}
                          required
                        />
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: NAVY }}>{t("auth.confirmPassword")}</label>
                        <PasswordInput
                          testId="input-confirm-password"
                          placeholder={t("auth.passwordPlaceholder")}
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          required
                        />
                      </div>
                    </div>

                    {/* Password mismatch error */}
                    {pwMismatch && (
                      <p className="text-xs font-semibold text-red-500 -mt-2" data-testid="pw-mismatch-error">
                        {t("auth.passwordMismatch")}
                      </p>
                    )}

                    {/* Terms checkbox */}
                    <label
                      className="flex items-center gap-2.5 cursor-pointer select-none"
                      data-testid="terms-checkbox-label"
                    >
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          data-testid="terms-checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="sr-only"
                        />
                        <div
                          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                          style={{
                            borderColor: termsAccepted ? TEAL : "#cbd5e1",
                            background: termsAccepted ? TEAL : "#fff",
                          }}
                        >
                          {termsAccepted && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                      <span className="text-sm text-slate-600">
                        {t("auth.termsLabel")}{" "}
                        <span
                          className="font-semibold cursor-pointer hover:underline"
                          style={{ color: TEAL }}
                        >
                          {t("auth.termsLink2")}
                        </span>
                      </span>
                    </label>

                    {/* Submit */}
                    <button
                      data-testid="button-submit"
                      type="submit"
                      disabled={registerDisabled}
                      className="w-full h-12 rounded-xl font-black text-white text-sm tracking-wide transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{
                        background: registerDisabled
                          ? "#94a3b8"
                          : `linear-gradient(135deg, ${TEAL}, #0284c7)`,
                        boxShadow: registerDisabled ? "none" : `0 8px 24px rgba(14,165,233,0.35)`,
                        fontFamily,
                      }}
                    >
                      {signupMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t("auth.registerBtn")}
                    </button>
                  </div>
                )}

                {/* Toggle login ↔ register */}
                <div className="mt-5 text-center">
                  <button
                    data-testid="button-toggle-auth"
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-sm font-semibold transition-colors hover:opacity-80"
                    style={{ color: isLogin ? GOLD : TEAL }}
                  >
                    {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
                  </button>
                </div>

                {/* Terms notice (login only) */}
                {isLogin && (
                  <p className="text-center text-xs mt-4" style={{ color: "#cbd5e1" }}>
                    {t("auth.terms")}{" "}
                    <span style={{ color: GOLD }} className="cursor-pointer hover:underline">
                      {t("auth.termsLink")}
                    </span>{" "}
                    {t("auth.termsEnd")}
                  </p>
                )}
              </form>

              {/* ── Language switcher ── */}
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
                      className="text-xs font-semibold px-1 py-0.5 rounded transition-all"
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

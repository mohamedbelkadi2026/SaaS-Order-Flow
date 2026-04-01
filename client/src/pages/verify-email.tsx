import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { Loader2, MailCheck, RefreshCw, ArrowRight, ShieldCheck, LogOut } from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "#1e1b4b";
const OTP_LENGTH = 6;

export default function VerifyEmailPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const verifyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/verify-email", { code }),
    onSuccess: async (res: any) => {
      if (res.success) {
        toast({ title: "Email vérifié ✅", description: "Bienvenue sur TajerGrow !" });
        // Hard redirect after 1 second so the toast is visible and the session
        // is fully re-fetched from the server (more reliable than cache invalidation).
        setTimeout(() => {
          window.location.replace("/");
        }, 1000);
      } else {
        toast({ title: "Erreur", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Code incorrect", description: e.message || "Veuillez réessayer.", variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      window.location.replace("/");
    },
    onError: () => {
      // Force redirect even on error
      queryClient.clear();
      window.location.replace("/");
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/send-verification", {}),
    onSuccess: () => {
      toast({ title: "Code envoyé ✅", description: "Vérifiez votre boîte email." });
      setCooldown(60);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const v = value.slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    if (v && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every(d => d !== "") && next.join("").length === OTP_LENGTH) {
      setTimeout(() => verifyMutation.mutate(), 50);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...Array(OTP_LENGTH).fill("")];
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === OTP_LENGTH) {
      setTimeout(() => verifyMutation.mutate(), 50);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (e.key === "Enter" && code.length === OTP_LENGTH) verifyMutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d2a7a 60%, #1a1060 100%)` }}>

      {/* Logo — clicking goes back to the landing page */}
      <Link href="/" className="mb-10 text-center block cursor-pointer group" data-testid="link-logo-home">
        <h1 className="text-3xl font-black tracking-tight transition-opacity group-hover:opacity-80" style={{ color: GOLD }}>TajerGrow</h1>
        <p className="text-white/50 text-sm mt-1">La plateforme COD marocaine</p>
      </Link>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${GOLD}, #f0c87a, ${GOLD})` }} />

        <div className="p-8">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #3d3a9a 100%)` }}>
              <MailCheck className="w-8 h-8" style={{ color: GOLD }} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-center mb-1" style={{ color: NAVY }}>
            Vérifiez votre email
          </h2>
          <p className="text-sm text-gray-500 text-center mb-7 leading-relaxed">
            Nous avons envoyé un code à 6 chiffres à votre adresse email. Saisissez-le ci-dessous.
          </p>

          {/* OTP Input */}
          <div className="flex justify-center gap-2.5 mb-7" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                data-testid={`input-otp-${i}`}
                className="w-11 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all focus:scale-105"
                style={{
                  borderColor: d ? GOLD : "#e5e7eb",
                  color: NAVY,
                  background: d ? `rgba(197,160,89,0.07)` : "#f9fafb",
                  boxShadow: d ? `0 0 0 3px rgba(197,160,89,0.15)` : undefined,
                }}
              />
            ))}
          </div>

          {/* Verify button */}
          <button
            onClick={() => verifyMutation.mutate()}
            disabled={code.length < OTP_LENGTH || verifyMutation.isPending}
            data-testid="button-verify-email"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #b8904a 100%)` }}
          >
            {verifyMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Vérification...</>
              : <><ShieldCheck className="w-4 h-4" /> Valider mon compte <ArrowRight className="w-4 h-4 ml-1" /></>
            }
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Resend */}
          <button
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending || cooldown > 0}
            data-testid="button-resend-otp"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50"
            style={{ borderColor: NAVY, color: NAVY }}
          >
            {resendMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...</>
              : cooldown > 0
              ? <><RefreshCw className="w-4 h-4" /> Renvoyer dans {cooldown}s</>
              : <><RefreshCw className="w-4 h-4" /> Renvoyer le code</>
            }
          </button>

          <p className="text-[11px] text-gray-400 text-center mt-5">
            Le code expire dans 10 minutes · Vérifiez vos spams si vous ne le trouvez pas.
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-5 mb-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">mauvais compte ?</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Logout */}
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout-verify"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
          >
            {logoutMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Déconnexion...</>
              : <><LogOut className="w-4 h-4" /> Déconnexion</>
            }
          </button>
        </div>
      </div>

      {/* Dev note */}
      {!import.meta.env.VITE_RESEND_CONFIGURED && (
        <div className="mt-6 max-w-sm w-full px-4 py-3 rounded-2xl text-xs text-center"
          style={{ background: "rgba(197,160,89,0.12)", color: GOLD, border: "1px solid rgba(197,160,89,0.3)" }}>
          <strong>Mode Dev :</strong> Le code OTP est affiché dans les logs du serveur (console).
        </div>
      )}
    </div>
  );
}

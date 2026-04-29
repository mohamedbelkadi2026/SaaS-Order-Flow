import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronDown, Upload, X, Building2, Loader2, Shield, Clock, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const PLANS: Record<string, { name: string; priceDh: number; limit: string; features: string[] }> = {
  starter: {
    name: "Starter",
    priceDh: 200,
    limit: "1 500 commandes/mois",
    features: ["Gestion des commandes", "Tableau de bord analytique", "1 500 commandes/mois", "Support par email", "Gestion produits & stock"],
  },
  pro: {
    name: "Pro",
    priceDh: 400,
    limit: "Commandes illimitées",
    features: ["Tout Starter inclus", "Commandes illimitées", "Support prioritaire 24h/7j", "Intégrations avancées", "Rapports de rentabilité avancés"],
  },
};

const BANK_DETAILS = [
  { label: "Nom de la banque", value: "CIH BANK" },
  { label: "Identité du compte", value: "TajerGrow" },
  { label: "RIB", value: "230 780 4253848211001400 38" },
];

type Method = "bank";
type SuccessType = false | "pending";

/* ── Main Checkout Page ───────────────────────────────────────── */
export default function CheckoutPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const planId = (params.get("plan") ?? "starter") as keyof typeof PLANS;
  const plan = PLANS[planId] ?? PLANS.starter;

  const [openMethod, setOpenMethod] = useState<Method>("bank");
  const currency = "dh" as const;
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [success, setSuccess] = useState<SuccessType>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingPayments = [] } = useQuery<any[]>({ queryKey: ["/api/payments"] });
  const hasPendingPayment = existingPayments.some((p: any) => p.plan === planId && p.status === "pending");

  const submitMutation = useMutation({
    mutationFn: async ({ method, receiptUrl }: { method: Method; receiptUrl?: string }) => {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: planId, currency, method, receiptUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setSuccess("pending");
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/payments/receipt", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Erreur upload");
      return res.json() as Promise<{ url: string }>;
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!["image/jpeg", "image/jpg", "image/png", "application/pdf"].includes(file.type)) {
      toast({ title: "Type non autorisé", description: "PDF, JPG ou PNG uniquement.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop lourd", description: "Maximum 5 Mo.", variant: "destructive" });
      return;
    }
    setReceiptFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setReceiptPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleBankSubmit = async () => {
    if (!receiptFile) {
      toast({ title: "Preuve requise", description: "Veuillez télécharger votre reçu.", variant: "destructive" });
      return;
    }
    try {
      const { url } = await uploadMutation.mutateAsync(receiptFile);
      await submitMutation.mutateAsync({ method: "bank", receiptUrl: url });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !", description: text });
  };

  /* ── Success: Pending (bank waiting) ────────────────────────── */
  if (success === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f4f4f5" }}>
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(197,160,89,0.12)", border: `3px solid ${GOLD}` }}>
            <Clock className="w-10 h-10" style={{ color: GOLD }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Demande envoyée !</h2>
          <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
            Votre demande d'activation du plan <strong className="text-zinc-700">{plan.name}</strong> est en cours de vérification.
            Vous serez notifié dès validation.
          </p>
          <div className="rounded-2xl p-4 mb-6 flex items-center gap-3 text-left" style={{ background: "rgba(30,27,75,0.04)", border: "1px solid rgba(30,27,75,0.08)" }}>
            <Clock className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
            <p className="text-xs text-zinc-500">Délai de traitement : <strong className="text-zinc-700">24 à 48 heures ouvrées</strong></p>
          </div>
          <button
            onClick={() => navigate("/billing")}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
            style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}
            data-testid="button-back-billing"
          >
            Retour à la facturation
          </button>
        </div>
      </div>
    );
  }

  const amountDh = plan.priceDh;

  return (
    <div className="min-h-screen p-4 sm:p-8" style={{ background: "#f4f4f5" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate("/billing")} className="text-sm text-zinc-400 hover:text-zinc-600 flex items-center gap-1.5 mb-4">
            ← Retour
          </button>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Finaliser votre abonnement</h1>
          <p className="text-zinc-500 text-sm mt-1">Plan <strong>{plan.name}</strong> · {plan.limit}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* ── Left: Payment Method ──────────────────── */}
          <div className="space-y-3">

            {/* Plan amount */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-100 flex items-center justify-between" data-testid="row-plan-amount">
              <span className="text-sm text-zinc-500 font-medium">Montant à payer</span>
              <span className="text-lg font-bold" style={{ color: NAVY }}>{amountDh} DH/mois</span>
            </div>

            {hasPendingPayment && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">Vous avez déjà un paiement en attente pour ce plan.</p>
              </div>
            )}

            {/* ─── Virement Bancaire (only payment method) ────── */}
            <AccordionItem
              id="bank"
              isOpen={openMethod === "bank"}
              onToggle={() => setOpenMethod("bank")}
              title="Virement Bancaire"
              badge={`${amountDh} DH`}
              icon={<Building2 className="w-5 h-5 text-emerald-600" />}
            >
              <div className="space-y-5">
                {/* Bank Details */}
                <div className="rounded-xl border border-zinc-200 overflow-hidden">
                  {BANK_DETAILS.map(({ label, value }, i) => (
                    <div key={i} className={cn("flex items-center justify-between px-4 py-3 gap-3", i < BANK_DETAILS.length - 1 && "border-b border-zinc-100")}>
                      <div>
                        <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
                        <p className="text-sm font-semibold text-zinc-800 font-mono">{value}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(value)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
                        title="Copier"
                        data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, '-')}`}
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Montant à virer */}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "rgba(30,27,75,0.04)", border: "1px solid rgba(30,27,75,0.08)" }}>
                  <span className="text-sm text-zinc-600 font-medium">Montant à virer :</span>
                  <span className="text-lg font-bold" style={{ color: NAVY }}>{amountDh} DH</span>
                </div>

                {/* File Upload */}
                <div>
                  <p className="text-sm font-semibold text-zinc-700 mb-2">Preuve de paiement <span className="text-red-500">*</span></p>
                  {!receiptFile ? (
                    <div
                      className={cn("border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors", isDragging ? "border-[#C5A059] bg-amber-50" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300")}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      data-testid="dropzone-receipt"
                    >
                      <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-zinc-500">Cliquez pour télécharger votre reçu</p>
                      <p className="text-xs text-zinc-400 mt-1">(PDF, JPG, PNG · Max 5 Mo)</p>
                    </div>
                  ) : (
                    <div className="border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 bg-white">
                      {receiptPreview ? (
                        <img src={receiptPreview} alt="Aperçu" className="w-14 h-14 object-cover rounded-lg border border-zinc-200 shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-red-500">PDF</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-700 truncate">{receiptFile.name}</p>
                        <p className="text-xs text-zinc-400">{(receiptFile.size / 1024).toFixed(0)} Ko</p>
                      </div>
                      <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors" data-testid="button-remove-receipt">
                        <X className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} data-testid="input-receipt-file" />
                </div>

                <button
                  onClick={handleBankSubmit}
                  disabled={submitMutation.isPending || uploadMutation.isPending || !receiptFile}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}
                  data-testid="button-submit-bank-transfer"
                >
                  {(submitMutation.isPending || uploadMutation.isPending) ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...</>
                  ) : (
                    <><Check className="w-4 h-4" /> Valider le paiement</>
                  )}
                </button>
              </div>
            </AccordionItem>
          </div>

          {/* ── Right: Order Summary ──────────────────── */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden sticky top-6">
              <div className="p-5 border-b border-zinc-100" style={{ background: `linear-gradient(135deg, ${NAVY}, #2d2a7a)` }}>
                <h3 className="text-white font-bold text-sm mb-0.5">Résumé de la commande</h3>
                <p className="text-white/60 text-xs">Plan {plan.name} — Mensuel</p>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Plan</span>
                    <span className="text-sm font-semibold text-zinc-800">{plan.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Limite mensuelle</span>
                    <span className="text-sm font-medium text-zinc-700">{plan.limit}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Durée</span>
                    <span className="text-sm font-medium text-zinc-700">30 jours</span>
                  </div>
                </div>

                <hr className="border-zinc-100" />

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Montant</span>
                  <span className="text-sm font-semibold text-zinc-800">{amountDh} DH</span>
                </div>

                <hr className="border-zinc-100" />

                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Total</span>
                  <div className="text-right">
                    <p className="text-xl font-bold" style={{ color: NAVY }}>{amountDh} DH</p>
                    <p className="text-xs text-zinc-400">par mois</p>
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50 p-3 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <span className="text-xs text-zinc-500">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-5 pb-5">
                <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(30,27,75,0.04)", border: "1px solid rgba(30,27,75,0.08)" }}>
                  <Shield className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
                  <div>
                    <p className="text-xs font-semibold text-zinc-700">Garantie satisfait ou remboursé</p>
                    <p className="text-xs text-zinc-400">14 jours sans engagement</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Accordion Item ───────────────────────────────────────────── */
function AccordionItem({
  id, isOpen, onToggle, title, icon, badge, children,
}: {
  id: string; isOpen: boolean; onToggle: () => void;
  title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white rounded-2xl border transition-all overflow-hidden", isOpen ? "border-[#1e1b4b] shadow-md" : "border-zinc-100 hover:border-zinc-200")} data-testid={`accordion-${id}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left" data-testid={`button-accordion-${id}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">{icon}</div>
          <span className="font-semibold text-zinc-800 text-sm">{title}</span>
          {isOpen && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "#1e1b4b" }}>SÉLECTIONNÉ</span>}
        </div>
        <div className="flex items-center gap-2">
          {badge && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(197,160,89,0.12)", color: "#C5A059" }}>{badge}</span>}
          <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
        </div>
      </button>
      {isOpen && <div className="px-5 pb-5 border-t border-zinc-100 pt-4">{children}</div>}
    </div>
  );
}

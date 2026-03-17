import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronDown, Upload, X, Building2, CreditCard, Loader2, Shield, Clock, ExternalLink, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

const PLANS: Record<string, { name: string; priceDh: number; priceUsd: number; limit: string; features: string[] }> = {
  starter: {
    name: "Starter",
    priceDh: 200,
    priceUsd: 19.99,
    limit: "1 500 commandes/mois",
    features: ["Gestion des commandes", "Tableau de bord analytique", "1 500 commandes/mois", "Support par email", "Gestion produits & stock"],
  },
  pro: {
    name: "Pro",
    priceDh: 400,
    priceUsd: 39.99,
    limit: "Commandes illimitées",
    features: ["Tout Starter inclus", "Commandes illimitées", "Support prioritaire 24h/7j", "Intégrations avancées", "Rapports de rentabilité avancés"],
  },
};

const BANK_DETAILS = [
  { label: "Nom de la banque", value: "CIH BANK" },
  { label: "Identité du compte", value: "TajerGrow" },
  { label: "RIB", value: "230 780 4253848211001400 38" },
];

type Method = "paypal" | "polar" | "bank";

export default function CheckoutPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // wouter's useLocation() strips query strings — read them from window directly
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const planId = (params.get("plan") ?? "starter") as keyof typeof PLANS;
  const plan = PLANS[planId] ?? PLANS.starter;

  const [openMethod, setOpenMethod] = useState<Method>("bank");
  const [currency, setCurrency] = useState<"dh" | "usd">("dh");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingPayments = [] } = useQuery<any[]>({ queryKey: ["/api/payments"] });

  const hasPendingPayment = existingPayments.some(
    (p: any) => p.plan === planId && p.status === "pending"
  );

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
      setSuccess(true);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/payments/receipt", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur upload");
      }
      return res.json() as Promise<{ url: string }>;
    },
  });

  const handleFile = useCallback((file: File) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type)) {
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
      toast({ title: "Preuve requise", description: "Veuillez télécharger votre reçu de virement.", variant: "destructive" });
      return;
    }
    try {
      const { url } = await uploadMutation.mutateAsync(receiptFile);
      await submitMutation.mutateAsync({ method: "bank", receiptUrl: url });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handlePaypalSubmit = () => submitMutation.mutate({ method: "paypal" });
  const handlePolarSubmit = () => submitMutation.mutate({ method: "polar" });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !", description: text });
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f4f4f5" }}>
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(197,160,89,0.12)", border: `3px solid ${GOLD}` }}>
            <Check className="w-10 h-10" style={{ color: GOLD }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>Paiement envoyé !</h2>
          <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
            Votre demande d'activation du plan <strong className="text-zinc-700">{plan.name}</strong> est en cours de vérification.
            Vous recevrez une confirmation dès que l'administrateur aura validé votre paiement.
          </p>
          <div className="rounded-2xl p-4 mb-6 flex items-center gap-3 text-left" style={{ background: "rgba(30,27,75,0.05)", border: `1px solid rgba(30,27,75,0.1)` }}>
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

  const toggle = (m: Method) => setOpenMethod(prev => prev === m ? m : m);

  const amountDh = plan.priceDh;
  const amountUsd = plan.priceUsd;
  const displayAmount = currency === "dh" ? `${amountDh} DH` : `$${amountUsd}`;

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

          {/* ── Left: Payment Methods ─────────────────── */}
          <div className="space-y-3">

            {/* Currency Switcher */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-100 flex items-center gap-3">
              <span className="text-sm text-zinc-500 font-medium">Devise :</span>
              <div className="flex rounded-xl overflow-hidden border border-zinc-200">
                {(["dh", "usd"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={cn(
                      "px-4 py-1.5 text-sm font-semibold transition-colors",
                      currency === c ? "text-white" : "text-zinc-500 bg-white hover:bg-zinc-50"
                    )}
                    style={currency === c ? { background: NAVY } : {}}
                    data-testid={`button-currency-${c}`}
                  >
                    {c === "dh" ? "🇲🇦 DH" : "🇺🇸 USD"}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-lg font-bold" style={{ color: NAVY }}>{displayAmount}/mois</span>
            </div>

            {hasPendingPayment && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  Vous avez déjà un paiement en attente de validation pour ce plan. L'administrateur vous contactera sous 24h.
                </p>
              </div>
            )}

            {/* ─── PayPal ─────────────────────────────── */}
            <AccordionItem
              id="paypal"
              isOpen={openMethod === "paypal"}
              onToggle={() => setOpenMethod("paypal")}
              title="PayPal"
              icon={
                <svg className="h-5" viewBox="0 0 101 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12.237 2.872H6.24a.84.84 0 0 0-.83.71L3 20.116a.504.504 0 0 0 .497.582h2.857a.84.84 0 0 0 .83-.71l.546-3.46a.84.84 0 0 1 .83-.71h1.9c3.955 0 6.237-1.913 6.832-5.705.269-1.659.011-2.961-.77-3.873-.856-.998-2.375-1.368-4.285-1.368zM12.823 8.597c-.327 2.147-1.966 2.147-3.553 2.147h-.903l.633-4.004a.504.504 0 0 1 .497-.426h.414c1.08 0 2.098 0 2.624.615.314.369.41.916.288 1.668zM29.454 8.527h-2.866a.504.504 0 0 0-.497.426l-.128.81-.202-.293c-.626-.909-2.023-1.213-3.417-1.213-3.197 0-5.929 2.422-6.46 5.82-.277 1.695.116 3.315 1.073 4.443.88 1.038 2.136 1.47 3.63 1.47 2.577 0 4.007-1.655 4.007-1.655l-.129.805a.504.504 0 0 0 .497.583h2.581a.84.84 0 0 0 .83-.71l1.548-9.802a.504.504 0 0 0-.497-.684h-.001zm-3.997 5.626c-.279 1.65-1.59 2.758-3.26 2.758-.84 0-1.511-.27-1.942-.781-.43-.508-.59-1.232-.453-2.036.261-1.636 1.589-2.78 3.234-2.78.822 0 1.49.273 1.928.788.44.52.613 1.247.493 2.051zM43.796 8.527h-2.88a.84.84 0 0 0-.695.37l-4.01 5.902-1.7-5.674a.84.84 0 0 0-.804-.598H30.85a.504.504 0 0 0-.478.67l3.202 9.4-3.01 4.25a.504.504 0 0 0 .413.796h2.876a.84.84 0 0 0 .692-.367l9.667-13.953a.504.504 0 0 0-.417-.796z" fill="#003087"/>
                  <path d="M53.354 2.872h-5.997a.84.84 0 0 0-.83.71L44.117 20.116a.504.504 0 0 0 .497.582h3.073a.588.588 0 0 0 .581-.497l.572-3.673a.84.84 0 0 1 .83-.71h1.9c3.955 0 6.237-1.913 6.832-5.705.269-1.659.01-2.961-.77-3.873-.857-.998-2.375-1.368-4.278-1.368zM53.94 8.597c-.327 2.147-1.966 2.147-3.553 2.147h-.903l.633-4.004a.504.504 0 0 1 .497-.426h.414c1.08 0 2.098 0 2.624.615.314.369.41.916.288 1.668zM70.57 8.527h-2.865a.504.504 0 0 0-.497.426l-.128.81-.202-.293c-.626-.909-2.022-1.213-3.417-1.213-3.197 0-5.929 2.422-6.46 5.82-.277 1.695.116 3.315 1.073 4.443.879 1.038 2.135 1.47 3.63 1.47 2.577 0 4.006-1.655 4.006-1.655l-.128.805a.504.504 0 0 0 .497.583H68.6a.84.84 0 0 0 .83-.71l1.548-9.802a.504.504 0 0 0-.497-.684h-.001zm-3.997 5.626c-.278 1.65-1.59 2.758-3.26 2.758-.838 0-1.51-.27-1.941-.781-.43-.508-.59-1.232-.453-2.036.261-1.636 1.589-2.78 3.234-2.78.822 0 1.49.273 1.928.788.44.52.613 1.247.493 2.051zM74.014 3.226l-2.46 15.648a.504.504 0 0 0 .497.583h2.468a.84.84 0 0 0 .83-.71L77.763 1.21a.504.504 0 0 0-.497-.583h-2.76a.504.504 0 0 0-.493.599z" fill="#009cde"/>
                </svg>
              }
            >
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Payez directement via votre compte PayPal. Sécurisé et rapide.
                </p>
                <a
                  href={`https://www.paypal.com/paypalme/tajergrow/${currency === "usd" ? amountUsd : amountDh}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePaypalSubmit}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-90"
                  style={{ background: "#003087" }}
                  data-testid="button-pay-paypal"
                >
                  <ExternalLink className="w-4 h-4" />
                  Payer {displayAmount} avec PayPal
                </a>
                <p className="text-xs text-zinc-400 text-center">
                  Après paiement, votre abonnement sera activé sous 24h.
                </p>
              </div>
            </AccordionItem>

            {/* ─── Polar.sh ────────────────────────────── */}
            <AccordionItem
              id="polar"
              isOpen={openMethod === "polar"}
              onToggle={() => setOpenMethod("polar")}
              title="Polar.sh"
              icon={
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ background: "#000" }}>P</div>
              }
            >
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Paiement sécurisé via Polar.sh — plateforme internationale de paiement pour les développeurs.
                </p>
                <a
                  href={`https://polar.sh/tajergrow/checkout?plan=${planId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePolarSubmit}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-90"
                  style={{ background: "#000" }}
                  data-testid="button-pay-polar"
                >
                  <ExternalLink className="w-4 h-4" />
                  Payer {displayAmount} via Polar
                </a>
                <p className="text-xs text-zinc-400 text-center">
                  Après paiement, votre abonnement sera activé sous 24h.
                </p>
              </div>
            </AccordionItem>

            {/* ─── Virement Bancaire ────────────────────── */}
            <AccordionItem
              id="bank"
              isOpen={openMethod === "bank"}
              onToggle={() => setOpenMethod("bank")}
              title="Virement Bancaire"
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

                {/* File Upload */}
                <div>
                  <p className="text-sm font-semibold text-zinc-700 mb-2">Preuve de paiement <span className="text-red-500">*</span></p>
                  {!receiptFile ? (
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors",
                        isDragging ? "border-[#C5A059] bg-amber-50" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      )}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      data-testid="dropzone-receipt"
                    >
                      <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-zinc-500">Cliquez pour télécharger votre preuve</p>
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
                      <button
                        onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
                        data-testid="button-remove-receipt"
                      >
                        <X className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    data-testid="input-receipt-file"
                  />
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
                {/* Plan Details */}
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

                {/* Amounts */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Montant (DH)</span>
                    <span className="text-sm font-semibold text-zinc-800">{plan.priceDh} DH</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Montant (USD)</span>
                    <span className="text-sm font-semibold text-zinc-800">${plan.priceUsd}</span>
                  </div>
                </div>

                <hr className="border-zinc-100" />

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Total</span>
                  <div className="text-right">
                    <p className="text-xl font-bold" style={{ color: NAVY }}>{displayAmount}</p>
                    <p className="text-xs text-zinc-400">{currency === "dh" ? `≈ $${amountUsd}` : `≈ ${amountDh} DH`}/mois</p>
                  </div>
                </div>

                {/* Features */}
                <div className="rounded-xl bg-zinc-50 p-3 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <span className="text-xs text-zinc-500">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guarantee Badge */}
              <div className="px-5 pb-5">
                <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(30,27,75,0.04)", border: `1px solid rgba(30,27,75,0.08)` }}>
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

/* ── Accordion Item ──────────────────────────────────────── */
function AccordionItem({
  id,
  isOpen,
  onToggle,
  title,
  icon,
  children,
}: {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border transition-all overflow-hidden",
        isOpen ? "border-[#1e1b4b] shadow-md" : "border-zinc-100 hover:border-zinc-200"
      )}
      data-testid={`accordion-${id}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        data-testid={`button-accordion-${id}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="font-semibold text-zinc-800 text-sm">{title}</span>
          {isOpen && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: "#1e1b4b" }}>
              SÉLECTIONNÉ
            </span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-zinc-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, RefreshCw, BarChart3, Percent, Package, Truck, AlertTriangle, Tag, PhoneCall } from "lucide-react";

const GOLD = "#C5A059";

const DEFAULT = {
  costPrice: "",
  commission: "",
  packaging: "",
  shipping: "",
  risk: "",
  leads: "",
  cpl: "",
  confRate: "100",
  delivRate: "100",
  sellPrice: "",
};

function num(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) || v === "" ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

interface InputRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  prefix?: string;
  testId: string;
  placeholder?: string;
}

function NumInput({ label, value, onChange, icon, prefix, testId, placeholder = "0,00" }: InputRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        {label}
        <span className="text-red-500">*</span>
      </Label>
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-muted-foreground">{icon}</span>
        )}
        {prefix && (
          <span className="flex items-center px-3 h-10 bg-blue-50 dark:bg-blue-950/30 border border-r-0 border-border rounded-l-lg text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className={`h-10 text-sm ${icon ? "pl-9" : ""} ${prefix ? "rounded-l-none" : ""}`}
        />
      </div>
    </div>
  );
}

export default function Calculator() {
  const [vals, setVals] = useState(DEFAULT);

  const set = (key: keyof typeof DEFAULT) => (v: string) => setVals(p => ({ ...p, [key]: v }));

  const reset = () => setVals(DEFAULT);

  const r = useMemo(() => {
    const costPrice  = num(vals.costPrice);
    const commission = num(vals.commission);
    const packaging  = num(vals.packaging);
    const shipping   = num(vals.shipping);
    const risk       = num(vals.risk);
    const leads      = num(vals.leads);
    const cpl        = num(vals.cpl);
    const confRate   = num(vals.confRate);
    const delivRate  = num(vals.delivRate);
    const sellPrice  = num(vals.sellPrice);

    const leadsConfirmes   = leads * (confRate / 100);
    const leadsLivres      = leadsConfirmes * (delivRate / 100);
    const coutPubTotal     = leads * cpl;
    const coutParVente     = costPrice + commission + packaging + shipping + risk;
    const pubParVente      = leadsLivres > 0 ? coutPubTotal / leadsLivres : 0;
    const revenuBrut       = leadsLivres * sellPrice;
    const coutVentesTotal  = leadsLivres * coutParVente;
    const beneficeFinal    = revenuBrut - coutVentesTotal - coutPubTotal;
    const cpaBreakEven     = leadsLivres > 0 && leads > 0
      ? (leadsLivres * (sellPrice - coutParVente)) / leads
      : 0;
    const coutConfirmation = leadsConfirmes * commission;
    const coutLivraison    = leadsLivres * shipping;

    return {
      leadsConfirmes,
      leadsLivres,
      coutPubTotal,
      coutParVente,
      pubParVente,
      beneficeFinal,
      cpaBreakEven,
      coutConfirmation,
      coutLivraison,
    };
  }, [vals]);

  const benefitColor = r.beneficeFinal > 0 ? "text-green-600 dark:text-green-400" : r.beneficeFinal < 0 ? "text-red-500" : "text-foreground";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 -m-3 sm:-m-4 lg:-m-6 p-4 sm:p-6">
      {/* Header */}
      <div className="text-center mb-6 relative">
        <div className="absolute right-0 top-0">
          <div className="w-9 h-9 rounded-xl border border-border bg-card flex items-center justify-center text-primary">
            <BarChart3 className="w-4 h-4" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Calculateur de Marge Produit</h1>
        <p className="text-sm text-muted-foreground mt-1">Un outil dynamique pour estimer précisément la rentabilité de votre produit.</p>
        <p className="text-xs text-muted-foreground mt-3 text-left">Champs à saisie manuelle</p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Column 1: Coûts fixes & variables ──────────────────────── */}
        <div className="lg:col-span-1">
          <Card className="p-5 rounded-2xl h-full">
            <h2 className="text-base font-bold mb-4" style={{ color: GOLD }}>Coûts fixes &amp; variables</h2>
            <div className="space-y-3">
              <NumInput
                label="Prix d'achat du produit (MAD)"
                value={vals.costPrice}
                onChange={set("costPrice")}
                icon={<Tag className="w-4 h-4" />}
                testId="input-cost-price"
              />
              <NumInput
                label="Commission Confirmation / Livré (MAD)"
                value={vals.commission}
                onChange={set("commission")}
                icon={<PhoneCall className="w-4 h-4" />}
                testId="input-commission"
              />
              <NumInput
                label="Emballage (MAD)"
                value={vals.packaging}
                onChange={set("packaging")}
                icon={<Package className="w-4 h-4" />}
                testId="input-packaging"
              />
              <NumInput
                label="Frais de livraison (MAD)"
                value={vals.shipping}
                onChange={set("shipping")}
                icon={<Truck className="w-4 h-4" />}
                testId="input-shipping"
              />
              <NumInput
                label="Risque / Divers (MAD)"
                value={vals.risk}
                onChange={set("risk")}
                icon={<AlertTriangle className="w-4 h-4" />}
                testId="input-risk"
              />
            </div>

            {/* Summary at bottom */}
            <div className="mt-5 pt-4 border-t border-border space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Publicités (coût par vente)</span>
                <span className="font-bold" data-testid="text-pub-par-vente">{fmt(r.pubParVente)} MAD</span>
              </div>
              <div className="flex items-center justify-between py-2 rounded-lg px-3" style={{ borderLeft: `3px solid ${GOLD}`, background: "rgba(197,160,89,0.06)" }}>
                <span className="text-sm font-semibold text-foreground">Coût du produit</span>
                <span className="font-extrabold text-lg" style={{ color: GOLD }} data-testid="text-cout-produit">{fmt(r.coutParVente)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Column 2+3: Right side ──────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Performance publicitaire */}
          <Card className="p-5 rounded-2xl">
            <h2 className="text-base font-bold mb-4" style={{ color: GOLD }}>Performance publicitaire</h2>
            <div className="grid grid-cols-2 gap-4">
              <NumInput
                label="Nombre de Leads"
                value={vals.leads}
                onChange={set("leads")}
                icon={<Users className="w-4 h-4" />}
                testId="input-leads"
                placeholder="0"
              />
              <NumInput
                label="Coût par lead (CPL)"
                value={vals.cpl}
                onChange={set("cpl")}
                prefix="MAD"
                testId="input-cpl"
              />
              <NumInput
                label="Taux de confirmation %"
                value={vals.confRate}
                onChange={set("confRate")}
                prefix="%"
                testId="input-conf-rate"
                placeholder="100"
              />
              <NumInput
                label="Taux de livraison %"
                value={vals.delivRate}
                onChange={set("delivRate")}
                prefix="%"
                testId="input-deliv-rate"
                placeholder="100"
              />
            </div>
          </Card>

          {/* Bottom row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Coût par vente + Bénéfice */}
            <Card className="p-5 rounded-2xl">
              <h2 className="text-base font-bold mb-4" style={{ color: GOLD }}>Coût par vente &amp; Résultat</h2>
              <NumInput
                label="Prix de vente (MAD)"
                value={vals.sellPrice}
                onChange={set("sellPrice")}
                prefix="MAD"
                testId="input-sell-price"
              />
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-muted-foreground">Coût par vente</span>
                  <span className="font-bold text-sm" data-testid="text-cout-par-vente">{fmt(r.coutParVente)} MAD</span>
                </div>
                <div className="flex items-center justify-between py-3 px-3 rounded-xl border-2" style={{ borderColor: r.beneficeFinal > 0 ? "#22c55e" : r.beneficeFinal < 0 ? "#ef4444" : "#e5e7eb" }}>
                  <span className="text-sm font-semibold">Bénéfice final</span>
                  <span className={`font-extrabold text-xl ${benefitColor}`} data-testid="text-benefice-final">
                    {fmt(r.beneficeFinal)}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1 h-9 text-sm font-semibold"
                  style={{ backgroundColor: GOLD, color: "white" }}
                  data-testid="button-reset"
                  onClick={reset}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Réinitialiser
                </Button>
              </div>
            </Card>

            {/* Synthèse publicitaire */}
            <Card className="p-5 rounded-2xl">
              <h2 className="text-base font-bold mb-4" style={{ color: GOLD }}>Synthèse publicitaire</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight mb-0.5">Coût Facebook total</p>
                  <p className="font-bold" data-testid="text-cout-pub-total">{fmt(r.coutPubTotal)} <span className="text-[10px] font-normal text-muted-foreground">MAD</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight mb-0.5">Leads confirmés</p>
                  <p className="font-bold" data-testid="text-leads-confirmes">{Math.round(r.leadsConfirmes)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight mb-0.5">Leads livrés</p>
                  <p className="font-bold" data-testid="text-leads-livres">{Math.round(r.leadsLivres)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight mb-0.5">Coût de confirmation</p>
                  <p className="font-bold" data-testid="text-cout-confirmation">{fmt(r.coutConfirmation)} <span className="text-[10px] font-normal text-muted-foreground">MAD</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight mb-0.5">Coût de livraison</p>
                  <p className="font-bold" data-testid="text-cout-livraison">{fmt(r.coutLivraison)} <span className="text-[10px] font-normal text-muted-foreground">MAD</span></p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">CPA break-even: </span>
                  <span className="text-xs font-bold" data-testid="text-cpa-breakeven">{fmt(r.cpaBreakEven)} MAD</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Base simulation: </span>
                  <span className="text-xs font-bold" data-testid="text-base-sim">{Math.round(r.leadsLivres)} livrés</span>
                </div>
              </div>

              {/* Profitability indicator */}
              <div className={`mt-3 p-2.5 rounded-lg text-xs font-semibold text-center ${
                r.beneficeFinal > 0
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                  : r.beneficeFinal < 0
                  ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
              }`} data-testid="text-profitability-indicator">
                {r.beneficeFinal > 0
                  ? `✅ Rentable — Bénéfice net : ${fmt(r.beneficeFinal)} MAD`
                  : r.beneficeFinal < 0
                  ? `❌ Déficitaire — Perte : ${fmt(Math.abs(r.beneficeFinal))} MAD`
                  : "Renseignez les champs pour voir le résultat"}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Brand-aligned Status Color System ───────────────────────────────────────
// Green (#10b981)  = Success / Money   → Livrée
// Sky   (#0ea5e9)  = Progress/Action   → Confirmé
// Amber (#f59e0b)  = Attention/New     → Nouveau
// Slate (#64748b)  = Neutral/Transit   → Expédié, En cours, Retourné
// Rose  (#e11d48)  = Loss/Cancelled    → Annulé*, Refusé
// Indigo(#6366f1)  = Unreachable       → Injoignable, Boite Vocale

export const ORDER_STATUSES = [
  { value: 'nouveau',                label: 'Nouveau',                color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  { value: 'confirme',               label: 'Confirmé',               color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800' },
  { value: 'Injoignable',            label: 'Injoignable',            color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' },
  { value: 'Annulé (fake)',          label: 'Annulé (fake)',          color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
  { value: 'Annulé (faux numéro)',   label: 'Annulé (faux numéro)',   color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
  { value: 'Annulé (double)',        label: 'Annulé (double)',        color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
  { value: 'boite vocale',           label: 'Boite Vocale',           color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' },
  { value: 'in_progress',            label: 'En cours',               color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  { value: 'Attente De Ramassage',   label: 'Attente Ramassage',      color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  { value: 'expédié',                label: 'Expédié',                color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  { value: 'retourné',               label: 'Retourné',               color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  { value: 'delivered',              label: 'Livré',                  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  { value: 'refused',                label: 'Refusé',                 color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
] as const;

export const SUIVI_STATUSES = ['in_progress', 'expédié', 'retourné', 'Attente De Ramassage'];

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s]));

export function StatusBadge({ status, displayText, className }: { status: string, displayText?: string, className?: string }) {
  const config = STATUS_MAP[status] || { label: displayText || status, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700' };

  return (
    <Badge variant="outline" className={cn("font-medium px-2.5 py-0.5 rounded-md whitespace-nowrap", config.color, className)}>
      {config.label}
    </Badge>
  );
}

export function isAnnuleStatus(status: string) {
  return status.startsWith('Annulé');
}

export function isCancelledGroup(status: string) {
  return isAnnuleStatus(status) || status === 'boite vocale' || status === 'Injoignable';
}

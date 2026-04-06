import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Brand-aligned Status Color System ───────────────────────────────────────
// Emerald (#10b981)  = Success / Money        → Livrée
// Sky     (#0ea5e9)  = Action / Confirmed     → Confirmé
// Amber   (#f59e0b)  = Attention / New        → Nouveau
// Blue    (#3b82f6)  = In-Transit / Carrier   → En Voyage, Ramassé, …
// Slate   (#64748b)  = Neutral / Generic      → Expédié, En cours, Retourné
// Orange  (#f97316)  = Waiting                → Attente De Ramassage
// Rose    (#e11d48)  = Loss / Refused / Issue → Annulé*, Refusé, Adresse inconnue, …
// Indigo  (#6366f1)  = Unreachable            → Injoignable, Boite Vocale

// ─── Reusable color tokens ───────────────────────────────────────────────────
const C = {
  amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  sky:     'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800',
  blue:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  slate:   'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  orange:  'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  rose:    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  indigo:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
};

export const ORDER_STATUSES = [
  // ── Core internal statuses ────────────────────────────────────────────────
  { value: 'nouveau',                       label: 'Nouveau',                       color: C.amber   },
  { value: 'confirme',                      label: 'Confirmé',                      color: C.sky     },
  { value: 'Injoignable',                   label: 'Injoignable',                   color: C.indigo  },
  { value: 'Annulé (fake)',                 label: 'Annulé (fake)',                 color: C.rose    },
  { value: 'Annulé (faux numéro)',          label: 'Annulé (faux numéro)',          color: C.rose    },
  { value: 'Annulé (double)',               label: 'Annulé (double)',               color: C.rose    },
  { value: 'boite vocale',                  label: 'Boite Vocale',                  color: C.indigo  },
  { value: 'in_progress',                   label: 'En cours',                      color: C.slate   },
  { value: 'Attente De Ramassage',          label: 'Attente Ramassage',             color: C.orange  },
  { value: 'expédié',                       label: 'Expédié',                       color: C.slate   },
  { value: 'retourné',                      label: 'Retourné',                      color: C.slate   },
  { value: 'delivered',                     label: 'Livré',                         color: C.emerald },
  { value: 'refused',                       label: 'Refusé',                        color: C.rose    },

  // ── In-Transit carrier statuses (Blue) ────────────────────────────────────
  // Exact strings sent by Moroccan carriers (Digylog, Cathedis, EcoTrack, …).
  // When a webhook arrives with one of these strings in commentStatus, the
  // StatusBadge will render it in blue automatically.
  { value: 'En Voyage',                     label: 'En Voyage',                     color: C.blue    },
  { value: 'À préparer',                    label: 'À préparer',                    color: C.blue    },
  { value: 'Ramassé',                       label: 'Ramassé',                       color: C.blue    },
  { value: 'En transit',                    label: 'En transit',                    color: C.blue    },
  { value: 'Reçu',                          label: 'Reçu',                          color: C.blue    },
  { value: 'En cours de distribution',      label: 'En cours de distribution',      color: C.blue    },
  { value: 'Programmé',                     label: 'Programmé',                     color: C.blue    },
  { value: 'En stock',                      label: 'En stock',                      color: C.blue    },
  { value: 'Changer destinataire',          label: 'Changer destinataire',          color: C.blue    },

  // ── Issue / Refused carrier statuses (Rose) ───────────────────────────────
  { value: 'Client intéressé',              label: 'Client intéressé',              color: C.rose    },
  { value: 'Remboursé',                     label: 'Remboursé',                     color: C.rose    },
  { value: 'Adresse inconnue',              label: 'Adresse inconnue',              color: C.rose    },
  { value: 'Retour en route',               label: 'Retour en route',               color: C.rose    },
  { value: 'Incompatibilité avec les attentes', label: 'Incompatibilité attentes',  color: C.rose    },
  { value: 'Article retourné',              label: 'Article retourné',              color: C.rose    },
  { value: "Erreur d'expédition",           label: "Erreur d'expédition",           color: C.rose    },
  { value: 'Pas de réponse + SMS',          label: 'Pas de réponse + SMS',          color: C.indigo  },
  { value: 'Boîte vocale',                  label: 'Boîte vocale',                  color: C.indigo  },
  { value: 'Pas réponse 1 (Suivi)',         label: 'Pas réponse 1',                 color: C.indigo  },
  { value: 'Pas réponse 2 (Suivi)',         label: 'Pas réponse 2',                 color: C.indigo  },
  { value: 'Pas réponse 3 (Suivi)',         label: 'Pas réponse 3',                 color: C.indigo  },
  { value: 'Demande retour',                label: 'Demande retour',                color: C.rose    },
] as const;

// Statuses that keep an order in the Suivi des Colis view
export const SUIVI_STATUSES = [
  'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
  // Moroccan carrier in-transit statuses
  'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
  'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
];

// Statuses that represent a refused/issue outcome
export const REFUSED_GROUP_STATUSES = [
  'refused',
  'Client intéressé', 'Remboursé', 'Adresse inconnue', 'Retour en route',
  'Incompatibilité avec les attentes', 'Article retourné', "Erreur d'expédition",
  'Pas de réponse + SMS', 'Boîte vocale', 'Pas réponse 1 (Suivi)',
  'Pas réponse 2 (Suivi)', 'Pas réponse 3 (Suivi)', 'Demande retour',
];

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s]));

// Colors for carrier statuses not yet in the list — rendered as blue carrier badge
const CARRIER_DYNAMIC_COLOR = 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700';

export function StatusBadge({ status, displayText, className }: { status: string, displayText?: string, className?: string }) {
  const knownConfig = STATUS_MAP[status];
  const label = displayText || status || "—";

  const config = knownConfig
    ? knownConfig
    : { label, color: CARRIER_DYNAMIC_COLOR };

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

export function isRefusedGroup(status: string) {
  return REFUSED_GROUP_STATUSES.includes(status);
}

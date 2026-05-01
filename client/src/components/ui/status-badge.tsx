import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const C = {
  amber:        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  emeraldSolid: 'bg-emerald-600 text-white border-emerald-700',
  indigo:       'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-700',
  rose:         'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700',
  slate:        'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-600',
  orange:       'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  cyan:         'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700',
  blue:         'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  violet:       'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700',
  sky:          'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
  teal:         'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700',
  emerald:      'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  roseDeep:     'bg-rose-200 text-rose-800 border-rose-400 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
};

export const ORDER_STATUSES = [
  // Agent statuses
  { value: 'nouveau',                           label: 'Nouveau',                       color: C.amber        },
  { value: 'confirme',                          label: 'Confirmé',                      color: C.emeraldSolid },
  { value: 'rappel',                            label: 'Rappel',                        color: C.orange       },
  { value: 'Injoignable',                       label: 'Injoignable',                   color: C.indigo       },
  { value: 'Annulé (fake)',                     label: 'Annulé (fake)',                 color: C.rose         },
  { value: 'Annulé (faux numéro)',              label: 'Annulé (faux numéro)',          color: C.rose         },
  { value: 'Annulé (double)',                   label: 'Annulé (double)',               color: C.rose         },
  { value: 'boite vocale',                      label: 'Boite Vocale',                  color: C.indigo       },
  { value: 'in_progress',                       label: 'En cours',                      color: C.slate        },
  { value: 'expédié',                           label: 'Expédié',                       color: C.slate        },
  { value: 'retourné',                          label: 'Retourné',                      color: C.slate        },
  { value: 'delivered',                         label: 'Livré',                         color: C.emerald      },
  { value: 'refused',                           label: 'Refusé',                        color: C.rose         },
  { value: 'Pas de réponse 1',                  label: 'Pas de réponse 1',              color: C.indigo       },
  { value: 'Pas de réponse 2',                  label: 'Pas de réponse 2',              color: C.indigo       },
  { value: 'Pas de réponse 3',                  label: 'Pas de réponse 3',              color: C.indigo       },
  { value: 'Pas de réponse 4',                  label: 'Pas de réponse 4',              color: C.indigo       },
  { value: "Client n'a pas commandé",           label: "Client n'a pas commandé",       color: C.rose         },
  { value: 'Produit non disponible',            label: 'Produit non disponible',        color: C.rose         },

  // Carrier — Pickup stage
  { value: 'Attente De Ramassage',              label: 'Attente Ramassage',             color: C.orange       },
  { value: 'En attente de ramassage',           label: 'En attente ramassage',          color: C.orange       },
  { value: 'Non Reçu',                          label: 'Non Reçu',                      color: C.orange       },

  // Carrier — Collected / Loaded
  { value: 'Ramassé',                           label: 'Ramassé',                       color: C.cyan         },
  { value: 'Collecté',                          label: 'Collecté',                      color: C.cyan         },
  { value: 'Chargé',                            label: 'Chargé',                        color: C.cyan         },
  { value: 'Pris en charge',                    label: 'Pris en charge',                color: C.cyan         },
  { value: 'À préparer',                        label: 'À préparer',                    color: C.cyan         },

  // Carrier — In Transit
  { value: 'En Voyage',                         label: 'En Voyage',                     color: C.blue         },
  { value: 'En transit',                        label: 'En transit',                    color: C.blue         },
  { value: 'Arrivé au hub',                     label: 'Arrivé au hub',                 color: C.blue         },

  // Carrier — At Hub / Processing
  { value: 'En cours de réception au network',  label: 'En cours de réception',         color: C.violet       },
  { value: 'Reçu',                              label: 'Reçu',                          color: C.violet       },
  { value: 'En stock',                          label: 'En stock',                      color: C.violet       },
  { value: 'En cours de distribution',          label: 'En cours de distribution',      color: C.violet       },
  { value: 'Changer destinataire',              label: 'Changer destinataire',          color: C.violet       },

  // Carrier — Out for Delivery
  { value: 'En cours de livraison',             label: 'En cours de livraison',         color: C.sky          },
  { value: 'Sorti pour livraison',              label: 'Sorti pour livraison',          color: C.sky          },
  { value: 'Programmé',                         label: 'Programmé',                     color: C.sky          },
  { value: 'Reporté',                           label: 'Reporté',                       color: C.violet       },

  // Carrier — Driver Confirmed
  { value: 'Confirmé par livreur',              label: 'Confirmé par livreur',          color: C.teal         },
  { value: 'Confirmé par livreur *',            label: 'Confirmé par livreur *',        color: C.teal         },
  { value: 'Rappel en cours',                   label: 'Rappel en cours',               color: C.teal         },
  { value: 'Rappel en cours *',                 label: 'Rappel en cours *',             color: C.teal         },

  // Carrier — Delivered
  { value: 'Livré',                             label: 'Livré',                         color: C.emerald      },
  { value: 'Livré *',                           label: 'Livré *',                       color: C.emerald      },
  { value: 'Livrée',                            label: 'Livrée',                        color: C.emerald      },
  { value: 'Livrée *',                          label: 'Livrée *',                      color: C.emerald      },
  { value: 'Livraison effectuée',               label: 'Livraison effectuée',           color: C.emerald      },
  { value: 'Remis au client',                   label: 'Remis au client',               color: C.emerald      },

  // Carrier — Issue / Return
  { value: 'Tentative échouée',                 label: 'Tentative échouée',             color: C.roseDeep     },
  { value: 'Retour en cours',                   label: 'Retour en cours',               color: C.roseDeep     },
  { value: "Retourné à l'expéditeur",           label: 'Retourné expéditeur',           color: C.roseDeep     },
  { value: 'Retour en route',                   label: 'Retour en route',               color: C.roseDeep     },
  { value: 'Article retourné',                  label: 'Article retourné',              color: C.roseDeep     },
  { value: 'Adresse inconnue',                  label: 'Adresse inconnue',              color: C.roseDeep     },
  { value: "Erreur d'expédition",               label: "Erreur d'expédition",           color: C.roseDeep     },
  { value: 'Demande retour',                    label: 'Demande retour',                color: C.roseDeep     },
  { value: 'Client intéressé',                  label: 'Client intéressé',              color: C.rose         },
  { value: 'Remboursé',                         label: 'Remboursé',                     color: C.rose         },
  { value: 'Incompatibilité avec les attentes', label: 'Incompatibilité attentes',      color: C.rose         },

  // Carrier follow-up statuses
  { value: 'Pas de réponse + SMS',              label: 'Pas de réponse + SMS',          color: C.indigo       },
  { value: 'Boîte vocale',                      label: 'Boîte vocale',                  color: C.indigo       },
  { value: 'Pas réponse 1 (Suivi)',             label: 'Pas réponse 1',                 color: C.indigo       },
  { value: 'Pas réponse 2 (Suivi)',             label: 'Pas réponse 2',                 color: C.indigo       },
  { value: 'Pas réponse 3 (Suivi)',             label: 'Pas réponse 3',                 color: C.indigo       },

  // Special
  { value: 'Non envoyée',                       label: 'Non envoyée',                   color: C.slate        },
] as const;

export const SUIVI_STATUSES = [
  'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
  'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
  'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
  'En cours de réception au network', 'Arrivé au hub', 'En cours de livraison',
  'Sorti pour livraison', 'Pris en charge', 'Collecté', 'Chargé',
  'En attente de ramassage', 'Non Reçu', 'Retour en cours',
  "Retourné à l'expéditeur", 'Tentative échouée',
  'Reporté',
];

export const REFUSED_GROUP_STATUSES = [
  'refused',
  'Client intéressé', 'Remboursé', 'Adresse inconnue', 'Retour en route',
  'Incompatibilité avec les attentes', 'Article retourné', "Erreur d'expédition",
  'Pas de réponse + SMS', 'Boîte vocale', 'Pas réponse 1 (Suivi)',
  'Pas réponse 2 (Suivi)', 'Pas réponse 3 (Suivi)', 'Demande retour',
];

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s]));
const CARRIER_DYNAMIC_COLOR = C.blue;

export function StatusBadge({ status, displayText, className }: { status: string, displayText?: string, className?: string }) {
  const knownConfig = STATUS_MAP[status];
  const label = displayText || status || "—";
  const config = knownConfig ? knownConfig : { label, color: CARRIER_DYNAMIC_COLOR };
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

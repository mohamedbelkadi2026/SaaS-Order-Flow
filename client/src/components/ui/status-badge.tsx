import { cn } from "@/lib/utils";

// ── Color palette (hex values per design spec) ───────────────────────────────
const C = {
  blue:         'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  green:        'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  emerald:      'bg-green-50 text-green-600 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  emeraldDeep:  'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  orange:       'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  orangeDark:   'bg-orange-50 text-amber-700 border-orange-200 dark:bg-orange-900/30 dark:text-amber-400 dark:border-orange-700',
  sky:          'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
  rose:         'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  violet:       'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
  slate:        'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-600',
  amber:        'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  grayLight:    'bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-600',
  teal:         'bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700',
  cyan:         'bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700',
};

export const ORDER_STATUSES = [
  // ── Agent / platform statuses ─────────────────────────────────────────────
  { value: 'nouveau',                           label: 'Nouveau',                       color: C.blue         },
  { value: 'confirme',                          label: 'Confirmé',                      color: C.green        },
  { value: 'rappel',                            label: 'Rappel',                        color: C.orange       },
  { value: 'Injoignable',                       label: 'Injoignable',                   color: C.violet       },
  { value: 'Annulé (fake)',                     label: 'Annulé (fake)',                 color: C.slate        },
  { value: 'Annulé (faux numéro)',              label: 'Annulé (faux numéro)',          color: C.slate        },
  { value: 'Annulé (double)',                   label: 'Annulé (double)',               color: C.slate        },
  { value: 'boite vocale',                      label: 'Boite Vocale',                  color: C.grayLight    },
  { value: 'in_progress',                       label: 'En cours',                      color: C.sky          },
  { value: 'expédié',                           label: 'Expédié',                       color: C.sky          },
  { value: 'transit',                           label: 'En transit',                    color: C.sky          },
  { value: 'retourné',                          label: 'Retourné',                      color: C.orange       },
  { value: 'delivered',                         label: 'Livré',                         color: C.emerald      },
  { value: 'refused',                           label: 'Refusé',                        color: C.rose         },
  { value: 'unreachable',                       label: 'Injoignable',                   color: C.violet       },
  { value: 'injoignable',                       label: 'Injoignable',                   color: C.violet       },
  { value: 'annule',                            label: 'Annulé',                        color: C.slate        },
  { value: 'confirme reporte',                  label: 'Confirmé / Reporté',            color: C.emeraldDeep  },
  { value: 'Pas de réponse 1',                  label: 'Pas de réponse 1',              color: C.grayLight    },
  { value: 'Pas de réponse 2',                  label: 'Pas de réponse 2',              color: C.grayLight    },
  { value: 'Pas de réponse 3',                  label: 'Pas de réponse 3',              color: C.grayLight    },
  { value: 'Pas de réponse 4',                  label: 'Pas de réponse 4',              color: C.grayLight    },
  { value: "Client n'a pas commandé",           label: "Client n'a pas commandé",       color: C.rose         },
  { value: 'Produit non disponible',            label: 'Produit non disponible',        color: C.rose         },
  { value: 'pas de réponse',                    label: 'Pas de réponse',                color: C.grayLight    },

  // ── Carrier — Pickup stage ────────────────────────────────────────────────
  { value: 'Attente De Ramassage',              label: 'Attente Ramassage',             color: C.orange       },
  { value: 'En attente de ramassage',           label: 'En attente ramassage',          color: C.orange       },
  { value: 'Non Reçu',                          label: 'Non Reçu',                      color: C.orange       },

  // ── Carrier — Collected / Loaded ──────────────────────────────────────────
  { value: 'Ramassé',                           label: 'Ramassé',                       color: C.sky          },
  { value: 'Collecté',                          label: 'Collecté',                      color: C.sky          },
  { value: 'Chargé',                            label: 'Chargé',                        color: C.sky          },
  { value: 'Pris en charge',                    label: 'Pris en charge',                color: C.sky          },
  { value: 'À préparer',                        label: 'À préparer',                    color: C.sky          },

  // ── Carrier — In Transit ──────────────────────────────────────────────────
  { value: 'En Voyage',                         label: 'En Voyage',                     color: C.sky          },
  { value: 'En transit',                        label: 'En transit',                    color: C.sky          },
  { value: 'Arrivé au hub',                     label: 'Arrivé au hub',                 color: C.sky          },

  // ── Carrier — At Hub / Processing ────────────────────────────────────────
  { value: 'En cours de réception au network',  label: 'En cours de réception',         color: C.sky          },
  { value: 'Reçu',                              label: 'Reçu',                          color: C.sky          },
  { value: 'En stock',                          label: 'En stock',                      color: C.sky          },
  { value: 'En cours de distribution',          label: 'En cours de distribution',      color: C.sky          },
  { value: 'Changer destinataire',              label: 'Changer destinataire',          color: C.sky          },

  // ── Carrier — Out for Delivery ────────────────────────────────────────────
  { value: 'En cours de livraison',             label: 'En cours de livraison',         color: C.sky          },
  { value: 'Sorti pour livraison',              label: 'Sorti pour livraison',          color: C.sky          },
  { value: 'Programmé',                         label: 'Programmé',                     color: C.violet       },
  { value: 'Reporté',                           label: 'Reporté',                       color: C.violet       },

  // ── Carrier — Driver Confirmed ────────────────────────────────────────────
  { value: 'Confirmé par livreur',              label: 'Confirmé par livreur',          color: C.teal         },
  { value: 'Confirmé par livreur *',            label: 'Confirmé par livreur *',        color: C.teal         },
  { value: 'Rappel en cours',                   label: 'Rappel en cours',               color: C.teal         },
  { value: 'Rappel en cours *',                 label: 'Rappel en cours *',             color: C.teal         },

  // ── Carrier — Delivered ───────────────────────────────────────────────────
  { value: 'Livré',                             label: 'Livré',                         color: C.emerald      },
  { value: 'Livré *',                           label: 'Livré *',                       color: C.emerald      },
  { value: 'Livrée',                            label: 'Livrée',                        color: C.emerald      },
  { value: 'Livrée *',                          label: 'Livrée *',                      color: C.emerald      },
  { value: 'Livraison effectuée',               label: 'Livraison effectuée',           color: C.emerald      },
  { value: 'Remis au client',                   label: 'Remis au client',               color: C.emerald      },

  // ── Carrier — Issue / Return ──────────────────────────────────────────────
  { value: 'Tentative échouée',                 label: 'Tentative échouée',             color: C.rose         },
  { value: 'Retour en cours',                   label: 'Retour en cours',               color: C.orangeDark   },
  { value: "Retourné à l'expéditeur",           label: 'Retourné expéditeur',           color: C.orange       },
  { value: 'Retour en route',                   label: 'Retour en route',               color: C.orange       },
  { value: 'En Cours De Retour',                label: 'Retour en cours',               color: C.orangeDark   },
  { value: 'Retour Recu',                       label: 'Retour reçu',                   color: C.amber        },
  { value: 'Article retourné',                  label: 'Article retourné',              color: C.orange       },
  { value: 'Adresse inconnue',                  label: 'Adresse inconnue',              color: C.rose         },
  { value: "Erreur d'expédition",               label: "Erreur d'expédition",           color: C.rose         },
  { value: 'Demande retour',                    label: 'Demande retour',                color: C.orange       },
  { value: 'Client intéressé',                  label: 'Client intéressé',              color: C.rose         },
  { value: 'Remboursé',                         label: 'Remboursé',                     color: C.rose         },
  { value: 'Incompatibilité avec les attentes', label: 'Incompatibilité attentes',      color: C.rose         },

  // ── Carrier follow-up ─────────────────────────────────────────────────────
  { value: 'Pas de réponse + SMS',              label: 'Pas de réponse + SMS',          color: C.grayLight    },
  { value: 'Boîte vocale',                      label: 'Boîte vocale',                  color: C.grayLight    },
  { value: 'Pas réponse 1 (Suivi)',             label: 'Pas réponse 1',                 color: C.grayLight    },
  { value: 'Pas réponse 2 (Suivi)',             label: 'Pas réponse 2',                 color: C.grayLight    },
  { value: 'Pas réponse 3 (Suivi)',             label: 'Pas réponse 3',                 color: C.grayLight    },

  // ── Special ───────────────────────────────────────────────────────────────
  { value: 'Non envoyée',                       label: 'Non envoyée',                   color: C.slate        },

  // ── Express Coursier (EC) carrier statuses ────────────────────────────────
  { value: 'Livré au client',                   label: 'Livré au client',               color: C.emerald      },
  { value: 'Retour livré au client',            label: 'Retour livré client',           color: C.emerald      },
  { value: 'Refusé',                            label: 'Refusé',                        color: C.rose         },
  { value: 'Annulé',                            label: 'Annulé',                        color: C.slate        },
  { value: 'Perdu',                             label: 'Perdu',                         color: C.rose         },
  { value: 'Produit endommagé',                 label: 'Produit endommagé',             color: C.rose         },
  { value: 'Retourné vers agence casa',         label: 'Retourné vers agence',          color: C.orange       },
  { value: 'Colis prêt pour le retour',         label: 'Prêt pour retour',              color: C.orange       },
  { value: 'Retour reçu par agence',            label: 'Retour reçu agence',            color: C.amber        },
  { value: 'Retour en cours de la livraison',   label: 'Retour en livraison',           color: C.orangeDark   },
  { value: 'Retour débarrasse',                 label: 'Retour débarrasse',             color: C.orange       },
  { value: 'Retour en stock',                   label: 'Retour en stock',               color: C.amber        },
  { value: 'Retour reçu par',                   label: 'Retour reçu par',               color: C.amber        },
  { value: "Retour prét pour l'expedition",     label: 'Prêt pour expédition',          color: C.orange       },
  { value: 'Retour expidié',                    label: 'Retour expédié',                color: C.orange       },
  { value: 'en cours de livraison',             label: 'En cours de livraison',         color: C.sky          },
  { value: 'En Transport',                      label: 'En Transport',                  color: C.sky          },
  { value: 'Recu sur agence',                   label: 'Recu sur agence',               color: C.sky          },
  { value: 'en cours de preparation',           label: 'En cours de préparation',       color: C.sky          },
  { value: 'reportée indéfiniment',             label: 'Reportée indéfiniment',         color: C.violet       },
  { value: 'le client ne répond pas',           label: 'Client ne répond pas',          color: C.grayLight    },
  { value: 'Téléphone Injoignable',             label: 'Tél. Injoignable',              color: C.violet       },
  { value: 'Toujours injoignable',              label: 'Toujours injoignable',          color: C.violet       },
  { value: 'Hors zone',                         label: 'Hors zone',                     color: C.violet       },
  { value: 'Nouveau colis',                     label: 'Nouveau colis',                 color: C.slate        },
  { value: 'Interessé',                         label: 'Intéressé',                     color: C.slate        },
  { value: 'Colis archivé',                     label: 'Colis archivé',                 color: C.slate        },
  { value: 'Nouvelle info',                     label: 'Nouvelle info',                 color: C.slate        },
  { value: 'Non reçu',                          label: 'Non reçu',                      color: C.slate        },

  // ── Ameex / Olivraison carrier statuses ──────────────────────────────────
  { value: 'Expédié',                           label: 'Expédié',                       color: C.sky          },
  { value: "En cours d'expédition",             label: "En cours d'expédition",         color: C.sky          },
  { value: 'Mise en distribution',              label: 'Mise en distribution',          color: C.sky          },
  { value: 'Reçu sur agence',                   label: 'Reçu sur agence',               color: C.sky          },
  { value: 'Confirmé Par Livreur',              label: 'Confirmé par livreur',          color: C.teal         },
  { value: 'Reporté indéfiniment',              label: 'Reporté indéfiniment',          color: C.violet       },
  { value: 'Pas de réponse',                    label: 'Pas de réponse',                color: C.grayLight    },
  { value: 'Pas de réponse - SMS',              label: 'Pas de réponse - SMS',          color: C.grayLight    },
  { value: 'Retour reçu',                       label: 'Retour reçu',                   color: C.amber        },
  { value: "Retour prêt pour l'expédition",     label: "Prêt pour expédition",          color: C.orange       },
  { value: 'Retour expédié',                    label: 'Retour expédié',                color: C.orange       },
  { value: 'Reçu par erreur',                   label: 'Reçu par erreur',               color: C.rose         },
] as const;

export const SUIVI_STATUSES = [
  'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
  'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
  'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
  'En cours de réception au network', 'Arrivé au hub', 'En cours de livraison',
  'Sorti pour livraison', 'Pris en charge', 'Collecté', 'Chargé',
  'En attente de ramassage', 'Non Reçu', 'Retour en cours',
  "Retourné à l'expéditeur", 'Tentative échouée',
  'Reporté', 'transit',
];

export const REFUSED_GROUP_STATUSES = [
  'refused',
  'Client intéressé', 'Remboursé', 'Adresse inconnue', 'Retour en route',
  'Incompatibilité avec les attentes', 'Article retourné', "Erreur d'expédition",
  'Pas de réponse + SMS', 'Boîte vocale', 'Pas réponse 1 (Suivi)',
  'Pas réponse 2 (Suivi)', 'Pas réponse 3 (Suivi)', 'Demande retour',
];

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s]));
const CARRIER_DYNAMIC_COLOR = C.sky;

// ── Ameex normalized fallback ────────────────────────────────────────────────
function normalizeForAmeex(s: string): string {
  return s
    .replace(/\{\{[^}]*\}\}/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const AMEEX_NORM_MAP: Record<string, string> = {
  'livre':                              C.emerald,
  'livre au client':                    C.emerald,
  'retour livre au client':             C.emerald,
  'livraison effectuee':                C.emerald,
  'delivered':                          C.emerald,
  'expedie':                            C.sky,
  "en cours d'expedition":              C.sky,
  'mise en distribution':               C.sky,
  'en cours de livraison':              C.sky,
  'en transport':                       C.sky,
  'recu sur agence':                    C.sky,
  'ramasse':                            C.sky,
  'confirme par livreur':               C.teal,
  'in_progress':                        C.sky,
  'transit':                            C.sky,
  'distribution':                       C.sky,
  'reporte':                            C.violet,
  'reporte indefiniment':               C.violet,
  'postponed':                          C.violet,
  'programme':                          C.violet,
  'pas de reponse':                     C.grayLight,
  'injoignable':                        C.violet,
  'telephone injoignable':              C.violet,
  'toujours injoignable':               C.violet,
  'hors zone':                          C.violet,
  'no_answer_team':                     C.grayLight,
  'unreachable':                        C.violet,
  'retour recu':                        C.amber,
  'demande retour':                     C.orange,
  'colis pret pour le retour':          C.orange,
  'retour en cours':                    C.orangeDark,
  'retour en stock':                    C.amber,
  "retour pret pour l'expedition":      C.orange,
  'retour expedie':                     C.orange,
  'retour debarrasse':                  C.orange,
  'returned':                           C.amber,
  'rts':                                C.amber,
  'refuse':                             C.rose,
  'refused':                            C.rose,
  'annule':                             C.slate,
  'canceled':                           C.slate,
  'perdu':                              C.rose,
  'produit endommage':                  C.rose,
  'recu par erreur':                    C.rose,
  'nouveau colis':                      C.slate,
  'attente de ramassage':               C.orange,
  'en stock':                           C.sky,
  'recu':                               C.sky,
  'interesse':                          C.slate,
  'nouvelle info':                      C.slate,
  'colis archive':                      C.slate,
  'non recu':                           C.slate,
  'changer destinataire':               C.sky,
};

export function getAmeexStatusColor(status: string): string | null {
  const n = normalizeForAmeex(status);
  if (AMEEX_NORM_MAP[n]) return AMEEX_NORM_MAP[n];
  if (n.startsWith('retour')) return C.orange;
  if (n.startsWith('pas de reponse')) return C.grayLight;
  return null;
}

// ── Badge shape ───────────────────────────────────────────────────────────────
const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border whitespace-nowrap';

export function StatusBadge({ status, displayText, className }: { status: string; displayText?: string; className?: string }) {
  const knownConfig = STATUS_MAP[status];
  const label = displayText || (knownConfig ? knownConfig.label : status) || '—';
  const color = knownConfig
    ? knownConfig.color
    : (getAmeexStatusColor(status) ?? CARRIER_DYNAMIC_COLOR);

  return (
    <span className={cn(BADGE_BASE, color, className)}>
      {label}
    </span>
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

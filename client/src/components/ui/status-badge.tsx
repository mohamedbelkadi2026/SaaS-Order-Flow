import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const C = {
  // 🟡 Nouveau / rappel
  amber:        'bg-amber-100 text-amber-800 border border-amber-400 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  // ✅ Confirmé — vert solid marquant
  emeraldSolid: 'bg-emerald-600 text-white border border-emerald-700',
  // 🟠 Orange — attente ramassage / retours
  orange:       'bg-orange-100 text-orange-700 border border-orange-400 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  // 🔵 Bleu foncé — en voyage / transit
  blue:         'bg-blue-100 text-blue-700 border border-blue-400 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  // 🔵 Bleu clair — out for delivery
  sky:          'bg-sky-100 text-sky-700 border border-sky-400 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
  // 🩵 Cyan — ramassé / collecté
  cyan:         'bg-cyan-100 text-cyan-700 border border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700',
  // 🟢 Vert — livré
  emerald:      'bg-emerald-100 text-emerald-700 border border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  // 🔴 Rose — refusé / annulé
  rose:         'bg-rose-100 text-rose-700 border border-rose-400 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700',
  // 🔴 Rose foncé — retour problème
  roseDeep:     'bg-rose-200 text-rose-800 border border-rose-500 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
  // 🟣 Violet — injoignable / hub
  indigo:       'bg-purple-100 text-purple-700 border border-purple-400 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
  // 🔵 Violet — reporté / postponed
  violet:       'bg-violet-100 text-violet-700 border border-violet-400 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700',
  // ⚫ Gris — neutre / en cours
  slate:        'bg-slate-100 text-slate-600 border border-slate-400 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-600',
  // 🩵 Teal — confirmé par livreur
  teal:         'bg-teal-100 text-teal-700 border border-teal-400 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700',
  // 🔵 Transit platform status
  transit:      'bg-blue-600 text-white border border-blue-700',
  // 🟣 Unreachable platform status
  unreachable:  'bg-purple-600 text-white border border-purple-700',
  // 🔴 Refused platform status
  refused:      'bg-red-600 text-white border border-red-700',
  // 🟢 Delivered platform status
  delivered:    'bg-emerald-600 text-white border border-emerald-700',
  // 🟠 Attente ramassage platform status
  waiting:      'bg-orange-500 text-white border border-orange-600',
};

export const ORDER_STATUSES = [
  // ── Agent statuses ───────────────────────────────────────────────────────
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
  { value: 'retourné',                          label: 'Retourné',                      color: C.violet       },
  { value: 'delivered',                         label: 'Livré',                         color: C.delivered    },
  { value: 'refused',                           label: 'Refusé',                        color: C.refused      },
  { value: 'transit',                           label: 'En Transit',                    color: C.transit      },
  { value: 'unreachable',                       label: 'Injoignable',                   color: C.unreachable  },
  { value: 'Pas de réponse 1',                  label: 'Pas de réponse 1',              color: C.indigo       },
  { value: 'Pas de réponse 2',                  label: 'Pas de réponse 2',              color: C.indigo       },
  { value: 'Pas de réponse 3',                  label: 'Pas de réponse 3',              color: C.indigo       },
  { value: 'Pas de réponse 4',                  label: 'Pas de réponse 4',              color: C.indigo       },
  { value: "Client n'a pas commandé",           label: "Client n'a pas commandé",       color: C.rose         },
  { value: 'Produit non disponible',            label: 'Produit non disponible',        color: C.rose         },

  // ── Carrier — Pickup ─────────────────────────────────────────────────────
  { value: 'Attente De Ramassage',              label: 'Attente Ramassage',             color: C.waiting      },
  { value: 'En attente de ramassage',           label: 'En attente ramassage',          color: C.waiting      },
  { value: 'En attente ramassage',              label: 'En attente ramassage',          color: C.waiting      },
  { value: 'Non Reçu',                          label: 'Non Reçu',                      color: C.orange       },

  // ── Carrier — Collected ──────────────────────────────────────────────────
  { value: 'Ramassé',                           label: 'Ramassé',                       color: C.cyan         },
  { value: 'Collecté',                          label: 'Collecté',                      color: C.cyan         },
  { value: 'Chargé',                            label: 'Chargé',                        color: C.cyan         },
  { value: 'Pris en charge',                    label: 'Pris en charge',                color: C.cyan         },
  { value: 'À préparer',                        label: 'À préparer',                    color: C.cyan         },

  // ── Carrier — In Transit ─────────────────────────────────────────────────
  { value: 'En Voyage',                         label: 'En Voyage',                     color: C.blue         },
  { value: 'En transit',                        label: 'En transit',                    color: C.blue         },
  { value: 'Arrivé au hub',                     label: 'Arrivé au hub',                 color: C.blue         },

  // ── Carrier — At Hub ─────────────────────────────────────────────────────
  { value: 'En cours de réception au network',  label: 'En cours de réception',         color: C.violet       },
  { value: 'Reçu',                              label: 'Reçu',                          color: C.violet       },
  { value: 'En stock',                          label: 'En stock',                      color: C.violet       },
  { value: 'En cours de distribution',          label: 'En cours de distribution',      color: C.violet       },
  { value: 'Changer destinataire',              label: 'Changer destinataire',          color: C.violet       },

  // ── Carrier — Out for Delivery ───────────────────────────────────────────
  { value: 'En cours de livraison',             label: 'En cours de livraison',         color: C.sky          },
  { value: 'Sorti pour livraison',              label: 'Sorti pour livraison',          color: C.sky          },
  { value: 'Programmé',                         label: 'Programmé',                     color: C.sky          },
  { value: 'Reporté',                           label: 'Reporté',                       color: C.violet       },

  // ── Carrier — Driver Confirmed ───────────────────────────────────────────
  { value: 'Confirmé par livreur',              label: 'Confirmé par livreur',          color: C.teal         },
  { value: 'Confirmé par livreur *',            label: 'Confirmé par livreur *',        color: C.teal         },
  { value: 'Rappel en cours',                   label: 'Rappel en cours',               color: C.teal         },
  { value: 'Rappel en cours *',                 label: 'Rappel en cours *',             color: C.teal         },

  // ── Carrier — Delivered ──────────────────────────────────────────────────
  { value: 'Livré',                             label: 'Livré',                         color: C.delivered    },
  { value: 'Livré *',                           label: 'Livré *',                       color: C.delivered    },
  { value: 'Livrée',                            label: 'Livrée',                        color: C.delivered    },
  { value: 'Livrée *',                          label: 'Livrée *',                      color: C.delivered    },
  { value: 'Livraison effectuée',               label: 'Livraison effectuée',           color: C.delivered    },
  { value: 'Remis au client',                   label: 'Remis au client',               color: C.delivered    },
  { value: 'Livré au client',                   label: 'Livré au client',               color: C.delivered    },
  { value: 'Retour livré au client',            label: 'Retour livré client',           color: C.delivered    },

  // ── Carrier — Returns ────────────────────────────────────────────────────
  { value: 'Tentative échouée',                 label: 'Tentative échouée',             color: C.roseDeep     },
  { value: 'Retour en cours',                   label: 'Retour en cours',               color: C.roseDeep     },
  { value: "Retourné à l'expéditeur",           label: 'Retourné expéditeur',           color: C.roseDeep     },
  { value: 'Retour en route',                   label: 'Retour en route',               color: C.roseDeep     },
  { value: 'En Cours De Retour',                label: 'Retour en route',               color: C.orange       },
  { value: 'Retour Recu',                       label: 'Retour reçu',                   color: C.orange       },
  { value: 'Article retourné',                  label: 'Article retourné',              color: C.roseDeep     },
  { value: 'Adresse inconnue',                  label: 'Adresse inconnue',              color: C.roseDeep     },
  { value: "Erreur d'expédition",               label: "Erreur d'expédition",           color: C.roseDeep     },
  { value: 'Demande retour',                    label: 'Demande retour',                color: C.roseDeep     },
  { value: 'Client intéressé',                  label: 'Client intéressé',              color: C.rose         },
  { value: 'Remboursé',                         label: 'Remboursé',                     color: C.rose         },
  { value: 'Incompatibilité avec les attentes', label: 'Incompatibilité attentes',      color: C.rose         },

  // ── Carrier follow-up ────────────────────────────────────────────────────
  { value: 'Pas de réponse + SMS',              label: 'Pas de réponse + SMS',          color: C.indigo       },
  { value: 'Boîte vocale',                      label: 'Boîte vocale',                  color: C.indigo       },
  { value: 'Pas réponse 1 (Suivi)',             label: 'Pas réponse 1',                 color: C.indigo       },
  { value: 'Pas réponse 2 (Suivi)',             label: 'Pas réponse 2',                 color: C.indigo       },
  { value: 'Pas réponse 3 (Suivi)',             label: 'Pas réponse 3',                 color: C.indigo       },
  { value: 'Non envoyée',                       label: 'Non envoyée',                   color: C.slate        },

  // ── Express Coursier ─────────────────────────────────────────────────────
  { value: 'Refusé',                            label: 'Refusé',                        color: C.refused      },
  { value: 'Annulé',                            label: 'Annulé',                        color: C.rose         },
  { value: 'Perdu',                             label: 'Perdu',                         color: C.rose         },
  { value: 'Produit endommagé',                 label: 'Produit endommagé',             color: C.rose         },
  { value: 'Retourné vers agence casa',         label: 'Retourné vers agence',          color: C.orange       },
  { value: 'Colis prêt pour le retour',         label: 'Prêt pour retour',              color: C.orange       },
  { value: 'Retour reçu par agence',            label: 'Retour reçu agence',            color: C.orange       },
  { value: 'Retour en cours de la livraison',   label: 'Retour en livraison',           color: C.orange       },
  { value: 'Retour débarrasse',                 label: 'Retour débarrasse',             color: C.orange       },
  { value: 'Retour en stock',                   label: 'Retour en stock',               color: C.orange       },
  { value: 'Retour reçu par',                   label: 'Retour reçu par',               color: C.orange       },
  { value: "Retour prét pour l'expedition",     label: 'Prêt pour expédition',          color: C.orange       },
  { value: 'Retour expidié',                    label: 'Retour expédié',                color: C.orange       },
  { value: 'en cours de livraison',             label: 'En cours de livraison',         color: C.sky          },
  { value: 'En Transport',                      label: 'En Transport',                  color: C.blue         },
  { value: 'Recu sur agence',                   label: 'Recu sur agence',               color: C.blue         },
  { value: 'en cours de preparation',           label: 'En cours de préparation',       color: C.cyan         },
  { value: 'reportée indéfiniment',             label: 'Reportée indéfiniment',         color: C.violet       },
  { value: 'le client ne répond pas',           label: 'Client ne répond pas',          color: C.amber        },
  { value: 'Téléphone Injoignable',             label: 'Tél. Injoignable',              color: C.amber        },
  { value: 'Toujours injoignable',              label: 'Toujours injoignable',          color: C.amber        },
  { value: 'Hors zone',                         label: 'Hors zone',                     color: C.amber        },
  { value: 'Nouveau colis',                     label: 'Nouveau colis',                 color: C.slate        },
  { value: 'Interessé',                         label: 'Intéressé',                     color: C.slate        },
  { value: 'Colis archivé',                     label: 'Colis archivé',                 color: C.slate        },
  { value: 'Nouvelle info',                     label: 'Nouvelle info',                 color: C.slate        },
  { value: 'Non reçu',                          label: 'Non reçu',                      color: C.slate        },

  // ── Ameex ────────────────────────────────────────────────────────────────
  { value: 'Expédié',                           label: 'Expédié',                       color: C.blue         },
  { value: "En cours d'expédition",             label: "En cours d'expédition",         color: C.blue         },
  { value: 'Mise en distribution',              label: 'Mise en distribution',          color: C.blue         },
  { value: 'Reçu sur agence',                   label: 'Reçu sur agence',               color: C.blue         },
  { value: 'Confirmé Par Livreur',              label: 'Confirmé par livreur',          color: C.teal         },
  { value: 'Reporté indéfiniment',              label: 'Reporté indéfiniment',          color: C.violet       },
  { value: 'Pas de réponse',                    label: 'Pas de réponse',                color: C.amber        },
  { value: 'Pas de réponse - SMS',              label: 'Pas de réponse - SMS',          color: C.amber        },
  { value: 'Retour reçu',                       label: 'Retour reçu',                   color: C.orange       },
  { value: "Retour prêt pour l'expédition",     label: "Prêt pour expédition",          color: C.orange       },
  { value: 'Retour expédié',                    label: 'Retour expédié',                color: C.orange       },
  { value: 'Reçu par erreur',                   label: 'Reçu par erreur',               color: C.rose         },

  // ── Vitipsexpress raw statuses (fallback) ────────────────────────────────
  { value: 'Reçu par livreur',                  label: 'Reçu par livreur',              color: C.transit      },
  { value: 'Recu par livreur',                  label: 'Reçu par livreur',              color: C.transit      },
] as const;

export const SUIVI_STATUSES = [
  'in_progress', 'expédié', 'retourné', 'Attente De Ramassage',
  'En Voyage', 'À préparer', 'Ramassé', 'En transit', 'Reçu',
  'En cours de distribution', 'Programmé', 'En stock', 'Changer destinataire',
  'En cours de réception au network', 'Arrivé au hub', 'En cours de livraison',
  'Sorti pour livraison', 'Pris en charge', 'Collecté', 'Chargé',
  'En attente de ramassage', 'Non Reçu', 'Retour en cours',
  "Retourné à l'expéditeur", 'Tentative échouée', 'Reporté', 'transit',
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
  'livre':                              C.delivered,
  'livre au client':                    C.delivered,
  'retour livre au client':             C.delivered,
  'livraison effectuee':                C.delivered,
  'delivered':                          C.delivered,
  'expedie':                            C.blue,
  "en cours d'expedition":              C.blue,
  'mise en distribution':               C.blue,
  'en cours de livraison':              C.sky,
  'en transport':                       C.blue,
  'recu sur agence':                    C.blue,
  'ramasse':                            C.cyan,
  'confirme par livreur':               C.teal,
  'in_progress':                        C.blue,
  'distribution':                       C.blue,
  'transit':                            C.transit,
  'recu par livreur':                   C.transit,
  'reporte':                            C.violet,
  'reporte indefiniment':               C.violet,
  'postponed':                          C.violet,
  'programme':                          C.unreachable,
  'pas de reponse':                     C.amber,
  'injoignable':                        C.unreachable,
  'telephone injoignable':              C.amber,
  'toujours injoignable':               C.amber,
  'hors zone':                          C.amber,
  'no_answer_team':                     C.amber,
  'unreachable':                        C.unreachable,
  'retour recu':                        C.orange,
  'demande retour':                     C.orange,
  'colis pret pour le retour':          C.orange,
  'retour en cours':                    C.orange,
  'retour en stock':                    C.orange,
  "retour pret pour l'expedition":      C.orange,
  'retour expedie':                     C.orange,
  'retour debarrasse':                  C.orange,
  'returned':                           C.orange,
  'rts':                                C.orange,
  'refuse':                             C.refused,
  'refused':                            C.refused,
  'annule':                             C.rose,
  'canceled':                           C.rose,
  'perdu':                              C.rose,
  'produit endommage':                  C.rose,
  'recu par erreur':                    C.rose,
  'nouveau colis':                      C.slate,
  'attente de ramassage':               C.waiting,
  'en stock':                           C.slate,
  'recu':                               C.slate,
  'interesse':                          C.slate,
  'nouvelle info':                      C.slate,
  'colis archive':                      C.slate,
  'non recu':                           C.slate,
  'changer destinataire':               C.slate,
};

export function getAmeexStatusColor(status: string): string | null {
  const n = normalizeForAmeex(status);
  if (AMEEX_NORM_MAP[n]) return AMEEX_NORM_MAP[n];
  if (n.startsWith('retour')) return C.orange;
  if (n.startsWith('pas de reponse')) return C.amber;
  return null;
}

export function StatusBadge({ status, displayText, className }: { status: string, displayText?: string, className?: string }) {
  const knownConfig = STATUS_MAP[status];
  const label = displayText || status || "—";
  let color: string;
  if (knownConfig) {
    color = knownConfig.color;
  } else {
    color = getAmeexStatusColor(status) ?? CARRIER_DYNAMIC_COLOR;
  }
  return (
    <Badge variant="outline" className={cn("font-semibold px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap", color, className)}>
      {knownConfig ? knownConfig.label : label}
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

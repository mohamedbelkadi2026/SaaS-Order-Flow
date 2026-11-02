/** Shared by authenticated webhooks and scheduled reconciliation. */
export function mapExpressRelaisStatus(raw: string): string | null {
  const value = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const codes: Record<string, string> = {
    "new order": "Attente De Ramassage", "order confirmed": "Attente De Ramassage",
    "parcel pickedup": "Ramassé", "parcel picked up": "Ramassé",
    "parcel in agency": "En agence", "parcel in final agency": "En agence finale",
    "parcel in transport": "En transport", "parcel in transit": "En transit",
    "parcel in delivery": "Mis en distribution", "out for delivery": "Mis en distribution",
    "pickup assigned": "Attente De Ramassage",
    "delivered to address": "delivered", "delivred to address": "delivered",
    "parcel refused": "refused", "unreachable recipient": "unreachable",
    "rescheduled delivery by recipient": "in_progress", "scheduled delivery": "in_progress",
    "wrong address": "in_progress", "parcel in return agency": "RETOUR READY",
    "parcel delivered": "delivered", "parcel retrieved": "delivered", "parcel returned": "retourné",
    "parcel to return": "RETOUR READY", "return request confirmed": "RETOUR READY",
    "order canceled": "Annulé", "order cancelled": "Annulé", "order refused": "refused",
    // Depositing a parcel in a locker is not proof of customer receipt.
    "delivered to locker": "En consigne", "waiting in locker": "En consigne",
    "delay in retrieve": "En consigne", "waiting cod": "En consigne", "cod paid": "En consigne",
  };
  if (codes[value]) return codes[value];
  if (/^(retour (recu|receptionne)|returned|retourne)[.! *]*$/.test(value)) return "retourné";
  if (/^(retour (ready|pret|en cours)|return (ready|pending))[.! *]*$/.test(value)) return "RETOUR READY";
  if (/^(livre|livree|livre au client|livraison effectuee|delivered|distribue au client)[.! *]*$/.test(value)) return "delivered";
  if (/^(refuse|refused)[.! *]*$/.test(value)) return "refused";
  if (/^(annule par client|cancelled by customer)$/.test(value)) return "Annulé par client";
  if (/^(annule|cancelled|canceled)$/.test(value)) return "Annulé";
  if (/^(en cours de livraison|mise? en distribution)$/.test(value)) return "Mis en distribution";
  if (/^(ramasse|picked up|pris en charge)$/.test(value)) return "Ramassé";
  if (/^(en transport|en transit|en agence|en agence finale)$/.test(value)) return value === "en transit" ? "En transit" : value === "en transport" ? "En transport" : value === "en agence finale" ? "En agence finale" : "En agence";
  if (/^(attente (de )?ramassage|pending pickup)$/.test(value)) return "Attente De Ramassage";
  return null;
}

type CarrierOrder = { shippingProvider?: string | null; carrierName?: string | null; status?: string | null; commentStatus?: string | null };

/** French labels for Express Relais only; retain exact raw codes on the order. */
export function expressRelaisOrderStatusText(order: CarrierOrder, fallback: string): string {
  const provider = (order.shippingProvider?.trim() || order.carrierName || '').toLowerCase().replace(/[^a-z]/g, '');
  if (provider !== 'expressrelais') return fallback;
  const [raw, ...reason] = (order.commentStatus || order.status || '').split(' | ');
  const state = mapExpressRelaisStatus(raw);
  if (!state) return fallback;
  const code = raw.trim().toUpperCase().replace(/[ -]+/g, '_');
  const details: Record<string, string> = {
    RESCHEDULED_DELIVERY_BY_RECIPIENT: 'Reporté', SCHEDULED_DELIVERY: 'Programmé', WRONG_ADDRESS: 'Adresse incorrecte',
  };
  const labels: Record<string, string> = { delivered: 'Livrée', refused: 'Refusée', unreachable: 'Injoignable', in_progress: 'En cours', 'RETOUR READY': 'Retour en cours' };
  return [details[code] || labels[state] || state, ...reason].join(' | ');
}

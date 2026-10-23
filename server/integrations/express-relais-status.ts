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

const referenceOf = (record: any) => String(record?.idParcelClient ?? record?.id_parcel_client ?? record?.reference ?? "").trim();
function statusOf(record: any): string | null {
  for (const key of ["statusParcel", "statutColis", "deliveryStatus", "parcelStatus", "status", "statut", "etat"]) {
    const field = record?.[key];
    if (typeof field === "string" && field.trim() && !/^(success|ok|error|fail)$/i.test(field.trim())) return field.trim();
    if (field && typeof field === "object") {
      const options = [field.code, field.label, field.libelle, field.name, field.value];
      const known = options.find(value => typeof value === "string" && mapExpressRelaisStatus(value));
      if (known) return known.trim();
      const label = options.find(value => typeof value === "string" && value.trim());
      if (label) return label.trim();
    }
  }
  return null;
}

/** Never use a different parcel's status, even when an API response wraps an array. */
export function readExpressRelaisStatus(response: any, reference: string): { raw: string; status: string | null } | null {
  const code = response?.codeApi ?? response?.data?.codeApi;
  if (response?.success === false || response?.ok === false || (code != null && !["0", "200", "5000"].includes(String(code).trim()))) return null;
  function visit(node: any, depth: number, inArray = false): string | null {
    if (!node || typeof node !== "object" || depth > 5) return null;
    if (Array.isArray(node)) {
      for (const item of node) { const raw = visit(item, depth + 1, true); if (raw) return raw; }
      return null;
    }
    const actual = referenceOf(node);
    if (actual && actual !== reference) return null;
    if (node.success === false || node.ok === false) return null;
    const ownStatus = statusOf(node);
    if (actual && ownStatus) return ownStatus;
    let hasContainer = false;
    for (const key of ["data", "parcel", "colis", "parcels", "results", "result"]) {
      if (node[key] && typeof node[key] === "object") hasContainer = true;
      const raw = visit(node[key], depth + 1, inArray && !actual);
      if (raw) return raw;
    }
    return hasContainer || (inArray && !actual) ? null : ownStatus;
  }
  const raw = visit(response, 0);
  return raw ? { raw, status: mapExpressRelaisStatus(raw) } : null;
}

export function expressRelaisAccountMatches(order: { carrierId?: number | null; magasinId?: number | null }, account: { id: number; magasinId?: number | null }): boolean {
  if (order.carrierId != null) return order.carrierId === account.id;
  return account.magasinId == null || account.magasinId === order.magasinId;
}

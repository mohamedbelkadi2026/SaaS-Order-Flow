import { mapExpressRelaisStatus } from "@shared/express-relais-status";
export { mapExpressRelaisStatus };

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

export function expressRelaisAccountMatches(order: { carrierId?: number | null; magasinId?: number | null }, account: { id: number; magasinId?: number | null }, allowUnscopedLegacy = false): boolean {
  if (order.carrierId != null) return order.carrierId === account.id;
  // Old shipments can lack both IDs. Only the store's sole active, configured
  // account may verify them; never guess between multiple carrier accounts.
  if (order.magasinId == null && allowUnscopedLegacy) return true;
  return account.magasinId == null || account.magasinId === order.magasinId;
}

export function aiSourceMatches(scopeMode: string | null | undefined, source: string | null | undefined): boolean {
  const whatsapp = (source || "").trim().toLowerCase() === "whatsapp";
  if (scopeMode === "whatsapp_only") return whatsapp;
  if (scopeMode === "non_whatsapp") return !whatsapp;
  return scopeMode == null || scopeMode === "all_sources";
}

export function aiProductsMatch(enabledIds: number[] | null | undefined, productIds: (number | null)[]): boolean {
  return !enabledIds?.length || productIds.some(id => id != null && enabledIds.includes(id));
}

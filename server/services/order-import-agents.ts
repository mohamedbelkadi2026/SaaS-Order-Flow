export interface ImportedAgentCandidate {
  id: number;
  username: string;
  role: string;
  isActive?: number | null;
}

export type ImportedAgentResolution =
  | { status: "matched"; agentId: number }
  | { status: "unmatched" }
  | { status: "ambiguous" };

export function normalizeImportedAgentName(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

export function buildImportedAgentNameIndex(
  users: ImportedAgentCandidate[],
): Map<string, number[]> {
  const index = new Map<string, number[]>();

  for (const user of users) {
    const role = String(user.role || "").trim().toLowerCase();
    if (role !== "agent") continue;
    // No isActive check: a historical CSV import should attribute orders to
    // whichever agent actually confirmed them at the time, even if that
    // agent has since been deactivated — deactivating someone later
    // shouldn't erase their past attribution.
    const key = normalizeImportedAgentName(user.username);
    if (!key) continue;

    const ids = index.get(key) || [];
    if (!ids.includes(user.id)) ids.push(user.id);
    index.set(key, ids);
  }

  return index;
}

export function resolveImportedAgentName(
  index: Map<string, number[]>,
  rawName: string,
): ImportedAgentResolution {
  const key = normalizeImportedAgentName(rawName);
  const ids = key ? index.get(key) || [] : [];

  if (ids.length === 1) return { status: "matched", agentId: ids[0] };
  if (ids.length > 1) return { status: "ambiguous" };
  return { status: "unmatched" };
}
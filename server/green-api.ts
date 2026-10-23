/** Keep Green API routing identical for connection checks and outgoing messages. */
export function greenApiUrl(instanceId: string, method: string, apiToken: string): string {
  const id = instanceId.trim();
  if (!/^\d+$/.test(id)) throw new Error("Instance ID Green API invalide.");
  // 71xx instances use the pool host shown in the Green API console.
  // Keep the legacy endpoint for existing non-71xx integrations.
  const host = /^71\d{2}/.test(id) ? `https://${id.slice(0, 4)}.api.greenapi.com` : "https://api.green-api.com";
  return `${host}/waInstance${id}/${method}/${encodeURIComponent(apiToken.trim())}`;
}

export class GreenApiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/** Never expose upstream bodies/URLs: Green API puts the secret in the URL. */
export async function greenApiGet(instanceId: string, apiToken: string, method: "getStateInstance" | "qr") {
  let response: Response;
  try {
    response = await fetch(greenApiUrl(instanceId, method, apiToken), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new GreenApiError("Green API est injoignable. Réessayez dans quelques instants.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GreenApiError("Identifiants Green API refusés. Vérifiez Instance ID et API Token.", 400);
    }
    if (response.status === 429) throw new GreenApiError("Trop de requêtes Green API. Réessayez dans un instant.", 429);
    throw new GreenApiError(`Green API est indisponible (HTTP ${response.status}).`);
  }
  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new GreenApiError("Réponse Green API invalide. Réessayez dans quelques instants.");
  }
}

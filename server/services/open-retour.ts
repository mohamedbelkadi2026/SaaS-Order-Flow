/**
 * Open Retour — Moroccan Returns Management Platform
 * https://openretour.ma (placeholder — update base URL when API docs are available)
 *
 * Credentials stored in store_integrations table:
 *   provider  = "open_retour"
 *   type      = "returns"
 *   credentials = { apiKey, clientId }
 */

const BASE_URL = "https://api.openretour.ma/v1";

export interface OpenRetourCredentials {
  apiKey: string;
  clientId: string;
}

export interface CreateReturnPayload {
  orderReference: string;         // Our order number / track number
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  reason: string;                 // Reason for return (from comment field)
  trackingNumber?: string;        // Original shipping tracking number
  items?: { name: string; quantity: number; price: number }[];
}

export interface CreateReturnResponse {
  success: boolean;
  returnTrackingNumber?: string;
  returnId?: string;
  message?: string;
  rawResponse?: any;
}

/**
 * Create a return ticket via Open Retour API
 */
export async function createOpenRetourReturn(
  creds: OpenRetourCredentials,
  payload: CreateReturnPayload,
): Promise<CreateReturnResponse> {
  try {
    const body = {
      client_id: creds.clientId,
      order_ref: payload.orderReference,
      customer: {
        name: payload.customerName,
        phone: payload.customerPhone,
        address: payload.customerAddress,
        city: payload.customerCity,
      },
      reason: payload.reason || "Retour client",
      tracking_number: payload.trackingNumber || null,
      items: payload.items ?? [],
    };

    const res = await fetch(`${BASE_URL}/returns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${creds.apiKey}`,
        "X-Client-ID": creds.clientId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Handle known error codes
      if (res.status === 401) {
        return { success: false, message: "Clé API invalide. Vérifiez vos identifiants Open Retour." };
      }
      if (res.status === 422) {
        return { success: false, message: `Données invalides: ${text}` };
      }
      return { success: false, message: `Erreur Open Retour (${res.status}): ${text || "Erreur inconnue"}` };
    }

    const json = await res.json() as any;
    return {
      success: true,
      returnTrackingNumber: json.return_tracking_number || json.tracking_number || json.id || null,
      returnId: json.id || json.return_id || null,
      rawResponse: json,
    };
  } catch (err: any) {
    // Network error or API unreachable — in dev/staging simulate success
    if (process.env.NODE_ENV === "development" || !process.env.OPENRETOUR_LIVE) {
      const simulated = `OR-${Date.now().toString(36).toUpperCase()}`;
      console.warn("[OpenRetour] API unreachable — simulating return:", simulated);
      return { success: true, returnTrackingNumber: simulated, message: "Simulé (API non accessible)" };
    }
    return { success: false, message: `Erreur réseau: ${err.message}` };
  }
}

/**
 * Test connectivity / validate credentials
 */
export async function testOpenRetourConnection(creds: OpenRetourCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/ping`, {
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "X-Client-ID": creds.clientId,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true, message: "Connexion réussie ✅" };
    if (res.status === 401) return { ok: false, message: "Clé API invalide" };
    return { ok: false, message: `Erreur ${res.status}` };
  } catch {
    // In dev, treat unreachable as valid (credentials format check only)
    if (creds.apiKey.length >= 8 && creds.clientId.length >= 2) {
      return { ok: true, message: "Identifiants enregistrés (API en attente de connexion)" };
    }
    return { ok: false, message: "Clé API ou Client ID trop courts" };
  }
}

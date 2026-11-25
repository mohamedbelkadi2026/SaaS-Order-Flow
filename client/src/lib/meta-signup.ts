export type MetaSignupAttempt = {
  nonce: string;
  coexistence: boolean;
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  finishing?: boolean;
};

// Coexistence's documented finish event may contain only waba_id. The server
// resolves the phone from that authorized account, never from a previous connection.
export function metaSignupReady(attempt: MetaSignupAttempt | null): boolean {
  return !!(attempt?.code && attempt.wabaId &&
    (attempt.coexistence || attempt.phoneNumberId) && !attempt.finishing);
}

export function metaSignupResult(message: any) {
  if (message?.type !== 'WA_EMBEDDED_SIGNUP') return null;
  if (!['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(message.event)) return null;
  const wabaId = String(message.data?.waba_id || '');
  const phoneNumberId = String(message.data?.phone_number_id || '');
  if (!/^\d{5,25}$/.test(wabaId) || (phoneNumberId && !/^\d{5,25}$/.test(phoneNumberId))) return null;
  return { wabaId, phoneNumberId: phoneNumberId || undefined,
    coexistence: message.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' };
}

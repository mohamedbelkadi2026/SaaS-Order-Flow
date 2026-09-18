/**
 * Meta (Facebook) Ads — daily spend import.
 *
 * Credentials live in store_integrations (type 'ads', provider 'meta'):
 *   credentials.adAccountId  e.g. "act_1234567890" (the act_ prefix is optional)
 *   credentials.accessToken  a System User token carrying ads_read
 *
 * Only spend is imported. The link to revenue is orders.utmCampaign, which
 * already carries Meta campaign ids on incoming orders.
 */
import axios from 'axios';

// Pinned deliberately: Meta deprecates versions on a schedule, and an
// unpinned call silently changes shape. Bump this on purpose, with a test.
export const META_API_VERSION = 'v21.0';
export const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaDailySpend {
  date: string;          // YYYY-MM-DD, in the ad account's own timezone
  campaignId: string;
  campaignName: string;
  /** Minor units (centimes) of `currency`, never converted here. */
  amount: number;
  currency: string;
  impressions: number;
  clicks: number;
}

/** Meta accepts the id with or without the prefix; the API wants it with. */
export function normalizeAdAccountId(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  return v.startsWith('act_') ? v : `act_${v}`;
}

/**
 * Verify a token and account pair, and report what the account actually is.
 * Used by the "Tester la connexion" button so a merchant finds out now rather
 * than discovering an empty spend column a week later.
 */
export async function testMetaConnection(
  adAccountId: string,
  accessToken: string,
): Promise<{ ok: boolean; accountName?: string; currency?: string; timezone?: string; error?: string }> {
  const act = normalizeAdAccountId(adAccountId);
  if (!act || !accessToken) return { ok: false, error: "Identifiant de compte publicitaire et token requis." };

  try {
    const res = await axios.get(`${META_GRAPH}/${act}`, {
      params: { fields: 'name,currency,timezone_name,account_status', access_token: accessToken },
      timeout: 20000,
      validateStatus: () => true,
    });
    console.log(`[META] GET /${act} → HTTP ${res.status}`);

    if (res.status < 200 || res.status >= 300) {
      const err = (res.data as any)?.error;
      console.warn(`[META] test failed: ${JSON.stringify(res.data).slice(0, 400)}`);
      return { ok: false, error: metaErrorMessage(err, res.status) };
    }
    const d = res.data as any;
    return { ok: true, accountName: d?.name, currency: d?.currency, timezone: d?.timezone_name };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Turn Meta's error object into something a merchant can act on. */
function metaErrorMessage(err: any, httpStatus: number): string {
  const code = err?.code;
  const sub = err?.error_subcode;
  const msg = err?.message || `HTTP ${httpStatus}`;

  if (code === 190) return "Token Meta expiré ou révoqué. Générez-en un nouveau dans votre Business Manager.";
  if (code === 200 || code === 10) return "Ce token n'a pas l'autorisation ads_read sur ce compte publicitaire.";
  if (code === 100 && sub === 33) return "Compte publicitaire introuvable. Vérifiez l'identifiant (act_…).";
  if (code === 4 || code === 17 || code === 613) return "Limite de requêtes Meta atteinte. Réessayez dans quelques minutes.";
  return `Meta: ${msg}`;
}

/**
 * Daily spend per campaign between two dates (inclusive), in the ad account's
 * own timezone — which is NOT necessarily the store's.
 *
 * Paginates; Meta returns 25 rows per page by default and a busy account over
 * a week easily exceeds that.
 */
export async function fetchMetaDailySpend(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<{ rows: MetaDailySpend[]; error?: string }> {
  const act = normalizeAdAccountId(adAccountId);
  if (!act || !accessToken) return { rows: [], error: "Identifiants Meta manquants." };

  const rows: MetaDailySpend[] = [];
  let url: string | null = `${META_GRAPH}/${act}/insights`;
  let params: Record<string, any> | undefined = {
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,account_currency',
    time_increment: 1,
    time_range: JSON.stringify({ since, until }),
    limit: 200,
    access_token: accessToken,
  };

  let page = 0;
  while (url && page < 25) {
    try {
      const res: any = await axios.get(url, { params, timeout: 45000, validateStatus: () => true });
      if (res.status < 200 || res.status >= 300) {
        console.warn(`[META] insights HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 400)}`);
        return { rows, error: metaErrorMessage((res.data as any)?.error, res.status) };
      }

      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      for (const r of data) {
        const spend = parseFloat(r?.spend ?? '0');
        if (!r?.date_start || Number.isNaN(spend)) continue;
        rows.push({
          date: String(r.date_start),
          campaignId: String(r.campaign_id ?? ''),
          campaignName: String(r.campaign_name ?? ''),
          // Stored in minor units, in the account's own currency. Converting
          // here would bake today's rate into historical rows.
          amount: Math.round(spend * 100),
          currency: String(r.account_currency ?? ''),
          impressions: Number(r.impressions ?? 0) || 0,
          clicks: Number(r.clicks ?? 0) || 0,
        });
      }

      url = res.data?.paging?.next || null;
      params = undefined; // the `next` url already carries every parameter
      page++;
    } catch (err: any) {
      return { rows, error: err?.message || String(err) };
    }
  }

  console.log(`[META] ${act} ${since}→${until}: ${rows.length} campaign-day row(s) over ${page} page(s)`);
  return { rows };
}

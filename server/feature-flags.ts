/**
 * Per-store feature-flag helpers.
 *
 * hasFeature resolves whether a feature is enabled for a given subscription+user.
 * Override columns (0 / 1) on the subscription take priority over the plan default.
 * Super admins always have every feature on.
 *
 * Features:
 *   'automation'  → automationEnabled  override; plan default = plan === 'pro'
 *   'mediaBuyers' → mediaBuyersEnabled override; plan default = plan === 'pro'
 */

export type FeatureFlag = 'automation' | 'mediaBuyers';

export function hasFeature(
  sub: { plan: string; automationEnabled?: number | null; mediaBuyersEnabled?: number | null } | null | undefined,
  user: { isSuperAdmin?: number | null } | null | undefined,
  feature: FeatureFlag
): boolean {
  if (user?.isSuperAdmin) return true;
  if (!sub) return false;

  if (feature === 'automation') {
    if (sub.automationEnabled === 1) return true;
    if (sub.automationEnabled === 0) return false;
    return sub.plan === 'pro' || sub.plan === 'custom';
  }

  if (feature === 'mediaBuyers') {
    if (sub.mediaBuyersEnabled === 1) return true;
    if (sub.mediaBuyersEnabled === 0) return false;
    return sub.plan === 'pro' || sub.plan === 'custom';
  }

  return false;
}

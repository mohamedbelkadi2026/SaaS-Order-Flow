/**
 * Per-store feature-flag helpers.
 *
 * hasFeature resolves whether a feature is enabled for a subscription+user.
 * Override columns (0 / 1) on the subscription take priority over the plan default.
 * Super admins always have every feature on.
 * Only "starter" plan is restricted; all other plans (trial, pro, custom…) have full access.
 *
 * Override columns: automationEnabled / mediaBuyersEnabled
 *   null = follow plan default, 1 = force ON, 0 = force OFF
 */

import { planDefaults } from './utils/plan';

export type FeatureFlag = 'automation' | 'mediaBuyers';

export function hasFeature(
  sub: { plan: string; automationEnabled?: number | null; mediaBuyersEnabled?: number | null } | null | undefined,
  user: { isSuperAdmin?: number | null } | null | undefined,
  feature: FeatureFlag
): boolean {
  if (user?.isSuperAdmin) return true;
  if (!sub) return false;
  const defaults = planDefaults(sub.plan);

  if (feature === 'automation') {
    if (sub.automationEnabled === 1) return true;
    if (sub.automationEnabled === 0) return false;
    return defaults.automation;
  }

  if (feature === 'mediaBuyers') {
    if (sub.mediaBuyersEnabled === 1) return true;
    if (sub.mediaBuyersEnabled === 0) return false;
    return defaults.mediaBuyers;
  }

  return false;
}

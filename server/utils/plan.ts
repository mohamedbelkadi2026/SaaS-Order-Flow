/**
 * Plan capability defaults.
 * Only "starter" is restricted; trial, pro, elite, custom = full access.
 */
export function planDefaults(plan: string) {
  const restricted = plan === 'starter';
  return {
    maxConfirmationAgents: restricted ? 2 : Infinity,
    maxLinkedCarriers:     restricted ? 1 : Infinity,
    automation:            !restricted,
    mediaBuyers:           !restricted,
  };
}

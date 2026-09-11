import type { EffectiveMembership, SubscriptionMembership } from '@/types/api-responses'

// Mirrors the predicate in backend/modules/membership-helpers/tier-helpers.mts
// (`hasPlusTier`/`isActiveMembership`). Web reads the membership over the API as a
// `SubscriptionMembership`, not the shared `@voucha/types` `Membership` entity the backend
// helper operates on, so the check is re-derived here rather than imported across the
// backend/web boundary. Keep the two predicates in sync if the tier rule changes.
export function hasPlusTier(
  membership: SubscriptionMembership | EffectiveMembership | null,
): boolean {
  if (!membership) return false
  const isActive = membership.status === 'active' || membership.status === 'past_due'
  if (!isActive) return false
  if (membership.expires_at && new Date(membership.expires_at) <= new Date()) return false
  return membership.plan === 'plus' || membership.plan === 'pro'
}

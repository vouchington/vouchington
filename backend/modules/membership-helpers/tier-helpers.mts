import type { Membership } from '@voucha/types/entities/membership'

// Loosened to the fields the tier predicates actually need (rather than the full `Membership`
// entity) so callers holding only a partial projection -- e.g. the before/after lifecycle rows
// returned by `updateMembershipFromWebhook` -- can reuse this single predicate instead of
// re-deriving it (see @services/memberships update.mts's `didLosePaidTier`).
type MembershipTierFields = Pick<Membership, 'plan' | 'status' | 'expires_at'> &
  Partial<Pick<Membership, 'stripe_subscription_id'>>
type ExpiringMembershipTierFields = MembershipTierFields

export function isActiveMembership(m: MembershipTierFields | null): m is MembershipTierFields {
  if (!m) return false
  return m.status === 'active' || m.status === 'past_due'
}

export function hasPlusTier(m: MembershipTierFields | null, now = new Date()): boolean {
  if (!isActiveMembership(m)) return false
  if (!entitlementClockIsOpen(m, now)) return false
  return m.plan === 'plus' || m.plan === 'pro'
}

export function hasUnexpiredPlusTier(
  membership: ExpiringMembershipTierFields | null,
  now = new Date(),
): boolean {
  return hasPlusTier(membership, now)
}

function entitlementClockIsOpen(membership: MembershipTierFields, now = new Date()): boolean {
  return (
    membership.stripe_subscription_id != null ||
    membership.expires_at === null ||
    membership.expires_at.getTime() > now.getTime()
  )
}

export function hasProTier(m: MembershipTierFields | null): boolean {
  if (!isActiveMembership(m)) return false
  return m.plan === 'pro'
}

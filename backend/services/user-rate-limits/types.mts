import type { MembershipPlanSlug } from '@services/memberships/types'

export type RateLimitCategory = 'read' | 'write' | 'sensitive'

export type TrustTierContext = {
  membershipPlan: MembershipPlanSlug | null
  membershipExpiresAt?: Date | null
}

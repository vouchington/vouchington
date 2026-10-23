import type { MembershipStatus } from '@services/memberships/types'

export function mapStripeSubscriptionStatus(stripeStatus: string): MembershipStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'unpaid':
      return 'cancelled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'expired'
    default:
      throw new Error(`Unknown Stripe subscription status: ${stripeStatus}`)
  }
}

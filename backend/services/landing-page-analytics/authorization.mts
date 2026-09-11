import type { PrivateUser } from '@services/users/types'
import { hasPlusTier } from '@modules/membership-helpers'

type PaidMembership = {
  plan: 'plus' | 'pro'
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
  expires_at: Date | null
  stripe_subscription_id?: string | null
}

export function currentUserCanViewLandingPageAnalytics(
  currentUser: PrivateUser | null,
  membership: PaidMembership | null,
): boolean {
  if (!currentUser || !membership) return false
  return hasPlusTier(membership)
}

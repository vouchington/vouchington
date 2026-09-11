import type { User } from '@/types/user'
import { hasPlusTier } from '@/lib/memberships/has-plus-tier'
import type { EffectiveMembership, SubscriptionMembership } from '@/types/api-responses'

export function canCurrentUserViewCrawlHistory(
  currentUser: User | null,
  membership: SubscriptionMembership | EffectiveMembership | null,
): boolean {
  return currentUser?.roles.includes('administrator') === true || hasPlusTier(membership)
}

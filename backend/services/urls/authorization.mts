import type { PrivateUser } from '@services/users/types'
import type { Membership } from '@services/memberships/types'
import { hasPlusTier } from '@modules/membership-helpers'

export function currentUserCanTriggerCrawl(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanViewLatestCrawl(
  currentUser: PrivateUser | null,
  membership: Membership | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return hasPlusTier(membership)
}

export function currentUserCanViewCrawlHistory(
  currentUser: PrivateUser | null,
  membership: Membership | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return hasPlusTier(membership)
}

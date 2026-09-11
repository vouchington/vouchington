import type { PrivateUser } from '@services/users/types'
import type { Membership } from '@services/memberships/types'
import { hasPlusTier } from '@modules/membership-helpers'

export function currentUserCanViewLatestRssFeedCrawl(
  currentUser: PrivateUser | null,
  membership: Membership | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return hasPlusTier(membership)
}

export function currentUserCanUpdateRssFeed(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanModifyRssFeedDiscoverability(
  currentUser: PrivateUser | null,
): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanModifyRssFeedEnablement(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanDeleteRssFeed(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanRefreshRssFeed(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

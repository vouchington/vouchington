import type { PrivateUser } from '@voucha/types/entities/user'

export function currentUserCanViewReferralClickLog(
  currentUser: PrivateUser | null,
  referrerId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === referrerId
}

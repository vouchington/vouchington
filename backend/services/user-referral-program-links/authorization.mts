import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { isOfficialAccount } from '@services/users/authorization'

export function currentUserCanAccessUserReferralLinks(
  currentUser: PrivateUser | null,
  userId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === userId
}

export function currentUserCanCreateUserReferralLink(
  currentUser: PrivateUser | null,
  userId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === userId
}

export function currentUserCanUpdateUserReferralLink(
  currentUser: PrivateUser | null,
  link: { user_id: string },
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === link.user_id
}

export function assertCurrentUserCanCreateUserReferralLink(
  currentUser: PrivateUser,
  userId: string,
): void {
  assert(currentUserCanCreateUserReferralLink(currentUser, userId), 403, 'Forbidden')
  if (isOfficialAccount(currentUser)) {
    throw createCodedError(
      403,
      'Official accounts cannot publish personal referral-link endorsements.',
      OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
    )
  }
}

export function assertCurrentUserCanUpdateUserReferralLink(
  currentUser: PrivateUser,
  link: { user_id: string; parent_link_id: string | null },
): void {
  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')
  if (isOfficialAccount(currentUser)) {
    throw createCodedError(
      403,
      'Official accounts cannot edit personal referral-link endorsements.',
      OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
    )
  }
}

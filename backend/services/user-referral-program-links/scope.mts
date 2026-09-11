import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import type { UserReferralLink } from './types.mts'

export type UserReferralLinkScope = {
  user_id?: string
  referral_program_id?: string
}

export function assertUserReferralLinkScope(
  currentUser: PrivateUser,
  link: UserReferralLink,
  scope?: UserReferralLinkScope,
): void {
  if (!scope) return

  const isAdmin = currentUser.roles.includes('administrator')
  if (scope.user_id !== undefined) {
    validateUUID(scope.user_id)
    if (!isAdmin) {
      assert(link.user_id === scope.user_id, 404, 'Referral link not found')
    }
  }

  if (scope.referral_program_id !== undefined) {
    validateUUID(scope.referral_program_id)
    assert(link.referral_program_id === scope.referral_program_id, 404, 'Referral link not found')
  }
}

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { currentUserCanUpdateUserReferralLink } from './authorization.mts'
import { getUserReferralLink } from './get.mts'
import type { UserReferralLink } from './types.mts'
import { assertUserReferralLinkScope, type UserReferralLinkScope } from './scope.mts'

export async function activateUserReferralLink(
  currentUser: PrivateUser | null,
  linkId: string,
  scope?: UserReferralLinkScope,
): Promise<UserReferralLink | null> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(linkId)

  const link = await getUserReferralLink(linkId)
  assert(link, 404, 'Referral link not found')

  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assertUserReferralLinkScope(currentUser, link, scope)
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')

  const { rows } = await write(
    sql`/* activateUserReferralLink */
      UPDATE user_referral_program_links
      SET activated_at = CURRENT_TIMESTAMP,
          deactivated_at = NULL
      WHERE id = ${linkId}
        AND deleted_at IS NULL
      RETURNING *
    `,
  )

  return rows[0] ?? null
}

export async function deactivateUserReferralLink(
  currentUser: PrivateUser | null,
  linkId: string,
  scope?: UserReferralLinkScope,
): Promise<UserReferralLink | null> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(linkId)

  const link = await getUserReferralLink(linkId)
  assert(link, 404, 'Referral link not found')

  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assertUserReferralLinkScope(currentUser, link, scope)
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')

  const { rows } = await write(
    sql`/* deactivateUserReferralLink */
      UPDATE user_referral_program_links
      SET activated_at = NULL,
          deactivated_at = CURRENT_TIMESTAMP
      WHERE id = ${linkId}
        AND deleted_at IS NULL
      RETURNING *
    `,
  )

  return rows[0] ?? null
}

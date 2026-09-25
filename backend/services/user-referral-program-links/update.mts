import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { validateOptionalString } from '@services/topics/validation'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { isOfficialAccount } from '@services/users/authorization'
import { currentUserCanUpdateUserReferralLink } from './authorization.mts'
import { getUserReferralLink } from './get.mts'
import type { UserReferralLink } from './types.mts'
import { userReferralLinkColumns } from './columns.mts'
import { assertUserReferralLinkScope, type UserReferralLinkScope } from './scope.mts'

export async function updateUserReferralLink(
  currentUser: PrivateUser | null,
  linkId: string,
  data: {
    label?: string | null
  },
  scope?: UserReferralLinkScope,
): Promise<UserReferralLink | null> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(linkId)

  const link = await getUserReferralLink(linkId)
  assert(link, 404, 'Referral link not found')

  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assertUserReferralLinkScope(currentUser, link, scope)
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')
  if (isOfficialAccount(currentUser)) {
    throw createCodedError(
      403,
      'Official accounts cannot edit personal referral-link endorsements.',
      OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
    )
  }

  if (data.label === undefined) {
    return link
  }

  validateOptionalString(data.label, 'label')
  const label = data.label?.trim() || null
  if (label) {
    assert(label.length <= 255, 422, 'label must be 255 characters or less')
  }

  const { rows } = await write(
    sql`/* updateUserReferralLink */
      UPDATE user_referral_program_links
      SET label = ${label}
      WHERE id = ${linkId}
        AND deleted_at IS NULL
      RETURNING `.append(userReferralLinkColumns()),
  )

  return rows[0] ?? null
}

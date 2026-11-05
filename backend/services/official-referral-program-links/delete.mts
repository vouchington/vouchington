import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { currentUserCanManageOfficialReferralLink } from './authorization.mts'
import { clearPrioritizedLinksCache } from '@services/user-referral-program-links/prioritized-links-cache'
import { getOfficialReferralLink } from './get.mts'

export async function deleteOfficialReferralLink(
  currentUser: PrivateUser | null,
  linkId: string,
): Promise<void> {
  assert(currentUser, 401, 'Unauthorized')
  validateUUID(linkId)
  assert(currentUserCanManageOfficialReferralLink(currentUser), 403, 'Forbidden')

  const link = await getOfficialReferralLink(linkId)
  assert(link, 404, 'Official referral link not found')

  await write(sql`/* deleteOfficialReferralLink */
    UPDATE user_referral_program_links
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${currentUser.id}
    WHERE id = ${linkId}
      AND deleted_at IS NULL
  `)
  await clearPrioritizedLinksCache([link.referral_program_id])
}

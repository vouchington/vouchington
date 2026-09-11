import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { currentUserCanUpdateUserReferralLink } from './authorization.mts'
import { getUserReferralLink } from './get.mts'
import { softDeleteChildrenOfParent } from './children.mts'
import { assertUserReferralLinkScope, type UserReferralLinkScope } from './scope.mts'

export async function deleteUserReferralLink(
  currentUser: PrivateUser | null,
  linkId: string,
  scope?: UserReferralLinkScope,
): Promise<void> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(linkId)

  const link = await getUserReferralLink(linkId)
  assert(link, 404, 'Referral link not found')

  assert(currentUserCanUpdateUserReferralLink(currentUser, link), 403, 'Forbidden')
  assertUserReferralLinkScope(currentUser, link, scope)
  assert(!link.parent_link_id, 403, 'Child referral links are managed via their parent')

  // FK `ON DELETE CASCADE` on parent_link_id only fires on a hard-delete; a parent's
  // soft-delete must explicitly cascade to soft-delete its unfurled children too.
  await using query = await beginTransaction()
  {
    await write(
      sql`/* deleteUserReferralLink */
        UPDATE user_referral_program_links
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ${linkId}
          AND deleted_at IS NULL
      `,
      { query },
    )

    await softDeleteChildrenOfParent(linkId, { query })
  }
  await query.commit()
}

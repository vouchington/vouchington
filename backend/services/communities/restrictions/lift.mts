import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { recordModeratorAction } from '@services/moderator-actions'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'

export async function liftCommunityRestriction(
  currentUser: PrivateUser,
  communityId: string,
  restrictionId: string,
): Promise<void> {
  const [community, membership] = await Promise.all([
    getCommunity(communityId),
    getCommunityMember(communityId, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  let restrictionType: string | null = null
  await using query = await beginTransaction()
  const { rows } = await write(
    sql`/* liftCommunityRestriction:find-active */
    SELECT restriction_type
    FROM community_restrictions
    WHERE id = ${restrictionId}
      AND community_id = ${communityId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
    `,
    { query },
  )
  restrictionType = (rows[0] as { restriction_type: string } | undefined)?.restriction_type ?? null
  assert(restrictionType, 404, 'No active restriction found')

  await write(
    sql`/* liftCommunityRestriction */
    UPDATE community_restrictions
    SET lifted_at = CURRENT_TIMESTAMP,
        lifted_by_id = ${currentUser.id}
    WHERE id = ${restrictionId}
      AND lifted_at IS NULL
    `,
    { query },
  )

  await query.commit()

  await recordModeratorAction(currentUser.id, {
    actionType: 'lift_restriction',
    communityId,
    metadata: {
      restriction_id: restrictionId,
      restriction_type: restrictionType,
    },
  })
}

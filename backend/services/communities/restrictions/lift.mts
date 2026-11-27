import { lockCommunityRestrictionWrites } from './lock.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import type { PrivateUser } from '@services/users/types'
import { recordModeratorAction } from '@services/moderator-actions'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import type { LoadedCommunity } from '../load-with-viewer.mts'

export async function liftCommunityRestriction(
  currentUser: PrivateUser,
  { community, membership }: Pick<LoadedCommunity, 'community' | 'membership'>,
  restrictionId: string,
): Promise<void> {
  const communityId = community.id
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  await lockCommunityRestrictionWrites(query, communityId, currentUser.id)
  const { rows } = await write(
    sql`/* liftCommunityRestriction */
    UPDATE community_restrictions
    SET lifted_at = statement_timestamp(),
        lifted_by_id = ${currentUser.id}
    WHERE id = ${restrictionId}
      AND community_id = ${communityId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > statement_timestamp())
      AND EXISTS (SELECT 1 FROM users WHERE id = ${currentUser.id} AND deleted_at IS NULL)
    RETURNING restriction_type
    `,
    { query },
  )
  const restrictionType = (rows[0] as { restriction_type: string } | undefined)?.restriction_type
  if (!restrictionType) {
    const { rows: activeActor } = await query(sql`/* liftCommunityRestriction:activeActor */
      SELECT id FROM users WHERE id = ${currentUser.id} AND deleted_at IS NULL
    `)
    assert(activeActor.length > 0, 401, 'User not found')
    throw createHttpError(404, 'No active restriction found')
  }

  await recordModeratorAction(
    currentUser.id,
    {
      actionType: 'lift_restriction',
      communityId,
      communityRestrictionIds: [restrictionId],
      metadata: { restriction_type: restrictionType },
    },
    { query },
  )
  await query.commit()
}

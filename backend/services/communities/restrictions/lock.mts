import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { lockActiveUserLifecycleForMutation } from '@services/users/active-user-lifecycle-lock'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users'
import { lockCommunityUser } from '../bans/lock.mts'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import { runSequentially } from '@modules/utils/run-sequentially'

/** Serialize active restriction-set changes with delegated community contribution decisions. */
export async function lockCommunityRestrictionWrites(
  query: TransactionQuery,
  communityId: string,
  actorId: string,
): Promise<{ archived_at: Date | null }> {
  await runSequentially([
    () => lockActiveUserLifecycleForMutation(query, actorId),
    () => lockCommunityUser(communityId, actorId, { query }),
    () =>
      query(sql`/* lockCommunityRestrictionWrites.membership */
    SELECT id FROM community_members
    WHERE community_id = ${communityId} AND user_id = ${actorId} AND removed_at IS NULL
    FOR NO KEY UPDATE`),
  ])
  const { rows } = await query<{
    archived_at: Date | null
  }>(sql`/* lockCommunityRestrictionWrites */
    SELECT archived_at FROM communities
    WHERE id = ${communityId} AND deleted_at IS NULL
    FOR NO KEY UPDATE`)
  assert(rows[0], 404, 'Community not found')
  const actor = await getPrivateUserByAny(actorId, { query })
  assert(actor, 401, 'User not found')
  assertNotSuspended(actor)
  const community = await getCommunity(communityId, { query })
  assert(community, 404, 'Community not found')
  const membership = await getCommunityMember(communityId, actorId, { query })
  assert(currentUserCanModerateCommunity(actor, community, membership), 403, 'Forbidden')
  return rows[0]
}

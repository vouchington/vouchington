import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { LoadedCommunity } from '../load-with-viewer.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'

export async function leaveCommunity(
  currentUserId: string,
  { community, membership }: Pick<LoadedCommunity, 'community' | 'membership'>,
): Promise<void> {
  const communityId = community.id
  assert(!community.archived_at, 403, 'Community is archived')
  assert(membership, 404, 'You are not a member of this community')
  assert(
    membership.role !== 'owner',
    422,
    'Owners cannot leave a community. Transfer ownership first or delete the community.',
  )

  await write(
    sql`/* leaveCommunity */
    UPDATE community_members
    SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUserId}
    WHERE community_id = ${communityId}
      AND user_id = ${currentUserId}
      AND removed_at IS NULL
    `,
  )
  await Promise.all([
    invalidate.communities(communityId),
    invalidateCommunityMemberUserMetrics(currentUserId),
  ])
}

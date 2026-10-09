import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunityWithViewer } from '../load-with-viewer.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'

export async function leaveCommunity(currentUserId: string, communityId: string): Promise<void> {
  const loaded = await getCommunityWithViewer(communityId, currentUserId)
  assert(loaded, 404, 'Community not found')
  const { community, membership } = loaded
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

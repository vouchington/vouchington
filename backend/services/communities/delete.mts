import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getCommunity } from './get.mts'
import { currentUserCanDeleteCommunity } from './authorization.mts'
import type { CommunityMember } from './types.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateAllCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordPostPublicationChange } from '@services/post-publication'
import { prepublishImageSurfaceDenial } from '@services/media-delivery-safety'
import { runSequentially } from '@modules/utils/run-sequentially'

export async function deleteCommunity(
  currentUser: PrivateUser,
  communityId: string,
  membership?: CommunityMember | null,
): Promise<void> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  await runSequentially([
    () =>
      prepublishImageSurfaceDenial({ surfaceKind: 'community-profile-image', communityId }, query),
    () =>
      prepublishImageSurfaceDenial({ surfaceKind: 'community-banner-image', communityId }, query),
  ])
  const { rowCount } = await query(
    `/* deleteCommunity */
    UPDATE communities
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = $1
    WHERE id = $2
      AND deleted_at IS NULL`,
    [currentUser.id, communityId],
  )
  if ((rowCount ?? 0) > 0) {
    await recordPostPublicationChange(query, {
      scope: { type: 'community', communityId },
      reason: 'community_visibility_changed',
      impactedCommunityIds: [communityId],
      footprint: { priorCommunityId: communityId },
    })
  }

  await query.commit()
  await Promise.all([
    invalidate.communities(community),
    invalidateAllCommunityMemberUserMetrics(communityId),
  ])
  void enqueueRefreshTopHashtags()
}

import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { getCommunity } from './get.mts'
import { currentUserCanDeleteCommunity } from './authorization.mts'
import type { CommunityMember } from './types.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueCommunityMemberMetricInvalidationBestEffort } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordPostPublicationChange } from '@services/post-publication'
import { prepublishImageSurfaceDenials } from '@services/media-delivery-safety'

export async function deleteCommunity(
  currentUser: PrivateUser,
  communityId: string,
  membership?: CommunityMember | null,
): Promise<void> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  await prepublishImageSurfaceDenials(
    [
      { surfaceKind: 'community-profile-image', communityId },
      { surfaceKind: 'community-banner-image', communityId },
    ],
    query,
  )
  const { rows } = await query<{ id: string }>(
    `/* deleteCommunity */
    UPDATE communities
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = $1
    WHERE id = $2
      AND deleted_at IS NULL
    RETURNING id`,
    [currentUser.id, communityId],
  )
  const changed = rows.length > 0
  if (changed) {
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
    changed ? enqueueCommunityMemberMetricInvalidationBestEffort(communityId) : Promise.resolve(),
  ])
  void enqueueRefreshTopHashtags()
}

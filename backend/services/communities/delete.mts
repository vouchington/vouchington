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
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'

export async function deleteCommunity(
  currentUser: PrivateUser,
  communityId: string,
  membership?: CommunityMember | null,
): Promise<void> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  const { rows } = await writeImageSurfaceMutation(
    query,
    [
      { surfaceKind: 'community-profile-image', communityId, nextImageId: null },
      { surfaceKind: 'community-banner-image', communityId, nextImageId: null },
    ],
    null,
    (before, scopeQuery) =>
      scopeQuery<{ id: string }>(
        `/* deleteCommunity */
    UPDATE communities
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = $1
    WHERE id = $2
      AND deleted_at IS NULL
      AND profile_image_id IS NOT DISTINCT FROM $3::uuid
      AND banner_image_id IS NOT DISTINCT FROM $4::uuid
    RETURNING id`,
        [currentUser.id, communityId, before[0]!.current_image_id, before[1]!.current_image_id],
      ),
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

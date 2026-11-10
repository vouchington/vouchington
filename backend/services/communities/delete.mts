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
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import sql from 'sql-template-strings'

export async function deleteCommunity(
  currentUser: PrivateUser,
  communityId: string,
  membership?: CommunityMember | null,
): Promise<void> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  const rows = await writeImageSurfaceMutation(
    query,
    [
      { surfaceKind: 'community-profile-image', communityId, nextImageId: null },
      { surfaceKind: 'community-banner-image', communityId, nextImageId: null },
    ],
    null,
    async (references, scopeQuery) => {
      const statement = imageSurfaceMutationPreimage(references, 'deleteCommunity')
      statement.append(sql`, updated AS (
        UPDATE communities SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ${currentUser.id}
        FROM (SELECT DISTINCT community_id FROM surface_preimage) owner_preimage
        WHERE communities.id = ${communityId} AND owner_preimage.community_id = communities.id
          AND communities.deleted_at IS NULL
          AND communities.profile_image_id IS NOT DISTINCT FROM
            (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-profile-image')
          AND communities.banner_image_id IS NOT DISTINCT FROM
            (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-banner-image')
        RETURNING WITH (OLD AS prior, NEW AS current)
          prior.id,
          prior.profile_image_id AS previous_profile_image_id,
          prior.banner_image_id AS previous_banner_image_id,
          CASE WHEN current.deleted_at IS NULL THEN current.profile_image_id END AS current_profile_image_id,
          CASE WHEN current.deleted_at IS NULL THEN current.banner_image_id END AS current_banner_image_id,
          (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_id,
          (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_revision,
          (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_activation_revision,
          (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_id,
          (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_revision,
          (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_activation_revision
      ), outcome AS (
        SELECT TRUE AS changed, updated.*
        FROM updated
        UNION ALL
        SELECT FALSE AS changed, NULL::uuid AS id,
          before.current_image_id AS previous_profile_image_id,
          (SELECT current_image_id FROM surface_preimage
            WHERE surface_kind = 'community-banner-image') AS previous_banner_image_id,
          before.current_image_id AS current_profile_image_id,
          (SELECT current_image_id FROM surface_preimage
            WHERE surface_kind = 'community-banner-image') AS current_banner_image_id,
          before.placement_id AS previous_profile_placement_id,
          before.placement_revision AS previous_profile_placement_revision,
          before.activation_revision AS previous_profile_activation_revision,
          (SELECT placement_id FROM surface_preimage
            WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_id,
          (SELECT placement_revision FROM surface_preimage
            WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_revision,
          (SELECT activation_revision FROM surface_preimage
            WHERE surface_kind = 'community-banner-image') AS previous_banner_activation_revision
        FROM surface_preimage before
        WHERE before.ordinality = 1 AND NOT EXISTS (SELECT 1 FROM updated)
      ) SELECT * FROM outcome`)
      const { rows: changedRows } = await scopeQuery<{
        id: string | null
        changed: boolean
        previous_profile_image_id: string | null
        previous_banner_image_id: string | null
        current_profile_image_id: string | null
        current_banner_image_id: string | null
        previous_profile_placement_id: string | null
        previous_profile_placement_revision: number | null
        previous_profile_activation_revision: number | null
        previous_banner_placement_id: string | null
        previous_banner_placement_revision: number | null
        previous_banner_activation_revision: number | null
      }>(statement)
      const row = changedRows[0]
      return {
        result: row?.changed && row.id ? [{ id: row.id }] : [],
        changes: row
          ? references.map((reference, index) =>
              imageSurfaceMutationChange(
                reference.surfaceKind === 'community-profile-image'
                  ? {
                      ordinality: index + 1,
                      previousImageId: row.previous_profile_image_id,
                      currentImageId: row.current_profile_image_id,
                      previousPlacementId: row.previous_profile_placement_id,
                      previousPlacementRevision: row.previous_profile_placement_revision,
                      previousActivationRevision: row.previous_profile_activation_revision,
                      refreshOwnerCurrent: !row.changed,
                    }
                  : {
                      ordinality: index + 1,
                      previousImageId: row.previous_banner_image_id,
                      currentImageId: row.current_banner_image_id,
                      previousPlacementId: row.previous_banner_placement_id,
                      previousPlacementRevision: row.previous_banner_placement_revision,
                      previousActivationRevision: row.previous_banner_activation_revision,
                      refreshOwnerCurrent: !row.changed,
                    },
              ),
            )
          : references.map((_, index) => ({
              ordinality: index + 1,
              previousImageId: null,
              currentImageId: null,
              previousPlacementId: null,
              previousPlacementRevision: null,
              previousActivationRevision: null,
            })),
      }
    },
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

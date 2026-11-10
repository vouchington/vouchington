import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
  type ImageSurfaceMutationBinding,
} from '../services/media-delivery-safety/surface-mutation-bindings.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { ImageSurfaceReference } from '../services/media-delivery-safety/surface-lock.mts'
import { writeImageSurfaceMutation } from '../services/media-delivery-safety/surface-mutation.mts'
import sql from 'sql-template-strings'

/** Fixture writes the actual owner through the production owner/capacity/edge transaction. */
export async function writeTestImageSurfaceMutation(
  reference: ImageSurfaceReference,
  imageId: string | null,
  actorUserId: string | null,
  query: TransactionQuery,
) {
  type ImageSurfaceTuple = {
    placement_id: string
    placement_revision: number
    image_id: string
  } | null
  return writeImageSurfaceMutation<ImageSurfaceTuple>(
    query,
    [{ ...reference, nextImageId: imageId }],
    actorUserId,
    async (references, scopeQuery) => {
      const annotation =
        'userId' in reference
          ? 'writeTestUserImageSurface'
          : 'topicId' in reference
            ? reference.surfaceKind === 'topic-logo-image'
              ? 'writeTestTopicLogoSurface'
              : 'writeTestTopicHeroSurface'
            : 'communityId' in reference
              ? reference.surfaceKind === 'community-profile-image'
                ? 'writeTestCommunityProfileSurface'
                : 'writeTestCommunityBannerSurface'
              : 'writeTestProfileLinkSurface'
      const statement = imageSurfaceMutationPreimage(references, annotation)
      if ('userId' in reference)
        statement.append(sql`, updated AS (UPDATE users SET profile_image_id = ${imageId}
          FROM surface_preimage before WHERE users.id = ${reference.userId} AND before.ordinality = 1
            AND users.profile_image_id IS NOT DISTINCT FROM before.current_image_id
          RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
            prior.profile_image_id AS previous_image_id, current.profile_image_id AS current_image_id,
            before.placement_id AS previous_placement_id,
            before.placement_revision AS previous_placement_revision,
            before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
      else if ('topicId' in reference)
        if (reference.surfaceKind === 'topic-logo-image') {
          statement.append(sql`, updated AS (UPDATE topics SET logo_image_id = ${imageId}
            FROM surface_preimage before WHERE topics.id = ${reference.topicId} AND before.ordinality = 1
              AND topics.logo_image_id IS NOT DISTINCT FROM before.current_image_id
            RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
              prior.logo_image_id AS previous_image_id, current.logo_image_id AS current_image_id,
              before.placement_id AS previous_placement_id,
              before.placement_revision AS previous_placement_revision,
              before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
        } else {
          statement.append(sql`, updated AS (UPDATE topics SET hero_image_id = ${imageId}
            FROM surface_preimage before WHERE topics.id = ${reference.topicId} AND before.ordinality = 1
              AND topics.hero_image_id IS NOT DISTINCT FROM before.current_image_id
            RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
              prior.hero_image_id AS previous_image_id, current.hero_image_id AS current_image_id,
              before.placement_id AS previous_placement_id,
              before.placement_revision AS previous_placement_revision,
              before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
        }
      else if ('communityId' in reference)
        if (reference.surfaceKind === 'community-profile-image') {
          statement.append(sql`, updated AS (UPDATE communities SET profile_image_id = ${imageId}
            FROM surface_preimage before WHERE communities.id = ${reference.communityId} AND before.ordinality = 1
              AND communities.profile_image_id IS NOT DISTINCT FROM before.current_image_id
            RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
              prior.profile_image_id AS previous_image_id, current.profile_image_id AS current_image_id,
              before.placement_id AS previous_placement_id,
              before.placement_revision AS previous_placement_revision,
              before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
        } else {
          statement.append(sql`, updated AS (UPDATE communities SET banner_image_id = ${imageId}
            FROM surface_preimage before WHERE communities.id = ${reference.communityId} AND before.ordinality = 1
              AND communities.banner_image_id IS NOT DISTINCT FROM before.current_image_id
            RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
              prior.banner_image_id AS previous_image_id, current.banner_image_id AS current_image_id,
              before.placement_id AS previous_placement_id,
              before.placement_revision AS previous_placement_revision,
              before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
        }
      else {
        statement.append(sql`, updated AS (UPDATE user_profile_links SET image_id = ${imageId}
          FROM surface_preimage before WHERE user_profile_links.id = ${reference.userProfileLinkId}
            AND before.ordinality = 1 AND user_profile_links.image_id IS NOT DISTINCT FROM before.current_image_id
          RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
            prior.image_id AS previous_image_id, current.image_id AS current_image_id,
            before.placement_id AS previous_placement_id,
            before.placement_revision AS previous_placement_revision,
            before.activation_revision AS previous_activation_revision) SELECT * FROM updated`)
      }
      const { rows } = await scopeQuery<{
        ordinality: number
        previous_image_id: string | null
        current_image_id: string | null
        previous_placement_id: string | null
        previous_placement_revision: number | null
        previous_activation_revision: number | null
      }>(statement)
      if (rows.length !== 1) throw new Error('Image surface fixture owner changed')
      const row = rows[0]!
      const change = imageSurfaceMutationChange({
        ordinality: row.ordinality,
        previousImageId: row.previous_image_id,
        currentImageId: row.current_image_id,
        previousPlacementId: row.previous_placement_id,
        previousPlacementRevision: row.previous_placement_revision,
        previousActivationRevision: row.previous_activation_revision,
      })
      return {
        result: null,
        changes: [change],
        resultFromBindings: (bindings: readonly ImageSurfaceMutationBinding[]) => {
          const binding = bindings[0]
          return binding?.placement_id && binding.image_id && binding.placement_revision !== null
            ? {
                placement_id: binding.placement_id,
                placement_revision: binding.placement_revision,
                image_id: binding.image_id,
              }
            : null
        },
      }
    },
  )
}

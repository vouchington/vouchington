import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ImageSurfaceMutation,
  ImageSurfaceMutationWrite,
} from '../services/media-delivery-safety/surface-mutation.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '../services/media-delivery-safety/surface-mutation-bindings.mts'

export { writeTestImageOwnerRetirement } from './image-owner-retirement-write.mts'

export async function retireTestUserImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestUserImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  const statement = imageSurfaceMutationPreimage(references, annotation)
  statement.append(sql`, retired AS (UPDATE users SET `).append(setClause)
  statement.append(sql` FROM surface_preimage before
    WHERE users.id = before.user_id
      AND users.profile_image_id IS NOT DISTINCT FROM before.current_image_id
    RETURNING WITH (OLD AS prior, NEW AS current) before.ordinality::int AS ordinality,
      prior.profile_image_id AS previous_image_id,
      CASE WHEN current.deleted_at IS NULL THEN current.profile_image_id END AS current_image_id,
      before.placement_id AS previous_placement_id,
      before.placement_revision AS previous_placement_revision,
      before.activation_revision AS previous_activation_revision
  ) SELECT * FROM retired`)
  const { rows } = await query<{
    ordinality: number
    previous_image_id: string | null
    current_image_id: string | null
    previous_placement_id: string | null
    previous_placement_revision: number | null
    previous_activation_revision: number | null
  }>(statement)
  if (rows.length !== references.length) throw new Error('Test user image owner changed')
  return {
    result: undefined,
    changes: rows.map(row =>
      imageSurfaceMutationChange({
        ordinality: row.ordinality,
        previousImageId: row.previous_image_id,
        currentImageId: row.current_image_id,
        previousPlacementId: row.previous_placement_id,
        previousPlacementRevision: row.previous_placement_revision,
        previousActivationRevision: row.previous_activation_revision,
      }),
    ),
  }
}

export { retireTestTopicImageOwners } from './image-topic-owner-retirement.mts'

export async function retireTestCommunityImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestCommunityImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  const statement = imageSurfaceMutationPreimage(references, annotation)
  statement.append(sql`, retired AS (UPDATE communities SET `).append(setClause)
  statement.append(sql` FROM (SELECT DISTINCT community_id FROM surface_preimage) owner_preimage
    WHERE communities.id = owner_preimage.community_id
      AND communities.profile_image_id IS NOT DISTINCT FROM (
        SELECT current_image_id FROM surface_preimage preimage
        WHERE preimage.community_id = communities.id AND preimage.surface_kind = 'community-profile-image'
      )
      AND communities.banner_image_id IS NOT DISTINCT FROM (
        SELECT current_image_id FROM surface_preimage preimage
        WHERE preimage.community_id = communities.id AND preimage.surface_kind = 'community-banner-image'
      )
    RETURNING WITH (OLD AS prior, NEW AS current)
      prior.id AS community_id, prior.profile_image_id AS previous_profile_image_id,
      prior.banner_image_id AS previous_banner_image_id,
      CASE WHEN current.deleted_at IS NULL THEN current.profile_image_id END AS current_profile_image_id,
      CASE WHEN current.deleted_at IS NULL THEN current.banner_image_id END AS current_banner_image_id,
      (SELECT placement_id FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-profile-image') AS previous_profile_placement_id,
      (SELECT placement_revision FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-profile-image') AS previous_profile_placement_revision,
      (SELECT activation_revision FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-profile-image') AS previous_profile_activation_revision,
      (SELECT placement_id FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-banner-image') AS previous_banner_placement_id,
      (SELECT placement_revision FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-banner-image') AS previous_banner_placement_revision,
      (SELECT activation_revision FROM surface_preimage preimage WHERE preimage.community_id = prior.id
        AND preimage.surface_kind = 'community-banner-image') AS previous_banner_activation_revision
  ) SELECT * FROM retired`)
  const { rows } = await query<{
    community_id: string
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
  const byCommunityId = new Map(rows.map(row => [row.community_id, row]))
  if (
    byCommunityId.size !==
    new Set(references.map(reference => ('communityId' in reference ? reference.communityId : '')))
      .size
  )
    throw new Error('Test community image owner changed')
  return {
    result: undefined,
    changes: references.map((reference, index) => {
      const row = byCommunityId.get('communityId' in reference ? reference.communityId : '')!
      return imageSurfaceMutationChange(
        reference.surfaceKind === 'community-profile-image'
          ? {
              ordinality: index + 1,
              previousImageId: row.previous_profile_image_id,
              currentImageId: row.current_profile_image_id,
              previousPlacementId: row.previous_profile_placement_id,
              previousPlacementRevision: row.previous_profile_placement_revision,
              previousActivationRevision: row.previous_profile_activation_revision,
            }
          : {
              ordinality: index + 1,
              previousImageId: row.previous_banner_image_id,
              currentImageId: row.current_banner_image_id,
              previousPlacementId: row.previous_banner_placement_id,
              previousPlacementRevision: row.previous_banner_placement_revision,
              previousActivationRevision: row.previous_banner_activation_revision,
            },
      )
    }),
  }
}

import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ImageSurfaceMutation } from './surface-mutation-bindings.mts'

type DisplacedSurfacePlacement = {
  placement_id: string
  revision: number
  image_id: string
}

/**
 * The surface trigger reactivates a placement that already exists and raises when it does not.
 * Retire a different current use, then insert the missing placement, before the owner write.
 */
export async function prepareImageSurfacePlacements(
  query: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
): Promise<DisplacedSurfacePlacement[]> {
  const activating = references.filter(reference => reference.nextImageId)
  if (activating.length === 0) return []
  const surfaceKinds = activating.map(reference => reference.surfaceKind)
  const imageIds = activating.map(reference => reference.nextImageId)
  const userIds = activating.map(reference => ('userId' in reference ? reference.userId : null))
  const topicIds = activating.map(reference => ('topicId' in reference ? reference.topicId : null))
  const communityIds = activating.map(reference =>
    'communityId' in reference ? reference.communityId : null,
  )
  const linkIds = activating.map(reference =>
    'userProfileLinkId' in reference ? reference.userProfileLinkId : null,
  )
  const { rows: displaced } = await query<DisplacedSurfacePlacement>(
    sql`/* retireDisplacedImageSurfacePlacements */
    UPDATE media_placements placement
    SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
        retirement_reason = 'owner_removed', revision = placement.revision + 1
    FROM image_surface_placements surface
    JOIN unnest(
      ${surfaceKinds}::image_surface_placement_surface_kinds[],
      ${imageIds}::uuid[], ${userIds}::uuid[], ${topicIds}::uuid[],
      ${communityIds}::uuid[], ${linkIds}::uuid[]
    ) AS requested(surface_kind, image_id, user_id, topic_id, community_id, user_profile_link_id)
      ON surface.surface_kind = requested.surface_kind
     AND surface.user_id IS NOT DISTINCT FROM requested.user_id
     AND surface.topic_id IS NOT DISTINCT FROM requested.topic_id
     AND surface.community_id IS NOT DISTINCT FROM requested.community_id
     AND surface.user_profile_link_id IS NOT DISTINCT FROM requested.user_profile_link_id
     AND surface.image_id IS DISTINCT FROM requested.image_id
    WHERE placement.id = surface.placement_id AND placement.retired_at IS NULL
    RETURNING WITH (OLD AS prior) placement.id AS placement_id, prior.revision, surface.image_id`,
  )
  await query(sql`/* insertMissingImageSurfacePlacements */
    WITH requested AS (
      SELECT * FROM unnest(
        ${surfaceKinds}::image_surface_placement_surface_kinds[],
        ${imageIds}::uuid[], ${userIds}::uuid[], ${topicIds}::uuid[],
        ${communityIds}::uuid[], ${linkIds}::uuid[]
      ) AS input(surface_kind, image_id, user_id, topic_id, community_id, user_profile_link_id)
    ), missing AS (
      SELECT requested.*, uuidv7() AS placement_id
      FROM requested
      WHERE NOT EXISTS (
        SELECT 1 FROM image_surface_placements surface
        WHERE surface.surface_kind = requested.surface_kind
          AND surface.image_id = requested.image_id
          AND surface.user_id IS NOT DISTINCT FROM requested.user_id
          AND surface.topic_id IS NOT DISTINCT FROM requested.topic_id
          AND surface.community_id IS NOT DISTINCT FROM requested.community_id
          AND surface.user_profile_link_id IS NOT DISTINCT FROM requested.user_profile_link_id
      )
    ), retained AS (
      INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
      SELECT placement_id, image_id, 'surface' FROM missing ORDER BY placement_id
      RETURNING placement_id
    ), parents AS (
      INSERT INTO media_placements (id) SELECT placement_id FROM retained ORDER BY placement_id RETURNING id
    )
    INSERT INTO image_surface_placements (
      placement_id, surface_kind, image_id, user_id, topic_id, community_id, user_profile_link_id
    )
    SELECT parents.id, missing.surface_kind, missing.image_id, missing.user_id, missing.topic_id,
      missing.community_id, missing.user_profile_link_id
    FROM parents JOIN missing ON missing.placement_id = parents.id
    ORDER BY parents.id`)
  return displaced
}

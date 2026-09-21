import { read, write } from '@data-stores/psql'
import { stageImagePlacementDeliveryRecord } from '../../services/media-delivery-safety/delivery-registry-staging.mts'
import { completeTestMediaDeliveryRecord } from './image-surface-placements.mts'
import sql from 'sql-template-strings'

export async function removeTestPostImage(postId: string, imageId: string): Promise<void> {
  await write(sql`
    WITH removed AS (
      DELETE FROM post_images
      WHERE post_id = ${postId} AND image_id = ${imageId}
      RETURNING post_id, image_id
    )
    UPDATE media_placements placement
    SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
        retirement_reason = 'owner_removed',
        revision = placement.revision + 1
    FROM image_placements image_placement
    JOIN removed ON removed.post_id = image_placement.post_id AND removed.image_id = image_placement.image_id
    WHERE placement.id = image_placement.placement_id
      AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
  `)
}

export async function getTestPostImagePlacement(
  postId: string,
  imageId: string,
): Promise<{
  placement_id: string
  placement_revision: number
  retired_at: Date | null
  retirement_reason: 'asset_deleted' | 'owner_removed' | null
} | null> {
  const { rows } = await read<{
    placement_id: string
    placement_revision: number
    retired_at: Date | null
    retirement_reason: 'asset_deleted' | 'owner_removed' | null
  }>(sql`
    SELECT placement.id AS placement_id, placement.revision AS placement_revision, placement.retired_at,
      placement.retirement_reason
    FROM image_placements image_placement
    JOIN media_placements placement ON placement.id = image_placement.placement_id
    WHERE image_placement.post_id = ${postId} AND image_placement.image_id = ${imageId}
  `)
  return rows[0] ?? null
}

/** Makes one current post-image placement visible through the fail-closed delivery registry. */
export async function allowTestPostImageDelivery(input: {
  postId: string
  imageId: string
}): Promise<void> {
  const placement = await getTestPostImagePlacement(input.postId, input.imageId)
  if (!placement || placement.retired_at !== null) {
    throw new Error(`Expected an active post-image placement for ${input.postId}/${input.imageId}`)
  }
  const { deliveryKey } = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: input.imageId,
    state: 'allow',
  })
  await completeTestMediaDeliveryRecord(deliveryKey)
}

import { beginTransaction, read } from '@data-stores/psql'
import { stageImagePlacementDeliveryRecord } from '../../services/media-delivery-safety/delivery-registry-staging.mts'
import { completeTestMediaDeliveryRecord } from './image-surface-placements.mts'
import sql from 'sql-template-strings'
import { syncPostImagePlacements } from '../../services/posts/image-placements.mts'

export async function removeTestPostImage(postId: string, imageId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* removeTestPostImage */ DELETE FROM post_images
    WHERE post_id = ${postId} AND image_id = ${imageId}`)
  const { rows } = await query<{ image_id: string }>(sql`/* removeTestPostImage:remaining */
    SELECT image_id FROM post_images WHERE post_id = ${postId} ORDER BY image_id`)
  await syncPostImagePlacements(
    postId,
    rows.map(row => row.image_id),
    query,
  )
  await query.commit()
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
  }>(
    sql`/* getTestPostImagePlacement */
    SELECT placement.id AS placement_id, placement.revision AS placement_revision, placement.retired_at,
      placement.retirement_reason
    FROM image_placements image_placement
    JOIN media_placements placement ON placement.id = image_placement.placement_id
    WHERE image_placement.post_id = ${postId} AND image_placement.image_id = ${imageId}
  `,
  )
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
  const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: input.imageId,
    state: 'allow',
  })
  await completeTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
}

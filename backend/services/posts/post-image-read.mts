import { read } from '@data-stores/psql'
import { isMediaDeliveryEdgeEnforcementEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import type { PostImagePlacement } from './image-placements.mts'

export async function getPostImages(postId: string): Promise<PostImagePlacement[]> {
  const { rows } = await read(sql`/* getPostImages */
    SELECT pi.image_id, pi.order_index, pi.caption,
      placement.id AS placement_id, placement.revision AS placement_revision
    FROM post_images pi
    JOIN image_placements image_placement
      ON image_placement.post_id = pi.post_id AND image_placement.image_id = pi.image_id
    JOIN media_placements placement
      ON placement.id = image_placement.placement_id
      AND placement.retired_at IS NULL
      AND placement.copyright_withheld_at IS NULL
    JOIN images ON images.id = pi.image_id
      AND images.deleted_at IS NULL
      AND images.upload_completed_at IS NOT NULL
      AND images.quarantine_pending_at IS NULL
      AND images.openai_omni_moderation_flagged = FALSE
      AND images.openai_omni_moderation_results IS NOT NULL
      AND images.openai_omni_moderation_created_at IS NOT NULL
    WHERE pi.post_id = ${postId}
      AND (
        ${isMediaDeliveryEdgeEnforcementEnabled()} = false
        OR EXISTS (
          SELECT 1
          FROM media_delivery_registry_records delivery
          WHERE delivery.delivery_key = concat(
            'image-placement:', placement.id, ':', placement.revision, ':', pi.image_id
          )
            AND delivery.desired_state = 'allow'
            AND delivery.state = 'completed'
        )
      )
    ORDER BY pi.order_index
  `)
  return rows
}

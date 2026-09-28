import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import {
  syncImagePlacementDeniedCountries,
  syncPostImagePlacementDeniedCountries,
} from './delivery-denied-countries.mts'
import { getImagePlacementDeliveryKey } from './delivery-registry-types.mts'

export async function stagePostImagePlacementDeliveryRecords(
  postId: string,
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  await query(sql`/* stagePostImagePlacementDeliveryRecords */
    INSERT INTO media_delivery_registry_records (
      delivery_key, placement_id, placement_revision, image_id, desired_state
    )
    SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
      placement.id, placement.revision, binding.image_id, 'allow'
    FROM image_placements binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    JOIN images image ON image.id = binding.image_id
    WHERE binding.post_id = ${postId} AND placement.retired_at IS NULL
      AND placement.copyright_withheld_at IS NULL AND image.deleted_at IS NULL
      AND image.upload_completed_at IS NOT NULL AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged = FALSE
      AND image.openai_omni_moderation_results IS NOT NULL
      AND image.openai_omni_moderation_created_at IS NOT NULL
    ON CONFLICT (delivery_key) DO UPDATE
    SET desired_state = EXCLUDED.desired_state,
        state = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN 'pending' ELSE media_delivery_registry_records.state END,
        claimed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.claimed_at END,
        completed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.completed_at END,
        projected_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.projected_at END,
        invalidated_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.invalidated_at END,
        delivery_attempt_count = 0, next_attempt_at = NULL, failure_message = NULL
    WHERE media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
  `)
  await syncPostImagePlacementDeniedCountries(query, postId)
}

export async function stageImagePlacementDeliveryRecord(
  input: {
    placementId: string
    revision: number
    imageId: string
    state: MediaDeliveryRegistryState
  },
  options: QueryOptions & { forceGeneration?: boolean } = {},
): Promise<{ deliveryKey: string; generation: string }> {
  const deliveryKey = getImagePlacementDeliveryKey(input)
  const query = options.query ?? write
  const forceGeneration = options.forceGeneration ?? false
  await query(sql`/* stageImagePlacementDeliveryRecord */
    INSERT INTO media_delivery_registry_records (
      delivery_key, placement_id, placement_revision, image_id, desired_state
    ) VALUES (${deliveryKey}, ${input.placementId}, ${input.revision},
      ${input.imageId}, ${input.state})
    ON CONFLICT (delivery_key) DO UPDATE
    SET desired_state = EXCLUDED.desired_state,
      state = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN 'pending' ELSE media_delivery_registry_records.state END,
      claimed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN NULL ELSE media_delivery_registry_records.claimed_at END,
      completed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN NULL ELSE media_delivery_registry_records.completed_at END,
      projected_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN NULL ELSE media_delivery_registry_records.projected_at END,
      invalidated_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN NULL ELSE media_delivery_registry_records.invalidated_at END,
      delivery_attempt_count = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
        OR ${forceGeneration}
        THEN 0 ELSE media_delivery_registry_records.delivery_attempt_count END,
      generation = CASE WHEN ${forceGeneration} THEN media_delivery_registry_records.generation + 1
        ELSE media_delivery_registry_records.generation END,
      next_attempt_at = NULL, failure_message = NULL
    WHERE media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
      OR ${forceGeneration}
    RETURNING generation
  `)
  return syncImagePlacementDeniedCountries(query, deliveryKey)
}

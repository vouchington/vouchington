import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { MediaDeliveryRegistryState } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import {
  getImagePlacementDeliveryKey,
  getLegacyImageDeliveryKey,
} from './delivery-registry-types.mts'

export async function stagePostImagePlacementDeliveryRecords(
  postId: string,
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  await query(sql`/* stagePostImagePlacementDeliveryRecords */
    INSERT INTO media_delivery_registry_records (
      delivery_key, media_kind, route_kind, placement_id, placement_revision, asset_id, desired_state
    )
    SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
      'image', 'placement', placement.id, placement.revision, binding.image_id, 'allow'
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
        next_attempt_at = NULL, failure_message = NULL
  `)
}

export async function stageLegacyImageDeliveryRecord(
  imageId: string,
  state: MediaDeliveryRegistryState,
  options: QueryOptions & { forceGeneration?: boolean } = {},
): Promise<{ deliveryKey: string; generation: string }> {
  const query = options.query ?? write
  const forceGeneration = options.forceGeneration ?? false
  const deliveryKey = getLegacyImageDeliveryKey(imageId)
  const { rows } = await query<{ generation: string }>(sql`/* stageLegacyImageDeliveryRecord */
    INSERT INTO media_delivery_registry_records (delivery_key, media_kind, route_kind, asset_id, desired_state)
    VALUES (${deliveryKey}, 'image', 'legacy-image', ${imageId}, ${state})
    ON CONFLICT (delivery_key) DO UPDATE
    SET desired_state = EXCLUDED.desired_state, state = 'pending', claimed_at = NULL,
      completed_at = NULL, projected_at = NULL, invalidated_at = NULL, next_attempt_at = NULL,
      failure_message = NULL, delivery_attempt_count = 0,
      generation = CASE WHEN ${forceGeneration} THEN media_delivery_registry_records.generation + 1
        ELSE media_delivery_registry_records.generation END
    WHERE media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
      OR ${forceGeneration}
    RETURNING generation
  `)
  if (rows[0]) return { deliveryKey, generation: rows[0].generation }
  const { rows: currentRows } = await query<{ generation: string }>(sql`
    /* stageLegacyImageDeliveryRecord:current */
    SELECT generation FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey}
  `)
  return { deliveryKey, generation: currentRows[0]!.generation }
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
  const { rows } = await query<{ generation: string }>(sql`/* stageImagePlacementDeliveryRecord */
    INSERT INTO media_delivery_registry_records (
      delivery_key, media_kind, route_kind, placement_id, placement_revision, asset_id, desired_state
    ) VALUES (${deliveryKey}, 'image', 'placement', ${input.placementId}, ${input.revision},
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
    RETURNING generation
  `)
  return { deliveryKey, generation: rows[0]!.generation }
}

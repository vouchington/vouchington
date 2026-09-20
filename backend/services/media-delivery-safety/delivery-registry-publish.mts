import { write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  isMediaDeliveryRegistryPublicationEnabled,
  putMediaDeliveryRegistryRecord,
  type MediaDeliveryRegistryState,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import {
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
} from './delivery-registry-staging.mts'
import { getMediaDeliveryPath, type ImageDeliveryRecord } from './delivery-registry-types.mts'
import { runSequentially } from '@modules/utils/run-sequentially'

export async function publishImagePlacementDeliveryRecord(
  input: {
    placementId: string
    revision: number
    imageId: string
    state: MediaDeliveryRegistryState
  },
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  const staged = await stageImagePlacementDeliveryRecord(input, { query })
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  const record: ImageDeliveryRecord = {
    delivery_key: staged.deliveryKey,
    desired_state: input.state,
    route_kind: 'placement',
    placement_id: input.placementId,
    placement_revision: input.revision,
    asset_id: input.imageId,
    generation: staged.generation,
  }
  await runSequentially([
    () =>
      putMediaDeliveryRegistryRecord({
        deliveryKey: staged.deliveryKey,
        state: input.state,
        generation: staged.generation,
      }),
    () => invalidateMediaDeliveryPath(getMediaDeliveryPath(record)),
    () => markPublishedRecord(query, staged.deliveryKey, input.state, staged.generation),
  ])
}

export async function publishLegacyImageDeliveryRecord(
  imageId: string,
  state: MediaDeliveryRegistryState,
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  const staged = await stageLegacyImageDeliveryRecord(imageId, state, { query })
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await runSequentially([
    () =>
      putMediaDeliveryRegistryRecord({
        deliveryKey: staged.deliveryKey,
        state,
        generation: staged.generation,
      }),
    () => invalidateMediaDeliveryPath(`/images/${imageId}`),
    () => markPublishedRecord(query, staged.deliveryKey, state, staged.generation),
  ])
}

export async function prepublishImagePlacementDenials(
  input: { postId?: string; imageId?: string; retainImageIds?: string[] },
  options: QueryOptions & { query?: TransactionQuery } = {},
): Promise<void> {
  const query = options.query ?? write
  if (options.query) {
    await lockImageDeliveryMutation(options.query, {
      postIds: input.postId ? [input.postId] : [],
      imageIds: input.imageId ? [input.imageId] : [],
    })
  }
  const { rows } = await query<{ placement_id: string; revision: number; image_id: string }>(sql`
    /* prepublishImagePlacementDenials */
    SELECT placement.id AS placement_id, placement.revision, binding.image_id
    FROM media_placements placement
    JOIN (
      SELECT placement_id, image_id, post_id FROM image_placements
      UNION ALL SELECT placement_id, image_id, NULL::uuid AS post_id FROM image_surface_placements
    ) binding ON binding.placement_id = placement.id
    WHERE placement.retired_at IS NULL
      AND (${input.postId ?? null}::uuid IS NULL OR binding.post_id = ${input.postId ?? null}::uuid)
      AND (${input.imageId ?? null}::uuid IS NULL OR binding.image_id = ${input.imageId ?? null}::uuid)
      AND NOT (binding.image_id = ANY(${input.retainImageIds ?? []}::uuid[]))
    FOR UPDATE OF placement
  `)
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop -- every prior exact tuple must be denied before retirement.
    await publishImagePlacementDeliveryRecord(
      {
        placementId: row.placement_id,
        revision: row.revision,
        imageId: row.image_id,
        state: 'withheld',
      },
      { query },
    )
  }
}

/** Denies every externally routable form of an image before its safety state becomes unavailable. */
export async function prepublishImageDeliveryDenials(
  imageId: string,
  options: QueryOptions & { query?: TransactionQuery } = {},
): Promise<void> {
  await prepublishImagePlacementDenials({ imageId }, options)
  await publishLegacyImageDeliveryRecord(imageId, 'withheld', options)
}

async function markPublishedRecord(
  query: QueryOptions['query'] extends infer Query ? NonNullable<Query> : never,
  deliveryKey: string,
  state: MediaDeliveryRegistryState,
  generation: number,
): Promise<void> {
  const { rowCount } = await query(sql`/* markPublishedMediaDeliveryRecord */
    UPDATE media_delivery_registry_records
    SET state = 'completed', projected_at = CURRENT_TIMESTAMP, invalidated_at = CURRENT_TIMESTAMP,
      completed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, failure_message = NULL
    WHERE delivery_key = ${deliveryKey} AND desired_state = ${state} AND generation = ${generation}
  `)
  if (rowCount !== 1)
    throw new Error(`Media delivery generation changed while publishing ${deliveryKey}`)
}

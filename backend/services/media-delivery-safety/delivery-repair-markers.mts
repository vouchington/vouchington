import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import {
  isMediaDeliveryRegistryPublicationEnabled,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import {
  getImagePlacementDeliveryKey,
  parseImagePlacementDeliveryKey,
} from './delivery-registry-types.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { imageDeliveryIsAuthorized } from './delivery-authority.mts'

type DeliveryRepairMarker = { delivery_key: string; marker_token: string }

export async function recordImageDeliveryRepairMarker(input: {
  placementId: string
  revision: number
  imageId: string
}): Promise<void> {
  const deliveryKey = getImagePlacementDeliveryKey(input)
  parseImagePlacementDeliveryKey(deliveryKey)
  await write(sql`/* recordImageDeliveryRepairMarker */
    INSERT INTO media_delivery_repair_markers (delivery_key, marker_token)
    VALUES (${deliveryKey}, nextval('media_delivery_registry_generation_sequence'))
    ON CONFLICT (delivery_key) DO UPDATE SET
      marker_token = nextval('media_delivery_registry_generation_sequence'),
      created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `)
}

/** Repairs bounded committed wakeups without trusting a tuple snapshot or registry existence. */
export async function reconcileMediaDeliveryRepairMarkers(
  limit: number,
  deliveryKeys?: readonly string[],
): Promise<number> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return 0
  if (deliveryKeys?.length === 0) return 0
  observeSharedDbScope('reconcileMediaDeliveryRepairMarkers', sharedDbIdsScope(deliveryKeys))
  const keyScope = deliveryKeys ? [...deliveryKeys] : null
  const { rows } = await write<DeliveryRepairMarker>(sql`
    /* reconcileMediaDeliveryRepairMarkers:list */
    SELECT delivery_key, marker_token
    FROM media_delivery_repair_markers
    WHERE (${keyScope}::text[] IS NULL OR delivery_key = ANY(${keyScope}::text[]))
    ORDER BY created_at, delivery_key LIMIT ${limit}
  `)
  for (const marker of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each marker retains one exact authority domain.
    await reconcileDeliveryRepairMarker(marker)
  }
  return rows.length
}

export async function reconcileDeliveryRepairMarker(marker: DeliveryRepairMarker): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  const tuple = parseImagePlacementDeliveryKey(marker.delivery_key)
  await using transaction = await beginTransaction()
  await lockImageDeliveryMutation(transaction, {
    placementIds: [tuple.placementId],
    placementOnly: true,
  })
  const { rows } = await transaction<{ image_id: string; placement_id: string }>(sql`
    /* reconcileDeliveryRepairMarker:binding */
    SELECT binding.image_id, placement.id AS placement_id
    FROM media_placements placement
    JOIN (SELECT placement_id, image_id FROM image_placements
      UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
      ON binding.placement_id = placement.id
    JOIN images image ON image.id = binding.image_id
    WHERE placement.id = ${tuple.placementId}::uuid AND binding.image_id = ${tuple.imageId}::uuid
  `)
  const binding = rows[0]
  if (binding) {
    const allowed = await imageDeliveryIsAuthorized(transaction, {
      placement_id: binding.placement_id,
      placement_revision: tuple.revision,
      image_id: binding.image_id,
    })
    await stageImagePlacementDeliveryRecord(
      { ...tuple, state: allowed ? 'allow' : 'withheld' },
      { query: transaction, forceGeneration: true },
    )
  } else {
    // Never-committed or mismatched identities cannot enter the FK-backed outbox.
    const { rows: generations } = await transaction<{ generation: string }>(sql`
      /* reconcileDeliveryRepairMarker:missingGeneration */
      SELECT nextval('media_delivery_registry_generation_sequence')::text AS generation
    `)
    const generation = generations[0]?.generation
    if (!generation) throw new Error('Unable to allocate a fresh image delivery repair generation')
    await putMediaDeliveryRegistryRecord({
      deliveryKey: marker.delivery_key,
      state: 'withheld',
      generation,
    })
  }
  await transaction(sql`/* reconcileDeliveryRepairMarker:consume */
    DELETE FROM media_delivery_repair_markers
    WHERE delivery_key = ${marker.delivery_key} AND marker_token = ${marker.marker_token}::bigint
  `)
  await transaction.commit()
}

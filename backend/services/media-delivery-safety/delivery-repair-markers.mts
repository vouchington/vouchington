import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { putMediaDeliveryRegistryRecord } from '@modules/aws/media-delivery-registry'
import {
  getImagePlacementDeliveryKey,
  getLegacyImageDeliveryKey,
} from './delivery-registry-types.mts'
import {
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
} from './delivery-registry-staging.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { imageDeliveryIsAuthorized } from './delivery-authority.mts'

type DeliveryRepairMarker = {
  delivery_key: string
  marker_token: string
  route_kind: 'placement' | 'legacy-image'
  placement_id: string | null
  placement_revision: number | null
  asset_id: string
}

export async function recordImageDeliveryRepairMarker(input: {
  placementId: string
  revision: number
  imageId: string
}): Promise<void> {
  const deliveryKey = getImagePlacementDeliveryKey(input)
  await write(sql`/* recordImageDeliveryRepairMarker */
    INSERT INTO media_delivery_repair_markers (delivery_key, marker_token, route_kind, placement_id, placement_revision, asset_id)
    VALUES (${deliveryKey}, nextval('media_delivery_registry_generation_sequence'), 'placement', ${input.placementId}, ${input.revision}, ${input.imageId})
    ON CONFLICT (delivery_key) DO UPDATE SET marker_token = nextval('media_delivery_registry_generation_sequence'), created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `)
}

export async function recordLegacyImageDeliveryRepairMarker(imageId: string): Promise<void> {
  await write(sql`/* recordLegacyImageDeliveryRepairMarker */
    INSERT INTO media_delivery_repair_markers (delivery_key, marker_token, route_kind, asset_id)
    VALUES (${getLegacyImageDeliveryKey(imageId)}, nextval('media_delivery_registry_generation_sequence'), 'legacy-image', ${imageId})
    ON CONFLICT (delivery_key) DO UPDATE SET marker_token = nextval('media_delivery_registry_generation_sequence'), created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `)
}

/** Repairs a bounded set of completed pre-commit denials using only committed tuple authority. */
export async function reconcileMediaDeliveryRepairMarkers(limit: number): Promise<number> {
  const { rows } = await write<DeliveryRepairMarker>(sql`
    /* reconcileMediaDeliveryRepairMarkers:list */
    SELECT delivery_key, marker_token, route_kind, placement_id, placement_revision, asset_id
    FROM media_delivery_repair_markers ORDER BY created_at, delivery_key LIMIT ${limit}
  `)
  for (const marker of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each marker owns one retained authority transaction.
    await reconcileDeliveryRepairMarker(marker)
  }
  return rows.length
}

export async function reconcileDeliveryRepairMarker(marker: DeliveryRepairMarker): Promise<void> {
  await using transaction = await beginTransaction()
  await lockImageDeliveryMutation(transaction, {
    placementIds: marker.placement_id ? [marker.placement_id] : [],
    imageIds: marker.route_kind === 'legacy-image' ? [marker.asset_id] : [],
    placementOnly: marker.placement_id !== null,
  })
  const { rows: tupleRows } = await transaction<{ exists: boolean }>(sql`
      /* reconcileMediaDeliveryRepairMarkers:tuple */
      SELECT EXISTS (SELECT 1 FROM images WHERE id = ${marker.asset_id}::uuid)
        AND (${marker.placement_id}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM media_placements WHERE id = ${marker.placement_id}::uuid
        )) AS exists
    `)
  if (!tupleRows[0]?.exists) {
    // The original denial completed but its owner transaction rolled back before the FK-backed
    // outbox row existed. Re-deny directly; absence remains fail-closed.
    const { rows: generations } = await transaction<{ generation: string }>(sql`
        /* reconcileMediaDeliveryRepairMarkers:missingGeneration */
        SELECT nextval('media_delivery_registry_generation_sequence')::text AS generation
      `)
    const generation = generations[0]?.generation
    if (!generation) throw new Error('Unable to allocate a fresh media delivery repair generation')
    await putMediaDeliveryRegistryRecord({
      deliveryKey: marker.delivery_key,
      state: 'withheld',
      generation,
    })
  } else if (
    marker.route_kind === 'placement' &&
    marker.placement_id &&
    marker.placement_revision !== null
  ) {
    const authorized = await imageDeliveryIsAuthorized(transaction, marker)
    await stageImagePlacementDeliveryRecord(
      {
        placementId: marker.placement_id,
        revision: marker.placement_revision,
        imageId: marker.asset_id,
        state: authorized ? 'allow' : 'withheld',
      },
      { query: transaction, forceGeneration: true },
    )
  } else {
    const authorized = await imageDeliveryIsAuthorized(transaction, marker)
    await stageLegacyImageDeliveryRecord(marker.asset_id, authorized ? 'allow' : 'withheld', {
      query: transaction,
      forceGeneration: true,
    })
  }
  await transaction(sql`/* reconcileMediaDeliveryRepairMarkers:consume */
      DELETE FROM media_delivery_repair_markers WHERE delivery_key = ${marker.delivery_key} AND marker_token = ${marker.marker_token}::bigint
    `)
  await transaction.commit()
}

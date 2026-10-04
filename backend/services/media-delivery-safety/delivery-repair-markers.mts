import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import { getImagePlacementDeliveryKey } from './delivery-registry-types.mts'
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
  await write(sql`/* recordImageDeliveryRepairMarker */
    INSERT INTO media_delivery_repair_markers (delivery_key, marker_token)
    SELECT delivery_key, nextval('media_delivery_registry_generation_sequence')
    FROM media_delivery_registry_current_records WHERE delivery_key = ${deliveryKey}
    ORDER BY delivery_key ASC NULLS LAST
    ON CONFLICT (delivery_key) DO UPDATE SET
      marker_token = nextval('media_delivery_registry_generation_sequence'),
      created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `)
}

/** Repairs bounded wakeups through their committed registry parent. */
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
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    placement_id: string
    placement_revision: number
    image_id: string
  }>(sql`/* reconcileDeliveryRepairMarker:registry */
    SELECT registry.placement_id, registry.placement_revision, registry.image_id
    FROM media_delivery_repair_markers marker
    JOIN media_delivery_registry_records registry USING (delivery_key)
    WHERE marker.delivery_key = ${marker.delivery_key}
      AND marker.marker_token = ${marker.marker_token}::bigint
  `)
  const record = rows[0]
  if (!record) return
  // ast-grep-ignore: no-three-sequential-awaits -- retain the placement fence before legal authority proof and fresh registry staging
  await lockImageDeliveryMutation(transaction, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  const allowed = await imageDeliveryIsAuthorized(transaction, record)
  await stageImagePlacementDeliveryRecord(
    {
      placementId: record.placement_id,
      revision: record.placement_revision,
      imageId: record.image_id,
      state: allowed ? 'allow' : 'withheld',
    },
    { query: transaction, forceGeneration: true },
  )
  await transaction(sql`/* reconcileDeliveryRepairMarker:consume */
    DELETE FROM media_delivery_repair_markers
    WHERE delivery_key = ${marker.delivery_key} AND marker_token = ${marker.marker_token}::bigint
  `)
  await transaction.commit()
}

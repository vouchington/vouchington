import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { imageDeliveryIsAuthorized } from './delivery-authority.mts'

type DeliveryRepairMarker = { media_delivery_registry_record_id: string; marker_token: string }

export async function recordImageDeliveryRepairMarker(input: {
  placementId: string
  revision: number
  imageId: string
}): Promise<void> {
  await write(sql`/* recordImageDeliveryRepairMarker */
    INSERT INTO media_delivery_repair_markers (media_delivery_registry_record_id, marker_token)
    SELECT id, nextval('media_delivery_registry_generation_sequence')
    FROM media_delivery_registry_records
    WHERE placement_id = ${input.placementId}::uuid AND placement_revision = ${input.revision}
      AND image_id = ${input.imageId}::uuid
    ORDER BY id
    ON CONFLICT (media_delivery_registry_record_id) DO UPDATE SET
      marker_token = nextval('media_delivery_registry_generation_sequence'),
      created_at = CURRENT_TIMESTAMP
  `)
}

/** Repairs bounded wakeups through their committed registry parent. */
export async function reconcileMediaDeliveryRepairMarkers(
  limit: number,
  recordIds?: readonly string[],
): Promise<number> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return 0
  if (recordIds?.length === 0) return 0
  observeSharedDbScope('reconcileMediaDeliveryRepairMarkers', sharedDbIdsScope(recordIds))
  const keyScope = recordIds ? [...recordIds] : null
  const { rows } = await write<DeliveryRepairMarker>(sql`
    /* reconcileMediaDeliveryRepairMarkers:list */
    SELECT media_delivery_registry_record_id, marker_token
    FROM media_delivery_repair_markers
    WHERE (${keyScope}::uuid[] IS NULL OR media_delivery_registry_record_id = ANY(${keyScope}::uuid[]))
    ORDER BY created_at, media_delivery_registry_record_id LIMIT ${limit}
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
    JOIN media_delivery_registry_records registry ON registry.id = marker.media_delivery_registry_record_id
    WHERE marker.media_delivery_registry_record_id = ${marker.media_delivery_registry_record_id}
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
    WHERE media_delivery_registry_record_id = ${marker.media_delivery_registry_record_id} AND marker_token = ${marker.marker_token}::bigint
  `)
  await transaction.commit()
}

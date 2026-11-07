import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import { stageImagePlacementDeliveryRecords } from './delivery-registry-staging.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { imageDeliveryAuthorizations, deliveryTupleKey } from './delivery-authority.mts'

type DeliveryRepairMarker = { media_delivery_registry_record_id: string; marker_token: string }

type PlacementTuple = { placementId: string; revision: number; imageId: string }

/** Records every tuple's marker in one statement, outside the caller's transaction. */
export async function recordImageDeliveryRepairMarkers(
  inputs: readonly PlacementTuple[],
): Promise<void> {
  if (inputs.length === 0) return
  await write(sql`/* recordImageDeliveryRepairMarkers */
    INSERT INTO media_delivery_repair_markers (media_delivery_registry_record_id, marker_token)
    SELECT registry.id, nextval('media_delivery_registry_generation_sequence')
    FROM unnest(${inputs.map(input => input.placementId)}::uuid[],
      ${inputs.map(input => input.revision)}::integer[], ${inputs.map(input => input.imageId)}::uuid[])
      requested(placement_id, placement_revision, image_id)
    JOIN media_delivery_registry_records registry
      ON registry.placement_id = requested.placement_id
      AND registry.placement_revision = requested.placement_revision
      AND registry.image_id = requested.image_id
    ORDER BY registry.id
    ON CONFLICT (media_delivery_registry_record_id) DO UPDATE SET
      marker_token = nextval('media_delivery_registry_generation_sequence'),
      created_at = CURRENT_TIMESTAMP
  `)
}

export async function recordImageDeliveryRepairMarker(input: PlacementTuple): Promise<void> {
  await recordImageDeliveryRepairMarkers([input])
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
  await reconcileDeliveryRepairMarkers(rows)
  return rows.length
}

/** Restages every still-current marker in one transaction and consumes exactly those tokens. */
export async function reconcileDeliveryRepairMarkers(
  markers: readonly DeliveryRepairMarker[],
): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled() || markers.length === 0) return
  const recordIds = markers.map(marker => marker.media_delivery_registry_record_id)
  const tokens = markers.map(marker => marker.marker_token)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    placement_id: string
    placement_revision: number
    image_id: string
    media_delivery_registry_record_id: string
  }>(sql`/* reconcileDeliveryRepairMarkers:registry */
    SELECT registry.placement_id, registry.placement_revision, registry.image_id,
      marker.media_delivery_registry_record_id
    FROM unnest(${recordIds}::uuid[], ${tokens}::bigint[]) requested(record_id, marker_token)
    JOIN media_delivery_repair_markers marker
      ON marker.media_delivery_registry_record_id = requested.record_id
      AND marker.marker_token = requested.marker_token
    JOIN media_delivery_registry_records registry ON registry.id = marker.media_delivery_registry_record_id
    ORDER BY registry.placement_id, registry.id
  `)
  if (rows.length === 0) return
  // ast-grep-ignore: no-three-sequential-awaits -- The placement mutation lock must fence the authorization read; its allowed result selects the new registry delivery state before the repair markers are consumed.
  await lockImageDeliveryMutation(transaction, {
    placementIds: rows.map(row => row.placement_id),
    placementOnly: true,
  })
  const allowed = await imageDeliveryAuthorizations(transaction, rows)
  await stageImagePlacementDeliveryRecords(
    rows.map(row => ({
      placementId: row.placement_id,
      revision: row.placement_revision,
      imageId: row.image_id,
      state: allowed.get(deliveryTupleKey(row)) ? 'allow' : 'withheld',
    })),
    { query: transaction, forceGeneration: true },
  )
  await transaction(sql`/* reconcileDeliveryRepairMarkers:consume */
    DELETE FROM media_delivery_repair_markers marker
    USING unnest(${recordIds}::uuid[], ${tokens}::bigint[]) requested(record_id, marker_token)
    WHERE marker.media_delivery_registry_record_id = requested.record_id
      AND marker.marker_token = requested.marker_token
  `)
  await transaction.commit()
}

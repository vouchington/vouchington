import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import type { MediaDeliveryClaim } from './delivery-registry-claims.mts'
import { getMediaDeliveryPath } from './delivery-registry-types.mts'

/** Most records claimed, published and acknowledged together: bounds concurrent edge calls and keeps the batch inside one claim lease. */
export const EDGE_PUBLISH_BATCH_SIZE = 4

/** Publishes up to EDGE_PUBLISH_BATCH_SIZE claimed records at the edge, then writes their completion receipts in one statement. */
export async function publishPersistedDeliveryRecords(
  records: readonly MediaDeliveryClaim[],
  query: QueryExecutor,
): Promise<void> {
  if (records.length === 0) return
  if (records.length > EDGE_PUBLISH_BATCH_SIZE)
    throw new Error(`Edge publication batch exceeds ${EDGE_PUBLISH_BATCH_SIZE} records`)
  const ids = records.map(record => record.media_delivery_registry_record_id)
  const generations = records.map(record => record.generation)
  const leaseTokens = records.map(record => record.lease_token)
  const { rows: owned } = await query(sql`/* ownsMediaDeliveryProjections */
    SELECT 1 FROM media_delivery_registry_projection_work_items work
    JOIN unnest(${ids}::uuid[], ${generations}::bigint[], ${leaseTokens}::uuid[])
      claim(record_id, generation, lease_token)
      ON work.media_delivery_registry_record_id = claim.record_id
      AND work.generation = claim.generation AND work.lease_token = claim.lease_token
    WHERE work.lease_expires_at > clock_timestamp()
    ORDER BY work.media_delivery_registry_record_id
    FOR UPDATE OF work
  `)
  if (owned.length !== records.length)
    throw new Error(`Media delivery generation changed while publishing ${ids.join(',')}`)
  // At most EDGE_PUBLISH_BATCH_SIZE records publish concurrently, so the slowest record bounds the lease.
  await Promise.all(
    records.map(async record => {
      await putMediaDeliveryRegistryRecord({
        deliveryKey: getImagePlacementDeliveryKey({
          placementId: record.placement_id,
          revision: record.placement_revision,
          imageId: record.image_id,
        }),
        state: record.desired_state,
        generation: record.generation,
      })
      await invalidateMediaDeliveryPath(getMediaDeliveryPath(record))
    }),
  )
  const { rowCount } = await query(sql`/* markPublishedMediaDeliveryRecords */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count, projected_at, invalidated_at, completed_at)
    SELECT work.media_delivery_registry_record_id, work.generation, 'completed', work.attempt_count, clock_timestamp(), clock_timestamp(), clock_timestamp()
    FROM unnest(${ids}::uuid[], ${generations}::bigint[], ${leaseTokens}::uuid[], ${records.map(record => record.desired_state)}::media_delivery_desired_states[])
      claim(record_id, generation, lease_token, desired_state)
    JOIN media_delivery_registry_projection_work_items work
      ON work.media_delivery_registry_record_id = claim.record_id
    JOIN media_delivery_registry_records authority ON authority.id = work.media_delivery_registry_record_id
    WHERE authority.desired_state = claim.desired_state
      AND work.generation = claim.generation AND authority.generation = work.generation
      AND work.lease_token = claim.lease_token AND work.lease_expires_at > clock_timestamp()
  `)
  if (rowCount !== records.length)
    throw new Error(`Media delivery generation changed while publishing ${ids.join(',')}`)
}

export async function publishPersistedDeliveryRecord(
  record: MediaDeliveryClaim,
  query: QueryExecutor,
): Promise<void> {
  await publishPersistedDeliveryRecords([record], query)
}

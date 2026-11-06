import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  ownsMediaDeliveryProjection,
  type MediaDeliveryClaim,
} from './delivery-registry-claims.mts'
import { getMediaDeliveryPath } from './delivery-registry-types.mts'

export async function publishPersistedDeliveryRecord(
  record: MediaDeliveryClaim,
  query: QueryExecutor,
): Promise<void> {
  if (!(await ownsMediaDeliveryProjection(query, record)))
    throw new Error(
      `Media delivery generation changed while publishing ${record.media_delivery_registry_record_id}`,
    )
  // ast-grep-ignore: no-three-sequential-awaits -- publish the registry generation at the edge before purging its delivery path; write the completion receipt only after purge succeeds
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
  const { rowCount } = await query(sql`/* markPublishedMediaDeliveryRecord */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count, projected_at, invalidated_at, completed_at)
    SELECT work.media_delivery_registry_record_id, work.generation, 'completed', work.attempt_count, clock_timestamp(), clock_timestamp(), clock_timestamp()
    FROM media_delivery_registry_projection_work_items work
    JOIN media_delivery_registry_records authority ON authority.id = work.media_delivery_registry_record_id
    WHERE work.media_delivery_registry_record_id = ${record.media_delivery_registry_record_id} AND authority.desired_state = ${record.desired_state}
      AND work.generation = ${record.generation} AND authority.generation = work.generation
      AND work.lease_token = ${record.lease_token}::uuid AND work.lease_expires_at > clock_timestamp()
  `)
  if (rowCount !== 1)
    throw new Error(
      `Media delivery generation changed while publishing ${record.media_delivery_registry_record_id}`,
    )
}

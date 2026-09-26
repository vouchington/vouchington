import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import {
  getMediaDeliveryPath,
  type ImageDeliveryRecord,
  type MediaDeliveryDependencies,
} from './delivery-registry-types.mts'

export async function publishPersistedDeliveryRecord(
  record: ImageDeliveryRecord,
  query: QueryExecutor,
  overrides: Partial<MediaDeliveryDependencies> = {},
): Promise<void> {
  const dependencies = { invalidateMediaDeliveryPath, putMediaDeliveryRegistryRecord, ...overrides }
  await dependencies.putMediaDeliveryRegistryRecord({
    deliveryKey: record.delivery_key,
    state: record.desired_state,
    generation: record.generation,
  })
  await dependencies.invalidateMediaDeliveryPath(getMediaDeliveryPath(record))
  const { rowCount } = await query(sql`/* markPublishedMediaDeliveryRecord */
    UPDATE media_delivery_registry_records
    SET state = 'completed', projected_at = CURRENT_TIMESTAMP, invalidated_at = CURRENT_TIMESTAMP,
      completed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, failure_message = NULL
    WHERE delivery_key = ${record.delivery_key} AND desired_state = ${record.desired_state} AND generation = ${record.generation}
  `)
  if (rowCount !== 1)
    throw new Error(`Media delivery generation changed while publishing ${record.delivery_key}`)
}

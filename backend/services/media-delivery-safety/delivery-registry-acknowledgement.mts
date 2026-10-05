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
  // ast-grep-ignore: no-three-sequential-awaits -- invalidate only after edge publication succeeds, then acknowledge only after invalidation succeeds
  await dependencies.putMediaDeliveryRegistryRecord({
    deliveryKey: record.delivery_key,
    state: record.desired_state,
    generation: record.generation,
  })
  await dependencies.invalidateMediaDeliveryPath(getMediaDeliveryPath(record))
  const { rowCount } = await query(sql`/* markPublishedMediaDeliveryRecord */
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type, delivery_attempt_count, projected_at, invalidated_at, completed_at)
    SELECT delivery_key, generation, 'completed', delivery_attempt_count, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM media_delivery_registry_current_records
    WHERE delivery_key = ${record.delivery_key} AND desired_state = ${record.desired_state} AND generation = ${record.generation}
  `)
  if (rowCount !== 1)
    throw new Error(`Media delivery generation changed while publishing ${record.delivery_key}`)
}

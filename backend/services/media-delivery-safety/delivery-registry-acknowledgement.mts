import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import {
  ownsMediaDeliveryProjection,
  type MediaDeliveryClaim,
} from './delivery-registry-claims.mts'
import { getMediaDeliveryPath, type MediaDeliveryDependencies } from './delivery-registry-types.mts'

export async function publishPersistedDeliveryRecord(
  record: MediaDeliveryClaim,
  query: QueryExecutor,
  overrides: Partial<MediaDeliveryDependencies> = {},
): Promise<void> {
  if (!(await ownsMediaDeliveryProjection(query, record)))
    throw new Error(`Media delivery generation changed while publishing ${record.delivery_key}`)
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
    SELECT work.delivery_key, work.generation, 'completed', work.attempt_count, clock_timestamp(), clock_timestamp(), clock_timestamp()
    FROM media_delivery_registry_projection_work_items work
    JOIN media_delivery_registry_records authority USING (delivery_key)
    WHERE work.delivery_key = ${record.delivery_key} AND authority.desired_state = ${record.desired_state}
      AND work.generation = ${record.generation} AND authority.generation = work.generation
      AND work.lease_token = ${record.lease_token}::uuid AND work.lease_expires_at > clock_timestamp()
  `)
  if (rowCount !== 1)
    throw new Error(`Media delivery generation changed while publishing ${record.delivery_key}`)
}

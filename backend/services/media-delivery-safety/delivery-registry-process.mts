import { beginTransaction, write } from '@data-stores/psql'
import {
  invalidateMediaDeliveryPath,
  isMediaDeliveryRegistryPublicationEnabled,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import {
  getMediaDeliveryPath,
  type ImageDeliveryRecord,
  type MediaDeliveryDependencies,
} from './delivery-registry-types.mts'
import { runSequentially } from '@modules/utils/run-sequentially'

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const RETRY_BASE_MS = 60 * 1000

export async function processMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now = new Date(),
  dependencies: Partial<MediaDeliveryDependencies> = {},
): Promise<'completed' | 'not_claimed'> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return 'not_claimed'
  const record = await claimMediaDeliveryRegistryRecord(deliveryKey, now)
  if (!record) return 'not_claimed'
  const deps = { invalidateMediaDeliveryPath, putMediaDeliveryRegistryRecord, ...dependencies }
  try {
    await runSequentially([
      () =>
        deps.putMediaDeliveryRegistryRecord({
          deliveryKey: record.delivery_key,
          state: record.desired_state,
          generation: record.generation,
        }),
      () => markMediaDeliveryRegistryProjected(record.delivery_key, record.generation, now),
      () => deps.invalidateMediaDeliveryPath(getMediaDeliveryPath(record)),
      () => markMediaDeliveryRegistryCompleted(record.delivery_key, record.generation, now),
    ])
    return 'completed'
  } catch (error) {
    await failMediaDeliveryRegistryRecord(
      record.delivery_key,
      record.generation,
      now,
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

async function claimMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now: Date,
): Promise<ImageDeliveryRecord | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ImageDeliveryRecord>(sql`/* claimMediaDeliveryRegistryRecord */
    WITH candidate AS (
      SELECT delivery_key FROM media_delivery_registry_records
      WHERE delivery_key = ${deliveryKey}
        AND ((state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
          OR (state = 'claimed' AND claimed_at <= ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)}))
        AND delivery_attempt_count < ${MAX_ATTEMPTS}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE media_delivery_registry_records record
    SET state = 'claimed', claimed_at = ${now}, next_attempt_at = NULL,
      delivery_attempt_count = record.delivery_attempt_count + 1, failure_message = NULL
    FROM candidate
    WHERE record.delivery_key = candidate.delivery_key
    RETURNING record.delivery_key, record.desired_state, record.route_kind,
      record.placement_id, record.placement_revision, record.asset_id, record.generation
  `)
  await transaction.commit()
  return rows[0] ?? null
}

async function markMediaDeliveryRegistryProjected(
  deliveryKey: string,
  generation: number,
  now: Date,
): Promise<void> {
  await write(sql`/* markMediaDeliveryRegistryProjected */
    UPDATE media_delivery_registry_records SET projected_at = ${now}
    WHERE delivery_key = ${deliveryKey} AND state = 'claimed' AND generation = ${generation}
  `)
}

async function markMediaDeliveryRegistryCompleted(
  deliveryKey: string,
  generation: number,
  now: Date,
): Promise<void> {
  await write(sql`/* markMediaDeliveryRegistryCompleted */
    UPDATE media_delivery_registry_records
    SET state = 'completed', completed_at = ${now}, invalidated_at = ${now}, next_attempt_at = NULL
    WHERE delivery_key = ${deliveryKey} AND state = 'claimed' AND generation = ${generation}
  `)
}

async function failMediaDeliveryRegistryRecord(
  deliveryKey: string,
  generation: number,
  now: Date,
  failureMessage: string,
): Promise<void> {
  await write(sql`/* failMediaDeliveryRegistryRecord */
    UPDATE media_delivery_registry_records
    SET state = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
      claimed_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN claimed_at ELSE NULL END,
      completed_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS}
        THEN ${now} ELSE NULL::timestamptz END,
      next_attempt_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN NULL::timestamptz
        ELSE ${new Date(now.getTime() + RETRY_BASE_MS)} END,
      failure_message = ${failureMessage.slice(0, 4096)}
    WHERE delivery_key = ${deliveryKey} AND state = 'claimed' AND generation = ${generation}
  `)
}

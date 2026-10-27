import { getApInboxActivitiesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbCursorScope, sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import type { RecoverableActivityPubInboxDelivery } from './durable-delivery-transition-contract.mts'

const START_OF_IDS = '00000000-0000-0000-0000-000000000000'
const MAX_RECOVERY_REQUEUES = 5

/** Reserve a bounded replacement attempt after recovery observes a missing or completed job. */
export async function reserveActivityPubInboxRecoveryRequeues(
  deliveryIds: readonly string[],
): Promise<Map<string, number>> {
  if (deliveryIds.length === 0) return new Map()
  observeSharedDbScope('reserveActivityPubInboxRecoveryRequeues', sharedDbIdsScope(deliveryIds))
  const { rows } = await write(sql`/* reserveActivityPubInboxRecoveryRequeues */
    UPDATE activitypub_inbox_envelopes
    SET recovery_requeue_count = recovery_requeue_count + 1
    WHERE id = ANY(${[...deliveryIds]}::uuid[])
      AND failed_at IS NULL
      AND recovery_requeue_count < ${MAX_RECOVERY_REQUEUES}
      AND (retention_expires_at IS NULL OR retention_expires_at > CURRENT_TIMESTAMP)
    RETURNING id, recovery_requeue_count
  `)
  return new Map(
    rows.map(row => {
      const reserved = row as { id: string; recovery_requeue_count: number }
      return [reserved.id, reserved.recovery_requeue_count] as const
    }),
  )
}

/** Mark only still-pending envelopes whose confirmed replacement budget is spent. */
export async function exhaustActivityPubInboxRecoveryRequeues(
  deliveryIds: readonly string[],
): Promise<void> {
  if (deliveryIds.length === 0) return
  observeSharedDbScope('exhaustActivityPubInboxRecoveryRequeues', sharedDbIdsScope(deliveryIds))
  await write(sql`/* exhaustActivityPubInboxRecoveryRequeues */
    UPDATE activitypub_inbox_envelopes
    SET failed_at = CURRENT_TIMESTAMP,
        first_failed_at = COALESCE(first_failed_at, CURRENT_TIMESTAMP),
        retention_expires_at = LEAST(
          retention_expires_at,
          CASE
            WHEN verified_at IS NULL THEN received_at + INTERVAL '1 hour'
            ELSE COALESCE(first_failed_at, CURRENT_TIMESTAMP) + INTERVAL '7 days'
          END
        ),
        last_error = 'ActivityPub inbox recovery requeue budget exhausted'
    WHERE id = ANY(${[...deliveryIds]}::uuid[])
      AND failed_at IS NULL
      AND recovery_requeue_count >= ${MAX_RECOVERY_REQUEUES}
      AND (retention_expires_at IS NULL OR retention_expires_at > CURRENT_TIMESTAMP)
  `)
}

/** Return only reservations for which Valkey did not admit a replacement job. */
export async function releaseUnadmittedActivityPubInboxRecoveryRequeues(
  reservations: ReadonlyArray<{ deliveryId: string; count: number }>,
): Promise<void> {
  if (reservations.length === 0) return
  const ids = reservations.map(reservation => reservation.deliveryId)
  const counts = reservations.map(reservation => reservation.count)
  observeSharedDbScope('releaseUnadmittedActivityPubInboxRecoveryRequeues', sharedDbIdsScope(ids))
  await write(sql`/* releaseUnadmittedActivityPubInboxRecoveryRequeues */
    UPDATE activitypub_inbox_envelopes delivery
    SET recovery_requeue_count = delivery.recovery_requeue_count - 1
    FROM unnest(${ids}::uuid[], ${counts}::integer[]) AS reservation(id, count)
    WHERE delivery.id = reservation.id
      AND delivery.failed_at IS NULL
      AND delivery.recovery_requeue_count = reservation.count
  `)
}

export async function recoverActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
  afterId?: string,
): Promise<RecoverableActivityPubInboxDelivery[]> {
  const pageSize = getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size')
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope(
    'recoverActivityPubInboxDeliveries',
    deliveryIds ? sharedDbIdsScope(deliveryIds) : sharedDbCursorScope(afterId),
  )
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* recoverActivityPubInboxDeliveries */
    SELECT delivery.id, delivery.request_digest
    FROM activitypub_inbox_envelopes delivery
    WHERE delivery.failed_at IS NULL
      AND delivery.id > ${afterId ?? START_OF_IDS}::uuid
      AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
      AND (delivery.retention_expires_at IS NULL OR delivery.retention_expires_at > CURRENT_TIMESTAMP)
    ORDER BY delivery.id
    LIMIT ${pageSize}
  `)
  return mapRecoverableRows(rows)
}

/** Re-arms one page of failed deliveries in id order after `afterId` (none: from the start). */
export async function rearmFailedActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
  afterId?: string,
): Promise<RecoverableActivityPubInboxDelivery[]> {
  const pageSize = getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size')
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope(
    'rearmFailedActivityPubInboxDeliveries',
    deliveryIds ? sharedDbIdsScope(deliveryIds) : sharedDbCursorScope(afterId),
  )
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* rearmFailedActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM activitypub_inbox_envelopes delivery
      WHERE delivery.failed_at IS NOT NULL
        AND delivery.id > ${afterId ?? START_OF_IDS}::uuid
        AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
        AND delivery.retention_expires_at > CURRENT_TIMESTAMP
      ORDER BY delivery.id
      LIMIT ${pageSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE activitypub_inbox_envelopes delivery
    SET failed_at = NULL, last_error = NULL, recovery_requeue_count = 0
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.request_digest
  `)
  return mapRecoverableRows(rows)
}

function mapRecoverableRows(rows: unknown[]): RecoverableActivityPubInboxDelivery[] {
  return rows.map(row => {
    const typed = row as { id: string; request_digest: string }
    return { deliveryId: typed.id, requestDigest: typed.request_digest }
  })
}

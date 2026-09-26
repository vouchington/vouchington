import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import type { RecoverableActivityPubInboxDelivery } from './durable-delivery-transition-contract.mts'

export async function recoverActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
): Promise<RecoverableActivityPubInboxDelivery[]> {
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope('recoverActivityPubInboxDeliveries', sharedDbIdsScope(deliveryIds))
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* recoverActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM ap_inbox_deliveries delivery
      WHERE delivery.failed_at IS NULL
        AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
        AND (delivery.retention_expires_at IS NULL OR delivery.retention_expires_at > CURRENT_TIMESTAMP)
        AND (delivery.deferred_until IS NULL OR delivery.deferred_until <= CURRENT_TIMESTAMP)
        AND (
          (
            delivery.processing_at IS NULL
            AND COALESCE(delivery.enqueued_at, delivery.deferred_until, delivery.received_at)
              < NOW() - INTERVAL '5 minutes'
          )
          OR delivery.processing_at < NOW() - INTERVAL '30 minutes'
        )
      ORDER BY delivery.id
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ap_inbox_deliveries delivery
    SET processing_attempt_id = uuidv7(),
        processing_at = NULL,
        enqueued_at = CURRENT_TIMESTAMP,
        deferred_until = NULL,
        last_error = NULL
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.processing_attempt_id
  `)
  return mapRecoverableRows(rows)
}

export async function rearmFailedActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
): Promise<RecoverableActivityPubInboxDelivery[]> {
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope('rearmFailedActivityPubInboxDeliveries', sharedDbIdsScope(deliveryIds))
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* rearmFailedActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM ap_inbox_deliveries delivery
      WHERE delivery.failed_at IS NOT NULL
        AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
        AND delivery.retention_expires_at > CURRENT_TIMESTAMP
      ORDER BY delivery.id
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ap_inbox_deliveries delivery
    SET processing_attempt_id = uuidv7(),
        processing_at = NULL,
        enqueued_at = CURRENT_TIMESTAMP,
        failed_at = NULL,
        deferred_until = NULL,
        last_error = NULL
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.processing_attempt_id
  `)
  return mapRecoverableRows(rows)
}

function mapRecoverableRows(rows: unknown[]): RecoverableActivityPubInboxDelivery[] {
  return rows.map(row => {
    const typed = row as { id: string; processing_attempt_id: string }
    return { deliveryId: typed.id, processingAttemptId: typed.processing_attempt_id }
  })
}

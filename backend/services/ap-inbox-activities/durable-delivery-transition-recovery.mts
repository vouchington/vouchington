import { getApInboxActivitiesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import type { RecoverableActivityPubInboxDelivery } from './durable-delivery-transition-contract.mts'

export async function recoverActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
): Promise<RecoverableActivityPubInboxDelivery[]> {
  const AP_INBOX_ACTIVITIES_DISPATCH_TIMEOUT_MINUTES = getApInboxActivitiesWorkLimit(
    'dispatch_timeout_minutes',
  )
  const WORK_PAGE_SIZE = getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size')
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope('recoverActivityPubInboxDeliveries', sharedDbIdsScope(deliveryIds))
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* recoverActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM activitypub_inbox_delivery_work_items delivery
      WHERE delivery.failed_at IS NULL
        AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
        AND (delivery.retention_expires_at IS NULL OR delivery.retention_expires_at > CURRENT_TIMESTAMP)
        AND (delivery.available_at IS NULL OR delivery.available_at <= CURRENT_TIMESTAMP)
        AND (
          (
            delivery.leased_at IS NULL
            AND COALESCE(delivery.dispatched_at, delivery.available_at, delivery.received_at)
              < NOW() - ${AP_INBOX_ACTIVITIES_DISPATCH_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
          )
          OR delivery.lease_expires_at <= clock_timestamp()
        )
      ORDER BY delivery.id
      LIMIT ${WORK_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE activitypub_inbox_delivery_work_items delivery
    SET lease_token = uuidv7(),
        leased_at = NULL, lease_expires_at = NULL,
        dispatched_at = CURRENT_TIMESTAMP,
        available_at = NULL,
        last_error = NULL
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.lease_token
  `)
  return mapRecoverableRows(rows)
}

export async function rearmFailedActivityPubInboxDeliveries(
  deliveryIds?: readonly string[],
): Promise<RecoverableActivityPubInboxDelivery[]> {
  const WORK_PAGE_SIZE = getApInboxActivitiesWorkLimit('delivery_transition_recovery_batch_size')
  if (deliveryIds?.length === 0) return []
  observeSharedDbScope('rearmFailedActivityPubInboxDeliveries', sharedDbIdsScope(deliveryIds))
  const idScope = deliveryIds ? [...deliveryIds] : null
  const { rows } = await write(sql`/* rearmFailedActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM activitypub_inbox_delivery_work_items delivery
      WHERE delivery.failed_at IS NOT NULL
        AND (${idScope}::uuid[] IS NULL OR delivery.id = ANY(${idScope}::uuid[]))
        AND delivery.retention_expires_at > CURRENT_TIMESTAMP
      ORDER BY delivery.id
      LIMIT ${WORK_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE activitypub_inbox_delivery_work_items delivery
    SET lease_token = uuidv7(),
        leased_at = NULL, lease_expires_at = NULL,
        dispatched_at = CURRENT_TIMESTAMP,
        failed_at = NULL,
        available_at = NULL,
        last_error = NULL
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.lease_token
  `)
  return mapRecoverableRows(rows)
}

function mapRecoverableRows(rows: unknown[]): RecoverableActivityPubInboxDelivery[] {
  return rows.map(row => {
    const typed = row as { id: string; lease_token: string }
    return { deliveryId: typed.id, leaseToken: typed.lease_token }
  })
}

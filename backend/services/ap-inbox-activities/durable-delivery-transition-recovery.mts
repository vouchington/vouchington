import { getApInboxActivitiesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbCursorScope, sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import type { RecoverableActivityPubInboxDelivery } from './durable-delivery-transition-contract.mts'

const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

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
    SET failed_at = NULL, last_error = NULL
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

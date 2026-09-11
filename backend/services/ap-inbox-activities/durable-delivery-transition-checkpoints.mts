import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ActivityPubInboxTransitionResult,
  RecoverableActivityPubInboxDelivery,
} from './durable-delivery-transition-contract.mts'

export async function verifyActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
  remoteActorId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* verifyActivityPubInboxDelivery */
    UPDATE ap_inbox_deliveries
    SET verified_at = CURRENT_TIMESTAMP,
        remote_actor_id = ${remoteActorId},
        retention_expires_at = CASE
          WHEN first_failed_at IS NULL THEN NULL
          ELSE retention_expires_at
        END
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND verified_at IS NULL
      AND remote_actor_id IS NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function admitActivityPubInboxDeliverySender(
  deliveryId: string,
  processingAttemptId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* admitActivityPubInboxDeliverySender */
    UPDATE ap_inbox_deliveries
    SET sender_allowed_at = CURRENT_TIMESTAMP
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND sender_allowed_at IS NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function deferActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
  deferredUntil: Date,
): Promise<ActivityPubInboxTransitionResult<RecoverableActivityPubInboxDelivery>> {
  const { rows } = await write(sql`/* deferActivityPubInboxDelivery */
    UPDATE ap_inbox_deliveries
    SET processing_attempt_id = uuidv7(),
        processing_at = NULL,
        enqueued_at = NULL,
        deferred_until = ${deferredUntil},
        last_error = 'Sender hostname rate limited'
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND sender_allowed_at IS NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
    RETURNING id, processing_attempt_id
  `)
  const row = rows[0] as { id: string; processing_attempt_id: string } | undefined
  return row
    ? {
        outcome: 'applied',
        value: { deliveryId: row.id, processingAttemptId: row.processing_attempt_id },
      }
    : { outcome: 'stale' }
}

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}

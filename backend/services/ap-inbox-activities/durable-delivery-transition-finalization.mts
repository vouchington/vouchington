import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ActivityPubInboxTransitionResult } from './durable-delivery-transition-contract.mts'

export async function releaseActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
  error: unknown,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* releaseActivityPubInboxDelivery */
    UPDATE ap_inbox_deliveries
    SET processing_at = NULL,
        last_error = ${boundedErrorMessage(error)}
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function exhaustActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
  error: unknown,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* exhaustActivityPubInboxDelivery */
    UPDATE ap_inbox_deliveries
    SET failed_at = CURRENT_TIMESTAMP,
        first_failed_at = COALESCE(first_failed_at, CURRENT_TIMESTAMP),
        retention_expires_at = LEAST(
          retention_expires_at,
          CASE
            WHEN verified_at IS NULL THEN received_at + INTERVAL '1 hour'
            ELSE COALESCE(first_failed_at, CURRENT_TIMESTAMP) + INTERVAL '7 days'
          END
        ),
        last_error = ${boundedErrorMessage(error)}
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function rejectActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* rejectActivityPubInboxDelivery */
    DELETE FROM ap_inbox_deliveries
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NOT NULL
      AND deferred_until IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function completeActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
  options: QueryOptions = {},
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(
    sql`/* completeActivityPubInboxDelivery */
      DELETE FROM ap_inbox_deliveries
      WHERE id = ${deliveryId}
        AND processing_attempt_id = ${processingAttemptId}
        AND processing_at IS NOT NULL
        AND verified_at IS NOT NULL
        AND remote_actor_id IS NOT NULL
        AND sender_allowed_at IS NOT NULL
        AND deferred_until IS NULL
        AND failed_at IS NULL
    `,
    options,
  )
  return mutationResult(result.rowCount)
}

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}

function boundedErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000)
}

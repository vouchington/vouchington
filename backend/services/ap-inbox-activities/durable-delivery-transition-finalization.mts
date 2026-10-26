import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ActivityPubInboxTransitionResult } from './durable-delivery-transition-contract.mts'

export async function exhaustActivityPubInboxDelivery(
  deliveryId: string,
  error: unknown,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* exhaustActivityPubInboxDelivery */
    UPDATE activitypub_inbox_delivery_work_items
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
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function rejectActivityPubInboxDelivery(
  deliveryId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* rejectActivityPubInboxDelivery */
    DELETE FROM activitypub_inbox_delivery_work_items
    WHERE id = ${deliveryId}
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function completeActivityPubInboxDelivery(
  deliveryId: string,
  options: QueryOptions = {},
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(
    sql`/* completeActivityPubInboxDelivery */
      DELETE FROM activitypub_inbox_delivery_work_items
      WHERE id = ${deliveryId}
        AND verified_at IS NOT NULL
        AND remote_actor_id IS NOT NULL
        AND sender_allowed_at IS NOT NULL
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

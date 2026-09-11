import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { StripeEventRecord, StripeEventRow } from './events-types.mts'

export { markStripeEventCompleted, markStripeEventFailed } from './event-lifecycle.mts'
export {
  getStripeEventById,
  markStripeEventProcessing,
  restartFailedStripeEventAttempt,
} from './event-processing.mts'
export { ingestStripeEvent } from './ingest.mts'
export { insertStripeEvent } from './insert-event.mts'

export async function getStripeEventByStripeEventId(
  stripeEventId: string,
): Promise<StripeEventRecord | null> {
  const { rows } = await read(sql`/* getStripeEventByStripeEventId */
    SELECT
      id,
      stripe_event_id,
      event_type,
      livemode,
      api_version,
      stripe_created_at,
      customer_id,
      subscription_id,
      invoice_id,
      checkout_session_id,
      received_at,
      processing_attempt_id,
      dispatched_at,
      processing_started_at,
      processing_attempts,
      processed_at,
      ignored_at,
      failed_at,
      last_error_at,
      last_error_message,
      payload,
      created_at
    FROM stripe_events
    WHERE stripe_event_id = ${stripeEventId}
    LIMIT 1
  `)

  if (rows.length === 0) return null
  return hydrateStripeEventRecord(rows[0] as StripeEventRow)
}

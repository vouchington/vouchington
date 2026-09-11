import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { StripeEventRecord, StripeEventRow } from './events-types.mts'

export async function getStripeEventById(id: string): Promise<StripeEventRecord | null> {
  const { rows } = await read(sql`/* getStripeEventById */
    SELECT
      id, stripe_event_id, event_type, livemode, api_version, stripe_created_at,
      customer_id, subscription_id, invoice_id, checkout_session_id, received_at,
      processing_attempt_id, dispatched_at, processing_started_at, processing_attempts,
      processed_at, ignored_at, failed_at, last_error_at, last_error_message, payload, created_at
    FROM stripe_events
    WHERE id = ${id}
  `)
  return rows[0] ? hydrateStripeEventRecord(rows[0] as StripeEventRow) : null
}

export async function restartFailedStripeEventAttempt(id: string): Promise<string | null> {
  const { rows } = await write(sql`/* restartFailedStripeEventAttempt */
    UPDATE stripe_events
    SET processing_attempt_id = uuidv7(),
        dispatched_at = CURRENT_TIMESTAMP,
        processing_started_at = NULL,
        failed_at = NULL
    WHERE id = ${id}
      AND processed_at IS NULL
      AND ignored_at IS NULL
      AND failed_at IS NOT NULL
    RETURNING processing_attempt_id
  `)
  return (rows[0] as { processing_attempt_id: string } | undefined)?.processing_attempt_id ?? null
}

export async function markStripeEventProcessing(
  id: string,
  processingAttemptId?: string,
): Promise<StripeEventRecord | null> {
  const query = sql`/* markStripeEventProcessing */
    UPDATE stripe_events
    SET processing_started_at = CURRENT_TIMESTAMP,
      processing_attempts = processing_attempts + 1,
      failed_at = NULL,
      last_error_at = NULL,
      last_error_message = NULL
    WHERE `
  if (processingAttemptId) {
    query.append(sql`id = ${id} AND processing_attempt_id = ${processingAttemptId}`)
  } else {
    query.append(sql`stripe_event_id = ${id}`)
  }
  query.append(sql` AND processed_at IS NULL
      AND ignored_at IS NULL
      AND failed_at IS NULL
      AND (processing_started_at IS NULL OR last_error_at IS NOT NULL)
    RETURNING
      id, stripe_event_id, event_type, livemode, api_version, stripe_created_at,
      customer_id, subscription_id, invoice_id, checkout_session_id, received_at,
      processing_attempt_id, dispatched_at, processing_started_at, processing_attempts,
      processed_at, ignored_at, failed_at, last_error_at, last_error_message, payload, created_at
  `)
  const { rows } = await write(query)
  return rows[0] ? hydrateStripeEventRecord(rows[0] as StripeEventRow) : null
}

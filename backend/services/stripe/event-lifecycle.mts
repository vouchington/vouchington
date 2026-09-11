import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markStripeEventCompleted(
  idOrStripeEventId: string,
  status: 'processed' | 'ignored',
  processingAttemptId?: string,
): Promise<void> {
  const query = sql`/* markStripeEventCompleted */
    UPDATE stripe_events
    SET processed_at = CASE WHEN ${status} = 'processed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      ignored_at = CASE WHEN ${status} = 'ignored' THEN CURRENT_TIMESTAMP ELSE NULL END,
      failed_at = NULL,
      last_error_at = NULL,
      last_error_message = NULL
    WHERE `
  if (processingAttemptId) {
    query.append(sql`id = ${idOrStripeEventId} AND processing_attempt_id = ${processingAttemptId}`)
  } else {
    query.append(sql`stripe_event_id = ${idOrStripeEventId}`)
  }
  await write(query)
}

export async function markStripeEventFailed(
  idOrStripeEventId: string,
  errorMessage: string,
  processingAttemptId?: string,
  terminal = true,
): Promise<void> {
  const query = sql`/* markStripeEventFailed */
    UPDATE stripe_events
    SET failed_at = CASE WHEN ${terminal} THEN CURRENT_TIMESTAMP ELSE NULL END,
      processing_started_at = NULL,
      last_error_at = CURRENT_TIMESTAMP,
      last_error_message = ${errorMessage.slice(0, 2000).trim()}
    WHERE `
  if (processingAttemptId) {
    query.append(sql`id = ${idOrStripeEventId} AND processing_attempt_id = ${processingAttemptId}`)
  } else {
    query.append(sql`stripe_event_id = ${idOrStripeEventId}`)
  }
  query.append(sql` AND processed_at IS NULL
      AND ignored_at IS NULL
  `)
  await write(query)
}

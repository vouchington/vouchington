import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hydrateStripeEventRecord } from './event-record.mts'
import { stripeEventColumns } from './event-columns.mts'
import { getStripeWorkLimit } from './work-limits.mts'
import type { StripeEventRecord, StripeEventRow } from './events-types.mts'

export async function getStripeEventById(id: string): Promise<StripeEventRecord | null> {
  const { rows } = await read(
    sql`/* getStripeEventById */ SELECT `.append(stripeEventColumns()).append(sql`
    FROM stripe_events event
    JOIN stripe_event_processing_work_items work ON work.stripe_event_id = event.id
    WHERE event.id = ${id}
  `),
  )
  return rows[0] ? hydrateStripeEventRecord(rows[0] as StripeEventRow) : null
}

export async function restartFailedStripeEventAttempt(id: string): Promise<string | null> {
  const { rows } = await write(sql`/* restartFailedStripeEventAttempt */
    UPDATE stripe_event_processing_work_items
    SET lease_token = uuidv7(), dispatched_at = clock_timestamp(),
        leased_at = NULL, lease_expires_at = NULL, failed_at = NULL
    WHERE stripe_event_id = ${id} AND processed_at IS NULL AND ignored_at IS NULL
      AND failed_at IS NOT NULL
    RETURNING lease_token
  `)
  return (rows[0] as { lease_token: string } | undefined)?.lease_token ?? null
}

export async function markStripeEventProcessing(
  id: string,
  leaseToken: string,
): Promise<StripeEventRecord | null> {
  const duration = getStripeWorkLimit('processing_timeout_minutes')
  const { rows } = await write(
    sql`/* markStripeEventProcessing */
    WITH acquired AS (
      UPDATE stripe_event_processing_work_items
      SET leased_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + ${duration}::integer * INTERVAL '1 minute',
          attempt_count = attempt_count + 1, last_error_at = NULL, last_error_message = NULL
      WHERE stripe_event_id = ${id} AND lease_token = ${leaseToken}
        AND available_at <= clock_timestamp() AND processed_at IS NULL AND ignored_at IS NULL
        AND failed_at IS NULL AND leased_at IS NULL
      RETURNING stripe_event_id, lease_token, dispatched_at, leased_at, lease_expires_at,
        attempt_count, available_at, processed_at, ignored_at, failed_at, last_error_at, last_error_message
    ) SELECT `.append(stripeEventColumns()).append(sql`
      FROM stripe_events event JOIN acquired work ON work.stripe_event_id = event.id
    `),
  )
  return rows[0] ? hydrateStripeEventRecord(rows[0] as StripeEventRow) : null
}

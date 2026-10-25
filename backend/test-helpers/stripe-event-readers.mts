import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { stripeEventColumns } from '../services/stripe/event-columns.mts'
import { hydrateStripeEventRecord } from '../services/stripe/event-record.mts'
import type { StripeEventRecord, StripeEventRow } from '../services/stripe/events-types.mts'

export async function getTestStripeEventByStripeEventId(
  stripeEventId: string,
): Promise<StripeEventRecord | null> {
  const { rows } = await read(
    sql`/* getStripeEventByStripeEventId */
    SELECT
  `.append(stripeEventColumns()).append(sql`
    FROM stripe_events event
    LEFT JOIN stripe_event_processing_work_items work ON work.stripe_event_id = event.id
    JOIN stripe_event_types event_type ON event_type.id = event.stripe_event_type_id
    WHERE event.stripe_event_id = ${stripeEventId}
    LIMIT 1
  `),
  )

  if (rows.length === 0) return null
  return hydrateStripeEventRecord(rows[0] as StripeEventRow)
}

import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { stripeEventColumns } from './event-columns.mts'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { StripeEventRecord, StripeEventRow } from './events-types.mts'

export { markStripeEventCompleted, markStripeEventFailed } from './event-lifecycle.mts'
export { getStripeEventById, markStripeEventProcessing } from './event-processing.mts'
export { ingestStripeEvent } from './ingest.mts'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/stripe/README.md`.
 */
export async function getStripeEventByStripeEventId(
  stripeEventId: string,
): Promise<StripeEventRecord | null> {
  const { rows } = await read(
    sql`/* getStripeEventByStripeEventId */
    SELECT
  `.append(stripeEventColumns()).append(sql`
    FROM stripe_events event
    JOIN stripe_event_processing_work_items work ON work.stripe_event_id = event.id
    WHERE event.stripe_event_id = ${stripeEventId}
    LIMIT 1
  `),
  )

  if (rows.length === 0) return null
  return hydrateStripeEventRecord(rows[0] as StripeEventRow)
}

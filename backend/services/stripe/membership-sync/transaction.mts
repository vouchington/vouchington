import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getStripeEventReceivedAt(
  stripeEventId: string,
  query: QueryExecutor,
): Promise<Date> {
  const { rows } = await query(sql`/* getStripeEventReceivedAt */
    SELECT received_at FROM stripe_events WHERE stripe_event_id = ${stripeEventId}
  `)
  const event = rows[0] as { received_at: Date } | undefined
  if (!event) throw new Error(`Stripe event ${stripeEventId} was not ingested`)
  return event.received_at
}

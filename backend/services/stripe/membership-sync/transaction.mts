import type { QueryExecutor } from '@data-stores/psql'
import type Stripe from 'stripe'
import sql from 'sql-template-strings'

export async function getStripeEventReceivedAt(
  stripeEventId: string,
  query: QueryExecutor,
): Promise<Date> {
  const { rows } = await query(sql`/* getStripeEventReceivedAt */
    SELECT received_at FROM stripe_events WHERE stripe_event_id = ${stripeEventId} FOR KEY SHARE
  `)
  const event = rows[0] as { received_at: Date } | undefined
  if (!event) throw new Error(`Stripe event ${stripeEventId} was not ingested`)
  return event.received_at
}

export function getStripeSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer
  if (typeof customer === 'string') return customer
  return customer && typeof customer === 'object' && 'id' in customer ? customer.id : null
}

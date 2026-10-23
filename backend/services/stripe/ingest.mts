import type Stripe from 'stripe'
import { beginTransaction } from '@data-stores/psql'
import { enqueueProcessStripeEvent } from '@queues/memberships/enqueues'
import { insertStripeEvent } from './insert-event.mts'
import { restartFailedStripeEventAttempt } from './event-processing.mts'
import type { InsertStripeEventResult } from './events-types.mts'

// Called by the stripe-events-sqs consumer (backend/workers/stripe-events-sqs/processors.mts),
// which unwraps an EventBridge partner-source delivery into a Stripe.Event and lands it
// here — the one piece of business logic that owns insert-the-event-ledger-row, then
// enqueue processing only for a row that actually needs it.
export async function ingestStripeEvent(
  event: Stripe.Event,
): Promise<InsertStripeEventResult | undefined> {
  await using query = await beginTransaction()
  // Terminal processing retains the provider id. The daily expiry sweep takes this same lock
  // before removing the raw ledger row, so replay never starts a second financial action.
  await query(
    `/* lockStripeEventIngress */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`stripe-event:${event.id}`],
  )
  const { rows: retained } = await query<{ stripe_event_id: string }>(
    `/* getRetainedStripeEventIdentity */ SELECT stripe_event_id
     FROM stripe_event_retained_identities WHERE stripe_event_id = $1`,
    [event.id],
  )
  if (retained.length > 0) {
    await query.commit()
    return undefined
  }
  const storedEvent = await insertStripeEvent(event, new Date(), query)
  await query.commit()
  if (storedEvent.is_new || storedEvent.status === 'received' || storedEvent.status === 'failed') {
    const leaseToken =
      storedEvent.status === 'failed'
        ? await restartFailedStripeEventAttempt(storedEvent.id)
        : storedEvent.lease_token
    if (leaseToken) {
      await enqueueProcessStripeEvent({
        stripeEventRecordId: storedEvent.id,
        leaseToken,
        stripeSubscriptionId: storedEvent.subscription_id,
        isLiveMode: storedEvent.is_live_mode,
      })
    }
  }
  return storedEvent
}

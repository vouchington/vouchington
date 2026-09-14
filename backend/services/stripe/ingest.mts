import type Stripe from 'stripe'
import { enqueueProcessStripeEvent } from '@queues/memberships/enqueues'
import { insertStripeEvent } from './insert-event.mts'
import { restartFailedStripeEventAttempt } from './event-processing.mts'
import type { InsertStripeEventResult } from './events-types.mts'

// Called by the stripe-events-sqs consumer (backend/workers/stripe-events-sqs/processors.mts),
// which unwraps an EventBridge partner-source delivery into a Stripe.Event and lands it
// here — the one piece of business logic that owns insert-the-event-ledger-row, then
// enqueue processing only for a row that actually needs it.
export async function ingestStripeEvent(event: Stripe.Event): Promise<InsertStripeEventResult> {
  const storedEvent = await insertStripeEvent(event)
  if (storedEvent.is_new || storedEvent.status === 'received' || storedEvent.status === 'failed') {
    const processingAttemptId =
      storedEvent.status === 'failed'
        ? await restartFailedStripeEventAttempt(storedEvent.id)
        : storedEvent.processing_attempt_id
    if (processingAttemptId) {
      await enqueueProcessStripeEvent({
        stripeEventRecordId: storedEvent.id,
        processingAttemptId,
        stripeSubscriptionId: storedEvent.subscription_id,
        livemode: storedEvent.livemode,
      })
    }
  }
  return storedEvent
}
